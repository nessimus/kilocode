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

const MAX_RESULTS = 200

export async function listEmployeesTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const companyIdRaw = block.params.company_id
	const employeeIdRaw = block.params.employee_id
	const teamIdRaw = block.params.team_id
	const departmentIdRaw = block.params.department_id
	const nameContainsRaw = block.params.name_contains
	const includeArchivedRaw = block.params.include_archived

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				tool: "listEmployees",
				company_id: removeClosingTag("company_id", companyIdRaw),
				employee_id: removeClosingTag("employee_id", employeeIdRaw),
				team_id: removeClosingTag("team_id", teamIdRaw),
				department_id: removeClosingTag("department_id", departmentIdRaw),
				name_contains: removeClosingTag("name_contains", nameContainsRaw),
				include_archived: removeClosingTag("include_archived", includeArchivedRaw),
			})
			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		}

		const companyIdFilter = toOptionalString(companyIdRaw)
		const employeeIdFilter = toOptionalString(employeeIdRaw)
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
			employeeId: string
			name: string
			role: string
			teamIds: string[]
			isExecutiveManager: boolean
			isArchived: boolean
		}> = []

		for (const company of companies) {
			const teamMembershipMap = new Map<string, string[]>()
			for (const team of company.teams) {
				const memberIds = team.employeeIds ?? []
				for (const memberId of memberIds) {
					const list = teamMembershipMap.get(memberId)
					if (list) {
						list.push(team.id)
					} else {
						teamMembershipMap.set(memberId, [team.id])
					}
				}
			}

			let departmentTeamIds: Set<string> | undefined
			if (departmentIdFilter) {
				const department = company.departments.find((entry) => entry.id === departmentIdFilter)
				if (!department) {
					continue
				}
				departmentTeamIds = new Set(department.teamIds ?? [])
			}

			for (const employee of company.employees) {
				if (!includeArchived && employee.deletedAt) {
					continue
				}
				if (employeeIdFilter && employee.id !== employeeIdFilter) {
					continue
				}
				if (nameContains && !(employee.name ?? "").toLowerCase().includes(nameContains)) {
					continue
				}

				const teamIds = teamMembershipMap.get(employee.id) ?? []
				if (teamIdFilter && !teamIds.includes(teamIdFilter)) {
					continue
				}
				if (departmentTeamIds) {
					const belongsToDepartment = teamIds.some((id) => departmentTeamIds!.has(id))
					if (!belongsToDepartment) {
						continue
					}
				}

				results.push({
					companyId: company.id,
					employeeId: employee.id,
					name: employee.name,
					role: employee.role,
					teamIds,
					isExecutiveManager: Boolean(employee.isExecutiveManager),
					isArchived: Boolean(employee.deletedAt),
				})
			}
		}

		if (results.length === 0) {
			pushToolResult(formatResponse.toolResult("No employees matched the provided filters."))
			return
		}

		const limited = results.slice(0, MAX_RESULTS)
		const lines = limited.map((entry) => {
			const teamText = entry.teamIds.length ? ` teams=${entry.teamIds.join(",")}` : ""
			const flags = [entry.isExecutiveManager ? "executive" : null, entry.isArchived ? "archived" : null]
				.filter(Boolean)
				.join(",")
			const flagText = flags ? ` [${flags}]` : ""
			return `• ${entry.name} — id: ${entry.employeeId}, role: ${entry.role}, company: ${entry.companyId}${teamText}${flagText}`
		})
		if (results.length > MAX_RESULTS) {
			lines.push(`…and ${results.length - MAX_RESULTS} more employees (result truncated).`)
		}

		pushToolResult(formatResponse.toolResult(lines.join("\n")))
	} catch (error) {
		await handleError("list employees", error as Error)
	}
}
