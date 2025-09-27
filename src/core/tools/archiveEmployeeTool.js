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
function parseArchiveJson(raw, fallbackCompanyId, fallbackEmployeeId) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error("employee_ids must be valid JSON (array or object)");
    }
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) {
        if (!fallbackCompanyId) {
            throw new Error("employee_ids array requires a top-level company_id");
        }
        return parsed.map((id, index) => {
            const employeeId = toOptionalString(id);
            if (!employeeId) {
                throw new Error(`employee_ids[${index}] is empty`);
            }
            return { companyId: fallbackCompanyId, employeeId };
        });
    }
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    if (!entries.length) {
        throw new Error("employee_ids must include at least one entry");
    }
    return entries.map((entry, index) => {
        if (!entry || typeof entry !== "object") {
            throw new Error(`employee_ids[${index}] must be an object or string`);
        }
        const record = entry;
        const companyId = toOptionalStringFromUnknown(record["company_id"] ?? record["companyId"]) ?? fallbackCompanyId;
        if (!companyId) {
            throw new Error(`employee_ids[${index}] is missing company_id`);
        }
        const employeeId = toOptionalStringFromUnknown(record["employee_id"] ?? record["employeeId"]) ?? fallbackEmployeeId;
        if (!employeeId) {
            throw new Error(`employee_ids[${index}] is missing employee_id`);
        }
        return { companyId, employeeId };
    });
}
export async function archiveEmployeeTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag) {
    const companyIdRaw = block.params.company_id;
    const employeeIdRaw = block.params.employee_id;
    const employeeIdsRaw = block.params.employee_ids;
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({
                tool: "archiveEmployee",
                company_id: removeClosingTag("company_id", companyIdRaw),
                employee_id: removeClosingTag("employee_id", employeeIdRaw),
                employee_ids: removeClosingTag("employee_ids", employeeIdsRaw),
            });
            await cline.ask("tool", partialMessage, block.partial).catch(() => { });
            return;
        }
        const defaultCompanyId = toOptionalString(companyIdRaw);
        const defaultEmployeeId = toOptionalString(employeeIdRaw);
        let archives;
        try {
            if (employeeIdsRaw) {
                archives = parseArchiveJson(employeeIdsRaw, defaultCompanyId, defaultEmployeeId);
            }
            else {
                if (!defaultCompanyId) {
                    throw new Error("company_id is required when employee_ids is not provided");
                }
                if (!defaultEmployeeId) {
                    throw new Error("employee_id is required when employee_ids is not provided");
                }
                archives = [{ companyId: defaultCompanyId, employeeId: defaultEmployeeId }];
            }
        }
        catch (error) {
            cline.consecutiveMistakeCount++;
            cline.recordToolError("archive_employee");
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
            tool: "archiveEmployee",
            employees: archives.map((entry) => ({
                company_id: entry.companyId,
                employee_id: entry.employeeId,
            })),
        });
        const didApprove = await askApproval("tool", approvalMessage);
        if (!didApprove) {
            pushToolResult("User declined to archive the employee(s).");
            return;
        }
        const summaries = [];
        for (const entry of archives) {
            const currentState = workplaceService.getState();
            const company = currentState.companies.find((candidate) => candidate.id === entry.companyId);
            const employee = company?.employees.find((candidate) => candidate.id === entry.employeeId);
            await workplaceService.archiveEmployee(entry);
            summaries.push({
                companyId: entry.companyId,
                employeeId: entry.employeeId,
                name: employee?.name,
            });
        }
        await provider.postStateToWebview();
        const summary = (() => {
            if (summaries.length === 1) {
                const single = summaries[0];
                return single.name
                    ? `Archived employee ${single.name} (${single.employeeId}) in company ${single.companyId}.`
                    : `Archived employee ${single.employeeId} in company ${single.companyId}.`;
            }
            const details = summaries
                .map((entry) => `${entry.name ?? entry.employeeId} (${entry.employeeId} / ${entry.companyId})`)
                .join(", ");
            return `Archived ${summaries.length} employees across ${new Set(summaries.map((entry) => entry.companyId)).size} companies: ${details}.`;
        })();
        pushToolResult(formatResponse.toolResult(summary));
    }
    catch (error) {
        await handleError("archive employee", error);
    }
}
//# sourceMappingURL=archiveEmployeeTool.js.map