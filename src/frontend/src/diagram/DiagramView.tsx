import { useCallback, useState } from "react";
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    MarkerType,
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    Handle,
    Position,
    type Node,
    type Edge,
    type NodeProps,
    type OnConnect,
    type OnEdgesChange,
    type OnNodesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type BoxData = {
    title: string;
    details?: string;
    expandable?: boolean;
};

type BoxNode = Node<BoxData, "box">;

function ExpandableBox({ data }: NodeProps<BoxNode>) {
    const [open, setOpen] = useState(false);
    const canExpand = Boolean(data.expandable && data.details);

    return (
        <div
            style={{
                border: "1px solid #888",
                borderRadius: 6,
                background: "white",
                padding: 10,
                minWidth: 180,
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                fontSize: 14,
            }}
        >
            <Handle type="target" position={Position.Left} />
            <div
                onClick={() => canExpand && setOpen((v) => !v)}
                style={{
                    cursor: canExpand ? "pointer" : "default",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                }}
            >
                {canExpand && <span>{open ? "▼" : "▶"}</span>}
                <span>{data.title}</span>
            </div>
            {canExpand && open && (
                <div
                    style={{
                        marginTop: 8,
                        fontSize: 12,
                        color: "#444",
                        lineHeight: 1.4,
                    }}
                >
                    {data.details}
                </div>
            )}
            <Handle type="source" position={Position.Right} />
        </div>
    );
}

const nodeTypes = { box: ExpandableBox };

const initialNodes: BoxNode[] = [
    {
        id: "1",
        type: "box",
        position: { x: 40, y: 80 },
        data: { title: "Alpha" },
    },
    {
        id: "2",
        type: "box",
        position: { x: 340, y: 80 },
        data: {
            title: "Beta",
            expandable: true,
            details:
                "Beta handles the downstream processing. Click the header to collapse this description.",
        },
    },
];

const initialEdges: Edge[] = [
    {
        id: "e1-2",
        source: "1",
        target: "2",
        markerEnd: { type: MarkerType.ArrowClosed },
    },
];

export default function DiagramView() {
    const [nodes, setNodes] = useState<BoxNode[]>(initialNodes);
    const [edges, setEdges] = useState<Edge[]>(initialEdges);

    const onNodesChange: OnNodesChange<BoxNode> = useCallback(
        (changes) => setNodes((n) => applyNodeChanges(changes, n)),
        [],
    );
    const onEdgesChange: OnEdgesChange = useCallback(
        (changes) => setEdges((e) => applyEdgeChanges(changes, e)),
        [],
    );
    const onConnect: OnConnect = useCallback(
        (conn) =>
            setEdges((e) =>
                addEdge(
                    { ...conn, markerEnd: { type: MarkerType.ArrowClosed } },
                    e,
                ),
            ),
        [],
    );

    return (
        <section style={{ width: "100%", height: "100%", minWidth: 0, background: "#1a1d25" }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                fitView
            >
                <Background />
                <MiniMap pannable zoomable />
                <Controls />
            </ReactFlow>
        </section>
    );
}
