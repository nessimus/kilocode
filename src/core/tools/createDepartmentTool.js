import { formatResponse } from "../prompts/responses";
function toOptionalString(value) {
    const trimmed = value?.trim();
    return trimmed && trimmed.length ? trimmed : undefined;
}
function parseDepartmentsJson(raw, fallbackCompanyId, fallbackName, fallbackDescription) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error("departments must be valid JSON (array or object)");
    }
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    if (!entries.length) {
        throw new Error("departments must include at least one entry");
    }
    return entries.map((entry, index) => {
        if (!entry || typeof entry !== "object") {
            throw new Error(`departments[${index}] must be an object`);
        }
        const record = entry;
        const companyId = toOptionalString(record["company_id"] ??
            record["companyId"] ??
            fallbackCompanyId);
        if (!companyId) {
            throw new Error(`departments[${index}] is missing company_id`);
        }
        const name = toOptionalString((record["name"] ?? fallbackName));
        if (!name) {
            throw new Error(`departments[${index}] is missing name`);
        }
        const description = toOptionalString((record["description"] ?? fallbackDescription));
        return { companyId, name, description };
    });
}
export async function createDepartmentTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag) {
    const companyIdRaw = block.params.company_id;
    const nameRaw = block.params.name;
    const descriptionRaw = block.params.description;
    const departmentsRaw = block.params.departments;
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({
                tool: "createDepartment",
                company_id: removeClosingTag("company_id", companyIdRaw),
                name: removeClosingTag("name", nameRaw),
                description: removeClosingTag("description", descriptionRaw),
                departments: removeClosingTag("departments", departmentsRaw),
            });
            await cline.ask("tool", partialMessage, block.partial).catch(() => { });
            return;
        }
        const defaultCompanyId = toOptionalString(companyIdRaw);
        const defaultName = toOptionalString(nameRaw);
        const defaultDescription = toOptionalString(descriptionRaw);
        const buildSinglePayloads = () => {
            if (!defaultCompanyId) {
                throw new Error("company_id is required when departments is not provided");
            }
            if (!defaultName) {
                throw new Error("name is required when departments is not provided");
            }
            return [
                {
                    companyId: defaultCompanyId,
                    name: defaultName,
                    description: defaultDescription,
                },
            ];
        };
        let departmentPayloads;
        try {
            if (departmentsRaw) {
                departmentPayloads = parseDepartmentsJson(departmentsRaw, defaultCompanyId, defaultName, defaultDescription);
            }
            else {
                departmentPayloads = buildSinglePayloads();
            }
        }
        catch (error) {
            cline.consecutiveMistakeCount++;
            cline.recordToolError("create_department");
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
            tool: "createDepartment",
            departments: departmentPayloads.map((payload) => ({
                company_id: payload.companyId,
                name: payload.name,
                description: payload.description,
            })),
        });
        const didApprove = await askApproval("tool", approvalMessage);
        if (!didApprove) {
            pushToolResult("User declined to create the department(s).");
            return;
        }
        const createdSummaries = [];
        for (const payload of departmentPayloads) {
            await workplaceService.createDepartment(payload);
            createdSummaries.push({ companyId: payload.companyId, name: payload.name });
        }
        await provider.postStateToWebview();
        const summary = (() => {
            if (createdSummaries.length === 1) {
                const single = createdSummaries[0];
                return `Created department ${single.name} for company ${single.companyId}.`;
            }
            const companies = Array.from(new Set(createdSummaries.map((entry) => entry.companyId)));
            const names = createdSummaries.map((entry) => `${entry.name} (${entry.companyId})`).join(", ");
            return `Created ${createdSummaries.length} departments across ${companies.length} companies: ${names}.`;
        })();
        pushToolResult(formatResponse.toolResult(summary));
    }
    catch (error) {
        await handleError("create department", error);
    }
}
//# sourceMappingURL=createDepartmentTool.js.map