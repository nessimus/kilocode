import { formatResponse } from "../prompts/responses";
function toOptionalString(value) {
    const trimmed = value?.trim();
    return trimmed && trimmed.length ? trimmed : undefined;
}
function parseDepartmentUpdatesJson(raw, fallbackCompanyId, fallbackDepartmentId, fallbackName, fallbackDescription) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error("department_updates must be valid JSON (array or object)");
    }
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    if (!entries.length) {
        throw new Error("department_updates must include at least one entry");
    }
    return entries.map((entry, index) => {
        if (!entry || typeof entry !== "object") {
            throw new Error(`department_updates[${index}] must be an object`);
        }
        const record = entry;
        const companyId = toOptionalString(record["company_id"] ??
            record["companyId"] ??
            fallbackCompanyId);
        if (!companyId) {
            throw new Error(`department_updates[${index}] is missing company_id`);
        }
        const departmentId = toOptionalString(record["department_id"] ??
            record["departmentId"] ??
            fallbackDepartmentId);
        if (!departmentId) {
            throw new Error(`department_updates[${index}] is missing department_id`);
        }
        const name = toOptionalString((record["name"] ?? fallbackName));
        const description = toOptionalString((record["description"] ?? fallbackDescription));
        if (!name && !description) {
            throw new Error(`department_updates[${index}] requires at least one field to update (name or description)`);
        }
        return { companyId, departmentId, name, description };
    });
}
export async function updateDepartmentTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag) {
    const companyIdRaw = block.params.company_id;
    const departmentIdRaw = block.params.department_id;
    const nameRaw = block.params.name;
    const descriptionRaw = block.params.description;
    const updatesRaw = block.params.department_updates;
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({
                tool: "updateDepartment",
                company_id: removeClosingTag("company_id", companyIdRaw),
                department_id: removeClosingTag("department_id", departmentIdRaw),
                name: removeClosingTag("name", nameRaw),
                description: removeClosingTag("description", descriptionRaw),
                department_updates: removeClosingTag("department_updates", updatesRaw),
            });
            await cline.ask("tool", partialMessage, block.partial).catch(() => { });
            return;
        }
        const defaultCompanyId = toOptionalString(companyIdRaw);
        const defaultDepartmentId = toOptionalString(departmentIdRaw);
        const defaultName = toOptionalString(nameRaw);
        const defaultDescription = toOptionalString(descriptionRaw);
        let updateDescriptors;
        try {
            if (updatesRaw) {
                updateDescriptors = parseDepartmentUpdatesJson(updatesRaw, defaultCompanyId, defaultDepartmentId, defaultName, defaultDescription);
            }
            else {
                if (!defaultCompanyId) {
                    throw new Error("company_id is required when department_updates is not provided");
                }
                if (!defaultDepartmentId) {
                    throw new Error("department_id is required when department_updates is not provided");
                }
                if (!defaultName && !defaultDescription) {
                    throw new Error("Provide at least one field (name or description) to update the department.");
                }
                updateDescriptors = [
                    {
                        companyId: defaultCompanyId,
                        departmentId: defaultDepartmentId,
                        name: defaultName,
                        description: defaultDescription,
                    },
                ];
            }
        }
        catch (error) {
            cline.consecutiveMistakeCount++;
            cline.recordToolError("update_department");
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
            tool: "updateDepartment",
            updates: updateDescriptors.map((entry) => ({
                company_id: entry.companyId,
                department_id: entry.departmentId,
                name: entry.name,
                description: entry.description,
            })),
        });
        const didApprove = await askApproval("tool", approvalMessage);
        if (!didApprove) {
            pushToolResult("User declined to update the department(s).");
            return;
        }
        const updatedSummaries = [];
        for (const descriptor of updateDescriptors) {
            const currentState = workplaceService.getState();
            const company = currentState.companies.find((entry) => entry.id === descriptor.companyId);
            if (!company) {
                throw new Error(`Company ${descriptor.companyId} not found`);
            }
            const department = company.departments.find((entry) => entry.id === descriptor.departmentId);
            if (!department) {
                throw new Error(`Department ${descriptor.departmentId} not found in company ${descriptor.companyId}`);
            }
            const updatedDepartment = {
                ...department,
                name: descriptor.name ?? department.name,
                description: descriptor.description ?? department.description,
            };
            await workplaceService.updateDepartment({ companyId: descriptor.companyId, department: updatedDepartment });
            updatedSummaries.push({
                companyId: descriptor.companyId,
                departmentId: descriptor.departmentId,
                name: updatedDepartment.name,
            });
        }
        await provider.postStateToWebview();
        const summary = (() => {
            if (updatedSummaries.length === 1) {
                const single = updatedSummaries[0];
                return `Updated department ${single.name} (${single.departmentId}) in company ${single.companyId}.`;
            }
            const companies = Array.from(new Set(updatedSummaries.map((entry) => entry.companyId)));
            const details = updatedSummaries
                .map((entry) => `${entry.name} (${entry.departmentId} / ${entry.companyId})`)
                .join(", ");
            return `Updated ${updatedSummaries.length} departments across ${companies.length} companies: ${details}.`;
        })();
        pushToolResult(formatResponse.toolResult(summary));
    }
    catch (error) {
        await handleError("update department", error);
    }
}
//# sourceMappingURL=updateDepartmentTool.js.map