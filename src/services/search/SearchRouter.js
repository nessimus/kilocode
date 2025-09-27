import { WebSearchError, } from "./types";
const DEFAULT_TIMEOUT_MS = 15000;
export class SearchRouter {
    fetchImpl;
    timeoutMs;
    providers;
    constructor(options = {}) {
        const fetchImpl = options.fetchImpl ?? globalThis.fetch;
        if (!fetchImpl) {
            throw new Error("No fetch implementation is available for web search.");
        }
        this.fetchImpl = fetchImpl;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.providers = new Map();
        this.providers.set("tavily", new TavilySearchProvider(options.tavilyApiKey, this.fetchImpl));
        this.providers.set("brave", new BraveSearchProvider(options.braveApiKey, this.fetchImpl));
        this.providers.set("perplexity", new PerplexitySearchProvider(options.perplexityApiKey, this.fetchImpl));
    }
    async search(request) {
        const attempts = [];
        const orderedProviders = this.getProviderOrder(request.searchType);
        if (orderedProviders.length === 0) {
            throw new WebSearchError("No web search providers are configured.", attempts);
        }
        for (const provider of orderedProviders) {
            if (!provider.isConfigured()) {
                attempts.push({
                    provider: provider.name,
                    status: "skipped",
                    message: "Missing API key",
                });
                continue;
            }
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
            try {
                const result = await provider.search(request, controller.signal);
                clearTimeout(timeout);
                const resultCount = result.results.length;
                if (resultCount === 0) {
                    attempts.push({
                        provider: provider.name,
                        status: "no_results",
                        message: "Provider returned no results",
                    });
                    continue;
                }
                attempts.push({
                    provider: provider.name,
                    status: "success",
                    resultCount,
                });
                return {
                    ...result,
                    attempts,
                };
            }
            catch (error) {
                clearTimeout(timeout);
                const message = error instanceof Error ? error.message : String(error);
                attempts.push({
                    provider: provider.name,
                    status: "error",
                    message,
                });
            }
        }
        throw new WebSearchError("All web search providers failed.", attempts);
    }
    getProviderOrder(searchType) {
        const orderedNames = searchType === "deep_research" ? ["tavily", "perplexity", "brave"] : ["tavily", "brave", "perplexity"];
        return orderedNames
            .map((name) => this.providers.get(name))
            .filter((provider) => Boolean(provider));
    }
}
class TavilySearchProvider {
    apiKey;
    fetchImpl;
    name = "tavily";
    constructor(apiKey, fetchImpl) {
        this.apiKey = apiKey;
        this.fetchImpl = fetchImpl;
    }
    isConfigured() {
        return typeof this.apiKey === "string" && this.apiKey.trim().length > 0;
    }
    async search(request, signal) {
        const searchDepth = request.searchType === "deep_research" ? "advanced" : "basic";
        const response = await this.fetchImpl("https://api.tavily.com/search", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                query: request.query,
                search_depth: searchDepth,
                include_answer: true,
                include_images: false,
            }),
            signal,
        });
        if (!response.ok) {
            throw new Error(`Tavily request failed with status ${response.status}`);
        }
        const data = await response.json();
        const results = Array.isArray(data.results)
            ? data.results
                .map((item) => ({
                provider: this.name,
                title: item.title ?? item.url ?? request.query,
                url: item.url ?? "",
                snippet: item.content ?? item.snippet ?? "",
                score: typeof item.score === "number" ? item.score : undefined,
                publishedAt: item.published_date ?? item.published_at,
                raw: item,
            }))
                .filter((item) => item.url)
            : [];
        return {
            provider: this.name,
            results,
            answer: typeof data.answer === "string" ? data.answer : undefined,
            raw: data,
        };
    }
}
class BraveSearchProvider {
    apiKey;
    fetchImpl;
    name = "brave";
    constructor(apiKey, fetchImpl) {
        this.apiKey = apiKey;
        this.fetchImpl = fetchImpl;
    }
    isConfigured() {
        return typeof this.apiKey === "string" && this.apiKey.trim().length > 0;
    }
    async search(request, signal) {
        const count = request.searchType === "deep_research" ? 20 : 10;
        const url = new URL("https://api.search.brave.com/res/v1/web/search");
        url.searchParams.set("q", request.query);
        url.searchParams.set("count", String(count));
        const response = await this.fetchImpl(url, {
            headers: {
                Accept: "application/json",
                "X-Subscription-Token": this.apiKey ?? "",
            },
            signal,
        });
        if (!response.ok) {
            throw new Error(`Brave request failed with status ${response.status}`);
        }
        const data = await response.json();
        const webResults = Array.isArray(data?.web?.results) ? data.web.results : [];
        const results = webResults
            .map((item) => ({
            provider: this.name,
            title: item.title ?? item.url ?? request.query,
            url: item.url ?? "",
            snippet: item.description ?? item.snippet ?? item.content ?? "",
            score: typeof item.score === "number" ? item.score : undefined,
            publishedAt: item.page_age ?? item.published ?? undefined,
            raw: item,
        }))
            .filter((item) => item.url);
        return {
            provider: this.name,
            results,
            raw: data,
        };
    }
}
class PerplexitySearchProvider {
    apiKey;
    fetchImpl;
    name = "perplexity";
    constructor(apiKey, fetchImpl) {
        this.apiKey = apiKey;
        this.fetchImpl = fetchImpl;
    }
    isConfigured() {
        return typeof this.apiKey === "string" && this.apiKey.trim().length > 0;
    }
    async search(request, signal) {
        const model = request.searchType === "deep_research" ? "sonar-pro" : "sonar";
        const response = await this.fetchImpl("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model,
                return_citations: true,
                messages: [
                    {
                        role: "system",
                        content: "You are a search engine that returns concise factual answers with citations.",
                    },
                    { role: "user", content: request.query },
                ],
            }),
            signal,
        });
        if (!response.ok) {
            throw new Error(`Perplexity request failed with status ${response.status}`);
        }
        const data = await response.json();
        const choice = Array.isArray(data?.choices) ? data.choices[0] : undefined;
        const message = choice?.message;
        let answer;
        if (typeof message?.content === "string") {
            answer = message.content;
        }
        else if (Array.isArray(message?.content)) {
            const textBlocks = message.content
                .map((block) => {
                if (typeof block === "string") {
                    return block;
                }
                if (block && typeof block.text === "string") {
                    return block.text;
                }
                return "";
            })
                .filter((segment) => segment.trim().length > 0)
                .join("\n")
                .trim();
            answer = textBlocks.length > 0 ? textBlocks : undefined;
        }
        const citationCandidates = Array.isArray(message?.citations)
            ? message.citations
            : Array.isArray(choice?.citations)
                ? choice.citations
                : Array.isArray(data?.citations)
                    ? data.citations
                    : [];
        const results = citationCandidates
            .map((citation) => ({
            provider: this.name,
            title: citation.title ?? citation.url ?? request.query,
            url: citation.url ?? "",
            snippet: citation.text ?? citation.snippet ?? "",
            score: citation.score,
            publishedAt: citation.published_at,
            raw: citation,
        }))
            .filter((item) => item.url);
        return {
            provider: this.name,
            results,
            answer,
            raw: data,
        };
    }
}
//# sourceMappingURL=SearchRouter.js.map