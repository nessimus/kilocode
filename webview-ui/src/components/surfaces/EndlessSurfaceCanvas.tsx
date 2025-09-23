import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import ReactFlow, {
	Background,
	Controls,
	MiniMap,
	BaseEdge,
	Edge,
	Connection,
	Position,
	useEdgesState,
	useNodesState,
	addEdge,
	getSmoothStepPath,
	type EdgeProps,
	type Node as FlowNode,
	type NodeProps,
	type ReactFlowInstance,
	type XYPosition,
} from "reactflow"
import { NodeResizer } from "@reactflow/node-resizer"
import type { JSONContent } from "@tiptap/core"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import Underline from "@tiptap/extension-underline"
import Link from "@tiptap/extension-link"
import debounce from "debounce"

import type {
	EndlessSurfaceRecord,
	EndlessSurfaceNode,
	EndlessSurfaceEdge,
	EndlessSurfaceViewport,
} from "@roo-code/types"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import "reactflow/dist/style.css"
import "@reactflow/node-resizer/dist/style.css"

interface EndlessSurfaceCanvasProps {
	surface: EndlessSurfaceRecord
	onSurfaceChange: (next: EndlessSurfaceRecord) => void
}

type NodeDataChangeHandler = (nodeId: string, data: Partial<EndlessSurfaceNode["data"]>) => void

type NodeSize = NonNullable<EndlessSurfaceNode["size"]>

type NodeSizeChangeHandler = (nodeId: string, size: NodeSize) => void

type InternalNodeData = EndlessSurfaceNode["data"] & {
	onDataChange: NodeDataChangeHandler
	onSizeChange: NodeSizeChangeHandler
}

type InternalNode = FlowNode<InternalNodeData>

type InternalEdge = Edge & EndlessSurfaceEdge

const nodeTypes = {
	richText: RichTextNode,
	file: FileNode,
	agentTool: AgentToolNode,
	mindMap: MindMapNode,
}

type MindMapNodeData = Extract<EndlessSurfaceNode, { type: "mindMap" }>["data"]

interface MindMapMeta {
	childMap: Map<string, InternalNode[]>
	childCounts: Map<string, number>
	descendantCounts: Map<string, number>
	collapsedIds: Set<string>
	hiddenNodeIds: Set<string>
	rootIds: string[]
}

interface MindMapContextValue {
	addChild: (nodeId: string) => void
	addSibling: (nodeId: string) => void
	toggleCollapse: (nodeId: string) => void
	getChildCount: (nodeId: string) => number
	getDescendantCount: (nodeId: string) => number
	isCollapsed: (nodeId: string) => boolean
	focusNodeId: string | null
	clearFocus: () => void
}

const MindMapContext = React.createContext<MindMapContextValue | null>(null)

const RICH_TEXT_MIN_WIDTH = 240
const RICH_TEXT_MIN_HEIGHT = 120
const RICH_TEXT_DEFAULT_WIDTH = 320
const MIND_MAP_DEFAULT_SPACING = 192
const MIND_MAP_DEFAULT_SIBLING_SPACING = 120
const MIND_MAP_DEFAULT_ROOT_SPACING = 200
const MIND_MAP_DEFAULT_TITLE = "New Idea"

const NODE_LIBRARY_DIMENSIONS = { width: 264, height: 320 }
const NODE_LIBRARY_PADDING = 12

type NodeLibraryEntry = {
	type: EndlessSurfaceNode["type"]
	label: string
	description: string
}

const NODE_LIBRARY_ENTRIES: NodeLibraryEntry[] = [
	{
		type: "richText",
		label: "Rich Text",
		description: "Structured notes with headings, lists, and formatting.",
	},
	{
		type: "mindMap",
		label: "Mind Map",
		description: "Organic bubbles for branching ideas and quick hierarchies.",
	},
	{
		type: "agentTool",
		label: "Agent Tool",
		description: "Trigger an agent workflow and monitor its status inline.",
	},
	{
		type: "file",
		label: "File",
		description: "Pin a file or media asset for quick reference.",
	},
]

const MAX_HISTORY_ENTRIES = 100
const CLIPBOARD_OFFSET = 48

const cloneRecord = (record: EndlessSurfaceRecord): EndlessSurfaceRecord => JSON.parse(JSON.stringify(record))

const cloneNode = (node: EndlessSurfaceNode): EndlessSurfaceNode => JSON.parse(JSON.stringify(node))

const cloneEdge = (edge: EndlessSurfaceEdge): EndlessSurfaceEdge => JSON.parse(JSON.stringify(edge))

const generateId = (prefix: string) => {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return `${prefix}-${crypto.randomUUID()}`
	}
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const createGuid = (prefix: string) => generateId(prefix)

const isEditableElement = (target: EventTarget | null): boolean => {
	if (!(target instanceof HTMLElement)) {
		return false
	}
	if (target.isContentEditable) {
		return true
	}
	if (target.closest("[contenteditable='true']")) {
		return true
	}
	const tag = target.tagName
	if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
		return true
	}
	const role = target.getAttribute("role")
	return role === "textbox"
}

interface NodeLibraryState {
	open: boolean
	position: XYPosition
	flowPosition: XYPosition
}

export const EndlessSurfaceCanvas: React.FC<EndlessSurfaceCanvasProps> = ({ surface, onSurfaceChange }) => {
	const reactFlowWrapperRef = useRef<HTMLDivElement>(null)
	const reactFlowInstanceRef = useRef<ReactFlowInstance<InternalNodeData, InternalEdge> | null>(null)
	const [draft, setDraft] = useState<EndlessSurfaceRecord>(surface)
	const [nodes, setNodes, onNodesChange] = useNodesState<InternalNode>(
		convertNodes(surface.data.nodes, handleNodeDataChange, handleNodeSizeChange),
	)
	const [edges, setEdges, onEdgesChange] = useEdgesState<InternalEdge>(convertEdges(surface.data.edges))
	const nodesRef = useRef<InternalNode[]>(nodes)
	const edgesRef = useRef<InternalEdge[]>(edges)
	const draftRef = useRef<EndlessSurfaceRecord>(surface)
	const undoStackRef = useRef<EndlessSurfaceRecord[]>([])
	const redoStackRef = useRef<EndlessSurfaceRecord[]>([])
	const clipboardRef = useRef<{ nodes: EndlessSurfaceNode[]; edges: EndlessSurfaceEdge[] } | null>(null)
	const [selection, setSelection] = useState<{ nodeIds: string[]; edgeIds: string[] }>({ nodeIds: [], edgeIds: [] })
	const [isSpacePressed, setIsSpacePressed] = useState(false)
	const [focusNodeId, setFocusNodeId] = useState<string | null>(null)
	const [nodeLibraryState, setNodeLibraryState] = useState<NodeLibraryState>({
		open: false,
		position: { x: 0, y: 0 },
		flowPosition: { x: 0, y: 0 },
	})
	const [nodeLibrarySearch, setNodeLibrarySearch] = useState("")
	const nodeLibraryRef = useRef<HTMLDivElement>(null)
	const nodeLibraryInputRef = useRef<HTMLInputElement>(null)
	const edgeTypes = useMemo(() => ({ mindMap: MindMapEdge }), [])

	useEffect(() => {
		nodesRef.current = nodes
	}, [nodes])

	useEffect(() => {
		edgesRef.current = edges
	}, [edges])

	useEffect(() => {
		draftRef.current = draft
	}, [draft])

	const filteredNodeLibraryEntries = useMemo(() => {
		const query = nodeLibrarySearch.trim().toLowerCase()
		if (!query) {
			return NODE_LIBRARY_ENTRIES
		}
		return NODE_LIBRARY_ENTRIES.filter((entry) => {
			const haystack = `${entry.label} ${entry.type} ${entry.description}`.toLowerCase()
			return haystack.includes(query)
		})
	}, [nodeLibrarySearch])

	const closeNodeLibrary = useCallback(() => {
		setNodeLibraryState((prev) => (prev.open ? { ...prev, open: false } : prev))
		setNodeLibrarySearch("")
	}, [])

	const openNodeLibrary = useCallback((position: XYPosition, flowPosition: XYPosition) => {
		setNodeLibrarySearch("")
		setNodeLibraryState({ open: true, position, flowPosition })
	}, [])

	useEffect(() => {
		if (!nodeLibraryState.open) {
			return
		}
		const focusTimer = window.setTimeout(() => {
			nodeLibraryInputRef.current?.focus()
			nodeLibraryInputRef.current?.select()
		}, 0)
		return () => window.clearTimeout(focusTimer)
	}, [nodeLibraryState.open])

	useEffect(() => {
		if (!nodeLibraryState.open) {
			return
		}
		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target
			if (target instanceof Node && nodeLibraryRef.current?.contains(target)) {
				return
			}
			closeNodeLibrary()
		}
		document.addEventListener("pointerdown", handlePointerDown)
		return () => document.removeEventListener("pointerdown", handlePointerDown)
	}, [nodeLibraryState.open, closeNodeLibrary])

	useEffect(() => {
		if (!nodeLibraryState.open) {
			return
		}
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				closeNodeLibrary()
			}
		}
		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [nodeLibraryState.open, closeNodeLibrary])

	useEffect(() => {
		closeNodeLibrary()
	}, [surface.meta.id, closeNodeLibrary])
	const debouncedPersist = useMemo(
		() =>
			debounce((next: EndlessSurfaceRecord) => {
				onSurfaceChange(next)
			}, 350),
		[onSurfaceChange],
	)

	useEffect(() => () => debouncedPersist.clear(), [debouncedPersist])

	const persistDraft = useCallback(
		(
			nextNodes: InternalNode[],
			nextEdges: InternalEdge[],
			transform?: (record: EndlessSurfaceRecord) => EndlessSurfaceRecord,
			options?: { skipHistory?: boolean; viewport?: EndlessSurfaceViewport },
		) => {
			setDraft((previous) => {
				const baseRecord: EndlessSurfaceRecord = {
					...previous,
					data: {
						...previous.data,
						nodes: serializeNodes(nextNodes),
						edges: serializeEdges(nextEdges),
						viewport: options?.viewport ?? previous.data.viewport,
					},
					assets: [...previous.assets],
				}
				const updated = transform ? transform(baseRecord) : baseRecord
				nodesRef.current = nextNodes
				edgesRef.current = nextEdges
				draftRef.current = updated
				if (!options?.skipHistory) {
					undoStackRef.current = [...undoStackRef.current, cloneRecord(previous)].slice(-MAX_HISTORY_ENTRIES)
					redoStackRef.current = []
				}
				debouncedPersist(updated)
				return updated
			})
		},
		[debouncedPersist],
	)

	const syncMindMapGraph = useCallback(
		(
			nextNodes: InternalNode[],
			nextEdges: InternalEdge[],
			options?: { selectNodeId?: string; focusNodeId?: string; skipPersist?: boolean },
		) => {
			const meta = computeMindMapMeta(nextNodes)
			const normalizedNodes = applyMindMapNodeVisibility(nextNodes, meta.hiddenNodeIds, options?.selectNodeId)
			const normalizedEdges = applyMindMapEdgeVisibility(nextEdges, meta.hiddenNodeIds)
			nodesRef.current = normalizedNodes
			edgesRef.current = normalizedEdges
			setNodes(normalizedNodes)
			setEdges(normalizedEdges)
			if (!options?.skipPersist) {
				persistDraft(normalizedNodes, normalizedEdges)
			}
			if (options?.focusNodeId) {
				setFocusNodeId(options.focusNodeId)
			}
			return meta
		},
		[persistDraft, setEdges, setNodes],
	)

	useEffect(() => {
		debouncedPersist.clear()
		draftRef.current = surface
		setDraft(surface)
		const initialNodes = convertNodes(surface.data.nodes, handleNodeDataChange, handleNodeSizeChange)
		const initialEdges = convertEdges(surface.data.edges)
		nodesRef.current = initialNodes
		edgesRef.current = initialEdges
		undoStackRef.current = []
		redoStackRef.current = []
		clipboardRef.current = null
		setSelection({ nodeIds: [], edgeIds: [] })
		syncMindMapGraph(initialNodes, initialEdges, { skipPersist: true })
		if (reactFlowInstanceRef.current && surface.data.viewport) {
			reactFlowInstanceRef.current.setViewport(surface.data.viewport, { duration: 0 })
		}
	}, [debouncedPersist, surface, syncMindMapGraph])

	const handleConnect = useCallback(
		(connection: Connection) => {
			const nextEdges = addEdge(connection, edgesRef.current)
			syncMindMapGraph(nodesRef.current, nextEdges)
		},
		[syncMindMapGraph],
	)

	function handleNodeDataChange(nodeId: string, data: Partial<EndlessSurfaceNode["data"]>) {
		const nextNodes = nodesRef.current.map((node) => {
			if (node.id !== nodeId) {
				return node
			}
			return {
				...node,
				data: { ...node.data, ...data },
			}
		})
		syncMindMapGraph(nextNodes, edgesRef.current)
	}

	function handleNodeSizeChange(nodeId: string, size: NodeSize) {
		const nextNodes = nodesRef.current.map((node) => {
			if (node.id !== nodeId) {
				return node
			}
			const targetWidth = node.type === "richText" ? Math.max(size.width, RICH_TEXT_MIN_WIDTH) : size.width
			const targetHeight = node.type === "richText" ? Math.max(size.height, RICH_TEXT_MIN_HEIGHT) : size.height
			const style: React.CSSProperties = {
				...(node.style ?? {}),
				width: targetWidth,
				height: targetHeight,
			}
			if (node.type === "richText") {
				style.minWidth = RICH_TEXT_MIN_WIDTH
				style.minHeight = RICH_TEXT_MIN_HEIGHT
			}
			return {
				...node,
				width: targetWidth,
				height: targetHeight,
				style,
			}
		})
		syncMindMapGraph(nextNodes, edgesRef.current)
	}

	const handleNodesChangeInternal = useCallback(
		(changes: Parameters<typeof onNodesChange>[0]) => {
			const nextNodes = onNodesChange(changes, nodesRef.current)
			syncMindMapGraph(nextNodes, edgesRef.current)
		},
		[onNodesChange, syncMindMapGraph],
	)

	const handleEdgesChangeInternal = useCallback(
		(changes: Parameters<typeof onEdgesChange>[0]) => {
			const nextEdges = onEdgesChange(changes, edgesRef.current)
			syncMindMapGraph(nodesRef.current, nextEdges)
		},
		[onEdgesChange, syncMindMapGraph],
	)

	const applyRecord = useCallback(
		(record: EndlessSurfaceRecord, { persist = true }: { persist?: boolean } = {}) => {
			const nextNodes = convertNodes(record.data.nodes, handleNodeDataChange, handleNodeSizeChange)
			const nextEdges = convertEdges(record.data.edges)
			draftRef.current = record
			setDraft(record)
			syncMindMapGraph(nextNodes, nextEdges, { skipPersist: true })
			if (reactFlowInstanceRef.current && record.data.viewport) {
				reactFlowInstanceRef.current.setViewport(record.data.viewport, { duration: 0 })
			}
			if (persist) {
				debouncedPersist(record)
			}
			setSelection({ nodeIds: [], edgeIds: [] })
		},
		[debouncedPersist, handleNodeDataChange, handleNodeSizeChange, syncMindMapGraph],
	)

	const undo = useCallback(() => {
		const previous = undoStackRef.current.pop()
		if (!previous) {
			return
		}
		redoStackRef.current.push(cloneRecord(draftRef.current))
		applyRecord(previous)
	}, [applyRecord])

	const redo = useCallback(() => {
		const nextRecord = redoStackRef.current.pop()
		if (!nextRecord) {
			return
		}
		undoStackRef.current.push(cloneRecord(draftRef.current))
		applyRecord(nextRecord)
	}, [applyRecord])

	const copySelection = useCallback(() => {
		if (!selection.nodeIds.length) {
			clipboardRef.current = null
			return
		}
		const nodeSet = new Set(selection.nodeIds)
		const record = draftRef.current
		const nodesToCopy = record.data.nodes.filter((node) => nodeSet.has(node.id))
		if (!nodesToCopy.length) {
			clipboardRef.current = null
			return
		}
		const edgesToCopy = record.data.edges.filter((edge) => nodeSet.has(edge.source) && nodeSet.has(edge.target))
		clipboardRef.current = {
			nodes: nodesToCopy.map(cloneNode),
			edges: edgesToCopy.map(cloneEdge),
		}
	}, [selection.nodeIds])

	const pasteClipboard = useCallback(() => {
		const clipboard = clipboardRef.current
		if (!clipboard || clipboard.nodes.length === 0) {
			return
		}
		const idMap = new Map<string, string>()
		const baseNodesData = draftRef.current.data.nodes
		const baseEdgesData = draftRef.current.data.edges
		const offset = CLIPBOARD_OFFSET
		const newNodesData = clipboard.nodes.map((node) => {
			const cloned = cloneNode(node)
			const newId = generateId("node")
			idMap.set(node.id, newId)
			cloned.id = newId
			cloned.position = {
				x: node.position.x + offset,
				y: node.position.y + offset,
			}
			return cloned
		})
		const newEdgesData = clipboard.edges
			.map((edge) => {
				const source = idMap.get(edge.source)
				const target = idMap.get(edge.target)
				if (!source || !target) {
					return null
				}
				const cloned = cloneEdge(edge)
				cloned.id = generateId("edge")
				cloned.source = source
				cloned.target = target
				return cloned
			})
			.filter(Boolean) as EndlessSurfaceEdge[]
		const updatedNodesData = [...baseNodesData, ...newNodesData]
		const updatedEdgesData = [...baseEdgesData, ...newEdgesData]
		const internalNodes = convertNodes(updatedNodesData, handleNodeDataChange, handleNodeSizeChange)
		const internalEdges = convertEdges(updatedEdgesData)
		const newNodeIds = newNodesData.map((node) => node.id)
		const newEdgeIds = newEdgesData.map((edge) => edge.id)
		const selectedNodeSet = new Set(newNodeIds)
		const selectedEdgeSet = new Set(newEdgeIds)
		const nodesWithSelection = internalNodes.map((node) => ({ ...node, selected: selectedNodeSet.has(node.id) }))
		const edgesWithSelection = internalEdges.map((edge) => ({ ...edge, selected: selectedEdgeSet.has(edge.id) }))
		syncMindMapGraph(nodesWithSelection, edgesWithSelection, {
			selectNodeId: newNodeIds.length ? newNodeIds[newNodeIds.length - 1] : undefined,
		})
		setSelection({ nodeIds: newNodeIds, edgeIds: newEdgeIds })
	}, [handleNodeDataChange, handleNodeSizeChange, syncMindMapGraph])

	const duplicateSelection = useCallback(() => {
		if (!selection.nodeIds.length) {
			return
		}
		const record = draftRef.current
		const nodeSet = new Set(selection.nodeIds)
		const nodesToDuplicate = record.data.nodes.filter((node) => nodeSet.has(node.id))
		if (!nodesToDuplicate.length) {
			return
		}
		const edgesToDuplicate = record.data.edges.filter(
			(edge) => nodeSet.has(edge.source) && nodeSet.has(edge.target),
		)
		clipboardRef.current = {
			nodes: nodesToDuplicate.map(cloneNode),
			edges: edgesToDuplicate.map(cloneEdge),
		}
		pasteClipboard()
	}, [selection.nodeIds, pasteClipboard])

	const deleteSelection = useCallback(() => {
		if (!selection.nodeIds.length && !selection.edgeIds.length) {
			return
		}
		const nodeSet = new Set(selection.nodeIds)
		const edgeSet = new Set(selection.edgeIds)
		const record = draftRef.current
		const remainingNodesData = record.data.nodes.filter((node) => !nodeSet.has(node.id))
		const remainingEdgesData = record.data.edges.filter(
			(edge) => !edgeSet.has(edge.id) && !nodeSet.has(edge.source) && !nodeSet.has(edge.target),
		)
		const internalNodes = convertNodes(remainingNodesData, handleNodeDataChange, handleNodeSizeChange)
		const internalEdges = convertEdges(remainingEdgesData)
		syncMindMapGraph(internalNodes, internalEdges)
		setSelection({ nodeIds: [], edgeIds: [] })
	}, [selection, handleNodeDataChange, handleNodeSizeChange, syncMindMapGraph])

	const updateViewport = useCallback(() => {
		const instance = reactFlowInstanceRef.current
		if (!instance) {
			return
		}
		const viewport = instance.getViewport() as EndlessSurfaceViewport
		persistDraft(nodesRef.current, edgesRef.current, undefined, { skipHistory: true, viewport })
	}, [persistDraft])

	const zoomIn = useCallback(() => {
		const instance = reactFlowInstanceRef.current
		if (!instance) {
			return
		}
		instance.zoomIn({ duration: 120 })
		requestAnimationFrame(updateViewport)
	}, [updateViewport])

	const zoomOut = useCallback(() => {
		const instance = reactFlowInstanceRef.current
		if (!instance) {
			return
		}
		instance.zoomOut({ duration: 120 })
		requestAnimationFrame(updateViewport)
	}, [updateViewport])

	const handleMoveEnd = useCallback(() => {
		updateViewport()
	}, [updateViewport])

	const handleSelectionChange = useCallback(
		({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node<InternalNodeData>[]; edges: Edge[] }) => {
			setSelection({
				nodeIds: selectedNodes.map((node) => node.id),
				edgeIds: selectedEdges.map((edge) => edge.id),
			})
		},
		[],
	)

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (isEditableElement(event.target)) {
				return
			}
			if (event.key === " " && !event.repeat) {
				setIsSpacePressed(true)
				event.preventDefault()
				return
			}
			const isMod = event.metaKey || event.ctrlKey
			if (isMod) {
				const key = event.key.toLowerCase()
				switch (key) {
					case "z":
						event.preventDefault()
						if (event.shiftKey) {
							redo()
						} else {
							undo()
						}
						return
					case "y":
						event.preventDefault()
						redo()
						return
					case "c":
						event.preventDefault()
						copySelection()
						return
					case "v":
						event.preventDefault()
						pasteClipboard()
						return
					case "d":
						event.preventDefault()
						duplicateSelection()
						return
					case "=":
					case "+":
					case "add":
						event.preventDefault()
						zoomIn()
						return
					case "-":
					case "subtract":
						event.preventDefault()
						zoomOut()
						return
					default:
						break
				}
			}
			if (!isMod && (event.key === "Delete" || event.key === "Backspace")) {
				event.preventDefault()
				deleteSelection()
			}
		}

		const handleKeyUp = (event: KeyboardEvent) => {
			if (isEditableElement(event.target)) {
				return
			}
			if (event.key === " ") {
				setIsSpacePressed(false)
				event.preventDefault()
			}
		}

		const handleBlur = () => {
			setIsSpacePressed(false)
		}

		window.addEventListener("keydown", handleKeyDown)
		window.addEventListener("keyup", handleKeyUp)
		window.addEventListener("blur", handleBlur)
		return () => {
			window.removeEventListener("keydown", handleKeyDown)
			window.removeEventListener("keyup", handleKeyUp)
			window.removeEventListener("blur", handleBlur)
		}
	}, [copySelection, deleteSelection, duplicateSelection, pasteClipboard, redo, undo, zoomIn, zoomOut])

	const handleAddMindMapChild = useCallback(
		(nodeId: string) => {
			const parentNode = nodesRef.current.find((node) => node.id === nodeId && node.type === "mindMap")
			if (!parentNode) {
				return
			}
			const layout = getMindMapLayoutSettings(draftRef.current)
			const children = nodesRef.current.filter(
				(node) => node.type === "mindMap" && getMindMapParentId(node) === nodeId,
			)
			const position = computeMindMapChildPosition(parentNode, children, layout)
			const newNodeId = createGuid("mindmap-node")
			const nextNodes = nodesRef.current.map((node) => {
				if (node.id !== nodeId || node.type !== "mindMap") {
					return node
				}
				const currentData = node.data as InternalNodeData
				if (!(currentData as MindMapNodeData).collapsed) {
					return node
				}
				return {
					...node,
					data: { ...node.data, collapsed: false },
				}
			})
			const newNode: InternalNode = {
				id: newNodeId,
				type: "mindMap",
				position,
				data: {
					title: "",
					parentId: nodeId,
					collapsed: false,
					onDataChange: handleNodeDataChange,
					onSizeChange: handleNodeSizeChange,
				} as InternalNodeData,
				draggable: true,
				selectable: true,
			}
			const nextEdges: InternalEdge[] = [
				...edgesRef.current,
				{
					id: createGuid("mindmap-edge"),
					source: nodeId,
					target: newNodeId,
					type: "mindMap",
				} as InternalEdge,
			]
			syncMindMapGraph([...nextNodes, newNode], nextEdges, {
				selectNodeId: newNodeId,
				focusNodeId: newNodeId,
			})
		},
		[handleNodeDataChange, handleNodeSizeChange, syncMindMapGraph],
	)

	const handleAddMindMapSibling = useCallback(
		(nodeId: string) => {
			const reference = nodesRef.current.find((node) => node.id === nodeId && node.type === "mindMap")
			if (!reference) {
				return
			}
			const parentId = getMindMapParentId(reference)
			const layout = getMindMapLayoutSettings(draftRef.current)
			const siblings = nodesRef.current.filter(
				(node) => node.type === "mindMap" && node.id !== nodeId && getMindMapParentId(node) === parentId,
			)
			const position = computeMindMapSiblingPosition(reference, siblings, layout, parentId)
			const newNodeId = createGuid("mindmap-node")
			const newNode: InternalNode = {
				id: newNodeId,
				type: "mindMap",
				position,
				data: {
					title: "",
					parentId: parentId,
					collapsed: false,
					onDataChange: handleNodeDataChange,
					onSizeChange: handleNodeSizeChange,
				} as InternalNodeData,
				draggable: true,
				selectable: true,
			}
			const nextNodes = [...nodesRef.current, newNode]
			const nextEdges = parentId
				? [
						...edgesRef.current,
						{
							id: createGuid("mindmap-edge"),
							source: parentId,
							target: newNodeId,
							type: "mindMap",
						} as InternalEdge,
					]
				: edgesRef.current
			syncMindMapGraph(nextNodes, nextEdges, {
				selectNodeId: newNodeId,
				focusNodeId: newNodeId,
			})
		},
		[handleNodeDataChange, handleNodeSizeChange, syncMindMapGraph],
	)

	const handleToggleMindMapCollapse = useCallback(
		(nodeId: string) => {
			const nextNodes = nodesRef.current.map((node) => {
				if (node.id !== nodeId || node.type !== "mindMap") {
					return node
				}
				const currentCollapsed = Boolean((node.data as MindMapNodeData).collapsed)
				return {
					...node,
					data: { ...node.data, collapsed: !currentCollapsed },
				}
			})
			syncMindMapGraph(nextNodes, edgesRef.current)
		},
		[syncMindMapGraph],
	)

	function createNodeAtPosition(type: EndlessSurfaceNode["type"], position: XYPosition) {
		const timestamp = Date.now()
		const defaults = getNodeDefaults(type, timestamp)
		const gridSizeSetting = Math.min(256, Math.max(4, draft.data.settings.gridSize ?? 16))
		const shouldSnap = draft.data.settings.snapToGrid ?? true
		const targetPosition: XYPosition = shouldSnap
			? {
					x: Math.round(position.x / gridSizeSetting) * gridSizeSetting,
					y: Math.round(position.y / gridSizeSetting) * gridSizeSetting,
				}
			: position
		const nodeId = createGuid("node")
		const newNode: InternalNode = {
			id: nodeId,
			type,
			position: targetPosition,
			data: {
				...defaults.data,
				onDataChange: handleNodeDataChange,
				onSizeChange: handleNodeSizeChange,
			},
			draggable: true,
			selectable: true,
			selected: true,
		}
		if (typeof defaults.width === "number") {
			newNode.width = defaults.width
		}
		if (typeof defaults.height === "number") {
			newNode.height = defaults.height
		}
		if (defaults.style) {
			newNode.style = defaults.style
		}

		const nextNodes = [...nodesRef.current, newNode]
		syncMindMapGraph(nextNodes, edgesRef.current, {
			selectNodeId: nodeId,
			focusNodeId: type === "mindMap" ? nodeId : undefined,
		})
		setSelection({ nodeIds: [nodeId], edgeIds: [] })
	}

	const handlePaneContextMenu = useCallback(
		(event: React.MouseEvent) => {
			event.preventDefault()
			if (!reactFlowWrapperRef.current || !reactFlowInstanceRef.current) {
				return
			}
			const bounds = reactFlowWrapperRef.current.getBoundingClientRect()
			const relativeX = event.clientX - bounds.left
			const relativeY = event.clientY - bounds.top
			const flowPosition = reactFlowInstanceRef.current.project({ x: relativeX, y: relativeY })
			const anchorPosition = clampPopoverPosition(relativeX, relativeY + 12, bounds)
			openNodeLibrary(anchorPosition, flowPosition)
		},
		[openNodeLibrary],
	)

	const handlePaneClick = useCallback(() => {
		closeNodeLibrary()
	}, [closeNodeLibrary])

	const handleDragOver = useCallback((event: React.DragEvent) => {
		const types = Array.from(event.dataTransfer.types ?? [])
		if (!types.includes("application/reactflow")) {
			return
		}
		event.preventDefault()
		event.dataTransfer.dropEffect = "move"
	}, [])

	const handleDrop = useCallback(
		(event: React.DragEvent) => {
			if (!reactFlowWrapperRef.current || !reactFlowInstanceRef.current) {
				return
			}
			const bounds = reactFlowWrapperRef.current.getBoundingClientRect()
			const type = event.dataTransfer.getData("application/reactflow") as EndlessSurfaceNode["type"]
			if (!type) {
				return
			}
			event.preventDefault()
			const position = reactFlowInstanceRef.current.project({
				x: event.clientX - bounds.left,
				y: event.clientY - bounds.top,
			})
			createNodeAtPosition(type, position)
			closeNodeLibrary()
		},
		[createNodeAtPosition, closeNodeLibrary],
	)

	const handleNodeTypeSelect = useCallback(
		(type: EndlessSurfaceNode["type"]) => {
			if (!nodeLibraryState.open) {
				return
			}
			createNodeAtPosition(type, nodeLibraryState.flowPosition)
			closeNodeLibrary()
		},
		[nodeLibraryState.open, nodeLibraryState.flowPosition, createNodeAtPosition, closeNodeLibrary],
	)

	const handleNodeTypeDragStart = useCallback(
		(event: React.DragEvent<HTMLButtonElement>, type: EndlessSurfaceNode["type"]) => {
			event.dataTransfer.setData("application/reactflow", type)
			event.dataTransfer.effectAllowed = "move"
		},
		[],
	)

	const handleSearchKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Enter") {
				event.preventDefault()
				const candidate = filteredNodeLibraryEntries[0]
				if (candidate) {
					createNodeAtPosition(candidate.type, nodeLibraryState.flowPosition)
					closeNodeLibrary()
				}
			}
		},
		[filteredNodeLibraryEntries, nodeLibraryState.flowPosition, createNodeAtPosition, closeNodeLibrary],
	)

	useEffect(() => {
		const mode = draftRef.current?.data.autoLayout?.mode ?? draftRef.current?.data.settings.autoLayout ?? "manual"
		if (mode !== "mindmap") {
			return
		}
		const layout = getMindMapLayoutSettings(draftRef.current)
		const mindMapNodes = nodesRef.current.filter((node) => node.type === "mindMap")
		if (mindMapNodes.length === 0) {
			return
		}
		const meta = computeMindMapMeta(nodesRef.current)
		const positions = computeMindMapLayoutPositions(nodesRef.current, meta, layout)
		if (positions.size === 0) {
			return
		}
		const nextNodes = nodesRef.current.map((node) => {
			if (node.type !== "mindMap") {
				return node
			}
			const nextPosition = positions.get(node.id)
			if (!nextPosition) {
				return node
			}
			const current = node.position
			if (Math.abs(current.x - nextPosition.x) < 0.5 && Math.abs(current.y - nextPosition.y) < 0.5) {
				return node
			}
			return { ...node, position: nextPosition }
		})
		const changed = nextNodes.some((node, index) => node !== nodesRef.current[index])
		if (changed) {
			syncMindMapGraph(nextNodes, edgesRef.current)
		}
	}, [draft, nodes, syncMindMapGraph])

	const mindMapMeta = useMemo(() => computeMindMapMeta(nodes), [nodes])
	const clearFocus = useCallback(() => setFocusNodeId(null), [])
	const mindMapContextValue = useMemo<MindMapContextValue>(
		() => ({
			addChild: handleAddMindMapChild,
			addSibling: handleAddMindMapSibling,
			toggleCollapse: handleToggleMindMapCollapse,
			getChildCount: (nodeId) => mindMapMeta.childCounts.get(nodeId) ?? 0,
			getDescendantCount: (nodeId) => mindMapMeta.descendantCounts.get(nodeId) ?? 0,
			isCollapsed: (nodeId) => mindMapMeta.collapsedIds.has(nodeId),
			focusNodeId,
			clearFocus,
		}),
		[
			handleAddMindMapChild,
			handleAddMindMapSibling,
			handleToggleMindMapCollapse,
			mindMapMeta,
			focusNodeId,
			clearFocus,
		],
	)

	const gridSize = Math.min(256, Math.max(4, draft.data.settings.gridSize ?? 16))
	const snapToGrid = draft.data.settings.snapToGrid ?? true
	const showGrid = draft.data.settings.showGrid ?? true
	const showMinimap = draft.data.settings.showMinimap ?? true
	const showControls = draft.data.settings.showControls ?? true
	const backgroundVariant = draft.data.background === "lines" ? "lines" : "dots"
	const gridColor = draft.data.theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(31,41,55,0.12)"
	const themeClass =
		draft.data.theme === "dark"
			? "bg-[color-mix(in_srgb,var(--vscode-editor-background)_82%,rgba(12,16,24,0.9)_18%)] text-[rgba(255,255,255,0.92)]"
			: "bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,rgba(255,255,255,1)_2%)] text-[var(--vscode-foreground)]"
	const minimapClass =
		draft.data.theme === "dark"
			? "!bg-[color-mix(in_srgb,var(--vscode-editor-background)_65%,rgba(14,18,30,0.9)_35%)]"
			: "!bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,rgba(255,255,255,0.9)_4%)]"

	return (
		<MindMapContext.Provider value={mindMapContextValue}>
			<div ref={reactFlowWrapperRef} className="relative flex h-full flex-1 overflow-hidden">
				<ReactFlow
					nodes={nodes}
					edges={edges}
					onNodesChange={handleNodesChangeInternal}
					onEdgesChange={handleEdgesChangeInternal}
					onConnect={handleConnect}
					onPaneContextMenu={handlePaneContextMenu}
					onPaneClick={handlePaneClick}
					onDrop={handleDrop}
					onDragOver={handleDragOver}
					onSelectionChange={handleSelectionChange}
					onInit={(instance) => {
						reactFlowInstanceRef.current = instance
						if (draft.data.viewport) {
							instance.setViewport(draft.data.viewport, { duration: 0 })
						}
					}}
					onMoveEnd={handleMoveEnd}
					selectionOnDrag={false}
					selectionKeyCode="Shift"
					multiSelectionKeyCode={["Shift"]}
					deleteKeyCode={null}
					panOnDrag={isSpacePressed ? [0] : false}
					nodeTypes={nodeTypes}
					edgeTypes={edgeTypes}
					minZoom={0.1}
					maxZoom={2.5}
					defaultViewport={draft.data.viewport}
					fitView
					snapToGrid={snapToGrid}
					snapGrid={[gridSize, gridSize]}
					className={cn("flex-1 transition-colors", themeClass)}>
					{showGrid && (
						<Background gap={gridSize} color={gridColor} variant={backgroundVariant} size={gridSize} />
					)}
					{showControls && (
						<Controls
							showInteractive={false}
							className={cn(
								"bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,rgba(255,255,255,0.08)_8%)] backdrop-blur-sm",
								draft.data.theme === "dark"
									? "!text-[rgba(255,255,255,0.9)]"
									: "!text-[var(--vscode-foreground)]",
							)}
						/>
					)}
					{showMinimap && (
						<MiniMap
							className={cn(
								minimapClass,
								"border border-[color-mix(in_srgb,var(--vscode-panel-border)_85%,transparent_15%)]",
							)}
							pannable
							zoomable
						/>
					)}
				</ReactFlow>
				{nodeLibraryState.open && (
					<div
						ref={nodeLibraryRef}
						className="pointer-events-auto absolute z-20 overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--vscode-editor-foreground)_14%,var(--vscode-editor-background)_86%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,rgba(255,255,255,0.12)_4%)] text-[var(--vscode-foreground)] shadow-xl backdrop-blur"
						style={{
							left: nodeLibraryState.position.x,
							top: nodeLibraryState.position.y,
							width: NODE_LIBRARY_DIMENSIONS.width,
							maxHeight: NODE_LIBRARY_DIMENSIONS.height,
						}}
						onContextMenu={(event) => event.preventDefault()}>
						<div className="flex flex-col gap-2 p-3">
							<input
								ref={nodeLibraryInputRef}
								type="search"
								value={nodeLibrarySearch}
								autoComplete="off"
								onKeyDown={handleSearchKeyDown}
								onChange={(event) => setNodeLibrarySearch(event.target.value)}
								placeholder="Search nodes..."
								className="h-8 rounded-md border border-[color-mix(in_srgb,var(--vscode-editor-foreground)_16%,var(--vscode-editor-background)_84%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,rgba(255,255,255,0.06)_8%)] px-2 text-sm text-[var(--vscode-foreground)] outline-none focus:border-[var(--vscode-focusBorder)] focus:ring-1 focus:ring-[var(--vscode-focusBorder)]"
							/>
							<div className="flex max-h-48 flex-col gap-1 overflow-y-auto pr-1">
								{filteredNodeLibraryEntries.length === 0 ? (
									<div className="px-2 py-4 text-xs text-[var(--vscode-descriptionForeground)]">
										No matching node types
									</div>
								) : (
									filteredNodeLibraryEntries.map((entry) => (
										<button
											key={entry.type}
											type="button"
											draggable
											onDragStart={(event) => handleNodeTypeDragStart(event, entry.type)}
											onClick={() => handleNodeTypeSelect(entry.type)}
											className="flex flex-col gap-1 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,rgba(255,255,255,0.16)_12%)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--vscode-focusBorder)]">
											<span className="font-medium text-[var(--vscode-foreground)]">
												{entry.label}
											</span>
											<span className="text-xs text-[var(--vscode-descriptionForeground)]">
												{entry.description}
											</span>
										</button>
									))
								)}
							</div>
							<div className="text-[0.65rem] uppercase tracking-wide text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent_20%)]">
								Click to insert · drag to drop
							</div>
						</div>
					</div>
				)}
			</div>
		</MindMapContext.Provider>
	)
}

function convertNodes(
	nodes: EndlessSurfaceNode[],
	onDataChange: NodeDataChangeHandler,
	onSizeChange: NodeSizeChangeHandler,
): InternalNode[] {
	return nodes.map((node) => {
		const width = node.size?.width ?? (node.type === "richText" ? RICH_TEXT_DEFAULT_WIDTH : undefined)
		const height = node.size?.height
		const style: React.CSSProperties = {}
		let hasStyle = false
		if (typeof width === "number") {
			style.width = width
			hasStyle = true
		}
		if (typeof height === "number") {
			style.height = height
			hasStyle = true
		}
		if (node.type === "richText") {
			style.minWidth = RICH_TEXT_MIN_WIDTH
			style.minHeight = RICH_TEXT_MIN_HEIGHT
			hasStyle = true
		}
		const internalNode: InternalNode = {
			id: node.id,
			type: node.type,
			position: node.position,
			data: { ...node.data, onDataChange, onSizeChange },
			draggable: node.draggable ?? true,
			selectable: node.selectable ?? true,
			width,
			height,
		}
		if (hasStyle) {
			internalNode.style = style
		}
		return internalNode
	})
}

function convertEdges(edges: EndlessSurfaceEdge[]): InternalEdge[] {
	return edges.map((edge) => ({
		...edge,
		id: edge.id,
		source: edge.source,
		target: edge.target,
	}))
}

function serializeNodes(nodes: InternalNode[]): EndlessSurfaceNode[] {
	return nodes.map((node) => {
		const { onDataChange: _onDataChange, onSizeChange: _onSizeChange, ...data } = node.data as InternalNodeData
		const width =
			typeof node.width === "number"
				? node.width
				: typeof node.style?.width === "number"
					? node.style.width
					: undefined
		const height =
			typeof node.height === "number"
				? node.height
				: typeof node.style?.height === "number"
					? node.style.height
					: typeof (node as any).measured?.height === "number"
						? (node as any).measured.height
						: undefined
		const serialized: EndlessSurfaceNode = {
			id: node.id,
			type: node.type as EndlessSurfaceNode["type"],
			position: node.position,
			data: data as EndlessSurfaceNode["data"],
		}
		if (typeof width === "number" && typeof height === "number") {
			serialized.size = { width, height }
		}
		return serialized
	})
}

function serializeEdges(edges: InternalEdge[]): EndlessSurfaceEdge[] {
	return edges.map((edge) => ({
		id: edge.id,
		source: edge.source,
		target: edge.target,
		sourceHandle: edge.sourceHandle,
		targetHandle: edge.targetHandle,
		type: (edge.type as EndlessSurfaceEdge["type"]) ?? "default",
		label: edge.label,
		data: edge.data,
	}))
}

interface MindMapLayoutConfig {
	orientation: "horizontal" | "vertical"
	levelSpacing: number
	siblingSpacing: number
	rootSpacing: number
}

function getMindMapNodeData(node: InternalNode): MindMapNodeData | null {
	if (node.type !== "mindMap") {
		return null
	}
	return node.data as MindMapNodeData
}

function getMindMapParentId(node: InternalNode): string | undefined {
	const data = getMindMapNodeData(node)
	const parentId = data?.parentId
	if (typeof parentId === "string" && parentId.trim().length > 0) {
		return parentId
	}
	return undefined
}

function computeMindMapMeta(nodes: InternalNode[]): MindMapMeta {
	const childMap = new Map<string, InternalNode[]>()
	const childCounts = new Map<string, number>()
	const descendantCounts = new Map<string, number>()
	const collapsedIds = new Set<string>()
	const hiddenNodeIds = new Set<string>()
	const rootIds: string[] = []

	const mindMapNodes = nodes.filter((node) => node.type === "mindMap")

	for (const node of mindMapNodes) {
		const parentId = getMindMapParentId(node)
		if (parentId) {
			const bucket = childMap.get(parentId)
			if (bucket) {
				bucket.push(node)
			} else {
				childMap.set(parentId, [node])
			}
		} else {
			rootIds.push(node.id)
		}
		const data = getMindMapNodeData(node)
		if (data?.collapsed) {
			collapsedIds.add(node.id)
		}
	}

	childMap.forEach((children, parentId) => {
		childCounts.set(parentId, children.length)
	})

	const markHidden = (nodeId: string) => {
		const children = childMap.get(nodeId)
		if (!children) {
			return
		}
		for (const child of children) {
			if (!hiddenNodeIds.has(child.id)) {
				hiddenNodeIds.add(child.id)
				markHidden(child.id)
			}
		}
	}

	collapsedIds.forEach(markHidden)

	const computeDescendants = (nodeId: string): number => {
		const children = childMap.get(nodeId)
		if (!children || children.length === 0) {
			descendantCounts.set(nodeId, 0)
			return 0
		}
		let total = 0
		for (const child of children) {
			total += 1 + computeDescendants(child.id)
		}
		descendantCounts.set(nodeId, total)
		return total
	}

	for (const node of mindMapNodes) {
		if (!descendantCounts.has(node.id)) {
			computeDescendants(node.id)
		}
	}

	return { childMap, childCounts, descendantCounts, collapsedIds, hiddenNodeIds, rootIds }
}

function applyMindMapNodeVisibility(
	nodes: InternalNode[],
	hiddenNodeIds: Set<string>,
	selectNodeId?: string,
): InternalNode[] {
	let changed = false
	const normalized = nodes.map((node) => {
		const shouldHide = hiddenNodeIds.has(node.id)
		const isSelected = selectNodeId ? node.id === selectNodeId : node.selected
		let nextNode: InternalNode | null = null
		if (node.hidden !== shouldHide) {
			nextNode = { ...node, hidden: shouldHide }
		}
		if (selectNodeId) {
			const nextSelected = node.id === selectNodeId
			if ((nextNode ?? node).selected !== nextSelected) {
				nextNode = { ...(nextNode ?? node), selected: nextSelected }
			}
		}
		if (nextNode) {
			changed = true
			return nextNode
		}
		return node
	})
	return changed ? normalized : nodes
}

function applyMindMapEdgeVisibility(edges: InternalEdge[], hiddenNodeIds: Set<string>): InternalEdge[] {
	let changed = false
	const normalized = edges.map((edge) => {
		const shouldHide = hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target)
		if (edge.hidden === shouldHide) {
			return edge
		}
		changed = true
		return { ...edge, hidden: shouldHide }
	})
	return changed ? normalized : edges
}

function getMindMapLayoutSettings(record?: EndlessSurfaceRecord | null): MindMapLayoutConfig {
	const spacing = record?.data.autoLayout?.spacing ?? MIND_MAP_DEFAULT_SPACING
	const siblingSpacing = Math.max(MIND_MAP_DEFAULT_SIBLING_SPACING, Math.round(spacing * 0.6))
	const rootSpacing = Math.max(MIND_MAP_DEFAULT_ROOT_SPACING, Math.round(spacing * 0.75))
	const orientation = record?.data.autoLayout?.mindMapOrientation ?? "horizontal"
	return { orientation, levelSpacing: spacing, siblingSpacing, rootSpacing }
}

function computeMindMapChildPosition(
	parent: InternalNode,
	children: InternalNode[],
	layout: MindMapLayoutConfig,
): XYPosition {
	if (layout.orientation === "horizontal") {
		const baseX = parent.position.x + layout.levelSpacing
		if (children.length === 0) {
			return { x: baseX, y: parent.position.y }
		}
		const maxY = Math.max(parent.position.y, ...children.map((child) => child.position.y))
		return { x: baseX, y: maxY + layout.siblingSpacing }
	}
	const baseY = parent.position.y + layout.levelSpacing
	if (children.length === 0) {
		return { x: parent.position.x, y: baseY }
	}
	const maxX = Math.max(parent.position.x, ...children.map((child) => child.position.x))
	return { x: maxX + layout.siblingSpacing, y: baseY }
}

function computeMindMapSiblingPosition(
	reference: InternalNode,
	siblings: InternalNode[],
	layout: MindMapLayoutConfig,
	parentId?: string,
): XYPosition {
	const isRoot = typeof parentId === "undefined"
	if (isRoot) {
		const siblingYs = siblings.map((node) => node.position.y)
		const maxY = siblingYs.length > 0 ? Math.max(...siblingYs, reference.position.y) : reference.position.y
		return { x: reference.position.x, y: maxY + layout.rootSpacing }
	}
	if (layout.orientation === "horizontal") {
		const siblingYs = siblings.map((node) => node.position.y)
		const maxY = siblingYs.length > 0 ? Math.max(...siblingYs, reference.position.y) : reference.position.y
		return { x: reference.position.x, y: maxY + layout.siblingSpacing }
	}
	const siblingXs = siblings.map((node) => node.position.x)
	const maxX = siblingXs.length > 0 ? Math.max(...siblingXs, reference.position.x) : reference.position.x
	return { x: maxX + layout.siblingSpacing, y: reference.position.y }
}

function computeMindMapLayoutPositions(
	nodes: InternalNode[],
	meta: MindMapMeta,
	layout: MindMapLayoutConfig,
): Map<string, XYPosition> {
	const positions = new Map<string, XYPosition>()
	const nodeMap = new Map(nodes.map((node) => [node.id, node] as const))

	let nextIndex = 0
	const siblingUnit = Math.max(layout.siblingSpacing, 1)

	const assign = (nodeId: string, depth: number): number => {
		const children = meta.childMap.get(nodeId) ?? []
		const childIndices: number[] = []
		for (const child of children) {
			childIndices.push(assign(child.id, depth + 1))
		}
		let index: number
		if (childIndices.length === 0) {
			index = nextIndex
			nextIndex += 1
		} else {
			const first = childIndices[0]
			const last = childIndices[childIndices.length - 1]
			index = (first + last) / 2
		}
		const x = layout.orientation === "horizontal" ? depth * layout.levelSpacing : index * layout.siblingSpacing
		const y = layout.orientation === "horizontal" ? index * layout.siblingSpacing : depth * layout.levelSpacing
		positions.set(nodeId, { x, y })
		return index
	}

	const applyOffset = (nodeId: string, offset: XYPosition) => {
		const current = positions.get(nodeId)
		if (current) {
			positions.set(nodeId, { x: current.x + offset.x, y: current.y + offset.y })
		}
		const children = meta.childMap.get(nodeId) ?? []
		for (const child of children) {
			applyOffset(child.id, offset)
		}
	}

	const roots =
		meta.rootIds.length > 0
			? meta.rootIds
			: nodes.filter((node) => node.type === "mindMap" && !getMindMapParentId(node)).map((node) => node.id)

	let accumulatedIndex = 0
	const rootSeparation = Math.max(layout.rootSpacing / siblingUnit, 1)
	for (const rootId of roots) {
		if (positions.has(rootId) || !nodeMap.has(rootId)) {
			continue
		}
		nextIndex = accumulatedIndex
		const rootIndex = assign(rootId, 0)
		const rootNode = nodeMap.get(rootId)
		const rootPosition = positions.get(rootId)
		if (rootNode && rootPosition) {
			const offset = {
				x: rootNode.position.x - rootPosition.x,
				y: rootNode.position.y - rootPosition.y,
			}
			applyOffset(rootId, offset)
		}
		accumulatedIndex = Math.max(accumulatedIndex, nextIndex) + rootSeparation
	}

	return positions
}

interface ToolbarButtonProps {
	label: string
	isActive?: boolean
	onClick: () => void
	children: React.ReactNode
	disabled?: boolean
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ label, isActive, onClick, children, disabled }) => (
	<Button
		type="button"
		variant="ghost"
		size="icon"
		disabled={disabled}
		aria-label={label}
		aria-pressed={isActive}
		title={label}
		className={cn(
			"h-7 w-7 rounded-sm text-[0.7rem] font-semibold leading-none text-[var(--vscode-editor-foreground)]",
			"hover:bg-[color-mix(in_srgb,var(--vscode-editor-foreground)_10%,var(--vscode-editor-background)_90%)]",
			disabled && "opacity-60",
			isActive &&
				"bg-[color-mix(in_srgb,var(--vscode-editor-foreground)_18%,var(--vscode-editor-background)_82%)]",
		)}
		onClick={onClick}>
		{children}
	</Button>
)

const ToolbarDivider: React.FC = () => (
	<div
		className="mx-1 h-5 w-px bg-[color-mix(in_srgb,var(--vscode-editor-foreground)_14%,var(--vscode-editor-background)_86%)]"
		aria-hidden="true"
	/>
)

function RichTextNode({ id, data, selected, width, height }: NodeProps<InternalNodeData>): JSX.Element {
	const initialContent = useMemo<JSONContent | string>(() => {
		return (data.document as JSONContent | undefined) ?? data.html ?? "<p></p>"
	}, [data.document, data.html])

	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				heading: { levels: [1, 2, 3] },
				bulletList: { keepMarks: true },
				orderedList: { keepMarks: true },
				codeBlock: false,
			}),
			Underline,
			Link.configure({
				autolink: true,
				linkOnPaste: true,
				openOnClick: false,
			}),
			Placeholder.configure({ placeholder: "Start typing..." }),
		],
		content: initialContent,
		onUpdate: ({ editor }) => {
			data.onDataChange(id, {
				document: editor.getJSON(),
				html: editor.getHTML(),
				plainText: editor.getText(),
			})
		},
	})

	const isEditorReady = Boolean(editor)

	const handleLinkToggle = useCallback(() => {
		if (!editor) {
			return
		}
		if (editor.isActive("link")) {
			editor.chain().focus().extendMarkRange("link").unsetLink().run()
			return
		}
		const previous = editor.getAttributes("link").href as string | undefined
		const input = window.prompt("Enter a URL", previous ?? "https://")
		if (input === null) {
			return
		}
		const trimmed = input.trim()
		if (trimmed.length === 0) {
			editor.chain().focus().extendMarkRange("link").unsetLink().run()
			return
		}
		const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
		editor.chain().focus().extendMarkRange("link").setLink({ href: normalized }).run()
	}, [editor])

	const handleResize = useCallback(
		(_: unknown, params: { width: number; height: number }) => {
			data.onSizeChange(id, { width: params.width, height: params.height })
		},
		[data, id],
	)

	const resolvedWidth = typeof width === "number" ? width : RICH_TEXT_DEFAULT_WIDTH
	const resolvedHeight = typeof height === "number" ? height : undefined

	return (
		<div
			className={cn(
				"nodrag flex h-full w-full flex-col overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--vscode-editor-foreground)_12%,var(--vscode-editor-background)_88%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_95%,rgba(255,255,255,0.06)_5%)] shadow-sm",
				selected && "ring-2 ring-[var(--vscode-focusBorder)]",
			)}
			style={{
				width: resolvedWidth,
				minWidth: RICH_TEXT_MIN_WIDTH,
				height: resolvedHeight,
				minHeight: RICH_TEXT_MIN_HEIGHT,
			}}>
			<NodeResizer
				color="var(--vscode-focusBorder)"
				handleClassName="!bg-[color-mix(in_srgb,var(--vscode-editor-background)_70%,var(--vscode-focusBorder)_30%)]"
				isVisible={selected}
				minWidth={RICH_TEXT_MIN_WIDTH}
				minHeight={RICH_TEXT_MIN_HEIGHT}
				onResize={handleResize}
				lineStyle={{ borderColor: "var(--vscode-focusBorder)" }}
			/>
			<div className="flex flex-wrap items-center gap-1 border-b border-[color-mix(in_srgb,var(--vscode-editor-foreground)_12%,var(--vscode-editor-background)_88%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,rgba(255,255,255,0.04)_2%)] px-2 py-1">
				<ToolbarButton
					label="Heading 1"
					disabled={!isEditorReady}
					isActive={editor?.isActive("heading", { level: 1 }) ?? false}
					onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run() ?? undefined}>
					<span className="text-[0.65rem] font-bold">H1</span>
				</ToolbarButton>
				<ToolbarButton
					label="Heading 2"
					disabled={!isEditorReady}
					isActive={editor?.isActive("heading", { level: 2 }) ?? false}
					onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run() ?? undefined}>
					<span className="text-[0.65rem] font-semibold">H2</span>
				</ToolbarButton>
				<ToolbarButton
					label="Heading 3"
					disabled={!isEditorReady}
					isActive={editor?.isActive("heading", { level: 3 }) ?? false}
					onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run() ?? undefined}>
					<span className="text-[0.65rem] font-medium">H3</span>
				</ToolbarButton>
				<ToolbarDivider />
				<ToolbarButton
					label="Bold"
					disabled={!isEditorReady}
					isActive={editor?.isActive("bold") ?? false}
					onClick={() => editor?.chain().focus().toggleBold().run() ?? undefined}>
					<span className="font-semibold">B</span>
				</ToolbarButton>
				<ToolbarButton
					label="Italic"
					disabled={!isEditorReady}
					isActive={editor?.isActive("italic") ?? false}
					onClick={() => editor?.chain().focus().toggleItalic().run() ?? undefined}>
					<span className="italic">I</span>
				</ToolbarButton>
				<ToolbarButton
					label="Underline"
					disabled={!isEditorReady}
					isActive={editor?.isActive("underline") ?? false}
					onClick={() => editor?.chain().focus().toggleUnderline().run() ?? undefined}>
					<span className="underline">U</span>
				</ToolbarButton>
				<ToolbarButton
					label="Strikethrough"
					disabled={!isEditorReady}
					isActive={editor?.isActive("strike") ?? false}
					onClick={() => editor?.chain().focus().toggleStrike().run() ?? undefined}>
					<span className="line-through">S</span>
				</ToolbarButton>
				<ToolbarButton
					label="Inline code"
					disabled={!isEditorReady}
					isActive={editor?.isActive("code") ?? false}
					onClick={() => editor?.chain().focus().toggleCode().run() ?? undefined}>
					<span className="text-xs font-mono">&lt;/&gt;</span>
				</ToolbarButton>
				<ToolbarDivider />
				<ToolbarButton
					label="Bullet list"
					disabled={!isEditorReady}
					isActive={editor?.isActive("bulletList") ?? false}
					onClick={() => editor?.chain().focus().toggleBulletList().run() ?? undefined}>
					<span className="text-lg leading-none">•</span>
				</ToolbarButton>
				<ToolbarButton
					label="Numbered list"
					disabled={!isEditorReady}
					isActive={editor?.isActive("orderedList") ?? false}
					onClick={() => editor?.chain().focus().toggleOrderedList().run() ?? undefined}>
					<span className="text-xs">1.</span>
				</ToolbarButton>
				<ToolbarDivider />
				<ToolbarButton
					label={editor?.isActive("link") ? "Remove link" : "Add link"}
					disabled={!isEditorReady}
					isActive={editor?.isActive("link") ?? false}
					onClick={handleLinkToggle}>
					<span className="codicon codicon-link" aria-hidden="true" />
				</ToolbarButton>
			</div>
			<EditorContent
				editor={editor}
				className="flex-1 overflow-auto px-3 pb-3 pt-2 text-sm leading-relaxed focus:outline-none"
			/>
		</div>
	)
}

function FileNode({ data, selected }: NodeProps<InternalNodeData>): JSX.Element {
	const asset = (data as any).asset
	if (!asset) {
		return (
			<div className="nodrag rounded-lg border border-dashed border-[var(--vscode-descriptionForeground)] bg-transparent px-4 py-6 text-xs text-[var(--vscode-descriptionForeground)]">
				Drop a file
			</div>
		)
	}

	const isImage = asset.mimeType?.startsWith("image/")
	const isAudio = asset.mimeType?.startsWith("audio/")
	const isVideo = asset.mimeType?.startsWith("video/")

	return (
		<div
			className={cn(
				"nodrag flex w-[280px] flex-col overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--vscode-editor-foreground)_12%,var(--vscode-editor-background)_88%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_95%,rgba(255,255,255,0.08)_5%)] shadow-sm",
				selected && "ring-2 ring-[var(--vscode-focusBorder)]",
			)}>
			{isImage && (
				<img src={asset.previewUrl ?? asset.url} alt={asset.fileName} className="h-40 w-full object-cover" />
			)}
			{isAudio && (
				<audio controls src={asset.url} className="w-full">
					Your browser does not support the audio element.
				</audio>
			)}
			{isVideo && (
				<video controls src={asset.url} className="h-40 w-full object-cover" poster={asset.posterUrl}>
					Your browser does not support the video element.
				</video>
			)}
			{!isImage && !isAudio && !isVideo && (
				<div className="flex h-32 flex-col items-center justify-center gap-2">
					<span className="codicon codicon-file text-2xl text-[var(--vscode-descriptionForeground)]" />
					<span className="text-xs text-[var(--vscode-descriptionForeground)]">{asset.fileName}</span>
				</div>
			)}
			<div className="border-t border-[color-mix(in_srgb,var(--vscode-editor-foreground)_12%,var(--vscode-editor-background)_88%)] px-3 py-2 text-xs text-[var(--vscode-descriptionForeground)]">
				{asset.fileName}
			</div>
		</div>
	)
}

function AgentToolNode({ data, selected }: NodeProps<InternalNodeData>): JSX.Element {
	const status = (data as any).status ?? "idle"
	const label = (data as any).label ?? (data as any).toolId ?? "Agent Tool"

	return (
		<div
			className={cn(
				"nodrag w-[220px] rounded-lg border border-[color-mix(in_srgb,var(--vscode-editor-foreground)_15%,var(--vscode-editor-background)_85%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,rgba(255,255,255,0.05)_6%)] px-3 py-2",
				selected && "ring-2 ring-[var(--vscode-focusBorder)]",
			)}>
			<div className="flex items-center justify-between text-xs uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
				<span>{label}</span>
				<span>{status}</span>
			</div>
		</div>
	)
}

function MindMapNode({ id, data, selected }: NodeProps<InternalNodeData>): JSX.Element {
	const mindMap = useContext(MindMapContext)
	const inputRef = useRef<HTMLInputElement>(null)
	const title = ((data as MindMapNodeData).title ?? "").toString()
	const childCount = mindMap?.getChildCount(id) ?? 0
	const descendantCount = mindMap?.getDescendantCount(id) ?? 0
	const isCollapsed = mindMap?.isCollapsed(id) ?? false

	useEffect(() => {
		if (mindMap?.focusNodeId === id && inputRef.current) {
			inputRef.current.focus()
			inputRef.current.select()
			mindMap.clearFocus()
		}
	}, [id, mindMap])

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			if (!mindMap) {
				return
			}
			const hasModifier = event.shiftKey || event.altKey || event.metaKey || event.ctrlKey
			if (event.key === "Enter" && !hasModifier) {
				event.preventDefault()
				mindMap.addSibling(id)
			} else if (event.key === "Tab" && !hasModifier) {
				event.preventDefault()
				mindMap.addChild(id)
			}
		},
		[id, mindMap],
	)

	return (
		<div
			className={cn(
				"nodrag flex min-w-[220px] flex-col gap-2 rounded-full border border-[color-mix(in_srgb,var(--vscode-editor-foreground)_12%,var(--vscode-editor-background)_88%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,rgba(255,255,255,0.08)_8%)] px-4 py-3 shadow-sm",
				selected && "ring-2 ring-[var(--vscode-focusBorder)]",
			)}>
			<div className="flex items-center gap-2">
				{childCount > 0 && (
					<button
						type="button"
						onClick={() => mindMap?.toggleCollapse(id)}
						className="flex h-6 w-6 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--vscode-editor-foreground)_12%,var(--vscode-editor-background)_88%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,rgba(255,255,255,0.14)_4%)] text-[color-mix(in_srgb,var(--vscode-editor-foreground)_82%,var(--vscode-editor-background)_18%)] hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,rgba(255,255,255,0.18)_10%)]"
						aria-label={isCollapsed ? "Expand branch" : "Collapse branch"}>
						<span
							className={cn("codicon", isCollapsed ? "codicon-chevron-right" : "codicon-chevron-down")}
							aria-hidden="true"
						/>
					</button>
				)}
				<input
					ref={inputRef}
					type="text"
					value={title}
					placeholder={MIND_MAP_DEFAULT_TITLE}
					onKeyDown={handleKeyDown}
					onChange={(event) => data.onDataChange(id, { title: event.target.value })}
					className="w-full flex-1 rounded-full bg-transparent text-center text-sm font-semibold tracking-tight outline-none placeholder:text-[color-mix(in_srgb,var(--vscode-editor-foreground)_45%,var(--vscode-editor-background)_55%)]"
				/>
				<button
					type="button"
					onClick={() => mindMap?.addChild(id)}
					className="flex h-6 w-6 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--vscode-editor-foreground)_12%,var(--vscode-editor-background)_88%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,rgba(255,255,255,0.14)_4%)] text-[color-mix(in_srgb,var(--vscode-editor-foreground)_82%,var(--vscode-editor-background)_18%)] hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,rgba(255,255,255,0.18)_10%)]"
					title="Add child idea (Tab)">
					<span className="codicon codicon-add" aria-hidden="true" />
				</button>
			</div>
			{isCollapsed && descendantCount > 0 && (
				<div className="text-center text-[0.65rem] font-medium text-[color-mix(in_srgb,var(--vscode-editor-foreground)_55%,var(--vscode-editor-background)_45%)]">
					{descendantCount} hidden
				</div>
			)}
			<div className="flex justify-center gap-3 text-[0.6rem] uppercase tracking-[0.08em] text-[color-mix(in_srgb,var(--vscode-editor-foreground)_48%,var(--vscode-editor-background)_52%)]">
				<span>Enter → Sibling</span>
				<span>Tab → Child</span>
			</div>
		</div>
	)
}

function MindMapEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	markerEnd,
	markerStart,
	style,
	selected,
}: EdgeProps): JSX.Element {
	const horizontal = Math.abs(targetX - sourceX) >= Math.abs(targetY - sourceY)
	const [path] = getSmoothStepPath({
		sourceX,
		sourceY,
		sourcePosition: horizontal ? Position.Right : Position.Bottom,
		targetX,
		targetY,
		targetPosition: horizontal ? Position.Left : Position.Top,
		borderRadius: 24,
	})
	return (
		<BaseEdge
			id={id}
			path={path}
			markerEnd={markerEnd}
			markerStart={markerStart}
			style={{ strokeWidth: selected ? 2.5 : 1.5, ...(style ?? {}) }}
		/>
	)
}

type NodeDefaults = {
	data: Record<string, unknown>
	width?: number
	height?: number
	style?: React.CSSProperties
}

function getNodeDefaults(type: EndlessSurfaceNode["type"], timestamp: number): NodeDefaults {
	switch (type) {
		case "richText":
			return {
				data: {
					document: undefined,
					html: "<p></p>",
					plainText: "",
				},
				width: RICH_TEXT_DEFAULT_WIDTH,
				height: RICH_TEXT_MIN_HEIGHT,
				style: {
					width: RICH_TEXT_DEFAULT_WIDTH,
					height: RICH_TEXT_MIN_HEIGHT,
					minWidth: RICH_TEXT_MIN_WIDTH,
					minHeight: RICH_TEXT_MIN_HEIGHT,
				},
			}
		case "mindMap":
			return {
				data: { title: "New Idea", notes: "" },
			}
		case "agentTool":
			return {
				data: { toolId: "", label: "Agent Tool", status: "idle" },
			}
		case "file":
			return {
				data: {
					asset: {
						assetId: createGuid("asset"),
						fileName: "Drop a file",
						mimeType: "application/octet-stream",
						createdAt: timestamp,
						updatedAt: timestamp,
					},
				},
			}
		default:
			return { data: {} }
	}
}

function clampPopoverPosition(x: number, y: number, bounds: DOMRect): XYPosition {
	const maxX = Math.max(NODE_LIBRARY_PADDING, bounds.width - NODE_LIBRARY_DIMENSIONS.width - NODE_LIBRARY_PADDING)
	const maxY = Math.max(NODE_LIBRARY_PADDING, bounds.height - NODE_LIBRARY_DIMENSIONS.height - NODE_LIBRARY_PADDING)
	return {
		x: clampValue(x, NODE_LIBRARY_PADDING, maxX),
		y: clampValue(y, NODE_LIBRARY_PADDING, maxY),
	}
}

function clampValue(value: number, min: number, max: number): number {
	if (max < min) {
		return min
	}
	return Math.min(Math.max(value, min), max)
}
