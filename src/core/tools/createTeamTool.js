import { formatResponse } from "../prompts/responses";
function toOptionalString(value) {
    const trimmed = value?.trim();
    return trimmed && trimmed.length ? trimmed : undefined;
}
function parseTeamsJson(raw, fallbackCompanyId, fallbackDepartmentId, fallbackName, fallbackDescription) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error("teams must be valid JSON (array or object)");
    }
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    if (!entries.length) {
        throw new Error("teams must include at least one entry");
    }
    return entries.map((entry, index) => {
        if (!entry || typeof entry !== "object") {
            throw new Error(`teams[${index}] must be an object`);
        }
        const record = entry;
        const companyId = toOptionalString(record["company_id"] ??
            record["companyId"] ??
            fallbackCompanyId);
        if (!companyId) {
            throw new Error(`teams[${index}] is missing company_id`);
        }
        const name = toOptionalString((record["name"] ?? fallbackName));
        if (!name) {
            throw new Error(`teams[${index}] is missing name`);
        }
        const description = toOptionalString((record["description"] ?? fallbackDescription));
        const departmentId = toOptionalString((record["department_id"] ?? record["departmentId"] ?? fallbackDepartmentId));
        return {
            companyId,
            name,
            description,
            departmentId,
        };
    });
}
export async function createTeamTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag) {
    const companyIdRaw = block.params.company_id;
    const nameRaw = block.params.name;
    const descriptionRaw = block.params.description;
    const departmentIdRaw = block.params.department_id;
    const teamsRaw = block.params.teams;
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({
                tool: "createTeam",
                company_id: removeClosingTag("company_id", companyIdRaw),
                name: removeClosingTag("name", nameRaw),
                description: removeClosingTag("description", descriptionRaw),
                department_id: removeClosingTag("department_id", departmentIdRaw),
                teams: removeClosingTag("teams", teamsRaw),
            });
            await cline.ask("tool", partialMessage, block.partial).catch(() => { });
            return;
        }
        const defaultCompanyId = toOptionalString(companyIdRaw);
        const defaultName = toOptionalString(nameRaw);
        const defaultDescription = toOptionalString(descriptionRaw);
        const defaultDepartmentId = toOptionalString(departmentIdRaw);
        const buildSinglePayloads = () => {
            if (!defaultCompanyId) {
                throw new Error("company_id is required when teams is not provided");
            }
            if (!defaultName) {
                throw new Error("name is required when teams is not provided");
            }
            return [
                {
                    companyId: defaultCompanyId,
                    name: defaultName,
                    description: defaultDescription,
                    departmentId: defaultDepartmentId,
                },
            ];
        };
        let teamPayloads;
        try {
            if (teamsRaw) {
                teamPayloads = parseTeamsJson(teamsRaw, defaultCompanyId, defaultDepartmentId, defaultName, defaultDescription);
            }
            else {
                teamPayloads = buildSinglePayloads();
            }
        }
        catch (error) {
            cline.consecutiveMistakeCount++;
            cline.recordToolError("create_team");
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
            tool: "createTeam",
            teams: teamPayloads.map((payload) => ({
                company_id: payload.companyId,
                name: payload.name,
                description: payload.description,
                department_id: payload.departmentId,
            })),
        });
        const didApprove = await askApproval("tool", approvalMessage);
        if (!didApprove) {
            pushToolResult("User declined to create the team(s).");
            return;
        }
        const createdSummaries = [];
        for (const payload of teamPayloads) {
            await workplaceService.createTeam(payload);
            createdSummaries.push({
                companyId: payload.companyId,
                name: payload.name,
                departmentId: payload.departmentId ?? undefined,
            });
        }
        await provider.postStateToWebview();
        const summary = (() => {
            if (createdSummaries.length === 1) {
                const single = createdSummaries[0];
                const target = single.departmentId ? ` and linked to department ${single.departmentId}` : "";
                return `Created team ${single.name} for company ${single.companyId}${target}.`;
            }
            const companies = Array.from(new Set(createdSummaries.map((entry) => entry.companyId)));
            const details = createdSummaries
                .map((entry) => `${entry.name} (${entry.companyId}${entry.departmentId ? ` -> ${entry.departmentId}` : ""})`)
                .join(", ");
            return `Created ${createdSummaries.length} teams across ${companies.length} companies: ${details}.`;
        })();
        pushToolResult(formatResponse.toolResult(summary));
    }
    catch (error) {
        await handleError("create team", error);
    }
}
//# sourceMappingURL=createTeamTool.js.map