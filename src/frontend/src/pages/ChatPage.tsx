import { useState } from "react";
import { useAuth } from "../AuthContext";
import { useActors } from "../hooks/useActors";
import Sidebar from "../chat/Sidebar";
import ChatView from "../chat/ChatView";
import DiagramView from "../diagram/DiagramView";
import type { Selection } from "../chat/types";

export default function ChatPage() {
    const { user, identity, logout } = useAuth();
    const actors = useActors(identity);
    const [selection, setSelection] = useState<Selection>({ kind: "general" });

    if (!user || !identity) {
        return (
            <main className="center-card">
                <p>Loading...</p>
            </main>
        );
    }

    if (!actors) {
        return (
            <main className="center-card">
                <p>Connecting to canisters...</p>
            </main>
        );
    }

    return (
        <div className="chat-layout">
            <Sidebar
                usersActor={actors.users}
                selfPrincipal={user.principal}
                selfName={user.fullName}
                selection={selection}
                onSelect={setSelection}
                onLogout={() => void logout()}
            />
            {selection.kind === "diagram" ? (
                <DiagramView />
            ) : (
                <ChatView
                    messagesActor={actors.messages}
                    usersActor={actors.users}
                    selfPrincipal={user.principal}
                    selfName={user.fullName}
                    selection={selection}
                />
            )}
        </div>
    );
}
