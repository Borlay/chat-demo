import { useCallback, useEffect, useRef, useState } from "react";
import type { Principal } from "@dfinity/principal";
import type { MessagesActor, Message } from "../canisters/messages";
import type { UsersActor, User } from "../canisters/users";
import { formatTimestamp, type Selection } from "./types";

const PAGE_SIZE = 50;
const POLL_INTERVAL_MS = 3000;

interface Props {
    messagesActor: MessagesActor;
    usersActor: UsersActor;
    selfPrincipal: Principal;
    selfName: string;
    selection: Selection;
}

export default function ChatView({
    messagesActor,
    usersActor,
    selfPrincipal,
    selfName,
    selection,
}: Props) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [total, setTotal] = useState<bigint>(0n);
    const [loadingInitial, setLoadingInitial] = useState(true);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const [nameCache, setNameCache] = useState<Record<string, string>>({});

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const shouldAutoScrollRef = useRef(true);
    const requestIdRef = useRef(0);

    const fetchPage = useCallback(
        async (offset: number) => {
            if (selection.kind === "general") {
                return messagesActor.getGeneral({
                    offset: BigInt(offset),
                    limit: BigInt(PAGE_SIZE),
                });
            }
            return messagesActor.getPrivate(selection.peer, {
                offset: BigInt(offset),
                limit: BigInt(PAGE_SIZE),
            });
        },
        [messagesActor, selection],
    );

    // Reset state when switching conversations, then load initial page.
    useEffect(() => {
        const myRequestId = ++requestIdRef.current;
        setMessages([]);
        setTotal(0n);
        setError(null);
        setLoadingInitial(true);
        shouldAutoScrollRef.current = true;

        fetchPage(0)
            .then((res) => {
                if (myRequestId !== requestIdRef.current) return;
                setMessages(res.messages);
                setTotal(res.total);
            })
            .catch((err) => {
                if (myRequestId !== requestIdRef.current) return;
                setError(err instanceof Error ? err.message : String(err));
            })
            .finally(() => {
                if (myRequestId === requestIdRef.current) {
                    setLoadingInitial(false);
                }
            });
    }, [fetchPage]);

    // Poll for new messages.
    useEffect(() => {
        const myRequestId = requestIdRef.current;
        const interval = setInterval(async () => {
            if (myRequestId !== requestIdRef.current) return;
            try {
                const res = await fetchPage(0);
                if (myRequestId !== requestIdRef.current) return;
                setTotal(res.total);
                setMessages((prev) => mergeNewest(prev, res.messages));
            } catch (err) {
                // Non-fatal for polling.
                console.debug("Poll failed", err);
            }
        }, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [fetchPage]);

    // Auto-scroll to bottom when new messages arrive, but only if the user was
    // already at the bottom.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        if (shouldAutoScrollRef.current) {
            el.scrollTop = el.scrollHeight;
        }
    }, [messages]);

    const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        const atBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        shouldAutoScrollRef.current = atBottom;
    };

    const loadOlder = async () => {
        if (loadingOlder) return;
        setLoadingOlder(true);
        try {
            const el = scrollRef.current;
            const prevScrollHeight = el?.scrollHeight ?? 0;
            const res = await fetchPage(messages.length);
            setTotal(res.total);
            setMessages((prev) => {
                const existingIds = new Set(prev.map((m) => m.id.toString()));
                const older = res.messages.filter(
                    (m) => !existingIds.has(m.id.toString()),
                );
                return [...older, ...prev];
            });
            // Preserve scroll position when prepending.
            requestAnimationFrame(() => {
                if (!el) return;
                const diff = el.scrollHeight - prevScrollHeight;
                el.scrollTop = diff;
            });
            shouldAutoScrollRef.current = false;
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoadingOlder(false);
        }
    };

    const onSend = async (e: React.FormEvent) => {
        e.preventDefault();
        const content = draft.trim();
        if (!content || sending) return;
        setSending(true);
        setError(null);
        try {
            const res =
                selection.kind === "general"
                    ? await messagesActor.postGeneral(content)
                    : await messagesActor.postPrivate(selection.peer, content);
            if ("err" in res) throw new Error(res.err);
            setMessages((prev) => {
                if (prev.some((m) => m.id === res.ok.id)) return prev;
                return [...prev, res.ok];
            });
            setTotal((t) => t + 1n);
            setDraft("");
            shouldAutoScrollRef.current = true;
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSending(false);
        }
    };

    // Resolve sender names for messages we don't yet have.
    useEffect(() => {
        const unknown = messages
            .map((m) => m.sender.toText())
            .filter((p) => !(p in nameCache));
        const toFetch = Array.from(new Set(unknown));
        if (toFetch.length === 0) return;

        const selfText = selfPrincipal.toText();
        const peerText =
            selection.kind === "private" ? selection.peer.toText() : null;

        const seed: Record<string, string> = {};
        seed[selfText] = selfName;
        if (peerText && selection.kind === "private") {
            seed[peerText] = selection.peerName;
        }

        (async () => {
            const entries: Record<string, string> = { ...seed };
            for (const principalText of toFetch) {
                if (entries[principalText]) continue;
                try {
                    const principal = messages.find(
                        (m) => m.sender.toText() === principalText,
                    )?.sender;
                    if (!principal) continue;
                    const res = await usersActor.getUser(principal);
                    if (res.length === 1) {
                        entries[principalText] = res[0].fullName;
                    } else {
                        entries[principalText] = shortPrincipal(principalText);
                    }
                } catch {
                    entries[principalText] = shortPrincipal(principalText);
                }
            }
            setNameCache((prev) => ({ ...entries, ...prev }));
        })();
    }, [messages, nameCache, usersActor, selfPrincipal, selfName, selection]);

    const header =
        selection.kind === "general"
            ? { title: "# General", sub: "Open chat for all registered users" }
            : { title: selection.peerName, sub: "Private conversation" };

    const hasOlder = BigInt(messages.length) < total;

    return (
        <section className="chat-view">
            <header className="chat-header">
                <div>
                    <h2>{header.title}</h2>
                    <p className="hint small">{header.sub}</p>
                </div>
            </header>

            <div className="messages" ref={scrollRef} onScroll={onScroll}>
                {hasOlder && (
                    <div className="row center">
                        <button
                            type="button"
                            className="link"
                            onClick={() => void loadOlder()}
                            disabled={loadingOlder}
                        >
                            {loadingOlder ? "Loading..." : "Load older messages"}
                        </button>
                    </div>
                )}
                {loadingInitial && messages.length === 0 && (
                    <p className="hint small center">Loading messages...</p>
                )}
                {!loadingInitial && messages.length === 0 && (
                    <p className="hint small center">
                        No messages yet. Say hello!
                    </p>
                )}
                {messages.map((m, idx) => {
                    const mine = m.sender.toText() === selfPrincipal.toText();
                    const prev = idx > 0 ? messages[idx - 1] : null;
                    const showMeta =
                        !prev ||
                        prev.sender.toText() !== m.sender.toText() ||
                        m.timestamp - prev.timestamp > 5n * 60n * 1_000_000_000n;
                    const name =
                        nameCache[m.sender.toText()] ??
                        (mine ? selfName : shortPrincipal(m.sender.toText()));
                    return (
                        <div
                            key={m.id.toString()}
                            className={`message ${mine ? "mine" : ""}`}
                        >
                            {showMeta && (
                                <div className="meta">
                                    <b>{name}</b>
                                    <span className="hint small">
                                        {formatTimestamp(m.timestamp)}
                                    </span>
                                </div>
                            )}
                            <div className="bubble">{m.content}</div>
                        </div>
                    );
                })}
            </div>

            {error && <p className="error small">{error}</p>}

            <form className="composer" onSubmit={onSend}>
                <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={
                        selection.kind === "general"
                            ? "Message #general"
                            : `Message ${selection.peerName}`
                    }
                    rows={2}
                    maxLength={4096}
                    disabled={sending}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void onSend(e);
                        }
                    }}
                />
                <button type="submit" disabled={sending || draft.trim().length === 0}>
                    {sending ? "Sending..." : "Send"}
                </button>
            </form>
        </section>
    );
}

function mergeNewest(existing: Message[], newest: Message[]): Message[] {
    if (existing.length === 0) return newest;
    const ids = new Set(existing.map((m) => m.id.toString()));
    const toAppend = newest.filter((m) => !ids.has(m.id.toString()));
    if (toAppend.length === 0) return existing;
    return [...existing, ...toAppend].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
}

function shortPrincipal(p: string): string {
    if (p.length <= 12) return p;
    return `${p.slice(0, 5)}...${p.slice(-3)}`;
}
