import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { AuthClient } from "@dfinity/auth-client";
import type { Identity } from "@dfinity/agent";
import { createUsersActor, getIdentityProviderUrl } from "./canisters/agent";
import type { User, UsersActor } from "./canisters/users";

type AuthStatus =
    | "loading"
    | "anonymous"
    | "authenticated-unregistered"
    | "authenticated-registered";

interface AuthContextValue {
    status: AuthStatus;
    identity: Identity | null;
    user: User | null;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    register: (fullName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Internet Identity's maxTimeToLive - 7 days in nanoseconds.
const SESSION_TTL_NS = BigInt(7 * 24 * 60 * 60) * BigInt(1_000_000_000);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [authClient, setAuthClient] = useState<AuthClient | null>(null);
    const [identity, setIdentity] = useState<Identity | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [status, setStatus] = useState<AuthStatus>("loading");

    const refreshUser = useCallback(
        async (actor: UsersActor) => {
            const result = await actor.me();
            if (result.length === 1) {
                setUser(result[0]);
                setStatus("authenticated-registered");
            } else {
                setUser(null);
                setStatus("authenticated-unregistered");
            }
        },
        [],
    );

    const syncFromClient = useCallback(
        async (client: AuthClient) => {
            if (await client.isAuthenticated()) {
                const id = client.getIdentity();
                setIdentity(id);
                const actor = await createUsersActor(id);
                await refreshUser(actor);
            } else {
                setIdentity(null);
                setUser(null);
                setStatus("anonymous");
            }
        },
        [refreshUser],
    );

    useEffect(() => {
        let cancelled = false;
        AuthClient.create({
            idleOptions: { disableIdle: true },
        }).then(async (client) => {
            if (cancelled) return;
            setAuthClient(client);
            await syncFromClient(client);
        });
        return () => {
            cancelled = true;
        };
    }, [syncFromClient]);

    const login = useCallback(async () => {
        if (!authClient) return;
        await new Promise<void>((resolve, reject) => {
            authClient.login({
                identityProvider: getIdentityProviderUrl(),
                maxTimeToLive: SESSION_TTL_NS,
                onSuccess: () => resolve(),
                onError: (err) => reject(new Error(err ?? "Login failed")),
            });
        });
        await syncFromClient(authClient);
    }, [authClient, syncFromClient]);

    const logout = useCallback(async () => {
        if (!authClient) return;
        await authClient.logout();
        setIdentity(null);
        setUser(null);
        setStatus("anonymous");
    }, [authClient]);

    const register = useCallback(
        async (fullName: string) => {
            if (!identity) throw new Error("Not authenticated");
            const actor = await createUsersActor(identity);
            const result = await actor.register(fullName);
            if ("err" in result) {
                throw new Error(result.err);
            }
            setUser(result.ok);
            setStatus("authenticated-registered");
        },
        [identity],
    );

    const value = useMemo<AuthContextValue>(
        () => ({ status, identity, user, login, logout, register }),
        [status, identity, user, login, logout, register],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
    return ctx;
}
