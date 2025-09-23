import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { AskApproval, HandleError, PushToolResult, RemoveClosingTag, ToolUse } from "../../shared/tools"
import { SearchRouter, WebSearchError, WebSearchRequest, WebSearchSuccess, WebSearchType } from "../../services/search"

const DEFAULT_SEARCH_TYPE: WebSearchType = "quick"
const MAX_RESULTS_TO_DISPLAY = 8

export async function webSearchTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const queryRaw = block.params.query
	const searchTypeRaw = block.params.web_search_type
	const contextRaw = block.params.context

	const query = queryRaw ? removeClosingTag("query", queryRaw)?.trim() : ""
	const searchType = normalizeSearchType(
		searchTypeRaw ? removeClosingTag("web_search_type", searchTypeRaw) : undefined,
	)
	const context = contextRaw ? removeClosingTag("context", contextRaw) : undefined

	const sharedMessagePayload = {
		tool: "webSearch",
		query,
		searchType,
	}

	if (block.partial) {
		await cline.ask("tool", JSON.stringify(sharedMessagePayload), block.partial).catch(() => {})
		return
	}

	if (!query) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("web_search")
		pushToolResult(await cline.sayAndCreateMissingParamError("web_search", "query"))
		return
	}

	cline.consecutiveMistakeCount = 0

	const didApprove = await askApproval("tool", JSON.stringify(sharedMessagePayload))
	if (!didApprove) {
		pushToolResult(formatResponse.toolDenied())
		return
	}

	try {
		const router = await buildSearchRouter(cline)
		const request: WebSearchRequest = { query, searchType, context }
		const result = await router.search(request)

		cline.recordToolUsage("web_search")

		const formatted = formatWebSearchResult(query, searchType, result)
		pushToolResult(formatResponse.toolResult(formatted))
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		cline.recordToolError("web_search", errorMessage)

		if (error instanceof WebSearchError) {
			const attemptSummary = error.attempts
				.map((attempt) => {
					const details = []
					if (attempt.message) {
						details.push(attempt.message)
					}
					if (typeof attempt.resultCount === "number") {
						details.push(`results: ${attempt.resultCount}`)
					}
					const suffix = details.length ? ` (${details.join(", ")})` : ""
					return `- ${attempt.provider}: ${attempt.status}${suffix}`
				})
				.join("\n")
			const failureMessage = `Web search failed: no provider returned results.\nAttempts:\n${attemptSummary || "- none"}`
			pushToolResult(failureMessage)
			return
		}

		await handleError("web search", error as Error)
	}
}

async function buildSearchRouter(cline: Task): Promise<SearchRouter> {
	let tavilyKey: string | undefined
	let braveKey: string | undefined
	let perplexityKey: string | undefined

	const provider = cline.providerRef.deref()
	if (provider && typeof provider.getState === "function") {
		try {
			const state = await provider.getState()
			const searchSettings = (state as any)?.webSearchSettings ?? (state as any)?.webSearch ?? undefined
			if (searchSettings) {
				tavilyKey = searchSettings.tavilyApiKey ?? tavilyKey
				braveKey = searchSettings.braveApiKey ?? braveKey
				perplexityKey = searchSettings.perplexityApiKey ?? perplexityKey
			}
		} catch (error) {
			console.warn("Failed to read web search settings from provider state", error)
		}
	}

	tavilyKey = tavilyKey ?? process.env.TAVILY_API_KEY
	braveKey = braveKey ?? process.env.BRAVE_SEARCH_API_KEY
	perplexityKey = perplexityKey ?? process.env.PERPLEXITY_API_KEY

	return new SearchRouter({
		timeoutMs: 15000,
		tavilyApiKey: tavilyKey,
		braveApiKey: braveKey,
		perplexityApiKey: perplexityKey,
	})
}

function normalizeSearchType(raw?: string | null): WebSearchType {
	if (!raw) {
		return DEFAULT_SEARCH_TYPE
	}

	const normalized = raw.trim().toLowerCase().replace(/\s+/g, "_")
	if (normalized === "deep_research" || normalized === "deep-research" || normalized === "deep") {
		return "deep_research"
	}

	return DEFAULT_SEARCH_TYPE
}

function formatWebSearchResult(query: string, searchType: WebSearchType, result: WebSearchSuccess): string {
	const lines = result.results.slice(0, MAX_RESULTS_TO_DISPLAY).map((item, index) => {
		const parts: string[] = []
		parts.push(`${index + 1}. ${item.title || item.url}`)
		if (item.snippet) {
			parts.push(item.snippet.trim())
		}
		parts.push(`Source: ${item.url}`)
		const providerDetails: string[] = [item.provider]
		if (typeof item.score === "number") {
			providerDetails.push(`score ${item.score.toFixed(3)}`)
		}
		if (item.publishedAt) {
			providerDetails.push(`published ${item.publishedAt}`)
		}
		parts.push(`Provider details: ${providerDetails.join(", ")}`)
		return parts.join("\n")
	})

	const attemptSummary = result.attempts
		.map((attempt) => {
			const details: string[] = []
			if (attempt.message) {
				details.push(attempt.message)
			}
			if (typeof attempt.resultCount === "number") {
				details.push(`results: ${attempt.resultCount}`)
			}
			const suffix = details.length ? ` (${details.join(", ")})` : ""
			return `- ${attempt.provider}: ${attempt.status}${suffix}`
		})
		.join("\n")

	const answerSection = result.answer && result.answer.trim().length > 0 ? `Answer:\n${result.answer.trim()}\n\n` : ""

	return `Web search for "${query}" (${searchType}) via ${result.provider}.\n\n${answerSection}${lines.join("\n\n") || "No results returned."}\n\nProvider attempts:\n${attemptSummary || "- none"}`
}
