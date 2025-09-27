import { formatResponse } from "../prompts/responses";
function toOptionalString(value) {
    const trimmed = value?.trim();
    return trimmed && trimmed.length ? trimmed : undefined;
}
function toOptionalStringFromUnknown(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value === "string") {
        return toOptionalString(value);
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return toOptionalString(String(value));
    }
    return undefined;
}
function parseArchiveJson(raw, fallbackCompanyId, fallbackTeamId) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error("team_ids must be valid JSON (array or object)");
    }
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) {
        if (!fallbackCompanyId) {
            throw new Error("team_ids array requires a top-level company_id");
        }
        return parsed.map((id, index) => {
            const teamId = toOptionalString(id);
            if (!teamId) {
                throw new Error(`team_ids[${index}] is empty`);
            }
            return { companyId: fallbackCompanyId, teamId };
        });
    }
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    if (!entries.length) {
        throw new Error("team_ids must include at least one entry");
    }
    return entries.map((entry, index) => {
        if (!entry || typeof entry !== "object") {
            throw new Error(`team_ids[${index}] must be an object or string`);
        }
        const record = entry;
        const companyId = toOptionalStringFromUnknown(record["company_id"] ?? record["companyId"]) ?? fallbackCompanyId;
        if (!companyId) {
            throw new Error(`team_ids[${index}] is missing company_id`);
        }
        const teamId = toOptionalStringFromUnknown(record["team_id"] ?? record["teamId"]) ?? fallbackTeamId;
        if (!teamId) {
            throw new Error(`team_ids[${index}] is missing team_id`);
        }
        return { companyId, teamId };
    });
}
export async function archiveTeamTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag) {
    const companyIdRaw = block.params.company_id;
    const teamIdRaw = block.params.team_id;
    const teamIdsRaw = block.params.team_ids;
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({
                tool: "archiveTeam",
                company_id: removeClosingTag("company_id", companyIdRaw),
                team_id: removeClosingTag("team_id", teamIdRaw),
                team_ids: removeClosingTag("team_ids", teamIdsRaw),
            });
            await cline.ask("tool", partialMessage, block.partial).catch(() => { });
            return;
        }
        const defaultCompanyId = toOptionalString(companyIdRaw);
        const defaultTeamId = toOptionalString(teamIdRaw);
        let archives;
        try {
            if (teamIdsRaw) {
                archives = parseArchiveJson(teamIdsRaw, defaultCompanyId, defaultTeamId);
            }
            else {
                if (!defaultCompanyId) {
                    throw new Error("company_id is required when team_ids is not provided");
                }
                if (!defaultTeamId) {
                    throw new Error("team_id is required when team_ids is not provided");
                }
                archives = [{ companyId: defaultCompanyId, teamId: defaultTeamId }];
            }
        }
        catch (error) {
            cline.consecutiveMistakeCount++;
            cline.recordToolError("archive_team");
            pushToolResult(formatResponse.toolError(error instanceof Error ? error.message : String(error)));
            return;
        }
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
            tool: "archiveTeam",
            teams: archives.map((entry) => ({
                company_id: entry.companyId,
                team_id: entry.teamId,
            })),
        });
        const didApprove = await askApproval("tool", approvalMessage);
        if (!didApprove) {
            pushToolResult("User declined to archive the team(s).");
            return;
        }
        const summaries = [];
        for (const entry of archives) {
            const currentState = workplaceService.getState();
            const company = currentState.companies.find((candidate) => candidate.id === entry.companyId);
            const team = company?.teams.find((candidate) => candidate.id === entry.teamId);
            await workplaceService.archiveTeam(entry);
            summaries.push({ companyId: entry.companyId, teamId: entry.teamId, name: team?.name });
        }
        await provider.postStateToWebview();
        const summary = (() => {
            if (summaries.length === 1) {
                const single = summaries[0];
                return single.name
                    ? `Archived team ${single.name} (${single.teamId}) in company ${single.companyId}.`
                    : `Archived team ${single.teamId} in company ${single.companyId}.`;
            }
            const details = summaries
                .map((entry) => `${entry.name ?? entry.teamId} (${entry.teamId} / ${entry.companyId})`)
                .join(", ");
            return `Archived ${summaries.length} teams across ${new Set(summaries.map((entry) => entry.companyId)).size} companies: ${details}.`;
        })();
        pushToolResult(formatResponse.toolResult(summary));
    }
    catch (error) {
        await handleError("archive team", error);
    }
}
//# sourceMappingURL=archiveTeamTool.js.map