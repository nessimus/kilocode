import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"
import { CreateActionItemPayload, WorkplaceActionItemKind } from "../../shared/golden/workplace"

const ACTION_ITEM_KINDS: WorkplaceActionItemKind[] = ["goal", "project", "task"]
const PRIORITY_VALUES = ["low", "medium", "high", "urgent"] as const

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

function parsePriority(value: unknown, context: string): (typeof PRIORITY_VALUES)[number] | undefined {
	const candidate = toOptionalStringFromUnknown(value)
	if (!candidate) {
		return undefined
	}
	const normalized = candidate.toLowerCase()
	if ((PRIORITY_VALUES as readonly string[]).includes(normalized)) {
		return normalized as (typeof PRIORITY_VALUES)[number]
	}
	throw new Error(`${context} must be one of: ${PRIORITY_VALUES.join(", ")}`)
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

type CustomPropertyValue = string | number | boolean | string[]

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
			const stringified = value
				.map((entry) => toOptionalStringFromUnknown(entry))
				.filter((entry): entry is string => Boolean(entry))
			result[key] = stringified
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

type ActionItemDescriptor = {
	companyId: string
	title: string
	kind: WorkplaceActionItemKind
	statusId?: string
	description?: string
	ownerEmployeeId?: string
	dueAt?: string
	priority?: (typeof PRIORITY_VALUES)[number]
	customProperties?: Record<string, CustomPropertyValue>
}

function parseActionItemsJson(
	raw: string,
	defaults: {
		companyId?: string
		title?: string
		kind?: WorkplaceActionItemKind
		statusId?: string
		description?: string
		ownerEmployeeId?: string
		dueAt?: string
		priority?: (typeof PRIORITY_VALUES)[number]
		customProperties?: Record<string, CustomPropertyValue>
	},
): ActionItemDescriptor[] {
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch (error) {
		throw new Error("action_items must be valid JSON (array or object)")
	}

	const entries = Array.isArray(parsed) ? parsed : [parsed]
	if (!entries.length) {
		throw new Error("action_items must include at least one entry")
	}

	return entries.map((entry, index) => {
		if (!entry || typeof entry !== "object") {
			throw new Error(`action_items[${index}] must be an object`)
		}
		const record = entry as Record<string, unknown>
		const companyId = toOptionalStringFromUnknown(record["company_id"] ?? record["companyId"]) ?? defaults.companyId
		if (!companyId) {
			throw new Error(`action_items[${index}] is missing company_id`)
		}
		const title = toOptionalStringFromUnknown(record["title"]) ?? defaults.title
		if (!title) {
			throw new Error(`action_items[${index}] is missing title`)
		}
		const kind =
			parseActionItemKind(record["kind"] ?? record["type"], `action_items[${index}].kind`) ?? defaults.kind
		if (!kind) {
			throw new Error(`action_items[${index}] is missing kind`)
		}
		const statusId = toOptionalStringFromUnknown(record["status_id"] ?? record["statusId"]) ?? defaults.statusId
		const description =
			toOptionalStringFromUnknown(record["description"] ?? record["details"]) ?? defaults.description
		const ownerEmployeeId =
			toOptionalStringFromUnknown(record["owner_employee_id"] ?? record["ownerEmployeeId"]) ??
			defaults.ownerEmployeeId
		let dueAt = defaults.dueAt
		try {
			dueAt = parseDueAt(record["due_at"] ?? record["dueAt"] ?? defaults.dueAt, `action_items[${index}].due_at`)
		} catch (error) {
			throw error instanceof Error ? error : new Error(String(error))
		}
		let priority = defaults.priority
		try {
			const parsedPriority = parsePriority(
				record["priority"] ?? record["importance"] ?? defaults.priority,
				`action_items[${index}].priority`,
			)
			priority = parsedPriority ?? defaults.priority
		} catch (error) {
			throw error instanceof Error ? error : new Error(String(error))
		}
		let customProperties = defaults.customProperties
		try {
			const parsedProperties = parseCustomProperties(
				record["custom_properties"] ?? record["customProperties"] ?? defaults.customProperties,
			)
			customProperties = parsedProperties ?? defaults.customProperties
		} catch (error) {
			throw error instanceof Error ? error : new Error(String(error))
		}

		return {
			companyId,
			title,
			kind,
			statusId,
			description,
			ownerEmployeeId,
			dueAt,
			priority,
			customProperties,
		}
	})
}

export async function createActionItemTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const companyIdRaw = block.params.company_id
	const titleRaw = block.params.title
	const kindRaw = block.params.kind
	const statusIdRaw = block.params.status_id
	const descriptionRaw = block.params.description
	const ownerEmployeeIdRaw = block.params.owner_employee_id
	const dueAtRaw = block.params.due_at
	const priorityRaw = block.params.priority
	const customPropertiesRaw = block.params.custom_properties
	const actionItemsRaw = block.params.action_items

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				tool: "createActionItem",
				company_id: removeClosingTag("company_id", companyIdRaw),
				title: removeClosingTag("title", titleRaw),
				kind: removeClosingTag("kind", kindRaw),
				status_id: removeClosingTag("status_id", statusIdRaw),
				description: removeClosingTag("description", descriptionRaw),
				owner_employee_id: removeClosingTag("owner_employee_id", ownerEmployeeIdRaw),
				due_at: removeClosingTag("due_at", dueAtRaw),
				priority: removeClosingTag("priority", priorityRaw),
				custom_properties: removeClosingTag("custom_properties", customPropertiesRaw),
				action_items: removeClosingTag("action_items", actionItemsRaw),
			})
			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		}

		let defaultKind: WorkplaceActionItemKind | undefined
		let defaultPriority: (typeof PRIORITY_VALUES)[number] | undefined
		let defaultDueAt: string | undefined
		let defaultCustomProperties: Record<string, CustomPropertyValue> | undefined

		try {
			defaultKind = parseActionItemKind(kindRaw, "kind")
			defaultPriority = parsePriority(priorityRaw, "priority")
			defaultDueAt = parseDueAt(dueAtRaw, "due_at")
			defaultCustomProperties = parseCustomProperties(customPropertiesRaw)
		} catch (error) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("create_action_item")
			pushToolResult(formatResponse.toolError(error instanceof Error ? error.message : String(error)))
			return
		}

		const defaultCompanyId = toOptionalString(companyIdRaw)
		const defaultTitle = toOptionalString(titleRaw)
		const defaultStatusId = toOptionalString(statusIdRaw)
		const defaultDescription = toOptionalString(descriptionRaw)
		const defaultOwnerEmployeeId = toOptionalString(ownerEmployeeIdRaw)

		let descriptors: ActionItemDescriptor[]
		try {
			if (actionItemsRaw && actionItemsRaw.trim().length) {
				descriptors = parseActionItemsJson(actionItemsRaw.trim(), {
					companyId: defaultCompanyId,
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
					throw new Error("company_id is required when action_items is not provided")
				}
				if (!defaultTitle) {
					throw new Error("title is required when action_items is not provided")
				}
				if (!defaultKind) {
					throw new Error("kind is required when action_items is not provided")
				}
				descriptors = [
					{
						companyId: defaultCompanyId,
						title: defaultTitle,
						kind: defaultKind,
						statusId: defaultStatusId,
						description: defaultDescription,
						ownerEmployeeId: defaultOwnerEmployeeId,
						dueAt: defaultDueAt,
						priority: defaultPriority,
						customProperties: defaultCustomProperties,
					},
				]
			}
		} catch (error) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("create_action_item")
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
			tool: "createActionItem",
			action_items: descriptors.map((entry) => ({
				company_id: entry.companyId,
				title: entry.title,
				kind: entry.kind,
				status_id: entry.statusId,
				description: entry.description,
				owner_employee_id: entry.ownerEmployeeId,
				due_at: entry.dueAt,
				priority: entry.priority,
				custom_properties: entry.customProperties,
			})),
		})

		const didApprove = await askApproval("tool", approvalMessage)
		if (!didApprove) {
			pushToolResult("User declined to create the action item(s).")
			return
		}

		const initialState = workplaceService.getState()
		const knownIds = new Map<string, Set<string>>()
		for (const company of initialState.companies) {
			knownIds.set(company.id, new Set(company.actionItems.map((item) => item.id)))
		}

		const summaries: Array<{
			companyId: string
			actionItemId?: string
			title: string
			statusName?: string
			ownerEmployeeId?: string
			priority?: string
		}> = []

		for (const descriptor of descriptors) {
			const payload: CreateActionItemPayload = {
				companyId: descriptor.companyId,
				title: descriptor.title,
				kind: descriptor.kind,
			}
			if (descriptor.statusId) {
				payload.statusId = descriptor.statusId
			}
			if (descriptor.description) {
				payload.description = descriptor.description
			}
			if (descriptor.ownerEmployeeId) {
				payload.ownerEmployeeId = descriptor.ownerEmployeeId
			}
			if (descriptor.dueAt) {
				payload.dueAt = descriptor.dueAt
			}
			if (descriptor.priority) {
				payload.priority = descriptor.priority
			}
			if (descriptor.customProperties && Object.keys(descriptor.customProperties).length) {
				payload.customProperties = descriptor.customProperties
			}

			const nextState = await workplaceService.createActionItem(payload)
			const company = nextState.companies.find((entry) => entry.id === descriptor.companyId)
			const companyKnownIds = knownIds.get(descriptor.companyId) ?? new Set<string>()
			let createdItemId: string | undefined
			let statusName: string | undefined
			if (company) {
				createdItemId = company.actionItems.find((item) => !companyKnownIds.has(item.id))?.id
				if (createdItemId) {
					companyKnownIds.add(createdItemId)
					knownIds.set(descriptor.companyId, companyKnownIds)
					const createdItem = company.actionItems.find((item) => item.id === createdItemId)
					if (createdItem) {
						statusName = company.actionStatuses?.find((status) => status.id === createdItem.statusId)?.name
						summaries.push({
							companyId: descriptor.companyId,
							actionItemId: createdItem.id,
							title: createdItem.title,
							statusName,
							ownerEmployeeId: createdItem.ownerEmployeeId,
							priority: createdItem.priority,
						})
						continue
					}
				}
			}
			summaries.push({
				companyId: descriptor.companyId,
				title: descriptor.title,
				statusName: descriptor.statusId,
				ownerEmployeeId: descriptor.ownerEmployeeId,
				priority: descriptor.priority,
			})
		}

		await provider.postStateToWebview()

		if (!summaries.length) {
			pushToolResult(formatResponse.toolResult("No action items were created."))
			return
		}

		if (summaries.length === 1) {
			const single = summaries[0]
			const ownerText = single.ownerEmployeeId ? ` owner=${single.ownerEmployeeId}` : ""
			const priorityText = single.priority ? ` priority=${single.priority}` : ""
			const statusText = single.statusName ? ` status=${single.statusName}` : ""
			const idText = single.actionItemId ? ` (${single.actionItemId})` : ""
			pushToolResult(
				formatResponse.toolResult(
					`Created action item ${single.title}${idText} in company ${single.companyId}.${statusText}${ownerText}${priorityText}`.trim(),
				),
			)
			return
		}

		const companySet = new Set(summaries.map((entry) => entry.companyId))
		const details = summaries
			.map((entry) => {
				const idText = entry.actionItemId ? ` (${entry.actionItemId})` : ""
				const parts = [
					entry.statusName && `status=${entry.statusName}`,
					entry.ownerEmployeeId && `owner=${entry.ownerEmployeeId}`,
				]
				const annotations = parts.filter(Boolean).length ? ` [${parts.filter(Boolean).join(", ")}]` : ""
				return `${entry.title}${idText} @ ${entry.companyId}${annotations}`
			})
			.join("; ")
		pushToolResult(
			formatResponse.toolResult(
				`Created ${summaries.length} action items across ${companySet.size} companies: ${details}.`,
			),
		)
	} catch (error) {
		await handleError("create action item", error as Error)
	}
}
