import { formatResponse } from "../prompts/responses";
function toOptionalString(value) {
    const trimmed = value?.trim();
    return trimmed && trimmed.length ? trimmed : undefined;
}
function parseTeamUpdatesJson(raw, fallbackCompanyId, fallbackTeamId, fallbackName, fallbackDescription) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error("team_updates must be valid JSON (array or object)");
    }
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    if (!entries.length) {
        throw new Error("team_updates must include at least one entry");
    }
    return entries.map((entry, index) => {
        if (!entry || typeof entry !== "object") {
            throw new Error(`team_updates[${index}] must be an object`);
        }
        const record = entry;
        const companyId = toOptionalString(record["company_id"] ??
            record["companyId"] ??
            fallbackCompanyId);
        if (!companyId) {
            throw new Error(`team_updates[${index}] is missing company_id`);
        }
        const teamId = toOptionalString(record["team_id"] ?? record["teamId"] ?? fallbackTeamId);
        if (!teamId) {
            throw new Error(`team_updates[${index}] is missing team_id`);
        }
        const name = toOptionalString((record["name"] ?? fallbackName));
        const description = toOptionalString((record["description"] ?? fallbackDescription));
        if (!name && !description) {
            throw new Error(`team_updates[${index}] requires at least one field to update (name or description)`);
        }
        return { companyId, teamId, name, description };
    });
}
export async function updateTeamTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag) {
    const companyIdRaw = block.params.company_id;
    const teamIdRaw = block.params.team_id;
    const nameRaw = block.params.name;
    const descriptionRaw = block.params.description;
    const updatesRaw = block.params.team_updates;
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({
                tool: "updateTeam",
                company_id: removeClosingTag("company_id", companyIdRaw),
                team_id: removeClosingTag("team_id", teamIdRaw),
                name: removeClosingTag("name", nameRaw),
                description: removeClosingTag("description", descriptionRaw),
                team_updates: removeClosingTag("team_updates", updatesRaw),
            });
            await cline.ask("tool", partialMessage, block.partial).catch(() => { });
            return;
        }
        const defaultCompanyId = toOptionalString(companyIdRaw);
        const defaultTeamId = toOptionalString(teamIdRaw);
        const defaultName = toOptionalString(nameRaw);
        const defaultDescription = toOptionalString(descriptionRaw);
        let updateDescriptors;
        try {
            if (updatesRaw) {
                updateDescriptors = parseTeamUpdatesJson(updatesRaw, defaultCompanyId, defaultTeamId, defaultName, defaultDescription);
            }
            else {
                if (!defaultCompanyId) {
                    throw new Error("company_id is required when team_updates is not provided");
                }
                if (!defaultTeamId) {
                    throw new Error("team_id is required when team_updates is not provided");
                }
                if (!defaultName && !defaultDescription) {
                    throw new Error("Provide at least one field (name or description) to update the team.");
                }
                updateDescriptors = [
                    {
                        companyId: defaultCompanyId,
                        teamId: defaultTeamId,
                        name: defaultName,
                        description: defaultDescription,
                    },
                ];
            }
        }
        catch (error) {
            cline.consecutiveMistakeCount++;
            cline.recordToolError("update_team");
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
            tool: "updateTeam",
            updates: updateDescriptors.map((entry) => ({
                company_id: entry.companyId,
                team_id: entry.teamId,
                name: entry.name,
                description: entry.description,
            })),
        });
        const didApprove = await askApproval("tool", approvalMessage);
        if (!didApprove) {
            pushToolResult("User declined to update the team(s).");
            return;
        }
        const updatedSummaries = [];
        for (const descriptor of updateDescriptors) {
            const currentState = workplaceService.getState();
            const company = currentState.companies.find((entry) => entry.id === descriptor.companyId);
            if (!company) {
                throw new Error(`Company ${descriptor.companyId} not found`);
            }
            const team = company.teams.find((entry) => entry.id === descriptor.teamId);
            if (!team) {
                throw new Error(`Team ${descriptor.teamId} not found in company ${descriptor.companyId}`);
            }
            const updatedTeam = {
                ...team,
                name: descriptor.name ?? team.name,
                description: descriptor.description ?? team.description,
            };
            await workplaceService.updateTeam({ companyId: descriptor.companyId, team: updatedTeam });
            updatedSummaries.push({
                companyId: descriptor.companyId,
                teamId: descriptor.teamId,
                name: updatedTeam.name,
            });
        }
        await provider.postStateToWebview();
        const summary = (() => {
            if (updatedSummaries.length === 1) {
                const single = updatedSummaries[0];
                return `Updated team ${single.name} (${single.teamId}) in company ${single.companyId}.`;
            }
            const companies = Array.from(new Set(updatedSummaries.map((entry) => entry.companyId)));
            const details = updatedSummaries
                .map((entry) => `${entry.name} (${entry.teamId} / ${entry.companyId})`)
                .join(", ");
            return `Updated ${updatedSummaries.length} teams across ${companies.length} companies: ${details}.`;
        })();
        pushToolResult(formatResponse.toolResult(summary));
    }
    catch (error) {
        await handleError("update team", error);
    }
}
//# sourceMappingURL=updateTeamTool.js.map