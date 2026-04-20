import type { Principal } from "@dfinity/principal";

export type Selection =
    | { kind: "general" }
    | { kind: "diagram" }
    | { kind: "canisters" }
    | { kind: "private"; peer: Principal; peerName: string };

export function selectionKey(sel: Selection): string {
    if (sel.kind === "general") return "general";
    if (sel.kind === "diagram") return "diagram";
    if (sel.kind === "canisters") return "canisters";
    return `private:${sel.peer.toText()}`;
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
