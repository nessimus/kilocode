import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"
import { WorkplaceActionItem, WorkplaceActionItemKind } from "../../shared/golden/workplace"

const ACTION_ITEM_KINDS: WorkplaceActionItemKind[] = ["goal", "project", "task"]
const PRIORITY_VALUES = ["low", "medium", "high", "urgent"] as const
const CLEAR_KEYWORDS = new Set(["clear", "remove", "none", "null", "unset", "unassign", "delete", "empty"])

type ActionItemPriority = (typeof PRIORITY_VALUES)[number]
type CustomPropertyValue = string | number | boolean | string[]

function toOptionalString(value?: string): string | undefined {
	const trimmed = value?.trim()
	return trimmed && trimmed.length ? trimmed : undefined
}

function toOptionalStringFromUnknown(value: unknown): string | undefined {
	if (value === undefined || value === null) {
		return undefined
	}
	if (typeof value === "string") {
		return toOptionalString(value)
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return toOptionalString(String(value))
	}
	return undefined
}

function parseActionItemKind(value: unknown, context: string): WorkplaceActionItemKind | undefined {
	const candidate = toOptionalStringFromUnknown(value)
	if (!candidate) {
		return undefined
	}
	const normalized = candidate.toLowerCase()
	if (ACTION_ITEM_KINDS.includes(normalized as WorkplaceActionItemKind)) {
		return normalized as WorkplaceActionItemKind
	}
	throw new Error(`${context} must be one of: ${ACTION_ITEM_KINDS.join(", ")}`)
}

function parsePriority(value: unknown, context: string): ActionItemPriority | undefined {
	const candidate = toOptionalStringFromUnknown(value)
	if (!candidate) {
		return undefined
	}
	const normalized = candidate.toLowerCase()
	if ((PRIORITY_VALUES as readonly string[]).includes(normalized)) {
		return normalized as ActionItemPriority
	}
	throw new Error(`${context} must be one of: ${PRIORITY_VALUES.join(", ")}`)
}

function parsePriorityUpdate(value: unknown, context: string): ActionItemPriority | null | undefined {
	if (value === undefined) {
		return undefined
	}
	if (value === null) {
		return null
	}
	const candidate = toOptionalStringFromUnknown(value)
	if (!candidate) {
		return null
	}
	if (CLEAR_KEYWORDS.has(candidate.toLowerCase())) {
		return null
	}
	return parsePriority(candidate, context)
}

function parseDueAt(value: unknown, context: string): string | undefined {
	const candidate = toOptionalStringFromUnknown(value)
	if (!candidate) {
		return undefined
	}
	if (Number.isNaN(Date.parse(candidate))) {
		throw new Error(`${context} must be a valid ISO-8601 timestamp or parsable date`)
	}
	return candidate
}

function parseDueAtUpdate(value: unknown, context: string): string | null | undefined {
	if (value === undefined) {
		return undefined
	}
	if (value === null) {
		return null
	}
	const candidate = toOptionalStringFromUnknown(value)
	if (!candidate) {
		return null
	}
	if (CLEAR_KEYWORDS.has(candidate.toLowerCase())) {
		return null
	}
	return parseDueAt(candidate, context)
}

function normalizeCustomProperties(record: Record<string, unknown>): Record<string, CustomPropertyValue> {
	const result: Record<string, CustomPropertyValue> = {}
	for (const [key, value] of Object.entries(record)) {
		if (value === undefined || value === null) {
			continue
		}
		if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
			result[key] = value
			continue
		}
		if (Array.isArray(value)) {
			const entries = value
				.map((entry) => toOptionalStringFromUnknown(entry))
				.filter((entry): entry is string => Boolean(entry))
			result[key] = entries
			continue
		}
		throw new Error(`custom_properties.${key} must be a string, number, boolean, or array of strings`)
	}
	return result
}

function parseCustomProperties(value: unknown): Record<string, CustomPropertyValue> | undefined {
	if (value === undefined || value === null) {
		return undefined
	}
	if (typeof value === "object" && !Array.isArray(value)) {
		return normalizeCustomProperties(value as Record<string, unknown>)
	}
	if (typeof value === "string") {
		const trimmed = value.trim()
		if (!trimmed) {
			return undefined
		}
		let parsed: unknown
		try {
			parsed = JSON.parse(trimmed)
		} catch (error) {
			throw new Error("custom_properties must be a valid JSON object")
		}
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			throw new Error("custom_properties must be a JSON object")
		}
		return normalizeCustomProperties(parsed as Record<string, unknown>)
	}
	throw new Error("custom_properties must be a JSON object")
}

function parseCustomPropertiesUpdate(value: unknown): Record<string, CustomPropertyValue> | null | undefined {
	if (value === undefined) {
		return undefined
	}
	if (value === null) {
		return null
	}
	if (typeof value === "string") {
		const trimmed = value.trim()
		if (!trimmed || CLEAR_KEYWORDS.has(trimmed.toLowerCase())) {
			return null
		}
	}
	return parseCustomProperties(value)
}

function parseNullableString(value: unknown): string | null | undefined {
	if (value === undefined) {
		return undefined
	}
	if (value === null) {
		return null
	}
	const candidate = toOptionalStringFromUnknown(value)
	if (!candidate) {
		return null
	}
	if (CLEAR_KEYWORDS.has(candidate.toLowerCase())) {
		return null
	}
	return candidate
}

type ActionItemUpdate = {
	title?: string
	kind?: WorkplaceActionItemKind
	statusId?: string
	description?: string | null
	ownerEmployeeId?: string | null
	dueAt?: string | null
	priority?: ActionItemPriority | null
	customProperties?: Record<string, CustomPropertyValue> | null
}

type UpdateDescriptor = {
	companyId: string
	actionItemId: string
	updates: ActionItemUpdate
}

function ensureHasMutations(updates: ActionItemUpdate, context: string) {
	const hasChange = Object.values(updates).some((value) => value !== undefined)
	if (!hasChange) {
		throw new Error(`${context} must specify at least one field to update`)
	}
}

function parseUpdatesJson(
	raw: string,
	defaults: {
		companyId?: string
		actionItemId?: string
		title?: string
		kind?: WorkplaceActionItemKind
		statusId?: string
		description?: string | null
		ownerEmployeeId?: string | null
		dueAt?: string | null
		priority?: ActionItemPriority | null
		customProperties?: Record<string, CustomPropertyValue> | null
	},
): UpdateDescriptor[] {
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch (error) {
		throw new Error("action_item_updates must be valid JSON (array or object)")
	}

	const entries = Array.isArray(parsed) ? parsed : [parsed]
	if (!entries.length) {
		throw new Error("action_item_updates must include at least one entry")
	}

	return entries.map((entry, index) => {
		if (!entry || typeof entry !== "object") {
			throw new Error(`action_item_updates[${index}] must be an object`)
		}
		const record = entry as Record<string, unknown>
		const companyId = toOptionalStringFromUnknown(record["company_id"] ?? record["companyId"]) ?? defaults.companyId
		if (!companyId) {
			throw new Error(`action_item_updates[${index}] is missing company_id`)
		}
		const actionItemId =
			toOptionalStringFromUnknown(record["action_item_id"] ?? record["actionItemId"]) ?? defaults.actionItemId
		if (!actionItemId) {
			throw new Error(`action_item_updates[${index}] is missing action_item_id`)
		}
		let kind: WorkplaceActionItemKind | undefined
		let priority: ActionItemPriority | null | undefined
		let dueAt: string | null | undefined
		try {
			kind =
				parseActionItemKind(record["kind"] ?? record["type"], `action_item_updates[${index}].kind`) ??
				defaults.kind
			priority = parsePriorityUpdate(
				record["priority"] ?? record["importance"],
				`action_item_updates[${index}].priority`,
			)
			if (priority === undefined) {
				priority = defaults.priority
			}
			dueAt = parseDueAtUpdate(record["due_at"] ?? record["dueAt"], `action_item_updates[${index}].due_at`)
			if (dueAt === undefined) {
				dueAt = defaults.dueAt
			}
		} catch (error) {
			throw error instanceof Error ? error : new Error(String(error))
		}

		let customProperties: Record<string, CustomPropertyValue> | null | undefined
		try {
			customProperties = parseCustomPropertiesUpdate(record["custom_properties"] ?? record["customProperties"])
			if (customProperties === undefined) {
				customProperties = defaults.customProperties
			}
		} catch (error) {
			throw error instanceof Error ? error : new Error(String(error))
		}

		const title = toOptionalStringFromUnknown(record["title"] ?? record["name"]) ?? defaults.title
		const statusId = toOptionalStringFromUnknown(record["status_id"] ?? record["statusId"]) ?? defaults.statusId
		const description = parseNullableString(record["description"] ?? record["details"])
		const ownerEmployeeId = parseNullableString(record["owner_employee_id"] ?? record["ownerEmployeeId"])

		const descriptor: UpdateDescriptor = {
			companyId,
			actionItemId,
			updates: {
				title: title,
				kind,
				statusId,
				description: description ?? defaults.description,
				ownerEmployeeId: ownerEmployeeId ?? defaults.ownerEmployeeId,
				dueAt,
				priority,
				customProperties,
			},
		}
		ensureHasMutations(descriptor.updates, `action_item_updates[${index}]`)
		return descriptor
	})
}

export async function updateActionItemTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const companyIdRaw = block.params.company_id
	const actionItemIdRaw = block.params.action_item_id
	const titleRaw = block.params.title
	const kindRaw = block.params.kind
	const statusIdRaw = block.params.status_id
	const descriptionRaw = block.params.description
	const ownerEmployeeIdRaw = block.params.owner_employee_id
	const dueAtRaw = block.params.due_at
	const priorityRaw = block.params.priority
	const customPropertiesRaw = block.params.custom_properties
	const updatesRaw = block.params.action_item_updates

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				tool: "updateActionItem",
				company_id: removeClosingTag("company_id", companyIdRaw),
				action_item_id: removeClosingTag("action_item_id", actionItemIdRaw),
				title: removeClosingTag("title", titleRaw),
				kind: removeClosingTag("kind", kindRaw),
				status_id: removeClosingTag("status_id", statusIdRaw),
				description: removeClosingTag("description", descriptionRaw),
				owner_employee_id: removeClosingTag("owner_employee_id", ownerEmployeeIdRaw),
				due_at: removeClosingTag("due_at", dueAtRaw),
				priority: removeClosingTag("priority", priorityRaw),
				custom_properties: removeClosingTag("custom_properties", customPropertiesRaw),
				action_item_updates: removeClosingTag("action_item_updates", updatesRaw),
			})
			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		}

		let defaultKind: WorkplaceActionItemKind | undefined
		let defaultPriority: ActionItemPriority | null | undefined
		let defaultDueAt: string | null | undefined
		let defaultCustomProperties: Record<string, CustomPropertyValue> | null | undefined
		let defaultDescription: string | null | undefined
		let defaultOwnerEmployeeId: string | null | undefined

		try {
			defaultKind = parseActionItemKind(kindRaw, "kind")
			defaultPriority = parsePriorityUpdate(priorityRaw, "priority")
			defaultDueAt = parseDueAtUpdate(dueAtRaw, "due_at")
			defaultCustomProperties = parseCustomPropertiesUpdate(customPropertiesRaw)
			defaultDescription = parseNullableString(descriptionRaw)
			defaultOwnerEmployeeId = parseNullableString(ownerEmployeeIdRaw)
		} catch (error) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("update_action_item")
			pushToolResult(formatResponse.toolError(error instanceof Error ? error.message : String(error)))
			return
		}

		const defaultCompanyId = toOptionalString(companyIdRaw)
		const defaultActionItemId = toOptionalString(actionItemIdRaw)
		const defaultTitle = toOptionalString(titleRaw)
		const defaultStatusId = toOptionalString(statusIdRaw)

		let descriptors: UpdateDescriptor[]
		try {
			if (updatesRaw && updatesRaw.trim().length) {
				descriptors = parseUpdatesJson(updatesRaw.trim(), {
					companyId: defaultCompanyId,
					actionItemId: defaultActionItemId,
					title: defaultTitle,
					kind: defaultKind,
					statusId: defaultStatusId,
					description: defaultDescription,
					ownerEmployeeId: defaultOwnerEmployeeId,
					dueAt: defaultDueAt,
					priority: defaultPriority,
					customProperties: defaultCustomProperties,
				})
			} else {
				if (!defaultCompanyId) {
					throw new Error("company_id is required when action_item_updates is not provided")
				}
				if (!defaultActionItemId) {
					throw new Error("action_item_id is required when action_item_updates is not provided")
				}
				const updates: ActionItemUpdate = {
					title: defaultTitle,
					kind: defaultKind,
					statusId: defaultStatusId,
					description: defaultDescription,
					ownerEmployeeId: defaultOwnerEmployeeId,
					dueAt: defaultDueAt,
					priority: defaultPriority,
					customProperties: defaultCustomProperties,
				}
				ensureHasMutations(updates, "update_action_item")
				descriptors = [
					{
						companyId: defaultCompanyId,
						actionItemId: defaultActionItemId,
						updates,
					},
				]
			}
		} catch (error) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("update_action_item")
			pushToolResult(formatResponse.toolError(error instanceof Error ? error.message : String(error)))
			return
		}

		cline.consecutiveMistakeCount = 0

		const provider = cline.providerRef.deref()
		if (!provider) {
			pushToolResult(formatResponse.toolError("Provider reference lost"))
			return
		}

		const workplaceService = provider.getWorkplaceService()
		if (!workplaceService) {
			pushToolResult(formatResponse.toolError("Workplace service is unavailable in this session."))
			return
		}

		const approvalMessage = JSON.stringify({
			tool: "updateActionItem",
			updates: descriptors.map((entry) => ({
				company_id: entry.companyId,
				action_item_id: entry.actionItemId,
				title: entry.updates.title,
				kind: entry.updates.kind,
				status_id: entry.updates.statusId,
				description: entry.updates.description,
				owner_employee_id: entry.updates.ownerEmployeeId,
				due_at: entry.updates.dueAt,
				priority: entry.updates.priority,
				custom_properties: entry.updates.customProperties,
			})),
		})

		const didApprove = await askApproval("tool", approvalMessage)
		if (!didApprove) {
			pushToolResult("User declined to update the action item(s).")
			return
		}

		const summaries: Array<{
			companyId: string
			actionItemId: string
			title: string
			statusName?: string
			ownerEmployeeId?: string
			priority?: string
			changedFields: string[]
		}> = []

		for (const descriptor of descriptors) {
			const currentState = workplaceService.getState()
			const company = currentState.companies.find((entry) => entry.id === descriptor.companyId)
			if (!company) {
				throw new Error(`Company ${descriptor.companyId} not found`)
			}
			const existing = company.actionItems.find((entry) => entry.id === descriptor.actionItemId)
			if (!existing) {
				throw new Error(`Action item ${descriptor.actionItemId} not found in company ${descriptor.companyId}`)
			}

			const updates = descriptor.updates
			const next: WorkplaceActionItem = {
				...existing,
				title: updates.title ?? existing.title,
				kind: updates.kind ?? existing.kind,
				statusId: updates.statusId ?? existing.statusId,
				description:
					updates.description === undefined ? existing.description : (updates.description ?? undefined),
				ownerEmployeeId:
					updates.ownerEmployeeId === undefined
						? existing.ownerEmployeeId
						: (updates.ownerEmployeeId ?? undefined),
				dueAt: updates.dueAt === undefined ? existing.dueAt : (updates.dueAt ?? undefined),
				priority: updates.priority === undefined ? existing.priority : (updates.priority ?? undefined),
				customProperties:
					updates.customProperties === undefined
						? existing.customProperties
						: (updates.customProperties ?? undefined),
				updatedAt: new Date().toISOString(),
			}

			const changedFields: string[] = []
			if (next.title !== existing.title) {
				changedFields.push("title")
			}
			if (next.kind !== existing.kind) {
				changedFields.push("kind")
			}
			if (next.statusId !== existing.statusId) {
				changedFields.push("status")
			}
			if ((next.description ?? "") !== (existing.description ?? "")) {
				changedFields.push("description")
			}
			if ((next.ownerEmployeeId ?? "") !== (existing.ownerEmployeeId ?? "")) {
				changedFields.push("owner")
			}
			if ((next.dueAt ?? "") !== (existing.dueAt ?? "")) {
				changedFields.push("due_at")
			}
			if ((next.priority ?? "") !== (existing.priority ?? "")) {
				changedFields.push("priority")
			}
			const existingCustom = JSON.stringify(existing.customProperties ?? {})
			const nextCustom = JSON.stringify(next.customProperties ?? {})
			if (existingCustom !== nextCustom) {
				changedFields.push("custom_properties")
			}

			const nextState = await workplaceService.updateActionItem({
				companyId: descriptor.companyId,
				actionItem: next,
			})

			const latestCompany = nextState.companies.find((entry) => entry.id === descriptor.companyId)
			const latestItem = latestCompany?.actionItems.find((entry) => entry.id === descriptor.actionItemId)
			const statusName = latestCompany?.actionStatuses.find((status) => status.id === latestItem?.statusId)?.name

			summaries.push({
				companyId: descriptor.companyId,
				actionItemId: descriptor.actionItemId,
				title: latestItem?.title ?? next.title,
				statusName,
				ownerEmployeeId: latestItem?.ownerEmployeeId ?? next.ownerEmployeeId,
				priority: latestItem?.priority ?? next.priority,
				changedFields,
			})
		}

		await provider.postStateToWebview()

		if (!summaries.length) {
			pushToolResult(formatResponse.toolResult("No action items were updated."))
			return
		}

		if (summaries.length === 1) {
			const single = summaries[0]
			const changes = single.changedFields.length ? ` Fields updated: ${single.changedFields.join(", ")}.` : ""
			const statusText = single.statusName ? ` status=${single.statusName}` : ""
			const ownerText =
				single.ownerEmployeeId !== undefined ? ` owner=${single.ownerEmployeeId || "(unassigned)"}` : ""
			const priorityText = single.priority ? ` priority=${single.priority}` : ""
			pushToolResult(
				formatResponse.toolResult(
					`Updated action item ${single.title} (${single.actionItemId}) in company ${single.companyId}.${statusText}${ownerText}${priorityText}${changes}`,
				),
			)
			return
		}

		const companySet = new Set(summaries.map((entry) => entry.companyId))
		const details = summaries
			.map((entry) => {
				const changes = entry.changedFields.length ? ` [${entry.changedFields.join(", ")}]` : ""
				return `${entry.title} (${entry.actionItemId}) @ ${entry.companyId}${changes}`
			})
			.join("; ")
		pushToolResult(
			formatResponse.toolResult(
				`Updated ${summaries.length} action items across ${companySet.size} companies: ${details}.`,
			),
		)
	} catch (error) {
		await handleError("update action item", error as Error)
	}
}
