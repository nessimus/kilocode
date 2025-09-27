import { formatResponse } from "../prompts/responses";
import { TelemetryService } from "@roo-code/telemetry";
import { TelemetryEventName } from "@roo-code/types";
import { optionalString, parseBooleanFlag, normalizeBooleanInput, normalizeOwnerProfileInput, } from "./helpers/workplace";
function toOptionalText(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value === "string") {
        return optionalString(value);
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return optionalString(String(value));
    }
    return undefined;
}
function parseCompaniesJson(raw, defaults) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error("companies must be valid JSON (object or array)");
    }
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    if (!entries.length) {
        throw new Error("companies must include at least one entry");
    }
    return entries.map((entry, index) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw new Error(`companies[${index}] must be a JSON object`);
        }
        return {
            name: entry["name"] ?? defaults.name,
            emoji: entry["emoji"] ?? defaults.emoji,
            description: entry["description"] ?? defaults.description,
            vision: entry["vision"] ?? defaults.vision,
            mission: entry["mission"] ?? defaults.mission,
            owner_profile: entry["owner_profile"] ??
                entry["ownerProfile"] ??
                defaults.ownerProfile,
            update_default_owner_profile: entry["update_default_owner_profile"] ??
                entry["updateDefaultOwnerProfile"] ??
                defaults.updateDefaultOwnerProfile,
        };
    });
}
function buildCreatePayload(entry, index) {
    const name = toOptionalText(entry.name);
    if (!name) {
        throw new Error(`Company name is required${index >= 0 ? ` (entry ${index + 1})` : ""}`);
    }
    const emoji = toOptionalText(entry.emoji);
    const description = toOptionalText(entry.description);
    const vision = toOptionalText(entry.vision);
    const mission = toOptionalText(entry.mission);
    let ownerProfile;
    try {
        ownerProfile = normalizeOwnerProfileInput(entry.owner_profile);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid owner_profile for company ${name}: ${message}`);
    }
    let updateDefaultOwnerProfile;
    try {
        updateDefaultOwnerProfile = normalizeBooleanInput(entry.update_default_owner_profile, "update_default_owner_profile");
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid update_default_owner_profile for company ${name}: ${message}`);
    }
    return {
        name,
        emoji,
        description,
        vision,
        mission,
        ownerProfile,
        updateDefaultOwnerProfile,
    };
}
export async function createCompanyTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag) {
    const nameRaw = block.params.name;
    const emojiRaw = block.params.emoji;
    const descriptionRaw = block.params.description;
    const visionRaw = block.params.vision;
    const missionRaw = block.params.mission;
    const ownerProfileRaw = block.params.owner_profile;
    const updateDefaultsRaw = block.params.update_default_owner_profile;
    const companiesRaw = block.params.companies;
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({
                tool: "createCompany",
                name: removeClosingTag("name", nameRaw),
                emoji: removeClosingTag("emoji", emojiRaw),
                description: removeClosingTag("description", descriptionRaw),
                vision: removeClosingTag("vision", visionRaw),
                mission: removeClosingTag("mission", missionRaw),
                owner_profile: removeClosingTag("owner_profile", ownerProfileRaw),
                update_default_owner_profile: removeClosingTag("update_default_owner_profile", updateDefaultsRaw),
                companies: removeClosingTag("companies", companiesRaw),
            });
            await cline.ask("tool", partialMessage, block.partial).catch(() => { });
            return;
        }
        let defaultOwnerProfile;
        try {
            defaultOwnerProfile = normalizeOwnerProfileInput(ownerProfileRaw);
        }
        catch (error) {
            throw new Error(error instanceof Error ? error.message : String(error));
        }
        let defaultUpdateOwnerProfile;
        try {
            defaultUpdateOwnerProfile = parseBooleanFlag(updateDefaultsRaw, "update_default_owner_profile");
        }
        catch (error) {
            throw new Error(error instanceof Error ? error.message : String(error));
        }
        const defaults = {
            name: optionalString(nameRaw),
            emoji: optionalString(emojiRaw),
            description: optionalString(descriptionRaw),
            vision: optionalString(visionRaw),
            mission: optionalString(missionRaw),
            ownerProfile: defaultOwnerProfile,
            updateDefaultOwnerProfile: defaultUpdateOwnerProfile,
        };
        let companyInputs;
        if (companiesRaw && companiesRaw.trim()) {
            companyInputs = parseCompaniesJson(companiesRaw, defaults);
        }
        else {
            companyInputs = [
                {
                    name: defaults.name,
                    emoji: defaults.emoji,
                    description: defaults.description,
                    vision: defaults.vision,
                    mission: defaults.mission,
                    owner_profile: defaults.ownerProfile,
                    update_default_owner_profile: defaults.updateDefaultOwnerProfile,
                },
            ];
        }
        const payloads = companyInputs.map((entry, index) => (buildCreatePayload(entry, companyInputs.length > 1 ? index : -1)));
        cline.consecutiveMistakeCount = 0;
        const provider = cline.providerRef.deref();
        if (!provider) {
            pushToolResult(formatResponse.toolError("Provider reference lost"));
            return;
        }
        const workplaceService = provider.getWorkplaceService();
        if (!workplaceService) {
            pushToolResult(formatResponse.toolError("Workplace service is unavailable in this session."));
            return;
        }
        const approvalMessage = JSON.stringify({
            tool: "createCompany",
            companies: payloads.map((payload) => ({
                name: payload.name,
                emoji: payload.emoji,
                description: payload.description,
                vision: payload.vision,
                mission: payload.mission,
                owner_profile: payload.ownerProfile,
                update_default_owner_profile: payload.updateDefaultOwnerProfile,
            })),
        });
        const didApprove = await askApproval("tool", approvalMessage);
        if (!didApprove) {
            pushToolResult("User declined to create the company.");
            return;
        }
        const createdSummaries = [];
        const existingIds = new Set(workplaceService.getState().companies.map((company) => company.id));
        for (const payload of payloads) {
            try {
                const state = await workplaceService.createCompany(payload);
                const created = state.companies.find((company) => !existingIds.has(company.id));
                if (created) {
                    existingIds.add(created.id);
                    createdSummaries.push({
                        id: created.id,
                        name: created.name,
                        vision: created.vision,
                        mission: created.mission,
                    });
                    TelemetryService.instance.captureEvent(TelemetryEventName.CLOVER_WORKPLACE_AUTOMATION, {
                        taskId: cline.taskId,
                        action: "create_company",
                        companyId: created.id,
                        companyName: created.name,
                        success: true,
                        payloadHasEmoji: Boolean(payload.emoji),
                        payloadHasDescription: Boolean(payload.description),
                        payloadHasVision: Boolean(payload.vision),
                        payloadHasMission: Boolean(payload.mission),
                        updatedDefaults: payload.updateDefaultOwnerProfile === true,
                    });
                }
                else {
                    createdSummaries.push({
                        name: payload.name,
                        vision: payload.vision,
                        mission: payload.mission,
                    });
                    TelemetryService.instance.captureEvent(TelemetryEventName.CLOVER_WORKPLACE_AUTOMATION, {
                        taskId: cline.taskId,
                        action: "create_company",
                        companyName: payload.name,
                        success: true,
                        payloadHasEmoji: Boolean(payload.emoji),
                        payloadHasDescription: Boolean(payload.description),
                        payloadHasVision: Boolean(payload.vision),
                        payloadHasMission: Boolean(payload.mission),
                        updatedDefaults: payload.updateDefaultOwnerProfile === true,
                        note: "companyId_not_identified",
                    });
                }
            }
            catch (error) {
                cline.consecutiveMistakeCount++;
                cline.recordToolError("create_company");
                const message = error instanceof Error ? error.message : String(error);
                TelemetryService.instance.captureEvent(TelemetryEventName.CLOVER_WORKPLACE_AUTOMATION, {
                    taskId: cline.taskId,
                    action: "create_company",
                    companyName: payload.name,
                    success: false,
                    error: message,
                });
                pushToolResult(formatResponse.toolError(`Unable to create company ${payload.name}: ${message}`));
                return;
            }
        }
        await provider.postStateToWebview();
        if (!createdSummaries.length) {
            pushToolResult(formatResponse.toolResult("No companies were created."));
            return;
        }
        const summary = (() => {
            if (createdSummaries.length === 1) {
                const single = createdSummaries[0];
                const idSegment = single.id ? ` (id: ${single.id})` : "";
                return `Created company ${single.name}${idSegment}.`;
            }
            const entries = createdSummaries
                .map((entry) => `${entry.name}${entry.id ? ` (id: ${entry.id})` : ""}`)
                .join(", ");
            return `Created ${createdSummaries.length} companies: ${entries}.`;
        })();
        pushToolResult(formatResponse.toolResult(summary));
    }
    catch (error) {
        if (error instanceof Error) {
            cline.consecutiveMistakeCount++;
            cline.recordToolError("create_company");
            pushToolResult(formatResponse.toolError(error.message));
            TelemetryService.instance.captureEvent(TelemetryEventName.CLOVER_WORKPLACE_AUTOMATION, {
                taskId: cline.taskId,
                action: "create_company",
                success: false,
                error: error.message,
            });
        }
        else {
            await handleError("create company", error);
        }
    }
}
//# sourceMappingURL=createCompanyTool.js.map