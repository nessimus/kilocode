import * as vscode from "vscode";
import * as os from "os";
import { modes, defaultModeSlug, getModeBySlug, getGroupName, getModeSelection } from "../../shared/modes";
import { formatLanguage } from "../../shared/language";
import { isEmpty } from "../../utils/object";
import { CodeIndexManager } from "../../services/code-index/manager";
import { loadSystemPromptFile, interpolatePromptContent } from "./sections/custom-system-prompt";
import { getToolDescriptionsForMode } from "./tools";
import { getRulesSection, getSystemInfoSection, getObjectiveSection, getSharedToolUseSection, getMcpServersSection, getToolUseGuidelinesSection, getCapabilitiesSection, getModesSection, addCustomInstructions, markdownFormattingSection, } from "./sections";
import { getWorkplacePersonaSection } from "./sections/workplace";
// Helper function to get prompt component, filtering out empty objects
export function getPromptComponent(customModePrompts, mode) {
    const component = customModePrompts?.[mode];
    // Return undefined if component is empty
    if (isEmpty(component)) {
        return undefined;
    }
    return component;
}
function resolveWorkplacePersonaDefault(state) {
    console.log("[resolveWorkplacePersonaDefault] input", {
        activeCompanyId: state?.workplaceState?.activeCompanyId,
        activeEmployeeId: state?.workplaceState?.activeEmployeeId,
        companyCount: state?.workplaceState?.companies?.length ?? 0,
    });
    const workplaceState = state?.workplaceState;
    const companies = workplaceState?.companies ?? [];
    if (!companies.length) {
        console.log("[resolveWorkplacePersonaDefault] no companies");
        return undefined;
    }
    const explicitCompanyId = typeof state?.activeWorkplaceCompanyId === "string"
        ? state.activeWorkplaceCompanyId
        : undefined;
    const activeCompanyId = explicitCompanyId ?? workplaceState?.activeCompanyId;
    const company = (activeCompanyId ? companies.find((candidate) => candidate.id === activeCompanyId) : undefined) ?? companies[0];
    if (!company) {
        console.log("[resolveWorkplacePersonaDefault] unable to resolve company", {
            explicitCompanyId,
            activeCompanyId,
        });
        return undefined;
    }
    const explicitPersonaId = typeof state?.activeWorkplacePersonaId === "string"
        ? state.activeWorkplacePersonaId
        : undefined;
    const resolvedEmployeeId = explicitPersonaId ?? workplaceState?.activeEmployeeId ?? company.activeEmployeeId ?? company.executiveManagerId;
    const employee = (resolvedEmployeeId ? company.employees.find((candidate) => candidate.id === resolvedEmployeeId) : undefined) ??
        company.employees[0];
    if (!employee) {
        console.log("[resolveWorkplacePersonaDefault] unable to resolve employee", {
            explicitPersonaId,
            resolvedEmployeeId,
            companyId: company.id,
        });
        return undefined;
    }
    console.log("[resolveWorkplacePersonaDefault] resolved", {
        companyId: company.id,
        companyName: company.name,
        employeeId: employee.id,
        employeeName: employee.name,
    });
    return { company, employee, personaMode: employee.personaMode };
}
function resolveActiveCompanyNameDefault(state) {
    console.log("[resolveActiveCompanyNameDefault] input", {
        activeCompanyId: state?.workplaceState?.activeCompanyId,
        companyCount: state?.workplaceState?.companies?.length ?? 0,
    });
    const workplaceState = state?.workplaceState;
    const companies = workplaceState?.companies ?? [];
    if (!companies.length) {
        console.log("[resolveActiveCompanyNameDefault] no companies");
        return undefined;
    }
    const explicitCompanyId = typeof state?.activeWorkplaceCompanyId === "string"
        ? state.activeWorkplaceCompanyId
        : undefined;
    const activeCompanyId = explicitCompanyId ?? workplaceState?.activeCompanyId;
    const company = (activeCompanyId ? companies.find((candidate) => candidate.id === activeCompanyId) : undefined) ?? companies[0];
    const resolvedName = company?.name;
    console.log("[resolveActiveCompanyNameDefault] resolved", resolvedName);
    return resolvedName;
}
export let resolveWorkplacePersona = resolveWorkplacePersonaDefault;
export let resolveActiveCompanyName = resolveActiveCompanyNameDefault;
export function __setResolveWorkplacePersonaForTests(mock) {
    resolveWorkplacePersona = mock ?? resolveWorkplacePersonaDefault;
}
export function __setResolveActiveCompanyNameForTests(mock) {
    resolveActiveCompanyName = mock ?? resolveActiveCompanyNameDefault;
}
function removeKiloCodeIntro(text) {
    return text.replace(/You are Kilo Code[^.]*\.\s*/i, "").trim();
}
function buildPersonaAwareRoleDefinition(roleDefinition, employee, company, personaMode) {
    const introParts = [];
    const personaLabel = `${employee.name}${employee.role ? `, ${employee.role}` : ""}`;
    const ownerProfile = company.ownerProfile;
    const companyName = (company.name ?? "this organization").trim();
    const ownerFullName = ownerProfile?.name?.trim() || (company.name ? `${companyName} leadership` : "company leadership");
    const ownerFirstName = ownerFullName.split(/\s+/)[0] || ownerFullName;
    const ownerRole = ownerProfile?.role?.trim() || "leadership";
    const workplaceDescriptor = company.name
        ? `the ${companyName} virtual workplace`
        : "this organization's virtual workplace";
    introParts.push(`You are ${personaLabel}.`);
    introParts.push(`You collaborate with ${ownerFullName} (${ownerRole}) at ${companyName}. Refer to them as ${ownerFirstName} in conversation.`);
    introParts.push(`You operate inside Golden Workplace, supporting ${workplaceDescriptor}.`);
    if (company.id) {
        introParts.push(`Active company id: ${company.id}. Reference this when using workforce tools.`);
    }
    introParts.push(`Speak naturally as ${employee.name}; acknowledge the user, ask how you can help, and wait for their direction before acting or using tools.`);
    const activeTeams = (company.teams ?? [])
        .filter((team) => !team.deletedAt && (team.employeeIds ?? []).includes(employee.id))
        .map((team) => ({ id: team.id, name: team.name }));
    const activeDepartments = (company.departments ?? [])
        .filter((department) => !department.deletedAt &&
        (department.teamIds ?? []).some((id) => activeTeams.some((team) => team.id === id)))
        .map((department) => ({ id: department.id, name: department.name }));
    if (activeTeams.length) {
        const teamDescriptor = activeTeams
            .map((team) => (team.name ? `${team.name} (${team.id})` : `${team.id}`))
            .join(", ");
        introParts.push(`You currently belong to teams: ${teamDescriptor}.`);
    }
    if (activeDepartments.length) {
        const departmentDescriptor = activeDepartments
            .map((department) => (department.name ? `${department.name} (${department.id})` : `${department.id}`))
            .join(", ");
        introParts.push(`Associated departments: ${departmentDescriptor}.`);
    }
    if (personaMode?.summary) {
        introParts.push(`Primary operating focus: ${personaMode.summary}.`);
    }
    if (employee.description) {
        introParts.push(`Responsibilities: ${employee.description}.`);
    }
    if (employee.personality) {
        introParts.push(`Personality traits: ${employee.personality}.`);
        introParts.push(`Let this personality guide your tone, pace, and decision-making so every reply sounds like ${employee.name}.`);
    }
    const personalityTraits = employee.personalityTraits ?? [];
    if (personalityTraits.length) {
        introParts.push(`Signature traits: ${personalityTraits.join(", ")}.`);
        introParts.push(`Let those traits inform the way you explain ideas, ask follow-ups, and propose next steps.`);
    }
    introParts.push(`Refer to yourself as ${employee.name} in conversation and never as "Kilo Code" or a generic AI assistant unless directly quoting existing text.`);
    introParts.push(`Keep your focus on ${employee.role} outcomes for ${companyName}. Wait for the user to request work before proposing plans or using tools.`);
    introParts.push(`When describing your capabilities, frame them through your responsibilities within ${companyName}.`);
    const personaIntro = introParts.join(" ");
    const remainingDefinition = removeKiloCodeIntro(roleDefinition);
    return remainingDefinition ? `${personaIntro}\n\n${remainingDefinition}` : personaIntro;
}
function buildIdentityGuard(employee, company, personaMode) {
    if (!employee)
        return "";
    const companyName = (company?.name ?? "this organization").trim();
    const ownerProfile = company?.ownerProfile;
    const ownerFullName = ownerProfile?.name?.trim() || (company?.name ? `${companyName} leadership` : "company leadership");
    const ownerFirstName = ownerFullName.split(/\s+/)[0] || ownerFullName;
    const lines = [
        "====",
        "IDENTITY OVERRIDE",
        "",
        "- Refer to yourself in first person as the named persona.",
        "- Do not call yourself 'Kilo Code' or a generic assistant.",
        "- Stay focused on the user's requests before taking action or using tools.",
    ];
    if (personaMode?.name) {
        lines.push(`- Honor the persona mode "${personaMode.name}" when describing capabilities.`);
    }
    return lines.join("\n");
}
function deriveAllowedGroups(baseGroups, allowed) {
    if (!allowed || !allowed.length) {
        return baseGroups ? [...baseGroups] : [];
    }
    const normalized = new Set(allowed.map((entry) => entry.toLowerCase()));
    const fromBase = (baseGroups ?? []).filter((group) => {
        const name = getGroupName(group).toLowerCase();
        return normalized.has(name);
    });
    if (fromBase.length) {
        return fromBase;
    }
    // Fall back to simple string entries when no base groups match.
    return Array.from(normalized).map((name) => name);
}
function buildPersonaModeConfig(persona, baseMode, allModes) {
    const personaMode = persona.personaMode;
    if (!personaMode) {
        return undefined;
    }
    const inheritedBase = personaMode.baseModeSlug
        ? getModeBySlug(personaMode.baseModeSlug, allModes) || modes.find((m) => m.slug === personaMode.baseModeSlug)
        : undefined;
    const slug = `persona-${persona.employee.id}`;
    return {
        slug,
        name: personaMode.name || `${persona.employee.name} persona mode`,
        iconName: inheritedBase?.iconName ?? baseMode?.iconName,
        roleDefinition: inheritedBase?.roleDefinition ?? baseMode?.roleDefinition ?? "",
        whenToUse: personaMode.summary ?? inheritedBase?.whenToUse ?? baseMode?.whenToUse,
        description: personaMode.summary ?? inheritedBase?.description ?? baseMode?.description,
        customInstructions: personaMode.instructions,
        groups: deriveAllowedGroups(inheritedBase?.groups ?? baseMode?.groups, personaMode.allowedToolGroups),
        source: "project",
    };
}
async function generatePrompt(context, cwd, supportsComputerUse, mode, mcpHub, diffStrategy, browserViewportSize, promptComponent, customModeConfigs, globalCustomInstructions, diffEnabled, experiments, enableMcpServerCreation, language, rooIgnoreInstructions, partialReadsEnabled, settings, todoList, modelId, clineProviderState) {
    if (!context) {
        throw new Error("Extension context is required for generating system prompt");
    }
    // If diff is disabled, don't pass the diffStrategy
    const effectiveDiffStrategy = diffEnabled ? diffStrategy : undefined;
    // Get the full mode config to ensure we have the role definition (used for groups, etc.)
    const modeConfig = getModeBySlug(mode, customModeConfigs) || modes.find((m) => m.slug === mode) || modes[0];
    const { roleDefinition, baseInstructions } = getModeSelection(mode, promptComponent, customModeConfigs);
    // Interpolate persona variables inside mode role/custom instructions as well
    const personaContext = resolveWorkplacePersona(clineProviderState);
    const personaVars = {
        workspace: cwd,
        mode: mode,
        language: language ?? formatLanguage(vscode.env.language),
        shell: vscode.env.shell,
        operatingSystem: os.type(),
        personaName: personaContext?.employee.name,
        personaRole: personaContext?.employee.role,
        personaPersonality: personaContext?.employee.personality,
        personaDescription: personaContext?.employee.description,
        companyName: personaContext?.company.name,
        personaModeName: personaContext?.personaMode?.name,
        personaModeSummary: personaContext?.personaMode?.summary,
    };
    const roleDefinitionInterpolated = interpolatePromptContent(roleDefinition, personaVars);
    const personaAwareRoleDefinition = personaContext
        ? buildPersonaAwareRoleDefinition(roleDefinitionInterpolated, personaContext.employee, personaContext.company, personaContext.personaMode)
        : roleDefinition;
    const workplacePersonaSection = personaContext ? getWorkplacePersonaSection(clineProviderState) : "";
    // Check if MCP functionality should be included
    const hasMcpGroup = modeConfig.groups.some((groupEntry) => getGroupName(groupEntry) === "mcp");
    const hasMcpServers = mcpHub && mcpHub.getServers().length > 0;
    const shouldIncludeMcp = hasMcpGroup && hasMcpServers;
    const [modesSection, mcpServersSection] = await Promise.all([
        getModesSection(context),
        shouldIncludeMcp
            ? getMcpServersSection(mcpHub, effectiveDiffStrategy, enableMcpServerCreation)
            : Promise.resolve(""),
    ]);
    const codeIndexManager = CodeIndexManager.getInstance(context, cwd);
    const customInstructionBlock = await addCustomInstructions(baseInstructions, globalCustomInstructions || "", cwd, mode, {
        language: language ?? formatLanguage(vscode.env.language),
        rooIgnoreInstructions,
        localRulesToggleState: context.workspaceState.get("localRulesToggles"), // kilocode_change
        globalRulesToggleState: context.globalState.get("globalRulesToggles"), // kilocode_change
        settings,
    });
    const promptSections = [
        personaAwareRoleDefinition,
        workplacePersonaSection,
        markdownFormattingSection(),
        getSharedToolUseSection(),
        getToolDescriptionsForMode(mode, cwd, supportsComputerUse, codeIndexManager, effectiveDiffStrategy, browserViewportSize, shouldIncludeMcp ? mcpHub : undefined, customModeConfigs, experiments, partialReadsEnabled, settings, enableMcpServerCreation, modelId, clineProviderState),
        getToolUseGuidelinesSection(codeIndexManager),
        mcpServersSection,
        getCapabilitiesSection(cwd, supportsComputerUse, shouldIncludeMcp ? mcpHub : undefined, effectiveDiffStrategy, codeIndexManager, clineProviderState /* kilocode_change */),
        modesSection,
        getRulesSection(cwd, supportsComputerUse, effectiveDiffStrategy, codeIndexManager, clineProviderState /* kilocode_change */),
        getSystemInfoSection(cwd),
        getObjectiveSection(codeIndexManager, experiments),
        // Also allow persona variables inside base mode instructions
        interpolatePromptContent(customInstructionBlock, personaVars),
        buildIdentityGuard(personaContext?.employee, personaContext?.company, personaContext?.personaMode),
    ];
    const basePrompt = promptSections
        .filter((section) => typeof section === "string" && section.trim().length > 0)
        .map((section) => section.trim())
        .join("\n\n");
    return basePrompt;
}
export const SYSTEM_PROMPT = async (context, cwd, supportsComputerUse, mcpHub, diffStrategy, browserViewportSize, inputMode = defaultModeSlug, // kilocode_change: name changed to inputMode
customModePrompts, customModes, globalCustomInstructions, diffEnabled, experiments, // kilocode_change: type
enableMcpServerCreation, language, rooIgnoreInstructions, partialReadsEnabled, settings, todoList, modelId, clineProviderState) => {
    if (!context) {
        throw new Error("Extension context is required for generating system prompt");
    }
    const baseModeSlug = getModeBySlug(inputMode, customModes)?.slug || modes.find((m) => m.slug === inputMode)?.slug || defaultModeSlug; // kilocode_change: don't try to use non-existent modes
    // Determine active persona early so file prompts can interpolate it
    console.log("[SYSTEM_PROMPT] incoming workplace state", {
        activeCompanyId: clineProviderState?.workplaceState?.activeCompanyId,
        activeEmployeeId: clineProviderState?.workplaceState?.activeEmployeeId,
        companyCount: clineProviderState?.workplaceState?.companies?.length ?? 0,
        companySummaries: clineProviderState?.workplaceState?.companies?.map((company) => ({
            id: company.id,
            name: company.name,
            employeeCount: company.employees.length,
            employees: company.employees.map((employee) => ({
                id: employee.id,
                name: employee.name,
                role: employee.role,
                isExecutiveManager: employee.isExecutiveManager ?? false,
                personaModeName: employee.personaMode?.name,
            })),
        })) ?? [],
    });
    const personaContextForFile = resolveWorkplacePersona(clineProviderState);
    console.log("[SYSTEM_PROMPT] personaContextForFile", {
        companyId: personaContextForFile?.company.id,
        companyName: personaContextForFile?.company.name,
        employeeId: personaContextForFile?.employee.id,
        employeeName: personaContextForFile?.employee.name,
    });
    const activeTeamIds = personaContextForFile
        ? (personaContextForFile.company.teams ?? [])
            .filter((team) => !team.deletedAt && (team.employeeIds ?? []).includes(personaContextForFile.employee.id))
            .map((team) => team.id)
            .filter((id) => Boolean(id))
        : [];
    const activeDepartmentIds = personaContextForFile
        ? (personaContextForFile.company.departments ?? [])
            .filter((department) => !department.deletedAt && (department.teamIds ?? []).some((id) => activeTeamIds.includes(id)))
            .map((department) => department.id)
            .filter((id) => Boolean(id))
        : [];
    const baseModeForPersona = getModeBySlug(baseModeSlug, customModes) || modes.find((m) => m.slug === baseModeSlug);
    const personaModeConfig = personaContextForFile
        ? buildPersonaModeConfig(personaContextForFile, baseModeForPersona, customModes)
        : undefined;
    const effectiveModeSlug = personaModeConfig?.slug ?? baseModeSlug;
    const augmentedCustomModes = personaModeConfig ? [...(customModes ?? []), personaModeConfig] : customModes;
    const companyNameFromState = resolveActiveCompanyName(clineProviderState);
    // Try to load custom system prompt from file (supports {{personaName}} etc.)
    const variablesForPrompt = {
        workspace: cwd,
        mode: effectiveModeSlug,
        language: language ?? formatLanguage(vscode.env.language),
        shell: vscode.env.shell,
        operatingSystem: os.type(),
        personaName: personaContextForFile?.employee.name,
        personaRole: personaContextForFile?.employee.role,
        personaPersonality: personaContextForFile?.employee.personality,
        personaDescription: personaContextForFile?.employee.description,
        companyName: companyNameFromState ?? personaContextForFile?.company.name,
        companyId: personaContextForFile?.company.id,
        personaModeName: personaContextForFile?.personaMode?.name,
        personaModeSummary: personaContextForFile?.personaMode?.summary,
        employeeId: personaContextForFile?.employee.id,
        teamIds: activeTeamIds.length ? activeTeamIds.join(",") : undefined,
        departmentIds: activeDepartmentIds.length ? activeDepartmentIds.join(",") : undefined,
    };
    console.log("[SYSTEM_PROMPT] company binding", {
        companyNameFromState,
        personaCompanyName: personaContextForFile?.company.name,
        selectedCompanyName: variablesForPrompt.companyName,
    });
    const fileCustomSystemPrompt = await loadSystemPromptFile(cwd, effectiveModeSlug, variablesForPrompt);
    // Check if it's a custom mode
    const promptComponent = getPromptComponent(customModePrompts, effectiveModeSlug);
    // Get full mode config from custom modes or fall back to built-in modes
    const currentMode = getModeBySlug(effectiveModeSlug, augmentedCustomModes) ||
        modes.find((m) => m.slug === effectiveModeSlug) ||
        personaModeConfig ||
        modes[0];
    // If a file-based custom system prompt exists, use it
    if (fileCustomSystemPrompt) {
        const { roleDefinition, baseInstructions: baseInstructionsForFile } = getModeSelection(effectiveModeSlug, promptComponent, augmentedCustomModes);
        const customInstructions = await addCustomInstructions(baseInstructionsForFile, globalCustomInstructions || "", cwd, effectiveModeSlug, {
            language: language ?? formatLanguage(vscode.env.language),
            rooIgnoreInstructions,
            settings,
        });
        const personaContext = resolveWorkplacePersona(clineProviderState);
        const personaAwareRoleDefinition = personaContext
            ? buildPersonaAwareRoleDefinition(roleDefinition, personaContext.employee, personaContext.company, personaContext.personaMode)
            : roleDefinition;
        const workplacePersonaSection = personaContext ? getWorkplacePersonaSection(clineProviderState) : "";
        const personaSectionBlock = workplacePersonaSection ? `\n\n${workplacePersonaSection}` : "";
        // For file-based prompts, don't include the tool sections, but append a guard that enforces identity
        const identityGuard = buildIdentityGuard(personaContext?.employee, personaContext?.company, personaContext?.personaMode);
        return `${personaAwareRoleDefinition}${personaSectionBlock}

${fileCustomSystemPrompt}

${customInstructions}

${identityGuard}`;
    }
    // If diff is disabled, don't pass the diffStrategy
    const effectiveDiffStrategy = diffEnabled ? diffStrategy : undefined;
    return generatePrompt(context, cwd, supportsComputerUse, currentMode.slug, mcpHub, effectiveDiffStrategy, browserViewportSize, promptComponent, augmentedCustomModes, globalCustomInstructions, diffEnabled, experiments, enableMcpServerCreation, language, rooIgnoreInstructions, partialReadsEnabled, settings, todoList, modelId, clineProviderState);
};
//# sourceMappingURL=system.js.map