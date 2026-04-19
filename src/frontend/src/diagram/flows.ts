// Data model for the interactive architecture diagram.
//
// The diagram is an accurate map of what this frontend + the Motoko canisters
// actually do. Every node / edge here is grounded in real code: UI triggers in
// the React components, flows in the hooks / pages, endpoints in the Motoko
// actors (`src/messages/main.mo`, `src/users/main.mo`), and data structures
// declared as `var ... : Map / List` in those actors.
//
// Kept as pure data so the view layer can stay focused on layout + UX.

export type NodeKind =
    | "group"
    | "ui"
    | "timer"
    | "flow"
    | "endpoint"
    | "data"
    | "external";

export type ComplexitySeverity = "constant" | "log" | "linear" | "nlogn" | "heavy";

export interface DiagramNode {
    id: string;
    kind: NodeKind;
    parentId?: string;
    title: string;
    subtitle?: string;
    /** Per-call complexity label, e.g. "O(log N)". */
    complexity?: string;
    /** Overall / full-pagination complexity when different from per-call. */
    overallComplexity?: string;
    complexitySeverity?: ComplexitySeverity;
    /** Bulleted details shown when the node is expanded. */
    details?: string[];
    /** Source references ("file.ts:42" style) shown in the inspector. */
    source?: string[];
    /** x/y override; otherwise auto-laid by column/row. */
    position?: { x: number; y: number };
    width?: number;
    height?: number;
    /** Flow ids this node participates in, for highlighting. */
    flows?: string[];
}

export type EdgeKind = "trigger" | "call" | "response" | "data" | "chain" | "read" | "write";

export interface DiagramEdge {
    id: string;
    source: string;
    target: string;
    kind: EdgeKind;
    label?: string;
    /** What gets sent across this edge (request payload or write payload). */
    payload?: string;
    /** What comes back (response type) — only for call/response edges. */
    response?: string;
    /** Per-operation complexity for data edges. */
    complexity?: string;
    flow?: string;
    animated?: boolean;
}

export interface Flow {
    id: string;
    title: string;
    summary: string;
    trigger: string;
    complexity: string;
    overallComplexity?: string;
    complexitySeverity: ComplexitySeverity;
    /** Ordered, human-readable steps with per-step notes. */
    steps: string[];
    /** Things worth calling out for scaling / memory. */
    scalingNotes: string[];
    source: string[];
}

// ---------------------------------------------------------------------------
// Flows — the central concept. Each flow has its own node in the diagram and
// connects UI triggers to canister endpoints.
// ---------------------------------------------------------------------------

export const FLOWS: Flow[] = [
    {
        id: "bootstrap",
        title: "App bootstrap / session restore",
        summary:
            "On first render, AuthProvider creates an AuthClient and, if a session delegation exists in IndexedDB, immediately calls users.me() to resolve the registered user.",
        trigger: "React mount of <App />",
        complexity: "O(log N)",
        complexitySeverity: "log",
        steps: [
            "AuthClient.create({ idleOptions: { disableIdle: true } }) — reads II delegation from IndexedDB.",
            "If authenticated: build HttpAgent + Actor.createActor(usersIdl) (one-time cost).",
            "On mainnet skip fetchRootKey(); locally call it once per actor.",
            "users.me() query → Map.get(users, Principal.compare, caller) → O(log N) where N = total registered users.",
            "status transitions: loading → anonymous | authenticated-unregistered | authenticated-registered.",
        ],
        scalingNotes: [
            "Only one query on boot; no pagination, no loops.",
            "Actor factories are memoized per identity via useActors, so re-renders don't re-create agents.",
        ],
        source: ["src/frontend/src/AuthContext.tsx", "src/frontend/src/hooks/useActors.ts"],
    },
    {
        id: "login",
        title: "Login (Internet Identity)",
        summary:
            "Clicking 'Sign in with Internet Identity' opens the II delegation popup; on success we rebuild the users actor with the signed identity and refresh the user record.",
        trigger: "Click 'Sign in with Internet Identity' (LoginPage)",
        complexity: "O(log N)",
        complexitySeverity: "log",
        steps: [
            "authClient.login({ identityProvider, maxTimeToLive: 7d in ns }).",
            "II issues a delegation chain; AuthClient persists it in IndexedDB.",
            "createUsersActor(identity) — new HttpAgent bound to the signed identity.",
            "users.me() query → Map.get O(log N) to decide registered vs unregistered.",
        ],
        scalingNotes: [
            "Login itself is a browser redirect flow; no canister storage growth.",
            "Delegation TTL = 7 days; user is re-prompted after expiry.",
        ],
        source: ["src/frontend/src/AuthContext.tsx", "src/frontend/src/pages/LoginPage.tsx"],
    },
    {
        id: "register",
        title: "Register new user",
        summary:
            "Submitting the full-name form calls users.register(name) which trims, validates, and inserts into the users Map keyed by Principal.",
        trigger: "Submit <form> on RegisterPage",
        complexity: "O(log N)",
        complexitySeverity: "log",
        steps: [
            "Frontend: basic trim / required check (treated as UX only).",
            "users.register(fullName) update call.",
            "Backend: reject Principal.isAnonymous(caller).",
            "Backend: Text.trim + size check — empty names rejected.",
            "Backend: Map.get O(log N) for idempotency; if already registered, return existing record.",
            "Backend: Map.add(users, Principal.compare, caller, User) — O(log N) ordered-map insert.",
            "Returns { #ok: User; #err: Text }.",
        ],
        scalingNotes: [
            "Users map is the sole source of truth; Principal is the partition-equivalent key.",
            "No rate-limiting today — could be abused to create many Principals; consider an allow-list / proof-of-humanity upstream if this matters.",
        ],
        source: ["src/users/main.mo", "src/frontend/src/pages/RegisterPage.tsx"],
    },
    {
        id: "chat-mount",
        title: "ChatPage mount (build actors)",
        summary:
            "Once a user is authenticated-registered, ChatPage calls useActors which creates the users + messages actors in parallel.",
        trigger: "Render <ChatPage /> (status = authenticated-registered)",
        complexity: "O(1)",
        complexitySeverity: "constant",
        steps: [
            "Promise.all([createUsersActor(identity), createMessagesActor(identity)]).",
            "Result cached in state, keyed by identity ref to avoid re-creation across re-renders.",
            "selection defaults to { kind: 'general' }.",
            "useUnreadTracker boots and reads localStorage for persisted last-seen ids (scoped per principal).",
        ],
        scalingNotes: [
            "Actors are lightweight; no canister traffic on mount beyond what the unread poll / initial message fetch does.",
        ],
        source: ["src/frontend/src/pages/ChatPage.tsx", "src/frontend/src/hooks/useActors.ts"],
    },
    {
        id: "select-conversation",
        title: "Select channel / DM",
        summary:
            "Clicking #general, the diagram tab, or a user in the sidebar updates `selection` which resets ChatView and fetches the most recent page.",
        trigger: "Click channel / user in Sidebar",
        complexity: "O(L) where L = page size (50)",
        complexitySeverity: "linear",
        steps: [
            "setSelection({ kind, peer?, peerName? }).",
            "ChatView effect: requestIdRef++ (cancel in-flight), reset messages/total/error.",
            "fetchPage(0) → messages.getGeneral({ offset: 0, limit: 50 }) or messages.getPrivate(peer, …).",
            "Backend paginate(): List.size O(1) + List.sliceToArray(start, end) O(L).",
            "unread.markSelectionRead(selection) — writes latest id into localStorage.",
        ],
        scalingNotes: [
            "Only the active conversation is fetched; switching away cancels pending loads via requestIdRef.",
            "Page size is a constant (50); cost per switch is bounded regardless of conversation length.",
        ],
        source: ["src/frontend/src/chat/ChatView.tsx", "src/frontend/src/hooks/useUnreadTracker.ts"],
    },
    {
        id: "send-general",
        title: "Send message → #general",
        summary:
            "Composer submit calls messages.postGeneral(content); backend authorises, validates, appends to the general log and echoes the new Message.",
        trigger: "Submit composer (Enter or Send) while selection=general",
        complexity: "O(log M) for inter-canister user check + O(1) append",
        complexitySeverity: "log",
        steps: [
            "Guard: sending flag + empty-draft check (UX only).",
            "messages.postGeneral(content) update call.",
            "Backend: reject anonymous.",
            "Backend: assertRegistered(caller) — inter-canister query to users.getUser → Map.get O(log M).",
            "Backend: validateContent — trim + size ≤ MAX_CONTENT_BYTES (4096).",
            "Backend: allocate id = nextId; nextId += 1 (monotonic, global).",
            "Backend: List.add(generalMessages, msg) — amortised O(1) append to the singleton List.",
            "Frontend optimistic-merge: append returned message to local state if not already present.",
        ],
        scalingNotes: [
            "Inter-canister call adds one extra round-trip per post; can be cached in the messages canister for perf if needed.",
            "generalMessages grows unbounded — List nodes remain in stable memory. At very large scale, archive/shard by time bucket.",
        ],
        source: ["src/messages/main.mo", "src/frontend/src/chat/ChatView.tsx"],
    },
    {
        id: "send-private",
        title: "Send message → DM",
        summary:
            "Composer submit in a private selection calls messages.postPrivate(peer, content) which also updates the per-user peer index so both sides can see unread hints.",
        trigger: "Submit composer while selection=private",
        complexity: "O(log M) (x2 registration checks) + O(log C) + 2× O(log P)",
        complexitySeverity: "log",
        steps: [
            "messages.postPrivate(peer, content) update call.",
            "Backend: reject anonymous, reject self-message.",
            "Backend: assertRegistered(caller) — users.getUser O(log M).",
            "Backend: assertRegistered(recipient) — users.getUser O(log M).",
            "Backend: validateContent (trim + 4096-byte cap).",
            "Backend: conversationKey(a,b) — two Principal.toText + one Text.compare to produce stable 'min|max' key.",
            "Backend: Map.get(conversations, key) O(log C); on miss, Map.add (creates empty List).",
            "Backend: List.add(conv, msg) O(1) amortised. id = nextId++.",
            "Backend: recordPeer(caller, recipient, id) and recordPeer(recipient, caller, id) — two nested Map.add O(log P) each.",
        ],
        scalingNotes: [
            "userPeers is Map<Principal, Map<Principal, Nat>> — one inner map per user; size grows with number of distinct peers that user has ever DMed.",
            "Two inter-canister calls per send; can be dropped to one by trusting a short-TTL cached user set in messages.",
            "conversations key is textual — cheap to compare but 2×principal text per lookup.",
        ],
        source: ["src/messages/main.mo", "src/frontend/src/chat/ChatView.tsx"],
    },
    {
        id: "load-older",
        title: "Load older messages (pagination backward)",
        summary:
            "Clicking 'Load older messages' fetches the next older page at offset=messages.length; scroll position is preserved by recomputing scrollTop after prepend.",
        trigger: "Click 'Load older messages' button",
        complexity: "O(L) per click, L = 50",
        overallComplexity: "O(T) across all clicks for a conversation of T messages",
        complexitySeverity: "linear",
        steps: [
            "fetchPage(messages.length) → getGeneral / getPrivate with { offset, limit: 50 }.",
            "Backend paginate(): list size O(1), endExclusive = total - offset, start = end - limit; List.sliceToArray O(L).",
            "Frontend: deduplicate by id (Set), prepend older batch.",
            "requestAnimationFrame: scrollTop = (newScrollHeight - prevScrollHeight) to stay anchored.",
        ],
        scalingNotes: [
            "Each click is bounded O(L); walking the entire history from the top still totals O(T).",
            "List slicing on `mo:core/List` is O(L) even deep into history — no index rebuild required.",
            "No cursor token today; if the tail grows between clicks, messages can shift by up to 1 per post — acceptable for chat.",
        ],
        source: ["src/messages/main.mo", "src/frontend/src/chat/ChatView.tsx"],
    },
    {
        id: "chat-poll",
        title: "Chat polling (3 s interval)",
        summary:
            "While a conversation is open, ChatView polls the latest page every 3 s and merges any new messages by id.",
        trigger: "setInterval(3000) inside ChatView",
        complexity: "O(L) per tick, L = 50",
        overallComplexity: "O(L) × ticks — polling is the dominant steady-state cost",
        complexitySeverity: "linear",
        steps: [
            "Every 3000 ms while the page is mounted and selection unchanged.",
            "fetchPage(0) → getGeneral or getPrivate, limit=50.",
            "Set total; mergeNewest: build Set<id> from current messages, filter returned for unseen, append, sort by id.",
            "Auto-scroll only if the user is already near the bottom (shouldAutoScrollRef).",
        ],
        scalingNotes: [
            "No server-push today; polling cost is ~1 query call every 3 s per open tab.",
            "Consider WebSocket / certified variable / canister HTTP streaming for large user counts to avoid O(users × 1/3s) traffic.",
            "Merge is O(L) with a Set<string> keyed by id.toString().",
        ],
        source: ["src/frontend/src/chat/ChatView.tsx"],
    },
    {
        id: "resolve-names",
        title: "Resolve sender names for new messages",
        summary:
            "Whenever the messages array changes, unknown sender principals are resolved via users.getUser one by one and cached in-memory.",
        trigger: "useEffect on [messages, nameCache, …] in ChatView",
        complexity: "O(U · log M) per batch",
        overallComplexity: "Bounded by distinct senders in the loaded window",
        complexitySeverity: "log",
        steps: [
            "Derive unknown = unique sender principals not in nameCache.",
            "Seed cache with self + current peer (already known).",
            "for each unknown principal: await users.getUser(p) → Map.get O(log M).",
            "Fall back to shortPrincipal(text) if the user is unknown.",
            "setNameCache — sticky across re-renders (merges with prev).",
        ],
        scalingNotes: [
            "Sequential awaits — could be parallelised with Promise.all for faster first render, at the cost of a burst of query calls.",
            "nameCache is per-tab and not invalidated; renames (not supported today) wouldn't propagate.",
        ],
        source: ["src/frontend/src/chat/ChatView.tsx"],
    },
    {
        id: "search-users",
        title: "Search users (debounced)",
        summary:
            "Typing in the sidebar search debounces for 250 ms then issues users.listUsers with the search text; backend copies the whole users map to an array, filters by substring, sorts by name, paginates.",
        trigger: "onChange on search input (debounced 250 ms)",
        complexity: "O(N · |q|) filter + O(N log N) sort per request",
        overallComplexity: "Paginating all results: O(P · N log N) — one full sort per page",
        complexitySeverity: "nlogn",
        steps: [
            "setTimeout(250) → setDebouncedSearch(trimmed).",
            "useActors-scoped users.listUsers({ offset: 0, limit: 20, search }).",
            "Backend: Iter.toArray(Map.values(users)) — O(N) materialisation.",
            "Backend: normalise needle (trim + ASCII lowercase).",
            "Backend: Array.filter by Text.contains(toLowerAscii(name), #text q) — O(N · |q|).",
            "Backend: Array.sort by Text.compare(toLowerAscii) — O(N log N), recomputed every call.",
            "Backend: slice [offset, offset+limit) → ListUsersResult.",
            "Frontend: dedupe by principal into state list; infinite-scroll-ready.",
        ],
        scalingNotes: [
            "No persistent sorted index — each request re-sorts the whole set. Fine for a few thousand users; becomes a hot-spot past that.",
            "ASCII-only lowercasing; non-ASCII names are case-sensitive in search.",
            "Pagination is offset-based — adding users during paging can shift results (acceptable for this UX).",
            "Consider caching (sorted array + last-update counter) in the canister, or a separate ordered index by fullName.",
        ],
        source: ["src/users/main.mo", "src/frontend/src/chat/UserList.tsx"],
    },
    {
        id: "load-more-users",
        title: "Load more users (forward pagination)",
        summary:
            "Clicking 'Load more' in the sidebar increments the offset by 20 and fetches the next page with the same debounced query.",
        trigger: "Click 'Load more' in UserList",
        complexity: "O(N log N) per click (server-side cost)",
        overallComplexity: "O(P · N log N) to walk all pages",
        complexitySeverity: "nlogn",
        steps: [
            "offset += 20.",
            "users.listUsers({ offset, limit: 20, search }).",
            "Backend: same filter+sort+slice pipeline as search-users — every click pays the full N log N sort cost.",
            "Frontend: dedupe into state, filter out self by principal.",
        ],
        scalingNotes: [
            "Same caveat as search-users: full re-sort every page. Switch to a cached sorted snapshot for scale.",
        ],
        source: ["src/users/main.mo", "src/frontend/src/chat/UserList.tsx"],
    },
    {
        id: "unread-poll",
        title: "Unread-indicator polling (4 s interval)",
        summary:
            "useUnreadTracker polls two queries in parallel every 4 s to compute unread dots for #general and each DM, comparing against per-principal last-seen ids stored in localStorage.",
        trigger: "setInterval(4000) inside useUnreadTracker",
        complexity: "O(1) for general + O(K) for peers, K = peers the user has ever DMed",
        overallComplexity: "O(K) per tick — grows linearly with the user's DM breadth",
        complexitySeverity: "linear",
        steps: [
            "Promise.all([getGeneralLatestId(), listMyConversations()]).",
            "getGeneralLatestId: List.last(generalMessages) — O(1).",
            "listMyConversations: Map.get(userPeers, caller) then iterate its inner Map — O(K).",
            "Store general latest id and a Record<peerText, bigint> of peer latest ids.",
            "Compare against lastSeen (loaded from localStorage keyed by selfPrincipal).",
            "First time a latest id is observed with no persisted seen value, treat as already read to avoid spamming dots on fresh login.",
            "Automatically mark the currently-active selection as read on change.",
        ],
        scalingNotes: [
            "Two queries per tick are cheap, but frequency × online users = canister read rate; consider certified variables + observer pattern for scale.",
            "localStorage scoped per principal avoids cross-identity leakage on shared browsers.",
            "listMyConversations returns ALL peers of the caller; pagination would be needed for users with thousands of DMs.",
        ],
        source: ["src/frontend/src/hooks/useUnreadTracker.ts", "src/messages/main.mo"],
    },
    {
        id: "auto-mark-read",
        title: "Auto mark-as-read on selection change",
        summary:
            "Whenever selection changes or new messages arrive for the active conversation, the tracker writes the latest observed id into localStorage.",
        trigger: "useEffect([activeSelection, generalLatest, peerLatest]) in useUnreadTracker",
        complexity: "O(1)",
        complexitySeverity: "constant",
        steps: [
            "If selection=general: updateLastSeen('__general__', generalLatest).",
            "If selection=private: updateLastSeen(peerText, peerLatest[peerText]).",
            "setLastSeen + JSON.stringify + localStorage.setItem under storageKey(principal).",
        ],
        scalingNotes: [
            "Pure client-side; no canister traffic.",
            "Quiet-fails on storage quota — unread indicators degrade to session-only.",
        ],
        source: ["src/frontend/src/hooks/useUnreadTracker.ts"],
    },
    {
        id: "logout",
        title: "Logout",
        summary:
            "Clicking 'Sign out' clears the II delegation and resets auth state to anonymous.",
        trigger: "Click 'Sign out' in Sidebar",
        complexity: "O(1)",
        complexitySeverity: "constant",
        steps: [
            "authClient.logout() — removes delegation from IndexedDB.",
            "Clear identity, user; setStatus('anonymous').",
            "useActors effect clears actors; useUnreadTracker stops polling on next effect cycle.",
        ],
        scalingNotes: ["No canister traffic."],
        source: ["src/frontend/src/AuthContext.tsx"],
    },
];

// ---------------------------------------------------------------------------
// UI triggers (buttons, form submits, page mounts).
// ---------------------------------------------------------------------------

interface UiTrigger {
    id: string;
    title: string;
    subtitle: string;
    source: string;
    flows: string[];
}

export const UI_TRIGGERS: UiTrigger[] = [
    {
        id: "ui-app-mount",
        title: "<App /> mount",
        subtitle: "First render — AuthProvider boots",
        source: "src/frontend/src/App.tsx",
        flows: ["bootstrap"],
    },
    {
        id: "ui-login-click",
        title: "Click: Sign in with II",
        subtitle: "LoginPage primary button",
        source: "src/frontend/src/pages/LoginPage.tsx",
        flows: ["login"],
    },
    {
        id: "ui-register-submit",
        title: "Submit: Register form",
        subtitle: "Full-name form on RegisterPage",
        source: "src/frontend/src/pages/RegisterPage.tsx",
        flows: ["register"],
    },
    {
        id: "ui-chatpage-mount",
        title: "<ChatPage /> mount",
        subtitle: "Registered-user entry point",
        source: "src/frontend/src/pages/ChatPage.tsx",
        flows: ["chat-mount"],
    },
    {
        id: "ui-select-general",
        title: "Click: #general",
        subtitle: "Sidebar nav",
        source: "src/frontend/src/chat/Sidebar.tsx",
        flows: ["select-conversation"],
    },
    {
        id: "ui-select-peer",
        title: "Click: user in UserList",
        subtitle: "Open DM",
        source: "src/frontend/src/chat/UserList.tsx",
        flows: ["select-conversation"],
    },
    {
        id: "ui-composer-submit",
        title: "Submit: composer",
        subtitle: "Enter / Send button",
        source: "src/frontend/src/chat/ChatView.tsx",
        flows: ["send-general", "send-private"],
    },
    {
        id: "ui-load-older",
        title: "Click: Load older messages",
        subtitle: "Top of ChatView",
        source: "src/frontend/src/chat/ChatView.tsx",
        flows: ["load-older"],
    },
    {
        id: "ui-search-input",
        title: "Type: search users",
        subtitle: "Debounced 250 ms",
        source: "src/frontend/src/chat/UserList.tsx",
        flows: ["search-users"],
    },
    {
        id: "ui-load-more-users",
        title: "Click: Load more users",
        subtitle: "UserList footer",
        source: "src/frontend/src/chat/UserList.tsx",
        flows: ["load-more-users"],
    },
    {
        id: "ui-logout",
        title: "Click: Sign out",
        subtitle: "Sidebar footer",
        source: "src/frontend/src/chat/Sidebar.tsx",
        flows: ["logout"],
    },
];

// ---------------------------------------------------------------------------
// Timers (the only two scheduled flows in the app today).
// ---------------------------------------------------------------------------

interface Timer {
    id: string;
    title: string;
    subtitle: string;
    source: string;
    flows: string[];
}

export const TIMERS: Timer[] = [
    {
        id: "timer-chat-poll",
        title: "ChatView poll (3 s)",
        subtitle: "setInterval while conversation open",
        source: "src/frontend/src/chat/ChatView.tsx",
        flows: ["chat-poll"],
    },
    {
        id: "timer-unread-poll",
        title: "Unread poll (4 s)",
        subtitle: "setInterval in useUnreadTracker",
        source: "src/frontend/src/hooks/useUnreadTracker.ts",
        flows: ["unread-poll"],
    },
    {
        id: "timer-search-debounce",
        title: "Search debounce (250 ms)",
        subtitle: "setTimeout in UserList",
        source: "src/frontend/src/chat/UserList.tsx",
        flows: ["search-users"],
    },
];

// ---------------------------------------------------------------------------
// Canister endpoints (real Motoko public methods).
// ---------------------------------------------------------------------------

interface Endpoint {
    id: string;
    parentId: string;
    title: string;
    subtitle: string;
    complexity: string;
    severity: ComplexitySeverity;
    details: string[];
    source: string;
    flows: string[];
}

export const ENDPOINTS: Endpoint[] = [
    // users canister
    {
        id: "ep-users-me",
        parentId: "canister-users",
        title: "me() : query → ?User",
        subtitle: "Registered-user lookup for the caller",
        complexity: "O(log N)",
        severity: "log",
        details: [
            "Map.get(users, Principal.compare, caller) on the ordered map.",
            "No auth required — anonymous principals just get null.",
        ],
        source: "src/users/main.mo",
        flows: ["bootstrap", "login"],
    },
    {
        id: "ep-users-register",
        parentId: "canister-users",
        title: "register(fullName) : update",
        subtitle: "Idempotent register-by-principal",
        complexity: "O(log N)",
        severity: "log",
        details: [
            "Rejects Principal.isAnonymous(caller).",
            "Text.trim + size > 0 validation.",
            "Map.get → early-return existing if already registered (idempotent).",
            "Map.add with Principal.compare key ordering.",
        ],
        source: "src/users/main.mo",
        flows: ["register"],
    },
    {
        id: "ep-users-getUser",
        parentId: "canister-users",
        title: "getUser(p) : query → ?User",
        subtitle: "Used by messages canister + name resolver",
        complexity: "O(log N)",
        severity: "log",
        details: [
            "Map.get(users, Principal.compare, p).",
            "Invoked inter-canister by messages.assertRegistered.",
            "Invoked per unknown sender in the frontend name resolver.",
        ],
        source: "src/users/main.mo",
        flows: ["send-general", "send-private", "resolve-names"],
    },
    {
        id: "ep-users-listUsers",
        parentId: "canister-users",
        title: "listUsers({offset, limit, search?}) : query",
        subtitle: "Paginated + searchable user list",
        complexity: "O(N log N) per call",
        severity: "nlogn",
        details: [
            "Iter.toArray(Map.values(users)) — materialises whole map.",
            "Array.filter by Text.contains on ASCII-lowercased fullName (substring match).",
            "Array.sort by Text.compare(toLowerAscii(name)) — recomputed every call.",
            "Slice [offset, min(offset+limit, total)) — limit capped by caller (20).",
            "Returns { users: [User]; total: Nat }.",
        ],
        source: "src/users/main.mo",
        flows: ["search-users", "load-more-users"],
    },
    {
        id: "ep-users-totalUsers",
        parentId: "canister-users",
        title: "totalUsers() : query → Nat",
        subtitle: "Map.size",
        complexity: "O(1)",
        severity: "constant",
        details: ["Map.size(users). Not used by the UI today; exposed for ops/diagnostics."],
        source: "src/users/main.mo",
        flows: [],
    },

    // messages canister
    {
        id: "ep-msg-postGeneral",
        parentId: "canister-messages",
        title: "postGeneral(content) : update",
        subtitle: "Append to #general log",
        complexity: "O(log M) check + O(1) append",
        severity: "log",
        details: [
            "Reject anonymous.",
            "assertRegistered(caller) — inter-canister query to users.getUser → O(log M).",
            "validateContent — trim + ≤ 4096 bytes.",
            "id = nextId; nextId += 1.",
            "List.add(generalMessages, msg) — amortised O(1) tail append.",
        ],
        source: "src/messages/main.mo",
        flows: ["send-general"],
    },
    {
        id: "ep-msg-postPrivate",
        parentId: "canister-messages",
        title: "postPrivate(peer, content) : update",
        subtitle: "Append DM + update peer index for both sides",
        complexity: "2× O(log M) + O(log C) + 2× O(log P)",
        severity: "log",
        details: [
            "Reject anonymous / self-DM.",
            "assertRegistered(caller) + assertRegistered(recipient) — two inter-canister queries.",
            "validateContent.",
            "conversationKey(a,b): Principal.toText(a/b) + Text.compare → 'min|max' deterministic key.",
            "Map.get(conversations, Text.compare, key); on miss Map.add empty List.",
            "List.add(conv, msg).",
            "recordPeer(caller, peer, id) + recordPeer(peer, caller, id) — two nested Map inserts.",
        ],
        source: "src/messages/main.mo",
        flows: ["send-private"],
    },
    {
        id: "ep-msg-getGeneral",
        parentId: "canister-messages",
        title: "getGeneral({offset, limit}) : query",
        subtitle: "Paginated #general",
        complexity: "O(L), L = min(limit, 200)",
        severity: "linear",
        details: [
            "clampLimit — max page = 200.",
            "paginate: total = List.size (O(1)); endExclusive = total - offset; start = endExclusive - limit.",
            "List.sliceToArray(start, end) → [Message] (oldest→newest).",
            "Returns { messages, total }.",
        ],
        source: "src/messages/main.mo",
        flows: ["select-conversation", "chat-poll", "load-older"],
    },
    {
        id: "ep-msg-getPrivate",
        parentId: "canister-messages",
        title: "getPrivate(peer, {offset, limit}) : query",
        subtitle: "Paginated DM (caller-scoped)",
        complexity: "O(L) + O(log C) lookup",
        severity: "linear",
        details: [
            "Returns empty if anonymous or peer == caller.",
            "Map.get(conversations, Text.compare, conversationKey(caller, peer)) — O(log C).",
            "paginate as in getGeneral.",
            "Access is implicitly authorised because the key is derived from the caller + peer.",
        ],
        source: "src/messages/main.mo",
        flows: ["select-conversation", "chat-poll", "load-older"],
    },
    {
        id: "ep-msg-listMyConversations",
        parentId: "canister-messages",
        title: "listMyConversations() : query → [Summary]",
        subtitle: "All peers + last message id for caller",
        complexity: "O(K), K = caller's distinct peer count",
        severity: "linear",
        details: [
            "Map.get(userPeers, caller) → inner Map<Principal, Nat>.",
            "Iterate entries and emit { peer, lastMessageId }.",
            "No pagination today — may need it for super-connected users.",
        ],
        source: "src/messages/main.mo",
        flows: ["unread-poll"],
    },
    {
        id: "ep-msg-getGeneralLatestId",
        parentId: "canister-messages",
        title: "getGeneralLatestId() : query → ?Nat",
        subtitle: "Latest #general message id",
        complexity: "O(1)",
        severity: "constant",
        details: ["List.last(generalMessages) → ?Message; map to ?id. Cheap, hit every 4 s by every open tab."],
        source: "src/messages/main.mo",
        flows: ["unread-poll"],
    },
    {
        id: "ep-msg-setUsersCanister",
        parentId: "canister-messages",
        title: "setUsersCanister(p) : update",
        subtitle: "Admin-only wiring (deploy-time)",
        complexity: "O(1)",
        severity: "constant",
        details: [
            "assertAdmin: first caller becomes admin; subsequent callers must match.",
            "Writes usersCanister := ?p.",
            "Called once by the deploy script after the users canister is installed.",
        ],
        source: "src/messages/main.mo",
        flows: [],
    },
];

// ---------------------------------------------------------------------------
// Canisters (parent groups for endpoints).
// ---------------------------------------------------------------------------

interface Canister {
    id: string;
    title: string;
    subtitle: string;
    source: string;
    external?: boolean;
}

export const CANISTERS: Canister[] = [
    {
        id: "canister-users",
        title: "Users canister",
        subtitle: "persistent actor Users — principal-keyed registry",
        source: "src/users/main.mo",
    },
    {
        id: "canister-messages",
        title: "Messages canister",
        subtitle: "persistent actor Messages — #general + DMs",
        source: "src/messages/main.mo",
    },
    {
        id: "canister-ii",
        title: "Internet Identity (aaaaa-aa peer)",
        subtitle: "External — provides delegations",
        source: "dfx.json (pulled canister)",
        external: true,
    },
    {
        id: "canister-management",
        title: "Management canister",
        subtitle: "Deploy/upgrade orchestration — not hit at runtime by the UI",
        source: "src/management/main.mo",
    },
];

// ---------------------------------------------------------------------------
// Data structures — the global `var` state inside each canister.
// ---------------------------------------------------------------------------

interface DataStruct {
    id: string;
    parentId: string; // canister
    title: string;
    type: string;
    complexity: string;
    severity: ComplexitySeverity;
    details: string[];
    source: string;
}

export const DATA_STRUCTS: DataStruct[] = [
    {
        id: "data-users",
        parentId: "canister-users",
        title: "users",
        type: "Map<Principal, User>  (mo:core/Map, ordered)",
        complexity: "get/add O(log N), size O(1)",
        severity: "log",
        details: [
            "Sole source of truth for registered users.",
            "Ordered by Principal.compare — stable across upgrades.",
            "Never shrinks; no delete endpoint today.",
        ],
        source: "src/users/main.mo",
    },
    {
        id: "data-nextId",
        parentId: "canister-messages",
        title: "nextId",
        type: "Nat (monotonic counter)",
        complexity: "O(1)",
        severity: "constant",
        details: [
            "Global message id allocator across #general AND all DMs.",
            "Read before append; incremented by 1. No gaps.",
            "Used by the unread tracker to detect new messages.",
        ],
        source: "src/messages/main.mo",
    },
    {
        id: "data-generalMessages",
        parentId: "canister-messages",
        title: "generalMessages",
        type: "List<Message>  (mo:core/List, append-only)",
        complexity: "add O(1) amortised, size O(1), last O(1), sliceToArray O(L)",
        severity: "constant",
        details: [
            "Ordered oldest→newest. Pagination uses offset from the tail.",
            "Grows unbounded — archive/shard if retention becomes an issue.",
        ],
        source: "src/messages/main.mo",
    },
    {
        id: "data-conversations",
        parentId: "canister-messages",
        title: "conversations",
        type: "Map<Text, List<Message>>  (key = 'min|max' principals)",
        complexity: "get/add O(log C), per-conv append O(1)",
        severity: "log",
        details: [
            "One List per unordered pair of participants.",
            "Text key derived from sorted principal pair; symmetric for both sides.",
            "Access is implicitly scoped: callers can only ever read their own keys.",
        ],
        source: "src/messages/main.mo",
    },
    {
        id: "data-userPeers",
        parentId: "canister-messages",
        title: "userPeers",
        type: "Map<Principal, Map<Principal, Nat>>  (peer → lastMessageId)",
        complexity: "outer get O(log U), inner add O(log P)",
        severity: "log",
        details: [
            "Per-user index of peers + last known message id.",
            "Updated on every postPrivate for both caller and recipient.",
            "Read by listMyConversations to power unread dots.",
        ],
        source: "src/messages/main.mo",
    },
    {
        id: "data-admin",
        parentId: "canister-messages",
        title: "admin / usersCanister",
        type: "?Principal",
        complexity: "O(1)",
        severity: "constant",
        details: [
            "admin: first caller of an admin endpoint becomes admin.",
            "usersCanister: set once by deploy script for assertRegistered inter-canister calls.",
        ],
        source: "src/messages/main.mo",
    },
];

// ---------------------------------------------------------------------------
// Edges — the wires between UI, flows, canisters and data.
// Payload/response strings describe what actually travels on each wire.
// ---------------------------------------------------------------------------

export const EDGES: DiagramEdge[] = [
    // Triggers → flows
    { id: "t-bootstrap", source: "ui-app-mount", target: "flow-bootstrap", kind: "trigger", label: "mount", flow: "bootstrap" },
    { id: "t-login", source: "ui-login-click", target: "flow-login", kind: "trigger", label: "onClick", flow: "login" },
    { id: "t-register", source: "ui-register-submit", target: "flow-register", kind: "trigger", label: "onSubmit", flow: "register", payload: "fullName: string (trimmed)" },
    { id: "t-chatmount", source: "ui-chatpage-mount", target: "flow-chat-mount", kind: "trigger", label: "mount", flow: "chat-mount" },
    { id: "t-sel-general", source: "ui-select-general", target: "flow-select-conversation", kind: "trigger", label: "onClick", flow: "select-conversation", payload: "{ kind: 'general' }" },
    { id: "t-sel-peer", source: "ui-select-peer", target: "flow-select-conversation", kind: "trigger", label: "onClick", flow: "select-conversation", payload: "{ kind: 'private', peer: Principal, peerName: string }" },
    { id: "t-send-g", source: "ui-composer-submit", target: "flow-send-general", kind: "trigger", label: "submit (general)", flow: "send-general", payload: "content: string" },
    { id: "t-send-p", source: "ui-composer-submit", target: "flow-send-private", kind: "trigger", label: "submit (private)", flow: "send-private", payload: "peer: Principal, content: string" },
    { id: "t-older", source: "ui-load-older", target: "flow-load-older", kind: "trigger", label: "onClick", flow: "load-older" },
    { id: "t-search", source: "ui-search-input", target: "timer-search-debounce", kind: "trigger", label: "onChange", flow: "search-users" },
    { id: "t-search2", source: "timer-search-debounce", target: "flow-search-users", kind: "trigger", label: "after 250 ms", flow: "search-users", payload: "search: string (trimmed)" },
    { id: "t-loadmore", source: "ui-load-more-users", target: "flow-load-more-users", kind: "trigger", label: "onClick", flow: "load-more-users" },
    { id: "t-logout", source: "ui-logout", target: "flow-logout", kind: "trigger", label: "onClick", flow: "logout" },

    // Timers → flows
    { id: "t-timer-chat", source: "timer-chat-poll", target: "flow-chat-poll", kind: "trigger", label: "every 3 s", flow: "chat-poll", animated: true },
    { id: "t-timer-unread", source: "timer-unread-poll", target: "flow-unread-poll", kind: "trigger", label: "every 4 s", flow: "unread-poll", animated: true },

    // Flow chains
    { id: "c-select-names", source: "flow-select-conversation", target: "flow-resolve-names", kind: "chain", label: "messages change", flow: "resolve-names" },
    { id: "c-poll-names", source: "flow-chat-poll", target: "flow-resolve-names", kind: "chain", label: "new messages merged", flow: "resolve-names" },
    { id: "c-select-markread", source: "flow-select-conversation", target: "flow-auto-mark-read", kind: "chain", label: "selection changed", flow: "auto-mark-read" },
    { id: "c-unread-markread", source: "flow-unread-poll", target: "flow-auto-mark-read", kind: "chain", label: "latest ids changed", flow: "auto-mark-read" },

    // Flow → endpoint calls (with payload + response types)
    { id: "f-bootstrap-me", source: "flow-bootstrap", target: "ep-users-me", kind: "call", label: "query", flow: "bootstrap", payload: "() — caller in msg envelope", response: "?User = opt record { principal; fullName; registeredAt }" },
    { id: "f-login-me", source: "flow-login", target: "ep-users-me", kind: "call", label: "query", flow: "login", payload: "() — caller is signed identity", response: "?User" },
    { id: "f-register", source: "flow-register", target: "ep-users-register", kind: "call", label: "update", flow: "register", payload: "fullName: Text", response: "variant { ok: User; err: Text }" },
    { id: "f-sel-g", source: "flow-select-conversation", target: "ep-msg-getGeneral", kind: "call", label: "query (general)", flow: "select-conversation", payload: "{ offset: 0; limit: 50 }", response: "{ messages: [Message]; total: Nat }" },
    { id: "f-sel-p", source: "flow-select-conversation", target: "ep-msg-getPrivate", kind: "call", label: "query (private)", flow: "select-conversation", payload: "peer: Principal, { offset: 0; limit: 50 }", response: "{ messages: [Message]; total: Nat }" },
    { id: "f-send-g", source: "flow-send-general", target: "ep-msg-postGeneral", kind: "call", label: "update", flow: "send-general", payload: "content: Text (≤ 4096 bytes)", response: "variant { ok: Message; err: Text }" },
    { id: "f-send-p", source: "flow-send-private", target: "ep-msg-postPrivate", kind: "call", label: "update", flow: "send-private", payload: "peer: Principal, content: Text", response: "variant { ok: Message; err: Text }" },
    { id: "f-older-g", source: "flow-load-older", target: "ep-msg-getGeneral", kind: "call", label: "query (if general)", flow: "load-older", payload: "{ offset: messages.length; limit: 50 }", response: "MessagePage" },
    { id: "f-older-p", source: "flow-load-older", target: "ep-msg-getPrivate", kind: "call", label: "query (if private)", flow: "load-older", payload: "peer, { offset: messages.length; limit: 50 }", response: "MessagePage" },
    { id: "f-poll-g", source: "flow-chat-poll", target: "ep-msg-getGeneral", kind: "call", label: "query (if general)", flow: "chat-poll", payload: "{ offset: 0; limit: 50 }", response: "MessagePage" },
    { id: "f-poll-p", source: "flow-chat-poll", target: "ep-msg-getPrivate", kind: "call", label: "query (if private)", flow: "chat-poll", payload: "peer, { offset: 0; limit: 50 }", response: "MessagePage" },
    { id: "f-search", source: "flow-search-users", target: "ep-users-listUsers", kind: "call", label: "query", flow: "search-users", payload: "{ offset: 0; limit: 20; search: ?Text }", response: "{ users: [User]; total: Nat }" },
    { id: "f-loadmore", source: "flow-load-more-users", target: "ep-users-listUsers", kind: "call", label: "query", flow: "load-more-users", payload: "{ offset: offset+20; limit: 20; search }", response: "{ users: [User]; total: Nat }" },
    { id: "f-unread-latest", source: "flow-unread-poll", target: "ep-msg-getGeneralLatestId", kind: "call", label: "query (parallel)", flow: "unread-poll", payload: "()", response: "?Nat" },
    { id: "f-unread-list", source: "flow-unread-poll", target: "ep-msg-listMyConversations", kind: "call", label: "query (parallel)", flow: "unread-poll", payload: "()", response: "[{ peer: Principal; lastMessageId: Nat }]" },
    { id: "f-names", source: "flow-resolve-names", target: "ep-users-getUser", kind: "call", label: "query (per unknown)", flow: "resolve-names", payload: "p: Principal (loop body)", response: "?User" },

    // Endpoints → inter-canister (messages → users.getUser)
    { id: "x-postG-check", source: "ep-msg-postGeneral", target: "ep-users-getUser", kind: "call", label: "assertRegistered", flow: "send-general", payload: "caller: Principal", response: "?User (null ⇒ #err)" },
    { id: "x-postP-check-a", source: "ep-msg-postPrivate", target: "ep-users-getUser", kind: "call", label: "assertRegistered(caller)", flow: "send-private", payload: "caller: Principal", response: "?User" },
    { id: "x-postP-check-b", source: "ep-msg-postPrivate", target: "ep-users-getUser", kind: "call", label: "assertRegistered(peer)", flow: "send-private", payload: "recipient: Principal", response: "?User" },

    // External: II
    { id: "ii-login", source: "flow-login", target: "canister-ii", kind: "call", label: "delegate", flow: "login", payload: "AuthClient.login request (pubKey, maxTTL=7d)", response: "Delegation chain (stored in IndexedDB)" },

    // Endpoint → data (reads / writes)
    { id: "d-me-read", source: "ep-users-me", target: "data-users", kind: "read", label: "Map.get", complexity: "O(log N)", payload: "caller: Principal" },
    { id: "d-register-rw", source: "ep-users-register", target: "data-users", kind: "write", label: "Map.get + Map.add", complexity: "O(log N)", payload: "User { principal; fullName; registeredAt }" },
    { id: "d-getUser-read", source: "ep-users-getUser", target: "data-users", kind: "read", label: "Map.get", complexity: "O(log N)", payload: "p: Principal" },
    { id: "d-listUsers-read", source: "ep-users-listUsers", target: "data-users", kind: "read", label: "Iter.toArray + filter + sort", complexity: "O(N log N)", payload: "full values() iteration" },

    { id: "d-postG-write-list", source: "ep-msg-postGeneral", target: "data-generalMessages", kind: "write", label: "List.add", complexity: "O(1) amortised", payload: "Message { id; sender; content; timestamp }" },
    { id: "d-postG-write-id", source: "ep-msg-postGeneral", target: "data-nextId", kind: "write", label: "read + inc", complexity: "O(1)", payload: "nextId += 1" },
    { id: "d-postP-write-id", source: "ep-msg-postPrivate", target: "data-nextId", kind: "write", label: "read + inc", complexity: "O(1)", payload: "nextId += 1" },
    { id: "d-postP-write-conv", source: "ep-msg-postPrivate", target: "data-conversations", kind: "write", label: "Map.get/add + List.add", complexity: "O(log C) + O(1)", payload: "key='minP|maxP', Message" },
    { id: "d-postP-write-peers", source: "ep-msg-postPrivate", target: "data-userPeers", kind: "write", label: "recordPeer × 2", complexity: "2× O(log U + log P)", payload: "(caller → peer → id) and (peer → caller → id)" },

    { id: "d-getG-read", source: "ep-msg-getGeneral", target: "data-generalMessages", kind: "read", label: "List.size + sliceToArray", complexity: "O(L)", payload: "[start, end)" },
    { id: "d-getP-read-conv", source: "ep-msg-getPrivate", target: "data-conversations", kind: "read", label: "Map.get + sliceToArray", complexity: "O(log C) + O(L)", payload: "conversationKey(caller, peer)" },
    { id: "d-listConv-read", source: "ep-msg-listMyConversations", target: "data-userPeers", kind: "read", label: "Map.get + entries()", complexity: "O(K)", payload: "caller → inner map iter" },
    { id: "d-latest-read", source: "ep-msg-getGeneralLatestId", target: "data-generalMessages", kind: "read", label: "List.last", complexity: "O(1)", payload: "tail peek" },

    { id: "d-setUsers-write", source: "ep-msg-setUsersCanister", target: "data-admin", kind: "write", label: "assertAdmin + assign", complexity: "O(1)", payload: "usersCanister := ?p" },
];

// Build one flow-node per flow (so the diagram has actual flow boxes).
export interface FlowNode extends DiagramNode {
    kind: "flow";
}
export const FLOW_NODES: FlowNode[] = FLOWS.map((f) => ({
    id: `flow-${f.id}`,
    kind: "flow",
    parentId: "group-flows",
    title: f.title,
    subtitle: f.trigger,
    complexity: f.complexity,
    overallComplexity: f.overallComplexity,
    complexitySeverity: f.complexitySeverity,
    details: [f.summary, "", "Steps:", ...f.steps.map((s) => "• " + s), "", "Scaling notes:", ...f.scalingNotes.map((s) => "• " + s)],
    source: f.source,
    flows: [f.id],
}));
