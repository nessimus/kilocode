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

type TeamAssignmentDescriptor = {
	companyId: string
	teamId: string
	departmentId?: string
}

function parseAssignmentsJson(
	raw: string,
	fallbackCompanyId?: string,
	fallbackTeamId?: string,
	fallbackDepartmentId?: string,
): TeamAssignmentDescriptor[] {
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
		const departmentId =
			toOptionalStringFromUnknown(record["department_id"] ?? record["departmentId"]) ?? fallbackDepartmentId
		return { companyId, teamId, departmentId }
	})
}

export async function assignTeamToDepartmentTool(
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
	const assignmentsRaw = block.params.assignments

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				tool: "assignTeamToDepartment",
				company_id: removeClosingTag("company_id", companyIdRaw),
				team_id: removeClosingTag("team_id", teamIdRaw),
				department_id: removeClosingTag("department_id", departmentIdRaw),
				assignments: removeClosingTag("assignments", assignmentsRaw),
			})
			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		}

		const defaultCompanyId = toOptionalString(companyIdRaw)
		const defaultTeamId = toOptionalString(teamIdRaw)
		const defaultDepartmentId = toOptionalString(departmentIdRaw)

		let assignments: TeamAssignmentDescriptor[]
		try {
			if (assignmentsRaw) {
				assignments = parseAssignmentsJson(assignmentsRaw, defaultCompanyId, defaultTeamId, defaultDepartmentId)
			} else {
				if (!defaultCompanyId) {
					throw new Error("company_id is required when assignments is not provided")
				}
				if (!defaultTeamId) {
					throw new Error("team_id is required when assignments is not provided")
				}
				assignments = [
					{
						companyId: defaultCompanyId,
						teamId: defaultTeamId,
						departmentId: defaultDepartmentId,
					},
				]
			}
		} catch (error) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("assign_team_to_department")
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
			tool: "assignTeamToDepartment",
			assignments: assignments.map((entry) => ({
				company_id: entry.companyId,
				team_id: entry.teamId,
				department_id: entry.departmentId,
			})),
		})

		const didApprove = await askApproval("tool", approvalMessage)
		if (!didApprove) {
			pushToolResult("User declined to modify team-to-department assignments.")
			return
		}

		const summaries: Array<{ companyId: string; teamId: string; departmentId?: string }> = []
		for (const assignment of assignments) {
			await workplaceService.assignTeamToDepartment(assignment)
			summaries.push(assignment)
		}

		await provider.postStateToWebview()

		const summary = (() => {
			if (summaries.length === 1) {
				const single = summaries[0]
				return single.departmentId
					? `Assigned team ${single.teamId} to department ${single.departmentId} in company ${single.companyId}.`
					: `Detached team ${single.teamId} from all departments in company ${single.companyId}.`
			}
			const details = summaries
				.map((entry) =>
					entry.departmentId
						? `${entry.teamId} -> ${entry.departmentId} (${entry.companyId})`
						: `${entry.teamId} detached (${entry.companyId})`,
				)
				.join(", ")
			return `Processed ${summaries.length} team assignments across ${
				new Set(summaries.map((entry) => entry.companyId)).size
			} companies: ${details}.`
		})()

		pushToolResult(formatResponse.toolResult(summary))
	} catch (error) {
		await handleError("assign team to department", error as Error)
	}
}
