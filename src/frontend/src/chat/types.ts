import { Principal } from "@dfinity/principal";

export type Selection =
    | { kind: "general" }
    | { kind: "diagram" }
    | { kind: "canisters" }
    | { kind: "private"; peer: Principal; peerName?: string };

export function selectionKey(sel: Selection): string {
    if (sel.kind === "general") return "general";
    if (sel.kind === "diagram") return "diagram";
    if (sel.kind === "canisters") return "canisters";
    return `private:${sel.peer.toText()}`;
}

export function shortPrincipal(p: string): string {
    if (p.length <= 12) return p;
    return `${p.slice(0, 5)}...${p.slice(-3)}`;
}

export function peerDisplayName(
    peer: Principal,
    peerName: string | undefined,
): string {
    if (peerName && peerName.length > 0) return peerName;
    return shortPrincipal(peer.toText());
}

export function selectionToPath(sel: Selection): string {
    switch (sel.kind) {
        case "general":
            return "/general";
        case "diagram":
            return "/diagram";
        case "canisters":
            return "/canisters";
        case "private":
            return `/channels/${sel.peer.toText()}`;
    }
}

/**
 * Parse a pathname into a Selection. Returns `null` for invalid paths so the
 * caller can decide on a fallback.
 *
 * Private selections returned from a URL never include a peerName; resolve it
 * separately (e.g. via the users canister).
 */
export function selectionFromPath(pathname: string): Selection | null {
    const trimmed = pathname.replace(/\/+$/, "");
    if (trimmed === "" || trimmed === "/general") {
        return { kind: "general" };
    }
    if (trimmed === "/diagram") return { kind: "diagram" };
    if (trimmed === "/canisters") return { kind: "canisters" };
    const match = trimmed.match(/^\/channels\/([^/]+)$/);
    if (match) {
        try {
            const peer = Principal.fromText(decodeURIComponent(match[1]));
            return { kind: "private", peer };
        } catch {
            return null;
        }
    }
    return null;
}

export function formatTimestamp(ns: bigint): string {
    const ms = Number(ns / 1_000_000n);
    const date = new Date(ms);
    const now = new Date();
    const sameDay =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();
    if (sameDay) {
        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
    }
    return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}
