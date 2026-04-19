import Principal "mo:core/Principal";
import Map "mo:core/Map";
import List "mo:core/List";
import Text "mo:core/Text";
import Time "mo:core/Time";

persistent actor Messages {

    public type Message = {
        id : Nat;
        sender : Principal;
        content : Text;
        timestamp : Time.Time;
    };

    public type PageArgs = {
        offset : Nat;
        limit : Nat;
    };

    public type MessagePage = {
        messages : [Message];
        total : Nat;
    };

    public type PostResult = { #ok : Message; #err : Text };

    /// Minimal view of the users canister we depend on, declared inline so
    /// this canister compiles without a build-time `canister:users` import.
    type UserRecord = {
        principal : Principal;
        fullName : Text;
        registeredAt : Int;
    };
    type UsersService = actor {
        getUser : query (Principal) -> async ?UserRecord;
    };

    // Hard upper-bound per message body to avoid oversized inter-canister traffic.
    let MAX_CONTENT_BYTES : Nat = 4096;
    let MAX_PAGE_LIMIT : Nat = 200;

    var nextId : Nat = 0;
    var usersCanister : ?Principal = null;
    var admin : ?Principal = null;

    // Append-only log of general-channel messages.
    var generalMessages : List.List<Message> = List.empty();

    // Private conversations keyed by sorted principal pair "a|b".
    var conversations : Map.Map<Text, List.List<Message>> = Map.empty();

    // Per-user peer index: user -> (peer -> lastMessageId). Updated on
    // every postPrivate so clients can cheaply fetch their own conversation
    // summaries (used for unread indicators).
    var userPeers : Map.Map<Principal, Map.Map<Principal, Nat>> = Map.empty();

    func conversationKey(a : Principal, b : Principal) : Text {
        let at = Principal.toText(a);
        let bt = Principal.toText(b);
        switch (Text.compare(at, bt)) {
            case (#less) { at # "|" # bt };
            case _ { bt # "|" # at };
        };
    };

    func recordPeer(owner : Principal, peer : Principal, messageId : Nat) {
        let inner : Map.Map<Principal, Nat> = switch (
            Map.get(userPeers, Principal.compare, owner)
        ) {
            case (?m) { m };
            case null {
                let m = Map.empty<Principal, Nat>();
                Map.add(userPeers, Principal.compare, owner, m);
                m;
            };
        };
        Map.add(inner, Principal.compare, peer, messageId);
    };

    func clampLimit(n : Nat) : Nat {
        if (n > MAX_PAGE_LIMIT) { MAX_PAGE_LIMIT } else { n };
    };

    func validateContent(content : Text) : { #ok : Text; #err : Text } {
        let trimmed = Text.trim(content, #char ' ');
        if (Text.size(trimmed) == 0) {
            return #err("Message cannot be empty");
        };
        if (Text.size(trimmed) > MAX_CONTENT_BYTES) {
            return #err("Message is too long");
        };
        #ok(trimmed);
    };

    /// First caller to touch an admin endpoint becomes the admin.
    /// Subsequent admin-only calls must come from that same principal.
    func assertAdmin(caller : Principal) : { #ok; #err : Text } {
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

    /// Configure the users canister principal. Must be called once post-deploy
    /// (e.g. `dfx canister call messages setUsersCanister '(principal "<id>")'`).
    public shared ({ caller }) func setUsersCanister(p : Principal) : async {
        #ok;
        #err : Text;
    } {
        switch (assertAdmin(caller)) {
            case (#err(e)) { #err(e) };
            case (#ok) {
                usersCanister := ?p;
                #ok;
            };
        };
    };

    public query func getUsersCanister() : async ?Principal {
        usersCanister;
    };

    /// Verifies the given principal is a registered user by calling the
    /// configured users canister. Falls through (returns #ok) if the users
    /// canister has not been configured yet, so the app remains usable in
    /// single-canister dev scenarios.
    func assertRegistered(p : Principal) : async { #ok; #err : Text } {
        switch (usersCanister) {
            case null { #ok };
            case (?canisterId) {
                let users : UsersService = actor (Principal.toText(canisterId));
                switch (await users.getUser(p)) {
                    case null { #err("Caller is not a registered user") };
                    case (?_) { #ok };
                };
            };
        };
    };

    /// Returns newest-last page: messages are ordered oldest-to-newest within
    /// the returned slice, so clients can render them directly.
    /// offset=0 returns the most recent `limit` messages.
    func paginate(list : List.List<Message>, args : PageArgs) : MessagePage {
        let total = List.size(list);
        let limit = clampLimit(args.limit);
        if (limit == 0 or total == 0) {
            return { messages = []; total };
        };
        let endExclusive : Nat = if (args.offset >= total) {
            0;
        } else {
            total - args.offset;
        };
        let startInclusive : Nat = if (endExclusive <= limit) {
            0;
        } else {
            endExclusive - limit;
        };
        let page = List.sliceToArray<Message>(list, startInclusive, endExclusive);
        { messages = page; total };
    };

    public shared ({ caller }) func postGeneral(content : Text) : async PostResult {
        if (Principal.isAnonymous(caller)) {
            return #err("Not authenticated");
        };
        switch (await assertRegistered(caller)) {
            case (#err(e)) { return #err(e) };
            case (#ok) {};
        };
        switch (validateContent(content)) {
            case (#err(e)) { #err(e) };
            case (#ok(text)) {
                let msg : Message = {
                    id = nextId;
                    sender = caller;
                    content = text;
                    timestamp = Time.now();
                };
                nextId += 1;
                List.add(generalMessages, msg);
                #ok(msg);
            };
        };
    };

    public query func getGeneral(args : PageArgs) : async MessagePage {
        paginate(generalMessages, args);
    };

    public shared ({ caller }) func postPrivate(recipient : Principal, content : Text) : async PostResult {
        if (Principal.isAnonymous(caller)) {
            return #err("Not authenticated");
        };
        if (Principal.equal(caller, recipient)) {
            return #err("Cannot send a private message to yourself");
        };
        switch (await assertRegistered(caller)) {
            case (#err(e)) { return #err(e) };
            case (#ok) {};
        };
        switch (await assertRegistered(recipient)) {
            case (#err(_)) {
                return #err("Recipient is not a registered user");
            };
            case (#ok) {};
        };
        switch (validateContent(content)) {
            case (#err(e)) { #err(e) };
            case (#ok(text)) {
                let msg : Message = {
                    id = nextId;
                    sender = caller;
                    content = text;
                    timestamp = Time.now();
                };
                nextId += 1;
                let key = conversationKey(caller, recipient);
                let conv : List.List<Message> = switch (
                    Map.get(conversations, Text.compare, key)
                ) {
                    case (?c) { c };
                    case null {
                        let c = List.empty<Message>();
                        Map.add(conversations, Text.compare, key, c);
                        c;
                    };
                };
                List.add(conv, msg);
                recordPeer(caller, recipient, msg.id);
                recordPeer(recipient, caller, msg.id);
                #ok(msg);
            };
        };
    };

    public shared query ({ caller }) func getPrivate(peer : Principal, args : PageArgs) : async MessagePage {
        if (Principal.isAnonymous(caller) or Principal.equal(caller, peer)) {
            return { messages = []; total = 0 };
        };
        let key = conversationKey(caller, peer);
        switch (Map.get(conversations, Text.compare, key)) {
            case null { { messages = []; total = 0 } };
            case (?conv) { paginate(conv, args) };
        };
    };

    public type ConversationSummary = {
        peer : Principal;
        lastMessageId : Nat;
    };

    public shared query ({ caller }) func listMyConversations() : async [ConversationSummary] {
        if (Principal.isAnonymous(caller)) { return [] };
        switch (Map.get(userPeers, Principal.compare, caller)) {
            case null { [] };
            case (?inner) {
                let out = List.empty<ConversationSummary>();
                for ((peer, lastMessageId) in Map.entries(inner)) {
                    List.add(out, { peer; lastMessageId });
                };
                List.toArray(out);
            };
        };
    };

    public query func getGeneralLatestId() : async ?Nat {
        switch (List.last(generalMessages)) {
            case null { null };
            case (?m) { ?m.id };
        };
    };
};
