import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import {
	type ProviderSettings,
	type ProviderSettingsEntry,
	type CustomModePrompts,
	type ModeConfig,
	type ExperimentId,
	GhostServiceSettings, // kilocode_change
	openRouterDefaultModelId, // kilocode_change
	type TodoItem,
	type TelemetrySetting,
	type OrganizationAllowList,
	ORGANIZATION_ALLOW_ALL,
	EndlessSurfaceRecord,
	EndlessSurfaceAgentAccess,
	ConversationHoldState,
	OrchestratorAnalysis,
	ConversationAgent,
	OrchestratorTimelineEvent,
	FileCabinetSnapshot,
	FileCabinetCreateFolderRequest,
	FileCabinetCreateFileRequest,
	FileCabinetPreview,
	FileCabinetWriteRequest,
} from "@roo-code/types"

import {
	ExtensionMessage,
	ExtensionState,
	MarketplaceInstalledMetadata,
	Command,
	EndlessSurfaceClientState,
} from "@roo/ExtensionMessage"
import { BrowserInteractionStrategy, BrowserStreamFrame } from "@roo/browser"
import { findLastIndex } from "@roo/array"
import { McpServer } from "@roo/mcp"
import { Mode, defaultModeSlug, defaultPrompts } from "@roo/modes"
import { CustomSupportPrompts } from "@roo/support-prompt"
import { experimentDefault } from "@roo/experiments"
import { RouterModels } from "@roo/api"
import { McpMarketplaceCatalog } from "../../../src/shared/kilocode/mcp" // kilocode_change
import { defaultOuterGateState, type OuterGateInsightUpdate } from "@roo/golden/outerGate"
import type { HubSnapshot, HubAgentBlueprint, HubSettingsUpdate } from "@roo/hub"

import { vscode } from "@src/utils/vscode"
import { chatHubDebugLog } from "@/utils/chatHubLogging"

const buildFilePreviewKey = (companyId?: string, path?: string) => {
	if (!companyId || !path) {
		return undefined
	}
	return `${companyId}::${path}`
}
import { convertTextMateToHljs } from "@src/utils/textMateToHljs"
import { ClineRulesToggles } from "@roo/cline-rules" // kilocode_change
import type {
	ArchiveDepartmentPayload,
	ArchiveEmployeePayload,
	ArchiveTeamPayload,
	AssignEmployeeToTeamPayload,
	AssignTeamToDepartmentPayload,
	CreateActionItemPayload,
	CreateActionStatusPayload,
	CreateCompanyPayload,
	CreateDepartmentPayload,
	CreateEmployeePayload,
	CreateShiftPayload,
	CreateTeamPayload,
	DeleteActionItemPayload,
	DeleteShiftPayload,
	RemoveEmployeeFromTeamPayload,
	RemoveTeamFromDepartmentPayload,
	StartActionItemsPayload,
	StartWorkdayPayload,
	UpdateActionItemPayload,
	UpdateCompanyPayload,
	UpdateEmployeePayload,
	UpdateDepartmentPayload,
	UpdateShiftPayload,
	UpdateTeamPayload,
	UpsertActionStatusPayload,
	SetCompanyFavoritePayload,
	DeleteCompanyPayload,
	WorkplaceState,
	WorkplaceOwnerProfile,
	HaltWorkdayPayload,
	UpdateEmployeeSchedulePayload,
} from "@roo/golden/workplace"

export interface ExtensionStateContextType extends ExtensionState {
	historyPreviewCollapsed?: boolean // Add the new state property
	showTaskTimeline?: boolean // kilocode_change
	setShowTaskTimeline: (value: boolean) => void // kilocode_change
	browserInteractionStrategy?: BrowserInteractionStrategy
	setBrowserInteractionStrategy: (value: BrowserInteractionStrategy) => void
	browserStreamFrames: Record<string, BrowserStreamFrame>
	hubSnapshot?: HubSnapshot
	createHubRoom: (title?: string, options?: { autonomous?: boolean; participants?: HubAgentBlueprint[] }) => void
	setActiveHubRoom: (roomId: string) => void
	sendHubMessage: (roomId: string, text: string) => void
	addHubAgent: (roomId: string, agent: HubAgentBlueprint) => void
	removeHubParticipant: (roomId: string, participantId: string) => void
	updateHubSettings: (roomId: string, settings: HubSettingsUpdate) => void
	endlessSurface?: EndlessSurfaceClientState
	hoveringTaskTimeline?: boolean // kilocode_change
	setHoveringTaskTimeline: (value: boolean) => void // kilocode_change
	systemNotificationsEnabled?: boolean // kilocode_change
	setSystemNotificationsEnabled: (value: boolean) => void // kilocode_change
	createSurface: (title?: string) => Promise<void>
	setActiveSurface: (surfaceId: string | undefined) => Promise<void>
	renameSurface: (surfaceId: string, title: string) => Promise<void>
	setSurfaceAgentAccess: (surfaceId: string, access: EndlessSurfaceAgentAccess) => Promise<void>
	saveSurfaceRecord: (record: EndlessSurfaceRecord) => Promise<void>
	deleteSurface: (surfaceId: string) => Promise<void>
	requestSurfaceSnapshot: (options: { surfaceId: string }) => Promise<void>
	dismissedNotificationIds: string[] // kilocode_change
	notificationTelegramChatId?: string
	notificationTelegramBotToken?: string
	didHydrateState: boolean
	showWelcome: boolean
	theme: any
	mcpServers: McpServer[]
	mcpMarketplaceCatalog: McpMarketplaceCatalog // kilocode_change
	hasSystemPromptOverride?: boolean
	currentCheckpoint?: string
	currentTaskTodos?: TodoItem[] // Initial todos for the current task
	filePaths: string[]
	openedTabs: Array<{ label: string; isActive: boolean; path?: string }>
	// kilocode_change start
	globalRules: ClineRulesToggles
	localRules: ClineRulesToggles
	globalWorkflows: ClineRulesToggles
	localWorkflows: ClineRulesToggles
	// kilocode_change start
	commands: Command[]
	organizationAllowList: OrganizationAllowList
	organizationSettingsVersion: number
	cloudIsAuthenticated: boolean
	sharingEnabled: boolean
	maxConcurrentFileReads?: number
	allowVeryLargeReads?: boolean // kilocode_change
	mdmCompliant?: boolean
	hasOpenedModeSelector: boolean // New property to track if user has opened mode selector
	setHasOpenedModeSelector: (value: boolean) => void // Setter for the new property
	alwaysAllowFollowupQuestions: boolean // New property for follow-up questions auto-approve
	setAlwaysAllowFollowupQuestions: (value: boolean) => void // Setter for the new property
	followupAutoApproveTimeoutMs: number | undefined // Timeout in ms for auto-approving follow-up questions
	setFollowupAutoApproveTimeoutMs: (value: number) => void // Setter for the timeout
	condensingApiConfigId?: string
	setCondensingApiConfigId: (value: string) => void
	customCondensingPrompt?: string
	setCustomCondensingPrompt: (value: string) => void
	marketplaceItems?: any[]
	marketplaceInstalledMetadata?: MarketplaceInstalledMetadata
	profileThresholds: Record<string, number>
	setProfileThresholds: (value: Record<string, number>) => void
	setApiConfiguration: (config: ProviderSettings) => void
	setCustomInstructions: (value?: string) => void
	setAlwaysAllowReadOnly: (value: boolean) => void
	setAlwaysAllowReadOnlyOutsideWorkspace: (value: boolean) => void
	setAlwaysAllowWrite: (value: boolean) => void
	setAlwaysAllowWriteOutsideWorkspace: (value: boolean) => void
	setAlwaysAllowExecute: (value: boolean) => void
	setAlwaysAllowBrowser: (value: boolean) => void
	setAlwaysAllowMcp: (value: boolean) => void
	setAlwaysAllowModeSwitch: (value: boolean) => void
	setAlwaysAllowSubtasks: (value: boolean) => void
	setBrowserToolEnabled: (value: boolean) => void
	setShowRooIgnoredFiles: (value: boolean) => void
	setShowAutoApproveMenu: (value: boolean) => void // kilocode_change
	setShowAnnouncement: (value: boolean) => void
	setAllowedCommands: (value: string[]) => void
	setDeniedCommands: (value: string[]) => void
	setAllowedMaxRequests: (value: number | undefined) => void
	setAllowedMaxCost: (value: number | undefined) => void
	setSoundEnabled: (value: boolean) => void
	setSoundVolume: (value: number) => void
	terminalShellIntegrationTimeout?: number
	setTerminalShellIntegrationTimeout: (value: number) => void
	terminalShellIntegrationDisabled?: boolean
	setTerminalShellIntegrationDisabled: (value: boolean) => void
	terminalZdotdir?: boolean
	setTerminalZdotdir: (value: boolean) => void
	setTtsEnabled: (value: boolean) => void
	setTtsSpeed: (value: number) => void
	setDiffEnabled: (value: boolean) => void
	setEnableCheckpoints: (value: boolean) => void
	setBrowserViewportSize: (value: string) => void
	setFuzzyMatchThreshold: (value: number) => void
	setWriteDelayMs: (value: number) => void
	screenshotQuality?: number
	setScreenshotQuality: (value: number) => void
	terminalOutputLineLimit?: number
	setTerminalOutputLineLimit: (value: number) => void
	terminalOutputCharacterLimit?: number
	setTerminalOutputCharacterLimit: (value: number) => void
	mcpEnabled: boolean
	setMcpEnabled: (value: boolean) => void
	enableMcpServerCreation: boolean
	setEnableMcpServerCreation: (value: boolean) => void
	remoteControlEnabled: boolean
	setRemoteControlEnabled: (value: boolean) => void
	alwaysApproveResubmit?: boolean
	setAlwaysApproveResubmit: (value: boolean) => void
	requestDelaySeconds: number
	setRequestDelaySeconds: (value: number) => void
	setCurrentApiConfigName: (value: string) => void
	setListApiConfigMeta: (value: ProviderSettingsEntry[]) => void
	mode: Mode
	setMode: (value: Mode) => void
	setCustomModePrompts: (value: CustomModePrompts) => void
	setCustomSupportPrompts: (value: CustomSupportPrompts) => void
	enhancementApiConfigId?: string
	setEnhancementApiConfigId: (value: string) => void
	commitMessageApiConfigId?: string // kilocode_change
	setCommitMessageApiConfigId: (value: string) => void // kilocode_change
	markNotificationAsDismissed: (notificationId: string) => void // kilocode_change
	ghostServiceSettings?: GhostServiceSettings // kilocode_change
	setGhostServiceSettings: (value: GhostServiceSettings) => void // kilocode_change
	setExperimentEnabled: (id: ExperimentId, enabled: boolean) => void
	setAutoApprovalEnabled: (value: boolean) => void
	customModes: ModeConfig[]
	setCustomModes: (value: ModeConfig[]) => void
	setMaxOpenTabsContext: (value: number) => void
	maxWorkspaceFiles: number
	setMaxWorkspaceFiles: (value: number) => void
	setTelemetrySetting: (value: TelemetrySetting) => void
	remoteBrowserEnabled?: boolean
	setRemoteBrowserEnabled: (value: boolean) => void
	awsUsePromptCache?: boolean
	setAwsUsePromptCache: (value: boolean) => void
	maxReadFileLine: number
	setMaxReadFileLine: (value: number) => void
	maxImageFileSize: number
	setMaxImageFileSize: (value: number) => void
	maxTotalImageSize: number
	setMaxTotalImageSize: (value: number) => void
	machineId?: string
	pinnedApiConfigs?: Record<string, boolean>
	setPinnedApiConfigs: (value: Record<string, boolean>) => void
	togglePinnedApiConfig: (configName: string) => void
	terminalCompressProgressBar?: boolean
	setTerminalCompressProgressBar: (value: boolean) => void
	setHistoryPreviewCollapsed: (value: boolean) => void
	autoCondenseContext: boolean
	setAutoCondenseContext: (value: boolean) => void
	autoCondenseContextPercent: number
	setAutoCondenseContextPercent: (value: number) => void
	routerModels?: RouterModels
	alwaysAllowUpdateTodoList?: boolean
	setAlwaysAllowUpdateTodoList: (value: boolean) => void
	includeDiagnosticMessages?: boolean
	setIncludeDiagnosticMessages: (value: boolean) => void
	maxDiagnosticMessages?: number
	setMaxDiagnosticMessages: (value: number) => void
	includeTaskHistoryInEnhance?: boolean
	setIncludeTaskHistoryInEnhance: (value: boolean) => void
	workplaceState: WorkplaceState
	fileCabinetSnapshot?: FileCabinetSnapshot
	isFileCabinetLoading: boolean
	fileCabinetError?: string
	fileCabinetPreviews: Record<string, FileCabinetPreview | undefined>
	fileCabinetPreviewLoading: Record<string, boolean>
	fileCabinetPreviewErrors: Record<string, string | undefined>
	requestFileCabinetSnapshot: (companyId?: string) => void
	createFileCabinetFolder: (payload: FileCabinetCreateFolderRequest) => void
	createFileCabinetFile: (payload: FileCabinetCreateFileRequest) => void
	requestFileCabinetPreview: (companyId: string, path: string) => void
	writeFileCabinetFile: (payload: FileCabinetWriteRequest) => void
	openFileCabinetFolder: (companyId: string, path?: string) => void
	lastCreatedFile?: { companyId: string; path: string; fileName?: string }
	clearLastCreatedFile: () => void
	createCompany: (payload: CreateCompanyPayload) => void
	updateCompany: (payload: UpdateCompanyPayload) => void
	setCompanyFavorite: (payload: SetCompanyFavoritePayload) => void
	deleteCompany: (payload: DeleteCompanyPayload) => void
	createDepartment: (payload: CreateDepartmentPayload) => void
	updateDepartment: (payload: UpdateDepartmentPayload) => void
	createTeam: (payload: CreateTeamPayload) => void
	updateTeam: (payload: UpdateTeamPayload) => void
	archiveDepartment: (payload: ArchiveDepartmentPayload) => void
	archiveTeam: (payload: ArchiveTeamPayload) => void
	removeTeamFromDepartment: (payload: RemoveTeamFromDepartmentPayload) => void
	assignTeamToDepartment: (payload: AssignTeamToDepartmentPayload) => void
	assignEmployeeToTeam: (payload: AssignEmployeeToTeamPayload) => void
	removeEmployeeFromTeam: (payload: RemoveEmployeeFromTeamPayload) => void
	createEmployee: (payload: CreateEmployeePayload) => void
	updateEmployee: (payload: UpdateEmployeePayload) => void
	archiveEmployee: (payload: ArchiveEmployeePayload) => void
	selectCompany: (companyId?: string) => void
	setActiveEmployee: (companyId: string, employeeId: string) => void
	createActionItem: (payload: CreateActionItemPayload) => void
	updateActionItem: (payload: UpdateActionItemPayload) => void
	deleteActionItem: (payload: DeleteActionItemPayload) => void
	createActionStatus: (payload: CreateActionStatusPayload) => void
	updateActionStatus: (payload: UpsertActionStatusPayload) => void
	startActionItems: (payload: StartActionItemsPayload) => void
	startWorkday: (payload: StartWorkdayPayload) => void
	haltWorkday: (payload: HaltWorkdayPayload) => void
	updateEmployeeSchedule: (payload: UpdateEmployeeSchedulePayload) => void
	createShift: (payload: CreateShiftPayload) => void
	updateShift: (payload: UpdateShiftPayload) => void
	deleteShift: (payload: DeleteShiftPayload) => void
	setOwnerProfileDefaults: (profile: WorkplaceOwnerProfile) => void
	configureWorkplaceRoot: (ownerName?: string) => void
	setShowWelcome: (value: boolean) => void
	sendOuterGateMessage: (text: string) => void
	triggerOuterGateAction: (slug: string) => void
	requestOuterGatePassionMap: () => void
	updateOuterGateInsight: (id: string, updates: OuterGateInsightUpdate) => void
	deleteOuterGateInsight: (id: string) => void
	outerGateConnectNotion: (payload: {
		token?: string
		databaseId?: string
		dataSourceId?: string
		pageSize?: number
		maxPages?: number
	}) => void
	outerGateSyncNotion: (payload?: {
		databaseId?: string
		dataSourceId?: string
		pageSize?: number
		maxPages?: number
	}) => void
	outerGateConnectMiro: (payload: {
		token?: string
		boardId?: string
		itemTypes?: string[]
		maxItems?: number
	}) => void
	outerGateSyncMiro: (payload?: { boardId?: string; itemTypes?: string[]; maxItems?: number }) => void
	outerGateImportZip: () => void
	createCloverSession: (options?: { companyId?: string; companyName?: string }) => void
	activateCloverSession: (sessionId: string) => void
	loadMoreCloverSessions: (cursor?: string) => void
}

export const ExtensionStateContext = createContext<ExtensionStateContextType | undefined>(undefined)

export const mergeExtensionState = (prevState: ExtensionState, newState: ExtensionState) => {
	const {
		customModePrompts: prevCustomModePrompts,
		experiments: prevExperiments,
		conversationAgents: prevConversationAgents,
		lastOrchestratorAnalysis: prevLastOrchestratorAnalysis,
		...prevRest
	} = prevState

	const {
		apiConfiguration,
		customModePrompts: newCustomModePrompts,
		customSupportPrompts,
		experiments: newExperiments,
		conversationAgents: incomingConversationAgents,
		lastOrchestratorAnalysis: incomingLastOrchestratorAnalysis,
		...newRest
	} = newState

	const customModePrompts = { ...prevCustomModePrompts, ...newCustomModePrompts }
	const experiments = { ...prevExperiments, ...newExperiments }
	const rest = { ...prevRest, ...newRest }

	const shouldPreserveConversationAgents =
		Array.isArray(incomingConversationAgents) &&
		incomingConversationAgents.length === 0 &&
		(prevConversationAgents?.length ?? 0) > 0

	const conversationAgents = (() => {
		if (incomingConversationAgents === undefined) {
			return prevConversationAgents ?? []
		}
		if (shouldPreserveConversationAgents) {
			return prevConversationAgents ?? []
		}
		return incomingConversationAgents
	})()

	const lastOrchestratorAnalysis =
		incomingLastOrchestratorAnalysis === undefined ? prevLastOrchestratorAnalysis : incomingLastOrchestratorAnalysis

	// Note that we completely replace the previous apiConfiguration and customSupportPrompts objects
	// with new ones since the state that is broadcast is the entire objects so merging is not necessary.
	return {
		...rest,
		apiConfiguration,
		customModePrompts,
		customSupportPrompts,
		experiments,
		conversationAgents,
		lastOrchestratorAnalysis,
	}
}

export const ExtensionStateContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [state, setState] = useState<ExtensionState>({
		apiConfiguration: {},
		version: "",
		clineMessages: [],
		taskHistory: [],
		shouldShowAnnouncement: false,
		allowedCommands: [],
		deniedCommands: [],
		soundEnabled: false,
		soundVolume: 0.5,
		ttsEnabled: false,
		ttsSpeed: 1.0,
		diffEnabled: false,
		enableCheckpoints: true,
		fuzzyMatchThreshold: 1.0,
		language: "en", // Default language code
		writeDelayMs: 1000,
		browserViewportSize: "900x600",
		screenshotQuality: 75,
		terminalOutputLineLimit: 500,
		terminalOutputCharacterLimit: 50000,
		terminalShellIntegrationTimeout: 4000,
		mcpEnabled: true,
		enableMcpServerCreation: false,
		remoteControlEnabled: false,
		alwaysApproveResubmit: false,
		alwaysAllowWrite: true, // kilocode_change
		alwaysAllowReadOnly: true, // kilocode_change
		requestDelaySeconds: 5,
		currentApiConfigName: "default",
		listApiConfigMeta: [],
		mode: defaultModeSlug,
		customModePrompts: defaultPrompts,
		customSupportPrompts: {},
		experiments: experimentDefault,
		enhancementApiConfigId: "",
		dismissedNotificationIds: [], // kilocode_change
		notificationEmail: "",
		notificationSmsNumber: "",
		notificationSmsGateway: "tmomail.net",
		notificationTelegramChatId: "",
		commitMessageApiConfigId: "", // kilocode_change
		ghostServiceSettings: {}, // kilocode_change
		condensingApiConfigId: "", // Default empty string for condensing API config ID
		customCondensingPrompt: "", // Default empty string for custom condensing prompt
		hasOpenedModeSelector: false, // Default to false (not opened yet)
		autoApprovalEnabled: true,
		customModes: [],
		maxOpenTabsContext: 20,
		maxWorkspaceFiles: 200,
		cwd: "",
		browserToolEnabled: true,
		telemetrySetting: "unset",
		showRooIgnoredFiles: true, // Default to showing .rooignore'd files with lock symbol (current behavior).
		showAutoApproveMenu: false, // kilocode_change
		renderContext: "sidebar",
		browserInteractionStrategy: "legacy",
		browserStreamFrames: {},
		endlessSurface: undefined,
		maxReadFileLine: -1, // Default max read file line limit
		maxImageFileSize: 5, // Default max image file size in MB
		maxTotalImageSize: 20, // Default max total image size in MB
		pinnedApiConfigs: {}, // Empty object for pinned API configs
		terminalZshOhMy: false, // Default Oh My Zsh integration setting
		maxConcurrentFileReads: 5, // Default concurrent file reads
		allowVeryLargeReads: false, // kilocode_change
		terminalZshP10k: false, // Default Powerlevel10k integration setting
		terminalZdotdir: false, // Default ZDOTDIR handling setting
		terminalCompressProgressBar: true, // Default to compress progress bar output
		historyPreviewCollapsed: false, // Initialize the new state (default to expanded)
		showTaskTimeline: true, // kilocode_change
		kilocodeDefaultModel: openRouterDefaultModelId,
		cloudUserInfo: null,
		cloudIsAuthenticated: false,
		sharingEnabled: false,
		organizationAllowList: ORGANIZATION_ALLOW_ALL,
		organizationSettingsVersion: -1,
		autoCondenseContext: true,
		autoCondenseContextPercent: 100,
		profileThresholds: {},
		codebaseIndexConfig: {
			codebaseIndexEnabled: true,
			codebaseIndexQdrantUrl: "http://localhost:6333",
			codebaseIndexEmbedderProvider: "openai",
			codebaseIndexEmbedderBaseUrl: "",
			codebaseIndexEmbedderModelId: "",
			codebaseIndexSearchMaxResults: undefined,
			codebaseIndexSearchMinScore: undefined,
		},
		codebaseIndexModels: { ollama: {}, openai: {} },
		conversationHoldState: undefined,
		conversationAgents: [],
		lastOrchestratorAnalysis: undefined,
		orchestratorTimeline: [],
		alwaysAllowUpdateTodoList: true,
		includeDiagnosticMessages: true,
		maxDiagnosticMessages: 50,
		openRouterImageApiKey: "",
		kiloCodeImageApiKey: "",
		openRouterImageGenerationSelectedModel: "",
		workplaceState: { companies: [], ownerProfileDefaults: undefined },
		workplaceRootConfigured: false,
		hubSnapshot: { rooms: [], activeRoomId: undefined },
		outerGateState: defaultOuterGateState,
	})

	const [didHydrateState, setDidHydrateState] = useState(false)
	const [showWelcome, setShowWelcome] = useState(false)
	const [theme, setTheme] = useState<any>(undefined)
	const [filePaths, setFilePaths] = useState<string[]>([])
	const [openedTabs, setOpenedTabs] = useState<Array<{ label: string; isActive: boolean; path?: string }>>([])
	const [commands, setCommands] = useState<Command[]>([])
	const [mcpServers, setMcpServers] = useState<McpServer[]>([])
	const [mcpMarketplaceCatalog, setMcpMarketplaceCatalog] = useState<McpMarketplaceCatalog>({ items: [] }) // kilocode_change
	const [currentCheckpoint, setCurrentCheckpoint] = useState<string>()
	const [extensionRouterModels, setExtensionRouterModels] = useState<RouterModels | undefined>(undefined)
	// kilocode_change start
	const [globalRules, setGlobalRules] = useState<ClineRulesToggles>({})
	const [localRules, setLocalRules] = useState<ClineRulesToggles>({})
	const [globalWorkflows, setGlobalWorkflows] = useState<ClineRulesToggles>({})
	const [localWorkflows, setLocalWorkflows] = useState<ClineRulesToggles>({})
	// kilocode_change end
	const [marketplaceItems, setMarketplaceItems] = useState<any[]>([])
	const [alwaysAllowFollowupQuestions, setAlwaysAllowFollowupQuestions] = useState(false) // Add state for follow-up questions auto-approve
	const [followupAutoApproveTimeoutMs, setFollowupAutoApproveTimeoutMs] = useState<number | undefined>(undefined) // Will be set from global settings
	const [marketplaceInstalledMetadata, setMarketplaceInstalledMetadata] = useState<MarketplaceInstalledMetadata>({
		project: {},
		global: {},
	})
	const [includeTaskHistoryInEnhance, setIncludeTaskHistoryInEnhance] = useState(true)
	const [fileCabinetSnapshot, setFileCabinetSnapshot] = useState<FileCabinetSnapshot | undefined>(undefined)
	const [isFileCabinetLoading, setIsFileCabinetLoading] = useState(false)
	const [fileCabinetError, setFileCabinetError] = useState<string | undefined>(undefined)
	const [fileCabinetPreviews, setFileCabinetPreviews] = useState<Record<string, FileCabinetPreview | undefined>>({})
	const [fileCabinetPreviewLoading, setFileCabinetPreviewLoading] = useState<Record<string, boolean>>({})
	const [fileCabinetPreviewErrors, setFileCabinetPreviewErrors] = useState<Record<string, string | undefined>>({})
	const [lastCreatedFile, setLastCreatedFile] = useState<
		{ companyId: string; path: string; fileName?: string } | undefined
	>(undefined)

	const setListApiConfigMeta = useCallback(
		(value: ProviderSettingsEntry[]) => setState((prevState) => ({ ...prevState, listApiConfigMeta: value })),
		[],
	)

	const setApiConfiguration = useCallback((value: ProviderSettings) => {
		setState((prevState) => ({
			...prevState,
			apiConfiguration: {
				...prevState.apiConfiguration,
				...value,
			},
		}))
	}, [])

	const createHubRoom = useCallback(
		(title?: string, options?: { autonomous?: boolean; participants?: HubAgentBlueprint[] }) => {
			vscode.postMessage({
				type: "hubCreateRoom",
				text: title,
				hubAutonomous: options?.autonomous,
				hubParticipants: options?.participants,
			})
		},
		[],
	)

	const setActiveHubRoom = useCallback((roomId: string) => {
		vscode.postMessage({ type: "hubSetActiveRoom", hubRoomId: roomId })
	}, [])

	const sendHubMessage = useCallback((roomId: string, text: string) => {
		vscode.postMessage({ type: "hubSendMessage", hubRoomId: roomId, text })
	}, [])

	const addHubAgent = useCallback((roomId: string, agent: HubAgentBlueprint) => {
		vscode.postMessage({ type: "hubAddAgent", hubRoomId: roomId, hubAgent: agent })
	}, [])

	const removeHubParticipant = useCallback((roomId: string, participantId: string) => {
		vscode.postMessage({ type: "hubRemoveParticipant", hubRoomId: roomId, participantId })
	}, [])

	const updateHubSettings = useCallback((roomId: string, settings: HubSettingsUpdate) => {
		vscode.postMessage({ type: "hubUpdateSettings", hubRoomId: roomId, hubSettings: settings })
	}, [])

	const requestFileCabinetSnapshot = useCallback((companyId?: string) => {
		setIsFileCabinetLoading(true)
		setFileCabinetError(undefined)
		vscode.postMessage({ type: "fileCabinetLoad", fileCabinetCompanyId: companyId })
	}, [])

	const requestFileCabinetPreview = useCallback((companyId: string, path: string) => {
		const normalizedPath = path.startsWith("/") ? path : `/${path}`
		const key = buildFilePreviewKey(companyId, normalizedPath)
		if (!key) {
			return
		}
		setFileCabinetPreviewLoading((prev) => ({ ...prev, [key]: true }))
		setFileCabinetPreviewErrors((prev) => ({ ...prev, [key]: undefined }))
		vscode.postMessage({
			type: "fileCabinetPreview",
			fileCabinetCompanyId: companyId,
			fileCabinetPath: normalizedPath,
		})
	}, [])

	const createFileCabinetFolder = useCallback((payload: FileCabinetCreateFolderRequest) => {
		const normalizedPath = payload.path.trim()
		if (!normalizedPath) {
			setFileCabinetError("Folder name is required")
			return
		}
		setIsFileCabinetLoading(true)
		setFileCabinetError(undefined)
		vscode.postMessage({
			type: "fileCabinetCreateFolder",
			fileCabinetCreateFolderPayload: { ...payload, path: normalizedPath },
		})
	}, [])

	const createFileCabinetFile = useCallback((payload: FileCabinetCreateFileRequest) => {
		setIsFileCabinetLoading(true)
		setFileCabinetError(undefined)
		setLastCreatedFile(undefined)
		vscode.postMessage({
			type: "fileCabinetCreateFile",
			fileCabinetCreateFilePayload: payload,
		})
	}, [])

	const writeFileCabinetFile = useCallback((payload: FileCabinetWriteRequest) => {
		setIsFileCabinetLoading(true)
		setFileCabinetError(undefined)
		vscode.postMessage({
			type: "fileCabinetWriteFile",
			fileCabinetWritePayload: payload,
		})
	}, [])

	const openFileCabinetFolder = useCallback((companyId: string, path?: string) => {
		vscode.postMessage({
			type: "fileCabinetOpenFolder",
			fileCabinetCompanyId: companyId,
			fileCabinetPath: path,
		})
	}, [])

	const clearLastCreatedFile = useCallback(() => setLastCreatedFile(undefined), [])

	const sendOuterGateMessage = useCallback((text: string) => {
		const trimmed = text.trim()
		if (!trimmed) {
			return
		}

		const clientMessageId =
			typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
				? crypto.randomUUID()
				: `og-${Date.now()}-${Math.random().toString(16).slice(2)}`

		setState((prev) => {
			const outerGate = prev.outerGateState ?? defaultOuterGateState
			return {
				...prev,
				outerGateState: {
					...outerGate,
					cloverMessages: [
						...outerGate.cloverMessages,
						{
							id: clientMessageId,
							speaker: "user",
							text: trimmed,
							timestamp: new Date().toISOString(),
						},
					],
					isCloverProcessing: true,
				},
			}
		})

		vscode.postMessage({ type: "outerGateSend", text: trimmed, clientMessageId })
	}, [])

	const triggerOuterGateAction = useCallback((slug: string) => {
		switch (slug) {
			case "create-workspace":
			case "create-company": {
				window.postMessage({ type: "outerGateOpenCreateCompanyModal" }, "*")
				break
			}
			case "import-data": {
				const payload = {
					type: "action",
					action: "switchTab",
					tab: "workspace",
				}
				window.postMessage(payload, "*")
				break
			}
			case "capture-thought": {
				window.postMessage({ type: "outerGateFocusComposer" }, "*")
				break
			}
			default:
				break
		}
	}, [])

	const requestOuterGatePassionMap = useCallback(() => {
		vscode.postMessage({ type: "outerGateGeneratePassionMap" })
	}, [])

	const outerGateConnectNotion = useCallback(
		(payload: {
			token?: string
			databaseId?: string
			dataSourceId?: string
			pageSize?: number
			maxPages?: number
		}) => {
			vscode.postMessage({
				type: "outerGateConnectNotion",
				notionToken: payload.token,
				notionDatabaseId: payload.databaseId,
				notionDataSourceId: payload.dataSourceId,
				notionPageSize: payload.pageSize,
				notionMaxPages: payload.maxPages,
			})
		},
		[],
	)

	const outerGateSyncNotion = useCallback(
		(payload?: { databaseId?: string; dataSourceId?: string; pageSize?: number; maxPages?: number }) => {
			vscode.postMessage({
				type: "outerGateSyncNotion",
				notionDatabaseId: payload?.databaseId,
				notionDataSourceId: payload?.dataSourceId,
				notionPageSize: payload?.pageSize,
				notionMaxPages: payload?.maxPages,
			})
		},
		[],
	)

	const outerGateConnectMiro = useCallback(
		(payload: { token?: string; boardId?: string; itemTypes?: string[]; maxItems?: number }) => {
			vscode.postMessage({
				type: "outerGateConnectMiro",
				miroToken: payload.token,
				miroBoardId: payload.boardId,
				miroItemTypes: payload.itemTypes,
				miroMaxItems: payload.maxItems,
			})
		},
		[],
	)

	const outerGateSyncMiro = useCallback((payload?: { boardId?: string; itemTypes?: string[]; maxItems?: number }) => {
		vscode.postMessage({
			type: "outerGateSyncMiro",
			miroBoardId: payload?.boardId,
			miroItemTypes: payload?.itemTypes,
			miroMaxItems: payload?.maxItems,
		})
	}, [])

	const outerGateImportZip = useCallback(() => {
		vscode.postMessage({ type: "outerGateImportZip" })
	}, [])

	const handleMessage = useCallback(
		(event: MessageEvent) => {
			const message: ExtensionMessage = event.data
			switch (message.type) {
				case "state": {
					const newState = message.state!
					chatHubDebugLog("extension state payload", {
						isHydrated: didHydrateState,
						companiesCount: newState.workplaceState?.companies?.length ?? 0,
						activeCompanyId: newState.workplaceState?.activeCompanyId,
						activeEmployeeId: newState.workplaceState?.activeEmployeeId,
						conversationAgentsCount: newState.conversationAgents?.length ?? 0,
					})
					setState((prevState) => mergeExtensionState(prevState, newState))
					const ownerProfile = newState.workplaceState?.ownerProfileDefaults
					const ownerFirstComplete = Boolean(
						ownerProfile?.firstName && ownerProfile.firstName.trim().length > 0,
					)
					const ownerLastComplete = Boolean(ownerProfile?.lastName && ownerProfile.lastName.trim().length > 0)
					const ownerRoleComplete = Boolean(ownerProfile?.role && ownerProfile.role.trim().length > 0)
					const ownerMbtiComplete = Boolean(ownerProfile?.mbtiType && ownerProfile.mbtiType.trim().length > 0)
					setShowWelcome((prev) => {
						if (!ownerFirstComplete || !ownerLastComplete || !ownerRoleComplete || !ownerMbtiComplete) {
							return true
						}
						return prev
					})
					setDidHydrateState(true)
					// Update alwaysAllowFollowupQuestions if present in state message
					if ((newState as any).alwaysAllowFollowupQuestions !== undefined) {
						setAlwaysAllowFollowupQuestions((newState as any).alwaysAllowFollowupQuestions)
					}
					// Update followupAutoApproveTimeoutMs if present in state message
					if ((newState as any).followupAutoApproveTimeoutMs !== undefined) {
						setFollowupAutoApproveTimeoutMs((newState as any).followupAutoApproveTimeoutMs)
					}
					// Update includeTaskHistoryInEnhance if present in state message
					if ((newState as any).includeTaskHistoryInEnhance !== undefined) {
						setIncludeTaskHistoryInEnhance((newState as any).includeTaskHistoryInEnhance)
					}
					// Handle marketplace data if present in state message
					if (newState.marketplaceItems !== undefined) {
						setMarketplaceItems(newState.marketplaceItems)
					}
					if (newState.marketplaceInstalledMetadata !== undefined) {
						setMarketplaceInstalledMetadata(newState.marketplaceInstalledMetadata)
					}
					break
				}
				case "conversationHoldState": {
					const nextState =
						(typeof message.payload === "object" && message.payload !== null && "state" in message.payload
							? (message.payload as { state?: ConversationHoldState }).state
							: undefined) ??
						message.conversationHoldState ??
						undefined
					chatHubDebugLog("conversationHoldState message", {
						state: nextState,
						taskId:
							typeof message.payload === "object" &&
							message.payload !== null &&
							"taskId" in (message.payload as any)
								? (message.payload as { taskId?: string }).taskId
								: undefined,
					})
					setState((prevState) => ({ ...prevState, conversationHoldState: nextState }))
					break
				}
				case "orchestratorAnalysis": {
					const payload =
						typeof message.payload === "object" && message.payload !== null
							? (message.payload as {
									analysis?: OrchestratorAnalysis
									agents?: ConversationAgent[]
									appendTimeline?: boolean
								})
							: {}
					chatHubDebugLog("orchestratorAnalysis message", {
						analysis: payload.analysis,
						agentCount: payload.agents?.length ?? 0,
						appendTimeline: payload.appendTimeline,
						clientTurnId: (payload as { clientTurnId?: string }).clientTurnId,
					})
					setState((prevState) => {
						const nextTimeline =
							payload.appendTimeline && payload.analysis
								? [
										...(prevState.orchestratorTimeline ?? []),
										{
											id: `analysis-${Date.now()}`,
											timestamp: Date.now(),
											type: "analysis" as OrchestratorTimelineEvent["type"],
											summary: payload.analysis.rationale ?? "Updated routing analysis",
											relatedAgentIds: payload.analysis.primarySpeakers?.map((agent) => agent.id),
											metadata: payload.analysis,
										},
									]
								: prevState.orchestratorTimeline
						return {
							...prevState,
							lastOrchestratorAnalysis: payload.analysis ?? prevState.lastOrchestratorAnalysis,
							conversationAgents: payload.agents ?? prevState.conversationAgents ?? [],
							orchestratorTimeline: nextTimeline,
						}
					})
					break
				}
				case "outerGateState": {
					if ("outerGateState" in message && message.outerGateState) {
						setState(
							(prevState) =>
								({
									...prevState,
									outerGateState:
										message.outerGateState ?? prevState.outerGateState ?? defaultOuterGateState,
								}) as ExtensionState,
						)
					}
					break
				}
				case "theme": {
					if (message.text) {
						setTheme(convertTextMateToHljs(JSON.parse(message.text)))
					}
					break
				}
				case "workspaceUpdated": {
					const paths = message.filePaths ?? []
					const tabs = message.openedTabs ?? []

					setFilePaths(paths)
					setOpenedTabs(tabs)
					break
				}
				case "commands": {
					setCommands(message.commands ?? [])
					break
				}
				case "browserStreamFrame": {
					const frame = message.frame as BrowserStreamFrame | undefined
					if (!frame?.sessionId) {
						break
					}

					setState((prevState) => {
						const existing = prevState.browserStreamFrames ?? {}
						const nextFrames: Record<string, BrowserStreamFrame> = { ...existing }
						if (frame.ended) {
							delete nextFrames[frame.sessionId]
						} else {
							nextFrames[frame.sessionId] = frame
						}

						if (
							existing === prevState.browserStreamFrames &&
							existing[frame.sessionId] === frame &&
							!frame.ended
						) {
							return prevState
						}

						return {
							...prevState,
							browserStreamFrames: nextFrames,
						}
					})
					break
				}
				case "messageUpdated": {
					const clineMessage = message.clineMessage!
					chatHubDebugLog("webview.state.messageUpdated", {
						ts: clineMessage.ts,
						type: clineMessage.type,
						ask: (clineMessage as any).ask,
						say: (clineMessage as any).say,
						partial: clineMessage.partial,
						clientTurnId: (clineMessage as any).metadata?.orchestrator?.clientTurnId,
					})
					setState((prevState) => {
						// worth noting it will never be possible for a more up-to-date message to be sent here or in normal messages post since the presentAssistantContent function uses lock
						const lastIndex = findLastIndex(prevState.clineMessages, (msg) => msg.ts === clineMessage.ts)
						if (lastIndex !== -1) {
							const newClineMessages = [...prevState.clineMessages]
							newClineMessages[lastIndex] = clineMessage
							return { ...prevState, clineMessages: newClineMessages }
						}
						return prevState
					})
					break
				}
				case "mcpServers": {
					setMcpServers(message.mcpServers ?? [])
					break
				}
				// kilocode_change
				case "mcpMarketplaceCatalog": {
					if (message.mcpMarketplaceCatalog) {
						setMcpMarketplaceCatalog(message.mcpMarketplaceCatalog)
					}
					break
				}
				case "rulesData": {
					if (message.globalRules) setGlobalRules(message.globalRules)
					if (message.localRules) setLocalRules(message.localRules)
					if (message.globalWorkflows) setGlobalWorkflows(message.globalWorkflows)
					if (message.localWorkflows) setLocalWorkflows(message.localWorkflows)
					break
				}
				// end kilocode_change
				case "currentCheckpointUpdated": {
					setCurrentCheckpoint(message.text)
					break
				}
				case "listApiConfig": {
					setListApiConfigMeta(message.listApiConfig ?? [])
					break
				}
				case "routerModels": {
					setExtensionRouterModels(message.routerModels)
					break
				}
				case "marketplaceData": {
					if (message.marketplaceItems !== undefined) {
						setMarketplaceItems(message.marketplaceItems)
					}
					if (message.marketplaceInstalledMetadata !== undefined) {
						setMarketplaceInstalledMetadata(message.marketplaceInstalledMetadata)
					}
					break
				}
				case "fileCabinetSnapshot": {
					setIsFileCabinetLoading(false)
					setFileCabinetSnapshot(message.fileCabinetSnapshot)
					if (!message.fileCabinetSnapshot && message.text) {
						setFileCabinetError(message.text)
					} else {
						setFileCabinetError(undefined)
					}
					break
				}
				case "fileCabinetPreview": {
					const preview = message.fileCabinetPreview
					if (preview) {
						const key = buildFilePreviewKey(preview.companyId, preview.path)
						if (key) {
							setFileCabinetPreviews((prev) => ({ ...prev, [key]: preview }))
							setFileCabinetPreviewErrors((prev) => ({ ...prev, [key]: preview.error }))
							setFileCabinetPreviewLoading((prev) => ({ ...prev, [key]: false }))
						}
					}
					break
				}
				case "fileCabinetWriteResult": {
					if (!message.fileCabinetWriteSuccess && message.text) {
						setFileCabinetError(message.text)
					}
					setIsFileCabinetLoading(false)
					break
				}
				case "fileCabinetFileResult": {
					setIsFileCabinetLoading(false)
					if (message.fileCabinetFileSuccess) {
						setFileCabinetError(undefined)
						if (message.fileCabinetCompanyId && message.fileCabinetFilePath) {
							setLastCreatedFile({
								companyId: message.fileCabinetCompanyId,
								path: message.fileCabinetFilePath,
								fileName: message.fileCabinetFileName,
							})
						}
					} else if (message.text) {
						setFileCabinetError(message.text)
					}
					break
				}
				case "fileCabinetFolderResult": {
					if (message.fileCabinetFolderSuccess) {
						setFileCabinetError(undefined)
					} else if (message.text) {
						setFileCabinetError(message.text)
					}
					if (!message.fileCabinetFolderSuccess) {
						setIsFileCabinetLoading(false)
					}
					break
				}
			}
		},
		[setListApiConfigMeta],
	)

	useEffect(() => {
		window.addEventListener("message", handleMessage)
		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [handleMessage])

	useEffect(() => {
		vscode.postMessage({ type: "webviewDidLaunch" })
	}, [])

	const createSurface = useCallback(async (title?: string) => {
		vscode.postMessage({ type: "endlessSurfaceCreate", surfaceTitle: title })
	}, [])

	const setActiveSurface = useCallback(async (surfaceId: string | undefined) => {
		vscode.postMessage({ type: "endlessSurfaceSetActive", surfaceId })
	}, [])

	const renameSurface = useCallback(async (surfaceId: string, title: string) => {
		vscode.postMessage({
			type: "endlessSurfaceUpdateMeta",
			surfaceId,
			surfaceMetaUpdates: { title },
		})
	}, [])

	const setSurfaceAgentAccess = useCallback(async (surfaceId: string, access: EndlessSurfaceAgentAccess) => {
		vscode.postMessage({
			type: "endlessSurfaceUpdateMeta",
			surfaceId,
			surfaceAgentAccess: access,
		})
	}, [])

	const saveSurfaceRecord = useCallback(async (record: EndlessSurfaceRecord) => {
		vscode.postMessage({ type: "endlessSurfaceSaveRecord", surfaceRecord: record })
	}, [])

	const deleteSurface = useCallback(async (surfaceId: string) => {
		vscode.postMessage({ type: "endlessSurfaceDelete", surfaceId })
	}, [])

	const requestSurfaceSnapshot = useCallback(async ({ surfaceId }: { surfaceId: string }) => {
		vscode.postMessage({ type: "endlessSurfaceRequestSnapshot", surfaceId })
	}, [])

	const workplaceState = useMemo<WorkplaceState>(() => {
		if (!state.workplaceState) {
			return { companies: [], ownerProfileDefaults: undefined }
		}

		return {
			...state.workplaceState,
			companies: state.workplaceState.companies.map((company) => {
				const activeEmployees = company.employees
					.filter((employee) => !employee.deletedAt)
					.map((employee) => ({ ...employee }))
				const activeEmployeeIds = new Set(activeEmployees.map((employee) => employee.id))

				const sanitizedTeams = company.teams
					.filter((team) => !team.deletedAt)
					.map((team) => {
						const memberships = (team.memberships ?? []).map((membership) => ({ ...membership }))
						const activeMembershipIds = memberships
							.filter(
								(membership) => !membership.removedAt && activeEmployeeIds.has(membership.employeeId),
							)
							.map((membership) => membership.employeeId)
						return {
							...team,
							memberships,
							employeeIds: activeMembershipIds,
						}
					})
				const activeTeamIds = new Set(sanitizedTeams.map((team) => team.id))

				const sanitizedDepartments = company.departments
					.filter((department) => !department.deletedAt)
					.map((department) => {
						const teamLinks = (department.teamLinks ?? []).map((link) => ({ ...link }))
						const activeTeamIdList = teamLinks
							.filter((link) => !link.unlinkedAt && activeTeamIds.has(link.teamId))
							.map((link) => link.teamId)
						return {
							...department,
							teamLinks,
							teamIds: activeTeamIdList,
						}
					})

				const resolvedExecutiveId =
					company.executiveManagerId && activeEmployeeIds.has(company.executiveManagerId)
						? company.executiveManagerId
						: (activeEmployees.find((employee) => employee.isExecutiveManager)?.id ??
							activeEmployees[0]?.id ??
							"")
				const resolvedActiveEmployeeId =
					company.activeEmployeeId && activeEmployeeIds.has(company.activeEmployeeId)
						? company.activeEmployeeId
						: activeEmployees[0]?.id

				const sanitizedShifts = (company.shifts ?? [])
					.filter((shift) => activeEmployeeIds.has(shift.employeeId))
					.map((shift) => ({ ...shift }))
					.sort((a, b) => a.start.localeCompare(b.start))

				const workdayState = (() => {
					if (!company.workday) {
						return undefined
					}
					const scheduleMap = new Map(
						(company.workday.employeeSchedules ?? []).map((schedule) => [schedule.employeeId, schedule]),
					)
					const fallbackTimestamp =
						company.updatedAt ?? company.createdAt ?? company.workday.startedAt ?? new Date(0).toISOString()
					const employeeSchedules = activeEmployees.map((employee) => {
						const existing = scheduleMap.get(employee.id)
						return {
							employeeId: employee.id,
							availability: existing?.availability ?? "available",
							timezone: existing?.timezone,
							weeklyHoursTarget: existing?.weeklyHoursTarget,
							workdays: existing?.workdays,
							dailyStartMinute: existing?.dailyStartMinute,
							dailyEndMinute: existing?.dailyEndMinute,
							lastUpdatedAt: existing?.lastUpdatedAt ?? fallbackTimestamp,
						}
					})
					const activeIds = (company.workday.activeEmployeeIds ?? []).filter((id) =>
						activeEmployeeIds.has(id),
					)
					const bypassedIds = (company.workday.bypassedEmployeeIds ?? []).filter((id) =>
						activeEmployeeIds.has(id),
					)
					return {
						...company.workday,
						employeeSchedules,
						activeEmployeeIds: activeIds,
						bypassedEmployeeIds: bypassedIds,
					}
				})()

				return {
					...company,
					isFavorite: company.isFavorite ?? false,
					employees: activeEmployees,
					teams: sanitizedTeams,
					departments: sanitizedDepartments,
					shifts: sanitizedShifts,
					executiveManagerId: resolvedExecutiveId,
					activeEmployeeId: resolvedActiveEmployeeId,
					workday: workdayState,
				}
			}),
		}
	}, [state.workplaceState])

	const contextValue: ExtensionStateContextType = {
		...state,
		browserInteractionStrategy: state.browserInteractionStrategy ?? "legacy",
		browserStreamFrames: state.browserStreamFrames ?? {},
		didHydrateState,
		showWelcome,
		theme,
		mcpServers,
		mcpMarketplaceCatalog, // kilocode_change
		currentCheckpoint,
		filePaths,
		openedTabs,
		// kilocode_change start
		globalRules,
		localRules,
		globalWorkflows,
		localWorkflows,
		// kilocode_change end
		commands,
		soundVolume: state.soundVolume,
		ttsSpeed: state.ttsSpeed,
		fuzzyMatchThreshold: state.fuzzyMatchThreshold,
		writeDelayMs: state.writeDelayMs,
		screenshotQuality: state.screenshotQuality,
		routerModels: extensionRouterModels,
		cloudIsAuthenticated: state.cloudIsAuthenticated ?? false,
		organizationSettingsVersion: state.organizationSettingsVersion ?? -1,
		marketplaceItems,
		marketplaceInstalledMetadata,
		profileThresholds: state.profileThresholds ?? {},
		hubSnapshot: state.hubSnapshot,
		createHubRoom,
		setActiveHubRoom,
		sendHubMessage,
		addHubAgent,
		removeHubParticipant,
		updateHubSettings,
		alwaysAllowFollowupQuestions,
		followupAutoApproveTimeoutMs,
		createSurface,
		setActiveSurface,
		renameSurface,
		setSurfaceAgentAccess,
		saveSurfaceRecord,
		deleteSurface,
		requestSurfaceSnapshot,
		remoteControlEnabled: state.remoteControlEnabled ?? false,
		setExperimentEnabled: (id, enabled) =>
			setState((prevState) => ({ ...prevState, experiments: { ...prevState.experiments, [id]: enabled } })),
		setApiConfiguration,
		setCustomInstructions: (value) => setState((prevState) => ({ ...prevState, customInstructions: value })),
		setAlwaysAllowReadOnly: (value) => setState((prevState) => ({ ...prevState, alwaysAllowReadOnly: value })),
		setAlwaysAllowReadOnlyOutsideWorkspace: (value) =>
			setState((prevState) => ({ ...prevState, alwaysAllowReadOnlyOutsideWorkspace: value })),
		setAlwaysAllowWrite: (value) => setState((prevState) => ({ ...prevState, alwaysAllowWrite: value })),
		setAlwaysAllowWriteOutsideWorkspace: (value) =>
			setState((prevState) => ({ ...prevState, alwaysAllowWriteOutsideWorkspace: value })),
		setAlwaysAllowExecute: (value) => setState((prevState) => ({ ...prevState, alwaysAllowExecute: value })),
		setAlwaysAllowBrowser: (value) => setState((prevState) => ({ ...prevState, alwaysAllowBrowser: value })),
		setAlwaysAllowMcp: (value) => setState((prevState) => ({ ...prevState, alwaysAllowMcp: value })),
		setAlwaysAllowModeSwitch: (value) => setState((prevState) => ({ ...prevState, alwaysAllowModeSwitch: value })),
		setAlwaysAllowSubtasks: (value) => setState((prevState) => ({ ...prevState, alwaysAllowSubtasks: value })),
		setAlwaysAllowFollowupQuestions,
		setFollowupAutoApproveTimeoutMs: (value) =>
			setState((prevState) => ({ ...prevState, followupAutoApproveTimeoutMs: value })),
		setShowAnnouncement: (value) => setState((prevState) => ({ ...prevState, shouldShowAnnouncement: value })),
		setAllowedCommands: (value) => setState((prevState) => ({ ...prevState, allowedCommands: value })),
		setDeniedCommands: (value) => setState((prevState) => ({ ...prevState, deniedCommands: value })),
		setAllowedMaxRequests: (value) => setState((prevState) => ({ ...prevState, allowedMaxRequests: value })),
		setAllowedMaxCost: (value) => setState((prevState) => ({ ...prevState, allowedMaxCost: value })),
		setSoundEnabled: (value) => setState((prevState) => ({ ...prevState, soundEnabled: value })),
		setSoundVolume: (value) => setState((prevState) => ({ ...prevState, soundVolume: value })),
		setTtsEnabled: (value) => setState((prevState) => ({ ...prevState, ttsEnabled: value })),
		setTtsSpeed: (value) => setState((prevState) => ({ ...prevState, ttsSpeed: value })),
		setDiffEnabled: (value) => setState((prevState) => ({ ...prevState, diffEnabled: value })),
		setEnableCheckpoints: (value) => setState((prevState) => ({ ...prevState, enableCheckpoints: value })),
		setBrowserViewportSize: (value: string) =>
			setState((prevState) => ({ ...prevState, browserViewportSize: value })),
		setFuzzyMatchThreshold: (value) => setState((prevState) => ({ ...prevState, fuzzyMatchThreshold: value })),
		setWriteDelayMs: (value) => setState((prevState) => ({ ...prevState, writeDelayMs: value })),
		setScreenshotQuality: (value) => setState((prevState) => ({ ...prevState, screenshotQuality: value })),
		setTerminalOutputLineLimit: (value) =>
			setState((prevState) => ({ ...prevState, terminalOutputLineLimit: value })),
		setTerminalOutputCharacterLimit: (value) =>
			setState((prevState) => ({ ...prevState, terminalOutputCharacterLimit: value })),
		setTerminalShellIntegrationTimeout: (value) =>
			setState((prevState) => ({ ...prevState, terminalShellIntegrationTimeout: value })),
		setTerminalShellIntegrationDisabled: (value) =>
			setState((prevState) => ({ ...prevState, terminalShellIntegrationDisabled: value })),
		setTerminalZdotdir: (value) => setState((prevState) => ({ ...prevState, terminalZdotdir: value })),
		setMcpEnabled: (value) => setState((prevState) => ({ ...prevState, mcpEnabled: value })),
		setEnableMcpServerCreation: (value) =>
			setState((prevState) => ({ ...prevState, enableMcpServerCreation: value })),
		setRemoteControlEnabled: (value) => setState((prevState) => ({ ...prevState, remoteControlEnabled: value })),
		setAlwaysApproveResubmit: (value) => setState((prevState) => ({ ...prevState, alwaysApproveResubmit: value })),
		setRequestDelaySeconds: (value) => setState((prevState) => ({ ...prevState, requestDelaySeconds: value })),
		setCurrentApiConfigName: (value) => setState((prevState) => ({ ...prevState, currentApiConfigName: value })),
		setListApiConfigMeta,
		setMode: (value: Mode) => setState((prevState) => ({ ...prevState, mode: value })),
		setCustomModePrompts: (value) => setState((prevState) => ({ ...prevState, customModePrompts: value })),
		setCustomSupportPrompts: (value) => setState((prevState) => ({ ...prevState, customSupportPrompts: value })),
		setEnhancementApiConfigId: (value) =>
			setState((prevState) => ({ ...prevState, enhancementApiConfigId: value })),
		// kilocode_change start
		markNotificationAsDismissed: (notificationId) => {
			setState((prevState) => {
				return {
					...prevState,
					dismissedNotificationIds: [notificationId, ...(prevState.dismissedNotificationIds || [])],
				}
			})
		},
		setGhostServiceSettings: (value) => setState((prevState) => ({ ...prevState, ghostServiceSettings: value })),
		setCommitMessageApiConfigId: (value) =>
			setState((prevState) => ({ ...prevState, commitMessageApiConfigId: value })),
		setShowAutoApproveMenu: (value) => setState((prevState) => ({ ...prevState, showAutoApproveMenu: value })),
		setShowTaskTimeline: (value) => setState((prevState) => ({ ...prevState, showTaskTimeline: value })),
		setBrowserInteractionStrategy: (value: BrowserInteractionStrategy) =>
			setState((prevState) => ({ ...prevState, browserInteractionStrategy: value })),
		setHoveringTaskTimeline: (value) => setState((prevState) => ({ ...prevState, hoveringTaskTimeline: value })),
		// kilocode_change end
		setAutoApprovalEnabled: (value) => setState((prevState) => ({ ...prevState, autoApprovalEnabled: value })),
		setCustomModes: (value) => setState((prevState) => ({ ...prevState, customModes: value })),
		setMaxOpenTabsContext: (value) => setState((prevState) => ({ ...prevState, maxOpenTabsContext: value })),
		setMaxWorkspaceFiles: (value) => setState((prevState) => ({ ...prevState, maxWorkspaceFiles: value })),
		setBrowserToolEnabled: (value) => setState((prevState) => ({ ...prevState, browserToolEnabled: value })),
		setTelemetrySetting: (value) => setState((prevState) => ({ ...prevState, telemetrySetting: value })),
		setShowRooIgnoredFiles: (value) => setState((prevState) => ({ ...prevState, showRooIgnoredFiles: value })),
		setRemoteBrowserEnabled: (value) => setState((prevState) => ({ ...prevState, remoteBrowserEnabled: value })),
		setAwsUsePromptCache: (value) => setState((prevState) => ({ ...prevState, awsUsePromptCache: value })),
		setMaxReadFileLine: (value) => setState((prevState) => ({ ...prevState, maxReadFileLine: value })),
		setMaxImageFileSize: (value) => setState((prevState) => ({ ...prevState, maxImageFileSize: value })),
		setMaxTotalImageSize: (value) => setState((prevState) => ({ ...prevState, maxTotalImageSize: value })),
		setPinnedApiConfigs: (value) => setState((prevState) => ({ ...prevState, pinnedApiConfigs: value })),
		setTerminalCompressProgressBar: (value) =>
			setState((prevState) => ({ ...prevState, terminalCompressProgressBar: value })),
		togglePinnedApiConfig: (configId) =>
			setState((prevState) => {
				const currentPinned = prevState.pinnedApiConfigs || {}
				const newPinned = {
					...currentPinned,
					[configId]: !currentPinned[configId],
				}

				// If the config is now unpinned, remove it from the object
				if (!newPinned[configId]) {
					delete newPinned[configId]
				}

				return { ...prevState, pinnedApiConfigs: newPinned }
			}),
		setHistoryPreviewCollapsed: (value) =>
			setState((prevState) => ({ ...prevState, historyPreviewCollapsed: value })),
		setHasOpenedModeSelector: (value) => setState((prevState) => ({ ...prevState, hasOpenedModeSelector: value })),
		setAutoCondenseContext: (value) => setState((prevState) => ({ ...prevState, autoCondenseContext: value })),
		setAutoCondenseContextPercent: (value) =>
			setState((prevState) => ({ ...prevState, autoCondenseContextPercent: value })),
		setCondensingApiConfigId: (value) => setState((prevState) => ({ ...prevState, condensingApiConfigId: value })),
		setCustomCondensingPrompt: (value) =>
			setState((prevState) => ({ ...prevState, customCondensingPrompt: value })),
		setProfileThresholds: (value) => setState((prevState) => ({ ...prevState, profileThresholds: value })),
		// kilocode_change start
		setSystemNotificationsEnabled: (value) =>
			setState((prevState) => ({ ...prevState, systemNotificationsEnabled: value })),
		dismissedNotificationIds: state.dismissedNotificationIds || [], // kilocode_change
		// kilocode_change end
		alwaysAllowUpdateTodoList: state.alwaysAllowUpdateTodoList,
		setAlwaysAllowUpdateTodoList: (value) => {
			setState((prevState) => ({ ...prevState, alwaysAllowUpdateTodoList: value }))
		},
		includeDiagnosticMessages: state.includeDiagnosticMessages,
		setIncludeDiagnosticMessages: (value) => {
			setState((prevState) => ({ ...prevState, includeDiagnosticMessages: value }))
		},
		maxDiagnosticMessages: state.maxDiagnosticMessages,
		setMaxDiagnosticMessages: (value) => {
			setState((prevState) => ({ ...prevState, maxDiagnosticMessages: value }))
		},
		includeTaskHistoryInEnhance,
		setIncludeTaskHistoryInEnhance,
		workplaceState,
		fileCabinetSnapshot,
		isFileCabinetLoading,
		fileCabinetError,
		fileCabinetPreviews,
		fileCabinetPreviewLoading,
		fileCabinetPreviewErrors,
		requestFileCabinetSnapshot,
		createFileCabinetFolder,
		createFileCabinetFile,
		requestFileCabinetPreview,
		writeFileCabinetFile,
		openFileCabinetFolder,
		lastCreatedFile,
		clearLastCreatedFile,
		createCompany: (payload) => vscode.postMessage({ type: "createCompany", workplaceCompanyPayload: payload }),
		updateCompany: (payload) => vscode.postMessage({ type: "updateCompany", workplaceCompanyUpdate: payload }),
		setCompanyFavorite: (payload) =>
			vscode.postMessage({ type: "setCompanyFavorite", workplaceCompanyFavorite: payload }),
		deleteCompany: (payload) => vscode.postMessage({ type: "deleteCompany", workplaceCompanyDelete: payload }),
		createDepartment: (payload) =>
			vscode.postMessage({ type: "createDepartment", workplaceDepartmentPayload: payload }),
		updateDepartment: (payload) =>
			vscode.postMessage({ type: "updateDepartment", workplaceDepartmentUpdate: payload }),
		createTeam: (payload) => vscode.postMessage({ type: "createTeam", workplaceTeamPayload: payload }),
		updateTeam: (payload) => vscode.postMessage({ type: "updateTeam", workplaceTeamUpdate: payload }),
		archiveDepartment: (payload) =>
			vscode.postMessage({ type: "archiveDepartment", workplaceDepartmentArchive: payload }),
		archiveTeam: (payload) => vscode.postMessage({ type: "archiveTeam", workplaceTeamArchive: payload }),
		removeTeamFromDepartment: (payload) =>
			vscode.postMessage({
				type: "removeTeamFromDepartment",
				workplaceTeamDepartmentRemoval: payload,
			}),
		assignTeamToDepartment: (payload) =>
			vscode.postMessage({ type: "assignTeamToDepartment", workplaceTeamAssignment: payload }),
		assignEmployeeToTeam: (payload) =>
			vscode.postMessage({
				type: "assignEmployeeToTeam",
				workplaceTeamEmployeeAssignment: payload,
			}),
		removeEmployeeFromTeam: (payload) =>
			vscode.postMessage({
				type: "removeEmployeeFromTeam",
				workplaceTeamEmployeeRemoval: payload,
			}),
		createEmployee: (payload) => vscode.postMessage({ type: "createEmployee", workplaceEmployeePayload: payload }),
		updateEmployee: (payload) => vscode.postMessage({ type: "updateEmployee", workplaceEmployeeUpdate: payload }),
		archiveEmployee: (payload) =>
			vscode.postMessage({ type: "archiveEmployee", workplaceEmployeeArchive: payload }),
		selectCompany: (companyId) => vscode.postMessage({ type: "selectCompany", workplaceCompanyId: companyId }),
		setActiveEmployee: (companyId, employeeId) =>
			vscode.postMessage({
				type: "setActiveEmployee",
				workplaceCompanyId: companyId,
				workplaceEmployeeId: employeeId,
			}),
		createActionItem: (payload) =>
			vscode.postMessage({ type: "createActionItem", workplaceActionItemPayload: payload }),
		updateActionItem: (payload) =>
			vscode.postMessage({ type: "updateActionItem", workplaceActionItemUpdate: payload }),
		deleteActionItem: (payload) =>
			vscode.postMessage({ type: "deleteActionItem", workplaceActionItemDelete: payload }),
		createActionStatus: (payload) =>
			vscode.postMessage({ type: "createActionStatus", workplaceActionStatusPayload: payload }),
		updateActionStatus: (payload) =>
			vscode.postMessage({ type: "updateActionStatus", workplaceActionStatusUpdate: payload }),
		startActionItems: (payload) => vscode.postMessage({ type: "startActionItems", workplaceActionStart: payload }),
		startWorkday: (payload) => vscode.postMessage({ type: "startWorkday", workplaceWorkdayStart: payload }),
		haltWorkday: (payload) => vscode.postMessage({ type: "haltWorkday", workplaceWorkdayHalt: payload }),
		updateEmployeeSchedule: (payload) =>
			vscode.postMessage({ type: "updateEmployeeSchedule", workplaceEmployeeScheduleUpdate: payload }),
		createShift: (payload) => vscode.postMessage({ type: "createShift", workplaceShiftCreate: payload }),
		updateShift: (payload) => vscode.postMessage({ type: "updateShift", workplaceShiftUpdate: payload }),
		deleteShift: (payload) => vscode.postMessage({ type: "deleteShift", workplaceShiftDelete: payload }),
		setOwnerProfileDefaults: (profile) =>
			vscode.postMessage({ type: "setOwnerProfileDefaults", workplaceOwnerProfileDefaults: profile }),
		configureWorkplaceRoot: (ownerName) =>
			vscode.postMessage({ type: "configureWorkplaceRoot", workplaceRootOwnerName: ownerName }),
		setShowWelcome,
		sendOuterGateMessage,
		triggerOuterGateAction,
		requestOuterGatePassionMap,
		updateOuterGateInsight: (id, insightUpdates) =>
			vscode.postMessage({
				type: "outerGateUpdateInsight",
				outerGateInsightId: id,
				outerGateInsightUpdates: insightUpdates,
			}),
		deleteOuterGateInsight: (id) => vscode.postMessage({ type: "outerGateDeleteInsight", outerGateInsightId: id }),
		outerGateConnectNotion,
		outerGateSyncNotion,
		outerGateConnectMiro,
		outerGateSyncMiro,
		outerGateImportZip,
		createCloverSession: (options) =>
			vscode.postMessage({
				type: "outerGateSessionsNew",
				cloverSessionCompanyId: options?.companyId,
				cloverSessionCompanyName: options?.companyName,
			}),
		activateCloverSession: (sessionId) =>
			vscode.postMessage({ type: "outerGateSessionsActivate", cloverSessionId: sessionId }),
		loadMoreCloverSessions: (cursor) =>
			vscode.postMessage({ type: "outerGateSessionsLoadMore", cloverSessionCursor: cursor }),
	}

	return <ExtensionStateContext.Provider value={contextValue}>{children}</ExtensionStateContext.Provider>
}

export const useExtensionState = () => {
	const context = useContext(ExtensionStateContext)

	if (context === undefined) {
		throw new Error("useExtensionState must be used within an ExtensionStateContextProvider")
	}

	return context
}
