import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ChangeEvent,
	type MouseEvent as ReactMouseEvent,
} from "react"
import ReactFlow, {
	Background,
	BackgroundVariant,
	ReactFlowInstance,
	XYPosition,
	addEdge,
	applyEdgeChanges,
	applyNodeChanges,
	type Connection,
	type Edge,
	type EdgeChange,
	type Node,
	type NodeChange,
	type NodeTypes,
} from "reactflow"
import { formatDistanceToNow } from "date-fns"
import {
	PanelLeftClose,
	PanelLeftOpen,
	Plus,
	Search,
	Lightbulb,
	HelpCircle,
	CheckSquare,
	Signal,
	NotebookPen,
	FileText,
	WandSparkles,
	Bot,
	StickyNote,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { nanoid } from "nanoid"

import "reactflow/dist/style.css"

import { useAppTranslation } from "@/i18n/TranslationContext"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { cn } from "@/lib/utils"
import { vscode } from "@/utils/vscode"
import BrainstormNode, { type BrainstormNodeData as BrainstormIdeaNodeRenderData } from "./BrainstormNode"
import BrainstormFileNode, {
	type BrainstormFileNodeData,
	type BrainstormFilePreviewKind,
} from "./BrainstormFileNode"
import AgentToolNode, {
	type AgentToolNodeData,
	type AgentToolNodeRenderData,
	type AgentToolInput,
} from "./AgentToolNode"
import NoteSheetNode, {
	type NoteSheetNodeRenderData,
	type NoteSheetNodeStateData,
} from "./NoteSheetNode"
import { NoteSheetBlock, createInitialNoteSheetBlocks } from "./noteSheetModel"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import {
	buildAgentToolTemplates,
	buildAvailableTools,
	buildIdeaNodeTemplates,
	type AgentToolTemplate,
	type IdeaNodeTemplate,
} from "./nodeTemplates"

type BrainstormIdeaNodeStateData = Omit<BrainstormIdeaNodeRenderData, "onDraftChange" | "onCommit" | "onCancel">
type BrainstormFileNodeStateData = Omit<BrainstormFileNodeData, "onSelectFile" | "onClearFile">

type CanvasNodeStateData =
	| BrainstormIdeaNodeStateData
	| BrainstormFileNodeStateData
	| NoteSheetNodeStateData
	| AgentToolNodeData
type CanvasNodeRenderData =
	| BrainstormIdeaNodeRenderData
	| BrainstormFileNodeData
	| NoteSheetNodeRenderData
	| AgentToolNodeRenderData
type CanvasNode = Node<CanvasNodeStateData>
type CanvasRenderNode = Node<CanvasNodeRenderData>
type CanvasTemplate = IdeaNodeTemplate | AgentToolTemplate

const IDEA_TEMPLATE_ICONS: Record<string, LucideIcon> = {
	idea: Lightbulb,
	question: HelpCircle,
	task: CheckSquare,
	signal: Signal,
	"note-sheet": NotebookPen,
	"file-note": FileText,
}

const DEFAULT_IDEA_ICON: LucideIcon = StickyNote
const DEFAULT_AGENT_TOOL_ICON: LucideIcon = WandSparkles

const AGENT_TOOL_ICON_BY_GROUP: Record<string, LucideIcon> = {
	Browser: Bot,
	Web: Bot,
	MCP: Bot,
	Read: WandSparkles,
	Edit: WandSparkles,
	Command: WandSparkles,
	Modes: WandSparkles,
}

const getTemplateIcon = (template: CanvasTemplate): LucideIcon => {
	if (template.section === "ideas") {
		return IDEA_TEMPLATE_ICONS[template.id] ?? DEFAULT_IDEA_ICON
	}

	if (template.section === "agentTools") {
		const groupLabel = template.meta?.toolGroup
		if (groupLabel) {
			return AGENT_TOOL_ICON_BY_GROUP[groupLabel] ?? DEFAULT_AGENT_TOOL_ICON
		}
		return DEFAULT_AGENT_TOOL_ICON
	}

	return DEFAULT_IDEA_ICON
}

type BrainstormSurface = {
	id: string
	name: string
	summary?: string
	updatedAt: Date
	nodes: CanvasNode[]
	edges: Edge[]
}

const createDefaultNodes = (): CanvasNode[] => [
	{
		id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `starter-node-${nanoid(6)}`,
		position: { x: 0, y: 0 },
		data: { label: "Drop ideas here" },
		type: "brainstorm",
	},
]

const sortByRecent = (items: BrainstormSurface[]) =>
	items.slice().sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

const createInitialSurfaces = (): BrainstormSurface[] =>
	sortByRecent([
		{
			id: "surface-product-north-star",
			name: "Product north star",
			summary: "Q4 roadmap scaffolding and success metrics snapshot.",
			updatedAt: new Date(Date.now() - 1000 * 60 * 12),
			nodes: createDefaultNodes(),
			edges: [],
		},
		{
			id: "surface-launch-checklist",
			name: "Launch checklist",
			summary: "Cross-team launch runbook for v3 beta.",
			updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
			nodes: createDefaultNodes(),
			edges: [],
		},
		{
			id: "surface-infra-observability",
			name: "Infra observability map",
			summary: "Link tracing surfaces + SLO swimlanes to unblock ops.",
			updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 26),
			nodes: createDefaultNodes(),
			edges: [],
		},
		{
			id: "surface-ritual-refresh",
			name: "Team ritual refresh",
			summary: "Weekly sync redesign—focus on async pre-reads.",
			updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
			nodes: createDefaultNodes(),
			edges: [],
		},
	])

const isIdeaNode = (node: CanvasNode | CanvasRenderNode): node is Node<BrainstormIdeaNodeStateData> => node.type === "brainstorm"

const isAgentToolNode = (node: CanvasNode | CanvasRenderNode): node is Node<AgentToolNodeData> => node.type === "agentTool"

const isFileNode = (node: CanvasNode | CanvasRenderNode): node is Node<BrainstormFileNodeStateData> =>
	node.type === "fileNote"

const isNoteSheetNode = (node: CanvasNode | CanvasRenderNode): node is Node<NoteSheetNodeStateData> =>
	node.type === "noteSheet"

const normalizeIdeaNodeData = (data?: CanvasNodeStateData): BrainstormIdeaNodeStateData => ({
	label: (data as BrainstormIdeaNodeStateData)?.label ?? "",
	isEditing: (data as BrainstormIdeaNodeStateData)?.isEditing,
	draft: (data as BrainstormIdeaNodeStateData)?.draft,
})

const normalizeFileNodeData = (data?: CanvasNodeStateData): BrainstormFileNodeStateData => {
	const partial = (data as BrainstormFileNodeStateData) ?? {}
	return {
		fileName: partial.fileName,
		mimeType: partial.mimeType,
		size: partial.size,
		dataUrl: partial.dataUrl,
		previewKind: partial.previewKind,
		textPreview: partial.textPreview,
		isUploading: partial.isUploading,
	}
}

const inferPreviewKindFromFile = (file: File): BrainstormFilePreviewKind => {
	const mime = file.type?.toLowerCase() ?? ""
	if (mime.startsWith("image/")) {
		return "image"
	}
	if (mime.startsWith("audio/")) {
		return "audio"
	}
	if (mime.startsWith("video/")) {
		return "video"
	}
	if (mime === "application/pdf") {
		return "pdf"
	}
	if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml") {
		return "text"
	}

	const extension = file.name?.split(".").pop()?.toLowerCase()
	if (!extension) {
		return "other"
	}

	if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(extension)) {
		return "image"
	}
	if (["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(extension)) {
		return "audio"
	}
	if (["mp4", "mov", "webm", "mkv"].includes(extension)) {
		return "video"
	}
	if (extension === "pdf") {
		return "pdf"
	}
	if (["txt", "md", "json", "yaml", "yml", "csv", "tsv"].includes(extension)) {
		return "text"
	}

	return "other"
}

const readFileAsDataUrl = (file: File): Promise<string> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => {
			const result = reader.result
			if (typeof result === "string") {
				resolve(result)
			} else {
				reject(new Error("Unable to read file preview."))
			}
		}
		reader.onerror = () => {
			reject(reader.error ?? new Error("Unable to read file preview."))
		}
		reader.readAsDataURL(file)
	})

const normalizeAgentToolNodeData = (data?: CanvasNodeStateData): AgentToolNodeData => {
	const partial = (data as AgentToolNodeData) ?? { toolId: "", label: "", inputs: [] }
	const normalizedInputs = Array.isArray(partial.inputs)
		? partial.inputs.map((input) => ({
				id: input.id ?? `input-${nanoid(6)}`,
				key: input.key ?? "",
				value: input.value ?? "",
		  }))
		: []

	return {
		toolId: partial.toolId ?? "",
		label: partial.label ?? "",
		description: partial.description,
		status: partial.status ?? "idle",
		lastRunAt: partial.lastRunAt,
		lastResult: partial.lastResult,
		lastError: partial.lastError,
		inputs: normalizedInputs,
	}
}

interface MenuState {
	open: boolean
	anchor: { x: number; y: number }
	flowPosition: XYPosition
}

const INITIAL_MENU_STATE: MenuState = {
	open: false,
	anchor: { x: 0, y: 0 },
	flowPosition: { x: 0, y: 0 },
}

interface BrainstormAppBarProps {
	backLabel: string
	onBack: () => void
	title: string
	titleLabel: string
	titlePlaceholder: string
	onTitleInput: (value: string) => void
	onTitleCommit: () => void
	onTitleRevert: () => void
	lastUpdatedCopy?: string
	isHistoryOpen: boolean
		toggleHistoryLabel: string
	onToggleHistory: () => void
	onToggleBackground: () => void
	backgroundVariantText: string
	toggleBackgroundLabel: string
}

const BrainstormAppBar = ({
	backLabel,
	onBack,
	title,
	titleLabel,
	titlePlaceholder,
	onTitleInput,
	onTitleCommit,
	onTitleRevert,
	lastUpdatedCopy,
	isHistoryOpen,
	toggleHistoryLabel,
	onToggleHistory,
	onToggleBackground,
	backgroundVariantText,
	toggleBackgroundLabel,
}: BrainstormAppBarProps) => {
	return (
		<div className="flex items-center justify-between gap-4 border-b border-vscode-panel-border bg-vscode-editor-background/90 px-4 py-3">
			<div className="flex min-w-0 items-center gap-3">
				<button
					type="button"
					onClick={onBack}
					className="inline-flex items-center gap-2 rounded-sm border border-transparent bg-transparent px-2.5 py-1.5 text-sm font-medium text-vscode-button-foreground transition-colors hover:border-vscode-focusBorder hover:bg-vscode-button-hoverBackground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder">
					<span className="codicon codicon-arrow-left text-[14px]" aria-hidden="true" />
					<span className="truncate">{backLabel}</span>
				</button>
				<div className="h-5 w-px bg-vscode-panel-border" aria-hidden="true" />
				<div className="flex min-w-0 flex-1 items-center">
					<label htmlFor="brainstorm-surface-title" className="sr-only">
						{titleLabel}
					</label>
					<input
						id="brainstorm-surface-title"
						value={title}
						onChange={(event) => onTitleInput(event.target.value)}
						onBlur={onTitleCommit}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault()
								onTitleCommit()
							} else if (event.key === "Escape") {
								event.preventDefault()
								onTitleRevert()
							}
						}}
						placeholder={titlePlaceholder}
						className="w-full min-w-[160px] max-w-[340px] flex-1 rounded-sm border border-vscode-input-border bg-vscode-input-background px-3 py-1.5 text-sm text-vscode-input-foreground shadow-sm transition-colors focus:border-vscode-focusBorder focus:outline-none"
					/>
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				{lastUpdatedCopy && (
					<span className="text-xs text-vscode-descriptionForeground">{lastUpdatedCopy}</span>
				)}
				<button
					type="button"
					onClick={onToggleBackground}
					className="inline-flex items-center gap-2 rounded-sm border border-transparent bg-transparent px-2 py-1.5 text-xs font-medium text-vscode-descriptionForeground transition-colors hover:border-vscode-focusBorder hover:bg-vscode-button-hoverBackground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder"
					aria-label={`${toggleBackgroundLabel} (${backgroundVariantText})`}>
					<span className="codicon codicon-symbol-color text-[14px]" aria-hidden="true" />
					<span className="hidden sm:inline">{backgroundVariantText}</span>
				</button>
				<button
					type="button"
					onClick={onToggleHistory}
					className="inline-flex items-center gap-2 rounded-sm border border-transparent bg-transparent px-2 py-1.5 text-xs font-medium text-vscode-descriptionForeground transition-colors hover:border-vscode-focusBorder hover:bg-vscode-button-hoverBackground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder"
					aria-pressed={isHistoryOpen}
					aria-label={toggleHistoryLabel}>
					{isHistoryOpen ? (
						<PanelLeftClose className="size-4" aria-hidden="true" />
					) : (
						<PanelLeftOpen className="size-4" aria-hidden="true" />
					)}
					<span className="hidden sm:inline">{toggleHistoryLabel}</span>
				</button>
			</div>
		</div>
	)
}

interface BrainstormCanvasProps {
	initialSurfaceId?: string
}

const BrainstormCanvas: React.FC<BrainstormCanvasProps> = ({ initialSurfaceId }) => {
	const { t } = useAppTranslation()
	const {
		mode: activeModeSlug,
		customModes,
		experiments,
		apiConfiguration,
		browserToolEnabled,
		mcpEnabled,
		codebaseIndexConfig,
	} = useExtensionState()
	const canvasRef = useRef<HTMLDivElement | null>(null)
	const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null)
	const nodeSearchInputRef = useRef<HTMLInputElement | null>(null)
	const initialSurfaces = useMemo(() => createInitialSurfaces(), [])
	const [isSidebarOpen, setIsSidebarOpen] = useState(true)
	const [surfaces, setSurfaces] = useState<BrainstormSurface[]>(initialSurfaces)
	const [activeSurfaceId, setActiveSurfaceId] = useState<string>(() => {
		if (initialSurfaceId && initialSurfaces.some((surface) => surface.id === initialSurfaceId)) {
			return initialSurfaceId
		}
		return initialSurfaces[0]?.id ?? ""
	})
	const [searchQuery, setSearchQuery] = useState("")
	const [menuState, setMenuState] = useState<MenuState>(INITIAL_MENU_STATE)
	const [nodeSearchValue, setNodeSearchValue] = useState("")
	const [titleDraft, setTitleDraft] = useState("")
	const lastCommittedTitleRef = useRef("")
	const [backgroundVariant, setBackgroundVariant] = useState<BackgroundVariant>(BackgroundVariant.Lines)

	const resolvedCustomModes = useMemo(() => customModes ?? [], [customModes])
	const resolvedExperiments = experiments ?? {}

	const availableTools = useMemo(
		() =>
			buildAvailableTools(activeModeSlug, {
				customModes: resolvedCustomModes,
				browserToolEnabled: browserToolEnabled ?? false,
				mcpEnabled: mcpEnabled ?? false,
				apiConfiguration,
				experiments: resolvedExperiments,
				codebaseIndexConfig,
			}),
		[
			activeModeSlug,
			apiConfiguration?.todoListEnabled,
			browserToolEnabled,
			codebaseIndexConfig?.codebaseIndexEnabled,
			codebaseIndexConfig?.codebaseIndexQdrantUrl,
			mcpEnabled,
			resolvedCustomModes,
			resolvedExperiments.imageGeneration,
			resolvedExperiments.runSlashCommand,
		],
	)

	const ideaTemplates = useMemo(() => buildIdeaNodeTemplates(), [])

	const agentToolTemplates = useMemo(
		() => buildAgentToolTemplates(availableTools, t),
		[availableTools, t],
	)

	const allNodeTemplates = useMemo(() => [...ideaTemplates, ...agentToolTemplates], [agentToolTemplates, ideaTemplates])

	const filteredNodeTemplates = useMemo(() => {
		const query = nodeSearchValue.trim().toLowerCase()
		if (!query) {
			return allNodeTemplates
		}

		return allNodeTemplates.filter((template) => template.searchValue.toLowerCase().includes(query))
	}, [allNodeTemplates, nodeSearchValue])

	const ideaSectionHeading = t("common:brainstorm.nodeMenuSectionIdeas", { defaultValue: "Idea starters" })
	const ideaSectionDescription = t("common:brainstorm.nodeMenuSectionIdeasDescription", {
		defaultValue: "Drop quick notes, questions, tasks, or docs anywhere on the canvas.",
	})
	const agentToolsSectionHeading = t("common:brainstorm.nodeMenuSectionAgentTools", { defaultValue: "Agent tools" })
	const agentToolsSectionDescription = t("common:brainstorm.nodeMenuSectionAgentToolsDescription", {
		defaultValue: "Wire up the assistant's capabilities and orchestrate multi-step flows.",
	})

	const ideaSectionTemplates = filteredNodeTemplates.filter((template) => template.section === "ideas")
	const agentSectionTemplates = filteredNodeTemplates.filter((template) => template.section === "agentTools")

	const menuSections = useMemo(
		() => {
			const sections: Array<{
				id: "ideas" | "agentTools"
				label: string
				description?: string
				templates: CanvasTemplate[]
			}> = []

			if (ideaSectionTemplates.length > 0) {
				sections.push({
					id: "ideas",
					label: ideaSectionHeading,
					description: ideaSectionDescription,
					templates: ideaSectionTemplates,
				})
			}

			if (agentSectionTemplates.length > 0) {
				sections.push({
					id: "agentTools",
					label: agentToolsSectionHeading,
					description: agentToolsSectionDescription,
					templates: agentSectionTemplates,
				})
			}

			return sections
		},
		[
			agentSectionTemplates,
			agentToolsSectionDescription,
			agentToolsSectionHeading,
			ideaSectionDescription,
			ideaSectionHeading,
			ideaSectionTemplates,
		],
	)

	const [nodes, setNodesState] = useState<CanvasNode[]>(
		() => initialSurfaces[0]?.nodes ?? createDefaultNodes(),
	)
	const [edges, setEdgesState] = useState<Edge[]>(() => initialSurfaces[0]?.edges ?? [])

	const nodeTypes = useMemo<NodeTypes>(
		() => ({
			brainstorm: BrainstormNode,
			fileNote: BrainstormFileNode,
			noteSheet: NoteSheetNode,
			agentTool: AgentToolNode,
		}),
		[],
	)

	const updateActiveSurface = useCallback(
		(updater: (surface: BrainstormSurface) => BrainstormSurface) => {
			if (!activeSurfaceId) {
				return
			}

			setSurfaces((prev) => {
				let didUpdate = false
				const nextSurfaces = prev.map((surface) => {
					if (surface.id !== activeSurfaceId) {
						return surface
					}
					didUpdate = true
					return updater(surface)
				})

				if (!didUpdate) {
					return prev
				}

				return sortByRecent(nextSurfaces)
			})
		},
		[activeSurfaceId, setSurfaces],
	)

	const persistNodes = useCallback(
		(nextNodes: CanvasNode[]) => {
			updateActiveSurface((surface) => ({
				...surface,
				nodes: nextNodes,
				updatedAt: new Date(),
			}))
		},
		[updateActiveSurface],
	)

	const persistEdges = useCallback(
		(nextEdges: Edge[]) => {
			updateActiveSurface((surface) => ({
				...surface,
				edges: nextEdges,
				updatedAt: new Date(),
			}))
		},
		[updateActiveSurface],
	)

	type NodesStateUpdater = Parameters<typeof setNodesState>[0]
	const updateNodes = useCallback(
		(updater: NodesStateUpdater) => {
			setNodesState((prev) => {
				const next =
					typeof updater === "function"
						? (updater as (nodes: CanvasNode[]) => CanvasNode[])(prev)
						: updater

				if (next === prev) {
					return prev
				}

				persistNodes(next)
				return next
			})
		},
		[persistNodes],
	)

	type EdgesStateUpdater = Parameters<typeof setEdgesState>[0]
	const updateEdges = useCallback(
		(updater: EdgesStateUpdater) => {
			setEdgesState((prev) => {
				const next = typeof updater === "function" ? (updater as (edges: Edge[]) => Edge[])(prev) : updater

				if (next === prev) {
					return prev
				}

				persistEdges(next)
				return next
			})
		},
		[persistEdges],
	)

	const handleNodesChange = useCallback(
		(changes: NodeChange[]) => {
			updateNodes((currentNodes) => applyNodeChanges<CanvasNodeStateData>(changes, currentNodes))
		},
		[updateNodes],
	)

	const handleEdgesChange = useCallback(
		(changes: EdgeChange[]) => {
			updateEdges((currentEdges) => applyEdgeChanges(changes, currentEdges))
		},
		[updateEdges],
	)

	const startEditingNode = useCallback(
		(nodeId: string) => {
			updateNodes((currentNodes) => {
				let hasChanges = false
				const updated = currentNodes.map((node) => {
					if (!isIdeaNode(node)) {
						return node
					}

					const baseData = normalizeIdeaNodeData(node.data)

					if (node.id === nodeId) {
						const nextData: BrainstormIdeaNodeStateData = {
							label: baseData.label,
							isEditing: true,
							draft: baseData.draft ?? baseData.label,
						}
						hasChanges ||= !baseData.isEditing || baseData.draft !== nextData.draft
						return { ...node, data: nextData }
					}

					if (baseData.isEditing) {
						hasChanges = true
						return { ...node, data: { ...baseData, isEditing: false, draft: undefined } }
					}

					return node
				})

				return hasChanges ? updated : currentNodes
			})
		},
		[updateNodes],
	)

	const handleNodeDraftChange = useCallback(
		(nodeId: string, value: string) => {
			updateNodes((currentNodes) => {
				let hasChanges = false
				const updated = currentNodes.map((node) => {
					if (node.id !== nodeId || !isIdeaNode(node)) {
						return node
					}

					const baseData = normalizeIdeaNodeData(node.data)

					if (baseData.draft === value) {
						return node
					}

					hasChanges = true
					return {
						...node,
						data: {
							...baseData,
							draft: value,
						},
					}
				})

				return hasChanges ? updated : currentNodes
			})
		},
		[updateNodes],
	)

	const handleNodeCommit = useCallback(
		(nodeId: string) => {
			updateNodes((currentNodes) => {
				let hasChanges = false
				const updated = currentNodes.map((node) => {
					if (node.id !== nodeId || !isIdeaNode(node)) {
						return node
					}

					const baseData = normalizeIdeaNodeData(node.data)

					const currentLabel = baseData.label
					const draft = baseData.draft ?? currentLabel
					const trimmed = draft.trim()
					const nextLabel = trimmed.length > 0 ? trimmed : currentLabel

					if (
						nextLabel === currentLabel &&
						!baseData.isEditing &&
						baseData.draft === undefined
					) {
						return node
					}

					hasChanges = true
					return {
						...node,
						data: {
							label: nextLabel,
							isEditing: false,
							draft: undefined,
						},
					}
				})

					return hasChanges ? updated : currentNodes
			})
		},
		[updateNodes],
	)

	const handleNoteSheetBlocksChange = useCallback(
		(nodeId: string, updater: (blocks: NoteSheetBlock[]) => NoteSheetBlock[]) => {
			updateNodes((currentNodes) => {
				let hasChanges = false
				const updated = currentNodes.map((node) => {
					if (node.id !== nodeId || !isNoteSheetNode(node)) {
						return node
					}

					const baseData: NoteSheetNodeStateData = {
						blocks: (node.data as NoteSheetNodeStateData)?.blocks ?? createInitialNoteSheetBlocks(),
						focusedBlockId: (node.data as NoteSheetNodeStateData)?.focusedBlockId,
					}

					const nextBlocks = updater(baseData.blocks)
					if (nextBlocks === baseData.blocks) {
						return node
					}

					hasChanges = true
					return {
						...node,
						data: {
							...baseData,
							blocks: nextBlocks,
						},
					}
				})

				return hasChanges ? updated : currentNodes
			})
		},
		[updateNodes],
	)

	const handleNoteSheetFocusChange = useCallback(
		(nodeId: string, blockId: string | undefined) => {
			updateNodes((currentNodes) => {
				let hasChanges = false
				const updated = currentNodes.map((node) => {
					if (node.id !== nodeId || !isNoteSheetNode(node)) {
						return node
					}

					const baseData: NoteSheetNodeStateData = {
						blocks: (node.data as NoteSheetNodeStateData)?.blocks ?? createInitialNoteSheetBlocks(),
						focusedBlockId: (node.data as NoteSheetNodeStateData)?.focusedBlockId,
					}

					if (baseData.focusedBlockId === blockId) {
						return node
					}

					hasChanges = true
					return {
						...node,
						data: {
							...baseData,
							focusedBlockId: blockId,
						},
					}
				})

				return hasChanges ? updated : currentNodes
			})
		},
		[updateNodes],
	)

	const handleNodeCancel = useCallback(
		(nodeId: string) => {
			updateNodes((currentNodes) => {
				let hasChanges = false
				const updated = currentNodes.map((node) => {
					if (node.id !== nodeId || !isIdeaNode(node)) {
						return node
					}

					const baseData = normalizeIdeaNodeData(node.data)

					if (!baseData.isEditing && baseData.draft === undefined) {
						return node
					}

					hasChanges = true
					return {
						...node,
						data: {
							label: baseData.label,
							isEditing: false,
							draft: undefined,
						},
					}
				})

				return hasChanges ? updated : currentNodes
			})
		},
		[updateNodes],
	)

	const handleAgentToolLabelChange = useCallback(
		(nodeId: string, value: string) => {
			updateNodes((currentNodes) => {
				let hasChanges = false
				const updated = currentNodes.map((node) => {
					if (node.id !== nodeId || !isAgentToolNode(node)) {
						return node
					}

					const baseData = normalizeAgentToolNodeData(node.data)

					if (baseData.label === value) {
						return node
					}

					hasChanges = true
					return { ...node, data: { ...baseData, label: value } }
				})

				return hasChanges ? updated : currentNodes
			})
		},
		[updateNodes],
	)

	const handleAgentToolInputChange = useCallback(
		(nodeId: string, inputId: string, field: "key" | "value", value: string) => {
			updateNodes((currentNodes) => {
				let hasChanges = false
				const updated = currentNodes.map((node) => {
					if (node.id !== nodeId || !isAgentToolNode(node)) {
						return node
					}

					const baseData = normalizeAgentToolNodeData(node.data)
					let didMutate = false
					const nextInputs = baseData.inputs.map((input) => {
						if (input.id !== inputId) {
							return input
						}

						if (input[field] === value) {
							return input
						}

						didMutate = true
						return { ...input, [field]: value }
					})

					if (!didMutate) {
						return node
					}

					hasChanges = true
					return { ...node, data: { ...baseData, inputs: nextInputs } }
				})

				return hasChanges ? updated : currentNodes
			})
		},
		[updateNodes],
	)

	const handleAgentToolAddInput = useCallback(
		(nodeId: string) => {
			updateNodes((currentNodes) => {
				let hasChanges = false
				const updated = currentNodes.map((node) => {
					if (node.id !== nodeId || !isAgentToolNode(node)) {
						return node
					}

					const baseData = normalizeAgentToolNodeData(node.data)
					const newInput: AgentToolInput = { id: `input-${nanoid(6)}`, key: "", value: "" }
					hasChanges = true
					return { ...node, data: { ...baseData, inputs: [...baseData.inputs, newInput] } }
				})

				return hasChanges ? updated : currentNodes
			})
		},
		[updateNodes],
	)

	const handleAgentToolRemoveInput = useCallback(
		(nodeId: string, inputId: string) => {
			updateNodes((currentNodes) => {
				let hasChanges = false
				const updated = currentNodes.map((node) => {
					if (node.id !== nodeId || !isAgentToolNode(node)) {
						return node
					}

					const baseData = normalizeAgentToolNodeData(node.data)
					const nextInputs = baseData.inputs.filter((input) => input.id !== inputId)

					if (nextInputs.length === baseData.inputs.length) {
						return node
					}

					hasChanges = true
					return { ...node, data: { ...baseData, inputs: nextInputs } }
				})

				return hasChanges ? updated : currentNodes
			})
		},
		[updateNodes],
	)

	const handleFileNodeSelect = useCallback(
		(nodeId: string, file: File) => {
			const previewKind = inferPreviewKindFromFile(file)
			updateNodes((currentNodes) =>
				currentNodes.map((node) => {
					if (node.id !== nodeId || !isFileNode(node)) {
						return node
					}

					const baseData = normalizeFileNodeData(node.data)
					return { ...node, data: { ...baseData, isUploading: true } }
				}),
			)

			const applyFile = async () => {
				try {
					const [dataUrl, textPreview] = await Promise.all([
						readFileAsDataUrl(file),
						previewKind === "text"
							? file
								.text()
								.then((text) => text.slice(0, 8000))
								.catch(() => undefined)
							: Promise.resolve<string | undefined>(undefined),
					])

					updateNodes((currentNodes) =>
						currentNodes.map((node) => {
							if (node.id !== nodeId || !isFileNode(node)) {
								return node
							}

							const baseData = normalizeFileNodeData(node.data)
							return {
								...node,
								data: {
									...baseData,
									fileName: file.name,
									mimeType: file.type || baseData.mimeType,
									size: file.size,
									dataUrl,
									previewKind,
									textPreview: textPreview ?? baseData.textPreview,
									isUploading: false,
								},
							}
						}),
					)
				} catch (error) {
					console.error("[BrainstormCanvas] Failed to load file preview", error)
					updateNodes((currentNodes) =>
						currentNodes.map((node) => {
							if (node.id !== nodeId || !isFileNode(node)) {
								return node
							}

							const baseData = normalizeFileNodeData(node.data)
							return { ...node, data: { ...baseData, isUploading: false } }
						}),
					)
				}
			}

			void applyFile()
		},
		[updateNodes],
	)

	const handleFileNodeClear = useCallback(
		(nodeId: string) => {
			updateNodes((currentNodes) =>
				currentNodes.map((node) => {
					if (node.id !== nodeId || !isFileNode(node)) {
						return node
					}

					const baseData = normalizeFileNodeData(node.data)
					return {
						...node,
						data: {
							...baseData,
							fileName: undefined,
							mimeType: undefined,
							size: undefined,
							dataUrl: undefined,
							previewKind: undefined,
							textPreview: undefined,
							isUploading: false,
						},
					}
				}),
			)
		},
		[updateNodes],
	)

	const nodesWithHandlers = useMemo<CanvasRenderNode[]>(
		() =>
			nodes.map((node) => {
				if (isIdeaNode(node)) {
					const baseData = normalizeIdeaNodeData(node.data)
					return {
						...node,
						data: {
							...baseData,
							onDraftChange: (value: string) => handleNodeDraftChange(node.id, value),
							onCommit: () => handleNodeCommit(node.id),
							onCancel: () => handleNodeCancel(node.id),
						},
					}
				}

				if (isFileNode(node)) {
					const baseData = normalizeFileNodeData(node.data)
					return {
						...node,
						data: {
							...baseData,
							onSelectFile: (file: File) => handleFileNodeSelect(node.id, file),
							onClearFile: () => handleFileNodeClear(node.id),
						},
					}
				}

				if (isNoteSheetNode(node)) {
					const baseData: NoteSheetNodeStateData = {
						blocks: (node.data as NoteSheetNodeStateData)?.blocks ?? createInitialNoteSheetBlocks(),
						focusedBlockId: (node.data as NoteSheetNodeStateData)?.focusedBlockId,
					}
					return {
						...node,
						data: {
							...baseData,
							onBlocksChange: (blockUpdater: (blocks: NoteSheetBlock[]) => NoteSheetBlock[]) =>
								handleNoteSheetBlocksChange(node.id, blockUpdater),
							onFocusBlock: (blockId: string | undefined) =>
								handleNoteSheetFocusChange(node.id, blockId),
						},
					}
				}

				if (isAgentToolNode(node)) {
					const baseData = normalizeAgentToolNodeData(node.data)
					return {
						...node,
						data: {
							...baseData,
							onLabelChange: (value: string) => handleAgentToolLabelChange(node.id, value),
							onInputChange: (inputId: string, field: "key" | "value", value: string) =>
								handleAgentToolInputChange(node.id, inputId, field, value),
							onAddInput: () => handleAgentToolAddInput(node.id),
							onRemoveInput: (inputId: string) => handleAgentToolRemoveInput(node.id, inputId),
						},
					}
				}

				return node as CanvasRenderNode
			}),
		[
			handleAgentToolAddInput,
			handleAgentToolInputChange,
			handleAgentToolLabelChange,
			handleAgentToolRemoveInput,
			handleFileNodeClear,
			handleFileNodeSelect,
			handleNoteSheetBlocksChange,
			handleNoteSheetFocusChange,
			handleNodeCancel,
			handleNodeCommit,
			handleNodeDraftChange,
			nodes,
		],
	)

	const closeMenu = useCallback(() => {
		setMenuState((prev) => ({ ...prev, open: false }))
		setNodeSearchValue("")
	}, [])

	const openMenuAt = useCallback(
		(event: ReactMouseEvent) => {
			if (!reactFlowInstanceRef.current || !canvasRef.current) {
				return
			}

			const bounds = canvasRef.current.getBoundingClientRect()
			const anchorX = event.clientX - bounds.left
			const anchorY = event.clientY - bounds.top
			const flowPosition = reactFlowInstanceRef.current.project({ x: anchorX, y: anchorY })

			setMenuState({
				open: true,
				anchor: { x: anchorX, y: anchorY },
				flowPosition,
			})
			setNodeSearchValue("")
		},
		[],
	)

	const handlePaneClick = useCallback(
		(event: ReactMouseEvent) => {
			openMenuAt(event)
		},
		[openMenuAt],
	)

	const handlePaneContextMenu = useCallback(
		(event: ReactMouseEvent) => {
			event.preventDefault()
			openMenuAt(event)
		},
		[openMenuAt],
	)

	const handleAddNode = useCallback(
		(template: CanvasTemplate) => {
			updateNodes((currentNodes) => {
				const nodeStyle = template.initialStyle
				return [
					...currentNodes,
					{
						id: `node-${template.id}-${nanoid(6)}`,
						position: {
							x: menuState.flowPosition.x,
							y: menuState.flowPosition.y,
						},
						data: template.createData(),
						type: template.nodeType,
						...(nodeStyle ? { style: nodeStyle } : {}),
					},
				]
			})
			closeMenu()
		},
		[closeMenu, menuState.flowPosition.x, menuState.flowPosition.y, updateNodes],
	)

	const handleConnect = useCallback(
		(connection: Connection) => {
			updateEdges((currentEdges) => {
				if (!connection.source || !connection.target || connection.source === connection.target) {
					return currentEdges
				}

				const hasDuplicate = currentEdges.some(
					(edge) =>
						edge.source === connection.source &&
						edge.target === connection.target &&
						edge.sourceHandle === connection.sourceHandle &&
						edge.targetHandle === connection.targetHandle,
				)

				if (hasDuplicate) {
					return currentEdges
				}

				return addEdge(
					{
						...connection,
						id: `edge-${connection.source}-${connection.target}-${nanoid(4)}`,
						type: "smoothstep",
					},
					currentEdges,
				)
			})
		},
		[updateEdges],
	)

	useEffect(() => {
		if (menuState.open) {
			const id = requestAnimationFrame(() => {
				nodeSearchInputRef.current?.focus()
			})
			return () => cancelAnimationFrame(id)
		}
		return undefined
	}, [menuState.open])

	const filteredSurfaces = useMemo(() => {
		if (!searchQuery.trim()) {
			return surfaces
		}

		const query = searchQuery.trim().toLowerCase()

		return surfaces.filter((surface) => {
			const nameMatch = surface.name.toLowerCase().includes(query)
			const summaryMatch = surface.summary?.toLowerCase().includes(query)
			return nameMatch || summaryMatch
		})
	}, [surfaces, searchQuery])

	const activeSurface = useMemo(
		() => surfaces.find((surface) => surface.id === activeSurfaceId),
		[surfaces, activeSurfaceId],
	)

	useEffect(() => {
		if (!activeSurface) {
			setNodesState(createDefaultNodes())
			setEdgesState([])
			return
		}

		setNodesState(activeSurface.nodes)
		setEdgesState(activeSurface.edges)
	}, [activeSurface, setEdgesState, setNodesState])

	useEffect(() => {
		const fallback = t("common:brainstorm.untitled", { defaultValue: "Untitled Surface" })
		const resolvedTitle = activeSurface?.name ?? fallback
		setTitleDraft(resolvedTitle)
		lastCommittedTitleRef.current = resolvedTitle
	}, [activeSurface?.id, activeSurface?.name, t])

	const toggleSidebar = useCallback(() => {
		setIsSidebarOpen((prev) => !prev)
	}, [])

	const handleSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
		setSearchQuery(event.target.value)
	}, [])

	const handleSelectSurface = useCallback((surfaceId: string) => {
		setActiveSurfaceId(surfaceId)
		setSurfaces((prev) => {
			const updated = prev.map((surface) =>
				surface.id === surfaceId ? { ...surface, updatedAt: new Date() } : surface,
			)
			return sortByRecent(updated)
		})
	}, [])

	const handleCreateSurface = useCallback(() => {
		const timestamp = new Date()
		const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `surface-${timestamp.getTime()}`
		const newSurfaceNodes = createDefaultNodes()
		const newSurface: BrainstormSurface = {
			id,
			name: t("common:brainstorm.untitled", { defaultValue: "Untitled Surface" }),
			summary: "",
			updatedAt: timestamp,
			nodes: newSurfaceNodes,
			edges: [],
		}

		setSurfaces((prev) => sortByRecent([newSurface, ...prev]))
		setActiveSurfaceId(id)
		setNodesState(newSurfaceNodes)
		setEdgesState([])
		setIsSidebarOpen(true)
		setSearchQuery("")
	}, [setEdgesState, setNodesState, t])

	const handleTitleInput = useCallback((value: string) => {
		setTitleDraft(value)
	}, [])

	const handleTitleCommit = useCallback(() => {
		if (!activeSurface) {
			return
		}

		const fallback = t("common:brainstorm.untitled", { defaultValue: "Untitled Surface" })
		const trimmed = titleDraft.trim() || fallback

		if (trimmed === activeSurface.name) {
			setTitleDraft(trimmed)
			lastCommittedTitleRef.current = trimmed
			return
		}

		setSurfaces((prev) => {
			const updated = prev.map((surface) =>
				surface.id === activeSurface.id
					? { ...surface, name: trimmed, updatedAt: new Date() }
					: surface,
			)
			return sortByRecent(updated)
		})

		setTitleDraft(trimmed)
		lastCommittedTitleRef.current = trimmed
	}, [activeSurface, titleDraft, t])

	const handleTitleRevert = useCallback(() => {
		setTitleDraft(lastCommittedTitleRef.current)
	}, [])

	const toggleBackgroundVariant = useCallback(() => {
		setBackgroundVariant((prev) =>
			prev === BackgroundVariant.Lines ? BackgroundVariant.Dots : BackgroundVariant.Lines,
		)
	}, [])

	const handleBack = useCallback(() => {
		vscode.postMessage({ type: "action", action: "switchTab", tab: "hub" })
		if (typeof window !== "undefined") {
			window.postMessage({ type: "action", action: "switchTab", tab: "hub" }, "*")
		}
	}, [])

	useEffect(() => {
		if (!initialSurfaceId) {
			return
		}
		setActiveSurfaceId((prev) => {
			if (prev === initialSurfaceId) {
				return prev
			}
			if (surfaces.some((surface) => surface.id === initialSurfaceId)) {
				return initialSurfaceId
			}
			return prev
		})
	}, [initialSurfaceId, surfaces])

	const sidebarAriaLabel = isSidebarOpen
		? t("common:brainstorm.collapseHistory", { defaultValue: "Collapse history panel" })
		: t("common:brainstorm.expandHistory", { defaultValue: "Expand history panel" })

	const historyTitle = t("common:brainstorm.historyTitle", { defaultValue: "Canvas history" })
	const historyDescription = t("common:brainstorm.historyDescription", {
		defaultValue: "Revisit earlier surfaces or spin up something new.",
	})
	const searchPlaceholder = t("common:brainstorm.searchPlaceholder", { defaultValue: "Search surfaces" })
	const searchAriaLabel = t("common:brainstorm.searchAriaLabel", {
		defaultValue: "Search brainstorm surfaces",
	})
	const createLabel = t("common:brainstorm.create", { defaultValue: "New Endless Surface" })
	const noResultsCopy = t("common:brainstorm.missing", {
		defaultValue: "We couldn’t find that Endless Surface.",
	})
	const emptyCopy = t("common:brainstorm.empty", {
		defaultValue: "No surfaces yet. Start a new one to capture ideas.",
	})
	const summaryLabel = t("common:brainstorm.summary", { defaultValue: "Surface summary" })
	const summaryPlaceholder = t("common:brainstorm.summaryPlaceholder", {
		defaultValue: "Add a sentence or two so teammates know what lives here.",
	})
	const backLabel = t("common:goBack", { defaultValue: "Back to Brainstorm Hub" })
	const titlePlaceholder = t("common:brainstorm.untitled", { defaultValue: "Untitled Surface" })
	const titleLabel = t("common:brainstorm.titleInputLabel", { defaultValue: "Canvas title" })
	const toggleBackgroundLabel = t("common:brainstorm.toggleBackground", { defaultValue: "Toggle canvas grid" })
	const nodeMenuHeading = t("common:brainstorm.nodeMenuHeading", { defaultValue: "Add to canvas" })
	const nodeSearchPlaceholder = t("common:brainstorm.nodeSearchPlaceholder", { defaultValue: "Search node types..." })
	const nodeMenuEmptyCopy = t("common:brainstorm.nodeMenuEmpty", { defaultValue: "No node types found." })

	const renderSurfaceMeta = useCallback(
		(surface: BrainstormSurface) =>
			t("common:brainstorm.lastUpdated", {
				time: formatDistanceToNow(surface.updatedAt, { addSuffix: true }),
				defaultValue: `Updated ${formatDistanceToNow(surface.updatedAt, { addSuffix: true })}`,
			}),
		[t],
	)

	const backgroundVariantText =
		backgroundVariant === BackgroundVariant.Lines
			? t("common:brainstorm.backgroundLines", { defaultValue: "Lines grid" })
			: t("common:brainstorm.backgroundDots", { defaultValue: "Dots grid" })

	const lastUpdatedCopy = activeSurface ? renderSurfaceMeta(activeSurface) : undefined

	return (
		<div className="flex h-full w-full flex-col bg-vscode-editor-background text-vscode-editor-foreground">
			<BrainstormAppBar
				backLabel={backLabel}
				onBack={handleBack}
				title={titleDraft}
				titleLabel={titleLabel}
				titlePlaceholder={titlePlaceholder}
				onTitleInput={handleTitleInput}
				onTitleCommit={handleTitleCommit}
				onTitleRevert={handleTitleRevert}
				lastUpdatedCopy={lastUpdatedCopy}
				isHistoryOpen={isSidebarOpen}
				toggleHistoryLabel={sidebarAriaLabel}
				onToggleHistory={toggleSidebar}
				onToggleBackground={toggleBackgroundVariant}
				backgroundVariantText={backgroundVariantText}
				toggleBackgroundLabel={toggleBackgroundLabel}
			/>
			<div className="flex flex-1 overflow-hidden">
				<aside
				className={cn(
					"relative flex h-full flex-shrink-0 flex-col border-r border-vscode-panel-border bg-vscode-sideBar-background transition-[width] duration-200 ease-out",
					isSidebarOpen ? "w-80" : "w-14",
				)}>
				<div className="flex items-center justify-between border-b border-vscode-panel-border px-3 py-3">
					{isSidebarOpen ? (
						<div className="max-w-[180px]">
							<p className="text-xs font-semibold uppercase tracking-wide text-vscode-descriptionForeground">
								{historyTitle}
							</p>
							<p className="mt-1 text-[13px] leading-5 text-vscode-sideBar-foreground">
								{historyDescription}
							</p>
						</div>
					) : (
						<span className="sr-only">{historyTitle}</span>
					)}
					<button
						type="button"
						onClick={toggleSidebar}
						className="inline-flex size-8 items-center justify-center rounded border border-transparent text-vscode-sideBar-foreground transition-colors hover:border-vscode-focusBorder focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder"
						aria-expanded={isSidebarOpen}
						aria-label={sidebarAriaLabel}>
						{isSidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
					</button>
				</div>
				{isSidebarOpen && (
					<>
						<div className="px-3 pt-3">
							<label htmlFor="brainstorm-search" className="sr-only">
								{searchAriaLabel}
							</label>
							<div className="relative">
								<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-vscode-descriptionForeground" />
								<input
									id="brainstorm-search"
									value={searchQuery}
									onChange={handleSearchChange}
									type="search"
									placeholder={searchPlaceholder}
									className="w-full rounded-sm border border-vscode-input-border bg-vscode-input-background px-3 py-1.5 pl-9 text-sm text-vscode-input-foreground shadow-sm transition-colors focus:border-vscode-focusBorder focus:outline-none"
								/>
							</div>
						</div>
						<div className="px-3 pt-3">
							<button
								type="button"
								onClick={handleCreateSurface}
								className="flex w-full items-center justify-center gap-2 rounded-sm border border-vscode-button-border bg-vscode-button-background px-3 py-2 text-sm font-medium text-vscode-button-foreground transition-colors hover:bg-vscode-button-hoverBackground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder">
								<Plus className="size-4" aria-hidden="true" />
								<span>{createLabel}</span>
							</button>
						</div>
						<div className="mt-3 flex-1 overflow-y-auto pb-4">
							{filteredSurfaces.length === 0 ? (
								<p className="px-3 text-sm text-vscode-descriptionForeground">
									{surfaces.length === 0 ? emptyCopy : noResultsCopy}
								</p>
							) : (
								<nav aria-label={historyTitle} className="space-y-2 px-2">
									{filteredSurfaces.map((surface) => {
										const isActive = surface.id === activeSurfaceId
										const relativeUpdated = renderSurfaceMeta(surface)

										return (
											<button
												key={surface.id}
												type="button"
												onClick={() => handleSelectSurface(surface.id)}
												className={cn(
													"w-full rounded-sm border px-3 py-2 text-left transition-colors",
													isActive
														? "border-vscode-list-activeSelectionBackground bg-vscode-list-activeSelectionBackground/60 text-vscode-list-activeSelectionForeground"
														: "border-transparent bg-transparent text-vscode-sideBar-foreground hover:border-vscode-list-hoverBackground hover:bg-vscode-list-hoverBackground",
												)}>
												<p className="text-sm font-medium">{surface.name}</p>
												{surface.summary && (
													<p className="mt-1 text-xs text-vscode-descriptionForeground">{surface.summary}</p>
												)}
												<p className="mt-1 text-xs text-vscode-descriptionForeground">{relativeUpdated}</p>
											</button>
										)
									})}
								</nav>
							)}
						</div>
					</>
				)}
			</aside>
			<main className="flex flex-1 flex-col">
				<header className="border-b border-vscode-panel-border px-6 py-4">
					<div className="flex flex-col gap-2">
						<span className="text-xs font-semibold uppercase tracking-wide text-vscode-descriptionForeground">
							{summaryLabel}
						</span>
						<p className="text-sm text-vscode-descriptionForeground">
							{activeSurface?.summary || summaryPlaceholder}
						</p>
						{lastUpdatedCopy && (
							<p className="text-xs text-vscode-descriptionForeground">{lastUpdatedCopy}</p>
						)}
					</div>
				</header>
				<div className="relative flex-1 overflow-hidden">
					<div className="relative h-full w-full" ref={canvasRef}>
						<ReactFlow
							nodes={nodesWithHandlers}
							edges={edges}
							nodeTypes={nodeTypes}
							onNodesChange={handleNodesChange}
							onEdgesChange={handleEdgesChange}
							onConnect={handleConnect}
							onPaneClick={handlePaneClick}
							onPaneContextMenu={handlePaneContextMenu}
							onNodeDoubleClick={(event, node) => {
								event.preventDefault()
								if (node.type === "brainstorm") {
									startEditingNode(node.id)
								}
							}}
							onInit={(instance) => {
								reactFlowInstanceRef.current = instance
							}}
							fitView
							edgesUpdatable={false}
							zoomOnScroll
							zoomOnPinch
							proOptions={{ hideAttribution: true }}>
							<Background variant={backgroundVariant} gap={24} color="rgba(148, 163, 184, 0.35)" />
						</ReactFlow>

						<Popover
							open={menuState.open}
							onOpenChange={(open) => {
								if (!open) {
									closeMenu()
								}
							}}
						>
							<PopoverAnchor asChild>
								<div
									style={{
										position: "absolute",
										left: menuState.anchor.x,
										top: menuState.anchor.y,
										width: 1,
										height: 1,
										pointerEvents: "none",
								}}
								/>
							</PopoverAnchor>
							<PopoverContent
								className="flex w-[420px] max-h-[480px] min-h-[320px] flex-col overflow-hidden rounded-md border border-vscode-editorWidget-border bg-vscode-editor-background p-0 shadow-xl"
								align="start"
								side="right"
								container={canvasRef.current ?? undefined}>
								<div className="border-b border-vscode-editorWidget-border/80 px-4 py-3">
									<p className="text-sm font-semibold text-vscode-foreground">{nodeMenuHeading}</p>
									<div className="relative mt-3">
										<Search
											className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-vscode-descriptionForeground/80"
											aria-hidden="true"
										/>
										<Input
											ref={nodeSearchInputRef}
											value={nodeSearchValue}
											onChange={(event) => setNodeSearchValue(event.target.value)}
											placeholder={nodeSearchPlaceholder}
											className="w-full rounded-sm border border-vscode-input-border bg-vscode-input-background px-3 py-1.5 pl-9 text-sm text-vscode-input-foreground shadow-sm transition-colors focus:border-vscode-focusBorder focus:outline-none"
											aria-label={nodeMenuHeading}
										/>
									</div>
								</div>
								<div className="flex-1 overflow-y-auto p-3">
								{menuSections.length === 0 ? (
									<div className="flex h-full min-h-[200px] items-center justify-center px-3 text-center text-sm text-vscode-descriptionForeground">
										{nodeMenuEmptyCopy}
									</div>
								) : (
									<div className="space-y-5 pb-1">
										{menuSections.map((section) => {
											return (
												<div key={section.id} className="space-y-2">
													<div className="flex flex-col gap-1 px-1">
														<span className="text-xs font-semibold uppercase tracking-wide text-vscode-descriptionForeground">
															{section.label}
														</span>
														{section.description ? (
															<p className="text-xs leading-relaxed text-vscode-descriptionForeground/80">
																{section.description}
															</p>
														) : null}
													</div>

													<div className="grid gap-2">
														{section.templates.map((template) => {
															const Icon = getTemplateIcon(template)

															return (
																<button
																	key={template.id}
																	type="button"
																	onClick={() => handleAddNode(template)}
																	className="group flex w-full flex-col gap-2 rounded-sm border border-vscode-editorWidget-border/60 bg-vscode-editorWidget-background/95 p-3 text-left transition-colors hover:border-vscode-focusBorder hover:bg-vscode-editorWidget-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder">
																	<div className="flex items-start justify-between gap-2">
																		<div className="flex items-center gap-2">
																			<span className="flex size-8 items-center justify-center rounded-sm border border-vscode-editorWidget-border/80 bg-vscode-editorWidget-background text-vscode-descriptionForeground transition-colors group-hover:border-vscode-focusBorder group-hover:text-vscode-foreground">
																				<Icon className="size-4" aria-hidden="true" />
																			</span>
																			<span className="text-sm font-medium leading-none text-vscode-foreground">
																				{template.name}
																			</span>
																		</div>
																		{template.meta?.toolGroup && (
																			<span className="rounded bg-vscode-badge-background px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-vscode-badge-foreground">
																				{template.meta.toolGroup}
																			</span>
																		)}
																	</div>

																	<p className="text-xs leading-relaxed text-vscode-descriptionForeground">
																		{template.description}
																	</p>

																	{template.meta?.toolId && (
																		<span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wide text-vscode-descriptionForeground/80">
																			<span className="rounded-sm bg-vscode-editorWidget-background px-1 py-0.5">
																				{template.meta.toolId}
																			</span>
																		</span>
																	)}
																</button>
															)
														})}
													</div>
												</div>
											)
										})}
									</div>
								)}
							</div>
						</PopoverContent>
					</Popover>
					</div>
				</div>
			</main>

		</div>
	</div>
	)
}

export default BrainstormCanvas
