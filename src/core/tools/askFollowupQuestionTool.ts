import { Task } from "../task/Task"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"
import { formatResponse } from "../prompts/responses"
import { parseXml } from "../../utils/xml"
import { dispatchFollowupNotification } from "../../integrations/notifications/NotificationBridge"

export async function askFollowupQuestionTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const question: string | undefined = block.params.question
	const follow_up: string | undefined = block.params.follow_up

	try {
		if (block.partial) {
			await cline.ask("followup", removeClosingTag("question", question), block.partial).catch(() => {})
			return
		} else {
			if (!question) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("ask_followup_question")
				pushToolResult(await cline.sayAndCreateMissingParamError("ask_followup_question", "question"))
				return
			}

			type Suggest = { answer: string; mode?: string }

			let follow_up_json = {
				question,
				suggest: [] as Suggest[],
			}

			let normalizedSuggest: Suggest[] = []

			if (follow_up) {
				// Define the actual structure returned by the XML parser
				type ParsedSuggestion = string | { "#text": string; "@_mode"?: string }

				let parsedSuggest: {
					suggest: ParsedSuggestion[] | ParsedSuggestion
				}

				try {
					parsedSuggest = parseXml(follow_up, ["suggest"]) as {
						suggest: ParsedSuggestion[] | ParsedSuggestion
					}
				} catch (error) {
					cline.consecutiveMistakeCount++
					cline.recordToolError("ask_followup_question")
					await cline.say("error", `Failed to parse operations: ${error.message}`)
					pushToolResult(formatResponse.toolError("Invalid operations xml format"))
					return
				}

				const rawSuggestions = Array.isArray(parsedSuggest?.suggest)
					? parsedSuggest.suggest
					: [parsedSuggest?.suggest].filter((sug): sug is ParsedSuggestion => sug !== undefined)

				// Transform parsed XML to our Suggest format
				normalizedSuggest = rawSuggestions.map((sug) => {
					if (typeof sug === "string") {
						// Simple string suggestion (no mode attribute)
						return { answer: sug }
					} else {
						// XML object with text content and optional mode attribute
						const result: Suggest = { answer: sug["#text"] }
						if (sug["@_mode"]) {
							result.mode = sug["@_mode"]
						}
						return result
					}
				})

				follow_up_json.suggest = normalizedSuggest
			}

			cline.consecutiveMistakeCount = 0
			const { text, images } = await cline.ask("followup", JSON.stringify(follow_up_json), false)
			await cline.say("user_feedback", text ?? "", images)
			pushToolResult(formatResponse.toolResult(`<answer>\n${text}\n</answer>`, images))

			const provider = cline.providerRef.deref()
			if (provider) {
				try {
					const workplaceState = provider.getWorkplaceService()?.getState()
					let personaName = "Your AI employee"
					let companyName: string | undefined

					if (workplaceState?.companies?.length) {
						const activeCompanyId = workplaceState.activeCompanyId ?? workplaceState.companies[0]?.id
						const company =
							workplaceState.companies.find((entry) => entry.id === activeCompanyId) ??
							workplaceState.companies[0]
						if (company) {
							companyName = company.name
							const activeEmployeeId =
								workplaceState.activeEmployeeId ?? company.activeEmployeeId ?? company.employees[0]?.id
							const employee =
								company.employees.find((candidate) => candidate.id === activeEmployeeId) ??
								company.employees[0]
							if (employee?.name) {
								personaName = employee.name
							}
						}
					}

					const dispatchResult = await dispatchFollowupNotification(
						{
							email: provider.contextProxy.getValue("notificationEmail") as string | undefined,
							emailPassword: provider.contextProxy.getValue("notificationEmailAppPassword") as
								| string
								| undefined,
							smsNumber: provider.contextProxy.getValue("notificationSmsNumber") as string | undefined,
							smsGateway: provider.contextProxy.getValue("notificationSmsGateway") as string | undefined,
							telegramBotToken: provider.contextProxy.getValue("notificationTelegramBotToken") as
								| string
								| undefined,
							telegramChatId: provider.contextProxy.getValue("notificationTelegramChatId") as
								| string
								| undefined,
						},
						{
							personaName,
							companyName,
							question,
							suggestions: normalizedSuggest.map((entry) => entry.answer),
						},
					)

					if (dispatchResult.errors.length) {
						provider.log?.(
							`ask_followup_question notification dispatch issues: ${dispatchResult.errors.join("; ")}`,
						)
					}
				} catch (notificationError) {
					provider.log?.(
						`ask_followup_question notification dispatch failed: ${
							notificationError instanceof Error ? notificationError.message : String(notificationError)
						}`,
					)
				}
			}

			return
		}
	} catch (error) {
		await handleError("asking question", error)
		return
	}
}
