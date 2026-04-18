import { useEffect, useRef, useState } from "react";
import type { Identity } from "@dfinity/agent";
import type { UsersActor } from "../canisters/users";
import type { MessagesActor } from "../canisters/messages";
import { createMessagesActor, createUsersActor } from "../canisters/agent";

export interface Actors {
    users: UsersActor;
    messages: MessagesActor;
}

/// Creates and memoizes per-identity users/messages actors.
export function useActors(identity: Identity | null): Actors | null {
    const [actors, setActors] = useState<Actors | null>(null);
    const identityRef = useRef<Identity | null>(null);

    useEffect(() => {
        if (!identity) {
            setActors(null);
            identityRef.current = null;
            return;
        }
        let cancelled = false;
        identityRef.current = identity;
        (async () => {
            const [users, messages] = await Promise.all([
                createUsersActor(identity),
                createMessagesActor(identity),
            ]);
            if (cancelled || identityRef.current !== identity) return;
            setActors({ users, messages });
        })().catch((err) => {
            console.error("Failed to create actors", err);
        });
        return () => {
            cancelled = true;
        };
    }, [identity]);

    return actors;
}
