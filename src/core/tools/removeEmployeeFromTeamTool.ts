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

type RemovalDescriptor = {
	companyId: string
	teamId: string
	employeeId: string
}

function parseAssignmentsJson(
	raw: string,
	fallbackCompanyId?: string,
	fallbackTeamId?: string,
	fallbackEmployeeId?: string,
): RemovalDescriptor[] {
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch (error) {
		throw new Error("assignments must be valid JSON (array or object)")
	}

	const entries = Array.isArray(parsed) ? parsed : [parsed]
	if (!entries.length) {
		throw new Error("assignments must include at least one entry")
	}

	return entries.map((entry, index) => {
		if (!entry || typeof entry !== "object") {
			throw new Error(`assignments[${index}] must be an object`)
		}
		const record = entry as Record<string, unknown>
		const companyId = toOptionalStringFromUnknown(record["company_id"] ?? record["companyId"]) ?? fallbackCompanyId
		if (!companyId) {
			throw new Error(`assignments[${index}] is missing company_id`)
		}
		const teamId = toOptionalStringFromUnknown(record["team_id"] ?? record["teamId"]) ?? fallbackTeamId
		if (!teamId) {
			throw new Error(`assignments[${index}] is missing team_id`)
		}
		const employeeId =
			toOptionalStringFromUnknown(record["employee_id"] ?? record["employeeId"]) ?? fallbackEmployeeId
		if (!employeeId) {
			throw new Error(`assignments[${index}] is missing employee_id`)
		}
		return { companyId, teamId, employeeId }
	})
}

export async function removeEmployeeFromTeamTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const companyIdRaw = block.params.company_id
	const teamIdRaw = block.params.team_id
	const employeeIdRaw = block.params.employee_id
	const assignmentsRaw = block.params.assignments

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				tool: "removeEmployeeFromTeam",
				company_id: removeClosingTag("company_id", companyIdRaw),
				team_id: removeClosingTag("team_id", teamIdRaw),
				employee_id: removeClosingTag("employee_id", employeeIdRaw),
				assignments: removeClosingTag("assignments", assignmentsRaw),
			})
			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		}

		const defaultCompanyId = toOptionalString(companyIdRaw)
		const defaultTeamId = toOptionalString(teamIdRaw)
		const defaultEmployeeId = toOptionalString(employeeIdRaw)

		let removals: RemovalDescriptor[]
		try {
			if (assignmentsRaw) {
				removals = parseAssignmentsJson(assignmentsRaw, defaultCompanyId, defaultTeamId, defaultEmployeeId)
			} else {
				if (!defaultCompanyId) {
					throw new Error("company_id is required when assignments is not provided")
				}
				if (!defaultTeamId) {
					throw new Error("team_id is required when assignments is not provided")
				}
				if (!defaultEmployeeId) {
					throw new Error("employee_id is required when assignments is not provided")
				}
				removals = [{ companyId: defaultCompanyId, teamId: defaultTeamId, employeeId: defaultEmployeeId }]
			}
		} catch (error) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("remove_employee_from_team")
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
			tool: "removeEmployeeFromTeam",
			assignments: removals.map((entry) => ({
				company_id: entry.companyId,
				team_id: entry.teamId,
				employee_id: entry.employeeId,
			})),
		})

		const didApprove = await askApproval("tool", approvalMessage)
		if (!didApprove) {
			pushToolResult("User declined to remove the employee(s) from the team(s).")
			return
		}

		const summaries: Array<{
			companyId: string
			teamId: string
			employeeId: string
			employeeName?: string
			teamName?: string
		}> = []
		for (const removal of removals) {
			const currentState = workplaceService.getState()
			const company = currentState.companies.find((entry) => entry.id === removal.companyId)
			const team = company?.teams.find((entry) => entry.id === removal.teamId)
			const employee = company?.employees.find((entry) => entry.id === removal.employeeId)
			await workplaceService.removeEmployeeFromTeam(removal)
			summaries.push({
				companyId: removal.companyId,
				teamId: removal.teamId,
				employeeId: removal.employeeId,
				employeeName: employee?.name,
				teamName: team?.name,
			})
		}

		await provider.postStateToWebview()

		const summary = (() => {
			if (summaries.length === 1) {
				const single = summaries[0]
				return `Removed ${single.employeeName ?? single.employeeId} from ${
					single.teamName ?? single.teamId
				} in ${single.companyId}.`
			}
			const details = summaries
				.map(
					(entry) =>
						`${entry.employeeName ?? entry.employeeId} ← ${entry.teamName ?? entry.teamId} (${entry.companyId})`,
				)
				.join(", ")
			return `Removed ${summaries.length} team memberships across ${
				new Set(summaries.map((entry) => entry.companyId)).size
			} companies: ${details}.`
		})()

		pushToolResult(formatResponse.toolResult(summary))
	} catch (error) {
		await handleError("remove employee from team", error as Error)
	}
}
