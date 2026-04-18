import Principal "mo:core/Principal";
import Map "mo:core/Map";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Char "mo:core/Char";
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Iter "mo:core/Iter";

persistent actor Users {

    public type User = {
        principal : Principal;
        fullName : Text;
        registeredAt : Time.Time;
    };

    public type ListUsersArgs = {
        offset : Nat;
        limit : Nat;
        search : ?Text;
    };

    public type ListUsersResult = {
        users : [User];
        total : Nat;
    };

    // `Map` from mo:core is stable-compatible, so no pre/postupgrade hooks
    // are needed when used inside a `persistent actor`.
    var users : Map.Map<Principal, User> = Map.empty();

    /// Returns the user record for the caller, if registered.
    public shared query ({ caller }) func me() : async ?User {
        Map.get(users, Principal.compare, caller);
    };

    /// Registers the caller with the given full name.
    /// Anonymous principals are rejected.
    public shared ({ caller }) func register(fullName : Text) : async {
        #ok : User;
        #err : Text;
    } {
        if (Principal.isAnonymous(caller)) {
            return #err("Anonymous principals cannot register");
        };

        let trimmed = Text.trim(fullName, #char ' ');
        if (Text.size(trimmed) == 0) {
            return #err("Full name cannot be empty");
        };

        switch (Map.get(users, Principal.compare, caller)) {
            case (?existing) { #ok(existing) };
            case null {
                let user : User = {
                    principal = caller;
                    fullName = trimmed;
                    registeredAt = Time.now();
                };
                Map.add(users, Principal.compare, caller, user);
                #ok(user);
            };
        };
    };

    public query func getUser(p : Principal) : async ?User {
        Map.get(users, Principal.compare, p);
    };

    public query func totalUsers() : async Nat {
        Map.size(users);
    };

    /// ASCII-only lowercasing (sufficient for user-entered name search).
    func toLowerAscii(t : Text) : Text {
        Text.map(
            t,
            func(c : Char) : Char {
                let n = Char.toNat32(c);
                if (n >= 65 and n <= 90) { Char.fromNat32(n + 32) } else { c };
            },
        );
    };

    public query func listUsers(args : ListUsersArgs) : async ListUsersResult {
        let all = Iter.toArray(Map.values(users));
        let needle : ?Text = switch (args.search) {
            case null { null };
            case (?s) {
                let t = Text.trim(s, #char ' ');
                if (Text.size(t) == 0) { null } else { ?toLowerAscii(t) };
            };
        };
        let matches = switch (needle) {
            case null { all };
            case (?q) {
                Array.filter<User>(
                    all,
                    func(u : User) : Bool {
                        Text.contains(toLowerAscii(u.fullName), #text q);
                    },
                );
            };
        };
        let sorted = Array.sort<User>(
            matches,
            func(a : User, b : User) {
                Text.compare(toLowerAscii(a.fullName), toLowerAscii(b.fullName));
            },
        );
        let total = sorted.size();
        let start = Nat.min(args.offset, total);
        let endExclusive = Nat.min(start + args.limit, total);
        let page = Array.sliceToArray<User>(sorted, start, endExclusive);
        { users = page; total };
    };
};
