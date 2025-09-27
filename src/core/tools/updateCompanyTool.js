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
function parseCompanyUpdatesJson(raw, defaults) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error("company_updates must be valid JSON (object or array)");
    }
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    if (!entries.length) {
        throw new Error("company_updates must include at least one entry");
    }
    return entries.map((entry, index) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw new Error(`company_updates[${index}] must be a JSON object`);
        }
        const record = entry;
        return {
            company_id: record["company_id"] ??
                record["companyId"] ??
                defaults.companyId,
            name: record["name"] ?? defaults.name,
            emoji: record["emoji"] ?? defaults.emoji,
            description: record["description"] ?? defaults.description,
            vision: record["vision"] ?? defaults.vision,
            mission: record["mission"] ?? defaults.mission,
            owner_profile: record["owner_profile"] ??
                record["ownerProfile"] ??
                defaults.ownerProfile,
            update_default_owner_profile: record["update_default_owner_profile"] ??
                record["updateDefaultOwnerProfile"] ??
                defaults.updateDefaultOwnerProfile,
        };
    });
}
function buildUpdatePayload(entry, index) {
    const companyId = toOptionalText(entry.company_id);
    if (!companyId) {
        throw new Error(`company_id is required${index >= 0 ? ` (entry ${index + 1})` : ""}`);
    }
    const name = toOptionalText(entry.name);
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
        throw new Error(`Invalid owner_profile for company ${companyId}: ${message}`);
    }
    let updateDefaultOwnerProfile;
    try {
        updateDefaultOwnerProfile = normalizeBooleanInput(entry.update_default_owner_profile, "update_default_owner_profile");
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid update_default_owner_profile for company ${companyId}: ${message}`);
    }
    return {
        id: companyId,
        name,
        emoji,
        description,
        vision,
        mission,
        ownerProfile,
        updateDefaultOwnerProfile,
    };
}
export async function updateCompanyTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag) {
    const companyIdRaw = block.params.company_id;
    const nameRaw = block.params.name;
    const emojiRaw = block.params.emoji;
    const descriptionRaw = block.params.description;
    const visionRaw = block.params.vision;
    const missionRaw = block.params.mission;
    const ownerProfileRaw = block.params.owner_profile;
    const updateDefaultsRaw = block.params.update_default_owner_profile;
    const companyUpdatesRaw = block.params.company_updates;
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({
                tool: "updateCompany",
                company_id: removeClosingTag("company_id", companyIdRaw),
                name: removeClosingTag("name", nameRaw),
                emoji: removeClosingTag("emoji", emojiRaw),
                description: removeClosingTag("description", descriptionRaw),
                vision: removeClosingTag("vision", visionRaw),
                mission: removeClosingTag("mission", missionRaw),
                owner_profile: removeClosingTag("owner_profile", ownerProfileRaw),
                update_default_owner_profile: removeClosingTag("update_default_owner_profile", updateDefaultsRaw),
                company_updates: removeClosingTag("company_updates", companyUpdatesRaw),
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
            companyId: optionalString(companyIdRaw),
            name: optionalString(nameRaw),
            emoji: optionalString(emojiRaw),
            description: optionalString(descriptionRaw),
            vision: optionalString(visionRaw),
            mission: optionalString(missionRaw),
            ownerProfile: defaultOwnerProfile,
            updateDefaultOwnerProfile: defaultUpdateOwnerProfile,
        };
        let updateInputs;
        if (companyUpdatesRaw && companyUpdatesRaw.trim()) {
            updateInputs = parseCompanyUpdatesJson(companyUpdatesRaw, defaults);
        }
        else {
            updateInputs = [
                {
                    company_id: defaults.companyId,
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
        const payloads = updateInputs.map((entry, index) => (buildUpdatePayload(entry, updateInputs.length > 1 ? index : -1)));
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
            tool: "updateCompany",
            updates: payloads.map((payload) => ({
                company_id: payload.id,
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
            pushToolResult("User declined to update the company.");
            return;
        }
        const updatedSummaries = [];
        for (const payload of payloads) {
            try {
                const state = await workplaceService.updateCompany(payload);
                const updated = state.companies.find((company) => company.id === payload.id);
                updatedSummaries.push({ id: payload.id, name: updated?.name ?? payload.name });
                TelemetryService.instance.captureEvent(TelemetryEventName.CLOVER_WORKPLACE_AUTOMATION, {
                    taskId: cline.taskId,
                    action: "update_company",
                    companyId: payload.id,
                    companyName: updated?.name ?? payload.name,
                    success: true,
                    changes: Object.entries({
                        name: payload.name,
                        emoji: payload.emoji,
                        description: payload.description,
                        vision: payload.vision,
                        mission: payload.mission,
                        ownerProfile: payload.ownerProfile ? true : undefined,
                        updateDefaultOwnerProfile: payload.updateDefaultOwnerProfile,
                    })
                        .filter(([, value]) => value !== undefined)
                        .map(([key]) => key),
                });
            }
            catch (error) {
                cline.consecutiveMistakeCount++;
                cline.recordToolError("update_company");
                const message = error instanceof Error ? error.message : String(error);
                TelemetryService.instance.captureEvent(TelemetryEventName.CLOVER_WORKPLACE_AUTOMATION, {
                    taskId: cline.taskId,
                    action: "update_company",
                    companyId: payload.id,
                    companyName: payload.name,
                    success: false,
                    error: message,
                });
                pushToolResult(formatResponse.toolError(`Unable to update company ${payload.id}: ${message}`));
                return;
            }
        }
        await provider.postStateToWebview();
        if (!updatedSummaries.length) {
            pushToolResult(formatResponse.toolResult("No companies were updated."));
            return;
        }
        const summary = (() => {
            if (updatedSummaries.length === 1) {
                const single = updatedSummaries[0];
                return `Updated company ${single.name ?? single.id} (id: ${single.id}).`;
            }
            const entries = updatedSummaries
                .map((entry) => `${entry.name ?? entry.id} (id: ${entry.id})`)
                .join(", ");
            return `Updated ${updatedSummaries.length} companies: ${entries}.`;
        })();
        pushToolResult(formatResponse.toolResult(summary));
    }
    catch (error) {
        if (error instanceof Error) {
            cline.consecutiveMistakeCount++;
            cline.recordToolError("update_company");
            pushToolResult(formatResponse.toolError(error.message));
            TelemetryService.instance.captureEvent(TelemetryEventName.CLOVER_WORKPLACE_AUTOMATION, {
                taskId: cline.taskId,
                action: "update_company",
                success: false,
                error: error.message,
            });
        }
        else {
            await handleError("update company", error);
        }
    }
}
//# sourceMappingURL=updateCompanyTool.js.map