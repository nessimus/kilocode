import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"
import { WorkplaceActionItemKind } from "../../shared/golden/workplace"

const ACTION_ITEM_KINDS: WorkplaceActionItemKind[] = ["goal", "project", "task"]
const MAX_RESULTS = 200

function toOptionalString(value?: string): string | undefined {
	const trimmed = value?.trim()
	return trimmed && trimmed.length ? trimmed : undefined
}

function parseActionItemKind(value: string | undefined): WorkplaceActionItemKind | undefined {
	const trimmed = toOptionalString(value)
	if (!trimmed) {
		return undefined
	}
	const normalized = trimmed.toLowerCase()
	if (ACTION_ITEM_KINDS.includes(normalized as WorkplaceActionItemKind)) {
		return normalized as WorkplaceActionItemKind
	}
	throw new Error(`kind must be one of: ${ACTION_ITEM_KINDS.join(", ")}`)
}

function parseLimit(value: string | undefined): number | undefined {
	const trimmed = toOptionalString(value)
	if (!trimmed) {
		return undefined
	}
	const parsed = Number.parseInt(trimmed, 10)
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error("limit must be a positive integer")
	}
	return Math.min(parsed, MAX_RESULTS)
}

export async function listActionItemsTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const companyIdRaw = block.params.company_id
	const statusIdRaw = block.params.status_id
	const ownerEmployeeIdRaw = block.params.owner_employee_id
	const kindRaw = block.params.kind
	const searchRaw = block.params.search
	const limitRaw = block.params.limit

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				tool: "listActionItems",
				company_id: removeClosingTag("company_id", companyIdRaw),
				status_id: removeClosingTag("status_id", statusIdRaw),
				owner_employee_id: removeClosingTag("owner_employee_id", ownerEmployeeIdRaw),
				kind: removeClosingTag("kind", kindRaw),
				search: removeClosingTag("search", searchRaw),
				limit: removeClosingTag("limit", limitRaw),
			})
			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		}

		const companyFilter = toOptionalString(companyIdRaw)
		const statusFilter = toOptionalString(statusIdRaw)
		const ownerFilterRaw = toOptionalString(ownerEmployeeIdRaw)
		const searchTerm = toOptionalString(searchRaw)?.toLowerCase()
		let kindFilter: WorkplaceActionItemKind | undefined
		let limit: number | undefined
		try {
			kindFilter = parseActionItemKind(kindRaw)
			limit = parseLimit(limitRaw)
		} catch (error) {
			throw error instanceof Error ? error : new Error(String(error))
		}
		const ownerFilter = ownerFilterRaw?.toLowerCase()
		const maxItems = limit ?? MAX_RESULTS

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

		const state = workplaceService.getState()
		const companies = companyFilter
			? state.companies.filter((company) => company.id === companyFilter)
			: state.companies

		const results: Array<{
			companyId: string
			companyName: string
			actionItemId: string
			title: string
			statusName?: string
			ownerEmployeeId?: string
			dueAt?: string
			priority?: string
			kind: WorkplaceActionItemKind
		}> = []
		const statusSummaries = new Map<
			string,
			{
				companyName: string
				statuses: Array<{ id: string; name: string; isTerminal?: boolean }>
			}
		>()

		for (const company of companies) {
			const sortedStatuses = [...(company.actionStatuses ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
			const statusLookup = new Map(sortedStatuses.map((status) => [status.id, status.name]))
			if (sortedStatuses.length) {
				statusSummaries.set(company.id, {
					companyName: company.name ?? company.id,
					statuses: sortedStatuses.map((status) => ({
						id: status.id,
						name: status.name,
						isTerminal: status.isTerminal,
					})),
				})
			}
			for (const item of company.actionItems) {
				if (statusFilter && item.statusId !== statusFilter) {
					continue
				}
				if (kindFilter && item.kind !== kindFilter) {
					continue
				}
				if (ownerFilter) {
					if (ownerFilter === "unassigned") {
						if (item.ownerEmployeeId) {
							continue
						}
					} else if ((item.ownerEmployeeId ?? "").toLowerCase() !== ownerFilter) {
						continue
					}
				}
				if (
					searchTerm &&
					!(
						(item.title ?? "").toLowerCase().includes(searchTerm) ||
						(item.description ?? "").toLowerCase().includes(searchTerm)
					)
				) {
					continue
				}

				results.push({
					companyId: company.id,
					companyName: company.name ?? company.id,
					actionItemId: item.id,
					title: item.title,
					statusName: statusLookup.get(item.statusId) ?? item.statusId,
					ownerEmployeeId: item.ownerEmployeeId,
					dueAt: item.dueAt,
					priority: item.priority,
					kind: item.kind,
				})
			}
		}

		if (!results.length) {
			pushToolResult(formatResponse.toolResult("No action items matched the provided filters."))
			return
		}

		const limited = results.slice(0, maxItems)
		const resultLines = limited.map((entry) => {
			const statusPrefix = entry.statusName ? `[${entry.statusName}] ` : ""
			const ownerText = `owner: ${entry.ownerEmployeeId ?? "(unassigned)"}`
			const dueText = entry.dueAt ? ` due: ${entry.dueAt}` : ""
			const priorityText = entry.priority ? ` priority: ${entry.priority}` : ""
			return `• ${statusPrefix}${entry.title} — id: ${entry.actionItemId}, kind: ${entry.kind}, company: ${entry.companyId}, ${ownerText}${dueText}${priorityText}`
		})
		if (results.length > maxItems) {
			resultLines.push(`…and ${results.length - maxItems} more action items (result truncated to ${maxItems}).`)
		}

		const statusLines: string[] = []
		if (statusSummaries.size && limited.length) {
			statusLines.push("Status options:")
			const relevantCompanyIds = new Set(limited.map((entry) => entry.companyId))
			for (const companyId of relevantCompanyIds) {
				const summary = statusSummaries.get(companyId)
				if (!summary || !summary.statuses.length) {
					continue
				}
				const renderedStatuses = summary.statuses
					.map((status) => {
						const terminalSuffix = status.isTerminal ? " [terminal]" : ""
						return `${status.id} -> ${status.name}${terminalSuffix}`
					})
					.join(", ")
				statusLines.push(`• ${summary.companyName} (${companyId}): ${renderedStatuses}`)
			}
		}

		const outputLines = statusLines.length ? [...statusLines, "", ...resultLines] : resultLines
		pushToolResult(formatResponse.toolResult(outputLines.join("\n")))
	} catch (error) {
		await handleError("list action items", error as Error)
	}
}
