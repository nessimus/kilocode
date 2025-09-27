import { formatResponse } from "../prompts/responses";
import { MBTI_TYPES } from "../../shared/golden/workplace";
function parseBooleanFlag(value, field) {
    if (value === undefined) {
        return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
        return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
        return false;
    }
    throw new Error(`Invalid boolean value for ${field}: ${value}`);
}
function parseTraits(value) {
    if (!value) {
        return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            const traits = parsed.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
            if (!traits.length) {
                return undefined;
            }
            return traits;
        }
    }
    catch (error) {
        // Fall back to comma/line splitting below
    }
    const traits = trimmed
        .split(/[,\n]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
    return traits.length ? traits : undefined;
}
function parseCustomAttributes(value) {
    if (!value) {
        return undefined;
    }
    const trimmed = value.trim();
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
function parseMbti(value) {
    if (!value) {
        return undefined;
    }
    const normalized = value.trim().toUpperCase();
    if (!normalized) {
        return undefined;
    }
    if (!MBTI_TYPES.includes(normalized)) {
        throw new Error(`Invalid mbti_type: ${value}`);
    }
    return normalized;
}
function toOptionalString(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        const stringified = String(value).trim();
        return stringified.length ? stringified : undefined;
    }
    return undefined;
}
function normalizeTraitsInput(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (Array.isArray(value)) {
        const traits = value.map((entry) => toOptionalString(entry)).filter((entry) => Boolean(entry));
        return traits.length ? traits : undefined;
    }
    const stringValue = toOptionalString(value);
    return stringValue ? parseTraits(stringValue) : undefined;
}
function normalizeCustomAttributesInput(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value === "object" && !Array.isArray(value)) {
        return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, toOptionalString(val) ?? ""]));
    }
    const stringValue = toOptionalString(value);
    return stringValue ? parseCustomAttributes(stringValue) : undefined;
}
function normalizeMbtiInput(value) {
    const stringValue = toOptionalString(value);
    return parseMbti(stringValue);
}
function normalizeBooleanInput(value, field) {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value === "boolean") {
        return value;
    }
    return parseBooleanFlag(toOptionalString(value), field);
}
export async function createEmployeeTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag) {
    const companyIdRaw = block.params.company_id;
    const employeesRaw = block.params.employees;
    const nameRaw = block.params.name;
    const roleRaw = block.params.role;
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({
                tool: "createEmployee",
                company_id: removeClosingTag("company_id", companyIdRaw),
                name: removeClosingTag("name", nameRaw),
                role: removeClosingTag("role", roleRaw),
                employees: removeClosingTag("employees", employeesRaw),
            });
            await cline.ask("tool", partialMessage, block.partial).catch(() => { });
            return;
        }
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
        let defaultCustomAttributes;
        let defaultPersonalityTraits;
        let defaultMbti;
        let defaultIsExecutiveManager;
        try {
            defaultCustomAttributes = parseCustomAttributes(block.params.custom_attributes);
            defaultPersonalityTraits = parseTraits(block.params.personality_traits);
            defaultMbti = parseMbti(block.params.mbti_type);
            defaultIsExecutiveManager = parseBooleanFlag(block.params.is_executive_manager, "is_executive_manager");
        }
        catch (error) {
            cline.consecutiveMistakeCount++;
            cline.recordToolError("create_employee");
            pushToolResult(formatResponse.toolError(error instanceof Error ? error.message : String(error)));
            return;
        }
        const defaultDescription = block.params.description?.trim() || undefined;
        const defaultPersonality = block.params.personality?.trim() || undefined;
        const defaultProfileImageUrl = block.params.profile_image_url?.trim() || undefined;
        const defaultCompanyId = toOptionalString(companyIdRaw);
        const employeesJson = employeesRaw?.trim();
        const buildSinglePayload = () => {
            if (!defaultCompanyId) {
                throw new Error("company_id is required when employees is not provided");
            }
            const name = toOptionalString(nameRaw);
            const role = toOptionalString(roleRaw);
            if (!name) {
                throw new Error("name is required");
            }
            if (!role) {
                throw new Error("role is required");
            }
            const payload = {
                companyId: defaultCompanyId,
                name,
                role,
            };
            if (defaultDescription) {
                payload.description = defaultDescription;
            }
            if (defaultPersonality) {
                payload.personality = defaultPersonality;
            }
            if (defaultMbti) {
                payload.mbtiType = defaultMbti;
            }
            if (defaultPersonalityTraits && defaultPersonalityTraits.length) {
                payload.personalityTraits = [...defaultPersonalityTraits];
            }
            if (defaultProfileImageUrl) {
                payload.profileImageUrl = defaultProfileImageUrl;
            }
            if (defaultCustomAttributes && Object.keys(defaultCustomAttributes).length) {
                payload.customAttributes = { ...defaultCustomAttributes };
            }
            if (defaultIsExecutiveManager !== undefined) {
                payload.isExecutiveManager = defaultIsExecutiveManager;
            }
            return [payload];
        };
        const buildBatchPayloads = (raw) => {
            let parsedInput;
            try {
                parsedInput = JSON.parse(raw);
            }
            catch (error) {
                throw new Error("employees must be valid JSON (array or object)");
            }
            const entries = Array.isArray(parsedInput) ? parsedInput : [parsedInput];
            if (!entries.length) {
                throw new Error("employees must include at least one entry");
            }
            return entries.map((entry, index) => {
                if (!entry || typeof entry !== "object") {
                    throw new Error(`employees[${index}] must be an object`);
                }
                const record = entry;
                const entryCompanyId = toOptionalString(record["company_id"] ?? record["companyId"] ?? defaultCompanyId);
                if (!entryCompanyId) {
                    throw new Error(`employees[${index}] is missing company_id`);
                }
                const entryName = toOptionalString(record["name"] ?? nameRaw);
                if (!entryName) {
                    throw new Error(`employees[${index}] is missing name`);
                }
                const entryRole = toOptionalString(record["role"] ?? roleRaw);
                if (!entryRole) {
                    throw new Error(`employees[${index}] is missing role`);
                }
                const payload = {
                    companyId: entryCompanyId,
                    name: entryName,
                    role: entryRole,
                };
                const entryDescription = toOptionalString(record["description"]) ?? defaultDescription;
                if (entryDescription) {
                    payload.description = entryDescription;
                }
                const entryPersonality = toOptionalString(record["personality"]) ?? defaultPersonality;
                if (entryPersonality) {
                    payload.personality = entryPersonality;
                }
                const entryMbti = normalizeMbtiInput(record["mbti_type"] ?? record["mbtiType"]) ?? defaultMbti;
                if (entryMbti) {
                    payload.mbtiType = entryMbti;
                }
                const entryTraits = normalizeTraitsInput(record["personality_traits"] ?? record["personalityTraits"]) ??
                    defaultPersonalityTraits;
                if (entryTraits && entryTraits.length) {
                    payload.personalityTraits = [...entryTraits];
                }
                const entryProfileImage = toOptionalString(record["profile_image_url"] ?? record["profileImageUrl"]) ?? defaultProfileImageUrl;
                if (entryProfileImage) {
                    payload.profileImageUrl = entryProfileImage;
                }
                const entryCustomAttributes = normalizeCustomAttributesInput(record["custom_attributes"] ?? record["customAttributes"]) ??
                    (defaultCustomAttributes ? { ...defaultCustomAttributes } : undefined);
                if (entryCustomAttributes && Object.keys(entryCustomAttributes).length) {
                    payload.customAttributes = entryCustomAttributes;
                }
                const entryIsExecutive = normalizeBooleanInput(record["is_executive_manager"] ?? record["isExecutiveManager"], "is_executive_manager") ?? defaultIsExecutiveManager;
                if (entryIsExecutive !== undefined) {
                    payload.isExecutiveManager = entryIsExecutive;
                }
                return payload;
            });
        };
        let employeePayloads;
        try {
            employeePayloads = employeesJson ? buildBatchPayloads(employeesJson) : buildSinglePayload();
        }
        catch (error) {
            cline.consecutiveMistakeCount++;
            cline.recordToolError("create_employee");
            pushToolResult(formatResponse.toolError(error instanceof Error ? error.message : String(error)));
            return;
        }
        cline.consecutiveMistakeCount = 0;
        const approvalMessage = JSON.stringify({
            tool: "createEmployee",
            companyId: defaultCompanyId,
            employees: employeePayloads.map((payload) => ({
                companyId: payload.companyId,
                name: payload.name,
                role: payload.role,
                description: payload.description,
                personality: payload.personality,
                mbtiType: payload.mbtiType,
                personalityTraits: payload.personalityTraits,
                profileImageUrl: payload.profileImageUrl,
                customAttributes: payload.customAttributes,
                isExecutiveManager: payload.isExecutiveManager,
            })),
        });
        const didApprove = await askApproval("tool", approvalMessage);
        if (!didApprove) {
            pushToolResult("User declined to create the new employee(s).");
            return;
        }
        const createdSummaries = [];
        for (const payload of employeePayloads) {
            await workplaceService.createEmployee(payload);
            createdSummaries.push({
                companyId: payload.companyId,
                name: payload.name,
                role: payload.role,
                isExecutiveManager: payload.isExecutiveManager,
            });
        }
        await provider.postStateToWebview();
        const uniqueCompanies = new Set(createdSummaries.map((entry) => entry.companyId));
        const executiveNames = createdSummaries.filter((entry) => entry.isExecutiveManager).map((entry) => entry.name);
        const entriesList = createdSummaries
            .map((entry) => `${entry.name} (${entry.role}${entry.isExecutiveManager ? ", executive manager" : ""})`)
            .join(", ");
        let summary;
        if (createdSummaries.length === 1) {
            const single = createdSummaries[0];
            summary = `Created employee ${single.name} (${single.role}) for company ${single.companyId}.`;
            if (single.isExecutiveManager) {
                summary += " Set as executive manager.";
            }
        }
        else {
            const companyDescriptor = uniqueCompanies.size === 1
                ? `company ${Array.from(uniqueCompanies)[0]}`
                : `${uniqueCompanies.size} companies (${Array.from(uniqueCompanies).join(", ")})`;
            summary = `Created ${createdSummaries.length} employees for ${companyDescriptor}: ${entriesList}.`;
            if (executiveNames.length) {
                summary += ` Updated executive manager assignments for ${executiveNames.join(", ")}.`;
            }
        }
        pushToolResult(formatResponse.toolResult(summary));
    }
    catch (error) {
        await handleError("create employee", error);
    }
}
//# sourceMappingURL=createEmployeeTool.js.map