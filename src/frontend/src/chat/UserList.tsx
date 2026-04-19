import { useCallback, useEffect, useRef, useState } from "react";
import type { Principal } from "@dfinity/principal";
import type { UsersActor, User } from "../canisters/users";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 250;

interface Props {
    usersActor: UsersActor;
    selfPrincipal: Principal;
    selectedPeer: Principal | null;
    onSelectPeer: (user: User) => void;
}

export default function UserList({
    usersActor,
    selfPrincipal,
    selectedPeer,
    onSelectPeer,
}: Props) {
    const [searchInput, setSearchInput] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [users, setUsers] = useState<User[]>([]);
    const [total, setTotal] = useState<bigint>(0n);
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestIdRef = useRef(0);

    // Debounce the search input.
    useEffect(() => {
        const t = setTimeout(() => {
            setDebouncedSearch(searchInput.trim());
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [searchInput]);

    const fetchPage = useCallback(
        async (nextOffset: number, replace: boolean) => {
            const myRequestId = ++requestIdRef.current;
            setLoading(true);
            setError(null);
            try {
                const res = await usersActor.listUsers({
                    offset: BigInt(nextOffset),
                    limit: BigInt(PAGE_SIZE),
                    search: debouncedSearch ? [debouncedSearch] : [],
                });
                if (myRequestId !== requestIdRef.current) return;
                setTotal(res.total);
                setUsers((prev) => {
                    const combined = replace ? res.users : [...prev, ...res.users];
                    const seen = new Set<string>();
                    return combined.filter((u) => {
                        const key = u.principal.toText();
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
                });
            } catch (err) {
                if (myRequestId !== requestIdRef.current) return;
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                if (myRequestId === requestIdRef.current) setLoading(false);
            }
        },
        [usersActor, debouncedSearch],
    );

    // Reset + refetch on search change.
    useEffect(() => {
        setOffset(0);
        void fetchPage(0, true);
    }, [fetchPage]);

    const loadMore = () => {
        const next = offset + PAGE_SIZE;
        setOffset(next);
        void fetchPage(next, false);
    };

    const refresh = () => {
        setOffset(0);
        void fetchPage(0, true);
    };

    const visible = users.filter(
        (u) => u.principal.toText() !== selfPrincipal.toText(),
    );

    const hasMore = BigInt(users.length) < total;

    return (
        <div className="user-list">
            <div className="user-list-search">
                <input
                    type="search"
                    placeholder="Search users..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="search"
                />
                <button
                    type="button"
                    className="icon-button"
                    onClick={refresh}
                    disabled={loading}
                    title="Refresh user list"
                    aria-label="Refresh user list"
                >
                    <span className={loading ? "spin" : ""} aria-hidden>
                        ↻
                    </span>
                </button>
            </div>
            {error && <p className="error small">{error}</p>}
            <ul className="users">
                {visible.length === 0 && !loading && (
                    <li className="hint small">
                        {debouncedSearch
                            ? "No users match your search."
                            : "No other users yet."}
                    </li>
                )}
                {visible.map((u) => {
                    const active =
                        selectedPeer?.toText() === u.principal.toText();
                    return (
                        <li key={u.principal.toText()}>
                            <button
                                type="button"
                                className={`user-item ${active ? "active" : ""}`}
                                onClick={() => onSelectPeer(u)}
                                title={u.principal.toText()}
                            >
                                <span className="avatar" aria-hidden>
                                    {initials(u.fullName)}
                                </span>
                                <span className="name">{u.fullName}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
            <div className="row">
                {hasMore && (
                    <button
                        type="button"
                        className="link"
                        onClick={loadMore}
                        disabled={loading}
                    >
                        {loading ? "Loading..." : "Load more"}
                    </button>
                )}
                {!hasMore && loading && <span className="hint small">Loading...</span>}
            </div>
        </div>
    );
}

function initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
