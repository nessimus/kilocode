import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"

function toOptionalString(value?: string): string | undefined {
	const trimmed = value?.trim()
	return trimmed && trimmed.length ? trimmed : undefined
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

export async function listTeamsTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const companyIdRaw = block.params.company_id
	const teamIdRaw = block.params.team_id
	const departmentIdRaw = block.params.department_id
	const nameContainsRaw = block.params.name_contains
	const includeArchivedRaw = block.params.include_archived

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				tool: "listTeams",
				company_id: removeClosingTag("company_id", companyIdRaw),
				team_id: removeClosingTag("team_id", teamIdRaw),
				department_id: removeClosingTag("department_id", departmentIdRaw),
				name_contains: removeClosingTag("name_contains", nameContainsRaw),
				include_archived: removeClosingTag("include_archived", includeArchivedRaw),
			})
			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		}

		const companyIdFilter = toOptionalString(companyIdRaw)
		const teamIdFilter = toOptionalString(teamIdRaw)
		const departmentIdFilter = toOptionalString(departmentIdRaw)
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
			teamId: string
			name: string
			departmentId?: string
			memberCount: number
			isArchived: boolean
		}> = []

		for (const company of companies) {
			for (const team of company.teams) {
				if (!includeArchived && team.deletedAt) {
					continue
				}
				if (teamIdFilter && team.id !== teamIdFilter) {
					continue
				}
				if (nameContains && !(team.name ?? "").toLowerCase().includes(nameContains)) {
					continue
				}

				let teamDepartmentId: string | undefined
				if (company.departments?.length) {
					for (const department of company.departments) {
						if (department.teamIds?.includes(team.id) && !department.deletedAt) {
							teamDepartmentId = department.id
							break
						}
					}
				}

				if (departmentIdFilter) {
					if (teamDepartmentId !== departmentIdFilter) {
						continue
					}
				}

				results.push({
					companyId: company.id,
					teamId: team.id,
					name: team.name ?? "(unnamed team)",
					departmentId: teamDepartmentId,
					memberCount: team.employeeIds?.length ?? 0,
					isArchived: Boolean(team.deletedAt),
				})
			}
		}

		if (results.length === 0) {
			pushToolResult(formatResponse.toolResult("No teams matched the provided filters."))
			return
		}

		const limited = results.slice(0, MAX_RESULTS)
		const lines = limited.map((entry) => {
			const departmentText = entry.departmentId ? ` department=${entry.departmentId}` : ""
			return `• ${entry.name} — id: ${entry.teamId}, company: ${entry.companyId}${departmentText}, members: ${entry.memberCount}${
				entry.isArchived ? " (archived)" : ""
			}`
		})
		if (results.length > MAX_RESULTS) {
			lines.push(`…and ${results.length - MAX_RESULTS} more teams (result truncated).`)
		}

		pushToolResult(formatResponse.toolResult(lines.join("\n")))
	} catch (error) {
		await handleError("list teams", error as Error)
	}
}
