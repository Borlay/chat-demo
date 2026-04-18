import { useAuth, AuthProvider } from "./AuthContext";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ChatPage from "./pages/ChatPage";

function Router() {
    const { status } = useAuth();

    switch (status) {
        case "loading":
            return (
                <main className="center-card">
                    <p>Loading...</p>
                </main>
            );
        case "anonymous":
            return <LoginPage />;
        case "authenticated-unregistered":
            return <RegisterPage />;
        case "authenticated-registered":
            return <ChatPage />;
    }
}

export default function App() {
    return (
        <AuthProvider>
            <Router />
        </AuthProvider>
    );
}
