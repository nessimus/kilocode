import { MBTI_TYPES, type WorkplaceOwnerProfile } from "../../../shared/golden/workplace"

const BOOLEAN_TRUE_VALUES = new Set(["true", "1", "yes", "y"])
const BOOLEAN_FALSE_VALUES = new Set(["false", "0", "no", "n"])

export function optionalString(value?: string): string | undefined {
	const trimmed = value?.trim()
	return trimmed && trimmed.length > 0 ? trimmed : undefined
}

export function parseBooleanFlag(value: string | undefined, field: string): boolean | undefined {
	const normalized = optionalString(value)?.toLowerCase()
	if (normalized === undefined) {
		return undefined
	}
	if (BOOLEAN_TRUE_VALUES.has(normalized)) {
		return true
	}
	if (BOOLEAN_FALSE_VALUES.has(normalized)) {
		return false
	}
	throw new Error(`Invalid boolean value for ${field}: ${value}`)
}

export function normalizeBooleanInput(value: unknown, field: string): boolean | undefined {
	if (value === undefined || value === null) {
		return undefined
	}
	if (typeof value === "boolean") {
		return value
	}
	if (typeof value === "number") {
		if (value === 1) {
			return true
		}
		if (value === 0) {
			return false
		}
	}
	if (typeof value === "string") {
		return parseBooleanFlag(value, field)
	}
	throw new Error(`Invalid boolean value for ${field}`)
}

export function normalizeStringArrayInput(value: unknown): string[] | undefined {
	if (value === undefined || value === null) {
		return undefined
	}
	if (Array.isArray(value)) {
		const entries = value
			.map((entry) => optionalString(typeof entry === "string" ? entry : String(entry)))
			.filter((entry): entry is string => Boolean(entry))
		return entries.length ? entries : undefined
	}
	if (typeof value === "string") {
		const trimmed = value.trim()
		if (!trimmed) {
			return undefined
		}
		try {
			const parsed = JSON.parse(trimmed)
			if (Array.isArray(parsed)) {
				return normalizeStringArrayInput(parsed)
			}
		} catch (error) {
			// fall through to delimiter-based parsing
		}
		const parts = trimmed
			.split(/[\n,]/)
			.map((segment) => segment.trim())
			.filter(Boolean)
		return parts.length ? parts : undefined
	}
	return undefined
}

export function normalizeOwnerProfileInput(value: unknown, field = "owner_profile"): WorkplaceOwnerProfile | undefined {
	if (value === undefined || value === null) {
		return undefined
	}

	let record: Record<string, unknown>

	if (typeof value === "string") {
		const trimmed = value.trim()
		if (!trimmed) {
			return undefined
		}
		try {
			const parsed = JSON.parse(trimmed)
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				throw new Error(`${field} must be a JSON object`)
			}
			record = parsed as Record<string, unknown>
		} catch (error) {
			// Treat as simple string name fallback
			record = { name: trimmed }
		}
	} else if (typeof value === "object" && !Array.isArray(value)) {
		record = value as Record<string, unknown>
	} else {
		throw new Error(`${field} must be a JSON object or string`)
	}

	const name = optionalString(
		(record["name"] as string | undefined) ??
			(record["full_name"] as string | undefined) ??
			(record["owner_name"] as string | undefined),
	)
	const role = optionalString((record["role"] as string | undefined) ?? (record["title"] as string | undefined))
	const firstName = optionalString(
		(record["firstName"] as string | undefined) ?? (record["first_name"] as string | undefined),
	)
	const lastName = optionalString(
		(record["lastName"] as string | undefined) ?? (record["last_name"] as string | undefined),
	)
	const bio = optionalString((record["bio"] as string | undefined) ?? (record["summary"] as string | undefined))
	const mbtiValue = optionalString(
		(record["mbtiType"] as string | undefined) ?? (record["mbti_type"] as string | undefined),
	)?.toUpperCase()

	if (mbtiValue && !MBTI_TYPES.includes(mbtiValue as (typeof MBTI_TYPES)[number])) {
		throw new Error(`Invalid mbti_type on ${field}: ${mbtiValue}`)
	}

	const traits = normalizeStringArrayInput(
		record["personalityTraits"] ?? record["personality_traits"] ?? record["traits"],
	)

	return {
		name: name ?? "",
		role: role ?? "Owner & CEO",
		firstName: firstName ?? undefined,
		lastName: lastName ?? undefined,
		bio: bio ?? undefined,
		mbtiType: mbtiValue as WorkplaceOwnerProfile["mbtiType"],
		personalityTraits: traits,
	}
}

