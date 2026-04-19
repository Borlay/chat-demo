import Principal "mo:core/Principal";
import Map "mo:core/Map";
import List "mo:core/List";
import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Array "mo:core/Array";
import Error "mo:core/Error";
import Nat64 "mo:core/Nat64";
import Cycles "mo:core/Cycles";

/// Management canister: deploys and upgrades the other canisters in this
/// project (users, messages, frontend asset canister).
///
/// Lifecycle:
///   1. The first caller to touch any admin endpoint becomes the admin.
///      This is intended to be the CI principal (dfx identity used in the
///      deploy workflow).
///   2. The deploy script chunk-uploads each child wasm with `uploadWasmChunk`.
///   3. The deploy script calls `installCanister(name, initArg, controllers)`
///      which create_canisters (first time) or upgrades (subsequent) the
///      child and clears the staged wasm buffer.
persistent actor Management {

    type Result<T> = { #ok : T; #err : Text };
    type Unit = { #ok; #err : Text };

    type CanisterId = Principal;

    type CanisterSettings = {
        controllers : ?[Principal];
        compute_allocation : ?Nat;
        memory_allocation : ?Nat;
        freezing_threshold : ?Nat;
    };

    /// Upgrade-time options. `wasm_memory_persistence = ?#keep` is required
    /// by the IC whenever the target canister uses Enhanced Orthogonal
    /// Persistence (Motoko `persistent actor`), which all of our children do.
    type UpgradeArgs = {
        skip_pre_upgrade : ?Bool;
        wasm_memory_persistence : ?{ #keep; #replace };
    };

    type InstallMode = {
        #install;
        #reinstall;
        #upgrade : ?UpgradeArgs;
    };

    /// Subset of the IC management canister interface we need.
    /// `transient` because this is a compile-time actor reference, not state
    /// that needs to survive upgrades — keeping it transient also lets us
    /// evolve the interface without tripping the stable-compatibility check.
    transient let IC : actor {
        create_canister : ({ settings : ?CanisterSettings }) -> async {
            canister_id : Principal;
        };
        install_code : ({
            mode : InstallMode;
            canister_id : Principal;
            wasm_module : Blob;
            arg : Blob;
        }) -> async ();
        update_settings : ({
            canister_id : Principal;
            settings : CanisterSettings;
        }) -> async ();
        canister_status : ({ canister_id : Principal }) -> async {
            module_hash : ?Blob;
        };
    } = actor ("aaaaa-aa");

    var admin : ?Principal = null;
    var canisters : Map.Map<Text, CanisterId> = Map.empty();

    // Wasm modules being assembled, one per child canister name.
    // Cleared after a successful installCanister call.
    var wasmChunks : Map.Map<Text, List.List<Blob>> = Map.empty();

    func assertAdmin(caller : Principal) : Unit {
        if (Principal.isAnonymous(caller)) {
            return #err("Anonymous principals cannot perform admin actions");
        };
        switch (admin) {
            case null { admin := ?caller; #ok };
            case (?a) {
                if (Principal.equal(a, caller)) { #ok } else {
                    #err("Not authorized");
                };
            };
        };
    };

    public query func getAdmin() : async ?Principal { admin };

    public query func getCanisterId(name : Text) : async ?CanisterId {
        Map.get(canisters, Text.compare, name);
    };

    public query func listCanisters() : async [(Text, CanisterId)] {
        var out = List.empty<(Text, CanisterId)>();
        for (entry in Map.entries(canisters)) {
            List.add(out, entry);
        };
        List.toArray(out);
    };

    public query func wasmInfo(name : Text) : async ?{
        chunks : Nat;
        size : Nat;
    } {
        switch (Map.get(wasmChunks, Text.compare, name)) {
            case null { null };
            case (?chunks) {
                var total : Nat = 0;
                for (chunk in List.values(chunks)) {
                    total += Blob.size(chunk);
                };
                ?{ chunks = List.size(chunks); size = total };
            };
        };
    };

    public shared ({ caller }) func clearWasm(name : Text) : async Unit {
        switch (assertAdmin(caller)) {
            case (#err(e)) { #err(e) };
            case (#ok) {
                ignore Map.remove(wasmChunks, Text.compare, name);
                #ok;
            };
        };
    };

    /// Append a chunk to the wasm being assembled for `name`.
    /// Chunks must be uploaded sequentially.
    public shared ({ caller }) func uploadWasmChunk(name : Text, chunk : Blob) : async Unit {
        switch (assertAdmin(caller)) {
            case (#err(e)) { return #err(e) };
            case (#ok) {};
        };
        let buffer : List.List<Blob> = switch (
            Map.get(wasmChunks, Text.compare, name)
        ) {
            case (?b) { b };
            case null {
                let b = List.empty<Blob>();
                Map.add(wasmChunks, Text.compare, name, b);
                b;
            };
        };
        List.add(buffer, chunk);
        #ok;
    };

    func assembleWasm(name : Text) : ?Blob {
        switch (Map.get(wasmChunks, Text.compare, name)) {
            case null { null };
            case (?chunks) {
                var pieces = List.empty<[Nat8]>();
                for (c in List.values(chunks)) {
                    List.add(pieces, Blob.toArray(c));
                };
                ?Blob.fromArray(Array.flatten<Nat8>(List.toArray(pieces)));
            };
        };
    };

    /// Cycles attached to canister creation. 0.5T is the IC creation fee on a
    /// 13-node subnet, so we pass 1.5T to leave ~1T as operating balance on
    /// each child canister. Top up management with `dfx canister
    /// deposit-cycles ...` if this balance is ever exhausted.
    let CREATE_CYCLES : Nat = 1_500_000_000_000; // 1.5T cycles per canister.

    /// Creates the child canister if it does not exist, then installs the
    /// staged wasm. On subsequent calls, performs an upgrade install instead.
    /// `additionalControllers` is added on top of [self] so dfx / CI identity
    /// can later interact with the canister directly (e.g. asset sync).
    public shared ({ caller }) func installCanister(
        name : Text,
        initArg : Blob,
        additionalControllers : [Principal],
    ) : async Result<CanisterId> {
        switch (assertAdmin(caller)) {
            case (#err(e)) { return #err(e) };
            case (#ok) {};
        };

        let wasm = switch (assembleWasm(name)) {
            case null { return #err("No wasm uploaded for " # name) };
            case (?w) { w };
        };

        let self = Principal.fromActor(Management);
        let controllers : [Principal] = appendPrincipal(additionalControllers, self);

        let existing = Map.get(canisters, Text.compare, name);

        let canisterId : Principal = switch (existing) {
            case (?id) { id };
            case null {
                try {
                    let res = await (with cycles = CREATE_CYCLES) IC.create_canister({
                        settings = ?{
                            controllers = ?controllers;
                            compute_allocation = null;
                            memory_allocation = null;
                            freezing_threshold = null;
                        };
                    });
                    Map.add(canisters, Text.compare, name, res.canister_id);
                    res.canister_id;
                } catch (e) {
                    return #err("create_canister failed: " # Error.message(e));
                };
            };
        };

        // Make sure controllers are up to date even on upgrade paths.
        try {
            await IC.update_settings({
                canister_id = canisterId;
                settings = {
                    controllers = ?controllers;
                    compute_allocation = null;
                    memory_allocation = null;
                    freezing_threshold = null;
                };
            });
        } catch (e) {
            return #err("update_settings failed: " # Error.message(e));
        };

        let mode : InstallMode = switch (existing) {
            case null { #install };
            case (?_) {
                // Management's map remembers a canister id from a previous
                // run, but a prior install_code attempt may have failed
                // before any wasm was actually installed. Ask the IC for the
                // real state instead of trusting our map.
                let hasCode = try {
                    let status = await IC.canister_status({
                        canister_id = canisterId;
                    });
                    status.module_hash != null;
                } catch (e) {
                    return #err("canister_status failed: " # Error.message(e));
                };

                if (hasCode) {
                    #upgrade(
                        ?{
                            skip_pre_upgrade = null;
                            wasm_memory_persistence = ?(#keep);
                        }
                    );
                } else {
                    #install;
                };
            };
        };

        try {
            await IC.install_code({
                mode;
                canister_id = canisterId;
                wasm_module = wasm;
                arg = initArg;
            });
        } catch (e) {
            return #err("install_code failed: " # Error.message(e));
        };

        // Free staged wasm to reclaim memory.
        ignore Map.remove(wasmChunks, Text.compare, name);

        #ok(canisterId);
    };

    func appendPrincipal(arr : [Principal], extra : Principal) : [Principal] {
        let n = arr.size();
        Array.tabulate<Principal>(
            n + 1,
            func(i) {
                if (i < n) { arr[i] } else { extra };
            },
        );
    };

    /// Accept incoming cycles so the workflow can top up management with
    /// `dfx canister deposit-cycles ...` if needed.
    public shared func wallet_receive() : async { accepted : Nat64 } {
        let avail = Cycles.available();
        let accepted = Cycles.accept<system>(avail);
        { accepted = Nat64.fromNat(accepted) };
    };

    public query func cyclesBalance() : async Nat { Cycles.balance() };
};
