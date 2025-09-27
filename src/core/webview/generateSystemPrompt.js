import * as vscode from "vscode";
import { defaultModeSlug, getModeBySlug, getGroupName } from "../../shared/modes";
import { buildApiHandler } from "../../api";
import { experiments as experimentsModule, EXPERIMENT_IDS } from "../../shared/experiments";
import { SYSTEM_PROMPT } from "../prompts/system";
import { MultiSearchReplaceDiffStrategy } from "../diff/strategies/multi-search-replace";
import { MultiFileSearchReplaceDiffStrategy } from "../diff/strategies/multi-file-search-replace";
export const generateSystemPrompt = async (provider, message) => {
    const state = await provider.getState(); // kilocode_change
    const { apiConfiguration, customModePrompts, customInstructions, browserViewportSize, diffEnabled, mcpEnabled, fuzzyMatchThreshold, experiments, enableMcpServerCreation, browserToolEnabled, language, maxReadFileLine, maxConcurrentFileReads, } = state; // kilocode_change
    // Check experiment to determine which diff strategy to use
    const isMultiFileApplyDiffEnabled = experimentsModule.isEnabled(experiments ?? {}, EXPERIMENT_IDS.MULTI_FILE_APPLY_DIFF);
    const diffStrategy = isMultiFileApplyDiffEnabled
        ? new MultiFileSearchReplaceDiffStrategy(fuzzyMatchThreshold)
        : new MultiSearchReplaceDiffStrategy(fuzzyMatchThreshold);
    const cwd = provider.cwd;
    const mode = message.mode ?? defaultModeSlug;
    const customModes = await provider.customModesManager.getCustomModes();
    const rooIgnoreInstructions = provider.getCurrentTask()?.rooIgnoreController?.getInstructions();
    // Determine if browser tools can be used based on model support, mode, and user settings
    let modelSupportsComputerUse = false;
    // Create a temporary API handler to check if the model supports computer use
    // This avoids relying on an active Cline instance which might not exist during preview
    try {
        const tempApiHandler = buildApiHandler(apiConfiguration);
        // kilocode_change: supports images => supports browser
        modelSupportsComputerUse = tempApiHandler.getModel().info.supportsImages ?? false;
    }
    catch (error) {
        console.error("Error checking if model supports computer use:", error);
    }
    // Check if the current mode includes the browser tool group
    const modeConfig = getModeBySlug(mode, customModes);
    const modeSupportsBrowser = modeConfig?.groups.some((group) => getGroupName(group) === "browser") ?? false;
    // Only enable browser tools if the model supports it, the mode includes browser tools,
    // and browser tools are enabled in settings
    const canUseBrowserTool = modelSupportsComputerUse && modeSupportsBrowser && (browserToolEnabled ?? true);
    console.log("[generateSystemPrompt] invoking SYSTEM_PROMPT", {
        mode,
        activeCompanyId: state.workplaceState?.activeCompanyId,
        activeEmployeeId: state.workplaceState?.activeEmployeeId,
        companyCount: state.workplaceState?.companies?.length ?? 0,
        companyNames: state.workplaceState?.companies?.map((company) => company.name) ?? [],
    });
    const systemPrompt = await SYSTEM_PROMPT(provider.context, cwd, canUseBrowserTool, mcpEnabled ? provider.getMcpHub() : undefined, diffStrategy, browserViewportSize ?? "900x600", mode, customModePrompts, customModes, customInstructions, diffEnabled, experiments, enableMcpServerCreation, language, rooIgnoreInstructions, maxReadFileLine !== -1, {
        maxConcurrentFileReads: maxConcurrentFileReads ?? 5,
        todoListEnabled: apiConfiguration?.todoListEnabled ?? true,
        useAgentRules: vscode.workspace.getConfiguration("kilo-code").get("useAgentRules") ?? true,
        newTaskRequireTodos: vscode.workspace
            .getConfiguration("kilo-code")
            .get("newTaskRequireTodos", false),
    }, 
    // kilocode_change start
    undefined, undefined, state);
    const interactionStrategy = state.browserInteractionStrategy ?? "legacy";
    const strategyDescriptions = {
        legacy: "Use the built-in planner to decide each browser action step-by-step.",
        venus_navi: "Delegate element selection and sequencing to UI Venus Navi for efficient guided navigation.",
        venus_ground: "Allow UI Venus Ground to execute autonomous multi-step UI policies when appropriate.",
    };
    const strategyPrompt = `## browser_interaction_strategy\n- Active strategy: ${interactionStrategy}\n- ${strategyDescriptions[interactionStrategy]} \n- Continuous screencast streaming is available; maintain long-horizon plans without waiting for individual screenshots.`;
    return `${systemPrompt}\n\n${strategyPrompt}`;
};
//# sourceMappingURL=generateSystemPrompt.js.map