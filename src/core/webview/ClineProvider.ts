import os from "os"
import * as path from "path"
import fs from "fs/promises"
import { randomUUID } from "crypto"
import EventEmitter from "events"

import { Anthropic } from "@anthropic-ai/sdk"
import delay from "delay"
import axios from "axios"
import pWaitFor from "p-wait-for"
import * as vscode from "vscode"

import {
	type TaskProviderLike,
	type TaskProviderEvents,
	type GlobalState,
	type ProviderName,
	type ProviderSettings,
	type RooCodeSettings,
	type ProviderSettingsEntry,
	type StaticAppProperties,
	type DynamicAppProperties,
	type CloudAppProperties,
	type TaskProperties,
	type GitProperties,
	type TelemetryProperties,
	type TelemetryPropertiesProvider,
	type CodeActionId,
	type CodeActionName,
	type TerminalActionId,
	type TerminalActionPromptType,
	type HistoryItem,
	type CloudUserInfo,
	type CreateTaskOptions,
	type TokenUsage,
	RooCodeEventName,
	requestyDefaultModelId,
	openRouterDefaultModelId,
	glamaDefaultModelId,
	DEFAULT_TERMINAL_OUTPUT_CHARACTER_LIMIT,
	DEFAULT_WRITE_DELAY_MS,
	ORGANIZATION_ALLOW_ALL,
	DEFAULT_MODES,
	EndlessSurfaceAgentAccess,
	EndlessSurfaceRecord,
	EndlessSurfaceState,
	EndlessSurfaceSummary,
} from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"
import { CloudService, BridgeOrchestrator, getRooCodeApiUrl } from "@roo-code/cloud"

import { Package } from "../../shared/package"
import { findLast } from "../../shared/array"
import { supportPrompt } from "../../shared/support-prompt"
import { GlobalFileNames } from "../../shared/globalFileNames"
import type { ExtensionMessage, ExtensionState, MarketplaceInstalledMetadata } from "../../shared/ExtensionMessage"
import type { BrowserInteractionStrategy } from "../../shared/browser"
import { Mode, defaultModeSlug, getModeBySlug } from "../../shared/modes"
import { experimentDefault } from "../../shared/experiments"
import { formatLanguage } from "../../shared/language"
import { WebviewMessage } from "../../shared/WebviewMessage"
import { EMBEDDING_MODEL_PROFILES } from "../../shared/embeddingModels"
import { ProfileValidator } from "../../shared/ProfileValidator"

import { Terminal } from "../../integrations/terminal/Terminal"
import { downloadTask } from "../../integrations/misc/export-markdown"
import { getTheme } from "../../integrations/theme/getTheme"
import WorkspaceTracker from "../../integrations/workspace/WorkspaceTracker"

import { McpHub } from "../../services/mcp/McpHub"
import { McpServerManager } from "../../services/mcp/McpServerManager"
import { MarketplaceManager } from "../../services/marketplace"
import { ShadowCheckpointService } from "../../services/checkpoints/ShadowCheckpointService"
import { CodeIndexManager } from "../../services/code-index/manager"
import type { IndexProgressUpdate } from "../../services/code-index/interfaces/manager"
import { MdmService } from "../../services/mdm/MdmService"

import { fileExistsAtPath } from "../../utils/fs"
import { setTtsEnabled, setTtsSpeed } from "../../utils/tts"
import { getWorkspaceGitInfo } from "../../utils/git"
import { getWorkspacePath } from "../../utils/path"
import { OrganizationAllowListViolationError } from "../../utils/errors"

import { setPanel } from "../../activate/registerCommands"

import { t } from "../../i18n"

import { buildApiHandler } from "../../api"
import { forceFullModelDetailsLoad, hasLoadedFullDetails } from "../../api/providers/fetchers/lmstudio"

import { ContextProxy } from "../config/ContextProxy"
import { getEnabledRules } from "./kilorules"
import { ProviderSettingsManager } from "../config/ProviderSettingsManager"
import { CustomModesManager } from "../config/CustomModesManager"
import { Task } from "../task/Task"
import { getSystemPromptFilePath } from "../prompts/sections/custom-system-prompt"
import { EndlessSurfaceService } from "../surfaces/EndlessSurfaceService"

import { webviewMessageHandler } from "./webviewMessageHandler"
import { getNonce } from "./getNonce"
import { getUri } from "./getUri"
import { singleCompletionHandler } from "../../utils/single-completion-handler"
import { countTokens } from "../../utils/countTokens"

//kilocode_change start
import { McpDownloadResponse, McpMarketplaceCatalog, McpMarketplaceItem } from "../../shared/kilocode/mcp"
import { additionalToolLibraryItems } from "../../shared/toolLibraryData"
import { McpServer } from "../../shared/mcp"
import { OpenRouterHandler } from "../../api/providers"
import { stringifyError } from "../../shared/kilocode/errorUtils"
import isWsl from "is-wsl"
import { getKilocodeDefaultModel } from "../../api/providers/kilocode/getKilocodeDefaultModel"
import { getKiloCodeWrapperProperties } from "../../core/kilocode/wrapper"
import type { WorkplaceService } from "../../services/workplace/WorkplaceService"
import type { WorkplaceFilesystemManager } from "../../services/workplace/WorkplaceFilesystemManager"
import type {
	WorkplaceCompany,
	WorkplaceEmployee,
	WorkplaceState,
	WorkplaceWorkdayState,
} from "../../shared/golden/workplace"
import {
	defaultOuterGateState,
	OuterGateAnalysisPool,
	OuterGateCloverMessage,
	OuterGateCloverSessionSummary,
	OuterGateInsight,
	OuterGateInsightStage,
	OuterGateInsightUpdate,
	OuterGatePassionCluster,
	OuterGatePassionMapState,
	OuterGatePassionPoint,
	OuterGatePassionStatus,
	OuterGateState,
} from "../../shared/golden/outerGate"
import { CloverSessionService, DEFAULT_CLOVER_SESSION_PAGE_SIZE } from "../../services/outerGate/CloverSessionService"
import { OuterGateIntegrationManager } from "../../services/outerGate/OuterGateIntegrationManager"

export type ClineProviderState = Awaited<ReturnType<ClineProvider["getState"]>>
// kilocode_change end

interface EndlessSurfaceViewState extends EndlessSurfaceState {
	activeSurface?: EndlessSurfaceRecord
}

const ENABLE_VERBOSE_PROVIDER_LOGS = false

const verboseProviderLog = (...args: unknown[]) => {
	if (!ENABLE_VERBOSE_PROVIDER_LOGS) {
		return
	}
	console.debug("[ClineProvider]", ...args)
}

const CLOVER_MAX_MESSAGES = 18
const CLOVER_SESSION_SUMMARY_LIMIT = DEFAULT_CLOVER_SESSION_PAGE_SIZE * 4
const CLOVER_SESSION_RETRY_DELAY_MS = 60_000

const CLOVER_SYSTEM_PROMPT = `You are Clover AI, the concierge for Golden Workplace's Outer Gates. Your role is to help founders surface passions, route raw context into the right company workspaces, and recommend actionable next steps.\n\nGuidelines:\n- Greet warmly yet concisely; speak like a strategic partner who understands venture building.\n- Ask focused clarifying questions when the goal or next step is uncertain.\n- Summarize the essence of what you heard before proposing actions.\n- Recommend an existing workspace or suggest creating a new one when appropriate.\n- Offer up to three concrete next steps formatted as short bullet prompts starting with \">" or "▶".\n- Highlight relevant artifacts or integrations already connected to the Outer Gates.\n- Keep responses under roughly 170 words, using short paragraphs and a motivating closing invitation.\n- Never fabricate tools or integrations that aren't in the provided data.`

const CLOVER_WELCOME_TEXT =
	"Welcome back to the Outer Gates! Tell me what spark you want to explore and I’ll line it up with the right workspace."

const PASSION_COLOR_PALETTE = [
	"#F97316",
	"#6366F1",
	"#10B981",
	"#EC4899",
	"#14B8A6",
	"#F59E0B",
	"#8B5CF6",
	"#0EA5E9",
]

/**
 * https://github.com/microsoft/vscode-webview-ui-toolkit-samples/blob/main/default/weather-webview/src/providers/WeatherViewProvider.ts
 * https://github.com/KumarVariable/vscode-extension-sidebar-html/blob/master/src/customSidebarViewProvider.ts
 */

export type ClineProviderEvents = {
	clineCreated: [cline: Task]
}

interface PendingEditOperation {
	messageTs: number
	editedContent: string
	images?: string[]
	messageIndex: number
	apiConversationHistoryIndex: number
	timeoutId: NodeJS.Timeout
	createdAt: number
}

export class ClineProvider
	extends EventEmitter<TaskProviderEvents>
	implements vscode.WebviewViewProvider, TelemetryPropertiesProvider, TaskProviderLike
{
	private static globalWorkplaceService?: WorkplaceService
	private static globalEndlessSurfaceService?: EndlessSurfaceService
	private static globalCloverSessionService?: CloverSessionService
	// Used in package.json as the view's id. This value cannot be changed due
	// to how VSCode caches views based on their id, and updating the id would
	// break existing instances of the extension.
	public static readonly sideBarId = `${Package.name}.SidebarProvider`
	public static readonly tabPanelId = `${Package.name}.TabPanelProvider`
	private static activeInstances: Set<ClineProvider> = new Set()
	private disposables: vscode.Disposable[] = []
	private webviewDisposables: vscode.Disposable[] = []
	private view?: vscode.WebviewView | vscode.WebviewPanel
	private clineStack: Task[] = []
	private codeIndexStatusSubscription?: vscode.Disposable
	private codeIndexManager?: CodeIndexManager
	private _workspaceTracker?: WorkspaceTracker // workSpaceTracker read-only for access outside this class
	protected mcpHub?: McpHub // Change from private to protected
	private marketplaceManager: MarketplaceManager
	private mdmService?: MdmService
	private taskCreationCallback: (task: Task) => void
	private taskEventListeners: WeakMap<Task, Array<() => void>> = new WeakMap()
	private currentWorkspacePath: string | undefined
	private workplaceService?: WorkplaceService
	private workplaceFilesystemManager?: WorkplaceFilesystemManager
	private endlessSurfaceService?: EndlessSurfaceService
	private cloverSessionService?: CloverSessionService
	private cloverSessionsInitialized = false
	private cloverSessionWarningShown = false
	private lastCloverSessionFetchErrorAt?: number
	private endlessSurfaceListenerCleanup: Array<() => void> = []
	private outerGateState: OuterGateState
	private outerGateManager?: OuterGateIntegrationManager
	private outerGateManagerPromise?: Promise<OuterGateIntegrationManager>

	private recentTasksCache?: string[]
	private pendingOperations: Map<string, PendingEditOperation> = new Map()
	private static readonly PENDING_OPERATION_TIMEOUT_MS = 30000 // 30 seconds

	public isViewLaunched = false
	public settingsImportedAt?: number
	public readonly latestAnnouncementId = "aug-25-2025-grok-code-fast" // Update for Grok Code Fast announcement
	public readonly providerSettingsManager: ProviderSettingsManager
	public readonly customModesManager: CustomModesManager

	constructor(
		readonly context: vscode.ExtensionContext,
		private readonly outputChannel: vscode.OutputChannel,
		private readonly renderContext: "sidebar" | "editor" = "sidebar",
		public readonly contextProxy: ContextProxy,
		mdmService?: MdmService,
	) {
		super()
		this.currentWorkspacePath = getWorkspacePath()

		ClineProvider.activeInstances.add(this)
		if (!this.workplaceService && ClineProvider.globalWorkplaceService) {
			this.workplaceService = ClineProvider.globalWorkplaceService
		}
		if (ClineProvider.globalEndlessSurfaceService) {
			this.attachEndlessSurfaceService(ClineProvider.globalEndlessSurfaceService)
		}

		this.outerGateState = createInitialOuterGateState(this.workplaceService?.getState())
		this.initializeOuterGateManager()

		this.mdmService = mdmService
		this.updateGlobalState("codebaseIndexModels", EMBEDDING_MODEL_PROFILES)

		// Start configuration loading (which might trigger indexing) in the background.
		// Don't await, allowing activation to continue immediately.

		// Register this provider with the telemetry service to enable it to add
		// properties like mode and provider.
		TelemetryService.instance.setProvider(this)

		this._workspaceTracker = new WorkspaceTracker(this)

		this.providerSettingsManager = new ProviderSettingsManager(this.context)

		this.customModesManager = new CustomModesManager(this.context, async () => {
			await this.postStateToWebview()
		})

		// Initialize MCP Hub through the singleton manager
		McpServerManager.getInstance(this.context, this)
			.then((hub) => {
				this.mcpHub = hub
				this.mcpHub.registerClient()
			})
			.catch((error) => {
				this.log(`Failed to initialize MCP Hub: ${error}`)
			})

		this.marketplaceManager = new MarketplaceManager(this.context, this.customModesManager)

		// Forward <most> task events to the provider.
		// We do something fairly similar for the IPC-based API.
		this.taskCreationCallback = (instance: Task) => {
			this.emit(RooCodeEventName.TaskCreated, instance)

			// Create named listener functions so we can remove them later.
			const onTaskStarted = () => this.emit(RooCodeEventName.TaskStarted, instance.taskId)
			const onTaskCompleted = (taskId: string, tokenUsage: any, toolUsage: any) =>
				this.emit(RooCodeEventName.TaskCompleted, taskId, tokenUsage, toolUsage)
			const onTaskAborted = () => this.emit(RooCodeEventName.TaskAborted, instance.taskId)
			const onTaskFocused = () => this.emit(RooCodeEventName.TaskFocused, instance.taskId)
			const onTaskUnfocused = () => this.emit(RooCodeEventName.TaskUnfocused, instance.taskId)
			const onTaskActive = (taskId: string) => this.emit(RooCodeEventName.TaskActive, taskId)
			const onTaskInteractive = (taskId: string) => this.emit(RooCodeEventName.TaskInteractive, taskId)
			const onTaskResumable = (taskId: string) => this.emit(RooCodeEventName.TaskResumable, taskId)
			const onTaskIdle = (taskId: string) => this.emit(RooCodeEventName.TaskIdle, taskId)
			const onTaskPaused = (taskId: string) => this.emit(RooCodeEventName.TaskPaused, taskId)
			const onTaskUnpaused = (taskId: string) => this.emit(RooCodeEventName.TaskUnpaused, taskId)
			const onTaskSpawned = (taskId: string) => this.emit(RooCodeEventName.TaskSpawned, taskId)
			const onTaskUserMessage = (taskId: string) => this.emit(RooCodeEventName.TaskUserMessage, taskId)
			const onTaskTokenUsageUpdated = (taskId: string, tokenUsage: TokenUsage) =>
				this.emit(RooCodeEventName.TaskTokenUsageUpdated, taskId, tokenUsage)

			// Attach the listeners.
			instance.on(RooCodeEventName.TaskStarted, onTaskStarted)
			instance.on(RooCodeEventName.TaskCompleted, onTaskCompleted)
			instance.on(RooCodeEventName.TaskAborted, onTaskAborted)
			instance.on(RooCodeEventName.TaskFocused, onTaskFocused)
			instance.on(RooCodeEventName.TaskUnfocused, onTaskUnfocused)
			instance.on(RooCodeEventName.TaskActive, onTaskActive)
			instance.on(RooCodeEventName.TaskInteractive, onTaskInteractive)
			instance.on(RooCodeEventName.TaskResumable, onTaskResumable)
			instance.on(RooCodeEventName.TaskIdle, onTaskIdle)
			instance.on(RooCodeEventName.TaskPaused, onTaskPaused)
			instance.on(RooCodeEventName.TaskUnpaused, onTaskUnpaused)
			instance.on(RooCodeEventName.TaskSpawned, onTaskSpawned)
			instance.on(RooCodeEventName.TaskUserMessage, onTaskUserMessage)
			instance.on(RooCodeEventName.TaskTokenUsageUpdated, onTaskTokenUsageUpdated)

			// Store the cleanup functions for later removal.
			this.taskEventListeners.set(instance, [
				() => instance.off(RooCodeEventName.TaskStarted, onTaskStarted),
				() => instance.off(RooCodeEventName.TaskCompleted, onTaskCompleted),
				() => instance.off(RooCodeEventName.TaskAborted, onTaskAborted),
				() => instance.off(RooCodeEventName.TaskFocused, onTaskFocused),
				() => instance.off(RooCodeEventName.TaskUnfocused, onTaskUnfocused),
				() => instance.off(RooCodeEventName.TaskActive, onTaskActive),
				() => instance.off(RooCodeEventName.TaskInteractive, onTaskInteractive),
				() => instance.off(RooCodeEventName.TaskResumable, onTaskResumable),
				() => instance.off(RooCodeEventName.TaskIdle, onTaskIdle),
				() => instance.off(RooCodeEventName.TaskUserMessage, onTaskUserMessage),
				() => instance.off(RooCodeEventName.TaskPaused, onTaskPaused),
				() => instance.off(RooCodeEventName.TaskUnpaused, onTaskUnpaused),
				() => instance.off(RooCodeEventName.TaskSpawned, onTaskSpawned),
				() => instance.off(RooCodeEventName.TaskTokenUsageUpdated, onTaskTokenUsageUpdated),
			])
		}

		// Initialize Roo Code Cloud profile sync.
		if (CloudService.hasInstance()) {
			this.initializeCloudProfileSync().catch((error) => {
				this.log(`Failed to initialize cloud profile sync: ${error}`)
			})
		} else {
			this.log("CloudService not ready, deferring cloud profile sync")
		}
	}

	public attachWorkplaceService(service: WorkplaceService) {
		this.workplaceService = service
		ClineProvider.globalWorkplaceService = service
	}

	public attachWorkplaceFilesystemManager(manager: WorkplaceFilesystemManager) {
		this.workplaceFilesystemManager = manager
	}

	public getWorkplaceFilesystemManager(): WorkplaceFilesystemManager | undefined {
		return this.workplaceFilesystemManager
	}

	public getWorkplaceService(): WorkplaceService | undefined {
		if (!this.workplaceService && ClineProvider.globalWorkplaceService) {
			this.workplaceService = ClineProvider.globalWorkplaceService
		}
		return this.workplaceService
	}

	public async chooseWorkplaceRootFolder(ownerName?: string): Promise<void> {
		if (!this.workplaceFilesystemManager) {
			throw new Error("Workplace filesystem manager is unavailable")
		}
		await this.workplaceFilesystemManager.chooseRootFolder({ ownerName })
	}

	public attachCloverSessionService(service: CloverSessionService) {
		this.cloverSessionService = service
		ClineProvider.globalCloverSessionService = service
	}

	public getCloverSessionService(): CloverSessionService | undefined {
		if (this.cloverSessionService) {
			return this.cloverSessionService
		}
		if (ClineProvider.globalCloverSessionService) {
			this.cloverSessionService = ClineProvider.globalCloverSessionService
			return this.cloverSessionService
		}
		const service = new CloverSessionService(this.context, () => this.getWorkplaceService())
		ClineProvider.globalCloverSessionService = service
		this.cloverSessionService = service
		return this.cloverSessionService
	}

	public attachEndlessSurfaceService(service: EndlessSurfaceService) {
		if (this.endlessSurfaceService === service) {
			return
		}

		this.cleanupEndlessSurfaceListeners()
		this.endlessSurfaceService = service
		ClineProvider.globalEndlessSurfaceService = service

		const stateHandler = this.handleEndlessSurfaceStateChange
		service.on("stateChanged", stateHandler)
		service.on("surfaceUpdated", stateHandler)
		service.on("surfaceDeleted", stateHandler)

		this.endlessSurfaceListenerCleanup = [
			() => service.off("stateChanged", stateHandler),
			() => service.off("surfaceUpdated", stateHandler),
			() => service.off("surfaceDeleted", stateHandler),
		]

		void this.postStateToWebview()
	}

	public getEndlessSurfaceService(): EndlessSurfaceService | undefined {
		if (!this.endlessSurfaceService && ClineProvider.globalEndlessSurfaceService) {
			this.attachEndlessSurfaceService(ClineProvider.globalEndlessSurfaceService)
		}
		return this.endlessSurfaceService
	}

	private cleanupEndlessSurfaceListeners() {
		if (!this.endlessSurfaceListenerCleanup.length) {
			return
		}

		for (const dispose of this.endlessSurfaceListenerCleanup) {
			try {
				dispose()
			} catch (error) {
				this.log(
					`Failed to remove endless surface listener: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		}
		this.endlessSurfaceListenerCleanup = []
	}

	private handleEndlessSurfaceStateChange = () => {
		void this.postStateToWebview()
	}

	/**
	 * Override EventEmitter's on method to match TaskProviderLike interface
	 */
	override on<K extends keyof TaskProviderEvents>(
		event: K,
		listener: (...args: TaskProviderEvents[K]) => void | Promise<void>,
	): this {
		return super.on(event, listener as any)
	}

	/**
	 * Override EventEmitter's off method to match TaskProviderLike interface
	 */
	override off<K extends keyof TaskProviderEvents>(
		event: K,
		listener: (...args: TaskProviderEvents[K]) => void | Promise<void>,
	): this {
		return super.off(event, listener as any)
	}

	/**
	 * Initialize cloud profile synchronization
	 */
	private async initializeCloudProfileSync() {
		try {
			// Check if authenticated and sync profiles
			if (CloudService.hasInstance() && CloudService.instance.isAuthenticated()) {
				await this.syncCloudProfiles()
			}

			// Set up listener for future updates
			if (CloudService.hasInstance()) {
				CloudService.instance.on("settings-updated", this.handleCloudSettingsUpdate)
			}
		} catch (error) {
			this.log(`Error in initializeCloudProfileSync: ${error}`)
		}
	}

	/**
	 * Handle cloud settings updates
	 */
	private handleCloudSettingsUpdate = async () => {
		try {
			await this.syncCloudProfiles()
		} catch (error) {
			this.log(`Error handling cloud settings update: ${error}`)
		}
	}

	/**
	 * Synchronize cloud profiles with local profiles.
	 */
	private async syncCloudProfiles() {
		try {
			const settings = CloudService.instance.getOrganizationSettings()

			if (!settings?.providerProfiles) {
				return
			}

			const currentApiConfigName = this.getGlobalState("currentApiConfigName")

			const result = await this.providerSettingsManager.syncCloudProfiles(
				settings.providerProfiles,
				currentApiConfigName,
			)

			if (result.hasChanges) {
				// Update list.
				await this.updateGlobalState("listApiConfigMeta", await this.providerSettingsManager.listConfig())

				if (result.activeProfileChanged && result.activeProfileId) {
					// Reload full settings for new active profile.
					const profile = await this.providerSettingsManager.getProfile({
						id: result.activeProfileId,
					})
					await this.activateProviderProfile({ name: profile.name })
				}

				await this.postStateToWebview()
			}
		} catch (error) {
			this.log(`Error syncing cloud profiles: ${error}`)
		}
	}

	private clampToZero(value: number): number {
		return value < 0 ? 0 : value
	}

	private applyStageTransition(
		pool: OuterGateAnalysisPool,
		previous: OuterGateInsightStage,
		next: OuterGateInsightStage,
		timestampIso: string,
	): OuterGateAnalysisPool {
		let processing = pool.processing
		let ready = pool.ready
		let assigned = pool.assignedThisWeek

		if (previous === "processing") {
			processing = this.clampToZero(processing - 1)
		} else if (previous === "ready") {
			ready = this.clampToZero(ready - 1)
		} else if (previous === "assigned") {
			assigned = this.clampToZero(assigned - 1)
		}

		if (next === "processing") {
			processing += 1
		} else if (next === "ready") {
			ready += 1
		} else if (next === "assigned") {
			assigned += 1
		}

		return {
			...pool,
			processing,
			ready,
			assignedThisWeek: assigned,
			lastUpdatedIso: timestampIso,
		}
	}

	private applyStageRemoval(
		pool: OuterGateAnalysisPool,
		removedStage: OuterGateInsightStage,
		timestampIso: string,
	): OuterGateAnalysisPool {
		let processing = pool.processing
		let ready = pool.ready
		let assigned = pool.assignedThisWeek

		if (removedStage === "processing") {
			processing = this.clampToZero(processing - 1)
		} else if (removedStage === "ready") {
			ready = this.clampToZero(ready - 1)
		} else if (removedStage === "assigned") {
			assigned = this.clampToZero(assigned - 1)
		}

		return {
			...pool,
			totalCaptured: this.clampToZero(pool.totalCaptured - 1),
			processing,
			ready,
			assignedThisWeek: assigned,
			lastUpdatedIso: timestampIso,
		}
	}

	public async updateOuterGateInsight(id: string, updates: OuterGateInsightUpdate): Promise<void> {
		if (!id) {
			return
		}

		const baseState = this.ensureOuterGateState()
		const existing = baseState.recentInsights.find((insight) => insight.id === id)
		if (!existing) {
			return
		}

		const nowIso = new Date().toISOString()
		const trimmedTitle =
			updates.title !== undefined ? updates.title.trim() : undefined
		const trimmedSummary =
			updates.summary !== undefined && updates.summary !== null
				? updates.summary.trim()
				: updates.summary ?? undefined
		const trimmedWorkspace =
			updates.recommendedWorkspace !== undefined && updates.recommendedWorkspace !== null
				? updates.recommendedWorkspace.trim()
				: updates.recommendedWorkspace ?? undefined
		const trimmedCompanyId =
			updates.assignedCompanyId !== undefined && updates.assignedCompanyId !== null
				? updates.assignedCompanyId.trim()
				: updates.assignedCompanyId ?? undefined

		const nextStage = updates.stage ?? existing.stage
		if (!["captured", "processing", "ready", "assigned"].includes(nextStage)) {
			return
		}

		const updatedInsight: OuterGateInsight = { ...existing }

		if (trimmedTitle !== undefined && trimmedTitle.length > 0) {
			updatedInsight.title = trimmedTitle
		}

		if (trimmedSummary !== undefined) {
			if (trimmedSummary && trimmedSummary.length > 0) {
				updatedInsight.summary = trimmedSummary
			} else {
				delete updatedInsight.summary
			}
		}

		if (trimmedWorkspace !== undefined) {
			if (trimmedWorkspace && trimmedWorkspace.length > 0) {
				updatedInsight.recommendedWorkspace = trimmedWorkspace
			} else {
				delete updatedInsight.recommendedWorkspace
			}
		}

		if (trimmedCompanyId !== undefined) {
			if (trimmedCompanyId && trimmedCompanyId.length > 0) {
				updatedInsight.assignedCompanyId = trimmedCompanyId
			} else {
				delete updatedInsight.assignedCompanyId
			}
		}

		updatedInsight.stage = nextStage

		let nextAnalysisPool = { ...baseState.analysisPool, lastUpdatedIso: nowIso }
		if (existing.stage !== nextStage) {
			nextAnalysisPool = this.applyStageTransition(nextAnalysisPool, existing.stage, nextStage, nowIso)
		}

		const nextInsights = baseState.recentInsights.map((insight) =>
			insight.id === id ? updatedInsight : insight,
		)

		this.updateOuterGateState({
			...baseState,
			recentInsights: nextInsights,
			analysisPool: nextAnalysisPool,
		})

		try {
			const manager = await this.getOuterGateManager()
			const stored = manager?.getStoredInsightById(id)
			if (manager && stored) {
				await manager.updateStoredInsight(id, {
					title: updatedInsight.title,
					summary: updatedInsight.summary,
					stage: updatedInsight.stage,
					recommendedWorkspace: updatedInsight.recommendedWorkspace,
					assignedCompanyId: updatedInsight.assignedCompanyId,
				})
			}
		} catch (error) {
			console.error("[ClineProvider] Failed to persist insight update", error)
		}

		await this.postStateToWebview()
	}

	public async deleteOuterGateInsight(id: string): Promise<void> {
		if (!id) {
			return
		}

		const baseState = this.ensureOuterGateState()
		const existing = baseState.recentInsights.find((insight) => insight.id === id)
		if (!existing) {
			return
		}

		const nowIso = new Date().toISOString()
		const nextInsights = baseState.recentInsights.filter((insight) => insight.id !== id)
		const nextAnalysisPool = this.applyStageRemoval(baseState.analysisPool, existing.stage, nowIso)

		this.updateOuterGateState({
			...baseState,
			recentInsights: nextInsights,
			analysisPool: nextAnalysisPool,
		})

		try {
			const manager = await this.getOuterGateManager()
			const stored = manager?.getStoredInsightById(id)
			if (manager && stored) {
				await manager.deleteStoredInsight(id)
			}
		} catch (error) {
			console.error("[ClineProvider] Failed to delete stored insight", error)
		}

		await this.postStateToWebview()
	}

	/**
	 * Initialize cloud profile synchronization when CloudService is ready
	 * This method is called externally after CloudService has been initialized
	 */
	public async initializeCloudProfileSyncWhenReady(): Promise<void> {
		try {
			if (CloudService.hasInstance() && CloudService.instance.isAuthenticated()) {
				await this.syncCloudProfiles()
			}

			if (CloudService.hasInstance()) {
				CloudService.instance.off("settings-updated", this.handleCloudSettingsUpdate)
				CloudService.instance.on("settings-updated", this.handleCloudSettingsUpdate)
			}
		} catch (error) {
			this.log(`Failed to initialize cloud profile sync when ready: ${error}`)
		}
	}

	// Adds a new Task instance to clineStack, marking the start of a new task.
	// The instance is pushed to the top of the stack (LIFO order).
	// When the task is completed, the top instance is removed, reactivating the
	// previous task.
	async addClineToStack(task: Task) {
		// Add this cline instance into the stack that represents the order of
		// all the called tasks.
		this.clineStack.push(task)
		task.emit(RooCodeEventName.TaskFocused)

		// Perform special setup provider specific tasks.
		await this.performPreparationTasks(task)

		// Ensure getState() resolves correctly.
		const state = await this.getState()

		if (!state || typeof state.mode !== "string") {
			throw new Error(t("common:errors.retrieve_current_mode"))
		}
	}

	async performPreparationTasks(cline: Task) {
		// LMStudio: We need to force model loading in order to read its context
		// size; we do it now since we're starting a task with that model selected.
		if (cline.apiConfiguration && cline.apiConfiguration.apiProvider === "lmstudio") {
			try {
				if (!hasLoadedFullDetails(cline.apiConfiguration.lmStudioModelId!)) {
					await forceFullModelDetailsLoad(
						cline.apiConfiguration.lmStudioBaseUrl ?? "http://localhost:1234",
						cline.apiConfiguration.lmStudioModelId!,
					)
				}
			} catch (error) {
				this.log(`Failed to load full model details for LM Studio: ${error}`)
				vscode.window.showErrorMessage(error.message)
			}
		}
	}

	// Removes and destroys the top Cline instance (the current finished task),
	// activating the previous one (resuming the parent task).
	async removeClineFromStack() {
		if (this.clineStack.length === 0) {
			return
		}

		// Pop the top Cline instance from the stack.
		let task = this.clineStack.pop()

		if (task) {
			task.emit(RooCodeEventName.TaskUnfocused)

			try {
				// Abort the running task and set isAbandoned to true so
				// all running promises will exit as well.
				await task.abortTask(true)
			} catch (e) {
				this.log(
					`[ClineProvider#removeClineFromStack] abortTask() failed ${task.taskId}.${task.instanceId}: ${e.message}`,
				)
			}

			// Remove event listeners before clearing the reference.
			const cleanupFunctions = this.taskEventListeners.get(task)

			if (cleanupFunctions) {
				cleanupFunctions.forEach((cleanup) => cleanup())
				this.taskEventListeners.delete(task)
			}

			// Make sure no reference kept, once promises end it will be
			// garbage collected.
			task = undefined
		}
	}

	getTaskStackSize(): number {
		return this.clineStack.length
	}

	public getCurrentTaskStack(): string[] {
		return this.clineStack.map((cline) => cline.taskId)
	}

	// Remove the current task/cline instance (at the top of the stack), so this
	// task is finished and resume the previous task/cline instance (if it
	// exists).
	// This is used when a subtask is finished and the parent task needs to be
	// resumed.
	async finishSubTask(lastMessage: string) {
		// Remove the last cline instance from the stack (this is the finished
		// subtask).
		await this.removeClineFromStack()
		// Resume the last cline instance in the stack (if it exists - this is
		// the 'parent' calling task).
		await this.getCurrentTask()?.completeSubtask(lastMessage)
	}
	// Pending Edit Operations Management

	/**
	 * Sets a pending edit operation with automatic timeout cleanup
	 */
	public setPendingEditOperation(
		operationId: string,
		editData: {
			messageTs: number
			editedContent: string
			images?: string[]
			messageIndex: number
			apiConversationHistoryIndex: number
		},
	): void {
		// Clear any existing operation with the same ID
		this.clearPendingEditOperation(operationId)

		// Create timeout for automatic cleanup
		const timeoutId = setTimeout(() => {
			this.clearPendingEditOperation(operationId)
			this.log(`[setPendingEditOperation] Automatically cleared stale pending operation: ${operationId}`)
		}, ClineProvider.PENDING_OPERATION_TIMEOUT_MS)

		// Store the operation
		this.pendingOperations.set(operationId, {
			...editData,
			timeoutId,
			createdAt: Date.now(),
		})

		this.log(`[setPendingEditOperation] Set pending operation: ${operationId}`)
	}

	/**
	 * Gets a pending edit operation by ID
	 */
	private getPendingEditOperation(operationId: string): PendingEditOperation | undefined {
		return this.pendingOperations.get(operationId)
	}

	/**
	 * Clears a specific pending edit operation
	 */
	private clearPendingEditOperation(operationId: string): boolean {
		const operation = this.pendingOperations.get(operationId)
		if (operation) {
			clearTimeout(operation.timeoutId)
			this.pendingOperations.delete(operationId)
			this.log(`[clearPendingEditOperation] Cleared pending operation: ${operationId}`)
			return true
		}
		return false
	}

	/**
	 * Clears all pending edit operations
	 */
	private clearAllPendingEditOperations(): void {
		for (const [operationId, operation] of this.pendingOperations) {
			clearTimeout(operation.timeoutId)
		}
		this.pendingOperations.clear()
		this.log(`[clearAllPendingEditOperations] Cleared all pending operations`)
	}

	/*
	VSCode extensions use the disposable pattern to clean up resources when the sidebar/editor tab is closed by the user or system. This applies to event listening, commands, interacting with the UI, etc.
	- https://vscode-docs.readthedocs.io/en/stable/extensions/patterns-and-principles/
	- https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	*/
	private clearWebviewResources() {
		while (this.webviewDisposables.length) {
			const x = this.webviewDisposables.pop()
			if (x) {
				x.dispose()
			}
		}
	}

	async dispose() {
		this.log("Disposing ClineProvider...")

		// Clear all tasks from the stack.
		while (this.clineStack.length > 0) {
			await this.removeClineFromStack()
		}

		this.log("Cleared all tasks")

		// Clear all pending edit operations to prevent memory leaks
		this.clearAllPendingEditOperations()
		this.log("Cleared pending operations")

		if (this.view && "dispose" in this.view) {
			this.view.dispose()
			this.log("Disposed webview")
		}

		this.clearWebviewResources()

		// Clean up cloud service event listener
		if (CloudService.hasInstance()) {
			CloudService.instance.off("settings-updated", this.handleCloudSettingsUpdate)
		}

		while (this.disposables.length) {
			const x = this.disposables.pop()

			if (x) {
				x.dispose()
			}
		}

		this._workspaceTracker?.dispose()
		this._workspaceTracker = undefined
		await this.mcpHub?.unregisterClient()
		this.mcpHub = undefined
		this.marketplaceManager?.cleanup()
		this.customModesManager?.dispose()
		this.cleanupEndlessSurfaceListeners()
		this.endlessSurfaceService = undefined
		this.log("Disposed all disposables")
		ClineProvider.activeInstances.delete(this)

		// Clean up any event listeners attached to this provider
		this.removeAllListeners()

		McpServerManager.unregisterProvider(this)
	}

	public static getVisibleInstance(): ClineProvider | undefined {
		return findLast(Array.from(this.activeInstances), (instance) => instance.view?.visible === true)
	}

	public static async getInstance(): Promise<ClineProvider | undefined> {
		let visibleProvider = ClineProvider.getVisibleInstance()

		// If no visible provider, try to show the sidebar view
		if (!visibleProvider) {
			await vscode.commands.executeCommand(`${Package.name}.SidebarProvider.focus`)
			// Wait briefly for the view to become visible
			await delay(100)
			visibleProvider = ClineProvider.getVisibleInstance()
		}

		// If still no visible provider, return
		if (!visibleProvider) {
			return
		}

		return visibleProvider
	}

	public static async isActiveTask(): Promise<boolean> {
		const visibleProvider = await ClineProvider.getInstance()

		if (!visibleProvider) {
			return false
		}

		// Check if there is a cline instance in the stack (if this provider has an active task)
		if (visibleProvider.getCurrentTask()) {
			return true
		}

		return false
	}

	public static async handleCodeAction(
		command: CodeActionId,
		promptType: CodeActionName,
		params: Record<string, string | any[]>,
	): Promise<void> {
		// Capture telemetry for code action usage
		TelemetryService.instance.captureCodeActionUsed(promptType)

		const visibleProvider = await ClineProvider.getInstance()

		if (!visibleProvider) {
			return
		}

		const { customSupportPrompts } = await visibleProvider.getState()

		// TODO: Improve type safety for promptType.
		const prompt = supportPrompt.create(promptType, params, customSupportPrompts)

		if (command === "addToContext") {
			await visibleProvider.postMessageToWebview({ type: "invoke", invoke: "setChatBoxMessage", text: prompt })
			return
		}

		await visibleProvider.createTask(prompt)
	}

	public static async handleTerminalAction(
		command: TerminalActionId,
		promptType: TerminalActionPromptType,
		params: Record<string, string | any[]>,
	): Promise<void> {
		TelemetryService.instance.captureCodeActionUsed(promptType)

		const visibleProvider = await ClineProvider.getInstance()

		if (!visibleProvider) {
			return
		}

		const { customSupportPrompts } = await visibleProvider.getState()
		const prompt = supportPrompt.create(promptType, params, customSupportPrompts)

		if (command === "terminalAddToContext") {
			await visibleProvider.postMessageToWebview({ type: "invoke", invoke: "setChatBoxMessage", text: prompt })
			return
		}

		try {
			await visibleProvider.createTask(prompt)
		} catch (error) {
			if (error instanceof OrganizationAllowListViolationError) {
				// Errors from terminal commands seem to get swallowed / ignored.
				vscode.window.showErrorMessage(error.message)
			}

			throw error
		}
	}

	async resolveWebviewView(webviewView: vscode.WebviewView | vscode.WebviewPanel) {
		this.view = webviewView

		// kilocode_change start: extract constant inTabMode
		// Set panel reference according to webview type
		const inTabMode = "onDidChangeViewState" in webviewView

		if (inTabMode) {
			setPanel(webviewView, "tab")
		} else if ("onDidChangeVisibility" in webviewView) {
			setPanel(webviewView, "sidebar")
		}
		// kilocode_change end

		// Initialize out-of-scope variables that need to receive persistent
		// global state values.
		this.getState().then(
			({
				terminalShellIntegrationTimeout = Terminal.defaultShellIntegrationTimeout,
				terminalShellIntegrationDisabled = true, // kilocode_change: default
				terminalCommandDelay = 0,
				terminalZshClearEolMark = true,
				terminalZshOhMy = false,
				terminalZshP10k = false,
				terminalPowershellCounter = false,
				terminalZdotdir = false,
			}) => {
				Terminal.setShellIntegrationTimeout(terminalShellIntegrationTimeout)
				Terminal.setShellIntegrationDisabled(terminalShellIntegrationDisabled)
				Terminal.setCommandDelay(terminalCommandDelay)
				Terminal.setTerminalZshClearEolMark(terminalZshClearEolMark)
				Terminal.setTerminalZshOhMy(terminalZshOhMy)
				Terminal.setTerminalZshP10k(terminalZshP10k)
				Terminal.setPowershellCounter(terminalPowershellCounter)
				Terminal.setTerminalZdotdir(terminalZdotdir)
			},
		)

		this.getState().then(({ ttsEnabled }) => {
			setTtsEnabled(ttsEnabled ?? false)
		})

		this.getState().then(({ ttsSpeed }) => {
			setTtsSpeed(ttsSpeed ?? 1)
		})

		// Set up webview options with proper resource roots
		const resourceRoots = [this.contextProxy.extensionUri]

		// Add workspace folders to allow access to workspace files
		if (vscode.workspace.workspaceFolders) {
			resourceRoots.push(...vscode.workspace.workspaceFolders.map((folder) => folder.uri))
		}

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: resourceRoots,
		}

		webviewView.webview.html =
			this.contextProxy.extensionMode === vscode.ExtensionMode.Development
				? await this.getHMRHtmlContent(webviewView.webview)
				: this.getHtmlContent(webviewView.webview)

		// Sets up an event listener to listen for messages passed from the webview view context
		// and executes code based on the message that is received.
		this.setWebviewMessageListener(webviewView.webview)

		// Initialize code index status subscription for the current workspace.
		this.updateCodeIndexStatusSubscription()

		// Listen for active editor changes to update code index status for the
		// current workspace.
		const activeEditorSubscription = vscode.window.onDidChangeActiveTextEditor(() => {
			// Update subscription when workspace might have changed.
			this.updateCodeIndexStatusSubscription()
		})
		this.webviewDisposables.push(activeEditorSubscription)

		// Listen for when the panel becomes visible.
		// https://github.com/microsoft/vscode-discussions/discussions/840
		if ("onDidChangeViewState" in webviewView) {
			// WebviewView and WebviewPanel have all the same properties except
			// for this visibility listener panel.
			const viewStateDisposable = webviewView.onDidChangeViewState(() => {
				if (this.view?.visible) {
					this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
				}
			})

			this.webviewDisposables.push(viewStateDisposable)
		} else if ("onDidChangeVisibility" in webviewView) {
			// sidebar
			const visibilityDisposable = webviewView.onDidChangeVisibility(() => {
				if (this.view?.visible) {
					this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
				}
			})

			this.webviewDisposables.push(visibilityDisposable)
		}

		// Listen for when the view is disposed
		// This happens when the user closes the view or when the view is closed programmatically
		webviewView.onDidDispose(
			async () => {
				if (inTabMode) {
					this.log("Disposing ClineProvider instance for tab view")
					await this.dispose()
				} else {
					this.log("Clearing webview resources for sidebar view")
					this.clearWebviewResources()
					// Reset current workspace manager reference when view is disposed
					this.codeIndexManager = undefined
				}
			},
			null,
			this.disposables,
		)

		// Listen for when color changes
		const configDisposable = vscode.workspace.onDidChangeConfiguration(async (e) => {
			if (e && e.affectsConfiguration("workbench.colorTheme")) {
				// Sends latest theme name to webview
				await this.postMessageToWebview({ type: "theme", text: JSON.stringify(await getTheme()) })
			}
		})
		this.webviewDisposables.push(configDisposable)

		// If the extension is starting a new session, clear previous task state.
		await this.removeClineFromStack()
	}

	public async createTaskWithHistoryItem(historyItem: HistoryItem & { rootTask?: Task; parentTask?: Task }) {
		await this.removeClineFromStack()

		// If the history item has a saved mode, restore it and its associated API configuration.
		if (historyItem.mode) {
			// Validate that the mode still exists
			const customModes = await this.customModesManager.getCustomModes()
			const modeExists = getModeBySlug(historyItem.mode, customModes) !== undefined

			if (!modeExists) {
				// Mode no longer exists, fall back to default mode.
				this.log(
					`Mode '${historyItem.mode}' from history no longer exists. Falling back to default mode '${defaultModeSlug}'.`,
				)
				historyItem.mode = defaultModeSlug
			}

			await this.updateGlobalState("mode", historyItem.mode)

			// Load the saved API config for the restored mode if it exists.
			const savedConfigId = await this.providerSettingsManager.getModeConfigId(historyItem.mode)
			const listApiConfig = await this.providerSettingsManager.listConfig()

			// Update listApiConfigMeta first to ensure UI has latest data.
			await this.updateGlobalState("listApiConfigMeta", listApiConfig)

			// If this mode has a saved config, use it.
			if (savedConfigId) {
				const profile = listApiConfig.find(({ id }) => id === savedConfigId)

				if (profile?.name) {
					try {
						await this.activateProviderProfile({ name: profile.name })
					} catch (error) {
						// Log the error but continue with task restoration.
						this.log(
							`Failed to restore API configuration for mode '${historyItem.mode}': ${
								error instanceof Error ? error.message : String(error)
							}. Continuing with default configuration.`,
						)
						// The task will continue with the current/default configuration.
					}
				}
			}
		}

		const state = await this.getState()
		const {
			apiConfiguration,
			diffEnabled: enableDiff,
			enableCheckpoints,
			fuzzyMatchThreshold,
			experiments,
			cloudUserInfo,
			remoteControlEnabled,
		} = await this.getState()

		const task = new Task({
			context: this.context, // kilocode_change
			provider: this,
			apiConfiguration,
			enableDiff,
			enableCheckpoints,
			fuzzyMatchThreshold,
			consecutiveMistakeLimit: apiConfiguration.consecutiveMistakeLimit,
			historyItem,
			experiments,
			rootTask: historyItem.rootTask,
			parentTask: historyItem.parentTask,
			taskNumber: historyItem.number,
			workspacePath: historyItem.workspace,
			onCreated: this.taskCreationCallback,
			enableBridge: BridgeOrchestrator.isEnabled(cloudUserInfo, remoteControlEnabled),
		})

		await this.addClineToStack(task)

		this.log(
			`[createTaskWithHistoryItem] ${task.parentTask ? "child" : "parent"} task ${task.taskId}.${task.instanceId} instantiated`,
		)

		// Check if there's a pending edit after checkpoint restoration
		const operationId = `task-${task.taskId}`
		const pendingEdit = this.getPendingEditOperation(operationId)
		if (pendingEdit) {
			this.clearPendingEditOperation(operationId) // Clear the pending edit

			this.log(`[createTaskWithHistoryItem] Processing pending edit after checkpoint restoration`)

			// Process the pending edit after a short delay to ensure the task is fully initialized
			setTimeout(async () => {
				try {
					// Find the message index in the restored state
					const { messageIndex, apiConversationHistoryIndex } = (() => {
						const messageIndex = task.clineMessages.findIndex((msg) => msg.ts === pendingEdit.messageTs)
						const apiConversationHistoryIndex = task.apiConversationHistory.findIndex(
							(msg) => msg.ts === pendingEdit.messageTs,
						)
						return { messageIndex, apiConversationHistoryIndex }
					})()

					if (messageIndex !== -1) {
						// Remove the target message and all subsequent messages
						await task.overwriteClineMessages(task.clineMessages.slice(0, messageIndex))

						if (apiConversationHistoryIndex !== -1) {
							await task.overwriteApiConversationHistory(
								task.apiConversationHistory.slice(0, apiConversationHistoryIndex),
							)
						}

						// Process the edited message
						await task.handleWebviewAskResponse(
							"messageResponse",
							pendingEdit.editedContent,
							pendingEdit.images,
						)
					}
				} catch (error) {
					this.log(`[createTaskWithHistoryItem] Error processing pending edit: ${error}`)
				}
			}, 100) // Small delay to ensure task is fully ready
		}

		return task
	}

	public async postMessageToWebview(message: ExtensionMessage) {
		await this.view?.webview.postMessage(message)
	}

	private async getHMRHtmlContent(webview: vscode.Webview): Promise<string> {
		let localPort = "5173"

		try {
			const fs = require("fs")
			const path = require("path")
			const portFilePath = path.resolve(__dirname, "../../.vite-port")

			if (fs.existsSync(portFilePath)) {
				localPort = fs.readFileSync(portFilePath, "utf8").trim()
				console.log(`[ClineProvider:Vite] Using Vite server port from ${portFilePath}: ${localPort}`)
			} else {
				console.log(
					`[ClineProvider:Vite] Port file not found at ${portFilePath}, using default port: ${localPort}`,
				)
			}
		} catch (err) {
			console.error("[ClineProvider:Vite] Failed to read Vite port file:", err)
		}

		const localServerUrl = `localhost:${localPort}`

		// Check if local dev server is running.
		try {
			await axios.get(`http://${localServerUrl}`)
		} catch (error) {
			vscode.window.showErrorMessage(t("common:errors.hmr_not_running"))
			return this.getHtmlContent(webview)
		}

		const nonce = getNonce()

		const stylesUri = getUri(webview, this.contextProxy.extensionUri, [
			"webview-ui",
			"build",
			"assets",
			"index.css",
		])

		const codiconsUri = getUri(webview, this.contextProxy.extensionUri, ["assets", "codicons", "codicon.css"])
		const materialIconsUri = getUri(webview, this.contextProxy.extensionUri, [
			"assets",
			"vscode-material-icons",
			"icons",
		])
		const imagesUri = getUri(webview, this.contextProxy.extensionUri, ["assets", "images"])
		const audioUri = getUri(webview, this.contextProxy.extensionUri, ["webview-ui", "audio"])

		const file = "src/index.tsx"
		const scriptUri = `http://${localServerUrl}/${file}`

		const reactRefresh = /*html*/ `
			<script nonce="${nonce}" type="module">
				import RefreshRuntime from "http://localhost:${localPort}/@react-refresh"
				RefreshRuntime.injectIntoGlobalHook(window)
				window.$RefreshReg$ = () => {}
				window.$RefreshSig$ = () => (type) => type
				window.__vite_plugin_react_preamble_installed__ = true
			</script>
		`

		const csp = [
			"default-src 'none'",
			`font-src ${webview.cspSource} data:`,
			`style-src ${webview.cspSource} 'unsafe-inline' https://* http://${localServerUrl} http://0.0.0.0:${localPort}`,
			`img-src ${webview.cspSource} https://storage.googleapis.com https://img.clerk.com data: https://*.googleusercontent.com https://*.googleapis.com https://*.githubusercontent.com`, // kilocode_change: add https://*.googleusercontent.com and https://*.googleapis.com and https://*.githubusercontent.com
			`media-src ${webview.cspSource}`,
			`script-src 'unsafe-eval' ${webview.cspSource} https://* https://*.posthog.com http://${localServerUrl} http://0.0.0.0:${localPort} 'nonce-${nonce}'`,
			`connect-src ${webview.cspSource} https://* http://localhost:3000 https://*.posthog.com ws://${localServerUrl} ws://0.0.0.0:${localPort} http://${localServerUrl} http://0.0.0.0:${localPort}`, // kilocode_change: add http://localhost:3000
		]

		return /*html*/ `
			<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="utf-8">
					<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
					<meta http-equiv="Content-Security-Policy" content="${csp.join("; ")}">
					<link rel="stylesheet" type="text/css" href="${stylesUri}">
					<link href="${codiconsUri}" rel="stylesheet" />
					<script nonce="${nonce}">
						window.IMAGES_BASE_URI = "${imagesUri}"
						window.AUDIO_BASE_URI = "${audioUri}"
						window.MATERIAL_ICONS_BASE_URI = "${materialIconsUri}"
					</script>
					<title>Kilo Code</title>
				</head>
				<body>
					<div id="root"></div>
					${reactRefresh}
					<script type="module" src="${scriptUri}"></script>
				</body>
			</html>
		`
	}

	/**
	 * Defines and returns the HTML that should be rendered within the webview panel.
	 *
	 * @remarks This is also the place where references to the React webview build files
	 * are created and inserted into the webview HTML.
	 *
	 * @param webview A reference to the extension webview
	 * @param extensionUri The URI of the directory containing the extension
	 * @returns A template string literal containing the HTML that should be
	 * rendered within the webview panel
	 */
	private getHtmlContent(webview: vscode.Webview): string {
		// Get the local path to main script run in the webview,
		// then convert it to a uri we can use in the webview.

		// The CSS file from the React build output
		const stylesUri = getUri(webview, this.contextProxy.extensionUri, [
			"webview-ui",
			"build",
			"assets",
			"index.css",
		])

		const scriptUri = getUri(webview, this.contextProxy.extensionUri, ["webview-ui", "build", "assets", "index.js"])
		const codiconsUri = getUri(webview, this.contextProxy.extensionUri, ["assets", "codicons", "codicon.css"])
		const materialIconsUri = getUri(webview, this.contextProxy.extensionUri, [
			"assets",
			"vscode-material-icons",
			"icons",
		])
		const imagesUri = getUri(webview, this.contextProxy.extensionUri, ["assets", "images"])
		const audioUri = getUri(webview, this.contextProxy.extensionUri, ["webview-ui", "audio"])

		// Use a nonce to only allow a specific script to be run.
		/*
		content security policy of your webview to only allow scripts that have a specific nonce
		create a content security policy meta tag so that only loading scripts with a nonce is allowed
		As your extension grows you will likely want to add custom styles, fonts, and/or images to your webview. If you do, you will need to update the content security policy meta tag to explicitly allow for these resources. E.g.
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
		- 'unsafe-inline' is required for styles due to vscode-webview-toolkit's dynamic style injection
		- since we pass base64 images to the webview, we need to specify img-src ${webview.cspSource} data:;

		in meta tag we add nonce attribute: A cryptographic nonce (only used once) to allow scripts. The server must generate a unique nonce value each time it transmits a policy. It is critical to provide a nonce that cannot be guessed as bypassing a resource's policy is otherwise trivial.
		*/
		const nonce = getNonce()

		// Tip: Install the es6-string-html VS Code extension to enable code highlighting below
		return /*html*/ `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
            <meta name="theme-color" content="#000000">
			<!-- kilocode_change: add https://*.googleusercontent.com https://*.googleapis.com https://*.githubusercontent.com to img-src, https://*, http://localhost:3000 to connect-src -->
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https://*.googleusercontent.com https://storage.googleapis.com https://*.githubusercontent.com https://img.clerk.com data: https://*.googleapis.com; media-src ${webview.cspSource}; script-src ${webview.cspSource} 'wasm-unsafe-eval' 'nonce-${nonce}' https://us-assets.i.posthog.com 'strict-dynamic'; connect-src ${webview.cspSource} https://* http://localhost:3000 https://openrouter.ai https://api.requesty.ai https://us.i.posthog.com https://us-assets.i.posthog.com;">
            <link rel="stylesheet" type="text/css" href="${stylesUri}">
			<link href="${codiconsUri}" rel="stylesheet" />
			<script nonce="${nonce}">
				window.IMAGES_BASE_URI = "${imagesUri}"
				window.AUDIO_BASE_URI = "${audioUri}"
				window.MATERIAL_ICONS_BASE_URI = "${materialIconsUri}"
			</script>
            <title>Kilo Code</title>
          </head>
          <body>
            <noscript>You need to enable JavaScript to run this app.</noscript>
            <div id="root"></div>
            <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
          </body>
        </html>
      `
	}

	/**
	 * Sets up an event listener to listen for messages passed from the webview context and
	 * executes code based on the message that is received.
	 *
	 * @param webview A reference to the extension webview
	 */
	private setWebviewMessageListener(webview: vscode.Webview) {
		const onReceiveMessage = async (message: WebviewMessage) =>
			webviewMessageHandler(this, message, this.marketplaceManager)

		const messageDisposable = webview.onDidReceiveMessage(onReceiveMessage)
		this.webviewDisposables.push(messageDisposable)
	}

	/**
	 * Handle switching to a new mode, including updating the associated API configuration
	 * @param newMode The mode to switch to
	 */
	public async handleModeSwitch(newMode: Mode) {
		const task = this.getCurrentTask()

		if (task) {
			TelemetryService.instance.captureModeSwitch(task.taskId, newMode)
			task.emit(RooCodeEventName.TaskModeSwitched, task.taskId, newMode)

			try {
				// Update the task history with the new mode first.
				const history = this.getGlobalState("taskHistory") ?? []
				const taskHistoryItem = history.find((item) => item.id === task.taskId)

				if (taskHistoryItem) {
					taskHistoryItem.mode = newMode
					await this.updateTaskHistory(taskHistoryItem)
				}

				// Only update the task's mode after successful persistence.
				;(task as any)._taskMode = newMode
			} catch (error) {
				// If persistence fails, log the error but don't update the in-memory state.
				this.log(
					`Failed to persist mode switch for task ${task.taskId}: ${error instanceof Error ? error.message : String(error)}`,
				)

				// Optionally, we could emit an event to notify about the failure.
				// This ensures the in-memory state remains consistent with persisted state.
				throw error
			}
		}

		await this.updateGlobalState("mode", newMode)

		this.emit(RooCodeEventName.ModeChanged, newMode)

		// Load the saved API config for the new mode if it exists.
		const savedConfigId = await this.providerSettingsManager.getModeConfigId(newMode)
		const listApiConfig = await this.providerSettingsManager.listConfig()

		// Update listApiConfigMeta first to ensure UI has latest data.
		await this.updateGlobalState("listApiConfigMeta", listApiConfig)

		// If this mode has a saved config, use it.
		if (savedConfigId) {
			const profile = listApiConfig.find(({ id }) => id === savedConfigId)

			if (profile?.name) {
				await this.activateProviderProfile({ name: profile.name })
			}
		} else {
			// If no saved config for this mode, save current config as default.
			const currentApiConfigName = this.getGlobalState("currentApiConfigName")

			if (currentApiConfigName) {
				const config = listApiConfig.find((c) => c.name === currentApiConfigName)

				if (config?.id) {
					await this.providerSettingsManager.setModeConfig(newMode, config.id)
				}
			}
		}

		await this.postStateToWebview()
	}

	// Provider Profile Management

	getProviderProfileEntries(): ProviderSettingsEntry[] {
		return this.contextProxy.getValues().listApiConfigMeta || []
	}

	getProviderProfileEntry(name: string): ProviderSettingsEntry | undefined {
		return this.getProviderProfileEntries().find((profile) => profile.name === name)
	}

	public hasProviderProfileEntry(name: string): boolean {
		return !!this.getProviderProfileEntry(name)
	}

	async upsertProviderProfile(
		name: string,
		providerSettings: ProviderSettings,
		activate: boolean = true,
	): Promise<string | undefined> {
		try {
			// TODO: Do we need to be calling `activateProfile`? It's not
			// clear to me what the source of truth should be; in some cases
			// we rely on the `ContextProxy`'s data store and in other cases
			// we rely on the `ProviderSettingsManager`'s data store. It might
			// be simpler to unify these two.
			const id = await this.providerSettingsManager.saveConfig(name, providerSettings)

			if (activate) {
				const { mode } = await this.getState()

				// These promises do the following:
				// 1. Adds or updates the list of provider profiles.
				// 2. Sets the current provider profile.
				// 3. Sets the current mode's provider profile.
				// 4. Copies the provider settings to the context.
				//
				// Note: 1, 2, and 4 can be done in one `ContextProxy` call:
				// this.contextProxy.setValues({ ...providerSettings, listApiConfigMeta: ..., currentApiConfigName: ... })
				// We should probably switch to that and verify that it works.
				// I left the original implementation in just to be safe.
				await Promise.all([
					this.updateGlobalState("listApiConfigMeta", await this.providerSettingsManager.listConfig()),
					this.updateGlobalState("currentApiConfigName", name),
					this.providerSettingsManager.setModeConfig(mode, id),
					this.contextProxy.setProviderSettings(providerSettings),
				])

				// Change the provider for the current task.
				// TODO: We should rename `buildApiHandler` for clarity (e.g. `getProviderClient`).
				const task = this.getCurrentTask()

				if (task) {
					task.api = buildApiHandler(providerSettings)
				}

				await TelemetryService.instance.updateIdentity(providerSettings.kilocodeToken ?? "") // kilocode_change
			} else {
				await this.updateGlobalState("listApiConfigMeta", await this.providerSettingsManager.listConfig())
			}

			await this.postStateToWebview()
			return id
		} catch (error) {
			this.log(
				`Error create new api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)

			vscode.window.showErrorMessage(t("common:errors.create_api_config"))
			return undefined
		}
	}

	async deleteProviderProfile(profileToDelete: ProviderSettingsEntry) {
		const globalSettings = this.contextProxy.getValues()
		let profileToActivate: string | undefined = globalSettings.currentApiConfigName

		if (profileToDelete.name === profileToActivate) {
			profileToActivate = this.getProviderProfileEntries().find(({ name }) => name !== profileToDelete.name)?.name
		}

		if (!profileToActivate) {
			throw new Error("You cannot delete the last profile")
		}

		const entries = this.getProviderProfileEntries().filter(({ name }) => name !== profileToDelete.name)

		await this.contextProxy.setValues({
			...globalSettings,
			currentApiConfigName: profileToActivate,
			listApiConfigMeta: entries,
		})

		await this.postStateToWebview()
	}

	async activateProviderProfile(args: { name: string } | { id: string }) {
		const { name, id, ...providerSettings } = await this.providerSettingsManager.activateProfile(args)

		// See `upsertProviderProfile` for a description of what this is doing.
		await Promise.all([
			this.contextProxy.setValue("listApiConfigMeta", await this.providerSettingsManager.listConfig()),
			this.contextProxy.setValue("currentApiConfigName", name),
			this.contextProxy.setProviderSettings(providerSettings),
		])

		const { mode } = await this.getState()

		if (id) {
			await this.providerSettingsManager.setModeConfig(mode, id)
		}

		// Change the provider for the current task.
		const task = this.getCurrentTask()

		if (task) {
			task.api = buildApiHandler(providerSettings)
		}

		await this.postStateToWebview()
		await TelemetryService.instance.updateIdentity(providerSettings.kilocodeToken ?? "") // kilocode_change

		if (providerSettings.apiProvider) {
			this.emit(RooCodeEventName.ProviderProfileChanged, { name, provider: providerSettings.apiProvider })
		}
	}

	async updateCustomInstructions(instructions?: string) {
		// User may be clearing the field.
		await this.updateGlobalState("customInstructions", instructions || undefined)
		await this.postStateToWebview()
	}

	// MCP

	async ensureMcpServersDirectoryExists(): Promise<string> {
		// Get platform-specific application data directory
		let mcpServersDir: string
		if (process.platform === "win32") {
			// Windows: %APPDATA%\Kilo-Code\MCP
			mcpServersDir = path.join(os.homedir(), "AppData", "Roaming", "Kilo-Code", "MCP")
		} else if (process.platform === "darwin") {
			// macOS: ~/Documents/Kilo-Code/MCP
			mcpServersDir = path.join(os.homedir(), "Documents", "Kilo-Code", "MCP")
		} else {
			// Linux: ~/.local/share/Kilo-Code/MCP
			mcpServersDir = path.join(os.homedir(), ".local", "share", "Kilo-Code", "MCP")
		}

		try {
			await fs.mkdir(mcpServersDir, { recursive: true })
		} catch (error) {
			// Fallback to a relative path if directory creation fails
			return path.join(os.homedir(), ".kilocode", "mcp")
		}
		return mcpServersDir
	}

	async ensureSettingsDirectoryExists(): Promise<string> {
		const { getSettingsDirectoryPath } = await import("../../utils/storage")
		const globalStoragePath = this.contextProxy.globalStorageUri.fsPath
		return getSettingsDirectoryPath(globalStoragePath)
	}

	// OpenRouter

	async handleOpenRouterCallback(code: string) {
		let { apiConfiguration, currentApiConfigName = "default" } = await this.getState()

		let apiKey: string

		try {
			const baseUrl = apiConfiguration.openRouterBaseUrl || "https://openrouter.ai/api/v1"
			// Extract the base domain for the auth endpoint.
			const baseUrlDomain = baseUrl.match(/^(https?:\/\/[^\/]+)/)?.[1] || "https://openrouter.ai"
			const response = await axios.post(`${baseUrlDomain}/api/v1/auth/keys`, { code })

			if (response.data && response.data.key) {
				apiKey = response.data.key
			} else {
				throw new Error("Invalid response from OpenRouter API")
			}
		} catch (error) {
			this.log(
				`Error exchanging code for API key: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)

			throw error
		}

		const newConfiguration: ProviderSettings = {
			...apiConfiguration,
			apiProvider: "openrouter",
			openRouterApiKey: apiKey,
			openRouterModelId: apiConfiguration?.openRouterModelId || openRouterDefaultModelId,
		}

		await this.upsertProviderProfile(currentApiConfigName, newConfiguration)
	}

	// Glama

	async handleGlamaCallback(code: string) {
		let apiKey: string

		try {
			const response = await axios.post("https://glama.ai/api/gateway/v1/auth/exchange-code", { code })

			if (response.data && response.data.apiKey) {
				apiKey = response.data.apiKey
			} else {
				throw new Error("Invalid response from Glama API")
			}
		} catch (error) {
			this.log(
				`Error exchanging code for API key: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)

			throw error
		}

		const { apiConfiguration, currentApiConfigName = "default" } = await this.getState()

		const newConfiguration: ProviderSettings = {
			...apiConfiguration,
			apiProvider: "glama",
			glamaApiKey: apiKey,
			glamaModelId: apiConfiguration?.glamaModelId || glamaDefaultModelId,
		}

		await this.upsertProviderProfile(currentApiConfigName, newConfiguration)
	}

	// Requesty

	async handleRequestyCallback(code: string) {
		let { apiConfiguration, currentApiConfigName = "default" } = await this.getState()

		const newConfiguration: ProviderSettings = {
			...apiConfiguration,
			apiProvider: "requesty",
			requestyApiKey: code,
			requestyModelId: apiConfiguration?.requestyModelId || requestyDefaultModelId,
		}

		await this.upsertProviderProfile(currentApiConfigName, newConfiguration)
	}

	// kilocode_change:
	async handleKiloCodeCallback(token: string) {
		const kilocode: ProviderName = "kilocode"
		let { apiConfiguration, currentApiConfigName = "default" } = await this.getState()

		await this.upsertProviderProfile(currentApiConfigName, {
			...apiConfiguration,
			apiProvider: "kilocode",
			kilocodeToken: token,
		})

		vscode.window.showInformationMessage("Kilo Code successfully configured!")

		if (this.getCurrentTask()) {
			this.getCurrentTask()!.api = buildApiHandler({
				apiProvider: kilocode,
				kilocodeToken: token,
			})
		}
	}

	// Task history

	async getTaskWithId(id: string): Promise<{
		historyItem: HistoryItem
		taskDirPath: string
		apiConversationHistoryFilePath: string
		uiMessagesFilePath: string
		apiConversationHistory: Anthropic.MessageParam[]
	}> {
		const history = this.getGlobalState("taskHistory") ?? []
		const historyItem = history.find((item) => item.id === id)

		if (historyItem) {
			const { getTaskDirectoryPath } = await import("../../utils/storage")
			const globalStoragePath = this.contextProxy.globalStorageUri.fsPath
			const taskDirPath = await getTaskDirectoryPath(globalStoragePath, id)
			const apiConversationHistoryFilePath = path.join(taskDirPath, GlobalFileNames.apiConversationHistory)
			const uiMessagesFilePath = path.join(taskDirPath, GlobalFileNames.uiMessages)
			const fileExists = await fileExistsAtPath(apiConversationHistoryFilePath)

			if (fileExists) {
				const apiConversationHistory = JSON.parse(await fs.readFile(apiConversationHistoryFilePath, "utf8"))

				return {
					historyItem,
					taskDirPath,
					apiConversationHistoryFilePath,
					uiMessagesFilePath,
					apiConversationHistory,
				}
			} else {
				vscode.window.showErrorMessage(
					`Task file not found for task ID: ${id} (file ${apiConversationHistoryFilePath})`,
				) //kilocode_change show extra debugging information to debug task not found issues
			}
		} else {
			vscode.window.showErrorMessage(`Task with ID: ${id} not found in history.`) // kilocode_change show extra debugging information to debug task not found issues
		}

		// if we tried to get a task that doesn't exist, remove it from state
		// FIXME: this seems to happen sometimes when the json file doesnt save to disk for some reason
		// await this.deleteTaskFromState(id) // kilocode_change disable confusing behaviour
		await this.setTaskFileNotFound(id) // kilocode_change
		throw new Error("Task not found")
	}

	async showTaskWithId(id: string) {
		if (id !== this.getCurrentTask()?.taskId) {
			// Non-current task.
			const { historyItem } = await this.getTaskWithId(id)
			await this.createTaskWithHistoryItem(historyItem) // Clears existing task.
		}

		await this.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
	}

	async exportTaskWithId(id: string) {
		const { historyItem, apiConversationHistory } = await this.getTaskWithId(id)
		await downloadTask(historyItem.ts, apiConversationHistory)
	}

	/* Condenses a task's message history to use fewer tokens. */
	async condenseTaskContext(taskId: string) {
		let task: Task | undefined
		for (let i = this.clineStack.length - 1; i >= 0; i--) {
			if (this.clineStack[i].taskId === taskId) {
				task = this.clineStack[i]
				break
			}
		}
		if (!task) {
			throw new Error(`Task with id ${taskId} not found in stack`)
		}
		await task.condenseContext()
		await this.postMessageToWebview({ type: "condenseTaskContextResponse", text: taskId })
	}

	// this function deletes a task from task hidtory, and deletes it's checkpoints and delete the task folder
	async deleteTaskWithId(id: string) {
		try {
			// get the task directory full path
			const { taskDirPath } = await this.getTaskWithId(id)

			// kilocode_change start
			// Check if task is favorited
			const history = this.getGlobalState("taskHistory") ?? []
			const task = history.find((item) => item.id === id)
			if (task?.isFavorited) {
				throw new Error("Cannot delete a favorited task. Please unfavorite it first.")
			}
			// kilocode_change end

			// remove task from stack if it's the current task
			if (id === this.getCurrentTask()?.taskId) {
				// if we found the taskid to delete - call finish to abort this task and allow a new task to be started,
				// if we are deleting a subtask and parent task is still waiting for subtask to finish - it allows the parent to resume (this case should neve exist)
				await this.finishSubTask(t("common:tasks.deleted"))
			}

			// delete task from the task history state
			await this.deleteTaskFromState(id)

			// Delete associated shadow repository or branch.
			// TODO: Store `workspaceDir` in the `HistoryItem` object.
			const globalStorageDir = this.contextProxy.globalStorageUri.fsPath
			const workspaceDir = this.cwd

			try {
				await ShadowCheckpointService.deleteTask({ taskId: id, globalStorageDir, workspaceDir })
			} catch (error) {
				console.error(
					`[deleteTaskWithId${id}] failed to delete associated shadow repository or branch: ${error instanceof Error ? error.message : String(error)}`,
				)
			}

			// delete the entire task directory including checkpoints and all content
			try {
				await fs.rm(taskDirPath, { recursive: true, force: true })
				console.log(`[deleteTaskWithId${id}] removed task directory`)
			} catch (error) {
				console.error(
					`[deleteTaskWithId${id}] failed to remove task directory: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		} catch (error) {
			// If task is not found, just remove it from state
			if (error instanceof Error && error.message === "Task not found") {
				await this.deleteTaskFromState(id)
				return
			}
			throw error
		}
	}

	async deleteTaskFromState(id: string) {
		const taskHistory = this.getGlobalState("taskHistory") ?? []
		const updatedTaskHistory = taskHistory.filter((task) => task.id !== id)
		await this.updateGlobalState("taskHistory", updatedTaskHistory)
		this.recentTasksCache = undefined
		await this.postStateToWebview()
	}

	async refreshWorkspace() {
		this.currentWorkspacePath = getWorkspacePath()
		await this.postStateToWebview()
	}

	private initializeOuterGateManager() {
		if (this.outerGateManagerPromise) {
			return
		}

		this.outerGateManagerPromise = OuterGateIntegrationManager.initialize(this.contextProxy, () =>
			this.getActiveWorkspaceName(),
		)

		this.outerGateManagerPromise
			.then(async (manager) => {
				this.outerGateManager = manager
				const baseState = createInitialOuterGateState(this.workplaceService?.getState())
				const enriched = manager.applyToState(baseState)
				this.updateOuterGateState(enriched)
				await this.postStateToWebview()
			})
			.catch((error) => {
				console.error("[ClineProvider] Failed to initialize Outer Gate integrations", error)
			})
	}

	private async getOuterGateManager(): Promise<OuterGateIntegrationManager | undefined> {
		if (this.outerGateManager) {
			return this.outerGateManager
		}

		if (!this.outerGateManagerPromise) {
			this.initializeOuterGateManager()
		}

		if (!this.outerGateManagerPromise) {
			return undefined
		}

		try {
			this.outerGateManager = await this.outerGateManagerPromise
			return this.outerGateManager
		} catch (error) {
			console.error("[ClineProvider] Unable to resolve Outer Gate manager", error)
			return undefined
		}
	}

	private async refreshOuterGateStateFromManager() {
		const manager = await this.getOuterGateManager()
		if (!manager) {
			return
		}

		const baseState = createInitialOuterGateState(this.workplaceService?.getState())
		const enriched = manager.applyToState(baseState)
		this.updateOuterGateState(enriched)
	}

	public async importNotionIntegration(options: {
		token?: string
		databaseId?: string
		dataSourceId?: string
		pageSize?: number
		maxPages?: number
	}) {
		const manager = await this.getOuterGateManager()
		if (!manager) {
			void vscode.window.showErrorMessage("Outer Gate integrations are still starting. Try again in a moment.")
			return
		}

		try {
			await manager.importNotion(options)
			await this.refreshOuterGateStateFromManager()
			await this.postStateToWebview()
			void vscode.window.showInformationMessage("Notion workspace synced into the Outer Gates.")
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			const existingMeta = manager.getStoredMeta("notion")
			const cleanedDatabaseId =
				options.databaseId?.trim() ||
				(typeof existingMeta?.extra?.databaseId === "string" ? existingMeta.extra.databaseId : undefined)
			const cleanedDataSourceId =
				options.dataSourceId?.trim() ||
				(typeof existingMeta?.extra?.dataSourceId === "string" ? existingMeta.extra.dataSourceId : undefined)
			const existingLabel = typeof existingMeta?.targetLabel === "string" ? existingMeta.targetLabel : undefined
			await manager.recordIntegrationError("notion", message, {
				targetLabel: cleanedDatabaseId ?? existingLabel,
				extra: {
					...(existingMeta?.extra ?? {}),
					databaseId: cleanedDatabaseId,
					dataSourceId: cleanedDataSourceId,
				},
			})
			await this.refreshOuterGateStateFromManager()
			await this.postStateToWebview()
			console.error("[ClineProvider] Notion import failed", error)
			void vscode.window.showErrorMessage(`Notion import failed: ${message}`)
		}
	}

	public async importMiroIntegration(options: {
		token?: string
		boardId?: string
		itemTypes?: string[]
		maxItems?: number
	}) {
		const manager = await this.getOuterGateManager()
		if (!manager) {
			void vscode.window.showErrorMessage("Outer Gate integrations are still starting. Try again in a moment.")
			return
		}

		try {
			await manager.importMiro(options)
			await this.refreshOuterGateStateFromManager()
			await this.postStateToWebview()
			void vscode.window.showInformationMessage("Miro board synced into the Outer Gates.")
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			const existingMeta = manager.getStoredMeta("miro")
			const cleanedBoardId =
				options.boardId?.trim() ||
				(typeof existingMeta?.extra?.boardId === "string" ? existingMeta.extra.boardId : undefined)
			const cleanedItemTypes =
				options.itemTypes && options.itemTypes.length > 0
					? options.itemTypes.join(",")
					: typeof existingMeta?.extra?.itemTypes === "string"
						? existingMeta.extra.itemTypes
						: undefined
			const existingLabel = typeof existingMeta?.targetLabel === "string" ? existingMeta.targetLabel : undefined
			await manager.recordIntegrationError("miro", message, {
				targetLabel: cleanedBoardId ?? existingLabel,
				extra: {
					...(existingMeta?.extra ?? {}),
					boardId: cleanedBoardId,
					itemTypes: cleanedItemTypes,
				},
			})
			await this.refreshOuterGateStateFromManager()
			await this.postStateToWebview()
			console.error("[ClineProvider] Miro import failed", error)
			void vscode.window.showErrorMessage(`Miro import failed: ${message}`)
		}
	}

	public async importZipIntegration(zipPath: string) {
		const manager = await this.getOuterGateManager()
		if (!manager) {
			void vscode.window.showErrorMessage("Outer Gate integrations are still starting. Try again in a moment.")
			return
		}

		try {
			await manager.importZipArchive(zipPath)
			await this.refreshOuterGateStateFromManager()
			await this.postStateToWebview()
			void vscode.window.showInformationMessage("ZIP archive imported into the Outer Gates.")
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			await manager.recordIntegrationError("zip-file", message, {
				targetLabel: zipPath,
				extra: {
					...(manager.getStoredMeta("zip-file")?.extra ?? {}),
					archivePath: zipPath,
				},
			})
			await this.refreshOuterGateStateFromManager()
			await this.postStateToWebview()
			console.error("[ClineProvider] ZIP import failed", error)
			void vscode.window.showErrorMessage(`ZIP import failed: ${message}`)
		}
	}

	private ensureOuterGateState(): OuterGateState {
		if (!this.outerGateState) {
			this.outerGateState = createInitialOuterGateState(this.workplaceService?.getState())
		}
		return this.outerGateState
	}

	private updateOuterGateState(next: OuterGateState) {
		this.outerGateState = this.pruneOuterGateState(next)
	}

	private pruneOuterGateState(next: OuterGateState): OuterGateState {
		return {
			...next,
			cloverMessages: [...next.cloverMessages].slice(-CLOVER_MAX_MESSAGES),
			recentInsights: [...next.recentInsights].slice(0, 8),
			cloverSessions: {
				...next.cloverSessions,
				entries: [...next.cloverSessions.entries].slice(0, CLOVER_SESSION_SUMMARY_LIMIT),
			},
		}
	}

	public getOuterGateStateSnapshot(): OuterGateState {
		return cloneOuterGateState(this.ensureOuterGateState())
	}

	private getActiveWorkspaceName(): string | undefined {
		const workplaceSnapshot = this.workplaceService?.getState()
		if (!workplaceSnapshot || workplaceSnapshot.companies.length === 0) {
			return undefined
		}
		const activeCompanyId =
			workplaceSnapshot.activeCompanyId ??
			workplaceSnapshot.companies[0]?.id ??
			workplaceSnapshot.companies[0]?.id
		const activeCompany = workplaceSnapshot.companies.find((company) => company.id === activeCompanyId)
		return activeCompany?.name ?? workplaceSnapshot.companies[0]?.name
	}

	private async ensureCloverSessionsInitialized(): Promise<void> {
		if (this.cloverSessionsInitialized) {
			return
		}
		const service = this.getCloverSessionService()
		if (!service) {
			return
		}
		if (this.lastCloverSessionFetchErrorAt) {
			const elapsed = Date.now() - this.lastCloverSessionFetchErrorAt
			if (elapsed < CLOVER_SESSION_RETRY_DELAY_MS) {
				return
			}
		}
		const state = this.ensureOuterGateState()
		await service.ensureDefaultSession(state.cloverMessages)
		const initialized = await this.refreshCloverSessions({ append: false, syncActiveSession: true })
		if (initialized) {
			this.cloverSessionsInitialized = true
			this.lastCloverSessionFetchErrorAt = undefined
			return
		}
		this.lastCloverSessionFetchErrorAt = Date.now()
	}

	private mergeCloverSessionEntries(
		existing: OuterGateCloverSessionSummary[],
		incoming: OuterGateCloverSessionSummary[],
		append: boolean,
	): OuterGateCloverSessionSummary[] {
		const combined = append ? [...existing, ...incoming] : [...incoming, ...existing]
		const deduped: OuterGateCloverSessionSummary[] = []
		const seen = new Set<string>()
		for (const session of combined) {
			if (seen.has(session.id)) {
				continue
			}
			deduped.push(session)
			seen.add(session.id)
		}
		return deduped.slice(0, CLOVER_SESSION_SUMMARY_LIMIT)
	}

	private async refreshCloverSessions(
		options: {
			cursor?: string
			append?: boolean
			limit?: number
			syncActiveSession?: boolean
		} = {},
	): Promise<boolean> {
		const service = this.getCloverSessionService()
		if (!service) {
			return false
		}
		const { cursor, append = false, limit = DEFAULT_CLOVER_SESSION_PAGE_SIZE, syncActiveSession = true } = options
		const state = this.ensureOuterGateState()
		const loadingState: OuterGateState = {
			...state,
			cloverSessions: {
				...state.cloverSessions,
				isLoading: true,
			},
		}
		this.updateOuterGateState(loadingState)

		try {
			const result = await service.listSessions({ cursor, limit })
			const mergedEntries = this.mergeCloverSessionEntries(state.cloverSessions.entries, result.sessions, append)

			const refreshedState: OuterGateState = {
				...this.ensureOuterGateState(),
				cloverSessions: {
					entries: mergedEntries,
					hasMore: result.hasMore,
					cursor: result.nextCursor,
					isLoading: false,
					isInitialFetchComplete: true,
				},
			}
			this.updateOuterGateState(refreshedState)

			if (syncActiveSession) {
				await this.syncActiveCloverSessionMessages(service.getActiveSessionId())
			}

			this.cloverSessionWarningShown = false
			return true
		} catch (error) {
			console.error("[ClineProvider.refreshCloverSessions] Failed to fetch Clover sessions", error)
			const hadEntries = state.cloverSessions.entries.length > 0
			const fallbackState: OuterGateState = {
				...state,
				cloverSessions: {
					...state.cloverSessions,
					isLoading: false,
					isInitialFetchComplete: hadEntries ? (state.cloverSessions.isInitialFetchComplete ?? true) : true,
				},
			}
			this.updateOuterGateState(fallbackState)

			if (!this.cloverSessionWarningShown) {
				void vscode.window.showWarningMessage(this.formatCloverSessionFetchError(error))
				this.cloverSessionWarningShown = true
			}

			return false
		}
	}

	private formatCloverSessionFetchError(error: unknown): string {
		if (axios.isAxiosError(error)) {
			const status = error.response?.status
			if (status) {
				return `Clover sessions are unavailable (HTTP ${status}). Check your network connection or POOL_API_URL setting, then try again.`
			}
			if (error.code) {
				return `Clover sessions are unavailable (${error.code}). Check your network connection or POOL_API_URL setting, then try again.`
			}
		}
		return "Clover sessions are unavailable right now. Check your network connection or POOL_API_URL setting, then try again."
	}

	private async syncActiveCloverSessionMessages(sessionId?: string): Promise<void> {
		if (!sessionId) {
			return
		}
		const service = this.getCloverSessionService()
		if (!service) {
			return
		}
		let session = service.getSession(sessionId)
		if (!session) {
			session = await service.fetchSession(sessionId)
			if (!session) {
				return
			}
		}
		const state = this.ensureOuterGateState()
		this.updateOuterGateState({
			...state,
			activeCloverSessionId: sessionId,
			cloverMessages: session.messages.map((message) => ({ ...message })),
		})
	}

	private async setActiveCloverSession(sessionId?: string): Promise<void> {
		const service = this.getCloverSessionService()
		if (!service) {
			return
		}
		await service.setActiveSessionId(sessionId)
		await this.syncActiveCloverSessionMessages(sessionId)
	}

	private getActiveCompanyContext(): { companyId?: string; companyName?: string } {
		const workplace = this.getWorkplaceService()
		if (!workplace) {
			return {}
		}
		const snapshot = workplace.getState()
		if (!snapshot.companies.length) {
			return {}
		}
		const activeCompanyId = snapshot.activeCompanyId ?? snapshot.companies[0]?.id ?? snapshot.companies[0]?.id
		const company = snapshot.companies.find((entry) => entry.id === activeCompanyId) ?? snapshot.companies[0]
		return {
			companyId: company?.id,
			companyName: company?.name,
		}
	}

	private async ensureActiveCloverSession(): Promise<string | undefined> {
		await this.ensureCloverSessionsInitialized()
		const service = this.getCloverSessionService()
		if (!service) {
			return this.ensureOuterGateState().activeCloverSessionId
		}
		let sessionId = this.ensureOuterGateState().activeCloverSessionId
		if (!sessionId) {
			const context = this.getActiveCompanyContext()
			const welcomeMessage = createCloverWelcomeMessage()
			welcomeMessage.tokens = await this.estimateCloverTokenCount(welcomeMessage.text)
			const session = await service.createSession({
				companyId: context.companyId,
				companyName: context.companyName,
				initialMessages: [welcomeMessage],
			})
			const summary = service.toSummary(session)
			const stateAfterCreate = this.ensureOuterGateState()
			const mergedEntries = this.mergeCloverSessionEntries(
				stateAfterCreate.cloverSessions.entries,
				[summary],
				false,
			)
			this.updateOuterGateState({
				...stateAfterCreate,
				activeCloverSessionId: session.id,
				cloverMessages: session.messages.map((message) => ({ ...message })),
				cloverSessions: {
					...stateAfterCreate.cloverSessions,
					entries: mergedEntries,
					hasMore: stateAfterCreate.cloverSessions.hasMore,
					cursor: stateAfterCreate.cloverSessions.cursor,
					isLoading: false,
					isInitialFetchComplete: true,
				},
			})
			sessionId = session.id
		}
		await this.setActiveCloverSession(sessionId)
		return sessionId
	}

	public async createCloverSession(options?: { companyId?: string; companyName?: string }): Promise<void> {
		await this.ensureCloverSessionsInitialized()
		const service = this.getCloverSessionService()
		if (!service) {
			return
		}
		const context = options ?? this.getActiveCompanyContext()
		const welcomeMessage = createCloverWelcomeMessage()
		welcomeMessage.tokens = await this.estimateCloverTokenCount(welcomeMessage.text)
		const session = await service.createSession({
			companyId: context.companyId,
			companyName: context.companyName,
			initialMessages: [welcomeMessage],
		})
		const summary = service.toSummary(session)
		const state = this.ensureOuterGateState()
		const mergedEntries = this.mergeCloverSessionEntries(state.cloverSessions.entries, [summary], false)
		const nextState: OuterGateState = {
			...state,
			activeCloverSessionId: session.id,
			cloverMessages: session.messages.map((message) => ({ ...message })),
			isCloverProcessing: false,
			cloverSessions: {
				...state.cloverSessions,
				entries: mergedEntries,
				hasMore: state.cloverSessions.hasMore,
				cursor: state.cloverSessions.cursor,
				isInitialFetchComplete: true,
			},
		}
		this.updateOuterGateState(nextState)
		await service.setActiveSessionId(session.id)
		await this.postStateToWebview()
	}

	public async activateCloverSession(sessionId: string): Promise<void> {
		await this.ensureCloverSessionsInitialized()
		const service = this.getCloverSessionService()
		if (!service) {
			return
		}
		const session = service.getSession(sessionId)
		if (!session) {
			return
		}
		const summary = service.toSummary(session)
		const state = this.ensureOuterGateState()
		const mergedEntries = this.mergeCloverSessionEntries(state.cloverSessions.entries, [summary], false)
		await service.setActiveSessionId(sessionId)
		this.updateOuterGateState({
			...state,
			activeCloverSessionId: sessionId,
			cloverMessages: session.messages.map((message) => ({ ...message })),
			isCloverProcessing: false,
			cloverSessions: {
				...state.cloverSessions,
				entries: mergedEntries,
				hasMore: state.cloverSessions.hasMore,
				cursor: state.cloverSessions.cursor,
				isInitialFetchComplete: true,
			},
		})
		await this.postStateToWebview()
	}

	public async loadMoreCloverSessions(cursor?: string, limit?: number): Promise<void> {
		await this.ensureCloverSessionsInitialized()
		const state = this.ensureOuterGateState()
		const nextCursor = cursor ?? state.cloverSessions.cursor
		if (!nextCursor && state.cloverSessions.entries.length > 0 && !state.cloverSessions.hasMore) {
			return
		}
		await this.refreshCloverSessions({ cursor: nextCursor, append: true, limit, syncActiveSession: false })
		await this.postStateToWebview()
	}

	public async generateOuterGatePassionMap(): Promise<void> {
		await this.ensureCloverSessionsInitialized()
		const requestIso = new Date().toISOString()
		const initialState = this.ensureOuterGateState()
		this.updateOuterGateState({
			...initialState,
			passionMap: {
				...initialState.passionMap,
				status: "loading",
				lastRequestedIso: requestIso,
				error: undefined,
			},
		})
		await this.postStateToWebview()

		try {
			const service = this.getCloverSessionService()
			if (!service) {
				throw new Error("Pool analysis service is not configured yet.")
			}

			const analysis = await service.fetchAnalysisItems({ limit: 250 })
			const { points, clusters, summary } = buildSimplePassionMap(analysis.items)
			const refreshedState = this.ensureOuterGateState()
			const statusCounts = countAnalysisStatuses(analysis.items)
			const generatedIso = analysis.generatedAt ?? new Date().toISOString()
			const totalCaptured =
				typeof analysis.totalItems === "number"
					? analysis.totalItems
					: statusCounts.ready + statusCounts.processing + statusCounts.captured

			this.updateOuterGateState({
				...refreshedState,
				analysisPool: {
					...refreshedState.analysisPool,
					totalCaptured,
					processing: statusCounts.processing,
					ready: statusCounts.ready,
					lastUpdatedIso: generatedIso,
				},
				passionMap: {
					status: "ready",
					points,
					clusters,
					summary,
					generatedAtIso: generatedIso,
					lastRequestedIso: requestIso,
					error: undefined,
				},
			})
		} catch (error) {
			const refreshedState = this.ensureOuterGateState()
			let message = "Unable to generate the passion map right now."
			if (axios.isAxiosError(error)) {
				const status = error.response?.status
				if (status) {
					message = `Passion map request failed with status ${status}. Check your POOL_API_URL configuration and try again.`
				} else if (error.message) {
					message = error.message
				}
			} else if (error instanceof Error && error.message) {
				message = error.message
			}

			this.updateOuterGateState({
				...refreshedState,
				passionMap: {
					...refreshedState.passionMap,
					status: "error",
					error: message,
					lastRequestedIso: requestIso,
				},
			})
		}

		await this.postStateToWebview()
	}

	private buildOuterGatePrompt(latestUserMessage: string): string {
		const state = this.ensureOuterGateState()
		const analysis = state.analysisPool
		const recentInsights = state.recentInsights.slice(0, 5)
		const conversation = state.cloverMessages
			.slice(-10)
			.map((message) => {
				const speaker = message.speaker === "clover" ? "Clover" : "User"
				return `${speaker}: ${message.text}`
			})
			.join("\n")
		const insightSummary =
			recentInsights.length > 0
				? recentInsights
						.map(
							(insight) =>
								`- ${insight.title}${insight.recommendedWorkspace ? ` → ${insight.recommendedWorkspace}` : ""} (${insight.stage})`,
						)
						.join("\n")
				: "- No recent insights captured yet."

		return `${CLOVER_SYSTEM_PROMPT.trim()}

Analysis Pool:
- Captured: ${analysis.totalCaptured}
- Processing: ${analysis.processing}
- Ready: ${analysis.ready}
- Assigned this week: ${analysis.assignedThisWeek}

Recent Insights:
${insightSummary}

Conversation So Far:
${conversation ? `${conversation}\n` : ""}User: ${latestUserMessage}
Clover:`
	}

	private async estimateCloverTokenCount(text: string): Promise<number | undefined> {
		if (!text || text.trim().length === 0) {
			return undefined
		}
		try {
			const blocks: Anthropic.Messages.ContentBlockParam[] = [{ type: "text", text }]
			return await countTokens(blocks)
		} catch (error) {
			console.warn("[ClineProvider] Failed to estimate Clover token count", error)
			return undefined
		}
	}

	private async generateOuterGateResponse(latestUserMessage: string): Promise<string> {
		const { apiConfiguration } = await this.getState()
		if (!apiConfiguration || Object.keys(apiConfiguration).length === 0) {
			throw new Error(
				"No language model configuration is available. Configure a provider in API settings to chat with Clover.",
			)
		}
		const prompt = this.buildOuterGatePrompt(latestUserMessage)
		const response = await singleCompletionHandler(apiConfiguration, prompt)
		return response.trim()
	}

	public async handleOuterGateMessage(text: string, clientMessageId?: string): Promise<void> {
		const trimmed = text.trim()
		if (!trimmed) {
			return
		}

		const sessionId = await this.ensureActiveCloverSession()
		const service = this.getCloverSessionService()
		const baseState = this.ensureOuterGateState()
		const nowIso = new Date().toISOString()
		const messageId = clientMessageId ?? randomUUID()
		const userTokens = await this.estimateCloverTokenCount(trimmed)

		const userMessage: OuterGateCloverMessage = {
			id: messageId,
			speaker: "user",
			text: trimmed,
			timestamp: nowIso,
			tokens: userTokens,
		}

		const hasMessage = baseState.cloverMessages.some((message) => message.id === messageId)
		const nextMessages = hasMessage ? [...baseState.cloverMessages] : [...baseState.cloverMessages, userMessage]

		const recommendedWorkspace = this.getActiveWorkspaceName()
		const newInsightId = messageId
		const newInsight = {
			id: newInsightId,
			title: trimmed.length > 90 ? `${trimmed.slice(0, 87)}…` : trimmed,
			sourceType: "conversation" as const,
			stage: "processing" as const,
			recommendedWorkspace,
			capturedAtIso: nowIso,
			assignedCompanyId: recommendedWorkspace,
		}

		let updatedState: OuterGateState = {
			...baseState,
			analysisPool: {
				...baseState.analysisPool,
				totalCaptured: baseState.analysisPool.totalCaptured + 1,
				processing: baseState.analysisPool.processing + 1,
				lastUpdatedIso: nowIso,
			},
			recentInsights: [newInsight, ...baseState.recentInsights.filter((insight) => insight.id !== newInsightId)],
			cloverMessages: nextMessages,
			isCloverProcessing: true,
		}

		if (!hasMessage && sessionId && service) {
			const session = await service.appendMessages(sessionId, [userMessage], this.getActiveCompanyContext())
			const summary = service.toSummary(session)
			updatedState = {
				...updatedState,
				cloverSessions: {
					...updatedState.cloverSessions,
					entries: this.mergeCloverSessionEntries(updatedState.cloverSessions.entries, [summary], false),
					hasMore: updatedState.cloverSessions.hasMore,
					cursor: updatedState.cloverSessions.cursor,
					isInitialFetchComplete: true,
				},
			}
		}

		this.updateOuterGateState(updatedState)
		await this.postStateToWebview()

		try {
			const assistantReply = await this.generateOuterGateResponse(trimmed)
			const assistantTokens = await this.estimateCloverTokenCount(assistantReply)
			const replyMessage: OuterGateCloverMessage = {
				id: randomUUID(),
				speaker: "clover",
				text: assistantReply,
				timestamp: new Date().toISOString(),
				tokens: assistantTokens,
			}

			const readyState = this.ensureOuterGateState()
			const summaryText = assistantReply.split("\n").find((line) => line.trim().length > 0) ?? assistantReply
			const responseInsights = readyState.recentInsights.map((insight) =>
				insight.id === newInsightId
					? {
							...insight,
							stage: "ready" as const,
							summary: summaryText.length > 280 ? `${summaryText.slice(0, 277)}…` : summaryText,
						}
					: insight,
			)

			let stateWithReply: OuterGateState = {
				...readyState,
				analysisPool: {
					...readyState.analysisPool,
					processing: Math.max(0, readyState.analysisPool.processing - 1),
					ready: readyState.analysisPool.ready + 1,
					lastUpdatedIso: replyMessage.timestamp,
				},
				recentInsights: responseInsights,
				cloverMessages: [...readyState.cloverMessages, replyMessage],
				isCloverProcessing: false,
			}

			if (sessionId && service) {
				const session = await service.appendMessages(sessionId, [replyMessage])
				const summary = service.toSummary(session)
				stateWithReply = {
					...stateWithReply,
					cloverSessions: {
						...stateWithReply.cloverSessions,
						entries: this.mergeCloverSessionEntries(
							stateWithReply.cloverSessions.entries,
							[summary],
							false,
						),
						hasMore: stateWithReply.cloverSessions.hasMore,
						cursor: stateWithReply.cloverSessions.cursor,
						isInitialFetchComplete: true,
					},
				}
			}

			this.updateOuterGateState(stateWithReply)
		} catch (error) {
			console.error("[ClineProvider] Clover response failed", error)
			const fallbackMessage =
				error instanceof Error
					? error.message
					: "I hit a snag reaching the concierge model. Double-check your AI provider configuration and try again."
			const readyState = this.ensureOuterGateState()
			const errorTokens = await this.estimateCloverTokenCount(fallbackMessage)
			const errorReply: OuterGateCloverMessage = {
				id: randomUUID(),
				speaker: "clover",
				text: fallbackMessage,
				timestamp: new Date().toISOString(),
				tokens: errorTokens,
			}

			let stateWithError: OuterGateState = {
				...readyState,
				analysisPool: {
					...readyState.analysisPool,
					processing: Math.max(0, readyState.analysisPool.processing - 1),
					lastUpdatedIso: errorReply.timestamp,
				},
				recentInsights: readyState.recentInsights.map((insight) =>
					insight.id === newInsightId ? { ...insight, stage: "captured" as const } : insight,
				),
				cloverMessages: [...readyState.cloverMessages, errorReply],
				isCloverProcessing: false,
			}

			if (sessionId && service) {
				const session = await service.appendMessages(sessionId, [errorReply])
				const summary = service.toSummary(session)
				stateWithError = {
					...stateWithError,
					cloverSessions: {
						...stateWithError.cloverSessions,
						entries: this.mergeCloverSessionEntries(
							stateWithError.cloverSessions.entries,
							[summary],
							false,
						),
						hasMore: stateWithError.cloverSessions.hasMore,
						cursor: stateWithError.cloverSessions.cursor,
						isInitialFetchComplete: true,
					},
				}
			}

			this.updateOuterGateState(stateWithError)
		}

		await this.postStateToWebview()
	}

	async postStateToWebview() {
		try {
			const state = await this.getStateToPostToWebview()
			verboseProviderLog("postStateToWebview", {
				activeCompanyId: state.workplaceState?.activeCompanyId,
				activeEmployeeId: state.workplaceState?.activeEmployeeId,
				companyCount: state.workplaceState?.companies?.length ?? 0,
			})
			this.postMessageToWebview({ type: "state", state })
		} catch (error) {
			console.error("[ClineProvider.postStateToWebview] failed to send state", error)
		}

		// Check MDM compliance and send user to account tab if not compliant
		// Only redirect if there's an actual MDM policy requiring authentication
		if (this.mdmService?.requiresCloudAuth() && !this.checkMdmCompliance()) {
			await this.postMessageToWebview({ type: "action", action: "cloudButtonClicked" })
		}
	}

	public async handleWorkdayStatusChange(companyId: string, state?: WorkplaceState): Promise<void> {
		void companyId
		void state
	}

	// kilocode_change start
	async postRulesDataToWebview() {
		const workspacePath = this.cwd
		if (workspacePath) {
			this.postMessageToWebview({
				type: "rulesData",
				...(await getEnabledRules(workspacePath, this.contextProxy, this.context)),
			})
		}
	}
	// kilocode_change end

	/**
	 * Fetches marketplace dataon demand to avoid blocking main state updates
	 */
	async fetchMarketplaceData() {
		try {
			const [marketplaceResult, marketplaceInstalledMetadata] = await Promise.all([
				this.marketplaceManager.getMarketplaceItems().catch((error) => {
					console.error("Failed to fetch marketplace items:", error)
					return { organizationMcps: [], marketplaceItems: [], errors: [error.message] }
				}),
				this.marketplaceManager.getInstallationMetadata().catch((error) => {
					console.error("Failed to fetch installation metadata:", error)
					return { project: {}, global: {} } as MarketplaceInstalledMetadata
				}),
			])

			// Send marketplace data separately
			this.postMessageToWebview({
				type: "marketplaceData",
				organizationMcps: marketplaceResult.organizationMcps || [],
				marketplaceItems: marketplaceResult.marketplaceItems || [],
				marketplaceInstalledMetadata: marketplaceInstalledMetadata || { project: {}, global: {} },
				errors: marketplaceResult.errors,
			})
		} catch (error) {
			console.error("Failed to fetch marketplace data:", error)

			// Send empty data on error to prevent UI from hanging
			this.postMessageToWebview({
				type: "marketplaceData",
				organizationMcps: [],
				marketplaceItems: [],
				marketplaceInstalledMetadata: { project: {}, global: {} },
				errors: [error instanceof Error ? error.message : String(error)],
			})

			// Show user-friendly error notification for network issues
			if (error instanceof Error && error.message.includes("timeout")) {
				vscode.window.showWarningMessage(
					"Marketplace data could not be loaded due to network restrictions. Core functionality remains available.",
				)
			}
		}
	}

	/**
	 * Checks if there is a file-based system prompt override for the given mode
	 */
	async hasFileBasedSystemPromptOverride(mode: Mode): Promise<boolean> {
		const promptFilePath = getSystemPromptFilePath(this.cwd, mode)
		return await fileExistsAtPath(promptFilePath)
	}

	/**
	 * Merges allowed commands from global state and workspace configuration
	 * with proper validation and deduplication
	 */
	private mergeAllowedCommands(globalStateCommands?: string[]): string[] {
		return this.mergeCommandLists("allowedCommands", "allowed", globalStateCommands)
	}

	/**
	 * Merges denied commands from global state and workspace configuration
	 * with proper validation and deduplication
	 */
	private mergeDeniedCommands(globalStateCommands?: string[]): string[] {
		return this.mergeCommandLists("deniedCommands", "denied", globalStateCommands)
	}

	/**
	 * Common utility for merging command lists from global state and workspace configuration.
	 * Implements the Command Denylist feature's merging strategy with proper validation.
	 *
	 * @param configKey - VSCode workspace configuration key
	 * @param commandType - Type of commands for error logging
	 * @param globalStateCommands - Commands from global state
	 * @returns Merged and deduplicated command list
	 */
	private mergeCommandLists(
		configKey: "allowedCommands" | "deniedCommands",
		commandType: "allowed" | "denied",
		globalStateCommands?: string[],
	): string[] {
		try {
			// Validate and sanitize global state commands
			const validGlobalCommands = Array.isArray(globalStateCommands)
				? globalStateCommands.filter((cmd) => typeof cmd === "string" && cmd.trim().length > 0)
				: []

			// Get workspace configuration commands
			const workspaceCommands = vscode.workspace.getConfiguration(Package.name).get<string[]>(configKey) || []

			// Validate and sanitize workspace commands
			const validWorkspaceCommands = Array.isArray(workspaceCommands)
				? workspaceCommands.filter((cmd) => typeof cmd === "string" && cmd.trim().length > 0)
				: []

			// Combine and deduplicate commands
			// Global state takes precedence over workspace configuration
			const mergedCommands = [...new Set([...validGlobalCommands, ...validWorkspaceCommands])]

			return mergedCommands
		} catch (error) {
			console.error(`Error merging ${commandType} commands:`, error)
			// Return empty array as fallback to prevent crashes
			return []
		}
	}

	private async getEndlessSurfaceViewState(): Promise<EndlessSurfaceViewState | undefined> {
		const service = this.getEndlessSurfaceService()
		if (!service) {
			return undefined
		}

		const state = service.getState()
		const activeSurfaceId = state.activeSurfaceId
		const activeSurface = activeSurfaceId ? await service.getSurfaceData(activeSurfaceId) : undefined

		return {
			...state,
			activeSurface,
		}
	}

	async getStateToPostToWebview(): Promise<ExtensionState> {
		await this.ensureCloverSessionsInitialized()
		const state = await this.getState()
		const endlessSurfaceViewState = await this.getEndlessSurfaceViewState()
		const {
			apiConfiguration,
			customInstructions,
			alwaysAllowReadOnly,
			alwaysAllowReadOnlyOutsideWorkspace,
			alwaysAllowWrite,
			alwaysAllowWriteOutsideWorkspace,
			alwaysAllowWriteProtected,
			alwaysAllowExecute,
			allowedCommands,
			deniedCommands,
			alwaysAllowBrowser,
			alwaysAllowMcp,
			alwaysAllowModeSwitch,
			alwaysAllowSubtasks,
			alwaysAllowUpdateTodoList,
			allowedMaxRequests,
			allowedMaxCost,
			autoCondenseContext,
			autoCondenseContextPercent,
			soundEnabled,
			ttsEnabled,
			ttsSpeed,
			diffEnabled,
			enableCheckpoints,
			taskHistory,
			soundVolume,
			browserViewportSize,
			screenshotQuality,
			remoteBrowserHost,
			remoteBrowserEnabled,
			cachedChromeHostUrl,
			writeDelayMs,
			terminalOutputLineLimit,
			terminalOutputCharacterLimit,
			terminalShellIntegrationTimeout,
			terminalShellIntegrationDisabled,
			terminalCommandDelay,
			terminalPowershellCounter,
			terminalZshClearEolMark,
			terminalZshOhMy,
			terminalZshP10k,
			terminalZdotdir,
			fuzzyMatchThreshold,
			// mcpEnabled,  // kilocode_change: always true
			enableMcpServerCreation,
			alwaysApproveResubmit,
			requestDelaySeconds,
			currentApiConfigName,
			listApiConfigMeta,
			pinnedApiConfigs,
			mode,
			customModePrompts,
			customSupportPrompts,
			enhancementApiConfigId,
			commitMessageApiConfigId, // kilocode_change
			terminalCommandApiConfigId, // kilocode_change
			autoApprovalEnabled,
			customModes,
			experiments,
			maxOpenTabsContext,
			maxWorkspaceFiles,
			browserToolEnabled,
			browserInteractionStrategy,
			telemetrySetting,
			showRooIgnoredFiles,
			language,
			showAutoApproveMenu, // kilocode_change
			showTaskTimeline, // kilocode_change
			maxReadFileLine,
			maxImageFileSize,
			maxTotalImageSize,
			terminalCompressProgressBar,
			historyPreviewCollapsed,
			cloudUserInfo,
			cloudIsAuthenticated,
			sharingEnabled,
			organizationAllowList,
			organizationSettingsVersion,
			maxConcurrentFileReads,
			allowVeryLargeReads, // kilocode_change
			ghostServiceSettings, // kilocode_changes
			condensingApiConfigId,
			customCondensingPrompt,
			codebaseIndexConfig,
			codebaseIndexModels,
			profileThresholds,
			systemNotificationsEnabled, // kilocode_change
			dismissedNotificationIds, // kilocode_change
			morphApiKey, // kilocode_change
			alwaysAllowFollowupQuestions,
			followupAutoApproveTimeoutMs,
			includeDiagnosticMessages,
			maxDiagnosticMessages,
			includeTaskHistoryInEnhance,
			remoteControlEnabled,
			openRouterImageApiKey,
			kiloCodeImageApiKey,
			openRouterImageGenerationSelectedModel,
			notificationEmail,
			notificationSmsNumber,
			notificationSmsGateway,
			notificationTelegramChatId,
			openRouterUseMiddleOutTransform,
		} = state

		verboseProviderLog("getStateToPostToWebview", {
			renderContext: this.renderContext,
			activeCompanyId: state.workplaceState?.activeCompanyId,
			activeEmployeeId: state.workplaceState?.activeEmployeeId,
			companyCount: state.workplaceState?.companies?.length ?? 0,
			companyNames: state.workplaceState?.companies?.map((entry) => entry.name) ?? [],
		})
		const telemetryKey = process.env.KILOCODE_POSTHOG_API_KEY
		const machineId = vscode.env.machineId

		const mergedAllowedCommands = this.mergeAllowedCommands(allowedCommands)
		const mergedDeniedCommands = this.mergeDeniedCommands(deniedCommands)
		const cwd = this.cwd

		// Check if there's a system prompt override for the current mode
		const currentMode = mode ?? defaultModeSlug
		const hasSystemPromptOverride = await this.hasFileBasedSystemPromptOverride(currentMode)

		// kilocode_change start wrapper information
		const kiloCodeWrapperProperties = getKiloCodeWrapperProperties()
		// kilocode_change end

		const workplaceService = this.getWorkplaceService()
		const workplaceStateSnapshot = workplaceService?.getState()
		const companyNames = workplaceStateSnapshot?.companies?.map((company) => company.name) ?? []
		verboseProviderLog("getState", {
			renderContext: this.renderContext,
			hasWorkplace: Boolean(workplaceService),
			companyCount: workplaceStateSnapshot?.companies?.length ?? 0,
			companyNames,
		})
		return {
			version: this.context.extension?.packageJSON?.version ?? "",
			apiConfiguration,
			customInstructions,
			alwaysAllowReadOnly: alwaysAllowReadOnly ?? true,
			alwaysAllowReadOnlyOutsideWorkspace: alwaysAllowReadOnlyOutsideWorkspace ?? true,
			alwaysAllowWrite: alwaysAllowWrite ?? true,
			alwaysAllowWriteOutsideWorkspace: alwaysAllowWriteOutsideWorkspace ?? false,
			alwaysAllowWriteProtected: alwaysAllowWriteProtected ?? false,
			alwaysAllowExecute: alwaysAllowExecute ?? true,
			alwaysAllowBrowser: alwaysAllowBrowser ?? true,
			alwaysAllowMcp: alwaysAllowMcp ?? true,
			alwaysAllowModeSwitch: alwaysAllowModeSwitch ?? true,
			alwaysAllowSubtasks: alwaysAllowSubtasks ?? true,
			alwaysAllowUpdateTodoList: alwaysAllowUpdateTodoList ?? true,
			allowedMaxRequests,
			allowedMaxCost,
			autoCondenseContext: autoCondenseContext ?? true,
			autoCondenseContextPercent: autoCondenseContextPercent ?? 100,
			uriScheme: vscode.env.uriScheme,
			uiKind: vscode.UIKind[vscode.env.uiKind], // kilocode_change
			kiloCodeWrapperProperties, // kilocode_change wrapper information
			kilocodeDefaultModel: await getKilocodeDefaultModel(
				apiConfiguration.kilocodeToken,
				apiConfiguration.kilocodeOrganizationId,
			),
			currentTaskItem: this.getCurrentTask()?.taskId
				? (taskHistory || []).find((item: HistoryItem) => item.id === this.getCurrentTask()?.taskId)
				: undefined,
			clineMessages: this.getCurrentTask()?.clineMessages || [],
			currentTaskTodos: this.getCurrentTask()?.todoList || [],
			messageQueue: this.getCurrentTask()?.messageQueueService?.messages,
			conversationHoldState: this.getCurrentTask()?.currentConversationHoldState,
			conversationAgents: this.getCurrentTask()?.currentConversationAgents ?? [],
			lastOrchestratorAnalysis: this.getCurrentTask()?.currentOrchestratorAnalysis,
			taskHistory: (taskHistory || [])
				.filter((item: HistoryItem) => item.ts && item.task)
				.sort((a: HistoryItem, b: HistoryItem) => b.ts - a.ts),
			soundEnabled: soundEnabled ?? false,
			ttsEnabled: ttsEnabled ?? false,
			ttsSpeed: ttsSpeed ?? 1.0,
			diffEnabled: diffEnabled ?? true,
			enableCheckpoints: enableCheckpoints ?? true,
			shouldShowAnnouncement: false, // kilocode_change
			allowedCommands: mergedAllowedCommands,
			deniedCommands: mergedDeniedCommands,
			soundVolume: soundVolume ?? 0.5,
			browserViewportSize: browserViewportSize ?? "900x600",
			screenshotQuality: screenshotQuality ?? 75,
			remoteBrowserHost,
			remoteBrowserEnabled: remoteBrowserEnabled ?? false,
			cachedChromeHostUrl: cachedChromeHostUrl,
			writeDelayMs: writeDelayMs ?? DEFAULT_WRITE_DELAY_MS,
			terminalOutputLineLimit: terminalOutputLineLimit ?? 500,
			terminalOutputCharacterLimit: terminalOutputCharacterLimit ?? DEFAULT_TERMINAL_OUTPUT_CHARACTER_LIMIT,
			terminalShellIntegrationTimeout: terminalShellIntegrationTimeout ?? Terminal.defaultShellIntegrationTimeout,
			terminalShellIntegrationDisabled: terminalShellIntegrationDisabled ?? true, // kilocode_change: default
			terminalCommandDelay: terminalCommandDelay ?? 0,
			terminalPowershellCounter: terminalPowershellCounter ?? false,
			terminalZshClearEolMark: terminalZshClearEolMark ?? true,
			terminalZshOhMy: terminalZshOhMy ?? false,
			terminalZshP10k: terminalZshP10k ?? false,
			terminalZdotdir: terminalZdotdir ?? false,
			fuzzyMatchThreshold: fuzzyMatchThreshold ?? 1.0,
			mcpEnabled: true, // kilocode_change: always true
			enableMcpServerCreation: enableMcpServerCreation ?? true,
			alwaysApproveResubmit: alwaysApproveResubmit ?? false,
			requestDelaySeconds: requestDelaySeconds ?? 10,
			currentApiConfigName: currentApiConfigName ?? "default",
			listApiConfigMeta: listApiConfigMeta ?? [],
			pinnedApiConfigs: pinnedApiConfigs ?? {},
			mode: mode ?? defaultModeSlug,
			customModePrompts: customModePrompts ?? {},
			customSupportPrompts: customSupportPrompts ?? {},
			enhancementApiConfigId,
			commitMessageApiConfigId, // kilocode_change
			terminalCommandApiConfigId, // kilocode_change
			autoApprovalEnabled: autoApprovalEnabled ?? true,
			customModes,
			experiments: experiments ?? experimentDefault,
			mcpServers: this.mcpHub?.getAllServers() ?? [],
			maxOpenTabsContext: maxOpenTabsContext ?? 20,
			maxWorkspaceFiles: maxWorkspaceFiles ?? 200,
			cwd,
			browserToolEnabled: browserToolEnabled ?? true,
			browserInteractionStrategy:
				(browserInteractionStrategy as BrowserInteractionStrategy | undefined) ?? "legacy",
			telemetrySetting,
			telemetryKey,
			machineId,
			showRooIgnoredFiles: showRooIgnoredFiles ?? false,
			showAutoApproveMenu: showAutoApproveMenu ?? false, // kilocode_change
			showTaskTimeline: showTaskTimeline ?? true, // kilocode_change
			language, // kilocode_change
			renderContext: this.renderContext,
			maxReadFileLine: maxReadFileLine ?? -1,
			maxImageFileSize: maxImageFileSize ?? 5,
			maxTotalImageSize: maxTotalImageSize ?? 20,
			maxConcurrentFileReads: maxConcurrentFileReads ?? 5,
			allowVeryLargeReads: allowVeryLargeReads ?? false, // kilocode_change
			settingsImportedAt: this.settingsImportedAt,
			terminalCompressProgressBar: terminalCompressProgressBar ?? true,
			hasSystemPromptOverride,
			historyPreviewCollapsed: historyPreviewCollapsed ?? false,
			cloudUserInfo,
			cloudIsAuthenticated: cloudIsAuthenticated ?? false,
			sharingEnabled: sharingEnabled ?? false,
			organizationAllowList,
			// kilocode_change start
			ghostServiceSettings: ghostServiceSettings ?? {
				enableQuickInlineTaskKeybinding: true,
				enableSmartInlineTaskKeybinding: true,
			},
			// kilocode_change end
			organizationSettingsVersion,
			condensingApiConfigId,
			customCondensingPrompt,
			codebaseIndexModels: codebaseIndexModels ?? EMBEDDING_MODEL_PROFILES,
			codebaseIndexConfig: {
				codebaseIndexEnabled: codebaseIndexConfig?.codebaseIndexEnabled ?? true,
				codebaseIndexQdrantUrl: codebaseIndexConfig?.codebaseIndexQdrantUrl ?? "http://localhost:6333",
				codebaseIndexEmbedderProvider: codebaseIndexConfig?.codebaseIndexEmbedderProvider ?? "openai",
				codebaseIndexEmbedderBaseUrl: codebaseIndexConfig?.codebaseIndexEmbedderBaseUrl ?? "",
				codebaseIndexEmbedderModelId: codebaseIndexConfig?.codebaseIndexEmbedderModelId ?? "",
				codebaseIndexEmbedderModelDimension: codebaseIndexConfig?.codebaseIndexEmbedderModelDimension ?? 1536,
				codebaseIndexOpenAiCompatibleBaseUrl: codebaseIndexConfig?.codebaseIndexOpenAiCompatibleBaseUrl,
				codebaseIndexSearchMaxResults: codebaseIndexConfig?.codebaseIndexSearchMaxResults,
				codebaseIndexSearchMinScore: codebaseIndexConfig?.codebaseIndexSearchMinScore,
			},
			// Only set mdmCompliant if there's an actual MDM policy
			// undefined means no MDM policy, true means compliant, false means non-compliant
			mdmCompliant: this.mdmService?.requiresCloudAuth() ? this.checkMdmCompliance() : undefined,
			profileThresholds: profileThresholds ?? {},
			cloudApiUrl: getRooCodeApiUrl(),
			hasOpenedModeSelector: this.getGlobalState("hasOpenedModeSelector") ?? false,
			systemNotificationsEnabled: systemNotificationsEnabled ?? false, // kilocode_change
			dismissedNotificationIds: dismissedNotificationIds ?? [], // kilocode_change
			morphApiKey, // kilocode_change
			alwaysAllowFollowupQuestions: alwaysAllowFollowupQuestions ?? false,
			followupAutoApproveTimeoutMs: followupAutoApproveTimeoutMs ?? 60000,
			includeDiagnosticMessages: includeDiagnosticMessages ?? true,
			maxDiagnosticMessages: maxDiagnosticMessages ?? 50,
			includeTaskHistoryInEnhance: includeTaskHistoryInEnhance ?? true,
			remoteControlEnabled,
			openRouterImageApiKey,
			kiloCodeImageApiKey,
			openRouterImageGenerationSelectedModel,
			notificationEmail,
			notificationSmsNumber,
			notificationSmsGateway,
			openRouterUseMiddleOutTransform,
			endlessSurface: endlessSurfaceViewState,
			workplaceState: workplaceStateSnapshot ?? { companies: [] },
			workplaceRootConfigured: this.workplaceFilesystemManager?.isConfigured() ?? false,
			workplaceRootUri: this.workplaceFilesystemManager?.getRootUri()?.fsPath,
			outerGateState: this.getOuterGateStateSnapshot(),
		}
	}

	/**
	 * Storage
	 * https://dev.to/kompotkot/how-to-use-secretstorage-in-your-vscode-extensions-2hco
	 * https://www.eliostruyf.com/devhack-code-extension-storage-options/
	 */

	async getState(): Promise<
		Omit<
			ExtensionState,
			| "clineMessages"
			| "renderContext"
			| "hasOpenedModeSelector"
			| "version"
			| "shouldShowAnnouncement"
			| "hasSystemPromptOverride"
		>
	> {
		const stateValues = this.contextProxy.getValues()
		const customModes = await this.customModesManager.getCustomModes()
		const workplaceStateSnapshot = this.getWorkplaceService()?.getState()

		// Determine apiProvider with the same logic as before.
		const apiProvider: ProviderName = stateValues.apiProvider ? stateValues.apiProvider : "kilocode" // kilocode_change: fall back to kilocode

		// Build the apiConfiguration object combining state values and secrets.
		const providerSettings = this.contextProxy.getProviderSettings()

		// Ensure apiProvider is set properly if not already in state
		if (!providerSettings.apiProvider) {
			providerSettings.apiProvider = apiProvider
		}

		let organizationAllowList = ORGANIZATION_ALLOW_ALL

		try {
			organizationAllowList = await CloudService.instance.getAllowList()
		} catch (error) {
			console.error(
				`[getState] failed to get organization allow list: ${error instanceof Error ? error.message : String(error)}`,
			)
		}

		let cloudUserInfo: CloudUserInfo | null = null

		try {
			cloudUserInfo = CloudService.instance.getUserInfo()
		} catch (error) {
			console.error(
				`[getState] failed to get cloud user info: ${error instanceof Error ? error.message : String(error)}`,
			)
		}

		let cloudIsAuthenticated: boolean = false

		try {
			cloudIsAuthenticated = CloudService.instance.isAuthenticated()
		} catch (error) {
			console.error(
				`[getState] failed to get cloud authentication state: ${error instanceof Error ? error.message : String(error)}`,
			)
		}

		let sharingEnabled: boolean = false

		try {
			sharingEnabled = await CloudService.instance.canShareTask()
		} catch (error) {
			console.error(
				`[getState] failed to get sharing enabled state: ${error instanceof Error ? error.message : String(error)}`,
			)
		}

		let organizationSettingsVersion: number = -1

		try {
			if (CloudService.hasInstance()) {
				const settings = CloudService.instance.getOrganizationSettings()
				organizationSettingsVersion = settings?.version ?? -1
			}
		} catch (error) {
			console.error(
				`[getState] failed to get organization settings version: ${error instanceof Error ? error.message : String(error)}`,
			)
		}

		// Build the same structure as before.
		const result = {
			apiConfiguration: providerSettings,
			kilocodeDefaultModel: await getKilocodeDefaultModel(
				providerSettings.kilocodeToken,
				providerSettings.kilocodeOrganizationId,
			), // kilocode_change
			lastShownAnnouncementId: stateValues.lastShownAnnouncementId,
			customInstructions: stateValues.customInstructions,
			apiModelId: stateValues.apiModelId,
			alwaysAllowReadOnly: stateValues.alwaysAllowReadOnly ?? true,
			alwaysAllowReadOnlyOutsideWorkspace: stateValues.alwaysAllowReadOnlyOutsideWorkspace ?? true,
			alwaysAllowWrite: stateValues.alwaysAllowWrite ?? true,
			alwaysAllowWriteOutsideWorkspace: stateValues.alwaysAllowWriteOutsideWorkspace ?? false,
			alwaysAllowWriteProtected: stateValues.alwaysAllowWriteProtected ?? false,
			alwaysAllowExecute: stateValues.alwaysAllowExecute ?? true,
			alwaysAllowBrowser: stateValues.alwaysAllowBrowser ?? true,
			alwaysAllowMcp: stateValues.alwaysAllowMcp ?? true,
			alwaysAllowModeSwitch: stateValues.alwaysAllowModeSwitch ?? true,
			alwaysAllowSubtasks: stateValues.alwaysAllowSubtasks ?? true,
			alwaysAllowFollowupQuestions: stateValues.alwaysAllowFollowupQuestions ?? false,
			alwaysAllowUpdateTodoList: stateValues.alwaysAllowUpdateTodoList ?? true, // kilocode_change
			followupAutoApproveTimeoutMs: stateValues.followupAutoApproveTimeoutMs ?? 60000,
			diagnosticsEnabled: stateValues.diagnosticsEnabled ?? true,
			allowedMaxRequests: stateValues.allowedMaxRequests,
			allowedMaxCost: stateValues.allowedMaxCost,
			autoCondenseContext: stateValues.autoCondenseContext ?? true,
			autoCondenseContextPercent: stateValues.autoCondenseContextPercent ?? 100,
			taskHistory: stateValues.taskHistory ?? [],
			allowedCommands: stateValues.allowedCommands,
			deniedCommands: stateValues.deniedCommands,
			soundEnabled: stateValues.soundEnabled ?? false,
			ttsEnabled: stateValues.ttsEnabled ?? false,
			ttsSpeed: stateValues.ttsSpeed ?? 1.0,
			diffEnabled: stateValues.diffEnabled ?? true,
			enableCheckpoints: stateValues.enableCheckpoints ?? true,
			soundVolume: stateValues.soundVolume,
			browserViewportSize: stateValues.browserViewportSize ?? "900x600",
			screenshotQuality: stateValues.screenshotQuality ?? 75,
			remoteBrowserHost: stateValues.remoteBrowserHost,
			remoteBrowserEnabled: stateValues.remoteBrowserEnabled ?? true,
			cachedChromeHostUrl: stateValues.cachedChromeHostUrl as string | undefined,
			fuzzyMatchThreshold: stateValues.fuzzyMatchThreshold ?? 1.0,
			writeDelayMs: stateValues.writeDelayMs ?? DEFAULT_WRITE_DELAY_MS,
			terminalOutputLineLimit: stateValues.terminalOutputLineLimit ?? 500,
			terminalOutputCharacterLimit:
				stateValues.terminalOutputCharacterLimit ?? DEFAULT_TERMINAL_OUTPUT_CHARACTER_LIMIT,
			terminalShellIntegrationTimeout:
				stateValues.terminalShellIntegrationTimeout ?? Terminal.defaultShellIntegrationTimeout,
			terminalShellIntegrationDisabled: stateValues.terminalShellIntegrationDisabled ?? true, // kilocode_change: default
			terminalCommandDelay: stateValues.terminalCommandDelay ?? 0,
			terminalPowershellCounter: stateValues.terminalPowershellCounter ?? false,
			terminalZshClearEolMark: stateValues.terminalZshClearEolMark ?? true,
			terminalZshOhMy: stateValues.terminalZshOhMy ?? false,
			terminalZshP10k: stateValues.terminalZshP10k ?? false,
			terminalZdotdir: stateValues.terminalZdotdir ?? false,
			terminalCompressProgressBar: stateValues.terminalCompressProgressBar ?? true,
			mode: stateValues.mode ?? defaultModeSlug,
			language: stateValues.language ?? formatLanguage(vscode.env.language),
			mcpEnabled: true, // kilocode_change: always true
			enableMcpServerCreation: stateValues.enableMcpServerCreation ?? true,
			alwaysApproveResubmit: stateValues.alwaysApproveResubmit ?? false,
			requestDelaySeconds: Math.max(5, stateValues.requestDelaySeconds ?? 10),
			currentApiConfigName: stateValues.currentApiConfigName ?? "default",
			listApiConfigMeta: stateValues.listApiConfigMeta ?? [],
			pinnedApiConfigs: stateValues.pinnedApiConfigs ?? {},
			modeApiConfigs: stateValues.modeApiConfigs ?? ({} as Record<Mode, string>),
			customModePrompts: stateValues.customModePrompts ?? {},
			customSupportPrompts: stateValues.customSupportPrompts ?? {},
			enhancementApiConfigId: stateValues.enhancementApiConfigId,
			commitMessageApiConfigId: stateValues.commitMessageApiConfigId, // kilocode_change
			terminalCommandApiConfigId: stateValues.terminalCommandApiConfigId, // kilocode_change
			// kilocode_change start
			ghostServiceSettings: stateValues.ghostServiceSettings ?? {
				enableQuickInlineTaskKeybinding: true,
				enableSmartInlineTaskKeybinding: true,
			},
			// kilocode_change end
			experiments: stateValues.experiments ?? experimentDefault,
			autoApprovalEnabled: stateValues.autoApprovalEnabled ?? true,
			customModes,
			maxOpenTabsContext: stateValues.maxOpenTabsContext ?? 20,
			maxWorkspaceFiles: stateValues.maxWorkspaceFiles ?? 200,
			openRouterUseMiddleOutTransform: stateValues.openRouterUseMiddleOutTransform,
			browserToolEnabled: stateValues.browserToolEnabled ?? true,
			browserInteractionStrategy:
				(stateValues.browserInteractionStrategy as BrowserInteractionStrategy | undefined) ?? "legacy",
			telemetrySetting: stateValues.telemetrySetting || "unset",
			showRooIgnoredFiles: stateValues.showRooIgnoredFiles ?? false,
			showAutoApproveMenu: stateValues.showAutoApproveMenu ?? false, // kilocode_change
			showTaskTimeline: stateValues.showTaskTimeline ?? true, // kilocode_change
			maxReadFileLine: stateValues.maxReadFileLine ?? -1,
			maxImageFileSize: stateValues.maxImageFileSize ?? 5,
			maxTotalImageSize: stateValues.maxTotalImageSize ?? 20,
			maxConcurrentFileReads: stateValues.maxConcurrentFileReads ?? 5,
			allowVeryLargeReads: stateValues.allowVeryLargeReads ?? false, // kilocode_change
			systemNotificationsEnabled: stateValues.systemNotificationsEnabled ?? true, // kilocode_change
			dismissedNotificationIds: stateValues.dismissedNotificationIds ?? [], // kilocode_change
			morphApiKey: stateValues.morphApiKey, // kilocode_change
			historyPreviewCollapsed: stateValues.historyPreviewCollapsed ?? false,
			cloudUserInfo,
			cloudIsAuthenticated,
			sharingEnabled,
			organizationAllowList,
			organizationSettingsVersion,
			condensingApiConfigId: stateValues.condensingApiConfigId,
			customCondensingPrompt: stateValues.customCondensingPrompt,
			codebaseIndexModels: stateValues.codebaseIndexModels ?? EMBEDDING_MODEL_PROFILES,
			codebaseIndexConfig: {
				codebaseIndexEnabled: stateValues.codebaseIndexConfig?.codebaseIndexEnabled ?? true,
				codebaseIndexQdrantUrl:
					stateValues.codebaseIndexConfig?.codebaseIndexQdrantUrl ?? "http://localhost:6333",
				codebaseIndexEmbedderProvider:
					stateValues.codebaseIndexConfig?.codebaseIndexEmbedderProvider ?? "openai",
				codebaseIndexEmbedderBaseUrl: stateValues.codebaseIndexConfig?.codebaseIndexEmbedderBaseUrl ?? "",
				codebaseIndexEmbedderModelId: stateValues.codebaseIndexConfig?.codebaseIndexEmbedderModelId ?? "",
				codebaseIndexEmbedderModelDimension:
					stateValues.codebaseIndexConfig?.codebaseIndexEmbedderModelDimension,
				codebaseIndexOpenAiCompatibleBaseUrl:
					stateValues.codebaseIndexConfig?.codebaseIndexOpenAiCompatibleBaseUrl,
				codebaseIndexSearchMaxResults: stateValues.codebaseIndexConfig?.codebaseIndexSearchMaxResults,
				codebaseIndexSearchMinScore: stateValues.codebaseIndexConfig?.codebaseIndexSearchMinScore,
			},
			profileThresholds: stateValues.profileThresholds ?? {},
			includeDiagnosticMessages: stateValues.includeDiagnosticMessages ?? true,
			maxDiagnosticMessages: stateValues.maxDiagnosticMessages ?? 50,
			includeTaskHistoryInEnhance: stateValues.includeTaskHistoryInEnhance ?? true,
			remoteControlEnabled: (() => {
				try {
					const cloudSettings = CloudService.instance.getUserSettings()
					return cloudSettings?.settings?.extensionBridgeEnabled ?? false
				} catch (error) {
					console.error(
						`[getState] failed to get remote control setting from cloud: ${error instanceof Error ? error.message : String(error)}`,
					)
					return false
				}
			})(),
			openRouterImageApiKey: stateValues.openRouterImageApiKey,
			kiloCodeImageApiKey: stateValues.kiloCodeImageApiKey,
			openRouterImageGenerationSelectedModel: stateValues.openRouterImageGenerationSelectedModel,
			notificationEmail: stateValues.notificationEmail,
			notificationSmsNumber: stateValues.notificationSmsNumber,
			notificationSmsGateway: stateValues.notificationSmsGateway,
			notificationTelegramChatId: stateValues.notificationTelegramChatId,
			workplaceState: workplaceStateSnapshot ?? { companies: [] },
			workplaceRootConfigured: this.workplaceFilesystemManager?.isConfigured() ?? false,
			workplaceRootUri: this.workplaceFilesystemManager?.getRootUri()?.fsPath,
		}
		const companyCount = result.workplaceState?.companies?.length ?? 0
		const companyNames = result.workplaceState?.companies?.map((company: WorkplaceCompany) => company.name) ?? []
		verboseProviderLog(
			"[ClineProvider.getState] returning companyCount=%d companyNames=%o",
			companyCount,
			companyNames,
		)
		return result
	}

	async updateTaskHistory(item: HistoryItem): Promise<HistoryItem[]> {
		const history = (this.getGlobalState("taskHistory") as HistoryItem[] | undefined) || []
		const existingItemIndex = history.findIndex((h) => h.id === item.id)

		if (existingItemIndex !== -1) {
			history[existingItemIndex] = item
		} else {
			history.push(item)
		}

		await this.updateGlobalState("taskHistory", history)
		this.recentTasksCache = undefined

		return history
	}

	// ContextProxy

	// @deprecated - Use `ContextProxy#setValue` instead.
	private async updateGlobalState<K extends keyof GlobalState>(key: K, value: GlobalState[K]) {
		await this.contextProxy.setValue(key, value)
	}

	// @deprecated - Use `ContextProxy#getValue` instead.
	private getGlobalState<K extends keyof GlobalState>(key: K) {
		return this.contextProxy.getValue(key)
	}

	public async setValue<K extends keyof RooCodeSettings>(key: K, value: RooCodeSettings[K]) {
		await this.contextProxy.setValue(key, value)
	}

	public getValue<K extends keyof RooCodeSettings>(key: K) {
		return this.contextProxy.getValue(key)
	}

	public getValues() {
		return this.contextProxy.getValues()
	}

	public async setValues(values: RooCodeSettings) {
		await this.contextProxy.setValues(values)
	}

	// dev

	async resetState() {
		const answer = await vscode.window.showInformationMessage(
			t("common:confirmation.reset_state"),
			{ modal: true },
			t("common:answers.yes"),
		)

		if (answer !== t("common:answers.yes")) {
			return
		}

		// Logout from Kilo Code provider before resetting (same approach as ProfileView logout)
		const { apiConfiguration, currentApiConfigName = "default" } = await this.getState()
		if (apiConfiguration.kilocodeToken) {
			await this.upsertProviderProfile(currentApiConfigName, {
				...apiConfiguration,
				kilocodeToken: "",
			})
		}

		await this.contextProxy.resetAllState()
		await this.providerSettingsManager.resetAllConfigs()
		await this.customModesManager.resetCustomModes()

		await this.removeClineFromStack()
		await this.postStateToWebview()
		await this.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
	}

	// logging

	public log(message: string) {
		this.outputChannel.appendLine(message)
		if (ENABLE_VERBOSE_PROVIDER_LOGS) {
			console.debug("[ClineProvider]", message)
		}
	}

	// getters

	public get workspaceTracker(): WorkspaceTracker | undefined {
		return this._workspaceTracker
	}

	get viewLaunched() {
		return this.isViewLaunched
	}

	get messages() {
		return this.getCurrentTask()?.clineMessages || []
	}

	public getMcpHub(): McpHub | undefined {
		return this.mcpHub
	}

	/**
	 * Check if the current state is compliant with MDM policy
	 * @returns true if compliant or no MDM policy exists, false if MDM policy exists and user is non-compliant
	 */
	public checkMdmCompliance(): boolean {
		if (!this.mdmService) {
			return true // No MDM service, allow operation
		}

		const compliance = this.mdmService.isCompliant()

		if (!compliance.compliant) {
			return false
		}

		return true
	}

	public async remoteControlEnabled(enabled: boolean) {
		const userInfo = CloudService.instance.getUserInfo()
		const config = await CloudService.instance.cloudAPI?.bridgeConfig().catch(() => undefined)

		if (!config) {
			this.log("[ClineProvider#remoteControlEnabled] Failed to get bridge config")
			return
		}

		await BridgeOrchestrator.connectOrDisconnect(userInfo, enabled, {
			...config,
			provider: this,
			sessionId: vscode.env.sessionId,
		})

		const bridge = BridgeOrchestrator.getInstance()

		if (bridge) {
			const currentTask = this.getCurrentTask()

			if (currentTask && !currentTask.enableBridge) {
				try {
					currentTask.enableBridge = true
					await BridgeOrchestrator.subscribeToTask(currentTask)
				} catch (error) {
					const message = `[ClineProvider#remoteControlEnabled] BridgeOrchestrator.subscribeToTask() failed: ${error instanceof Error ? error.message : String(error)}`
					this.log(message)
					console.error(message)
				}
			}
		} else {
			for (const task of this.clineStack) {
				if (task.enableBridge) {
					try {
						await BridgeOrchestrator.getInstance()?.unsubscribeFromTask(task.taskId)
					} catch (error) {
						const message = `[ClineProvider#remoteControlEnabled] BridgeOrchestrator#unsubscribeFromTask() failed: ${error instanceof Error ? error.message : String(error)}`
						this.log(message)
						console.error(message)
					}
				}
			}
		}
	}

	/**
	 * Gets the CodeIndexManager for the current active workspace
	 * @returns CodeIndexManager instance for the current workspace or the default one
	 */
	public getCurrentWorkspaceCodeIndexManager(): CodeIndexManager | undefined {
		return CodeIndexManager.getInstance(this.context)
	}

	/**
	 * Updates the code index status subscription to listen to the current workspace manager
	 */
	private updateCodeIndexStatusSubscription(): void {
		// Get the current workspace manager
		const currentManager = this.getCurrentWorkspaceCodeIndexManager()

		// If the manager hasn't changed, no need to update subscription
		if (currentManager === this.codeIndexManager) {
			return
		}

		// Dispose the old subscription if it exists
		if (this.codeIndexStatusSubscription) {
			this.codeIndexStatusSubscription.dispose()
			this.codeIndexStatusSubscription = undefined
		}

		// Update the current workspace manager reference
		this.codeIndexManager = currentManager

		// Subscribe to the new manager's progress updates if it exists
		if (currentManager) {
			this.codeIndexStatusSubscription = currentManager.onProgressUpdate((update: IndexProgressUpdate) => {
				// Only send updates if this manager is still the current one
				if (currentManager === this.getCurrentWorkspaceCodeIndexManager()) {
					// Get the full status from the manager to ensure we have all fields correctly formatted
					const fullStatus = currentManager.getCurrentStatus()
					this.postMessageToWebview({
						type: "indexingStatusUpdate",
						values: fullStatus,
					})
				}
			})

			if (this.view) {
				this.webviewDisposables.push(this.codeIndexStatusSubscription)
			}

			// Send initial status for the current workspace
			this.postMessageToWebview({
				type: "indexingStatusUpdate",
				values: currentManager.getCurrentStatus(),
			})
		}
	}

	/**
	 * TaskProviderLike, TelemetryPropertiesProvider
	 */

	public getCurrentTask(): Task | undefined {
		if (this.clineStack.length === 0) {
			return undefined
		}

		return this.clineStack[this.clineStack.length - 1]
	}

	public getRecentTasks(): string[] {
		if (this.recentTasksCache) {
			return this.recentTasksCache
		}

		const history = this.getGlobalState("taskHistory") ?? []
		const workspaceTasks: HistoryItem[] = []

		for (const item of history) {
			if (!item.ts || !item.task || item.workspace !== this.cwd) {
				continue
			}

			workspaceTasks.push(item)
		}

		if (workspaceTasks.length === 0) {
			this.recentTasksCache = []
			return this.recentTasksCache
		}

		workspaceTasks.sort((a, b) => b.ts - a.ts)
		let recentTaskIds: string[] = []

		if (workspaceTasks.length >= 100) {
			// If we have at least 100 tasks, return tasks from the last 7 days.
			const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000

			for (const item of workspaceTasks) {
				// Stop when we hit tasks older than 7 days.
				if (item.ts < sevenDaysAgo) {
					break
				}

				recentTaskIds.push(item.id)
			}
		} else {
			// Otherwise, return the most recent 100 tasks (or all if less than 100).
			recentTaskIds = workspaceTasks.slice(0, Math.min(100, workspaceTasks.length)).map((item) => item.id)
		}

		this.recentTasksCache = recentTaskIds
		return this.recentTasksCache
	}

	// When initializing a new task, (not from history but from a tool command
	// new_task) there is no need to remove the previous task since the new
	// task is a subtask of the previous one, and when it finishes it is removed
	// from the stack and the caller is resumed in this way we can have a chain
	// of tasks, each one being a sub task of the previous one until the main
	// task is finished.
	public async createTask(
		text?: string,
		images?: string[],
		parentTask?: Task,
		options: CreateTaskOptions = {},
		configuration: RooCodeSettings = {},
	): Promise<Task> {
		if (configuration) {
			await this.setValues(configuration)

			if (configuration.allowedCommands) {
				await vscode.workspace
					.getConfiguration(Package.name)
					.update("allowedCommands", configuration.allowedCommands, vscode.ConfigurationTarget.Global)
			}

			if (configuration.deniedCommands) {
				await vscode.workspace
					.getConfiguration(Package.name)
					.update("deniedCommands", configuration.deniedCommands, vscode.ConfigurationTarget.Global)
			}

			if (configuration.commandExecutionTimeout !== undefined) {
				await vscode.workspace
					.getConfiguration(Package.name)
					.update(
						"commandExecutionTimeout",
						configuration.commandExecutionTimeout,
						vscode.ConfigurationTarget.Global,
					)
			}

			if (configuration.currentApiConfigName) {
				await this.setProviderProfile(configuration.currentApiConfigName)
			}
		}

		const {
			apiConfiguration,
			organizationAllowList,
			diffEnabled: enableDiff,
			enableCheckpoints,
			fuzzyMatchThreshold,
			experiments,
			cloudUserInfo,
			remoteControlEnabled,
		} = await this.getState()

		if (!ProfileValidator.isProfileAllowed(apiConfiguration, organizationAllowList)) {
			throw new OrganizationAllowListViolationError(t("common:errors.violated_organization_allowlist"))
		}

		const task = new Task({
			provider: this,
			context: this.context, // kilocode_change
			apiConfiguration,
			enableDiff,
			enableCheckpoints,
			fuzzyMatchThreshold,
			consecutiveMistakeLimit: apiConfiguration.consecutiveMistakeLimit,
			task: text,
			images,
			experiments,
			rootTask: this.clineStack.length > 0 ? this.clineStack[0] : undefined,
			parentTask,
			taskNumber: this.clineStack.length + 1,
			onCreated: this.taskCreationCallback,
			enableBridge: BridgeOrchestrator.isEnabled(cloudUserInfo, remoteControlEnabled),
			initialTodos: options.initialTodos,
			...options,
		})

		await this.addClineToStack(task)

		this.log(
			`[createTask] ${task.parentTask ? "child" : "parent"} task ${task.taskId}.${task.instanceId} instantiated`,
		)

		return task
	}

	public async cancelTask(): Promise<void> {
		const task = this.getCurrentTask()

		if (!task) {
			return
		}

		console.log(`[cancelTask] cancelling task ${task.taskId}.${task.instanceId}`)

		const { historyItem } = await this.getTaskWithId(task.taskId)

		// Preserve parent and root task information for history item.
		const rootTask = task.rootTask
		const parentTask = task.parentTask

		task.abortTask()

		await pWaitFor(
			() =>
				this.getCurrentTask()! === undefined ||
				this.getCurrentTask()!.isStreaming === false ||
				this.getCurrentTask()!.didFinishAbortingStream ||
				// If only the first chunk is processed, then there's no
				// need to wait for graceful abort (closes edits, browser,
				// etc).
				this.getCurrentTask()!.isWaitingForFirstChunk,
			{
				timeout: 3_000,
			},
		).catch(() => {
			console.error("Failed to abort task")
		})

		if (this.getCurrentTask()) {
			// 'abandoned' will prevent this Cline instance from affecting
			// future Cline instances. This may happen if its hanging on a
			// streaming request.
			this.getCurrentTask()!.abandoned = true
		}

		// Clears task again, so we need to abortTask manually above.
		await this.createTaskWithHistoryItem({ ...historyItem, rootTask, parentTask })
	}

	// Clear the current task without treating it as a subtask.
	// This is used when the user cancels a task that is not a subtask.
	public async clearTask(): Promise<void> {
		if (this.clineStack.length > 0) {
			const task = this.clineStack[this.clineStack.length - 1]
			console.log(`[clearTask] clearing task ${task.taskId}.${task.instanceId}`)
			await this.removeClineFromStack()
		}
	}

	public resumeTask(taskId: string): void {
		// Use the existing showTaskWithId method which handles both current and
		// historical tasks.
		this.showTaskWithId(taskId).catch((error) => {
			this.log(`Failed to resume task ${taskId}: ${error.message}`)
		})
	}

	// Modes

	public async getModes(): Promise<{ slug: string; name: string }[]> {
		try {
			const customModes = await this.customModesManager.getCustomModes()
			return [...DEFAULT_MODES, ...customModes].map(({ slug, name }) => ({ slug, name }))
		} catch (error) {
			return DEFAULT_MODES.map(({ slug, name }) => ({ slug, name }))
		}
	}

	public async getMode(): Promise<string> {
		const { mode } = await this.getState()
		return mode
	}

	public async setMode(mode: string): Promise<void> {
		await this.setValues({ mode })
	}

	// Provider Profiles

	public async getProviderProfiles(): Promise<{ name: string; provider?: string }[]> {
		const { listApiConfigMeta = [] } = await this.getState()
		return listApiConfigMeta.map((profile) => ({ name: profile.name, provider: profile.apiProvider }))
	}

	public async getProviderProfile(): Promise<string> {
		const { currentApiConfigName = "default" } = await this.getState()
		return currentApiConfigName
	}

	public async setProviderProfile(name: string): Promise<void> {
		await this.activateProviderProfile({ name })
	}

	// Telemetry

	private _appProperties?: StaticAppProperties
	private _gitProperties?: GitProperties

	private getAppProperties(): StaticAppProperties {
		if (!this._appProperties) {
			const packageJSON = this.context.extension?.packageJSON
			// kilocode_change start
			const {
				kiloCodeWrapped,
				kiloCodeWrapper,
				kiloCodeWrapperCode,
				kiloCodeWrapperVersion,
				kiloCodeWrapperTitle,
			} = getKiloCodeWrapperProperties()
			// kilocode_change end

			this._appProperties = {
				appName: packageJSON?.name ?? Package.name,
				appVersion: packageJSON?.version ?? Package.version,
				vscodeVersion: vscode.version,
				platform: isWsl ? "wsl" /* kilocode_change */ : process.platform,
				editorName: kiloCodeWrapperTitle ? kiloCodeWrapperTitle : vscode.env.appName, // kilocode_change
				wrapped: kiloCodeWrapped, // kilocode_change
				wrapper: kiloCodeWrapper, // kilocode_change
				wrapperCode: kiloCodeWrapperCode, // kilocode_change
				wrapperVersion: kiloCodeWrapperVersion, // kilocode_change
				wrapperTitle: kiloCodeWrapperTitle, // kilocode_change
			}
		}

		return this._appProperties
	}

	public get appProperties(): StaticAppProperties {
		return this._appProperties ?? this.getAppProperties()
	}

	private getCloudProperties(): CloudAppProperties {
		let cloudIsAuthenticated: boolean | undefined

		try {
			if (CloudService.hasInstance()) {
				cloudIsAuthenticated = CloudService.instance.isAuthenticated()
			}
		} catch (error) {
			// Silently handle errors to avoid breaking telemetry collection.
			this.log(`[getTelemetryProperties] Failed to get cloud auth state: ${error}`)
		}

		return {
			cloudIsAuthenticated,
		}
	}

	private async getTaskProperties(): Promise<DynamicAppProperties & TaskProperties> {
		const { language = "en", mode, apiConfiguration } = await this.getState()

		const task = this.getCurrentTask()
		const todoList = task?.todoList
		let todos: { total: number; completed: number; inProgress: number; pending: number } | undefined

		if (todoList && todoList.length > 0) {
			todos = {
				total: todoList.length,
				completed: todoList.filter((todo) => todo.status === "completed").length,
				inProgress: todoList.filter((todo) => todo.status === "in_progress").length,
				pending: todoList.filter((todo) => todo.status === "pending").length,
			}
		}

		return {
			language,
			mode,
			taskId: task?.taskId,
			apiProvider: apiConfiguration?.apiProvider,
			diffStrategy: task?.diffStrategy?.getName(),
			isSubtask: task ? !!task.parentTask : undefined,
			...(todos && { todos }),
		}
	}

	private async getGitProperties(): Promise<GitProperties> {
		if (!this._gitProperties) {
			this._gitProperties = await getWorkspaceGitInfo()
		}

		return this._gitProperties
	}

	public get gitProperties(): GitProperties | undefined {
		return this._gitProperties
	}

	public async getTelemetryProperties(): Promise<TelemetryProperties> {
		// kilocode_change start
		const {
			mode,
			apiConfiguration,
			language,
			experiments, // kilocode_change
		} = await this.getState()
		const task = this.getCurrentTask()

		const packageJSON = this.context.extension?.packageJSON

		async function getModelId() {
			try {
				if (task?.api instanceof OpenRouterHandler) {
					return { modelId: (await task.api.fetchModel()).id }
				} else {
					return { modelId: task?.api?.getModel().id }
				}
			} catch (error) {
				return {
					modelException: stringifyError(error),
				}
			}
		}

		function getOpenRouter() {
			if (
				apiConfiguration &&
				(apiConfiguration.apiProvider === "openrouter" || apiConfiguration.apiProvider === "kilocode")
			) {
				return {
					openRouter: {
						sort: apiConfiguration.openRouterProviderSort,
						dataCollection: apiConfiguration.openRouterProviderDataCollection,
						specificProvider: apiConfiguration.openRouterSpecificProvider,
					},
				}
			}
			return {}
		}

		function getMemory() {
			try {
				return { memory: { ...process.memoryUsage() } }
			} catch (error) {
				return {
					memoryException: stringifyError(error),
				}
			}
		}

		const getFastApply = () => {
			try {
				return {
					fastApply: {
						morphFastApply: Boolean(experiments.morphFastApply),
						morphApiKey: Boolean(this.contextProxy.getValue("morphApiKey")),
					},
				}
			} catch (error) {
				return {
					fastApplyException: stringifyError(error),
				}
			}
		}
		// kilocode_change end

		return {
			...this.getAppProperties(),
			// ...this.getCloudProperties(), kilocode_change: disable
			// kilocode_change start
			...(await getModelId()),
			...getMemory(),
			...getFastApply(),
			...getOpenRouter(),
			// kilocode_change end
			...(await this.getTaskProperties()),
			...(await this.getGitProperties()),
		}
	}

	// kilocode_change:
	// Tool Library (MCP marketplace + additional sources)
	private async fetchMcpMarketplaceFromApi(silent: boolean = false): Promise<McpMarketplaceCatalog | undefined> {
		try {
			const response = await axios.get("https://api.cline.bot/v1/mcp/marketplace", {
				headers: {
					"Content-Type": "application/json",
				},
			})

			if (!response.data) {
				throw new Error("Invalid response from MCP marketplace API")
			}

			const remoteItems: McpMarketplaceItem[] = (response.data || []).map((item: any) => ({
				...item,
				githubStars: item.githubStars ?? 0,
				downloadCount: item.downloadCount ?? 0,
				tags: item.tags ?? [],
				integrationType: (item.integrationType ?? "mcp") as McpMarketplaceItem["integrationType"],
				source: "remote",
			}))

			const mergedById = new Map<string, McpMarketplaceItem>()
			for (const item of remoteItems) {
				mergedById.set(item.mcpId, item)
			}
			for (const localItem of additionalToolLibraryItems) {
				mergedById.set(localItem.mcpId, {
					...localItem,
					integrationType: localItem.integrationType ?? "computer-use",
				})
			}

			const catalog: McpMarketplaceCatalog = {
				items: Array.from(mergedById.values()),
			}

			await this.updateGlobalState("mcpMarketplaceCatalog", catalog)
			return catalog
		} catch (error) {
			console.error("Failed to fetch MCP marketplace:", error)
			if (!silent) {
				const errorMessage = error instanceof Error ? error.message : "Failed to fetch MCP marketplace"
				await this.postMessageToWebview({
					type: "mcpMarketplaceCatalog",
					error: errorMessage,
				})
				vscode.window.showErrorMessage(errorMessage)
			}
			return undefined
		}
	}

	async silentlyRefreshMcpMarketplace() {
		try {
			const catalog = await this.fetchMcpMarketplaceFromApi(true)
			if (catalog) {
				await this.postMessageToWebview({
					type: "mcpMarketplaceCatalog",
					mcpMarketplaceCatalog: catalog,
				})
			}
		} catch (error) {
			console.error("Failed to silently refresh MCP marketplace:", error)
		}
	}

	async fetchMcpMarketplace(forceRefresh: boolean = false) {
		try {
			// Check if we have cached data
			const cachedCatalog = (await this.getGlobalState("mcpMarketplaceCatalog")) as
				| McpMarketplaceCatalog
				| undefined
			if (!forceRefresh && cachedCatalog?.items) {
				await this.postMessageToWebview({
					type: "mcpMarketplaceCatalog",
					mcpMarketplaceCatalog: cachedCatalog,
				})
				return
			}

			const catalog = await this.fetchMcpMarketplaceFromApi(false)
			if (catalog) {
				await this.postMessageToWebview({
					type: "mcpMarketplaceCatalog",
					mcpMarketplaceCatalog: catalog,
				})
			}
		} catch (error) {
			console.error("Failed to handle cached MCP marketplace:", error)
			const errorMessage = error instanceof Error ? error.message : "Failed to handle cached MCP marketplace"
			await this.postMessageToWebview({
				type: "mcpMarketplaceCatalog",
				error: errorMessage,
			})
			vscode.window.showErrorMessage(errorMessage)
		}
	}

	async downloadMcp(mcpId: string) {
		try {
			// First check if we already have this MCP server installed
			const servers = this.mcpHub?.getServers() || []
			const isInstalled = servers.some((server: McpServer) => server.name === mcpId)

			if (isInstalled) {
				throw new Error("This MCP server is already installed")
			}

			// Fetch server details from marketplace
			const response = await axios.post<McpDownloadResponse>(
				"https://api.cline.bot/v1/mcp/download",
				{ mcpId },
				{
					headers: { "Content-Type": "application/json" },
					timeout: 10000,
				},
			)

			if (!response.data) {
				throw new Error("Invalid response from MCP marketplace API")
			}

			console.log("[downloadMcp] Response from download API", { response })

			const mcpDetails = response.data

			// Validate required fields
			if (!mcpDetails.githubUrl) {
				throw new Error("Missing GitHub URL in MCP download response")
			}
			if (!mcpDetails.readmeContent) {
				throw new Error("Missing README content in MCP download response")
			}

			// Send details to webview
			await this.postMessageToWebview({
				type: "mcpDownloadDetails",
				mcpDownloadDetails: mcpDetails,
			})

			// Create task with context from README and added guidelines for MCP server installation
			const task = `Set up the MCP server from ${mcpDetails.githubUrl} while adhering to these MCP server installation rules:
- Use "${mcpDetails.mcpId}" as the server name in ${GlobalFileNames.mcpSettings}.
- Create the directory for the new MCP server before starting installation.
- Use commands aligned with the user's shell and operating system best practices.
- The following README may contain instructions that conflict with the user's OS, in which case proceed thoughtfully.
- Once installed, demonstrate the server's capabilities by using one of its tools.
Here is the project's README to help you get started:\n\n${mcpDetails.readmeContent}\n${mcpDetails.llmsInstallationContent}`

			// Initialize task and show chat view
			await this.createTask(task)
			await this.postMessageToWebview({
				type: "action",
				action: "chatButtonClicked",
			})
		} catch (error) {
			console.error("Failed to download MCP:", error)
			let errorMessage = "Failed to download MCP"

			if (axios.isAxiosError(error)) {
				if (error.code === "ECONNABORTED") {
					errorMessage = "Request timed out. Please try again."
				} else if (error.response?.status === 404) {
					errorMessage = "MCP server not found in marketplace."
				} else if (error.response?.status === 500) {
					errorMessage = "Internal server error. Please try again later."
				} else if (!error.response && error.request) {
					errorMessage = "Network error. Please check your internet connection."
				}
			} else if (error instanceof Error) {
				errorMessage = error.message
			}

			// Show error in both notification and marketplace UI
			vscode.window.showErrorMessage(errorMessage)
			await this.postMessageToWebview({
				type: "mcpDownloadDetails",
				error: errorMessage,
			})
		}
	}
	// end kilocode_change

	// kilocode_change start
	// Add new methods for favorite functionality
	async toggleTaskFavorite(id: string) {
		const history = this.getGlobalState("taskHistory") ?? []
		const updatedHistory = history.map((item) => {
			if (item.id === id) {
				return { ...item, isFavorited: !item.isFavorited }
			}
			return item
		})
		await this.updateGlobalState("taskHistory", updatedHistory)
		await this.postStateToWebview()
	}

	async getFavoriteTasks(): Promise<HistoryItem[]> {
		const history = this.getGlobalState("taskHistory") ?? []
		return history.filter((item) => item.isFavorited)
	}

	// Modify batch delete to respect favorites
	async deleteMultipleTasks(taskIds: string[]) {
		const history = this.getGlobalState("taskHistory") ?? []
		const favoritedTaskIds = taskIds.filter((id) => history.find((item) => item.id === id)?.isFavorited)

		if (favoritedTaskIds.length > 0) {
			throw new Error("Cannot delete favorited tasks. Please unfavorite them first.")
		}

		for (const id of taskIds) {
			await this.deleteTaskWithId(id)
		}
	}

	async setTaskFileNotFound(id: string) {
		const history = this.getGlobalState("taskHistory") ?? []
		const updatedHistory = history.map((item) => {
			if (item.id === id) {
				return { ...item, fileNotfound: true }
			}
			return item
		})
		await this.updateGlobalState("taskHistory", updatedHistory)
		await this.postStateToWebview()
	}

	// kilocode_change end

	public get cwd() {
		return this.currentWorkspacePath || getWorkspacePath()
	}

	/**
	 * Convert a file path to a webview-accessible URI
	 * This method safely converts file paths to URIs that can be loaded in the webview
	 *
	 * @param filePath - The absolute file path to convert
	 * @returns The webview URI string, or the original file URI if conversion fails
	 * @throws {Error} When webview is not available
	 * @throws {TypeError} When file path is invalid
	 */
	public convertToWebviewUri(filePath: string): string {
		try {
			const fileUri = vscode.Uri.file(filePath)

			// Check if we have a webview available
			if (this.view?.webview) {
				const webviewUri = this.view.webview.asWebviewUri(fileUri)
				return webviewUri.toString()
			}

			// Specific error for no webview available
			const error = new Error("No webview available for URI conversion")
			console.error(error.message)
			// Fallback to file URI if no webview available
			return fileUri.toString()
		} catch (error) {
			// More specific error handling
			if (error instanceof TypeError) {
				console.error("Invalid file path provided for URI conversion:", error)
			} else {
				console.error("Failed to convert to webview URI:", error)
			}
			// Return file URI as fallback
			return vscode.Uri.file(filePath).toString()
		}
	}
}

function createCloverWelcomeMessage(timestampIso = new Date().toISOString()): OuterGateCloverMessage {
	return {
		id: randomUUID(),
		speaker: "clover",
		text: CLOVER_WELCOME_TEXT,
		timestamp: timestampIso,
	}
}

function cloneOuterGateState(state: OuterGateState): OuterGateState {
	return {
		analysisPool: { ...state.analysisPool },
		recentInsights: state.recentInsights.map((insight) => ({ ...insight })),
		suggestions: [...state.suggestions],
		quickActions: state.quickActions.map((action) => ({ ...action })),
		integrations: state.integrations.map((integration) => ({ ...integration })),
		cloverMessages: state.cloverMessages.map((message) => ({ ...message })),
		isCloverProcessing: state.isCloverProcessing ?? false,
		cloverSessions: {
			entries: state.cloverSessions.entries.map((session) => ({ ...session })),
			hasMore: state.cloverSessions.hasMore,
			cursor: state.cloverSessions.cursor,
			isLoading: state.cloverSessions.isLoading,
			isInitialFetchComplete: state.cloverSessions.isInitialFetchComplete,
		},
		activeCloverSessionId: state.activeCloverSessionId,
		passionMap: {
			status: state.passionMap.status,
			points: state.passionMap.points.map((point) => ({
				...point,
				coordinates: { ...point.coordinates },
				metadata: point.metadata
					? {
						...point.metadata,
						references: point.metadata.references ? [...point.metadata.references] : undefined,
					}
				: undefined,
			})),
			clusters: state.passionMap.clusters.map((cluster) => ({
				...cluster,
				centroid: { ...cluster.centroid },
				topKeywords: [...cluster.topKeywords],
			})),
			generatedAtIso: state.passionMap.generatedAtIso,
			lastRequestedIso: state.passionMap.lastRequestedIso,
			summary: state.passionMap.summary,
			error: state.passionMap.error,
		},
	}
}

function createInitialOuterGateState(_workplaceState?: WorkplaceState): OuterGateState {
	const base = cloneOuterGateState(defaultOuterGateState)
	const nowIso = new Date().toISOString()

	// Ensure timestamps reflect the current session instead of module evaluation time.
	base.analysisPool = { ...base.analysisPool, lastUpdatedIso: nowIso }

	// Seed with the standard welcome message but leave the dataset empty for real data to populate.
	base.cloverMessages = [createCloverWelcomeMessage(nowIso)]
	base.isCloverProcessing = false

	return base
}

type CloverAnalysisItems = Awaited<ReturnType<CloverSessionService["fetchAnalysisItems"]>>["items"]
type CloverAnalysisItem = CloverAnalysisItems[number]

const PASSION_KEYWORD_STOPWORDS = new Set([
	"the",
	"and",
	"with",
	"from",
	"this",
	"that",
	"into",
	"your",
	"have",
	"about",
	"when",
	"where",
	"they",
	"them",
	"their",
	"will",
	"just",
	"been",
	"make",
	"over",
	"under",
	"more",
	"less",
	"into",
	"through",
	"while",
	"after",
	"before",
	"those",
	"these",
	"then",
	"than",
])

function buildSimplePassionMap(items: CloverAnalysisItems): {
	points: OuterGatePassionPoint[]
	clusters: OuterGatePassionCluster[]
	summary?: string
} {
	if (!items.length) {
		return { points: [], clusters: [], summary: undefined }
	}

	const coordinates = deriveNormalizedCoordinates(items)
	const nowMs = Date.now()

	const points = items.map<OuterGatePassionPoint>((item, index) => {
		const snippet = createPassionSnippet(item.text)
		return {
			id: item.id,
			label: createPassionLabel(snippet),
			kind: item.kind,
			status: item.status,
			clusterId: item.status,
			coordinates: coordinates[index],
			heat: computeRecencyHeat(item.createdAt, nowMs),
			createdAtIso: item.createdAt,
			snippet,
			sessionId: item.sessionId,
			tokens: item.tokens,
			metadata: buildPassionMetadata(item),
		}
	})

	const clusterBuckets = new Map<string, { points: OuterGatePassionPoint[]; heatTotal: number }>()
	for (const point of points) {
		const bucket = clusterBuckets.get(point.clusterId)
		if (bucket) {
			bucket.points.push(point)
			bucket.heatTotal += point.heat
		} else {
			clusterBuckets.set(point.clusterId, { points: [point], heatTotal: point.heat })
		}
	}

	const totalPoints = points.length || 1
	const clusters = Array.from(clusterBuckets.entries()).map<OuterGatePassionCluster>(([clusterId, bucket], index) => {
		const centroid = averageCoordinates(bucket.points)
		const passionScore = Number(
			((bucket.heatTotal / bucket.points.length) * 0.7 + (bucket.points.length / totalPoints) * 0.3).toFixed(2),
		)
		const topKeywords = computeTopKeywords(bucket.points, 5)
		return {
			id: clusterId,
			label: toTitleCase(clusterId.replace(/_/g, " ")) || `Cluster ${index + 1}`,
			color: PASSION_COLOR_PALETTE[index % PASSION_COLOR_PALETTE.length],
			size: bucket.points.length,
			topKeywords,
			passionScore,
			centroid,
		}
	})

	const summary = clusters.length
		? `Top clusters: ${clusters.map((cluster) => `${cluster.label} (${cluster.size})`).join(", ")}`
		: undefined

	return { points, clusters, summary }
}

function countAnalysisStatuses(items: CloverAnalysisItems): Record<OuterGatePassionStatus, number> {
	const counts: Record<OuterGatePassionStatus, number> = {
		captured: 0,
		processing: 0,
		ready: 0,
		archived: 0,
	}
	for (const item of items) {
		counts[item.status] += 1
	}
	return counts
}

function deriveNormalizedCoordinates(items: CloverAnalysisItems): Array<{ x: number; y: number }> {
	if (!items.length) {
		return []
	}
	const raw = items.map((item, index) => {
		const embedding = Array.isArray(item.embedding) ? item.embedding : []
		const primary = Number.isFinite(embedding[0]) ? Number(embedding[0]) : index
		const secondary = Number.isFinite(embedding[1]) ? Number(embedding[1]) : 0
		return { x: primary, y: secondary }
	})
	let minX = Number.POSITIVE_INFINITY
	let maxX = Number.NEGATIVE_INFINITY
	let minY = Number.POSITIVE_INFINITY
	let maxY = Number.NEGATIVE_INFINITY
	for (const entry of raw) {
		if (entry.x < minX) minX = entry.x
		if (entry.x > maxX) maxX = entry.x
		if (entry.y < minY) minY = entry.y
		if (entry.y > maxY) maxY = entry.y
	}
	const rangeX = maxX - minX || 1
	const rangeY = maxY - minY || 1
	return raw.map((entry, index) => ({
		x: Number(normalizeToRange(entry.x, minX, rangeX).toFixed(3)),
		y: Number(normalizeToRange(entry.y, minY, rangeY).toFixed(3)),
	}))
}

function normalizeToRange(value: number, min: number, range: number): number {
	return (value - min) / range * 2 - 1
}

function averageCoordinates(points: OuterGatePassionPoint[]): { x: number; y: number } {
	if (!points.length) {
		return { x: 0, y: 0 }
	}
	const sum = points.reduce(
		(acc, point) => {
			acc.x += point.coordinates.x
			acc.y += point.coordinates.y
			return acc
		},
		{ x: 0, y: 0 },
	)
	return {
		x: Number((sum.x / points.length).toFixed(3)),
		y: Number((sum.y / points.length).toFixed(3)),
	}
}

function createPassionSnippet(text: string | undefined): string {
	if (!text) {
		return ""
	}
	const normalized = text.replace(/\s+/g, " ").trim()
	if (normalized.length <= 180) {
		return normalized
	}
	return `${normalized.slice(0, 177).trim()}...`
}

function createPassionLabel(snippet: string): string {
	if (!snippet) {
		return "Untitled"
	}
	const words = snippet.split(/\s+/).slice(0, 6).join(" ")
	return words.length < snippet.length ? `${words}...` : words
}

function buildPassionMetadata(item: CloverAnalysisItem): OuterGatePassionPoint["metadata"] | undefined {
	const metadata: OuterGatePassionPoint["metadata"] = {}
	if (item.filename) {
		metadata.filename = item.filename
	}
	if (item.mimeType) {
		metadata.mimeType = item.mimeType
	}
	if (typeof item.sizeBytes === "number") {
		metadata.sizeBytes = item.sizeBytes
	}
	if (item.source) {
		metadata.source = item.source
	}
	if (Array.isArray(item.references) && item.references.length > 0) {
		metadata.references = [...item.references]
	}
	return Object.keys(metadata).length > 0 ? metadata : undefined
}

function computeRecencyHeat(createdAt: string | undefined, nowMs: number): number {
	if (!createdAt) {
		return 0.25
	}
	const timestamp = Date.parse(createdAt)
	if (Number.isNaN(timestamp)) {
		return 0.25
	}
	const ageDays = Math.max(0, (nowMs - timestamp) / (1000 * 60 * 60 * 24))
	const heat = Math.exp(-ageDays / 7)
	return Number(Math.min(1, Math.max(0, heat)).toFixed(3))
}

function computeTopKeywords(points: OuterGatePassionPoint[], limit: number): string[] {
	const counts = new Map<string, number>()
	for (const point of points) {
		const words = point.snippet
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((word) => word.length >= 4 && !PASSION_KEYWORD_STOPWORDS.has(word))
		const unique = new Set(words)
		for (const word of unique) {
			counts.set(word, (counts.get(word) ?? 0) + 1)
		}
	}
	return Array.from(counts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([word]) => toTitleCase(word))
}

function toTitleCase(value: string): string {
	if (!value) {
		return value
	}
	return value
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ")
}
