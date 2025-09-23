export type OuterGateInsightStage = "captured" | "processing" | "ready" | "assigned"

export interface OuterGateInsight {
	id: string
	title: string
	sourceType: "conversation" | "document" | "voice" | "integration"
	summary?: string
	stage: OuterGateInsightStage
	recommendedWorkspace?: string
	capturedAtIso?: string
	assignedCompanyId?: string
}

export interface OuterGateAnalysisPool {
	totalCaptured: number
	processing: number
	ready: number
	assignedThisWeek: number
	lastUpdatedIso: string
}

export interface OuterGateQuickAction {
	slug: "create-workspace" | "import-data" | "capture-thought" | string
	title: string
	description: string
	icon: string
}

export interface OuterGateIntegration {
	id: string
	name: string
	status: "connected" | "not_connected" | "coming_soon"
	providerIcon?: string
	description?: string
}

export const defaultOuterGateIntegrations: OuterGateIntegration[] = [
	{
		id: "notion",
		name: "Notion",
		status: "not_connected",
		providerIcon: "codicon-book",
		description: "Connected workspace wiki for organizing docs and projects across your team.",
	},
	{
		id: "miro",
		name: "Miro",
		status: "not_connected",
		providerIcon: "codicon-layout",
		description: "Collaborative whiteboarding platform for brainstorming, mapping, and planning.",
	},
	{
		id: "life-hq",
		name: "Life HQ",
		status: "coming_soon",
		providerIcon: "codicon-organization",
		description: "LifeHQ stream placeholder — this will light up once their API opens later this quarter.",
	},
	{
		id: "drive",
		name: "Google Drive",
		status: "coming_soon",
		providerIcon: "codicon-cloud-upload",
		description: "Google Drive connector is in progress. Use Notion, Miro, or ZIP uploads for now.",
	},
	{
		id: "chatgpt",
		name: "OpenAI ChatGPT",
		status: "not_connected",
		providerIcon: "codicon-hubot",
		description: "Import your chat history from OpenAI's ChatGPT.",
	},
	{
		id: "zip-file",
		name: "Zip File",
		status: "not_connected",
		providerIcon: "codicon-archive",
		description: "Drop a .zip archive of notes, transcripts, or research to ingest them manually.",
	},
]

export interface OuterGateCloverMessage {
	id: string
	speaker: "user" | "clover"
	text: string
	timestamp: string
	tokens?: number
	references?: string[]
}

export interface OuterGateCloverSessionSummary {
	id: string
	createdAtIso: string
	updatedAtIso: string
	companyId?: string
	companyName?: string
	title: string
	preview: string
	messageCount: number
	lastMessage?: OuterGateCloverMessage
}

export interface OuterGateCloverSessionState {
	entries: OuterGateCloverSessionSummary[]
	hasMore: boolean
	cursor?: string
	isLoading?: boolean
	isInitialFetchComplete: boolean
}

export interface OuterGateState {
	analysisPool: OuterGateAnalysisPool
	recentInsights: OuterGateInsight[]
	suggestions: string[]
	quickActions: OuterGateQuickAction[]
	integrations: OuterGateIntegration[]
	cloverMessages: OuterGateCloverMessage[]
	isCloverProcessing?: boolean
	cloverSessions: OuterGateCloverSessionState
	activeCloverSessionId?: string
}

export const defaultOuterGateState: OuterGateState = {
	analysisPool: {
		totalCaptured: 0,
		processing: 0,
		ready: 0,
		assignedThisWeek: 0,
		lastUpdatedIso: new Date().toISOString(),
	},
	recentInsights: [],
	suggestions: [
		"Map my latest journal entries into themes",
		"Draft a venture brief around eco retreats",
		"Surface which idea deserves a dedicated workspace",
	],
	quickActions: [
		{
			slug: "create-workspace",
			title: "Create Workspace",
			description: "Launch a new company space with AI teammates and templates tuned to your mission.",
			icon: "codicon-building",
		},
		{
			slug: "import-data",
			title: "Import Data",
			description: "Bring in Notion, Miro, ChatGPT exports, or manual ZIPs so Clover can learn your world.",
			icon: "codicon-cloud-upload",
		},
		{
			slug: "capture-thought",
			title: "Quick Capture",
			description: "Drop an idea, voice note, or inspiration to file it into the analysis pool.",
			icon: "codicon-mic",
		},
	],
	integrations: defaultOuterGateIntegrations.map((integration) => ({ ...integration })),
	cloverMessages: [],
	isCloverProcessing: false,
	cloverSessions: {
		entries: [],
		hasMore: false,
		cursor: undefined,
		isLoading: false,
		isInitialFetchComplete: false,
	},
	activeCloverSessionId: undefined,
}

export const isOuterGateState = (value: unknown): value is OuterGateState => {
	if (!value || typeof value !== "object") {
		return false
	}
	const candidate = value as Partial<OuterGateState>
	return (
		candidate.analysisPool !== undefined &&
		candidate.recentInsights !== undefined &&
		candidate.suggestions !== undefined &&
		candidate.quickActions !== undefined &&
		candidate.integrations !== undefined &&
		candidate.cloverMessages !== undefined &&
		candidate.cloverSessions !== undefined
	)
}
