import { useCallback, useMemo, useRef, useState } from "react";
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    MarkerType,
    Handle,
    Position,
    applyEdgeChanges,
    applyNodeChanges,
    type Edge,
    type EdgeProps,
    type Node,
    type NodeProps,
    type OnEdgesChange,
    type OnNodesChange,
    BaseEdge,
    EdgeLabelRenderer,
    getBezierPath,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
    CANISTERS,
    DATA_STRUCTS,
    EDGES,
    ENDPOINTS,
    FLOW_NODES,
    FLOWS,
    TIMERS,
    UI_TRIGGERS,
    type ComplexitySeverity,
    type DiagramEdge,
} from "./flows";

// ---------------------------------------------------------------------------
// Visual helpers
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<ComplexitySeverity, string> = {
    constant: "#2e7d32",
    log: "#4c6ef5",
    linear: "#b58900",
    nlogn: "#d9480f",
    heavy: "#c92a2a",
};

const EDGE_COLORS: Record<string, string> = {
    trigger: "#6f42c1",
    call: "#1565c0",
    response: "#1565c0",
    chain: "#7a5af8",
    read: "#2e7d32",
    write: "#c92a2a",
    data: "#444",
};

function Badge({
    label,
    color,
    title,
}: {
    label: string;
    color: string;
    title?: string;
}) {
    return (
        <span
            title={title}
            style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#fff",
                background: color,
                borderRadius: 6,
                padding: "2px 6px",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
            }}
        >
            {label}
        </span>
    );
}

const linkBtnStyle: React.CSSProperties = {
    background: "transparent",
    border: "1px solid #3a3f4b",
    color: "#c5c8cf",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: 12,
    cursor: "pointer",
};

const prePayloadStyle: React.CSSProperties = {
    background: "#141821",
    border: "1px solid #2a2e39",
    borderRadius: 6,
    padding: 8,
    fontSize: 12,
    lineHeight: 1.4,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    margin: "4px 0 0 0",
    color: "#d5d8df",
};

// ---------------------------------------------------------------------------
// Node / edge data shapes
// ---------------------------------------------------------------------------

type BoxData = {
    title: string;
    subtitle?: string;
    kindLabel: string;
    variant: "ui" | "timer" | "flow" | "endpoint" | "data" | "external";
    complexity?: string;
    overallComplexity?: string;
    severity?: ComplexitySeverity;
    type?: string;
    details?: string[];
    source?: string | string[];
    flows?: string[];
    dim?: boolean;
};

type BoxNode = Node<BoxData, "box">;
type GroupNode = Node<{ title: string; subtitle?: string }, "groupbox">;
type AnyNode = BoxNode | GroupNode;

type DiagramEdgeExtras = {
    kind: DiagramEdge["kind"];
    label?: string;
    payload?: string;
    response?: string;
    complexity?: string;
    flow?: string;
    dim?: boolean;
};

type Inspected =
    | { kind: "node"; id: string }
    | { kind: "edge"; id: string }
    | null;

// ---------------------------------------------------------------------------
// Custom node renderers
// ---------------------------------------------------------------------------

function BoxNodeView({ data, selected }: NodeProps<BoxNode>) {
    const [open, setOpen] = useState(false);
    const hasDetails =
        (data.details && data.details.length > 0) || Boolean(data.source);

    const bg: Record<BoxData["variant"], string> = {
        ui: "#fff3e0",
        timer: "#ede7f6",
        flow: "#e3f2fd",
        endpoint: "#fffde7",
        data: "#f1f8e9",
        external: "#eceff1",
    };
    const border: Record<BoxData["variant"], string> = {
        ui: "#fb8c00",
        timer: "#6f42c1",
        flow: "#1565c0",
        endpoint: "#b58900",
        data: "#2e7d32",
        external: "#546e7a",
    };

    return (
        <div
            style={{
                minWidth: 200,
                maxWidth: 340,
                background: bg[data.variant],
                border: `2px solid ${selected ? "#0f1115" : border[data.variant]}`,
                borderRadius: 8,
                padding: "8px 10px",
                color: "#0f1115",
                boxShadow: selected
                    ? "0 0 0 3px rgba(255,255,255,0.4)"
                    : "0 2px 6px rgba(0,0,0,0.25)",
                opacity: data.dim ? 0.18 : 1,
                fontSize: 12,
                transition: "opacity 120ms ease",
            }}
        >
            <Handle
                type="target"
                position={Position.Left}
                style={{ background: border[data.variant] }}
            />
            <div
                style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: border[data.variant],
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    marginBottom: 2,
                }}
            >
                {data.kindLabel}
            </div>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: hasDetails ? "pointer" : "default",
                }}
                onClick={(e) => {
                    if (hasDetails) {
                        e.stopPropagation();
                        setOpen((v) => !v);
                    }
                }}
            >
                {hasDetails && (
                    <span style={{ fontSize: 10 }}>{open ? "▼" : "▶"}</span>
                )}
                <span style={{ fontWeight: 700, fontSize: 13 }}>
                    {data.title}
                </span>
            </div>
            {data.subtitle && (
                <div style={{ color: "#394050", marginTop: 2, fontSize: 11 }}>
                    {data.subtitle}
                </div>
            )}
            {(data.complexity || data.overallComplexity) && (
                <div
                    style={{
                        display: "flex",
                        gap: 4,
                        flexWrap: "wrap",
                        marginTop: 6,
                    }}
                >
                    {data.complexity && (
                        <Badge
                            label={data.complexity}
                            color={SEVERITY_COLORS[data.severity ?? "linear"]}
                            title="Per-call complexity"
                        />
                    )}
                    {data.overallComplexity && (
                        <Badge
                            label={`Σ ${data.overallComplexity}`}
                            color="#333"
                            title="Overall (full pagination / long-run)"
                        />
                    )}
                </div>
            )}
            {data.type && (
                <div
                    style={{
                        fontFamily: "monospace",
                        fontSize: 11,
                        color: "#394050",
                        marginTop: 4,
                        wordBreak: "break-word",
                    }}
                >
                    {data.type}
                </div>
            )}
            {open && data.details && (
                <div
                    style={{
                        marginTop: 8,
                        padding: "6px 8px",
                        background: "rgba(255,255,255,0.5)",
                        borderRadius: 6,
                        fontSize: 11,
                        lineHeight: 1.45,
                        color: "#1a1d25",
                        maxHeight: 260,
                        overflow: "auto",
                    }}
                >
                    {data.details.map((line, i) =>
                        line === "" ? (
                            <div key={i} style={{ height: 4 }} />
                        ) : (
                            <div key={i}>{line}</div>
                        ),
                    )}
                </div>
            )}
            <Handle
                type="source"
                position={Position.Right}
                style={{ background: border[data.variant] }}
            />
        </div>
    );
}

function GroupNodeView({ data }: NodeProps<GroupNode>) {
    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                background: "rgba(255,255,255,0.035)",
                border: "1px dashed #3a3f4b",
                borderRadius: 12,
                padding: "32px 8px 8px 8px",
                position: "relative",
                pointerEvents: "none",
            }}
        >
            <div
                style={{
                    position: "absolute",
                    top: 8,
                    left: 12,
                    color: "#c5c8cf",
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                }}
            >
                {data.title}
            </div>
            {data.subtitle && (
                <div
                    style={{
                        position: "absolute",
                        top: 8,
                        right: 12,
                        color: "#8a8f9a",
                        fontSize: 11,
                    }}
                >
                    {data.subtitle}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Custom edge — payload indicator + native-title tooltip on hover
// ---------------------------------------------------------------------------

function PayloadEdge(props: EdgeProps<Edge<DiagramEdgeExtras>>) {
    const {
        id,
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        markerEnd,
        data,
        selected,
    } = props;
    const [path, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
    });
    const color = EDGE_COLORS[data?.kind ?? "data"] ?? "#666";
    const dashed =
        data?.kind === "data" ||
        data?.kind === "read" ||
        data?.kind === "write" ||
        data?.kind === "chain";
    const hasPayload = Boolean(data?.payload || data?.response);

    return (
        <>
            <BaseEdge
                id={id}
                path={path}
                markerEnd={markerEnd}
                style={{
                    stroke: color,
                    strokeWidth: selected ? 3 : 1.6,
                    strokeDasharray: dashed ? "5 4" : undefined,
                    opacity: data?.dim ? 0.15 : 1,
                    transition: "opacity 120ms ease",
                }}
            />
            <EdgeLabelRenderer>
                <div
                    style={{
                        position: "absolute",
                        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        pointerEvents: "all",
                        opacity: data?.dim ? 0.15 : 1,
                        display: "flex",
                        gap: 4,
                        alignItems: "center",
                    }}
                    className="nodrag nopan"
                    title={
                        [
                            data?.label,
                            data?.payload ? `payload: ${data.payload}` : null,
                            data?.response
                                ? `response: ${data.response}`
                                : null,
                            data?.complexity
                                ? `cost: ${data.complexity}`
                                : null,
                        ]
                            .filter(Boolean)
                            .join("\n") || undefined
                    }
                >
                    {data?.label && (
                        <span
                            style={{
                                background: "#1f2430",
                                border: `1px solid ${color}`,
                                color: "#e6e6e6",
                                fontSize: 10,
                                fontWeight: 600,
                                padding: "1px 6px",
                                borderRadius: 10,
                                whiteSpace: "nowrap",
                            }}
                        >
                            {data.label}
                        </span>
                    )}
                    {hasPayload && (
                        <span
                            title="Carries data — click the edge to inspect payload & response"
                            style={{
                                width: 14,
                                height: 14,
                                borderRadius: "50%",
                                background: color,
                                color: "#fff",
                                fontSize: 9,
                                fontWeight: 700,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            ◨
                        </span>
                    )}
                </div>
            </EdgeLabelRenderer>
        </>
    );
}

// ---------------------------------------------------------------------------
// Inspector panel
// ---------------------------------------------------------------------------

function NodeDetails({
    node,
    onJumpToFlow,
}: {
    node: BoxNode;
    onJumpToFlow: (flowId: string) => void;
}) {
    const d = node.data;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
                <div
                    style={{
                        fontSize: 11,
                        color: "#8a8f9a",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                    }}
                >
                    {d.kindLabel}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{d.title}</div>
                {d.subtitle && (
                    <div style={{ color: "#b7bcc6", marginTop: 2 }}>
                        {d.subtitle}
                    </div>
                )}
            </div>
            {(d.complexity || d.overallComplexity) && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {d.complexity && (
                        <Badge
                            label={`per call · ${d.complexity}`}
                            color={SEVERITY_COLORS[d.severity ?? "linear"]}
                        />
                    )}
                    {d.overallComplexity && (
                        <Badge
                            label={`overall · ${d.overallComplexity}`}
                            color="#444"
                        />
                    )}
                </div>
            )}
            {d.type && (
                <div
                    style={{
                        fontFamily: "monospace",
                        fontSize: 12,
                        color: "#b7bcc6",
                    }}
                >
                    {d.type}
                </div>
            )}
            {d.details && d.details.length > 0 && (
                <div style={{ color: "#d5d8df", lineHeight: 1.5 }}>
                    {d.details.map((line, i) =>
                        line === "" ? (
                            <div key={i} style={{ height: 6 }} />
                        ) : (
                            <div key={i}>{line}</div>
                        ),
                    )}
                </div>
            )}
            {d.source && (
                <div style={{ color: "#8a8f9a", fontSize: 12 }}>
                    <b>Source:</b>{" "}
                    {Array.isArray(d.source) ? d.source.join(", ") : d.source}
                </div>
            )}
            {d.flows && d.flows.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {d.flows.map((f) => (
                        <button
                            key={f}
                            type="button"
                            style={{ ...linkBtnStyle, fontSize: 11 }}
                            onClick={() => onJumpToFlow(f)}
                        >
                            ▸ highlight flow: {f}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function EdgeDetails({
    edge,
    onJumpToFlow,
}: {
    edge: Edge<DiagramEdgeExtras>;
    onJumpToFlow: (flowId: string) => void;
}) {
    const d = edge.data;
    if (!d) return null;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
                <div
                    style={{
                        fontSize: 11,
                        color: "#8a8f9a",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                    }}
                >
                    {d.kind} connection
                </div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                    {d.label ?? `${edge.source} → ${edge.target}`}
                </div>
                <div style={{ color: "#b7bcc6", marginTop: 2 }}>
                    <code>{edge.source}</code> → <code>{edge.target}</code>
                </div>
            </div>
            {d.complexity && (
                <div>
                    <Badge label={d.complexity} color="#444" />
                </div>
            )}
            {d.payload && (
                <div>
                    <div style={{ fontSize: 11, color: "#8a8f9a" }}>
                        PAYLOAD (sent)
                    </div>
                    <pre style={prePayloadStyle}>{d.payload}</pre>
                </div>
            )}
            {d.response && (
                <div>
                    <div style={{ fontSize: 11, color: "#8a8f9a" }}>
                        RESPONSE (received)
                    </div>
                    <pre style={prePayloadStyle}>{d.response}</pre>
                </div>
            )}
            {d.flow && (
                <button
                    type="button"
                    style={linkBtnStyle}
                    onClick={() => onJumpToFlow(d.flow!)}
                >
                    ▸ highlight flow: {d.flow}
                </button>
            )}
        </div>
    );
}

function Inspector({
    inspected,
    nodes,
    edges,
    onClose,
    onJumpToFlow,
    activeFlow,
}: {
    inspected: Inspected;
    nodes: BoxNode[];
    edges: Edge<DiagramEdgeExtras>[];
    onClose: () => void;
    onJumpToFlow: (flowId: string | null) => void;
    activeFlow: string | null;
}) {
    let body: React.ReactNode = (
        <div style={{ color: "#9aa0a6", fontSize: 13, lineHeight: 1.5 }}>
            <p>
                Click any <b>node</b> or <b>edge</b> to see its full details,
                complexity analysis, payload shape, and source reference.
            </p>
            <p>
                Use the <b>flow selector</b> above the canvas to highlight one
                flow at a time — everything else dims so you can trace the exact
                interaction from UI to canister to data structure.
            </p>
            <p style={{ marginTop: 16 }}>
                <b>Legend</b>
            </p>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
                <li>
                    <span style={{ color: EDGE_COLORS.trigger }}>●</span>{" "}
                    trigger (UI / timer → flow)
                </li>
                <li>
                    <span style={{ color: EDGE_COLORS.call }}>●</span> canister
                    call (carries payload &amp; response)
                </li>
                <li>
                    <span style={{ color: EDGE_COLORS.chain }}>●</span> in-app
                    chain (one flow triggering another)
                </li>
                <li>
                    <span style={{ color: EDGE_COLORS.read }}>●</span> data
                    read (from global <code>var</code>)
                </li>
                <li>
                    <span style={{ color: EDGE_COLORS.write }}>●</span> data
                    write (to global <code>var</code>)
                </li>
            </ul>
            <p style={{ marginTop: 16, fontSize: 12 }}>
                The <b>◨</b> marker on a wire means it carries a payload — hover
                the label for a quick tooltip or click the edge for the full
                request/response types.
            </p>
        </div>
    );

    if (inspected?.kind === "node") {
        const node = nodes.find((n) => n.id === inspected.id);
        if (node)
            body = <NodeDetails node={node} onJumpToFlow={onJumpToFlow} />;
    } else if (inspected?.kind === "edge") {
        const edge = edges.find((e) => e.id === inspected.id);
        if (edge)
            body = <EdgeDetails edge={edge} onJumpToFlow={onJumpToFlow} />;
    }

    return (
        <aside
            style={{
                width: 340,
                minWidth: 340,
                background: "#1f2430",
                borderLeft: "1px solid #2a2e39",
                color: "#e6e6e6",
                padding: 16,
                overflowY: "auto",
                fontSize: 13,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 12,
                }}
            >
                <h3 style={{ margin: 0, fontSize: 14 }}>Inspector</h3>
                <div style={{ display: "flex", gap: 6 }}>
                    {activeFlow && (
                        <button
                            type="button"
                            onClick={() => onJumpToFlow(null)}
                            style={linkBtnStyle}
                        >
                            Clear flow
                        </button>
                    )}
                    {inspected && (
                        <button
                            type="button"
                            onClick={onClose}
                            style={linkBtnStyle}
                        >
                            Close
                        </button>
                    )}
                </div>
            </div>
            {body}
        </aside>
    );
}

// ---------------------------------------------------------------------------
// Layout — build nodes & edges once
// ---------------------------------------------------------------------------

interface Layout {
    nodes: AnyNode[];
    edges: Edge<DiagramEdgeExtras>[];
}

const COL = {
    ui: { x: 20, width: 280 },
    timers: { x: 20, width: 280 },
    flows: { x: 360, width: 400 },
    canisters: { x: 820, width: 400 },
    data: { x: 1260, width: 340 },
};

function buildLayout(): Layout {
    const nodes: AnyNode[] = [];
    const edges: Edge<DiagramEdgeExtras>[] = [];

    // ---- UI triggers group
    const uiHeight = 60 + UI_TRIGGERS.length * 64 + 16;
    nodes.push({
        id: "group-ui",
        type: "groupbox",
        position: { x: COL.ui.x, y: 20 },
        data: { title: "UI triggers", subtitle: "React components" },
        style: { width: COL.ui.width, height: uiHeight, zIndex: -1 },
        selectable: false,
        draggable: false,
    });
    UI_TRIGGERS.forEach((ui, i) => {
        nodes.push({
            id: ui.id,
            type: "box",
            parentId: "group-ui",
            extent: "parent",
            position: { x: 14, y: 36 + i * 64 },
            data: {
                title: ui.title,
                subtitle: ui.subtitle,
                kindLabel: "ui trigger",
                variant: "ui",
                source: ui.source,
                flows: ui.flows,
            },
        });
    });

    // ---- Timers group
    const timersY = 20 + uiHeight + 24;
    const timersHeight = 60 + TIMERS.length * 74 + 16;
    nodes.push({
        id: "group-timers",
        type: "groupbox",
        position: { x: COL.timers.x, y: timersY },
        data: {
            title: "Timers / scheduled",
            subtitle: "setInterval / setTimeout",
        },
        style: { width: COL.timers.width, height: timersHeight, zIndex: -1 },
        selectable: false,
        draggable: false,
    });
    TIMERS.forEach((t, i) => {
        nodes.push({
            id: t.id,
            type: "box",
            parentId: "group-timers",
            extent: "parent",
            position: { x: 14, y: 36 + i * 74 },
            data: {
                title: t.title,
                subtitle: t.subtitle,
                kindLabel: "timer",
                variant: "timer",
                source: t.source,
                flows: t.flows,
            },
        });
    });

    // ---- Flows group
    const flowsHeight = 60 + FLOW_NODES.length * 100 + 16;
    nodes.push({
        id: "group-flows",
        type: "groupbox",
        position: { x: COL.flows.x, y: 20 },
        data: {
            title: "Flows",
            subtitle: "complexity · steps · scaling (click ▶ to expand)",
        },
        style: { width: COL.flows.width, height: flowsHeight, zIndex: -1 },
        selectable: false,
        draggable: false,
    });
    FLOW_NODES.forEach((f, i) => {
        nodes.push({
            id: f.id,
            type: "box",
            parentId: "group-flows",
            extent: "parent",
            position: { x: 14, y: 36 + i * 100 },
            data: {
                title: f.title,
                subtitle: f.subtitle,
                kindLabel: "flow",
                variant: "flow",
                complexity: f.complexity,
                overallComplexity: f.overallComplexity,
                severity: f.complexitySeverity,
                details: f.details,
                source: f.source,
                flows: f.flows,
            },
        });
    });

    // ---- Canisters column: users, messages, II, management stacked
    let canisterY = 20;
    for (const c of CANISTERS) {
        const eps = ENDPOINTS.filter((e) => e.parentId === c.id);
        const rowH = 116;
        const h = 60 + Math.max(1, eps.length) * rowH + 16;
        nodes.push({
            id: c.id,
            type: "groupbox",
            position: { x: COL.canisters.x, y: canisterY },
            data: { title: c.title, subtitle: c.subtitle },
            style: { width: COL.canisters.width, height: h, zIndex: -1 },
            selectable: false,
            draggable: false,
        });
        if (eps.length === 0) {
            nodes.push({
                id: `${c.id}-note`,
                type: "box",
                parentId: c.id,
                extent: "parent",
                position: { x: 14, y: 36 },
                data: {
                    title: c.external
                        ? "Delegation issuer"
                        : "Deploy-time only",
                    subtitle: c.subtitle,
                    kindLabel: c.external ? "external" : "canister",
                    variant: "external",
                    details: c.external
                        ? [
                            "Provides II delegation chains during login.",
                            "Not called by the app at runtime beyond sign-in.",
                        ]
                        : [
                            "Orchestrates wasm upload + install/upgrade for the other canisters.",
                            "Invoked from CI via scripts/deploy-via-management.mjs.",
                            "Not reachable from the end-user UI.",
                        ],
                    source: c.source,
                },
            });
        }
        eps.forEach((ep, i) => {
            nodes.push({
                id: ep.id,
                type: "box",
                parentId: c.id,
                extent: "parent",
                position: { x: 14, y: 36 + i * rowH },
                data: {
                    title: ep.title,
                    subtitle: ep.subtitle,
                    kindLabel: "endpoint",
                    variant: "endpoint",
                    complexity: ep.complexity,
                    severity: ep.severity,
                    details: ep.details,
                    source: ep.source,
                    flows: ep.flows,
                },
            });
        });
        canisterY += h + 24;
    }

    // ---- Data structures column (grouped by canister)
    let dataY = 20;
    const dataByCanister = new Map<string, typeof DATA_STRUCTS>();
    for (const d of DATA_STRUCTS) {
        const arr = dataByCanister.get(d.parentId) ?? [];
        arr.push(d);
        dataByCanister.set(d.parentId, arr);
    }
    for (const [canId, structs] of dataByCanister.entries()) {
        const can = CANISTERS.find((c) => c.id === canId);
        const rowH = 128;
        const h = 60 + structs.length * rowH + 16;
        const groupId = `data-group-${canId}`;
        nodes.push({
            id: groupId,
            type: "groupbox",
            position: { x: COL.data.x, y: dataY },
            data: {
                title: `${can?.title ?? canId} · state`,
                subtitle: "persistent var fields",
            },
            style: { width: COL.data.width, height: h, zIndex: -1 },
            selectable: false,
            draggable: false,
        });
        structs.forEach((d, i) => {
            nodes.push({
                id: d.id,
                type: "box",
                parentId: groupId,
                extent: "parent",
                position: { x: 14, y: 36 + i * rowH },
                data: {
                    title: d.title,
                    kindLabel: "data structure",
                    variant: "data",
                    complexity: d.complexity,
                    severity: d.severity,
                    type: d.type,
                    details: d.details,
                    source: d.source,
                },
            });
        });
        dataY += h + 24;
    }

    // ---- Edges
    for (const e of EDGES) {
        edges.push({
            id: e.id,
            source: e.source,
            target: e.target,
            type: "payload",
            data: {
                kind: e.kind,
                label: e.label,
                payload: e.payload,
                response: e.response,
                complexity: e.complexity,
                flow: e.flow,
            },
            animated: e.animated,
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: EDGE_COLORS[e.kind] ?? "#666",
                width: 18,
                height: 18,
            },
        });
    }

    return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Flow highlighting
// ---------------------------------------------------------------------------

function computeHighlight(
    flowId: string | null,
    nodes: AnyNode[],
    edges: Edge<DiagramEdgeExtras>[],
): { nodeIds: Set<string>; edgeIds: Set<string> } {
    if (!flowId) {
        return {
            nodeIds: new Set(nodes.map((n) => n.id)),
            edgeIds: new Set(edges.map((e) => e.id)),
        };
    }
    const edgeIds = new Set<string>();
    const nodeIds = new Set<string>();

    // 1. All edges tagged with this flow.
    for (const e of edges) {
        if (e.data?.flow === flowId) {
            edgeIds.add(e.id);
            nodeIds.add(e.source);
            nodeIds.add(e.target);
        }
    }
    // 2. Pull in data-read/write edges of any endpoint reached by the flow.
    let grew = true;
    while (grew) {
        grew = false;
        for (const e of edges) {
            if (edgeIds.has(e.id)) continue;
            const dataEdge =
                e.data?.kind === "read" || e.data?.kind === "write";
            if (dataEdge && nodeIds.has(e.source)) {
                edgeIds.add(e.id);
                nodeIds.add(e.target);
                grew = true;
            }
        }
    }
    // 3. Keep parent groups lit when any child is lit.
    for (const n of nodes) {
        if (n.type === "groupbox") {
            const anyChild = nodes.some(
                (c) =>
                    (c as BoxNode).parentId === n.id && nodeIds.has(c.id),
            );
            if (anyChild) nodeIds.add(n.id);
        }
    }
    return { nodeIds, edgeIds };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const nodeTypes = { box: BoxNodeView, groupbox: GroupNodeView };
const edgeTypes = { payload: PayloadEdge };

export default function DiagramView() {
    const initial = useRef<Layout | null>(null);
    if (!initial.current) initial.current = buildLayout();

    const [nodes, setNodes] = useState<AnyNode[]>(initial.current.nodes);
    const [edges, setEdges] = useState<Edge<DiagramEdgeExtras>[]>(
        initial.current.edges,
    );
    const [inspected, setInspected] = useState<Inspected>(null);
    const [activeFlow, setActiveFlow] = useState<string | null>(null);

    const onNodesChange: OnNodesChange<AnyNode> = useCallback(
        (changes) => setNodes((n) => applyNodeChanges(changes, n)),
        [],
    );
    const onEdgesChange: OnEdgesChange<Edge<DiagramEdgeExtras>> = useCallback(
        (changes) => setEdges((e) => applyEdgeChanges(changes, e)),
        [],
    );

    const { nodeIds, edgeIds } = useMemo(
        () => computeHighlight(activeFlow, nodes, edges),
        [activeFlow, nodes, edges],
    );

    const displayNodes = useMemo(
        () =>
            nodes.map((n) => {
                if (n.type !== "box") return n;
                const b = n as BoxNode;
                return {
                    ...b,
                    data: { ...b.data, dim: !nodeIds.has(b.id) },
                };
            }),
        [nodes, nodeIds],
    );

    const displayEdges = useMemo(
        () =>
            edges.map((e) => ({
                ...e,
                data: {
                    ...(e.data ?? { kind: "data" as const }),
                    dim: !edgeIds.has(e.id),
                },
            })),
        [edges, edgeIds],
    );

    return (
        <section
            style={{
                width: "100%",
                height: "100%",
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                background: "#1a1d25",
            }}
        >
            <div
                style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    padding: "10px 14px",
                    borderBottom: "1px solid #2a2e39",
                    color: "#c5c8cf",
                    flexWrap: "wrap",
                }}
            >
                <span style={{ fontWeight: 700 }}>Flow:</span>
                <select
                    value={activeFlow ?? ""}
                    onChange={(e) => setActiveFlow(e.target.value || null)}
                    style={{
                        background: "#1f2430",
                        color: "#e6e6e6",
                        border: "1px solid #3a3f4b",
                        borderRadius: 6,
                        padding: "4px 8px",
                        fontSize: 13,
                    }}
                >
                    <option value="">All flows</option>
                    {FLOWS.map((f) => (
                        <option key={f.id} value={f.id}>
                            {f.title}
                        </option>
                    ))}
                </select>
                <span style={{ fontSize: 12, color: "#8a8f9a" }}>
                    Every flow, complexity, and payload shown here is grounded
                    in the actual React + Motoko sources.
                </span>
            </div>
            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <ReactFlow
                        nodes={displayNodes}
                        edges={displayEdges}
                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onNodeClick={(_, node) =>
                            node.type === "box"
                                ? setInspected({ kind: "node", id: node.id })
                                : undefined
                        }
                        onEdgeClick={(_, edge) =>
                            setInspected({ kind: "edge", id: edge.id })
                        }
                        onPaneClick={() => setInspected(null)}
                        minZoom={0.2}
                        maxZoom={1.5}
                        fitView
                        fitViewOptions={{ padding: 0.1 }}
                        proOptions={{ hideAttribution: true }}
                    >
                        <Background gap={24} color="#2a2e39" />
                        <MiniMap
                            pannable
                            zoomable
                            maskColor="rgba(15,17,21,0.7)"
                            style={{ background: "#14171f" }}
                        />
                        <Controls showInteractive={false} />
                    </ReactFlow>
                </div>
                <Inspector
                    inspected={inspected}
                    nodes={displayNodes.filter(
                        (n): n is BoxNode => n.type === "box",
                    )}
                    edges={displayEdges}
                    onClose={() => setInspected(null)}
                    onJumpToFlow={setActiveFlow}
                    activeFlow={activeFlow}
                />
            </div>
        </section>
    );
}
