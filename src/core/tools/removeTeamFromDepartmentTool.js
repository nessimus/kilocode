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
function parseAssignmentsJson(raw, fallbackCompanyId, fallbackTeamId, fallbackDepartmentId) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error("assignments must be valid JSON (array or object)");
    }
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    if (!entries.length) {
        throw new Error("assignments must include at least one entry");
    }
    return entries.map((entry, index) => {
        if (!entry || typeof entry !== "object") {
            throw new Error(`assignments[${index}] must be an object`);
        }
        const record = entry;
        const companyId = toOptionalStringFromUnknown(record["company_id"] ?? record["companyId"]) ?? fallbackCompanyId;
        if (!companyId) {
            throw new Error(`assignments[${index}] is missing company_id`);
        }
        const teamId = toOptionalStringFromUnknown(record["team_id"] ?? record["teamId"]) ?? fallbackTeamId;
        if (!teamId) {
            throw new Error(`assignments[${index}] is missing team_id`);
        }
        const departmentId = toOptionalStringFromUnknown(record["department_id"] ?? record["departmentId"]) ?? fallbackDepartmentId;
        if (!departmentId) {
            throw new Error(`assignments[${index}] is missing department_id`);
        }
        return { companyId, teamId, departmentId };
    });
}
export async function removeTeamFromDepartmentTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag) {
    const companyIdRaw = block.params.company_id;
    const teamIdRaw = block.params.team_id;
    const departmentIdRaw = block.params.department_id;
    const assignmentsRaw = block.params.assignments;
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({
                tool: "removeTeamFromDepartment",
                company_id: removeClosingTag("company_id", companyIdRaw),
                team_id: removeClosingTag("team_id", teamIdRaw),
                department_id: removeClosingTag("department_id", departmentIdRaw),
                assignments: removeClosingTag("assignments", assignmentsRaw),
            });
            await cline.ask("tool", partialMessage, block.partial).catch(() => { });
            return;
        }
        const defaultCompanyId = toOptionalString(companyIdRaw);
        const defaultTeamId = toOptionalString(teamIdRaw);
        const defaultDepartmentId = toOptionalString(departmentIdRaw);
        let removals;
        try {
            if (assignmentsRaw) {
                removals = parseAssignmentsJson(assignmentsRaw, defaultCompanyId, defaultTeamId, defaultDepartmentId);
            }
            else {
                if (!defaultCompanyId) {
                    throw new Error("company_id is required when assignments is not provided");
                }
                if (!defaultTeamId) {
                    throw new Error("team_id is required when assignments is not provided");
                }
                if (!defaultDepartmentId) {
                    throw new Error("department_id is required when assignments is not provided");
                }
                removals = [
                    {
                        companyId: defaultCompanyId,
                        teamId: defaultTeamId,
                        departmentId: defaultDepartmentId,
                    },
                ];
            }
        }
        catch (error) {
            cline.consecutiveMistakeCount++;
            cline.recordToolError("remove_team_from_department");
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
            tool: "removeTeamFromDepartment",
            assignments: removals.map((entry) => ({
                company_id: entry.companyId,
                team_id: entry.teamId,
                department_id: entry.departmentId,
            })),
        });
        const didApprove = await askApproval("tool", approvalMessage);
        if (!didApprove) {
            pushToolResult("User declined to adjust team-to-department detachments.");
            return;
        }
        const summaries = [];
        for (const removal of removals) {
            const currentState = workplaceService.getState();
            const company = currentState.companies.find((entry) => entry.id === removal.companyId);
            const team = company?.teams.find((entry) => entry.id === removal.teamId);
            const department = company?.departments.find((entry) => entry.id === removal.departmentId);
            await workplaceService.removeTeamFromDepartment(removal);
            summaries.push({
                companyId: removal.companyId,
                teamId: removal.teamId,
                departmentId: removal.departmentId,
                teamName: team?.name,
                departmentName: department?.name,
            });
        }
        await provider.postStateToWebview();
        const summary = (() => {
            if (summaries.length === 1) {
                const single = summaries[0];
                return `Detached ${single.teamName ?? single.teamId} from ${single.departmentName ?? single.departmentId} in ${single.companyId}.`;
            }
            const details = summaries
                .map((entry) => `${entry.teamName ?? entry.teamId} x ${entry.departmentName ?? entry.departmentId} (${entry.companyId})`)
                .join(", ");
            return `Detached ${summaries.length} team/department pairs across ${new Set(summaries.map((entry) => entry.companyId)).size} companies: ${details}.`;
        })();
        pushToolResult(formatResponse.toolResult(summary));
    }
    catch (error) {
        await handleError("remove team from department", error);
    }
}
//# sourceMappingURL=removeTeamFromDepartmentTool.js.map