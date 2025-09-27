import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { TelemetryService } from "@roo-code/telemetry"
import { TelemetryEventName } from "@roo-code/types"

import {
	ToolUse,
	AskApproval,
	HandleError,
	PushToolResult,
	RemoveClosingTag,
} from "../../shared/tools"
import { optionalString } from "./helpers/workplace"

function extractCompanyIds(raw: string | undefined): string[] {
	if (!raw || !raw.trim()) {
		return []
	}

	try {
		const parsed = JSON.parse(raw)
		const asArray = Array.isArray(parsed) ? parsed : [parsed]
		return asArray
			.map((entry) => {
				if (typeof entry === "string") {
					return optionalString(entry)
				}
				if (entry && typeof entry === "object") {
					const record = entry as Record<string, unknown>
					return optionalString(
						(typeof record["company_id"] === "string"
							? record["company_id"]
							: typeof record["companyId"] === "string"
							? record["companyId"]
							: undefined) as string | undefined,
					)
				}
				return undefined
			})
			.filter((value): value is string => Boolean(value))
	} catch (error) {
		return []
	}
}

export async function deleteCompanyTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const companyIdRaw = block.params.company_id
	const companiesRaw = block.params.companies

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				tool: "deleteCompany",
				company_id: removeClosingTag("company_id", companyIdRaw),
				companies: removeClosingTag("companies", companiesRaw),
			})
			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		}

		const directId = optionalString(companyIdRaw)
		const referencedIds = extractCompanyIds(companiesRaw)
		const allIds = Array.from(new Set([...(directId ? [directId] : []), ...referencedIds]))

		TelemetryService.instance.captureEvent(
			TelemetryEventName.CLOVER_WORKPLACE_AUTOMATION,
			{
				taskId: cline.taskId,
				action: "delete_company",
				companyIds: allIds,
				success: false,
				reason: "not_permitted",
			},
		)

		const descriptor = allIds.length
			? allIds.map((id) => `"${id}"`).join(", ")
			: "the requested company"
		const denialMessage = `Company deletion is disabled for Clover automations. The request targeting ${descriptor} was denied.`
		pushToolResult(formatResponse.toolResult(denialMessage))
	} catch (error) {
		await handleError("deny company deletion", error as Error)
	}
}

