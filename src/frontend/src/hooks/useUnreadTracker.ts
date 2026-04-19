import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Principal } from "@dfinity/principal";
import type { MessagesActor } from "../canisters/messages";
import type { Selection } from "../chat/types";

const POLL_INTERVAL_MS = 4000;
const STORAGE_PREFIX = "chat-demo.unread.v1";
const GENERAL_KEY = "__general__";

/**
 * Tracks unread status for the general channel and each private peer.
 *
 * Persists the "last seen" message id per conversation in localStorage,
 * scoped to the signed-in principal so multiple identities on the same
 * browser don't leak state between each other.
 */
export interface UnreadTracker {
    isGeneralUnread: boolean;
    isPeerUnread: (peer: Principal) => boolean;
    markSelectionRead: (selection: Selection) => void;
}

interface LastSeen {
    [key: string]: string; // stored as string because BigInt doesn't survive JSON
}

function storageKey(selfPrincipal: Principal): string {
    return `${STORAGE_PREFIX}.${selfPrincipal.toText()}`;
}

function loadLastSeen(selfPrincipal: Principal): LastSeen {
    try {
        const raw = localStorage.getItem(storageKey(selfPrincipal));
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
        return {};
    }
}

function saveLastSeen(selfPrincipal: Principal, data: LastSeen): void {
    try {
        localStorage.setItem(storageKey(selfPrincipal), JSON.stringify(data));
    } catch {
        // Storage full or disabled; unread indicators become session-only.
    }
}

export function useUnreadTracker(
    messagesActor: MessagesActor | null,
    selfPrincipal: Principal | null,
    activeSelection: Selection,
): UnreadTracker {
    const [lastSeen, setLastSeen] = useState<LastSeen>({});
    const [generalLatest, setGeneralLatest] = useState<bigint | null>(null);
    const [peerLatest, setPeerLatest] = useState<Record<string, bigint>>({});

    const loadedRef = useRef(false);
    useEffect(() => {
        if (!selfPrincipal) return;
        setLastSeen(loadLastSeen(selfPrincipal));
        loadedRef.current = true;
    }, [selfPrincipal]);

    const persist = useCallback(
        (next: LastSeen) => {
            if (selfPrincipal) saveLastSeen(selfPrincipal, next);
        },
        [selfPrincipal],
    );

    const updateLastSeen = useCallback(
        (key: string, id: bigint) => {
            setLastSeen((prev) => {
                const prevVal = prev[key];
                if (prevVal !== undefined && BigInt(prevVal) >= id) {
                    return prev;
                }
                const next = { ...prev, [key]: id.toString() };
                persist(next);
                return next;
            });
        },
        [persist],
    );

    // Automatically mark the active conversation as read whenever new messages
    // arrive for it, or when the active selection changes.
    useEffect(() => {
        if (activeSelection.kind === "general") {
            if (generalLatest !== null) {
                updateLastSeen(GENERAL_KEY, generalLatest);
            }
        } else if (activeSelection.kind === "private") {
            const key = activeSelection.peer.toText();
            const latest = peerLatest[key];
            if (latest !== undefined) updateLastSeen(key, latest);
        }
    }, [activeSelection, generalLatest, peerLatest, updateLastSeen]);

    // First time we observe any conversation's latest id without a persisted
    // seen value, treat it as already read. This prevents a fresh login from
    // showing every existing message as unread.
    useEffect(() => {
        if (!loadedRef.current) return;
        const hasGeneralSeen = lastSeen[GENERAL_KEY] !== undefined;
        const needsGeneralInit =
            !hasGeneralSeen && generalLatest !== null;
        const peersNeedingInit = Object.entries(peerLatest).filter(
            ([key]) => lastSeen[key] === undefined,
        );
        if (!needsGeneralInit && peersNeedingInit.length === 0) return;
        setLastSeen((prev) => {
            const next = { ...prev };
            if (needsGeneralInit && generalLatest !== null) {
                next[GENERAL_KEY] = generalLatest.toString();
            }
            for (const [key, id] of peersNeedingInit) {
                next[key] = id.toString();
            }
            persist(next);
            return next;
        });
    }, [generalLatest, peerLatest, lastSeen, persist]);

    // Poll the backend for freshness signals.
    useEffect(() => {
        if (!messagesActor || !selfPrincipal) return;

        let cancelled = false;

        const poll = async () => {
            try {
                const [generalRes, convRes] = await Promise.all([
                    messagesActor.getGeneralLatestId(),
                    messagesActor.listMyConversations(),
                ]);
                if (cancelled) return;
                const general = generalRes.length === 1 ? generalRes[0] : null;
                setGeneralLatest(general);
                setPeerLatest(() => {
                    const next: Record<string, bigint> = {};
                    for (const c of convRes) {
                        next[c.peer.toText()] = c.lastMessageId;
                    }
                    return next;
                });
            } catch (err) {
                // Polling is best-effort; ignore transient errors.
                console.debug("Unread poll failed", err);
            }
        };

        void poll();
        const handle = setInterval(() => void poll(), POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            clearInterval(handle);
        };
    }, [messagesActor, selfPrincipal]);

    const markSelectionRead = useCallback(
        (selection: Selection) => {
            if (selection.kind === "general") {
                if (generalLatest !== null) {
                    updateLastSeen(GENERAL_KEY, generalLatest);
                }
            } else if (selection.kind === "private") {
                const key = selection.peer.toText();
                const latest = peerLatest[key];
                if (latest !== undefined) {
                    updateLastSeen(key, latest);
                }
            }
        },
        [generalLatest, peerLatest, updateLastSeen],
    );

    const isGeneralUnread = useMemo(() => {
        if (generalLatest === null) return false;
        const seenStr = lastSeen[GENERAL_KEY];
        const seen = seenStr !== undefined ? BigInt(seenStr) : -1n;
        return generalLatest > seen;
    }, [generalLatest, lastSeen]);

    const isPeerUnread = useCallback(
        (peer: Principal) => {
            const key = peer.toText();
            const latest = peerLatest[key];
            if (latest === undefined) return false;
            const seenStr = lastSeen[key];
            const seen = seenStr !== undefined ? BigInt(seenStr) : -1n;
            return latest > seen;
        },
        [peerLatest, lastSeen],
    );

    return { isGeneralUnread, isPeerUnread, markSelectionRead };
}
