import { formatResponse } from "../prompts/responses";
import { MBTI_TYPES } from "../../shared/golden/workplace";
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
function parseBooleanFlag(value, field) {
    const normalized = toOptionalString(value)?.toLowerCase();
    if (!normalized) {
        return undefined;
    }
    if (["true", "1", "yes"].includes(normalized)) {
        return true;
    }
    if (["false", "0", "no"].includes(normalized)) {
        return false;
    }
    throw new Error(`Invalid boolean value for ${field}: ${value}`);
}
function parseTraits(value) {
    const trimmed = toOptionalString(value);
    if (!trimmed) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            const traits = parsed.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
            return traits.length ? traits : undefined;
        }
    }
    catch (error) {
        // fall back to comma splitting below
    }
    const traits = trimmed
        .split(/[,\n]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
    return traits.length ? traits : undefined;
}
function parseTraitsFlexible(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value === "string") {
        return parseTraits(value);
    }
    return parseTraits(JSON.stringify(value));
}
function parseCustomAttributes(value) {
    const trimmed = toOptionalString(value);
    if (!trimmed) {
        return undefined;
    }
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    }
    catch (error) {
        throw new Error("custom_attributes must be a valid JSON object");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("custom_attributes must be a JSON object with string values");
    }
    return Object.fromEntries(Object.entries(parsed).map(([key, val]) => [key, val != null ? String(val) : ""]));
}
function parseCustomAttributesFlexible(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value === "string") {
        return parseCustomAttributes(value);
    }
    return parseCustomAttributes(JSON.stringify(value));
}
function parseMbti(value) {
    const normalized = toOptionalString(value)?.toUpperCase();
    if (!normalized) {
        return undefined;
    }
    if (!MBTI_TYPES.includes(normalized)) {
        throw new Error(`Invalid mbti_type: ${value}`);
    }
    return normalized;
}
function parseMbtiFlexible(value) {
    const candidate = toOptionalStringFromUnknown(value);
    return parseMbti(candidate);
}
function parseEmployeeUpdatesJson(raw, defaults) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error("employee_updates must be valid JSON (array or object)");
    }
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    if (!entries.length) {
        throw new Error("employee_updates must include at least one entry");
    }
    return entries.map((entry, index) => {
        if (!entry || typeof entry !== "object") {
            throw new Error(`employee_updates[${index}] must be an object`);
        }
        const record = entry;
        const companyId = toOptionalString(record["company_id"] ??
            record["companyId"] ??
            defaults.companyId);
        if (!companyId) {
            throw new Error(`employee_updates[${index}] is missing company_id`);
        }
        const employeeId = toOptionalString(record["employee_id"] ??
            record["employeeId"] ??
            defaults.employeeId);
        if (!employeeId) {
            throw new Error(`employee_updates[${index}] is missing employee_id`);
        }
        const name = toOptionalStringFromUnknown(record["name"]) ?? defaults.name;
        const role = toOptionalStringFromUnknown(record["role"]) ?? defaults.role;
        const description = toOptionalStringFromUnknown(record["description"]) ?? defaults.description;
        const personality = toOptionalStringFromUnknown(record["personality"]) ?? defaults.personality;
        let mbti;
        try {
            const entryMbti = parseMbtiFlexible(record["mbti_type"]);
            mbti = entryMbti ?? defaults.mbti;
        }
        catch (error) {
            throw new Error(`employee_updates[${index}] has invalid mbti_type: ${error instanceof Error ? error.message : String(error)}`);
        }
        let traits;
        try {
            const entryTraits = parseTraitsFlexible(record["personality_traits"]);
            traits = entryTraits ?? defaults.personalityTraits;
        }
        catch (error) {
            throw new Error(`employee_updates[${index}] has invalid personality_traits: ${error instanceof Error ? error.message : String(error)}`);
        }
        let customAttributes;
        try {
            const entryCustomAttributes = parseCustomAttributesFlexible(record["custom_attributes"]);
            customAttributes = entryCustomAttributes ?? defaults.customAttributes;
        }
        catch (error) {
            throw new Error(`employee_updates[${index}] has invalid custom_attributes: ${error instanceof Error ? error.message : String(error)}`);
        }
        let isExecutiveManager;
        const rawIsExec = toOptionalStringFromUnknown(record["is_executive_manager"]);
        if (rawIsExec !== undefined) {
            try {
                isExecutiveManager = parseBooleanFlag(rawIsExec, "is_executive_manager");
            }
            catch (error) {
                throw new Error(`employee_updates[${index}] has invalid is_executive_manager: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        else {
            isExecutiveManager = defaults.isExecutiveManager;
        }
        const profileImageUrl = toOptionalStringFromUnknown(record["profile_image_url"]) ?? defaults.profileImageUrl;
        const updates = {};
        if (name !== undefined) {
            updates.name = name;
        }
        if (role !== undefined) {
            updates.role = role;
        }
        if (description !== undefined) {
            updates.description = description;
        }
        if (personality !== undefined) {
            updates.personality = personality;
        }
        if (mbti !== undefined) {
            updates.mbtiType = mbti;
        }
        if (traits !== undefined) {
            updates.personalityTraits = traits;
        }
        if (profileImageUrl !== undefined) {
            updates.profileImageUrl = profileImageUrl;
        }
        if (customAttributes !== undefined) {
            updates.customAttributes = customAttributes;
        }
        if (isExecutiveManager !== undefined) {
            updates.isExecutiveManager = isExecutiveManager;
        }
        if (Object.keys(updates).length === 0) {
            throw new Error(`employee_updates[${index}] requires at least one field to update (name, role, description, personality, mbti_type, personality_traits, profile_image_url, custom_attributes, or is_executive_manager)`);
        }
        return { companyId, employeeId, updates };
    });
}
export async function updateEmployeeTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag) {
    const companyIdRaw = block.params.company_id;
    const employeeIdRaw = block.params.employee_id;
    const employeeUpdatesRaw = block.params.employee_updates;
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({
                tool: "updateEmployee",
                company_id: removeClosingTag("company_id", companyIdRaw),
                employee_id: removeClosingTag("employee_id", employeeIdRaw),
                name: removeClosingTag("name", block.params.name),
                role: removeClosingTag("role", block.params.role),
                description: removeClosingTag("description", block.params.description),
                personality: removeClosingTag("personality", block.params.personality),
                mbti_type: removeClosingTag("mbti_type", block.params.mbti_type),
                personality_traits: removeClosingTag("personality_traits", block.params.personality_traits),
                profile_image_url: removeClosingTag("profile_image_url", block.params.profile_image_url),
                custom_attributes: removeClosingTag("custom_attributes", block.params.custom_attributes),
                is_executive_manager: removeClosingTag("is_executive_manager", block.params.is_executive_manager),
                employee_updates: removeClosingTag("employee_updates", employeeUpdatesRaw),
            });
            await cline.ask("tool", partialMessage, block.partial).catch(() => { });
            return;
        }
        const defaultCompanyId = toOptionalString(companyIdRaw);
        const defaultEmployeeId = toOptionalString(employeeIdRaw);
        const defaultName = toOptionalString(block.params.name);
        const defaultRole = toOptionalString(block.params.role);
        const defaultDescription = toOptionalString(block.params.description);
        const defaultPersonality = toOptionalString(block.params.personality);
        const defaultProfileImageUrl = toOptionalString(block.params.profile_image_url);
        let defaultTraits;
        let defaultCustomAttributes;
        let defaultMbti;
        let defaultIsExecutiveManager;
        try {
            defaultTraits = parseTraits(block.params.personality_traits);
            defaultCustomAttributes = parseCustomAttributes(block.params.custom_attributes);
            defaultMbti = parseMbti(block.params.mbti_type);
            defaultIsExecutiveManager = parseBooleanFlag(block.params.is_executive_manager, "is_executive_manager");
        }
        catch (error) {
            cline.consecutiveMistakeCount++;
            cline.recordToolError("update_employee");
            pushToolResult(formatResponse.toolError(error instanceof Error ? error.message : String(error)));
            return;
        }
        let descriptors;
        try {
            if (employeeUpdatesRaw) {
                descriptors = parseEmployeeUpdatesJson(employeeUpdatesRaw, {
                    companyId: defaultCompanyId,
                    employeeId: defaultEmployeeId,
                    name: defaultName,
                    role: defaultRole,
                    description: defaultDescription,
                    personality: defaultPersonality,
                    personalityTraits: defaultTraits,
                    profileImageUrl: defaultProfileImageUrl,
                    customAttributes: defaultCustomAttributes,
                    mbti: defaultMbti,
                    isExecutiveManager: defaultIsExecutiveManager,
                });
            }
            else {
                if (!defaultCompanyId) {
                    throw new Error("company_id is required when employee_updates is not provided");
                }
                if (!defaultEmployeeId) {
                    throw new Error("employee_id is required when employee_updates is not provided");
                }
                const updates = {};
                if (defaultName !== undefined)
                    updates.name = defaultName;
                if (defaultRole !== undefined)
                    updates.role = defaultRole;
                if (defaultDescription !== undefined)
                    updates.description = defaultDescription;
                if (defaultPersonality !== undefined)
                    updates.personality = defaultPersonality;
                if (defaultMbti !== undefined)
                    updates.mbtiType = defaultMbti;
                if (defaultTraits !== undefined)
                    updates.personalityTraits = defaultTraits;
                if (defaultProfileImageUrl !== undefined)
                    updates.profileImageUrl = defaultProfileImageUrl;
                if (defaultCustomAttributes !== undefined)
                    updates.customAttributes = defaultCustomAttributes;
                if (defaultIsExecutiveManager !== undefined)
                    updates.isExecutiveManager = defaultIsExecutiveManager;
                if (Object.keys(updates).length === 0) {
                    throw new Error("Provide at least one field to update (name, role, description, personality, mbti_type, personality_traits, profile_image_url, custom_attributes, or is_executive_manager).");
                }
                descriptors = [
                    {
                        companyId: defaultCompanyId,
                        employeeId: defaultEmployeeId,
                        updates,
                    },
                ];
            }
        }
        catch (error) {
            cline.consecutiveMistakeCount++;
            cline.recordToolError("update_employee");
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
            tool: "updateEmployee",
            updates: descriptors.map((descriptor) => ({
                company_id: descriptor.companyId,
                employee_id: descriptor.employeeId,
                name: descriptor.updates.name,
                role: descriptor.updates.role,
                description: descriptor.updates.description,
                personality: descriptor.updates.personality,
                mbti_type: descriptor.updates.mbtiType,
                personality_traits: descriptor.updates.personalityTraits,
                profile_image_url: descriptor.updates.profileImageUrl,
                custom_attributes: descriptor.updates.customAttributes,
                is_executive_manager: descriptor.updates.isExecutiveManager,
            })),
        });
        const didApprove = await askApproval("tool", approvalMessage);
        if (!didApprove) {
            pushToolResult("User declined to update the employee(s).");
            return;
        }
        const updatedSummaries = [];
        for (const descriptor of descriptors) {
            const currentState = workplaceService.getState();
            const company = currentState.companies.find((entry) => entry.id === descriptor.companyId);
            if (!company) {
                throw new Error(`Company ${descriptor.companyId} not found`);
            }
            const employee = company.employees.find((entry) => entry.id === descriptor.employeeId);
            if (!employee) {
                throw new Error(`Employee ${descriptor.employeeId} not found in company ${descriptor.companyId}`);
            }
            const updatedEmployee = {
                ...employee,
                name: descriptor.updates.name ?? employee.name,
                role: descriptor.updates.role ?? employee.role,
                description: descriptor.updates.description ?? employee.description,
                personality: descriptor.updates.personality ?? employee.personality,
                mbtiType: descriptor.updates.mbtiType ?? employee.mbtiType,
                personalityTraits: descriptor.updates.personalityTraits ?? employee.personalityTraits,
                profileImageUrl: descriptor.updates.profileImageUrl ?? employee.profileImageUrl,
                customAttributes: descriptor.updates.customAttributes ?? employee.customAttributes,
                isExecutiveManager: descriptor.updates.isExecutiveManager ?? employee.isExecutiveManager,
            };
            await workplaceService.updateEmployee({
                companyId: descriptor.companyId,
                employee: updatedEmployee,
            });
            updatedSummaries.push({
                companyId: descriptor.companyId,
                employeeId: descriptor.employeeId,
                name: updatedEmployee.name,
            });
        }
        await provider.postStateToWebview();
        const summary = (() => {
            if (updatedSummaries.length === 1) {
                const single = updatedSummaries[0];
                return `Updated employee ${single.name} (${single.employeeId}) in company ${single.companyId}.`;
            }
            const companies = Array.from(new Set(updatedSummaries.map((entry) => entry.companyId)));
            const details = updatedSummaries
                .map((entry) => `${entry.name} (${entry.employeeId} / ${entry.companyId})`)
                .join(", ");
            return `Updated ${updatedSummaries.length} employees across ${companies.length} companies: ${details}.`;
        })();
        pushToolResult(formatResponse.toolResult(summary));
    }
    catch (error) {
        await handleError("update employee", error);
    }
}
//# sourceMappingURL=updateEmployeeTool.js.map