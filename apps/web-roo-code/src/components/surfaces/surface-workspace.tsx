"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ReactFlow, {
	Background,
	Connection,
	Edge,
	MiniMap,
	Node,
	ReactFlowProvider,
	addEdge,
	useEdgesState,
	useNodesState,
} from "reactflow"

import type { EndlessSurfaceEdge, EndlessSurfaceNode, EndlessSurfaceRecord } from "@roo-code/types"

import { cn } from "@/lib/utils"

import "reactflow/dist/style.css"

interface SurfaceWorkspaceProps {
	surface: EndlessSurfaceRecord
}

type Snapshot = {
	nodes: Node[]
	edges: Edge[]
}

const structuredCloneFallback = <T,>(value: T): T => {
	if (typeof structuredClone === "function") {
		return structuredClone(value)
	}
	return JSON.parse(JSON.stringify(value)) as T
}

const createSnapshot = (nodes: Node[], edges: Edge[]): Snapshot => ({
	nodes: structuredCloneFallback(nodes),
	edges: structuredCloneFallback(edges),
})

const snapshotsEqual = (a: Snapshot | undefined, b: Snapshot) => {
	if (!a) {
		return false
	}
	return JSON.stringify(a) === JSON.stringify(b)
}

function SurfaceWorkspaceInner({ surface }: SurfaceWorkspaceProps) {
	const initialNodes = useMemo(() => convertNodes(surface.data.nodes), [surface.data.nodes])
	const initialEdges = useMemo(() => convertEdges(surface.data.edges), [surface.data.edges])

	const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
	const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
	const [isSidebarOpen, setIsSidebarOpen] = useState(false)
	const [zoom, setZoom] = useState(surface.data.viewport.zoom ?? 1)

	const historyRef = useRef<Snapshot[]>([createSnapshot(initialNodes, initialEdges)])
	const [historyIndex, setHistoryIndex] = useState(0)
	const nodesRef = useRef(nodes)
	const edgesRef = useRef(edges)

	useEffect(() => {
		setNodes(initialNodes)
		setEdges(initialEdges)
		nodesRef.current = initialNodes
		edgesRef.current = initialEdges
		historyRef.current = [createSnapshot(initialNodes, initialEdges)]
		setHistoryIndex(0)
		setZoom(surface.data.viewport.zoom ?? 1)
		setIsSidebarOpen(false)
	}, [initialEdges, initialNodes, setEdges, setNodes, surface.data.viewport.zoom])

	const pushHistory = useCallback(
		(nextNodes: Node[], nextEdges: Edge[]) => {
			const candidate = createSnapshot(nextNodes, nextEdges)
			historyRef.current = historyRef.current.slice(0, historyIndex + 1)
			const last = historyRef.current.at(-1)
			if (snapshotsEqual(last, candidate)) {
				return
			}
			historyRef.current.push(candidate)
			setHistoryIndex(historyRef.current.length - 1)
		},
		[historyIndex],
	)

	const handleNodesChange = useCallback(
		(changes: Parameters<typeof onNodesChange>[0]) => {
			setNodes((prev) => {
				const next = onNodesChange(changes, prev)
				nodesRef.current = next
				pushHistory(next, edgesRef.current)
				return next
			})
		},
		[onNodesChange, pushHistory, setNodes],
	)

	const handleEdgesChange = useCallback(
		(changes: Parameters<typeof onEdgesChange>[0]) => {
			setEdges((prev) => {
				const next = onEdgesChange(changes, prev)
				edgesRef.current = next
				pushHistory(nodesRef.current, next)
				return next
			})
		},
		[onEdgesChange, pushHistory, setEdges],
	)

	const handleConnect = useCallback(
		(connection: Connection) => {
			setEdges((prev) => {
				const next = addEdge(connection, prev)
				edgesRef.current = next
				pushHistory(nodesRef.current, next)
				return next
			})
		},
		[pushHistory, setEdges],
	)

	const handleUndo = useCallback(() => {
		setHistoryIndex((current) => {
			if (current <= 0) {
				return current
			}
			const nextIndex = current - 1
			const snapshot = historyRef.current[nextIndex]
			if (snapshot) {
				setNodes(snapshot.nodes)
				setEdges(snapshot.edges)
				nodesRef.current = snapshot.nodes
				edgesRef.current = snapshot.edges
			}
			return nextIndex
		})
	}, [setEdges, setNodes])

	const handleRedo = useCallback(() => {
		setHistoryIndex((current) => {
			if (current >= historyRef.current.length - 1) {
				return current
			}
			const nextIndex = current + 1
			const snapshot = historyRef.current[nextIndex]
			if (snapshot) {
				setNodes(snapshot.nodes)
				setEdges(snapshot.edges)
				nodesRef.current = snapshot.nodes
				edgesRef.current = snapshot.edges
			}
			return nextIndex
		})
	}, [setEdges, setNodes])

	const canUndo = historyIndex > 0
	const canRedo = historyIndex < historyRef.current.length - 1
	const zoomPercent = Math.round(zoom * 100)

	return (
		<div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
			<aside
				className={cn(
					"relative z-10 flex h-full flex-col border-r border-border bg-muted/30 transition-[max-width] duration-200",
					isSidebarOpen ? "max-w-xs w-72" : "max-w-0 w-0",
				)}>
				{isSidebarOpen && (
					<div className="flex h-full flex-col">
						<header className="flex items-center justify-between border-b border-border px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground">
							<span>Surface Library</span>
							<button
								type="button"
								onClick={() => setIsSidebarOpen(false)}
								className="rounded-md px-2 py-1 text-muted-foreground transition hover:bg-accent hover:text-foreground">
								Close
							</button>
						</header>
						<div className="flex-1 overflow-y-auto px-4 py-3 text-sm">
							<p className="mb-4 text-muted-foreground">
								{surface.meta.description ?? "Explore nodes and edges for quick context."}
							</p>
							<section className="space-y-3">
								<h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Nodes
								</h2>
								<ul className="space-y-2">
									{surface.data.nodes.map((node) => (
										<li
											key={node.id}
											className="rounded-md border border-border/60 bg-background/60 px-3 py-2">
											<div className="flex items-center justify-between text-xs text-muted-foreground">
												<span className="font-medium text-foreground">
													{node.data?.title ?? node.type}
												</span>
												<span>{node.type}</span>
											</div>
											{node.data?.plainText && (
												<p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
													{node.data.plainText}
												</p>
											)}
										</li>
									))}
								</ul>
							</section>
						</div>
					</div>
				)}
			</aside>
			<div className="flex min-w-0 flex-1 flex-col">
				<header className="flex items-center justify-between border-b border-border/60 bg-background/95 px-6 py-4">
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={() => setIsSidebarOpen((value) => !value)}
							className="rounded-md border border-border/50 px-3 py-1 text-sm font-medium transition hover:border-border hover:bg-accent/30">
							{isSidebarOpen ? "Hide Library" : "Show Library"}
						</button>
						<h1 className="truncate text-lg font-semibold">{surface.meta.title}</h1>
					</div>
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<button
							type="button"
							className="rounded-md border border-border/60 px-3 py-1 transition hover:border-border hover:text-foreground">
							Settings
						</button>
						<button
							type="button"
							onClick={handleUndo}
							disabled={!canUndo}
							className={cn(
								"rounded-md border border-border/60 px-3 py-1 transition",
								canUndo ? "hover:border-border hover:text-foreground" : "opacity-50 cursor-not-allowed",
							)}>
							Undo
						</button>
						<button
							type="button"
							onClick={handleRedo}
							disabled={!canRedo}
							className={cn(
								"rounded-md border border-border/60 px-3 py-1 transition",
								canRedo ? "hover:border-border hover:text-foreground" : "opacity-50 cursor-not-allowed",
							)}>
							Redo
						</button>
						<div className="rounded-md border border-border/60 px-3 py-1 font-medium text-foreground">
							{zoomPercent}%
						</div>
					</div>
				</header>
				<div className="relative flex min-h-0 flex-1">
					<ReactFlow
						nodes={nodes}
						edges={edges}
						onNodesChange={handleNodesChange}
						onEdgesChange={handleEdgesChange}
						onConnect={handleConnect}
						defaultViewport={surface.data.viewport}
						fitView
						minZoom={0.1}
						maxZoom={2.5}
						onMoveEnd={(_, viewport) => setZoom(viewport.zoom)}
						className="bg-muted/20">
						<Background
							variant={surface.data.background === "lines" ? "lines" : "dots"}
							gap={surface.data.settings.gridSize ?? 16}
							color="rgba(128,128,128,0.2)"
						/>
						<MiniMap pannable zoomable className="!bg-muted/40" />
					</ReactFlow>
				</div>
			</div>
		</div>
	)
}

function convertNodes(nodes: EndlessSurfaceNode[]): Node[] {
	return nodes.map((node) => ({
		id: node.id,
		type: node.type,
		position: node.position,
		data: node.data,
		draggable: node.draggable ?? true,
		selectable: node.selectable ?? true,
	}))
}

function convertEdges(edges: EndlessSurfaceEdge[]): Edge[] {
	return edges.map((edge) => ({
		id: edge.id,
		source: edge.source,
		target: edge.target,
		sourceHandle: edge.sourceHandle,
		targetHandle: edge.targetHandle,
		label: edge.label,
		animated: edge.type === "mindMap",
		type: edge.type ?? "default",
	}))
}

export default function SurfaceWorkspace(props: SurfaceWorkspaceProps) {
	return (
		<ReactFlowProvider>
			<SurfaceWorkspaceInner {...props} />
		</ReactFlowProvider>
	)
}
