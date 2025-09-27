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
function parseArchiveJson(raw, fallbackCompanyId, fallbackDepartmentId) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error("department_ids must be valid JSON (array or object)");
    }
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) {
        if (!fallbackCompanyId) {
            throw new Error("department_ids array requires a top-level company_id");
        }
        return parsed.map((id, index) => {
            const departmentId = toOptionalString(id);
            if (!departmentId) {
                throw new Error(`department_ids[${index}] is empty`);
            }
            return { companyId: fallbackCompanyId, departmentId };
        });
    }
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    if (!entries.length) {
        throw new Error("department_ids must include at least one entry");
    }
    return entries.map((entry, index) => {
        if (!entry || typeof entry !== "object") {
            throw new Error(`department_ids[${index}] must be an object or string`);
        }
        const record = entry;
        const companyId = toOptionalStringFromUnknown(record["company_id"] ?? record["companyId"]) ?? fallbackCompanyId;
        if (!companyId) {
            throw new Error(`department_ids[${index}] is missing company_id`);
        }
        const departmentId = toOptionalStringFromUnknown(record["department_id"] ?? record["departmentId"]) ?? fallbackDepartmentId;
        if (!departmentId) {
            throw new Error(`department_ids[${index}] is missing department_id`);
        }
        return { companyId, departmentId };
    });
}
export async function archiveDepartmentTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag) {
    const companyIdRaw = block.params.company_id;
    const departmentIdRaw = block.params.department_id;
    const departmentIdsRaw = block.params.department_ids;
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({
                tool: "archiveDepartment",
                company_id: removeClosingTag("company_id", companyIdRaw),
                department_id: removeClosingTag("department_id", departmentIdRaw),
                department_ids: removeClosingTag("department_ids", departmentIdsRaw),
            });
            await cline.ask("tool", partialMessage, block.partial).catch(() => { });
            return;
        }
        const defaultCompanyId = toOptionalString(companyIdRaw);
        const defaultDepartmentId = toOptionalString(departmentIdRaw);
        let archives;
        try {
            if (departmentIdsRaw) {
                archives = parseArchiveJson(departmentIdsRaw, defaultCompanyId, defaultDepartmentId);
            }
            else {
                if (!defaultCompanyId) {
                    throw new Error("company_id is required when department_ids is not provided");
                }
                if (!defaultDepartmentId) {
                    throw new Error("department_id is required when department_ids is not provided");
                }
                archives = [{ companyId: defaultCompanyId, departmentId: defaultDepartmentId }];
            }
        }
        catch (error) {
            cline.consecutiveMistakeCount++;
            cline.recordToolError("archive_department");
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
            tool: "archiveDepartment",
            departments: archives.map((entry) => ({
                company_id: entry.companyId,
                department_id: entry.departmentId,
            })),
        });
        const didApprove = await askApproval("tool", approvalMessage);
        if (!didApprove) {
            pushToolResult("User declined to archive the department(s).");
            return;
        }
        const summaries = [];
        for (const entry of archives) {
            const currentState = workplaceService.getState();
            const company = currentState.companies.find((candidate) => candidate.id === entry.companyId);
            const department = company?.departments.find((candidate) => candidate.id === entry.departmentId);
            await workplaceService.archiveDepartment(entry);
            summaries.push({
                companyId: entry.companyId,
                departmentId: entry.departmentId,
                name: department?.name,
            });
        }
        await provider.postStateToWebview();
        const summary = (() => {
            if (summaries.length === 1) {
                const single = summaries[0];
                return single.name
                    ? `Archived department ${single.name} (${single.departmentId}) in company ${single.companyId}.`
                    : `Archived department ${single.departmentId} in company ${single.companyId}.`;
            }
            const details = summaries
                .map((entry) => `${entry.name ?? entry.departmentId} (${entry.departmentId} / ${entry.companyId})`)
                .join(", ");
            return `Archived ${summaries.length} departments across ${new Set(summaries.map((entry) => entry.companyId)).size} companies: ${details}.`;
        })();
        pushToolResult(formatResponse.toolResult(summary));
    }
    catch (error) {
        await handleError("archive department", error);
    }
}
//# sourceMappingURL=archiveDepartmentTool.js.map