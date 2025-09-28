import { nanoid } from "nanoid"

import {
	ALWAYS_AVAILABLE_TOOLS,
	TOOL_DISPLAY_NAMES,
	TOOL_GROUPS,
} from "@roo/tools"
import { DEFAULT_MODES, type ToolName } from "@roo-code/types"

import { createInitialNoteSheetBlocks, type NoteSheetBlock } from "./noteSheetModel"
import type { BrainstormFileNodeData } from "./BrainstormFileNode"
import type { NoteSheetNodeStateData } from "./NoteSheetNode"
import type { StickyNoteNodeStateData } from "./StickyNoteNode"
import { createTaskListItem, type TaskListNodeStateData } from "./TaskListNode"
import type { AgentToolNodeData } from "./AgentToolNode"
import type {
	BrainstormNodeData as BrainstormIdeaNodeData,
	BrainstormNodeVariant,
} from "./BrainstormNode"

type NodeTemplateSection = "ideas" | "agentTools"

export interface NodeTemplate<TData> {
	id: string
	name: string
	description: string
	nodeType: string
	section: NodeTemplateSection
	createData: () => TData
	initialStyle?: { width?: number; height?: number }
	searchValue: string
	meta?: {
		toolId?: string
		toolGroup?: string
		toolGroupId?: string
	}
}

type IdeaNodeTemplateData =
	| BrainstormIdeaNodeData
	| BrainstormFileNodeData
	| NoteSheetNodeStateData
	| StickyNoteNodeStateData
	| TaskListNodeStateData

type IdeaTemplateDefinition = Omit<
	NodeTemplate<IdeaNodeTemplateData>,
	"createData" | "searchValue"
> & {
	createData?: () => IdeaNodeTemplateData
}

const IDEA_NODE_TEMPLATES: ReadonlyArray<IdeaTemplateDefinition> = [
	{
		id: "idea",
		name: "Idea",
		description: "Capture a new concept to explore.",
		nodeType: "brainstorm",
		section: "ideas" as const,
	},
	{
		id: "question",
		name: "Question",
		description: "Frame an open question for the team.",
		nodeType: "brainstorm",
		section: "ideas" as const,
	},
	{
		id: "task",
		name: "Task",
		description: "Track a follow-up action from the discussion.",
		nodeType: "brainstorm",
		section: "ideas" as const,
	},
	{
		id: "signal",
		name: "Signal",
		description: "Log a trend, data point, or inspiration.",
		nodeType: "brainstorm",
		section: "ideas" as const,
	},
	{
		id: "note-sheet",
		name: "Note sheet",
		description: "Create a rich, nestable sheet with draggable blocks for meetings and plans.",
		nodeType: "noteSheet",
		section: "ideas" as const,
		initialStyle: { width: 520 },
		createData: () =>
			({
				blocks: createInitialNoteSheetBlocks(),
				focusedBlockId: undefined,
			} satisfies NoteSheetNodeStateData),
	},
	{
		id: "sticky-note",
		name: "Sticky note",
		description: "Drop a colorful sticky for quick thoughts with rich formatting.",
		nodeType: "stickyNote",
		section: "ideas" as const,
		initialStyle: { width: 260 },
		createData: () =>
			({
				color: "sunny",
				content: undefined,
			} satisfies StickyNoteNodeStateData),
	},
	{
		id: "task-list",
		name: "Task list",
		description: "Organize follow-ups with checkboxes and multi-line rich text.",
		nodeType: "taskList",
		section: "ideas" as const,
		initialStyle: { width: 320 },
		createData: () =>
			({
				items: [createTaskListItem()],
			} satisfies TaskListNodeStateData),
	},
	{
		id: "file-note",
		name: "File note",
		description: "Upload a file with a spacious preview for the canvas.",
		nodeType: "fileNote",
		section: "ideas" as const,
		createData: () =>
			({
				fileName: undefined,
				mimeType: undefined,
				size: undefined,
				dataUrl: undefined,
				previewKind: undefined,
				textPreview: undefined,
				isUploading: false,
			} satisfies BrainstormFileNodeData),
	},
]

const IDEA_VARIANT_BY_TEMPLATE: Partial<Record<string, BrainstormNodeVariant>> = {
	idea: "idea",
	question: "question",
	task: "task",
	signal: "signal",
}

export const buildIdeaNodeTemplates = (): NodeTemplate<IdeaNodeTemplateData>[] => {
	return IDEA_NODE_TEMPLATES.map((template) => {
		const defaultCreateData = (): IdeaNodeTemplateData => {
			const variant = IDEA_VARIANT_BY_TEMPLATE[template.id]
			return {
				label: template.name,
				...(variant
					? {
						variant,
						...(variant === "task" ? { completed: false } : {}),
					}
					: {}),
			} satisfies BrainstormIdeaNodeData
		}
		const createData = template.createData ?? defaultCreateData
		let extraKeywords = ""
		if (template.id === "file-note") {
			extraKeywords = " file upload media pdf image audio attachment"
		} else if (template.id === "note-sheet") {
			extraKeywords = " note sheet document checklist rich text block"
		} else if (template.id === "sticky-note") {
			extraKeywords = " sticky note color highlight rich text"
		} else if (template.id === "task-list") {
			extraKeywords = " checklist task list checkbox action items rich text"
		}
		return {
			...template,
			createData,
			searchValue: `${template.name} ${template.description}${extraKeywords}`,
		}
	})
}

const getGroupName = (group: (typeof DEFAULT_MODES)[number]["groups"][number]) =>
	Array.isArray(group) ? group[0] : group

const formatToolGroupLabel = (groupId: string): string => {
	switch (groupId) {
		case "read":
			return "Read"
		case "edit":
			return "Edit"
		case "browser":
			return "Browser"
		case "web":
			return "Web"
		case "command":
			return "Command"
		case "mcp":
			return "MCP"
		case "modes":
			return "Modes"
		default:
			return groupId
	}
}

export const buildAvailableTools = (
	modeSlug: string,
	options: {
		customModes?: typeof DEFAULT_MODES
		browserToolEnabled?: boolean
		mcpEnabled?: boolean
		apiConfiguration?: { todoListEnabled?: boolean }
		experiments?: { imageGeneration?: boolean; runSlashCommand?: boolean }
		codebaseIndexConfig?: { codebaseIndexEnabled?: boolean; codebaseIndexQdrantUrl?: string | null }
	},
): ToolName[] => {
	const {
		customModes = [],
		browserToolEnabled = false,
		mcpEnabled = false,
		apiConfiguration,
		experiments = {},
		codebaseIndexConfig,
	} = options
	const tools = new Set<ToolName>()
	const resolvedMode =
		customModes.find((mode) => mode.slug === modeSlug) ??
		DEFAULT_MODES.find((mode) => mode.slug === modeSlug) ??
		DEFAULT_MODES[0]

	resolvedMode.groups.forEach((group) => {
		const groupName = getGroupName(group)
		const groupConfig = TOOL_GROUPS[groupName as keyof typeof TOOL_GROUPS]
		if (!groupConfig) {
			return
		}
		groupConfig.tools.forEach((tool) => tools.add(tool as ToolName))
	})

	ALWAYS_AVAILABLE_TOOLS.forEach((tool) => tools.add(tool as ToolName))

	if (!browserToolEnabled) {
		tools.delete("browser_action")
	}

	if (!mcpEnabled) {
		tools.delete("use_mcp_tool")
		tools.delete("access_mcp_resource")
	}

	if (apiConfiguration?.todoListEnabled === false) {
		tools.delete("update_todo_list")
	}

	if (!experiments.imageGeneration) {
		tools.delete("generate_image")
	}

	if (!experiments.runSlashCommand) {
		tools.delete("run_slash_command")
	}

	const codebaseEnabled = codebaseIndexConfig?.codebaseIndexEnabled ?? false
	const codebaseConfigured = Boolean(codebaseIndexConfig?.codebaseIndexQdrantUrl)
	if (!codebaseEnabled || !codebaseConfigured) {
		tools.delete("codebase_search")
	}

	return Array.from(tools).sort((a, b) => {
		const nameA = TOOL_DISPLAY_NAMES[a] ?? a
		const nameB = TOOL_DISPLAY_NAMES[b] ?? b
		return nameA.localeCompare(nameB)
	})
}

interface TranslationOptions extends Record<string, unknown> {
	defaultValue?: string
}

interface TranslationContext {
	(key: string, options?: TranslationOptions): string
}

export const buildAgentToolTemplates = (
	tools: ToolName[],
	t: TranslationContext,
): NodeTemplate<AgentToolNodeData>[] => {
	return tools.map((toolId) => {
		const displayName = TOOL_DISPLAY_NAMES[toolId] ?? toolId
		const groupEntry = Object.entries(TOOL_GROUPS).find(([, config]) => config.tools.includes(toolId))
		const groupId = groupEntry ? groupEntry[0] : undefined
		const groupLabel = groupId ? formatToolGroupLabel(groupId) : undefined
		const description = groupLabel
			? t("common:brainstorm.agentToolDescription", {
				defaultValue: `Add the ${displayName} tool (${groupLabel}) to orchestrate it from the canvas.`,
				toolName: displayName,
				group: groupLabel,
			})
			: t("common:brainstorm.agentToolDescriptionFallback", {
				defaultValue: `Add the ${displayName} tool to orchestrate it from the canvas.`,
				toolName: displayName,
			})

		return {
			id: `agent-tool-${toolId}`,
			name: displayName,
			description,
			nodeType: "agentTool",
			section: "agentTools" as const,
			meta: {
				toolId,
				toolGroup: groupLabel,
				toolGroupId: groupId,
			},
			createData: () => ({
				toolId,
				label: displayName,
				description,
				status: "idle",
				inputs: [{ id: `input-${nanoid(6)}`, key: "", value: "" }],
			}),
			searchValue: `${displayName} ${toolId} ${description}`,
		}
	})
}

export type IdeaNodeTemplate = ReturnType<typeof buildIdeaNodeTemplates>[number]
export type AgentToolTemplate = ReturnType<typeof buildAgentToolTemplates>[number]
