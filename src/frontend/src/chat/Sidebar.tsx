import type { Principal } from "@dfinity/principal";
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
}

export default function Sidebar({
    usersActor,
    selfPrincipal,
    selfName,
    selection,
    onSelect,
    onLogout,
}: Props) {
    const handlePeer = (u: User) =>
        onSelect({ kind: "private", peer: u.principal, peerName: u.fullName });

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <h1>Chat Demo</h1>
                <p className="hint small">
                    Signed in as <b>{selfName}</b>
                </p>
            </div>

            <nav className="channels">
                <button
                    type="button"
                    className={`channel ${selection.kind === "general" ? "active" : ""}`}
                    onClick={() => onSelect({ kind: "general" })}
                >
                    <span className="hash">#</span> general
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
