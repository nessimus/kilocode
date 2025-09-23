import { ToolArgs } from "./types"

export function getWebSearchDescription(_args: ToolArgs): string {
	return [
		"## web_search",
		"Description: Gather fresh information from the public web. The extension routes each request through the most suitable provider (e.g., Tavily, Brave, Perplexity) and returns normalized results with citations. Use this when you need up-to-date facts, market data, or primary reporting that is not already in the workspace.",
		"Parameters:",
		"- query: (required) The exact search query or question to answer.",
		"- web_search_type: (optional) Either `quick` (default) for lightweight lookups or `deep_research` for multi-source investigations.",
		"- context: (optional) Short guidance or constraints to help the router focus (e.g., preferred regions, key entities).",
		"Usage:",
		"<web_search>",
		"<query>What are the latest SEC cybersecurity disclosure rules?</query>",
		"<web_search_type>deep_research</web_search_type>",
		"<context>Focus on official guidance published after December 2023.</context>",
		"</web_search>",
	].join("\n")
}
