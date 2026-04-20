import { Actor, HttpAgent, type Identity } from "@dfinity/agent";
import {
    idlFactory as usersIdlFactory,
    type UsersActor,
} from "./users";
import {
    idlFactory as messagesIdlFactory,
    type MessagesActor,
} from "./messages";
import {
    idlFactory as managementIdlFactory,
    type ManagementActor,
} from "./management";

const NETWORK = import.meta.env.VITE_DFX_NETWORK || "local";
const USERS_CANISTER_ID = import.meta.env.VITE_CANISTER_ID_USERS;
const MESSAGES_CANISTER_ID = import.meta.env.VITE_CANISTER_ID_MESSAGES;
const MANAGEMENT_CANISTER_ID = import.meta.env.VITE_CANISTER_ID_MANAGEMENT;
const II_CANISTER_ID = import.meta.env.VITE_CANISTER_ID_INTERNET_IDENTITY;

export const isLocal = NETWORK !== "ic";

export function getHost(): string {
    return isLocal ? "http://127.0.0.1:4943" : "https://icp-api.io";
}

/// URL of the Internet Identity provider. II natively offers Google sign-in
/// as one of the available authentication methods on its consent screen.
export function getIdentityProviderUrl(): string {
    if (isLocal) {
        // e.g. http://<II_CANISTER_ID>.localhost:4943
        return `http://${II_CANISTER_ID}.localhost:4943`;
    }
    return "https://identity.ic0.app";
}

async function createAgent(identity: Identity): Promise<HttpAgent> {
    const agent = await HttpAgent.create({
        host: getHost(),
        identity,
    });

    if (isLocal) {
        await agent.fetchRootKey().catch((err) => {
            console.warn("Unable to fetch root key, is the replica running?", err);
        });
    }

    return agent;
}

export async function createUsersActor(
    identity: Identity,
): Promise<UsersActor> {
    if (!USERS_CANISTER_ID) {
        throw new Error(
            "VITE_CANISTER_ID_USERS is not set. Did you run `dfx deploy`?",
        );
    }

    const agent = await createAgent(identity);

    return Actor.createActor<UsersActor>(usersIdlFactory, {
        agent,
        canisterId: USERS_CANISTER_ID,
    });
}

export async function createMessagesActor(
    identity: Identity,
): Promise<MessagesActor> {
    if (!MESSAGES_CANISTER_ID) {
        throw new Error(
            "VITE_CANISTER_ID_MESSAGES is not set. Did you run `dfx deploy`?",
        );
    }

    const agent = await createAgent(identity);

    return Actor.createActor<MessagesActor>(messagesIdlFactory, {
        agent,
        canisterId: MESSAGES_CANISTER_ID,
    });
}

export async function createManagementActor(
    identity: Identity,
): Promise<ManagementActor> {
    if (!MANAGEMENT_CANISTER_ID) {
        throw new Error(
            "VITE_CANISTER_ID_MANAGEMENT is not set. Did you run `dfx deploy`?",
        );
    }

    const agent = await createAgent(identity);

    return Actor.createActor<ManagementActor>(managementIdlFactory, {
        agent,
        canisterId: MANAGEMENT_CANISTER_ID,
    });
}
