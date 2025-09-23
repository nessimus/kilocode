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

const MAX_RESULTS = 50

export async function listCompaniesTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const companyIdRaw = block.params.company_id
	const searchRaw = block.params.search
	const includeArchivedRaw = block.params.include_archived

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				tool: "listCompanies",
				company_id: removeClosingTag("company_id", companyIdRaw),
				search: removeClosingTag("search", searchRaw),
				include_archived: removeClosingTag("include_archived", includeArchivedRaw),
			})
			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		}

		const companyIdFilter = toOptionalString(companyIdRaw)
		const searchFilter = toOptionalString(searchRaw)?.toLowerCase()
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
			companies = companies.filter((entry) => entry.id === companyIdFilter)
		}
		if (searchFilter) {
			companies = companies.filter((entry) => entry.name?.toLowerCase().includes(searchFilter))
		}

		// Placeholder for archived support (currently companies aren't archived, but honour the flag for future-proofing)
		if (!includeArchived) {
			// no-op today; keep for symmetry
		}

		const total = companies.length
		const limited = companies.slice(0, MAX_RESULTS)
		const responseLines = limited.map((company) => {
			const departmentCount = company.departments.filter((dept) => !dept.deletedAt).length
			const teamCount = company.teams.filter((team) => !team.deletedAt).length
			const activeEmployees = company.employees.filter((employee) => !employee.deletedAt).length
			return `• ${company.name || "(unnamed company)"} — id: ${company.id}, departments: ${departmentCount}, teams: ${teamCount}, employees: ${activeEmployees}`
		})

		if (!responseLines.length) {
			pushToolResult(formatResponse.toolResult("No companies matched the provided filters."))
			return
		}

		if (total > MAX_RESULTS) {
			responseLines.push(`…and ${total - MAX_RESULTS} more companies (result truncated).`)
		}

		pushToolResult(formatResponse.toolResult(responseLines.join("\n")))
	} catch (error) {
		await handleError("list companies", error as Error)
	}
}
