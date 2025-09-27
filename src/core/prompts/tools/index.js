import { TOOL_GROUPS, ALWAYS_AVAILABLE_TOOLS } from "../../../shared/tools";
import { getModeConfig, isToolAllowedForMode, getGroupName } from "../../../shared/modes";
import { getExecuteCommandDescription } from "./execute-command";
import { getReadFileDescription } from "./read-file";
import { getSimpleReadFileDescription } from "./simple-read-file";
import { getFetchInstructionsDescription } from "./fetch-instructions";
import { shouldUseSingleFileRead } from "@roo-code/types";
import { getWriteToFileDescription } from "./write-to-file";
import { getSearchFilesDescription } from "./search-files";
import { getListFilesDescription } from "./list-files";
import { getInsertContentDescription } from "./insert-content";
import { getSearchAndReplaceDescription } from "./search-and-replace";
import { getListCodeDefinitionNamesDescription } from "./list-code-definition-names";
import { getBrowserActionDescription } from "./browser-action";
import { getWebSearchDescription } from "./web-search";
import { getAskFollowupQuestionDescription } from "./ask-followup-question";
import { getAttemptCompletionDescription } from "./attempt-completion";
import { getUseMcpToolDescription } from "./use-mcp-tool";
import { getAccessMcpResourceDescription } from "./access-mcp-resource";
import { getSwitchModeDescription } from "./switch-mode";
import { getNewTaskDescription } from "./new-task";
import { getCodebaseSearchDescription } from "./codebase-search";
import { getUpdateTodoListDescription } from "./update-todo-list";
import { getRunSlashCommandDescription } from "./run-slash-command";
import { getUpsertSopDescription } from "./upsert-sop";
import { getGenerateImageDescription } from "./generate-image";
import { isMorphAvailable } from "../../tools/editFileTool";
// kilocode_change start: Morph fast apply
import { getEditFileDescription } from "./edit-file";
// kilocode_change end
import { getCreateEmployeeDescription } from "./create-employee";
import { getArchiveEmployeeDescription } from "./archive-employee";
import { getArchiveTeamDescription } from "./archive-team";
import { getArchiveDepartmentDescription } from "./archive-department";
import { getRemoveEmployeeFromTeamDescription } from "./remove-employee-from-team";
import { getRemoveTeamFromDepartmentDescription } from "./remove-team-from-department";
import { getUpdateEmployeeDescription } from "./update-employee";
import { getCreateDepartmentDescription } from "./create-department";
import { getUpdateDepartmentDescription } from "./update-department";
import { getCreateTeamDescription } from "./create-team";
import { getUpdateTeamDescription } from "./update-team";
import { getAssignEmployeeToTeamDescription } from "./assign-employee-to-team";
import { getAssignTeamToDepartmentDescription } from "./assign-team-to-department";
import { getListCompaniesDescription } from "./list-companies";
import { getListDepartmentsDescription } from "./list-departments";
import { getListTeamsDescription } from "./list-teams";
import { getListEmployeesDescription } from "./list-employees";
import { getCreateActionItemDescription } from "./create-action-item";
import { getUpdateActionItemDescription } from "./update-action-item";
import { getDeleteActionItemDescription } from "./delete-action-item";
import { getListActionItemsDescription } from "./list-action-items";
// Map of tool names to their description functions
const toolDescriptionMap = {
    execute_command: (args) => getExecuteCommandDescription(args),
    read_file: (args) => {
        // Check if the current model should use the simplified read_file tool
        const modelId = args.settings?.modelId;
        if (modelId && shouldUseSingleFileRead(modelId)) {
            return getSimpleReadFileDescription(args);
        }
        return getReadFileDescription(args);
    },
    fetch_instructions: (args) => getFetchInstructionsDescription(args.settings?.enableMcpServerCreation),
    write_to_file: (args) => getWriteToFileDescription(args),
    search_files: (args) => getSearchFilesDescription(args),
    list_files: (args) => getListFilesDescription(args),
    list_code_definition_names: (args) => getListCodeDefinitionNamesDescription(args),
    web_search: (args) => getWebSearchDescription(args),
    browser_action: (args) => getBrowserActionDescription(args),
    ask_followup_question: () => getAskFollowupQuestionDescription(),
    attempt_completion: (args) => getAttemptCompletionDescription(args),
    use_mcp_tool: (args) => getUseMcpToolDescription(args),
    access_mcp_resource: (args) => getAccessMcpResourceDescription(args),
    codebase_search: (args) => getCodebaseSearchDescription(args),
    switch_mode: () => getSwitchModeDescription(),
    new_task: (args) => getNewTaskDescription(args),
    insert_content: (args) => getInsertContentDescription(args),
    search_and_replace: (args) => getSearchAndReplaceDescription(args),
    edit_file: () => getEditFileDescription(), // kilocode_change: Morph fast apply
    apply_diff: (args) => args.diffStrategy ? args.diffStrategy.getToolDescription({ cwd: args.cwd, toolOptions: args.toolOptions }) : "",
    update_todo_list: (args) => getUpdateTodoListDescription(args),
    run_slash_command: () => getRunSlashCommandDescription(),
    upsert_sop: () => getUpsertSopDescription(),
    generate_image: (args) => getGenerateImageDescription(args),
    create_employee: (args) => getCreateEmployeeDescription(args),
    update_employee: () => getUpdateEmployeeDescription(),
    create_department: () => getCreateDepartmentDescription(),
    update_department: () => getUpdateDepartmentDescription(),
    create_team: () => getCreateTeamDescription(),
    update_team: () => getUpdateTeamDescription(),
    assign_employee_to_team: () => getAssignEmployeeToTeamDescription(),
    assign_team_to_department: () => getAssignTeamToDepartmentDescription(),
    archive_employee: () => getArchiveEmployeeDescription(),
    archive_team: () => getArchiveTeamDescription(),
    archive_department: () => getArchiveDepartmentDescription(),
    remove_employee_from_team: () => getRemoveEmployeeFromTeamDescription(),
    remove_team_from_department: () => getRemoveTeamFromDepartmentDescription(),
    list_companies: () => getListCompaniesDescription(),
    list_departments: () => getListDepartmentsDescription(),
    list_teams: () => getListTeamsDescription(),
    list_employees: () => getListEmployeesDescription(),
    create_action_item: () => getCreateActionItemDescription(),
    update_action_item: () => getUpdateActionItemDescription(),
    delete_action_item: () => getDeleteActionItemDescription(),
    list_action_items: () => getListActionItemsDescription(),
};
export function getToolDescriptionsForMode(mode, cwd, supportsComputerUse, codeIndexManager, diffStrategy, browserViewportSize, mcpHub, customModes, experiments, partialReadsEnabled, settings, enableMcpServerCreation, modelId, clineProviderState) {
    const config = getModeConfig(mode, customModes);
    const args = {
        cwd,
        supportsComputerUse,
        diffStrategy,
        browserViewportSize,
        mcpHub,
        partialReadsEnabled,
        settings: {
            ...settings,
            enableMcpServerCreation,
            modelId,
        },
        experiments,
    };
    const tools = new Set();
    // Add tools from mode's groups
    config.groups.forEach((groupEntry) => {
        const groupName = getGroupName(groupEntry);
        const toolGroup = TOOL_GROUPS[groupName];
        if (toolGroup) {
            toolGroup.tools.forEach((tool) => {
                if (isToolAllowedForMode(tool, mode, customModes ?? [], undefined, undefined, experiments ?? {})) {
                    tools.add(tool);
                }
            });
        }
    });
    // Add always available tools
    ALWAYS_AVAILABLE_TOOLS.forEach((tool) => tools.add(tool));
    // Conditionally exclude codebase_search if feature is disabled or not configured
    if (!codeIndexManager ||
        !(codeIndexManager.isFeatureEnabled && codeIndexManager.isFeatureConfigured && codeIndexManager.isInitialized)) {
        tools.delete("codebase_search");
    }
    // kilocode_change start: Morph fast apply
    if (isMorphAvailable(clineProviderState)) {
        // When Morph is enabled, disable traditional editing tools
        const traditionalEditingTools = ["apply_diff", "write_to_file", "insert_content", "search_and_replace"];
        traditionalEditingTools.forEach((tool) => tools.delete(tool));
    }
    else {
        tools.delete("edit_file");
    }
    // kilocode_change end
    // Conditionally exclude update_todo_list if disabled in settings
    if (settings?.todoListEnabled === false) {
        tools.delete("update_todo_list");
    }
    // Conditionally exclude generate_image if experiment is not enabled
    if (!experiments?.imageGeneration) {
        tools.delete("generate_image");
    }
    // Conditionally exclude run_slash_command if experiment is not enabled
    if (!experiments?.runSlashCommand) {
        tools.delete("run_slash_command");
    }
    // Map tool descriptions for allowed tools
    const descriptions = Array.from(tools).map((toolName) => {
        const descriptionFn = toolDescriptionMap[toolName];
        if (!descriptionFn) {
            return undefined;
        }
        return descriptionFn({
            ...args,
            toolOptions: undefined, // No tool options in group-based approach
        });
    });
    return `# Tools\n\n${descriptions.filter(Boolean).join("\n\n")}`;
}
// Export individual description functions for backward compatibility
export { getExecuteCommandDescription, getReadFileDescription, getSimpleReadFileDescription, getFetchInstructionsDescription, getWriteToFileDescription, getSearchFilesDescription, getListFilesDescription, getListCodeDefinitionNamesDescription, getWebSearchDescription, getBrowserActionDescription, getAskFollowupQuestionDescription, getAttemptCompletionDescription, getUseMcpToolDescription, getAccessMcpResourceDescription, getSwitchModeDescription, getInsertContentDescription, getSearchAndReplaceDescription, getEditFileDescription, // kilocode_change: Morph fast apply
getCodebaseSearchDescription, getRunSlashCommandDescription, getUpsertSopDescription, getGenerateImageDescription, getCreateEmployeeDescription, };
//# sourceMappingURL=index.js.map