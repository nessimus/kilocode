import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"

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

function parseBoolean(value: string | undefined): boolean | undefined {
	const normalized = toOptionalString(value)?.toLowerCase()
	if (!normalized) {
		return undefined
	}
	if (["true", "1", "yes"].includes(normalized)) {
		return true
	}
	if (["false", "0", "no"].includes(normalized)) {
		return false
	}
	throw new Error(`Invalid boolean value: ${value}`)
}

const MAX_RESULTS = 100

export async function listDepartmentsTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const companyIdRaw = block.params.company_id
	const departmentIdRaw = block.params.department_id
	const teamIdRaw = block.params.team_id
	const nameContainsRaw = block.params.name_contains
	const includeArchivedRaw = block.params.include_archived

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				tool: "listDepartments",
				company_id: removeClosingTag("company_id", companyIdRaw),
				department_id: removeClosingTag("department_id", departmentIdRaw),
				team_id: removeClosingTag("team_id", teamIdRaw),
				name_contains: removeClosingTag("name_contains", nameContainsRaw),
				include_archived: removeClosingTag("include_archived", includeArchivedRaw),
			})
			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		}

		const companyIdFilter = toOptionalString(companyIdRaw)
		const departmentIdFilter = toOptionalString(departmentIdRaw)
		const teamIdFilter = toOptionalString(teamIdRaw)
		const nameContains = toOptionalString(nameContainsRaw)?.toLowerCase()
		let includeArchived = false
		try {
			const parsed = parseBoolean(includeArchivedRaw)
			includeArchived = parsed ?? false
		} catch (error) {
			throw new Error(error instanceof Error ? error.message : String(error))
		}

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
		let companies = state.companies
		if (companyIdFilter) {
			companies = companies.filter((company) => company.id === companyIdFilter)
		}

		const results: Array<{
			companyId: string
			departmentId: string
			name: string
			teamCount: number
			activeTeamIds: string[]
			isArchived: boolean
		}> = []

		for (const company of companies) {
			const departmentList = company.departments.filter((department) => {
				if (!includeArchived && department.deletedAt) {
					return false
				}
				if (departmentIdFilter && department.id !== departmentIdFilter) {
					return false
				}
				if (nameContains && !(department.name ?? "").toLowerCase().includes(nameContains)) {
					return false
				}
				if (teamIdFilter) {
					const teamIds = department.teamIds ?? []
					if (!teamIds.includes(teamIdFilter)) {
						return false
					}
				}
				return true
			})

			for (const department of departmentList) {
				const activeTeams = department.teamIds ?? []
				results.push({
					companyId: company.id,
					departmentId: department.id,
					name: department.name ?? "(unnamed department)",
					teamCount: activeTeams.length,
					activeTeamIds: activeTeams,
					isArchived: Boolean(department.deletedAt),
				})
			}
		}

		if (results.length === 0) {
			pushToolResult(formatResponse.toolResult("No departments matched the provided filters."))
			return
		}

		const limited = results.slice(0, MAX_RESULTS)
		const lines = limited.map((entry) => {
			const suffix = entry.activeTeamIds.length ? ` teams=${entry.activeTeamIds.join(",")}` : ""
			return `• ${entry.name} — id: ${entry.departmentId}, company: ${entry.companyId}, teams: ${entry.teamCount}${suffix}${
				entry.isArchived ? " (archived)" : ""
			}`
		})
		if (results.length > MAX_RESULTS) {
			lines.push(`…and ${results.length - MAX_RESULTS} more departments (result truncated).`)
		}

		pushToolResult(formatResponse.toolResult(lines.join("\n")))
	} catch (error) {
		await handleError("list departments", error as Error)
	}
}
