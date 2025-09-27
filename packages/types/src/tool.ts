import { z } from "zod"

/**
 * ToolGroup
 */

export const toolGroups = ["read", "edit", "browser", "web", "command", "mcp", "modes"] as const

export const toolGroupsSchema = z.enum(toolGroups)

export type ToolGroup = z.infer<typeof toolGroupsSchema>

/**
 * ToolName
 */

export const toolNames = [
	"execute_command",
	"read_file",
	"write_to_file",
	"apply_diff",
	"insert_content",
	"search_and_replace",
	"search_files",
	"list_files",
	"list_code_definition_names",
	"web_search",
	"browser_action",
	"use_mcp_tool",
	"access_mcp_resource",
	"ask_followup_question",
	"attempt_completion",
	"switch_mode",
	"new_task",
	"fetch_instructions",
	"codebase_search",
	// kilocode_change start
	"edit_file",
	"new_rule",
	"report_bug",
	"condense",
	// kilocode_change end
	"update_todo_list",
	"run_slash_command",
	"upsert_sop",
	"generate_image",
	"create_company",
	"update_company",
	"create_employee",
	"update_employee",
	"create_department",
	"update_department",
	"create_team",
	"update_team",
	"delete_company",
	"assign_employee_to_team",
	"assign_team_to_department",
	"archive_employee",
	"archive_team",
	"archive_department",
	"remove_employee_from_team",
	"remove_team_from_department",
	"list_companies",
	"list_departments",
	"list_teams",
	"list_employees",
	"create_action_item",
	"update_action_item",
	"delete_action_item",
	"list_action_items",
] as const

export const toolNamesSchema = z.enum(toolNames)

export type ToolName = z.infer<typeof toolNamesSchema>

/**
 * ToolUsage
 */

export const toolUsageSchema = z.record(
	toolNamesSchema,
	z.object({
		attempts: z.number(),
		failures: z.number(),
	}),
)

export type ToolUsage = z.infer<typeof toolUsageSchema>
