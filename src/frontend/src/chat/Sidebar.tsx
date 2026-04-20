import type { Principal } from "@dfinity/principal";
import { useState } from "react";
import type { UsersActor, User } from "../canisters/users";
import UserList from "./UserList";
import type { Selection } from "./types";

interface Props {
    usersActor: UsersActor;
    selfPrincipal: Principal;
    selfName: string;
    selection: Selection;
    onSelect: (sel: Selection) => void;
    onLogout: () => void;
    generalUnread: boolean;
    isPeerUnread: (peer: Principal) => boolean;
}

export default function Sidebar({
    usersActor,
    selfPrincipal,
    selfName,
    selection,
    onSelect,
    onLogout,
    generalUnread,
    isPeerUnread,
}: Props) {
    const handlePeer = (u: User) =>
        onSelect({ kind: "private", peer: u.principal, peerName: u.fullName });

    const showGeneralDot =
        generalUnread && selection.kind !== "general";

    const [copied, setCopied] = useState(false);
    const principalText = selfPrincipal.toText();
    const copyPrincipal = async () => {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(principalText);
            } else {
                // Fallback for non-secure contexts.
                const ta = document.createElement("textarea");
                ta.value = principalText;
                ta.style.position = "fixed";
                ta.style.opacity = "0";
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch (err) {
            console.error("Failed to copy principal", err);
        }
    };

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <h1>Chat Demo</h1>
                <p className="hint small">
                    Signed in as <b>{selfName}</b>
                </p>
                <div className="principal-line" title={principalText}>
                    <code>{principalText}</code>
                    <button
                        type="button"
                        className="copy-btn"
                        onClick={() => void copyPrincipal()}
                        aria-label="Copy principal"
                        title="Copy principal"
                    >
                        {copied ? "✓" : "Copy"}
                    </button>
                </div>
            </div>

            <nav className="channels">
                <button
                    type="button"
                    className={`channel ${selection.kind === "general" ? "active" : ""}`}
                    onClick={() => onSelect({ kind: "general" })}
                >
                    <span className="hash">#</span> general
                    {showGeneralDot && (
                        <span
                            className="unread-dot"
                            aria-label="Unread messages"
                        />
                    )}
                </button>
                <button
                    type="button"
                    className={`channel ${selection.kind === "diagram" ? "active" : ""}`}
                    onClick={() => onSelect({ kind: "diagram" })}
                >
                    <span className="hash">◆</span> diagram
                </button>
                <button
                    type="button"
                    className={`channel ${selection.kind === "canisters" ? "active" : ""}`}
                    onClick={() => onSelect({ kind: "canisters" })}
                >
                    <span className="hash">⬢</span> canisters
                </button>
            </nav>

            <div className="sidebar-section">
                <h3>Direct messages</h3>
                <UserList
                    usersActor={usersActor}
                    selfPrincipal={selfPrincipal}
                    selectedPeer={
                        selection.kind === "private" ? selection.peer : null
                    }
                    onSelectPeer={handlePeer}
                    isPeerUnread={isPeerUnread}
                />
            </div>

            <div className="sidebar-footer">
                <button type="button" className="link" onClick={onLogout}>
                    Sign out
                </button>
            </div>
        </aside>
    );
}
