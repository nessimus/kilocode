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
function parseAssignmentsJson(raw, fallbackCompanyId, fallbackTeamId, fallbackEmployeeId) {
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
        const employeeId = toOptionalStringFromUnknown(record["employee_id"] ?? record["employeeId"]) ?? fallbackEmployeeId;
        if (!employeeId) {
            throw new Error(`assignments[${index}] is missing employee_id`);
        }
        return { companyId, teamId, employeeId };
    });
}
export async function assignEmployeeToTeamTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag) {
    const companyIdRaw = block.params.company_id;
    const teamIdRaw = block.params.team_id;
    const employeeIdRaw = block.params.employee_id;
    const assignmentsRaw = block.params.assignments;
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({
                tool: "assignEmployeeToTeam",
                company_id: removeClosingTag("company_id", companyIdRaw),
                team_id: removeClosingTag("team_id", teamIdRaw),
                employee_id: removeClosingTag("employee_id", employeeIdRaw),
                assignments: removeClosingTag("assignments", assignmentsRaw),
            });
            await cline.ask("tool", partialMessage, block.partial).catch(() => { });
            return;
        }
        const defaultCompanyId = toOptionalString(companyIdRaw);
        const defaultTeamId = toOptionalString(teamIdRaw);
        const defaultEmployeeId = toOptionalString(employeeIdRaw);
        let assignments;
        try {
            if (assignmentsRaw) {
                assignments = parseAssignmentsJson(assignmentsRaw, defaultCompanyId, defaultTeamId, defaultEmployeeId);
            }
            else {
                if (!defaultCompanyId) {
                    throw new Error("company_id is required when assignments is not provided");
                }
                if (!defaultTeamId) {
                    throw new Error("team_id is required when assignments is not provided");
                }
                if (!defaultEmployeeId) {
                    throw new Error("employee_id is required when assignments is not provided");
                }
                assignments = [{ companyId: defaultCompanyId, teamId: defaultTeamId, employeeId: defaultEmployeeId }];
            }
        }
        catch (error) {
            cline.consecutiveMistakeCount++;
            cline.recordToolError("assign_employee_to_team");
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
            tool: "assignEmployeeToTeam",
            assignments: assignments.map((entry) => ({
                company_id: entry.companyId,
                team_id: entry.teamId,
                employee_id: entry.employeeId,
            })),
        });
        const didApprove = await askApproval("tool", approvalMessage);
        if (!didApprove) {
            pushToolResult("User declined to assign the employee(s).");
            return;
        }
        const summaries = [];
        for (const assignment of assignments) {
            await workplaceService.assignEmployeeToTeam(assignment);
            summaries.push(assignment);
        }
        await provider.postStateToWebview();
        const summary = (() => {
            if (summaries.length === 1) {
                const single = summaries[0];
                return `Assigned employee ${single.employeeId} to team ${single.teamId} in company ${single.companyId}.`;
            }
            const details = summaries
                .map((entry) => `${entry.employeeId} -> ${entry.teamId} (${entry.companyId})`)
                .join(", ");
            return `Assigned ${summaries.length} employees across ${new Set(summaries.map((entry) => entry.companyId)).size} companies: ${details}.`;
        })();
        pushToolResult(formatResponse.toolResult(summary));
    }
    catch (error) {
        await handleError("assign employee to team", error);
    }
}
//# sourceMappingURL=assignEmployeeToTeamTool.js.map