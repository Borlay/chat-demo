import { useCallback, useEffect, useState } from "react";
import type { Principal } from "@dfinity/principal";
import type {
    CanisterStatusInfo,
    ManagementActor,
    RunStatus,
} from "../canisters/management";

interface Props {
    managementActor: ManagementActor;
}

type LoadState =
    | { kind: "loading" }
    | { kind: "ready"; data: CanisterStatusInfo[]; fetchedAt: number }
    | { kind: "error"; message: string };

const TRILLION = 1_000_000_000_000n;
const MIB = 1024n * 1024n;

function formatCycles(n: bigint): string {
    if (n === 0n) return "0";
    // Show trillions with 3 decimals when large; raw otherwise.
    if (n >= TRILLION / 1000n) {
        const whole = n / TRILLION;
        const frac = ((n % TRILLION) * 1000n) / TRILLION;
        return `${whole}.${frac.toString().padStart(3, "0")} T`;
    }
    return `${n.toLocaleString()} cycles`;
}

function formatMemory(n: bigint): string {
    if (n === 0n) return "–";
    if (n < 1024n) return `${n} B`;
    if (n < MIB) {
        const kib = (n * 100n) / 1024n;
        return `${Number(kib) / 100} KiB`;
    }
    const mib = (n * 100n) / MIB;
    return `${Number(mib) / 100} MiB`;
}

function statusLabel(status: [] | [RunStatus]): string {
    if (status.length === 0) return "–";
    const s = status[0];
    if ("running" in s) return "running";
    if ("stopping" in s) return "stopping";
    return "stopped";
}

function statusColor(label: string): string {
    switch (label) {
        case "running":
            return "#2e7d32";
        case "stopping":
            return "#b58900";
        case "stopped":
            return "#c92a2a";
        default:
            return "#546e7a";
    }
}

function moduleHashHex(mh: [] | [Uint8Array | number[]]): string {
    if (mh.length === 0) return "–";
    const bytes =
        mh[0] instanceof Uint8Array ? mh[0] : new Uint8Array(mh[0] as number[]);
    const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return `${hex.slice(0, 12)}…${hex.slice(-6)}`;
}

function principalText(p: Principal): string {
    return p.toText();
}

export default function CanistersView({ managementActor }: Props) {
    const [state, setState] = useState<LoadState>({ kind: "loading" });

    const load = useCallback(async () => {
        setState({ kind: "loading" });
        try {
            const data = await managementActor.getCanistersStatus();
            // Stable sort by name so UI doesn't jump between refreshes.
            const sorted = [...data].sort((a, b) =>
                a.name.localeCompare(b.name),
            );
            setState({ kind: "ready", data: sorted, fetchedAt: Date.now() });
        } catch (err) {
            setState({
                kind: "error",
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }, [managementActor]);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <main className="diagram-view canisters-view">
            <header className="canisters-header">
                <div>
                    <h2>Canisters</h2>
                    <p className="hint small">
                        Runtime snapshot fetched from the management canister.
                    </p>
                </div>
                <button
                    type="button"
                    className="link"
                    onClick={() => void load()}
                    disabled={state.kind === "loading"}
                >
                    {state.kind === "loading" ? "Refreshing…" : "Refresh"}
                </button>
            </header>

            {state.kind === "loading" && (
                <p className="hint">Loading canister status…</p>
            )}

            {state.kind === "error" && (
                <p className="error">Failed to load: {state.message}</p>
            )}

            {state.kind === "ready" && (
                <>
                    <p className="hint small">
                        Updated{" "}
                        {new Date(state.fetchedAt).toLocaleTimeString()}
                    </p>
                    <div className="canister-grid">
                        {state.data.map((c) => {
                            const label = statusLabel(c.status);
                            return (
                                <article
                                    key={c.canisterId.toText()}
                                    className="canister-card"
                                >
                                    <header>
                                        <h3>{c.name}</h3>
                                        <span
                                            className="status-pill"
                                            style={{
                                                background: statusColor(label),
                                            }}
                                        >
                                            {label}
                                        </span>
                                    </header>

                                    <dl>
                                        <div>
                                            <dt>Canister ID</dt>
                                            <dd>
                                                <code>
                                                    {principalText(
                                                        c.canisterId,
                                                    )}
                                                </code>
                                            </dd>
                                        </div>
                                        <div>
                                            <dt>Cycles</dt>
                                            <dd>{formatCycles(c.cycles)}</dd>
                                        </div>
                                        <div>
                                            <dt>Memory</dt>
                                            <dd>
                                                {formatMemory(c.memorySize)}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt>Burn / day</dt>
                                            <dd>
                                                {formatCycles(
                                                    c.idleCyclesBurnedPerDay,
                                                )}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt>Module hash</dt>
                                            <dd>
                                                <code>
                                                    {moduleHashHex(
                                                        c.moduleHash,
                                                    )}
                                                </code>
                                            </dd>
                                        </div>
                                    </dl>

                                    {c.error.length > 0 && (
                                        <p className="error small">
                                            {c.error[0]}
                                        </p>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                </>
            )}
        </main>
    );
}
