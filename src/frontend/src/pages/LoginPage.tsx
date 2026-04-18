import { useAuth } from "../AuthContext";

export default function LoginPage() {
    const { login } = useAuth();

    return (
        <main className="center-card">
            <h1>Chat Demo</h1>
            <p>
                Sign in with your Internet Identity to continue. Internet
                Identity supports signing in with a Google account directly
                from its consent screen.
            </p>
            <button type="button" onClick={() => void login()}>
                Sign in with Internet Identity
            </button>
            <p className="hint">
                On the Internet Identity screen, choose <b>Continue with Google</b>{" "}
                to use your Google account.
            </p>
        </main>
    );
}
