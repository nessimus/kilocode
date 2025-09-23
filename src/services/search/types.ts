export type WebSearchType = "quick" | "deep_research"

export interface WebSearchRequest {
	query: string
	searchType: WebSearchType
	context?: string
}

export interface WebSearchResult {
	title: string
	url: string
	snippet: string
	provider: string
	score?: number
	publishedAt?: string
	raw?: unknown
}

export interface ProviderSearchResult {
	provider: string
	results: WebSearchResult[]
	answer?: string
	raw?: unknown
}

export interface ProviderAttempt {
	provider: string
	status: "success" | "skipped" | "error" | "no_results"
	message?: string
	resultCount?: number
}

export interface WebSearchSuccess extends ProviderSearchResult {
	attempts: ProviderAttempt[]
}

export interface WebSearchProvider {
	readonly name: string
	isConfigured(): boolean
	search(request: WebSearchRequest, signal: AbortSignal): Promise<ProviderSearchResult>
}

export interface SearchRouterOptions {
	timeoutMs?: number
	tavilyApiKey?: string
	braveApiKey?: string
	perplexityApiKey?: string
	fetchImpl?: typeof fetch
}

export class WebSearchError extends Error {
	constructor(
		message: string,
		public readonly attempts: ProviderAttempt[],
	) {
		super(message)
		this.name = "WebSearchError"
	}
}

export type FetchLike = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>
