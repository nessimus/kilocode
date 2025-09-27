import { MBTI_TYPES } from "../../../shared/golden/workplace";
const BOOLEAN_TRUE_VALUES = new Set(["true", "1", "yes", "y"]);
const BOOLEAN_FALSE_VALUES = new Set(["false", "0", "no", "n"]);
export function optionalString(value) {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
}
export function parseBooleanFlag(value, field) {
    const normalized = optionalString(value)?.toLowerCase();
    if (normalized === undefined) {
        return undefined;
    }
    if (BOOLEAN_TRUE_VALUES.has(normalized)) {
        return true;
    }
    if (BOOLEAN_FALSE_VALUES.has(normalized)) {
        return false;
    }
    throw new Error(`Invalid boolean value for ${field}: ${value}`);
}
export function normalizeBooleanInput(value, field) {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number") {
        if (value === 1) {
            return true;
        }
        if (value === 0) {
            return false;
        }
    }
    if (typeof value === "string") {
        return parseBooleanFlag(value, field);
    }
    throw new Error(`Invalid boolean value for ${field}`);
}
export function normalizeStringArrayInput(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (Array.isArray(value)) {
        const entries = value
            .map((entry) => optionalString(typeof entry === "string" ? entry : String(entry)))
            .filter((entry) => Boolean(entry));
        return entries.length ? entries : undefined;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) {
            return undefined;
        }
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return normalizeStringArrayInput(parsed);
            }
        }
        catch (error) {
            // fall through to delimiter-based parsing
        }
        const parts = trimmed
            .split(/[\n,]/)
            .map((segment) => segment.trim())
            .filter(Boolean);
        return parts.length ? parts : undefined;
    }
    return undefined;
}
export function normalizeOwnerProfileInput(value, field = "owner_profile") {
    if (value === undefined || value === null) {
        return undefined;
    }
    let record;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) {
            return undefined;
        }
        try {
            const parsed = JSON.parse(trimmed);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                throw new Error(`${field} must be a JSON object`);
            }
            record = parsed;
        }
        catch (error) {
            // Treat as simple string name fallback
            record = { name: trimmed };
        }
    }
    else if (typeof value === "object" && !Array.isArray(value)) {
        record = value;
    }
    else {
        throw new Error(`${field} must be a JSON object or string`);
    }
    const name = optionalString(record["name"] ??
        record["full_name"] ??
        record["owner_name"]);
    const role = optionalString(record["role"] ?? record["title"]);
    const firstName = optionalString(record["firstName"] ?? record["first_name"]);
    const lastName = optionalString(record["lastName"] ?? record["last_name"]);
    const bio = optionalString(record["bio"] ?? record["summary"]);
    const mbtiValue = optionalString(record["mbtiType"] ?? record["mbti_type"])?.toUpperCase();
    if (mbtiValue && !MBTI_TYPES.includes(mbtiValue)) {
        throw new Error(`Invalid mbti_type on ${field}: ${mbtiValue}`);
    }
    const traits = normalizeStringArrayInput(record["personalityTraits"] ?? record["personality_traits"] ?? record["traits"]);
    return {
        name: name ?? "",
        role: role ?? "Owner & CEO",
        firstName: firstName ?? undefined,
        lastName: lastName ?? undefined,
        bio: bio ?? undefined,
        mbtiType: mbtiValue,
        personalityTraits: traits,
    };
}
//# sourceMappingURL=workplace.js.map