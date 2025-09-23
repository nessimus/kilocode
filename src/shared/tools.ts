import { Anthropic } from "@anthropic-ai/sdk"

import type { ClineAsk, ToolProgressStatus, ToolGroup, ToolName } from "@roo-code/types"

export type ToolResponse = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>

export type AskApproval = (
	type: ClineAsk,
	partialMessage?: string,
	progressStatus?: ToolProgressStatus,
	forceApproval?: boolean,
) => Promise<boolean>

export type HandleError = (action: string, error: Error) => Promise<void>

export type PushToolResult = (content: ToolResponse) => void

export type RemoveClosingTag = (tag: ToolParamName, content?: string) => string

export type AskFinishSubTaskApproval = () => Promise<boolean>

export type ToolDescription = () => string

export interface TextContent {
	type: "text"
	content: string
	partial: boolean
}

export const toolParamNames = [
	"command",
	"path",
	"content",
	"context",
	"line_count",
	"regex",
	"file_pattern",
	"recursive",
	"action",
	"url",
	"coordinate",
	"text",
	"server_name",
	"tool_name",
	"arguments",
	"uri",
	"question",
	"result",
	"diff",
	"mode_slug",
	"reason",
	"line",
	"mode",
	"message",
	"cwd",
	"follow_up",
	"task",
	"size",
	"search",
	"replace",
	"use_regex",
	"ignore_case",
	// kilocode_change start
	"title",
	"description",
	"target_file",
	"instructions",
	"code_edit",
	// kilocode_change end
	"company_id",
	"employee_id",
	"department_id",
	"team_id",
	"action_item_id",
	"action_item_ids",
	"name",
	"role",
	"personality",
	"mbti_type",
	"personality_traits",
	"profile_image_url",
	"custom_attributes",
	"is_executive_manager",
	"employees",
	"employee_updates",
	"departments",
	"department_updates",
	"teams",
	"team_updates",
	"assignments",
	"employee_ids",
	"team_ids",
	"department_ids",
	"action_items",
	"action_item_updates",
	"employee",
	"department",
	"team",
	"include_archived",
	"name_contains",
	"args",
	"start_line",
	"end_line",
	"query",
	"web_search_type",
	"todos",
	"prompt",
	"image",
	"kind",
	"status_id",
	"status_ids",
	"owner_employee_id",
	"due_at",
	"priority",
	"custom_properties",
	"limit",
	"sop_name",
	"sop_variant",
	"sop_scope",
] as const

export type ToolParamName = (typeof toolParamNames)[number]

export interface ToolUse {
	type: "tool_use"
	name: ToolName
	// params is a partial record, allowing only some or none of the possible parameters to be used
	params: Partial<Record<ToolParamName, string>>
	partial: boolean
}

export interface ExecuteCommandToolUse extends ToolUse {
	name: "execute_command"
	// Pick<Record<ToolParamName, string>, "command"> makes "command" required, but Partial<> makes it optional
	params: Partial<Pick<Record<ToolParamName, string>, "command" | "cwd">>
}

export interface ReadFileToolUse extends ToolUse {
	name: "read_file"
	params: Partial<Pick<Record<ToolParamName, string>, "args" | "path" | "start_line" | "end_line">>
}

export interface FetchInstructionsToolUse extends ToolUse {
	name: "fetch_instructions"
	params: Partial<Pick<Record<ToolParamName, string>, "task">>
}

export interface WriteToFileToolUse extends ToolUse {
	name: "write_to_file"
	params: Partial<Pick<Record<ToolParamName, string>, "path" | "content" | "line_count">>
}

export interface InsertCodeBlockToolUse extends ToolUse {
	name: "insert_content"
	params: Partial<Pick<Record<ToolParamName, string>, "path" | "line" | "content">>
}

export interface CodebaseSearchToolUse extends ToolUse {
	name: "codebase_search"
	params: Partial<Pick<Record<ToolParamName, string>, "query" | "path">>
}

export interface WebSearchToolUse extends ToolUse {
	name: "web_search"
	params: Partial<Pick<Record<ToolParamName, string>, "query" | "web_search_type" | "context">>
}

export interface SearchFilesToolUse extends ToolUse {
	name: "search_files"
	params: Partial<Pick<Record<ToolParamName, string>, "path" | "regex" | "file_pattern">>
}

export interface ListFilesToolUse extends ToolUse {
	name: "list_files"
	params: Partial<Pick<Record<ToolParamName, string>, "path" | "recursive">>
}

export interface ListCodeDefinitionNamesToolUse extends ToolUse {
	name: "list_code_definition_names"
	params: Partial<Pick<Record<ToolParamName, string>, "path">>
}

export interface BrowserActionToolUse extends ToolUse {
	name: "browser_action"
	params: Partial<Pick<Record<ToolParamName, string>, "action" | "url" | "coordinate" | "text" | "size">>
}

export interface UseMcpToolToolUse extends ToolUse {
	name: "use_mcp_tool"
	params: Partial<Pick<Record<ToolParamName, string>, "server_name" | "tool_name" | "arguments">>
}

export interface AccessMcpResourceToolUse extends ToolUse {
	name: "access_mcp_resource"
	params: Partial<Pick<Record<ToolParamName, string>, "server_name" | "uri">>
}

export interface AskFollowupQuestionToolUse extends ToolUse {
	name: "ask_followup_question"
	params: Partial<Pick<Record<ToolParamName, string>, "question" | "follow_up">>
}

export interface AttemptCompletionToolUse extends ToolUse {
	name: "attempt_completion"
	params: Partial<Pick<Record<ToolParamName, string>, "result">>
}

export interface SwitchModeToolUse extends ToolUse {
	name: "switch_mode"
	params: Partial<Pick<Record<ToolParamName, string>, "mode_slug" | "reason">>
}

export interface NewTaskToolUse extends ToolUse {
	name: "new_task"
	params: Partial<Pick<Record<ToolParamName, string>, "mode" | "message" | "todos">>
}

export interface ReportBugToolUse extends ToolUse {
	name: "report_bug"
	params: Partial<Pick<Record<ToolParamName, string>, "title" | "description">>
}

export interface RunSlashCommandToolUse extends ToolUse {
	name: "run_slash_command"
	params: Partial<Pick<Record<ToolParamName, string>, "command" | "args">>
}

export interface SearchAndReplaceToolUse extends ToolUse {
	name: "search_and_replace"
	params: Required<Pick<Record<ToolParamName, string>, "path" | "search" | "replace">> &
		Partial<Pick<Record<ToolParamName, string>, "use_regex" | "ignore_case" | "start_line" | "end_line">>
}

// kilocode_change start: Morph fast apply
export interface EditFileToolUse extends ToolUse {
	name: "edit_file"
	params: Required<Pick<Record<ToolParamName, string>, "target_file" | "instructions" | "code_edit">>
}
// kilocode_change end

export interface GenerateImageToolUse extends ToolUse {
	name: "generate_image"
	params: Partial<Pick<Record<ToolParamName, string>, "prompt" | "path" | "image">>
}

export interface CreateEmployeeToolUse extends ToolUse {
	name: "create_employee"
	params: Required<Pick<Record<ToolParamName, string>, "company_id" | "name" | "role">> &
		Partial<
			Pick<
				Record<ToolParamName, string>,
				| "description"
				| "personality"
				| "mbti_type"
				| "personality_traits"
				| "profile_image_url"
				| "custom_attributes"
				| "is_executive_manager"
				| "employees"
			>
		>
}

export interface UpdateEmployeeToolUse extends ToolUse {
	name: "update_employee"
	params: Required<Pick<Record<ToolParamName, string>, "company_id" | "employee_id">> &
		Partial<
			Pick<
				Record<ToolParamName, string>,
				| "name"
				| "role"
				| "description"
				| "personality"
				| "mbti_type"
				| "personality_traits"
				| "profile_image_url"
				| "custom_attributes"
				| "is_executive_manager"
				| "employee_updates"
			>
		>
}

export interface CreateDepartmentToolUse extends ToolUse {
	name: "create_department"
	params: Required<Pick<Record<ToolParamName, string>, "company_id" | "name">> &
		Partial<Pick<Record<ToolParamName, string>, "description" | "departments">>
}

export interface UpdateDepartmentToolUse extends ToolUse {
	name: "update_department"
	params: Required<Pick<Record<ToolParamName, string>, "company_id" | "department_id">> &
		Partial<Pick<Record<ToolParamName, string>, "name" | "description" | "department_updates">>
}

export interface CreateTeamToolUse extends ToolUse {
	name: "create_team"
	params: Required<Pick<Record<ToolParamName, string>, "company_id" | "name">> &
		Partial<Pick<Record<ToolParamName, string>, "description" | "department_id" | "teams">>
}

export interface UpdateTeamToolUse extends ToolUse {
	name: "update_team"
	params: Required<Pick<Record<ToolParamName, string>, "company_id" | "team_id">> &
		Partial<Pick<Record<ToolParamName, string>, "name" | "description" | "team_updates">>
}

export interface AssignEmployeeToTeamToolUse extends ToolUse {
	name: "assign_employee_to_team"
	params: Required<Pick<Record<ToolParamName, string>, "company_id" | "team_id" | "employee_id">> &
		Partial<Pick<Record<ToolParamName, string>, "assignments">>
}

export interface AssignTeamToDepartmentToolUse extends ToolUse {
	name: "assign_team_to_department"
	params: Required<Pick<Record<ToolParamName, string>, "company_id" | "team_id">> &
		Partial<Pick<Record<ToolParamName, string>, "department_id" | "assignments">>
}

export interface ArchiveEmployeeToolUse extends ToolUse {
	name: "archive_employee"
	params: Required<Pick<Record<ToolParamName, string>, "company_id" | "employee_id">> &
		Partial<Pick<Record<ToolParamName, string>, "employee_ids">>
}

export interface ArchiveDepartmentToolUse extends ToolUse {
	name: "archive_department"
	params: Required<Pick<Record<ToolParamName, string>, "company_id" | "department_id">> &
		Partial<Pick<Record<ToolParamName, string>, "department_ids">>
}

export interface ArchiveTeamToolUse extends ToolUse {
	name: "archive_team"
	params: Required<Pick<Record<ToolParamName, string>, "company_id" | "team_id">> &
		Partial<Pick<Record<ToolParamName, string>, "team_ids">>
}

export interface RemoveEmployeeFromTeamToolUse extends ToolUse {
	name: "remove_employee_from_team"
	params: Required<Pick<Record<ToolParamName, string>, "company_id" | "team_id" | "employee_id">> &
		Partial<Pick<Record<ToolParamName, string>, "assignments">>
}

export interface RemoveTeamFromDepartmentToolUse extends ToolUse {
	name: "remove_team_from_department"
	params: Required<Pick<Record<ToolParamName, string>, "company_id" | "team_id" | "department_id">> &
		Partial<Pick<Record<ToolParamName, string>, "assignments">>
}

export interface ListCompaniesToolUse extends ToolUse {
	name: "list_companies"
	params: Partial<Pick<Record<ToolParamName, string>, "company_id" | "search" | "include_archived">>
}

export interface ListDepartmentsToolUse extends ToolUse {
	name: "list_departments"
	params: Partial<
		Pick<
			Record<ToolParamName, string>,
			"company_id" | "department_id" | "name_contains" | "include_archived" | "team_id"
		>
	>
}

export interface ListTeamsToolUse extends ToolUse {
	name: "list_teams"
	params: Partial<
		Pick<
			Record<ToolParamName, string>,
			"company_id" | "team_id" | "department_id" | "name_contains" | "include_archived"
		>
	>
}

export interface ListEmployeesToolUse extends ToolUse {
	name: "list_employees"
	params: Partial<
		Pick<
			Record<ToolParamName, string>,
			"company_id" | "employee_id" | "team_id" | "department_id" | "name_contains" | "include_archived"
		>
	>
}

export interface CreateActionItemToolUse extends ToolUse {
	name: "create_action_item"
	params: Required<Pick<Record<ToolParamName, string>, "company_id" | "title" | "kind">> &
		Partial<
			Pick<
				Record<ToolParamName, string>,
				| "status_id"
				| "description"
				| "owner_employee_id"
				| "due_at"
				| "priority"
				| "custom_properties"
				| "action_items"
			>
		>
}

export interface UpdateActionItemToolUse extends ToolUse {
	name: "update_action_item"
	params: Required<Pick<Record<ToolParamName, string>, "company_id" | "action_item_id">> &
		Partial<
			Pick<
				Record<ToolParamName, string>,
				| "title"
				| "kind"
				| "status_id"
				| "description"
				| "owner_employee_id"
				| "due_at"
				| "priority"
				| "custom_properties"
				| "action_item_updates"
			>
		>
}

export interface DeleteActionItemToolUse extends ToolUse {
	name: "delete_action_item"
	params: Required<Pick<Record<ToolParamName, string>, "company_id" | "action_item_id">> &
		Partial<Pick<Record<ToolParamName, string>, "action_item_ids">>
}

export interface ListActionItemsToolUse extends ToolUse {
	name: "list_action_items"
	params: Partial<
		Pick<
			Record<ToolParamName, string>,
			"company_id" | "status_id" | "owner_employee_id" | "kind" | "search" | "limit"
		>
	>
}

// Define tool group configuration
export type ToolGroupConfig = {
	tools: readonly string[]
	alwaysAvailable?: boolean // Whether this group is always available and shouldn't show in prompts view
}

export const TOOL_DISPLAY_NAMES: Record<ToolName, string> = {
	execute_command: "run commands",
	read_file: "read files",
	fetch_instructions: "fetch instructions",
	write_to_file: "write files",
	apply_diff: "apply changes",
	edit_file: "edit file", // kilocode_change: Morph fast apply
	search_files: "search files",
	list_files: "list files",
	list_code_definition_names: "list definitions",
	web_search: "search the web",
	browser_action: "use a browser",
	use_mcp_tool: "use mcp tools",
	access_mcp_resource: "access mcp resources",
	ask_followup_question: "ask questions",
	attempt_completion: "complete tasks",
	switch_mode: "switch modes",
	new_task: "create new task",
	insert_content: "insert content",
	search_and_replace: "search and replace",
	new_rule: "create new rule",
	report_bug: "report bug", // kilocode_change
	condense: "condense the current context window", // kilocode_change
	codebase_search: "codebase search",
	update_todo_list: "update todo list",
	run_slash_command: "run slash command",
	upsert_sop: "create or update SOP",
	generate_image: "generate images",
	create_employee: "create workplace employee",
	update_employee: "update workplace employee",
	create_department: "create department",
	update_department: "update department",
	create_team: "create team",
	update_team: "update team",
	assign_employee_to_team: "assign employee to team",
	assign_team_to_department: "assign team to department",
	archive_employee: "archive workplace employee",
	archive_team: "archive workplace team",
	archive_department: "archive workplace department",
	remove_employee_from_team: "remove employee from team",
	remove_team_from_department: "remove team from department",
	list_companies: "list companies",
	list_departments: "list departments",
	list_teams: "list teams",
	list_employees: "list employees",
	create_action_item: "create action item",
	update_action_item: "update action item",
	delete_action_item: "delete action item",
	list_action_items: "list action items",
} as const

// Define available tool groups.
export const TOOL_GROUPS: Record<ToolGroup, ToolGroupConfig> = {
	read: {
		tools: [
			"read_file",
			"fetch_instructions",
			"search_files",
			"list_files",
			"list_code_definition_names",
			"codebase_search",
			"list_companies",
			"list_departments",
			"list_teams",
			"list_employees",
			"list_action_items",
		],
	},
	edit: {
		tools: [
			"apply_diff",
			"edit_file", // kilocode_change: Morph fast apply
			"write_to_file",
			"insert_content",
			"search_and_replace",
			"new_rule", // kilocode_change
			"generate_image",
			"create_employee",
			"update_employee",
			"create_department",
			"update_department",
			"create_team",
			"update_team",
			"assign_employee_to_team",
			"assign_team_to_department",
			"archive_employee",
			"archive_team",
			"archive_department",
			"remove_employee_from_team",
			"remove_team_from_department",
			"create_action_item",
			"update_action_item",
			"delete_action_item",
			"upsert_sop",
		],
	},
	browser: {
		tools: ["browser_action"],
	},
	web: {
		tools: ["web_search"],
	},
	command: {
		tools: ["execute_command"],
	},
	mcp: {
		tools: ["use_mcp_tool", "access_mcp_resource"],
	},
	modes: {
		tools: ["switch_mode", "new_task"],
		alwaysAvailable: true,
	},
}

// Tools that are always available to all modes.
export const ALWAYS_AVAILABLE_TOOLS: ToolName[] = [
	"ask_followup_question",
	"attempt_completion",
	"switch_mode",
	"new_task",
	"web_search",
	"report_bug",
	"condense", // kilocode_Change
	"update_todo_list",
	"run_slash_command",
	"upsert_sop",
	"create_employee",
	"update_employee",
	"create_department",
	"update_department",
	"create_team",
	"update_team",
	"assign_employee_to_team",
	"assign_team_to_department",
	"archive_employee",
	"archive_team",
	"archive_department",
	"remove_employee_from_team",
	"remove_team_from_department",
	"create_action_item",
	"update_action_item",
	"delete_action_item",
	"list_action_items",
] as const

export type DiffResult =
	| { success: true; content: string; failParts?: DiffResult[] }
	| ({
			success: false
			error?: string
			details?: {
				similarity?: number
				threshold?: number
				matchedRange?: { start: number; end: number }
				searchContent?: string
				bestMatch?: string
			}
			failParts?: DiffResult[]
	  } & ({ error: string } | { failParts: DiffResult[] }))

export interface DiffItem {
	content: string
	startLine?: number
}

export interface DiffStrategy {
	/**
	 * Get the name of this diff strategy for analytics and debugging
	 * @returns The name of the diff strategy
	 */
	getName(): string

	/**
	 * Get the tool description for this diff strategy
	 * @param args The tool arguments including cwd and toolOptions
	 * @returns The complete tool description including format requirements and examples
	 */
	getToolDescription(args: { cwd: string; toolOptions?: { [key: string]: string } }): string

	/**
	 * Apply a diff to the original content
	 * @param originalContent The original file content
	 * @param diffContent The diff content in the strategy's format (string for legacy, DiffItem[] for new)
	 * @param startLine Optional line number where the search block starts. If not provided, searches the entire file.
	 * @param endLine Optional line number where the search block ends. If not provided, searches the entire file.
	 * @returns A DiffResult object containing either the successful result or error details
	 */
	applyDiff(
		originalContent: string,
		diffContent: string | DiffItem[],
		startLine?: number,
		endLine?: number,
	): Promise<DiffResult>

	getProgressStatus?(toolUse: ToolUse, result?: any): ToolProgressStatus
}
