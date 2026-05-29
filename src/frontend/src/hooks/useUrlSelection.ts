import { useCallback, useEffect, useRef, useState } from "react";
import type { UsersActor } from "../canisters/users";
import {
    selectionFromPath,
    selectionToPath,
    type Selection,
} from "../chat/types";

function readSelection(): Selection {
    const parsed = selectionFromPath(window.location.pathname);
    return parsed ?? { kind: "general" };
}

/**
 * Two-way sync between the current Selection and the URL pathname.
 *
 * - On mount, the initial selection is parsed from `window.location`.
 * - `setSelection` pushes a new history entry.
 * - Browser back/forward (popstate) updates state.
 * - When the URL points at a private channel but only the peer principal is
 *   known, we resolve the display name asynchronously via the users canister.
 */
export function useUrlSelection(usersActor: UsersActor | null) {
    const [selection, setSelectionState] = useState<Selection>(() =>
        readSelection(),
    );

    // Normalize the URL on mount (e.g. "/" -> "/general", invalid -> "/general").
    useEffect(() => {
        const desired = selectionToPath(selection);
        if (window.location.pathname !== desired) {
            window.history.replaceState({}, "", desired);
        }
        // Only run once on mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const setSelection = useCallback((next: Selection) => {
        setSelectionState(next);
        const path = selectionToPath(next);
        if (window.location.pathname !== path) {
            window.history.pushState({}, "", path);
        }
    }, []);

    useEffect(() => {
        const onPop = () => {
            setSelectionState(readSelection());
        };
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);

    // Resolve peer name when entering a private channel via URL.
    const resolvingRef = useRef<string | null>(null);
    useEffect(() => {
        if (!usersActor) return;
        if (selection.kind !== "private") return;
        if (selection.peerName) return;
        const peerText = selection.peer.toText();
        if (resolvingRef.current === peerText) return;
        resolvingRef.current = peerText;
        let cancelled = false;
        (async () => {
            try {
                const res = await usersActor.getUser(selection.peer);
                if (cancelled) return;
                if (res.length === 1) {
                    setSelectionState((cur) => {
                        if (
                            cur.kind === "private" &&
                            cur.peer.toText() === peerText &&
                            !cur.peerName
                        ) {
                            return {
                                kind: "private",
                                peer: cur.peer,
                                peerName: res[0].fullName,
                            };
                        }
                        return cur;
                    });
                }
            } catch {
                // Non-fatal: UI falls back to short principal.
            } finally {
                if (resolvingRef.current === peerText) {
                    resolvingRef.current = null;
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [usersActor, selection]);

    return [selection, setSelection] as const;
}
