import { useState, type FormEvent } from "react";
import { useAuth } from "../AuthContext";

export default function RegisterPage() {
    const { register, logout, identity } = useAuth();
    const [fullName, setFullName] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            await register(fullName.trim());
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="center-card">
            <h1>Welcome!</h1>
            <p>
                Signed in as{" "}
                <code>{identity?.getPrincipal().toText() ?? "unknown"}</code>.
            </p>
            <p>Please tell us your full name to finish registration.</p>
            <form onSubmit={onSubmit}>
                <label>
                    Full name
                    <input
                        type="text"
                        value={fullName}
                        autoFocus
                        required
                        minLength={1}
                        maxLength={128}
                        disabled={submitting}
                        onChange={(e) => setFullName(e.target.value)}
                    />
                </label>
                {error && <p className="error">{error}</p>}
                <div className="row">
                    <button
                        type="submit"
                        disabled={submitting || fullName.trim().length === 0}
                    >
                        {submitting ? "Registering..." : "Continue"}
                    </button>
                    <button
                        type="button"
                        className="link"
                        onClick={() => void logout()}
                        disabled={submitting}
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </main>
    );
}
