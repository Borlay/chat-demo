import { useEffect, useRef, useState } from "react";
import type { Identity } from "@dfinity/agent";
import type { UsersActor } from "../canisters/users";
import type { MessagesActor } from "../canisters/messages";
import type { ManagementActor } from "../canisters/management";
import {
    createManagementActor,
    createMessagesActor,
    createUsersActor,
} from "../canisters/agent";

export interface Actors {
    users: UsersActor;
    messages: MessagesActor;
    management: ManagementActor;
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
            const [users, messages, management] = await Promise.all([
                createUsersActor(identity),
                createMessagesActor(identity),
                createManagementActor(identity),
            ]);
            if (cancelled || identityRef.current !== identity) return;
            setActors({ users, messages, management });
        })().catch((err) => {
            console.error("Failed to create actors", err);
        });
        return () => {
            cancelled = true;
        };
    }, [identity]);

    return actors;
}
