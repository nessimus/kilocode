// kilocode_change: imported from Cline

export const DEFAULT_MCP_TIMEOUT_SECONDS = 60 // matches Anthropic's default timeout in their MCP SDK
export const MIN_MCP_TIMEOUT_SECONDS = 1
export type McpMode = "full" | "server-use-only" | "off"

export type ToolIntegrationType = "mcp" | "computer-use" | "potential-mcp"
export type ToolLibrarySource = "remote" | "curated"

export interface ToolLibraryDocs {
	homepage?: string
	setup?: string
	apiReference?: string
	marketplace?: string
}

export interface ToolLibraryCredential {
	key: string
	placeholder: string
	description?: string
}

export interface ToolLibraryMethod {
	name: string
	description: string
	docsUrl?: string
}

export interface ToolLibrarySetup {
	transport?: "stdio" | "sse" | "http" | "headless-browser" | "desktop"
	command?: string
	args?: string[]
	workingDirectory?: string
	env?: Record<string, string>
	launchUrl?: string
}

export interface ToolLibrarySupportedBrand {
	name: string
	integrationType: ToolIntegrationType
	notes?: string
}

export interface McpMarketplaceItem {
	mcpId: string
	githubUrl: string
	name: string
	author: string
	description: string
	codiconIcon: string
	logoUrl: string
	category: string
	tags: string[]
	requiresApiKey: boolean
	readmeContent?: string
	llmsInstallationContent?: string
	isRecommended: boolean
	githubStars: number
	downloadCount: number
	createdAt: string
	updatedAt: string
	lastGithubSync: string
	integrationType?: ToolIntegrationType
	docs?: ToolLibraryDocs
	setup?: ToolLibrarySetup
	credentials?: ToolLibraryCredential[]
	methods?: ToolLibraryMethod[]
	notes?: string[]
	supportedBrands?: ToolLibrarySupportedBrand[]
	source?: ToolLibrarySource
}

export interface McpMarketplaceCatalog {
	items: McpMarketplaceItem[]
}

export interface McpDownloadResponse {
	mcpId: string
	githubUrl: string
	name: string
	author: string
	description: string
	readmeContent: string
	llmsInstallationContent: string
	requiresApiKey: boolean
}

export interface McpState {
	mcpMarketplaceCatalog?: McpMarketplaceCatalog
}
