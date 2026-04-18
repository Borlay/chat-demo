import Principal "mo:core/Principal";

// Management canister - responsible for deploying and managing other canisters
// (backend message canister and frontend asset canister).
persistent actor Management {

    public query func healthcheck() : async Text {
        "Management canister is running";
    };

    public shared ({ caller }) func whoami() : async Principal {
        caller;
    };
};
