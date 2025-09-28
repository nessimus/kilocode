import os from "os";
import * as path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import EventEmitter from "events";
import delay from "delay";
import axios from "axios";
import * as vscode from "vscode";
import { TSNE } from "tsne-js";
import { RooCodeEventName, requestyDefaultModelId, openRouterDefaultModelId, glamaDefaultModelId, } from "@roo-code/types";
import { TelemetryService } from "@roo-code/telemetry";
import { CloudService, BridgeOrchestrator } from "@roo-code/cloud";
import { Package } from "../../shared/package";
import { findLast } from "../../shared/array";
import { supportPrompt } from "../../shared/support-prompt";
import { GlobalFileNames } from "../../shared/globalFileNames";
import { defaultModeSlug, getModeBySlug } from "../../shared/modes";
import { EMBEDDING_MODEL_PROFILES } from "../../shared/embeddingModels";
import { Terminal } from "../../integrations/terminal/Terminal";
import { downloadTask } from "../../integrations/misc/export-markdown";
import { getTheme } from "../../integrations/theme/getTheme";
import WorkspaceTracker from "../../integrations/workspace/WorkspaceTracker";
import { McpServerManager } from "../../services/mcp/McpServerManager";
import { MarketplaceManager } from "../../services/marketplace";
import { ShadowCheckpointService } from "../../services/checkpoints/ShadowCheckpointService";
import { fileExistsAtPath } from "../../utils/fs";
import { setTtsEnabled, setTtsSpeed } from "../../utils/tts";
import { getWorkspacePath } from "../../utils/path";
import { OrganizationAllowListViolationError } from "../../utils/errors";
import { setPanel } from "../../activate/registerCommands";
import { t } from "../../i18n";
import { buildApiHandler } from "../../api";
import { forceFullModelDetailsLoad, hasLoadedFullDetails } from "../../api/providers/fetchers/lmstudio";
import { ContextProxy } from "../config/ContextProxy";
import { ProviderSettingsManager } from "../config/ProviderSettingsManager";
import { CustomModesManager } from "../config/CustomModesManager";
import { Task } from "../task/Task";
import { webviewMessageHandler } from "./webviewMessageHandler";
import { getNonce } from "./getNonce";
import { getUri } from "./getUri";
import { ConversationHubService } from "../hub/ConversationHubService";
import { singleCompletionHandler } from "../../utils/single-completion-handler";
import { countTokens } from "../../utils/countTokens";
import { defaultOuterGateState, } from "../../shared/golden/outerGate";
import { cloverAutomationFunctionNames, cloverAutomationFunctionPromptList, cloverAutomationFunctions, } from "../../shared/golden/cloverAutomation";
import { CloverSessionService, DEFAULT_CLOVER_SESSION_PAGE_SIZE } from "../../services/outerGate/CloverSessionService";
import { OuterGateIntegrationManager } from "../../services/outerGate/OuterGateIntegrationManager";
import { optionalString, normalizeOwnerProfileInput, normalizeBooleanInput } from "../tools/helpers/workplace";
const ENABLE_VERBOSE_PROVIDER_LOGS = false;
const verboseProviderLog = (...args) => {
    if (!ENABLE_VERBOSE_PROVIDER_LOGS) {
        return;
    }
    console.debug("[ClineProvider]", ...args);
};
const CLOVER_MAX_MESSAGES = 18;
const CLOVER_SESSION_SUMMARY_LIMIT = DEFAULT_CLOVER_SESSION_PAGE_SIZE * 4;
const CLOVER_SESSION_RETRY_DELAY_MS = 60_000;
const CLOVER_CONVERSATION_INTEGRATION_ID = "clover-chat";
const CLOVER_MAX_AUTOMATION_PASSES = 4;
const PASSION_COLOR_PALETTE = ["#F97316", "#6366F1", "#10B981", "#EC4899", "#14B8A6", "#F59E0B", "#8B5CF6", "#0EA5E9"];
const PASSION_STOP_WORDS = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "have",
    "from",
    "this",
    "about",
    "into",
    "your",
    "their",
    "they",
    "been",
    "will",
    "would",
    "there",
    "what",
    "when",
    "which",
    "make",
    "work",
    "project",
    "projects",
    "idea",
    "ideas",
    "note",
    "notes",
    "plan",
    "plans",
    "draft",
    "updates",
    "update",
    "task",
    "tasks",
    "team",
    "teams",
    "just",
    "like",
    "really",
    "also",
    "still",
    "keep",
    "need",
    "take",
    "over",
    "next",
    "past",
    "week",
    "weeks",
    "month",
    "months",
    "today",
    "yesterday",
    "tomorrow",
    "going",
    "should",
    "could",
    "might",
    "through",
    "more",
    "much",
    "very",
    "every",
    "each",
    "other",
    "some",
    "than",
    "because",
    "while",
    "where",
    "well",
    "good",
    "great",
    "awesome",
    "amazing",
    "super",
    "even",
    "maybe",
    "thing",
    "things",
    "people",
    "person",
    "user",
    "users",
    "customer",
    "customers",
    "client",
    "clients",
    "company",
    "companies",
    "product",
    "products",
    "service",
    "services",
    "data",
    "info",
    "information",
    "document",
    "documents",
    "file",
    "files",
    "meeting",
    "meetings",
    "call",
    "calls",
    "review",
    "reviews",
    "feedback",
    "version",
    "versions",
    "story",
    "stories",
    "sprint",
    "sprints",
    "goal",
    "goals",
    "target",
    "targets",
    "kpi",
    "kpis",
    "metric",
    "metrics",
    "result",
    "results",
    "outcome",
    "outcomes",
    "progress",
    "status",
    "share",
    "shared",
    "sharing",
    "getting",
    "using",
    "looking",
    "think",
    "thinks",
    "thought",
    "thoughts",
    "brainstorm",
    "brainstorms",
    "brainstorming",
    "discuss",
    "discussion",
    "discussions",
    "maybe",
    "ensure",
    "ensuring",
    "provide",
    "provided",
    "provides",
    "follow",
    "following",
    "followed",
    "followup",
    "follow-up",
    "action",
    "actions",
    "item",
    "items",
    "todo",
    "todos",
    "list",
    "lists",
    "track",
    "tracking",
    "tracked",
    "deliver",
    "delivered",
    "delivery",
    "deliveries",
    "ship",
    "shipping",
    "shipped",
    "story",
    "stories",
    "across",
    "around",
    "between",
    "among",
    "again",
    "already",
    "per",
    "etc",
    "kind",
    "sort",
    "really",
    "maybe",
    "just",
    "even",
    "ever",
    "never",
    "soon",
    "later",
    "early",
    "late",
    "first",
    "second",
    "third",
]);
const PASSION_POINT_DECIMAL_PLACES = 4;
const CLOVER_LOOKUP_DEFAULT_LIMIT = 10;
const CLOVER_LOOKUP_MIN_LIMIT = 1;
const CLOVER_LOOKUP_MAX_LIMIT = 25;
const CLOVER_LOOKUP_SUMMARY_LIMIT = 120;
const CLOVER_SYSTEM_PROMPT = `You are Clover AI, the concierge for Golden Workplace's Outer Gates. Your role is to help founders surface passions, route raw context into the right company workspaces, and recommend actionable next steps.\n\nGuidelines:\n- Greet warmly yet concisely; speak like a strategic partner who understands venture building.\n- Ask focused clarifying questions when the goal or next step is uncertain.\n- Summarize the essence of what you heard before proposing actions.\n- Recommend an existing workspace or suggest creating a new one when appropriate.\n- Offer up to three concrete next steps formatted as short bullet prompts starting with \">\" or "▶".\n- Highlight relevant artifacts or integrations already connected to the Outer Gates.\n- Capture breakthrough ideas as insights when you detect a durable pattern, even if the user doesn’t explicitly ask.\n- Before calling update_company or update_insight, run list_companies or list_insights to confirm the exact id unless it was already surfaced in this session.\n- Keep responses under roughly 170 words, using short paragraphs and a motivating closing invitation.\n- Never fabricate tools or integrations that aren't in the provided data.\n- When it's time to take workspace action, explain the plan first and then encode the exact operations in a function call block.\n\nAvailable Automation Functions:\n${cloverAutomationFunctionPromptList}\n\nFunction Call Format:\n- If no automated action is required, omit the block entirely.\n- Otherwise append a <functionCalls>...</functionCalls> block after your conversational reply.\n- Inside the block provide strictly valid JSON in one of these shapes: {"function_calls": [ ... ]}, [ ... ], or a single call object.\n- Each call object must include a "name" and an "arguments" object containing the payload.\n\nExample:\n<functionCalls>\n{\n  "function_calls": [\n    {\n      "name": "create_company",\n      "arguments": {\n        "companies": [\n          {\n            "name": "Orchid Labs",\n            "vision": "Launch regenerative retreats across the Pacific Northwest"\n          }\n        ]\n      }\n    }\n  ]\n}\n</functionCalls>`;
const CLOVER_AUTOMATION_DEFINITION_BY_NAME = new Map(cloverAutomationFunctions.map((fn) => [fn.name, fn]));
const CLOVER_WELCOME_TEXT = "Welcome back to the Outer Gates! Tell me what spark you want to explore and I’ll line it up with the right workspace.";
export class ClineProvider extends EventEmitter {
    context;
    outputChannel;
    renderContext;
    contextProxy;
    static globalWorkplaceService;
    static globalEndlessSurfaceService;
    static globalCloverSessionService;
    // Used in package.json as the view's id. This value cannot be changed due
    // to how VSCode caches views based on their id, and updating the id would
    // break existing instances of the extension.
    static sideBarId = `${Package.name}.SidebarProvider`;
    static tabPanelId = `${Package.name}.TabPanelProvider`;
    static activeInstances = new Set();
    disposables = [];
    webviewDisposables = [];
    view;
    clineStack = [];
    codeIndexStatusSubscription;
    codeIndexManager;
    _workspaceTracker; // workSpaceTracker read-only for access outside this class
    mcpHub; // Change from private to protected
    marketplaceManager;
    mdmService;
    taskCreationCallback;
    taskEventListeners = new WeakMap();
    currentWorkspacePath;
    workplaceService;
    endlessSurfaceService;
    cloverSessionService;
    isApplyingExternalOuterGateState = false;
    cloverSessionsInitialized = false;
    cloverSessionWarningShown = false;
    lastCloverSessionFetchErrorAt;
    endlessSurfaceListenerCleanup = [];
    outerGateState;
    outerGateManager;
    outerGateManagerPromise;
    recentTasksCache;
    pendingOperations = new Map();
    static PENDING_OPERATION_TIMEOUT_MS = 30000; // 30 seconds
    conversationHub;
    isViewLaunched = false;
    settingsImportedAt;
    latestAnnouncementId = "aug-25-2025-grok-code-fast"; // Update for Grok Code Fast announcement
    providerSettingsManager;
    customModesManager;
    constructor(context, outputChannel, renderContext = "sidebar", contextProxy, mdmService) {
        super();
        this.context = context;
        this.outputChannel = outputChannel;
        this.renderContext = renderContext;
        this.contextProxy = contextProxy;
        this.currentWorkspacePath = getWorkspacePath();
        ClineProvider.activeInstances.add(this);
        if (!this.workplaceService && ClineProvider.globalWorkplaceService) {
            this.workplaceService = ClineProvider.globalWorkplaceService;
        }
        if (ClineProvider.globalEndlessSurfaceService) {
            this.attachEndlessSurfaceService(ClineProvider.globalEndlessSurfaceService);
        }
        this.outerGateState = createInitialOuterGateState(this.workplaceService?.getState());
        this.initializeOuterGateManager();
        this.mdmService = mdmService;
        this.updateGlobalState("codebaseIndexModels", EMBEDDING_MODEL_PROFILES);
        // Start configuration loading (which might trigger indexing) in the background.
        // Don't await, allowing activation to continue immediately.
        // Register this provider with the telemetry service to enable it to add
        // properties like mode and provider.
        TelemetryService.instance.setProvider(this);
        this._workspaceTracker = new WorkspaceTracker(this);
        this.providerSettingsManager = new ProviderSettingsManager(this.context);
        this.customModesManager = new CustomModesManager(this.context, async () => {
            await this.postStateToWebview();
        });
        // Initialize MCP Hub through the singleton manager
        McpServerManager.getInstance(this.context, this)
            .then((hub) => {
            this.mcpHub = hub;
            this.mcpHub.registerClient();
        })
            .catch((error) => {
            this.log(`Failed to initialize MCP Hub: ${error}`);
        });
        this.marketplaceManager = new MarketplaceManager(this.context, this.customModesManager);
        this.conversationHub = new ConversationHubService(this);
        this.conversationHub.on("stateChanged", () => {
            void this.postStateToWebview();
        });
        // Forward <most> task events to the provider.
        // We do something fairly similar for the IPC-based API.
        this.taskCreationCallback = (instance) => {
            this.emit(RooCodeEventName.TaskCreated, instance);
            // Create named listener functions so we can remove them later.
            const onTaskStarted = () => this.emit(RooCodeEventName.TaskStarted, instance.taskId);
            const onTaskCompleted = (taskId, tokenUsage, toolUsage) => this.emit(RooCodeEventName.TaskCompleted, taskId, tokenUsage, toolUsage);
            const onTaskAborted = () => this.emit(RooCodeEventName.TaskAborted, instance.taskId);
            const onTaskFocused = () => this.emit(RooCodeEventName.TaskFocused, instance.taskId);
            const onTaskUnfocused = () => this.emit(RooCodeEventName.TaskUnfocused, instance.taskId);
            const onTaskActive = (taskId) => this.emit(RooCodeEventName.TaskActive, taskId);
            const onTaskInteractive = (taskId) => this.emit(RooCodeEventName.TaskInteractive, taskId);
            const onTaskResumable = (taskId) => this.emit(RooCodeEventName.TaskResumable, taskId);
            const onTaskIdle = (taskId) => this.emit(RooCodeEventName.TaskIdle, taskId);
            const onTaskPaused = (taskId) => this.emit(RooCodeEventName.TaskPaused, taskId);
            const onTaskUnpaused = (taskId) => this.emit(RooCodeEventName.TaskUnpaused, taskId);
            const onTaskSpawned = (taskId) => this.emit(RooCodeEventName.TaskSpawned, taskId);
            const onTaskUserMessage = (taskId) => this.emit(RooCodeEventName.TaskUserMessage, taskId);
            const onTaskTokenUsageUpdated = (taskId, tokenUsage) => this.emit(RooCodeEventName.TaskTokenUsageUpdated, taskId, tokenUsage);
            // Attach the listeners.
            instance.on(RooCodeEventName.TaskStarted, onTaskStarted);
            instance.on(RooCodeEventName.TaskCompleted, onTaskCompleted);
            instance.on(RooCodeEventName.TaskAborted, onTaskAborted);
            instance.on(RooCodeEventName.TaskFocused, onTaskFocused);
            instance.on(RooCodeEventName.TaskUnfocused, onTaskUnfocused);
            instance.on(RooCodeEventName.TaskActive, onTaskActive);
            instance.on(RooCodeEventName.TaskInteractive, onTaskInteractive);
            instance.on(RooCodeEventName.TaskResumable, onTaskResumable);
            instance.on(RooCodeEventName.TaskIdle, onTaskIdle);
            instance.on(RooCodeEventName.TaskPaused, onTaskPaused);
            instance.on(RooCodeEventName.TaskUnpaused, onTaskUnpaused);
            instance.on(RooCodeEventName.TaskSpawned, onTaskSpawned);
            instance.on(RooCodeEventName.TaskUserMessage, onTaskUserMessage);
            instance.on(RooCodeEventName.TaskTokenUsageUpdated, onTaskTokenUsageUpdated);
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
            ]);
        };
        // Initialize Roo Code Cloud profile sync.
        if (CloudService.hasInstance()) {
            this.initializeCloudProfileSync().catch((error) => {
                this.log(`Failed to initialize cloud profile sync: ${error}`);
            });
        }
        else {
            this.log("CloudService not ready, deferring cloud profile sync");
        }
    }
    attachWorkplaceService(service) {
        this.workplaceService = service;
        ClineProvider.globalWorkplaceService = service;
    }
    getWorkplaceService() {
        if (!this.workplaceService && ClineProvider.globalWorkplaceService) {
            this.workplaceService = ClineProvider.globalWorkplaceService;
        }
        return this.workplaceService;
    }
    async chooseWorkplaceRootFolder(ownerName) {
        if (!this.workplaceFilesystemManager) {
            throw new Error("Workplace filesystem manager is unavailable");
        }
        await this.workplaceFilesystemManager.chooseRootFolder({ ownerName });
    }
    attachCloverSessionService(service) {
        this.cloverSessionService = service;
        ClineProvider.globalCloverSessionService = service;
    }
    getCloverSessionService() {
        if (this.cloverSessionService) {
            return this.cloverSessionService;
        }
        if (ClineProvider.globalCloverSessionService) {
            this.cloverSessionService = ClineProvider.globalCloverSessionService;
            return this.cloverSessionService;
        }
        const service = new CloverSessionService(this.context, () => this.getWorkplaceService());
        ClineProvider.globalCloverSessionService = service;
        this.cloverSessionService = service;
        return this.cloverSessionService;
    }
    attachEndlessSurfaceService(service) {
        if (this.endlessSurfaceService === service) {
            return;
        }
        this.cleanupEndlessSurfaceListeners();
        this.endlessSurfaceService = service;
        ClineProvider.globalEndlessSurfaceService = service;
        const stateHandler = this.handleEndlessSurfaceStateChange;
        service.on("stateChanged", stateHandler);
        service.on("surfaceUpdated", stateHandler);
        service.on("surfaceDeleted", stateHandler);
        this.endlessSurfaceListenerCleanup = [
            () => service.off("stateChanged", stateHandler),
            () => service.off("surfaceUpdated", stateHandler),
            () => service.off("surfaceDeleted", stateHandler),
        ];
        void this.postStateToWebview();
    }
    getEndlessSurfaceService() {
        if (!this.endlessSurfaceService && ClineProvider.globalEndlessSurfaceService) {
            this.attachEndlessSurfaceService(ClineProvider.globalEndlessSurfaceService);
        }
        return this.endlessSurfaceService;
    }
    cleanupEndlessSurfaceListeners() {
        if (!this.endlessSurfaceListenerCleanup.length) {
            return;
        }
        for (const dispose of this.endlessSurfaceListenerCleanup) {
            try {
                dispose();
            }
            catch (error) {
                this.log(`Failed to remove endless surface listener: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        this.endlessSurfaceListenerCleanup = [];
    }
    handleEndlessSurfaceStateChange = () => {
        void this.postStateToWebview();
    };
    getConversationHub() {
        return this.conversationHub;
    }
    /**
     * Override EventEmitter's on method to match TaskProviderLike interface
     */
    on(event, listener) {
        return super.on(event, listener);
    }
    /**
     * Override EventEmitter's off method to match TaskProviderLike interface
     */
    off(event, listener) {
        return super.off(event, listener);
    }
    /**
     * Initialize cloud profile synchronization
     */
    async initializeCloudProfileSync() {
        try {
            // Check if authenticated and sync profiles
            if (CloudService.hasInstance() && CloudService.instance.isAuthenticated()) {
                await this.syncCloudProfiles();
            }
            // Set up listener for future updates
            if (CloudService.hasInstance()) {
                CloudService.instance.on("settings-updated", this.handleCloudSettingsUpdate);
            }
        }
        catch (error) {
            this.log(`Error in initializeCloudProfileSync: ${error}`);
        }
    }
    /**
     * Handle cloud settings updates
     */
    handleCloudSettingsUpdate = async () => {
        try {
            await this.syncCloudProfiles();
        }
        catch (error) {
            this.log(`Error handling cloud settings update: ${error}`);
        }
    };
    /**
     * Synchronize cloud profiles with local profiles.
     */
    async syncCloudProfiles() {
        try {
            const settings = CloudService.instance.getOrganizationSettings();
            if (!settings?.providerProfiles) {
                return;
            }
            const currentApiConfigName = this.getGlobalState("currentApiConfigName");
            const result = await this.providerSettingsManager.syncCloudProfiles(settings.providerProfiles, currentApiConfigName);
            if (result.hasChanges) {
                // Update list.
                await this.updateGlobalState("listApiConfigMeta", await this.providerSettingsManager.listConfig());
                if (result.activeProfileChanged && result.activeProfileId) {
                    // Reload full settings for new active profile.
                    const profile = await this.providerSettingsManager.getProfile({
                        id: result.activeProfileId,
                    });
                    await this.activateProviderProfile({ name: profile.name });
                }
                await this.postStateToWebview();
            }
        }
        catch (error) {
            this.log(`Error syncing cloud profiles: ${error}`);
        }
    }
    /**
     * Initialize cloud profile synchronization when CloudService is ready
     * This method is called externally after CloudService has been initialized
     */
    async initializeCloudProfileSyncWhenReady() {
        try {
            if (CloudService.hasInstance() && CloudService.instance.isAuthenticated()) {
                await this.syncCloudProfiles();
            }
            if (CloudService.hasInstance()) {
                CloudService.instance.off("settings-updated", this.handleCloudSettingsUpdate);
                CloudService.instance.on("settings-updated", this.handleCloudSettingsUpdate);
            }
        }
        catch (error) {
            this.log(`Failed to initialize cloud profile sync when ready: ${error}`);
        }
    }
    // Adds a new Task instance to clineStack, marking the start of a new task.
    // The instance is pushed to the top of the stack (LIFO order).
    // When the task is completed, the top instance is removed, reactivating the
    // previous task.
    async addClineToStack(task) {
        // Add this cline instance into the stack that represents the order of
        // all the called tasks.
        this.clineStack.push(task);
        task.emit(RooCodeEventName.TaskFocused);
        // Perform special setup provider specific tasks.
        await this.performPreparationTasks(task);
        // Ensure getState() resolves correctly.
        const state = await this.getState();
        if (!state || typeof state.mode !== "string") {
            throw new Error(t("common:errors.retrieve_current_mode"));
        }
    }
    async performPreparationTasks(cline) {
        // LMStudio: We need to force model loading in order to read its context
        // size; we do it now since we're starting a task with that model selected.
        if (cline.apiConfiguration && cline.apiConfiguration.apiProvider === "lmstudio") {
            try {
                if (!hasLoadedFullDetails(cline.apiConfiguration.lmStudioModelId)) {
                    await forceFullModelDetailsLoad(cline.apiConfiguration.lmStudioBaseUrl ?? "http://localhost:1234", cline.apiConfiguration.lmStudioModelId);
                }
            }
            catch (error) {
                this.log(`Failed to load full model details for LM Studio: ${error}`);
                vscode.window.showErrorMessage(error.message);
            }
        }
    }
    // Removes and destroys the top Cline instance (the current finished task),
    // activating the previous one (resuming the parent task).
    async removeClineFromStack() {
        if (this.clineStack.length === 0) {
            return;
        }
        // Pop the top Cline instance from the stack.
        let task = this.clineStack.pop();
        if (task) {
            task.emit(RooCodeEventName.TaskUnfocused);
            try {
                // Abort the running task and set isAbandoned to true so
                // all running promises will exit as well.
                await task.abortTask(true);
            }
            catch (e) {
                this.log(`[ClineProvider#removeClineFromStack] abortTask() failed ${task.taskId}.${task.instanceId}: ${e.message}`);
            }
            // Remove event listeners before clearing the reference.
            const cleanupFunctions = this.taskEventListeners.get(task);
            if (cleanupFunctions) {
                cleanupFunctions.forEach((cleanup) => cleanup());
                this.taskEventListeners.delete(task);
            }
            // Make sure no reference kept, once promises end it will be
            // garbage collected.
            task = undefined;
        }
    }
    getTaskStackSize() {
        return this.clineStack.length;
    }
    getCurrentTaskStack() {
        return this.clineStack.map((cline) => cline.taskId);
    }
    // Remove the current task/cline instance (at the top of the stack), so this
    // task is finished and resume the previous task/cline instance (if it
    // exists).
    // This is used when a subtask is finished and the parent task needs to be
    // resumed.
    async finishSubTask(lastMessage) {
        // Remove the last cline instance from the stack (this is the finished
        // subtask).
        await this.removeClineFromStack();
        // Resume the last cline instance in the stack (if it exists - this is
        // the 'parent' calling task).
        await this.getCurrentTask()?.completeSubtask(lastMessage);
    }
    // Pending Edit Operations Management
    /**
     * Sets a pending edit operation with automatic timeout cleanup
     */
    setPendingEditOperation(operationId, editData) {
        // Clear any existing operation with the same ID
        this.clearPendingEditOperation(operationId);
        // Create timeout for automatic cleanup
        const timeoutId = setTimeout(() => {
            this.clearPendingEditOperation(operationId);
            this.log(`[setPendingEditOperation] Automatically cleared stale pending operation: ${operationId}`);
        }, ClineProvider.PENDING_OPERATION_TIMEOUT_MS);
        // Store the operation
        this.pendingOperations.set(operationId, {
            ...editData,
            timeoutId,
            createdAt: Date.now(),
        });
        this.log(`[setPendingEditOperation] Set pending operation: ${operationId}`);
    }
    /**
     * Gets a pending edit operation by ID
     */
    getPendingEditOperation(operationId) {
        return this.pendingOperations.get(operationId);
    }
    /**
     * Clears a specific pending edit operation
     */
    clearPendingEditOperation(operationId) {
        const operation = this.pendingOperations.get(operationId);
        if (operation) {
            clearTimeout(operation.timeoutId);
            this.pendingOperations.delete(operationId);
            this.log(`[clearPendingEditOperation] Cleared pending operation: ${operationId}`);
            return true;
        }
        return false;
    }
    /**
     * Clears all pending edit operations
     */
    clearAllPendingEditOperations() {
        for (const [operationId, operation] of this.pendingOperations) {
            clearTimeout(operation.timeoutId);
        }
        this.pendingOperations.clear();
        this.log(`[clearAllPendingEditOperations] Cleared all pending operations`);
    }
    /*
    VSCode extensions use the disposable pattern to clean up resources when the sidebar/editor tab is closed by the user or system. This applies to event listening, commands, interacting with the UI, etc.
    - https://vscode-docs.readthedocs.io/en/stable/extensions/patterns-and-principles/
    - https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
    */
    clearWebviewResources() {
        while (this.webviewDisposables.length) {
            const x = this.webviewDisposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    async dispose() {
        this.log("Disposing ClineProvider...");
        // Clear all tasks from the stack.
        while (this.clineStack.length > 0) {
            await this.removeClineFromStack();
        }
        this.log("Cleared all tasks");
        // Clear all pending edit operations to prevent memory leaks
        this.clearAllPendingEditOperations();
        this.log("Cleared pending operations");
        if (this.view && "dispose" in this.view) {
            this.view.dispose();
            this.log("Disposed webview");
        }
        this.clearWebviewResources();
        // Clean up cloud service event listener
        if (CloudService.hasInstance()) {
            CloudService.instance.off("settings-updated", this.handleCloudSettingsUpdate);
        }
        while (this.disposables.length) {
            const x = this.disposables.pop();
            if (x) {
                x.dispose();
            }
        }
        this._workspaceTracker?.dispose();
        this._workspaceTracker = undefined;
        await this.mcpHub?.unregisterClient();
        this.mcpHub = undefined;
        this.marketplaceManager?.cleanup();
        this.customModesManager?.dispose();
        this.conversationHub.dispose();
        this.cleanupEndlessSurfaceListeners();
        this.endlessSurfaceService = undefined;
        this.log("Disposed all disposables");
        ClineProvider.activeInstances.delete(this);
        // Clean up any event listeners attached to this provider
        this.removeAllListeners();
        McpServerManager.unregisterProvider(this);
    }
    static getVisibleInstance() {
        return findLast(Array.from(this.activeInstances), (instance) => instance.view?.visible === true);
    }
    static async getInstance() {
        let visibleProvider = ClineProvider.getVisibleInstance();
        // If no visible provider, try to show the sidebar view
        if (!visibleProvider) {
            await vscode.commands.executeCommand(`${Package.name}.SidebarProvider.focus`);
            // Wait briefly for the view to become visible
            await delay(100);
            visibleProvider = ClineProvider.getVisibleInstance();
        }
        // If still no visible provider, return
        if (!visibleProvider) {
            return;
        }
        return visibleProvider;
    }
    static async isActiveTask() {
        const visibleProvider = await ClineProvider.getInstance();
        if (!visibleProvider) {
            return false;
        }
        // Check if there is a cline instance in the stack (if this provider has an active task)
        if (visibleProvider.getCurrentTask()) {
            return true;
        }
        return false;
    }
    static async handleCodeAction(command, promptType, params) {
        // Capture telemetry for code action usage
        TelemetryService.instance.captureCodeActionUsed(promptType);
        const visibleProvider = await ClineProvider.getInstance();
        if (!visibleProvider) {
            return;
        }
        const { customSupportPrompts } = await visibleProvider.getState();
        // TODO: Improve type safety for promptType.
        const prompt = supportPrompt.create(promptType, params, customSupportPrompts);
        if (command === "addToContext") {
            await visibleProvider.postMessageToWebview({ type: "invoke", invoke: "setChatBoxMessage", text: prompt });
            return;
        }
        await visibleProvider.createTask(prompt);
    }
    static async handleTerminalAction(command, promptType, params) {
        TelemetryService.instance.captureCodeActionUsed(promptType);
        const visibleProvider = await ClineProvider.getInstance();
        if (!visibleProvider) {
            return;
        }
        const { customSupportPrompts } = await visibleProvider.getState();
        const prompt = supportPrompt.create(promptType, params, customSupportPrompts);
        if (command === "terminalAddToContext") {
            await visibleProvider.postMessageToWebview({ type: "invoke", invoke: "setChatBoxMessage", text: prompt });
            return;
        }
        try {
            await visibleProvider.createTask(prompt);
        }
        catch (error) {
            if (error instanceof OrganizationAllowListViolationError) {
                // Errors from terminal commands seem to get swallowed / ignored.
                vscode.window.showErrorMessage(error.message);
            }
            throw error;
        }
    }
    async resolveWebviewView(webviewView) {
        this.view = webviewView;
        // kilocode_change start: extract constant inTabMode
        // Set panel reference according to webview type
        const inTabMode = "onDidChangeViewState" in webviewView;
        if (inTabMode) {
            setPanel(webviewView, "tab");
        }
        else if ("onDidChangeVisibility" in webviewView) {
            setPanel(webviewView, "sidebar");
        }
        // kilocode_change end
        // Initialize out-of-scope variables that need to receive persistent
        // global state values.
        this.getState().then(({ terminalShellIntegrationTimeout = Terminal.defaultShellIntegrationTimeout, terminalShellIntegrationDisabled = true, // kilocode_change: default
        terminalCommandDelay = 0, terminalZshClearEolMark = true, terminalZshOhMy = false, terminalZshP10k = false, terminalPowershellCounter = false, terminalZdotdir = false, }) => {
            Terminal.setShellIntegrationTimeout(terminalShellIntegrationTimeout);
            Terminal.setShellIntegrationDisabled(terminalShellIntegrationDisabled);
            Terminal.setCommandDelay(terminalCommandDelay);
            Terminal.setTerminalZshClearEolMark(terminalZshClearEolMark);
            Terminal.setTerminalZshOhMy(terminalZshOhMy);
            Terminal.setTerminalZshP10k(terminalZshP10k);
            Terminal.setPowershellCounter(terminalPowershellCounter);
            Terminal.setTerminalZdotdir(terminalZdotdir);
        });
        this.getState().then(({ ttsEnabled }) => {
            setTtsEnabled(ttsEnabled ?? false);
        });
        this.getState().then(({ ttsSpeed }) => {
            setTtsSpeed(ttsSpeed ?? 1);
        });
        // Set up webview options with proper resource roots
        const resourceRoots = [this.contextProxy.extensionUri];
        // Add workspace folders to allow access to workspace files
        if (vscode.workspace.workspaceFolders) {
            resourceRoots.push(...vscode.workspace.workspaceFolders.map((folder) => folder.uri));
        }
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: resourceRoots,
        };
        webviewView.webview.html =
            this.contextProxy.extensionMode === vscode.ExtensionMode.Development
                ? await this.getHMRHtmlContent(webviewView.webview)
                : this.getHtmlContent(webviewView.webview);
        // Sets up an event listener to listen for messages passed from the webview view context
        // and executes code based on the message that is received.
        this.setWebviewMessageListener(webviewView.webview);
        // Initialize code index status subscription for the current workspace.
        this.updateCodeIndexStatusSubscription();
        // Listen for active editor changes to update code index status for the
        // current workspace.
        const activeEditorSubscription = vscode.window.onDidChangeActiveTextEditor(() => {
            // Update subscription when workspace might have changed.
            this.updateCodeIndexStatusSubscription();
        });
        this.webviewDisposables.push(activeEditorSubscription);
        // Listen for when the panel becomes visible.
        // https://github.com/microsoft/vscode-discussions/discussions/840
        if ("onDidChangeViewState" in webviewView) {
            // WebviewView and WebviewPanel have all the same properties except
            // for this visibility listener panel.
            const viewStateDisposable = webviewView.onDidChangeViewState(() => {
                if (this.view?.visible) {
                    this.postMessageToWebview({ type: "action", action: "didBecomeVisible" });
                }
            });
            this.webviewDisposables.push(viewStateDisposable);
        }
        else if ("onDidChangeVisibility" in webviewView) {
            // sidebar
            const visibilityDisposable = webviewView.onDidChangeVisibility(() => {
                if (this.view?.visible) {
                    this.postMessageToWebview({ type: "action", action: "didBecomeVisible" });
                }
            });
            this.webviewDisposables.push(visibilityDisposable);
        }
        // Listen for when the view is disposed
        // This happens when the user closes the view or when the view is closed programmatically
        webviewView.onDidDispose(async () => {
            if (inTabMode) {
                this.log("Disposing ClineProvider instance for tab view");
                await this.dispose();
            }
            else {
                this.log("Clearing webview resources for sidebar view");
                this.clearWebviewResources();
                // Reset current workspace manager reference when view is disposed
                this.codeIndexManager = undefined;
            }
        }, null, this.disposables);
        // Listen for when color changes
        const configDisposable = vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (e && e.affectsConfiguration("workbench.colorTheme")) {
                // Sends latest theme name to webview
                await this.postMessageToWebview({ type: "theme", text: JSON.stringify(await getTheme()) });
            }
        });
        this.webviewDisposables.push(configDisposable);
        // If the extension is starting a new session, clear previous task state.
        await this.removeClineFromStack();
    }
    async createTaskWithHistoryItem(historyItem) {
        await this.removeClineFromStack();
        // If the history item has a saved mode, restore it and its associated API configuration.
        if (historyItem.mode) {
            // Validate that the mode still exists
            const customModes = await this.customModesManager.getCustomModes();
            const modeExists = getModeBySlug(historyItem.mode, customModes) !== undefined;
            if (!modeExists) {
                // Mode no longer exists, fall back to default mode.
                this.log(`Mode '${historyItem.mode}' from history no longer exists. Falling back to default mode '${defaultModeSlug}'.`);
                historyItem.mode = defaultModeSlug;
            }
            await this.updateGlobalState("mode", historyItem.mode);
            // Load the saved API config for the restored mode if it exists.
            const savedConfigId = await this.providerSettingsManager.getModeConfigId(historyItem.mode);
            const listApiConfig = await this.providerSettingsManager.listConfig();
            // Update listApiConfigMeta first to ensure UI has latest data.
            await this.updateGlobalState("listApiConfigMeta", listApiConfig);
            // If this mode has a saved config, use it.
            if (savedConfigId) {
                const profile = listApiConfig.find(({ id }) => id === savedConfigId);
                if (profile?.name) {
                    try {
                        await this.activateProviderProfile({ name: profile.name });
                    }
                    catch (error) {
                        // Log the error but continue with task restoration.
                        this.log(`Failed to restore API configuration for mode '${historyItem.mode}': ${error instanceof Error ? error.message : String(error)}. Continuing with default configuration.`);
                        // The task will continue with the current/default configuration.
                    }
                }
            }
        }
        const state = await this.getState();
        const { apiConfiguration, diffEnabled: enableDiff, enableCheckpoints, fuzzyMatchThreshold, experiments, cloudUserInfo, remoteControlEnabled, } = await this.getState();
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
        });
        await this.addClineToStack(task);
        this.log(`[createTaskWithHistoryItem] ${task.parentTask ? "child" : "parent"} task ${task.taskId}.${task.instanceId} instantiated`);
        // Check if there's a pending edit after checkpoint restoration
        const operationId = `task-${task.taskId}`;
        const pendingEdit = this.getPendingEditOperation(operationId);
        if (pendingEdit) {
            this.clearPendingEditOperation(operationId); // Clear the pending edit
            this.log(`[createTaskWithHistoryItem] Processing pending edit after checkpoint restoration`);
            // Process the pending edit after a short delay to ensure the task is fully initialized
            setTimeout(async () => {
                try {
                    // Find the message index in the restored state
                    const { messageIndex, apiConversationHistoryIndex } = (() => {
                        const messageIndex = task.clineMessages.findIndex((msg) => msg.ts === pendingEdit.messageTs);
                        const apiConversationHistoryIndex = task.apiConversationHistory.findIndex((msg) => msg.ts === pendingEdit.messageTs);
                        return { messageIndex, apiConversationHistoryIndex };
                    })();
                    if (messageIndex !== -1) {
                        // Remove the target message and all subsequent messages
                        await task.overwriteClineMessages(task.clineMessages.slice(0, messageIndex));
                        if (apiConversationHistoryIndex !== -1) {
                            await task.overwriteApiConversationHistory(task.apiConversationHistory.slice(0, apiConversationHistoryIndex));
                        }
                        // Process the edited message
                        await task.handleWebviewAskResponse("messageResponse", pendingEdit.editedContent, pendingEdit.images);
                    }
                }
                catch (error) {
                    this.log(`[createTaskWithHistoryItem] Error processing pending edit: ${error}`);
                }
            }, 100); // Small delay to ensure task is fully ready
        }
        return task;
    }
    async postMessageToWebview(message) {
        await this.view?.webview.postMessage(message);
    }
    async getHMRHtmlContent(webview) {
        let localPort = "5173";
        try {
            const fs = require("fs");
            const path = require("path");
            const portFilePath = path.resolve(__dirname, "../../.vite-port");
            if (fs.existsSync(portFilePath)) {
                localPort = fs.readFileSync(portFilePath, "utf8").trim();
                console.log(`[ClineProvider:Vite] Using Vite server port from ${portFilePath}: ${localPort}`);
            }
            else {
                console.log(`[ClineProvider:Vite] Port file not found at ${portFilePath}, using default port: ${localPort}`);
            }
        }
        catch (err) {
            console.error("[ClineProvider:Vite] Failed to read Vite port file:", err);
        }
        const localServerUrl = `localhost:${localPort}`;
        // Check if local dev server is running.
        try {
            await axios.get(`http://${localServerUrl}`);
        }
        catch (error) {
            vscode.window.showErrorMessage(t("common:errors.hmr_not_running"));
            return this.getHtmlContent(webview);
        }
        const nonce = getNonce();
        const stylesUri = getUri(webview, this.contextProxy.extensionUri, [
            "webview-ui",
            "build",
            "assets",
            "index.css",
        ]);
        const codiconsUri = getUri(webview, this.contextProxy.extensionUri, ["assets", "codicons", "codicon.css"]);
        const materialIconsUri = getUri(webview, this.contextProxy.extensionUri, [
            "assets",
            "vscode-material-icons",
            "icons",
        ]);
        const imagesUri = getUri(webview, this.contextProxy.extensionUri, ["assets", "images"]);
        const audioUri = getUri(webview, this.contextProxy.extensionUri, ["webview-ui", "audio"]);
        const file = "src/index.tsx";
        const scriptUri = `http://${localServerUrl}/${file}`;
        const reactRefresh = /*html*/ `
			<script nonce="${nonce}" type="module">
				import RefreshRuntime from "http://localhost:${localPort}/@react-refresh"
				RefreshRuntime.injectIntoGlobalHook(window)
				window.$RefreshReg$ = () => {}
				window.$RefreshSig$ = () => (type) => type
				window.__vite_plugin_react_preamble_installed__ = true
			</script>
		`;
        const csp = [
            "default-src 'none'",
            `font-src ${webview.cspSource} data:`,
            `style-src ${webview.cspSource} 'unsafe-inline' https://* http://${localServerUrl} http://0.0.0.0:${localPort}`,
            `img-src ${webview.cspSource} https://storage.googleapis.com https://img.clerk.com data: https://*.googleusercontent.com https://*.googleapis.com https://*.githubusercontent.com`, // kilocode_change: add https://*.googleusercontent.com and https://*.googleapis.com and https://*.githubusercontent.com
            `media-src ${webview.cspSource}`,
            `script-src 'unsafe-eval' ${webview.cspSource} https://* https://*.posthog.com http://${localServerUrl} http://0.0.0.0:${localPort} 'nonce-${nonce}'`,
            `connect-src ${webview.cspSource} https://* http://localhost:3000 https://*.posthog.com ws://${localServerUrl} ws://0.0.0.0:${localPort} http://${localServerUrl} http://0.0.0.0:${localPort}`, // kilocode_change: add http://localhost:3000
        ];
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
		`;
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
    getHtmlContent(webview) {
        // Get the local path to main script run in the webview,
        // then convert it to a uri we can use in the webview.
        // The CSS file from the React build output
        const stylesUri = getUri(webview, this.contextProxy.extensionUri, [
            "webview-ui",
            "build",
            "assets",
            "index.css",
        ]);
        const scriptUri = getUri(webview, this.contextProxy.extensionUri, ["webview-ui", "build", "assets", "index.js"]);
        const codiconsUri = getUri(webview, this.contextProxy.extensionUri, ["assets", "codicons", "codicon.css"]);
        const materialIconsUri = getUri(webview, this.contextProxy.extensionUri, [
            "assets",
            "vscode-material-icons",
            "icons",
        ]);
        const imagesUri = getUri(webview, this.contextProxy.extensionUri, ["assets", "images"]);
        const audioUri = getUri(webview, this.contextProxy.extensionUri, ["webview-ui", "audio"]);
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
        const nonce = getNonce();
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
      `;
    }
    /**
     * Sets up an event listener to listen for messages passed from the webview context and
     * executes code based on the message that is received.
     *
     * @param webview A reference to the extension webview
     */
    setWebviewMessageListener(webview) {
        const onReceiveMessage = async (message) => webviewMessageHandler(this, message, this.marketplaceManager);
        const messageDisposable = webview.onDidReceiveMessage(onReceiveMessage);
        this.webviewDisposables.push(messageDisposable);
    }
    /**
     * Handle switching to a new mode, including updating the associated API configuration
     * @param newMode The mode to switch to
     */
    async handleModeSwitch(newMode) {
        const task = this.getCurrentTask();
        if (task) {
            TelemetryService.instance.captureModeSwitch(task.taskId, newMode);
            task.emit(RooCodeEventName.TaskModeSwitched, task.taskId, newMode);
            try {
                // Update the task history with the new mode first.
                const history = this.getGlobalState("taskHistory") ?? [];
                const taskHistoryItem = history.find((item) => item.id === task.taskId);
                if (taskHistoryItem) {
                    taskHistoryItem.mode = newMode;
                    await this.updateTaskHistory(taskHistoryItem);
                }
                // Only update the task's mode after successful persistence.
                ;
                task._taskMode = newMode;
            }
            catch (error) {
                // If persistence fails, log the error but don't update the in-memory state.
                this.log(`Failed to persist mode switch for task ${task.taskId}: ${error instanceof Error ? error.message : String(error)}`);
                // Optionally, we could emit an event to notify about the failure.
                // This ensures the in-memory state remains consistent with persisted state.
                throw error;
            }
        }
        await this.updateGlobalState("mode", newMode);
        this.emit(RooCodeEventName.ModeChanged, newMode);
        // Load the saved API config for the new mode if it exists.
        const savedConfigId = await this.providerSettingsManager.getModeConfigId(newMode);
        const listApiConfig = await this.providerSettingsManager.listConfig();
        // Update listApiConfigMeta first to ensure UI has latest data.
        await this.updateGlobalState("listApiConfigMeta", listApiConfig);
        // If this mode has a saved config, use it.
        if (savedConfigId) {
            const profile = listApiConfig.find(({ id }) => id === savedConfigId);
            if (profile?.name) {
                await this.activateProviderProfile({ name: profile.name });
            }
        }
        else {
            // If no saved config for this mode, save current config as default.
            const currentApiConfigName = this.getGlobalState("currentApiConfigName");
            if (currentApiConfigName) {
                const config = listApiConfig.find((c) => c.name === currentApiConfigName);
                if (config?.id) {
                    await this.providerSettingsManager.setModeConfig(newMode, config.id);
                }
            }
        }
        await this.postStateToWebview();
    }
    // Provider Profile Management
    getProviderProfileEntries() {
        return this.contextProxy.getValues().listApiConfigMeta || [];
    }
    getProviderProfileEntry(name) {
        return this.getProviderProfileEntries().find((profile) => profile.name === name);
    }
    hasProviderProfileEntry(name) {
        return !!this.getProviderProfileEntry(name);
    }
    async upsertProviderProfile(name, providerSettings, activate = true) {
        try {
            // TODO: Do we need to be calling `activateProfile`? It's not
            // clear to me what the source of truth should be; in some cases
            // we rely on the `ContextProxy`'s data store and in other cases
            // we rely on the `ProviderSettingsManager`'s data store. It might
            // be simpler to unify these two.
            const id = await this.providerSettingsManager.saveConfig(name, providerSettings);
            if (activate) {
                const { mode } = await this.getState();
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
                ]);
                // Change the provider for the current task.
                // TODO: We should rename `buildApiHandler` for clarity (e.g. `getProviderClient`).
                const task = this.getCurrentTask();
                if (task) {
                    task.api = buildApiHandler(providerSettings);
                }
                await TelemetryService.instance.updateIdentity(providerSettings.kilocodeToken ?? ""); // kilocode_change
            }
            else {
                await this.updateGlobalState("listApiConfigMeta", await this.providerSettingsManager.listConfig());
            }
            await this.postStateToWebview();
            return id;
        }
        catch (error) {
            this.log(`Error create new api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`);
            vscode.window.showErrorMessage(t("common:errors.create_api_config"));
            return undefined;
        }
    }
    async deleteProviderProfile(profileToDelete) {
        const globalSettings = this.contextProxy.getValues();
        let profileToActivate = globalSettings.currentApiConfigName;
        if (profileToDelete.name === profileToActivate) {
            profileToActivate = this.getProviderProfileEntries().find(({ name }) => name !== profileToDelete.name)?.name;
        }
        if (!profileToActivate) {
            throw new Error("You cannot delete the last profile");
        }
        const entries = this.getProviderProfileEntries().filter(({ name }) => name !== profileToDelete.name);
        await this.contextProxy.setValues({
            ...globalSettings,
            currentApiConfigName: profileToActivate,
            listApiConfigMeta: entries,
        });
        await this.postStateToWebview();
    }
    async activateProviderProfile(args) {
        const { name, id, ...providerSettings } = await this.providerSettingsManager.activateProfile(args);
        // See `upsertProviderProfile` for a description of what this is doing.
        await Promise.all([
            this.contextProxy.setValue("listApiConfigMeta", await this.providerSettingsManager.listConfig()),
            this.contextProxy.setValue("currentApiConfigName", name),
            this.contextProxy.setProviderSettings(providerSettings),
        ]);
        const { mode } = await this.getState();
        if (id) {
            await this.providerSettingsManager.setModeConfig(mode, id);
        }
        // Change the provider for the current task.
        const task = this.getCurrentTask();
        if (task) {
            task.api = buildApiHandler(providerSettings);
        }
        await this.postStateToWebview();
        await TelemetryService.instance.updateIdentity(providerSettings.kilocodeToken ?? ""); // kilocode_change
        if (providerSettings.apiProvider) {
            this.emit(RooCodeEventName.ProviderProfileChanged, { name, provider: providerSettings.apiProvider });
        }
    }
    async updateCustomInstructions(instructions) {
        // User may be clearing the field.
        await this.updateGlobalState("customInstructions", instructions || undefined);
        await this.postStateToWebview();
    }
    // MCP
    async ensureMcpServersDirectoryExists() {
        // Get platform-specific application data directory
        let mcpServersDir;
        if (process.platform === "win32") {
            // Windows: %APPDATA%\Kilo-Code\MCP
            mcpServersDir = path.join(os.homedir(), "AppData", "Roaming", "Kilo-Code", "MCP");
        }
        else if (process.platform === "darwin") {
            // macOS: ~/Documents/Kilo-Code/MCP
            mcpServersDir = path.join(os.homedir(), "Documents", "Kilo-Code", "MCP");
        }
        else {
            // Linux: ~/.local/share/Kilo-Code/MCP
            mcpServersDir = path.join(os.homedir(), ".local", "share", "Kilo-Code", "MCP");
        }
        try {
            await fs.mkdir(mcpServersDir, { recursive: true });
        }
        catch (error) {
            // Fallback to a relative path if directory creation fails
            return path.join(os.homedir(), ".kilocode", "mcp");
        }
        return mcpServersDir;
    }
    async ensureSettingsDirectoryExists() {
        const { getSettingsDirectoryPath } = await import("../../utils/storage");
        const globalStoragePath = this.contextProxy.globalStorageUri.fsPath;
        return getSettingsDirectoryPath(globalStoragePath);
    }
    // OpenRouter
    async handleOpenRouterCallback(code) {
        let { apiConfiguration, currentApiConfigName = "default" } = await this.getState();
        let apiKey;
        try {
            const baseUrl = apiConfiguration.openRouterBaseUrl || "https://openrouter.ai/api/v1";
            // Extract the base domain for the auth endpoint.
            const baseUrlDomain = baseUrl.match(/^(https?:\/\/[^\/]+)/)?.[1] || "https://openrouter.ai";
            const response = await axios.post(`${baseUrlDomain}/api/v1/auth/keys`, { code });
            if (response.data && response.data.key) {
                apiKey = response.data.key;
            }
            else {
                throw new Error("Invalid response from OpenRouter API");
            }
        }
        catch (error) {
            this.log(`Error exchanging code for API key: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`);
            throw error;
        }
        const newConfiguration = {
            ...apiConfiguration,
            apiProvider: "openrouter",
            openRouterApiKey: apiKey,
            openRouterModelId: apiConfiguration?.openRouterModelId || openRouterDefaultModelId,
        };
        await this.upsertProviderProfile(currentApiConfigName, newConfiguration);
    }
    // Glama
    async handleGlamaCallback(code) {
        let apiKey;
        try {
            const response = await axios.post("https://glama.ai/api/gateway/v1/auth/exchange-code", { code });
            if (response.data && response.data.apiKey) {
                apiKey = response.data.apiKey;
            }
            else {
                throw new Error("Invalid response from Glama API");
            }
        }
        catch (error) {
            this.log(`Error exchanging code for API key: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`);
            throw error;
        }
        const { apiConfiguration, currentApiConfigName = "default" } = await this.getState();
        const newConfiguration = {
            ...apiConfiguration,
            apiProvider: "glama",
            glamaApiKey: apiKey,
            glamaModelId: apiConfiguration?.glamaModelId || glamaDefaultModelId,
        };
        await this.upsertProviderProfile(currentApiConfigName, newConfiguration);
    }
    // Requesty
    async handleRequestyCallback(code) {
        let { apiConfiguration, currentApiConfigName = "default" } = await this.getState();
        const newConfiguration = {
            ...apiConfiguration,
            apiProvider: "requesty",
            requestyApiKey: code,
            requestyModelId: apiConfiguration?.requestyModelId || requestyDefaultModelId,
        };
        await this.upsertProviderProfile(currentApiConfigName, newConfiguration);
    }
    // kilocode_change:
    async handleKiloCodeCallback(token) {
        const kilocode = "kilocode";
        let { apiConfiguration, currentApiConfigName = "default" } = await this.getState();
        await this.upsertProviderProfile(currentApiConfigName, {
            ...apiConfiguration,
            apiProvider: "kilocode",
            kilocodeToken: token,
        });
        vscode.window.showInformationMessage("Kilo Code successfully configured!");
        if (this.getCurrentTask()) {
            this.getCurrentTask().api = buildApiHandler({
                apiProvider: kilocode,
                kilocodeToken: token,
            });
        }
    }
    // Task history
    async getTaskWithId(id) {
        const history = this.getGlobalState("taskHistory") ?? [];
        const historyItem = history.find((item) => item.id === id);
        if (historyItem) {
            const { getTaskDirectoryPath } = await import("../../utils/storage");
            const globalStoragePath = this.contextProxy.globalStorageUri.fsPath;
            const taskDirPath = await getTaskDirectoryPath(globalStoragePath, id);
            const apiConversationHistoryFilePath = path.join(taskDirPath, GlobalFileNames.apiConversationHistory);
            const uiMessagesFilePath = path.join(taskDirPath, GlobalFileNames.uiMessages);
            const fileExists = await fileExistsAtPath(apiConversationHistoryFilePath);
            if (fileExists) {
                const apiConversationHistory = JSON.parse(await fs.readFile(apiConversationHistoryFilePath, "utf8"));
                return {
                    historyItem,
                    taskDirPath,
                    apiConversationHistoryFilePath,
                    uiMessagesFilePath,
                    apiConversationHistory,
                };
            }
            else {
                vscode.window.showErrorMessage(`Task file not found for task ID: ${id} (file ${apiConversationHistoryFilePath})`); //kilocode_change show extra debugging information to debug task not found issues
            }
        }
        else {
            vscode.window.showErrorMessage(`Task with ID: ${id} not found in history.`); // kilocode_change show extra debugging information to debug task not found issues
        }
        // if we tried to get a task that doesn't exist, remove it from state
        // FIXME: this seems to happen sometimes when the json file doesnt save to disk for some reason
        // await this.deleteTaskFromState(id) // kilocode_change disable confusing behaviour
        await this.setTaskFileNotFound(id); // kilocode_change
        throw new Error("Task not found");
    }
    async showTaskWithId(id) {
        if (id !== this.getCurrentTask()?.taskId) {
            // Non-current task.
            const { historyItem } = await this.getTaskWithId(id);
            await this.createTaskWithHistoryItem(historyItem); // Clears existing task.
        }
        await this.postMessageToWebview({ type: "action", action: "chatButtonClicked" });
    }
    async exportTaskWithId(id) {
        const { historyItem, apiConversationHistory } = await this.getTaskWithId(id);
        await downloadTask(historyItem.ts, apiConversationHistory);
    }
    /* Condenses a task's message history to use fewer tokens. */
    async condenseTaskContext(taskId) {
        let task;
        for (let i = this.clineStack.length - 1; i >= 0; i--) {
            if (this.clineStack[i].taskId === taskId) {
                task = this.clineStack[i];
                break;
            }
        }
        if (!task) {
            throw new Error(`Task with id ${taskId} not found in stack`);
        }
        await task.condenseContext();
        await this.postMessageToWebview({ type: "condenseTaskContextResponse", text: taskId });
    }
    // this function deletes a task from task hidtory, and deletes it's checkpoints and delete the task folder
    async deleteTaskWithId(id) {
        try {
            // get the task directory full path
            const { taskDirPath } = await this.getTaskWithId(id);
            // kilocode_change start
            // Check if task is favorited
            const history = this.getGlobalState("taskHistory") ?? [];
            const task = history.find((item) => item.id === id);
            if (task?.isFavorited) {
                throw new Error("Cannot delete a favorited task. Please unfavorite it first.");
            }
            // kilocode_change end
            // remove task from stack if it's the current task
            if (id === this.getCurrentTask()?.taskId) {
                // if we found the taskid to delete - call finish to abort this task and allow a new task to be started,
                // if we are deleting a subtask and parent task is still waiting for subtask to finish - it allows the parent to resume (this case should neve exist)
                await this.finishSubTask(t("common:tasks.deleted"));
            }
            // delete task from the task history state
            await this.deleteTaskFromState(id);
            // Delete associated shadow repository or branch.
            // TODO: Store `workspaceDir` in the `HistoryItem` object.
            const globalStorageDir = this.contextProxy.globalStorageUri.fsPath;
            const workspaceDir = this.cwd;
            try {
                await ShadowCheckpointService.deleteTask({ taskId: id, globalStorageDir, workspaceDir });
            }
            catch (error) {
                console.error(`[deleteTaskWithId${id}] failed to delete associated shadow repository or branch: ${error instanceof Error ? error.message : String(error)}`);
            }
            // delete the entire task directory including checkpoints and all content
            try {
                await fs.rm(taskDirPath, { recursive: true, force: true });
                console.log(`[deleteTaskWithId${id}] removed task directory`);
            }
            catch (error) {
                console.error(`[deleteTaskWithId${id}] failed to remove task directory: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        catch (error) {
            // If task is not found, just remove it from state
            if (error instanceof Error && error.message === "Task not found") {
                await this.deleteTaskFromState(id);
                return;
            }
            throw error;
        }
    }
    async deleteTaskFromState(id) {
        const taskHistory = this.getGlobalState("taskHistory") ?? [];
        const updatedTaskHistory = taskHistory.filter((task) => task.id !== id);
        await this.updateGlobalState("taskHistory", updatedTaskHistory);
        this.recentTasksCache = undefined;
        await this.postStateToWebview();
    }
    async refreshWorkspace() {
        this.currentWorkspacePath = getWorkspacePath();
        await this.postStateToWebview();
    }
    initializeOuterGateManager() {
        if (this.outerGateManagerPromise) {
            return;
        }
        this.outerGateManagerPromise = OuterGateIntegrationManager.initialize(this.contextProxy, () => this.getActiveWorkspaceName());
        this.outerGateManagerPromise
            .then(async (manager) => {
            this.outerGateManager = manager;
            const baseState = createInitialOuterGateState(this.workplaceService?.getState());
            const enriched = manager.applyToState(baseState);
            this.updateOuterGateState(enriched);
            await this.postStateToWebview();
        })
            .catch((error) => {
            console.error("[ClineProvider] Failed to initialize Outer Gate integrations", error);
        });
    }
    async getOuterGateManager() {
        if (this.outerGateManager) {
            return this.outerGateManager;
        }
        if (!this.outerGateManagerPromise) {
            this.initializeOuterGateManager();
        }
        if (!this.outerGateManagerPromise) {
            return undefined;
        }
        try {
            this.outerGateManager = await this.outerGateManagerPromise;
            return this.outerGateManager;
        }
        catch (error) {
            console.error("[ClineProvider] Unable to resolve Outer Gate manager", error);
            return undefined;
        }
    }
    async refreshOuterGateStateFromManager() {
        const manager = await this.getOuterGateManager();
        if (!manager) {
            return;
        }
        const baseState = createInitialOuterGateState(this.workplaceService?.getState());
        const enriched = manager.applyToState(baseState);
        this.updateOuterGateState(enriched);
    }
    async importNotionIntegration(options) {
        const manager = await this.getOuterGateManager();
        if (!manager) {
            void vscode.window.showErrorMessage("Outer Gate integrations are still starting. Try again in a moment.");
            return;
        }
        try {
            await manager.importNotion(options);
            await this.refreshOuterGateStateFromManager();
            await this.postStateToWebview();
            void vscode.window.showInformationMessage("Notion workspace synced into the Outer Gates.");
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const existingMeta = manager.getStoredMeta("notion");
            const cleanedDatabaseId = options.databaseId?.trim() ||
                (typeof existingMeta?.extra?.databaseId === "string" ? existingMeta.extra.databaseId : undefined);
            const cleanedDataSourceId = options.dataSourceId?.trim() ||
                (typeof existingMeta?.extra?.dataSourceId === "string" ? existingMeta.extra.dataSourceId : undefined);
            const existingLabel = typeof existingMeta?.targetLabel === "string" ? existingMeta.targetLabel : undefined;
            await manager.recordIntegrationError("notion", message, {
                targetLabel: cleanedDatabaseId ?? existingLabel,
                extra: {
                    ...(existingMeta?.extra ?? {}),
                    databaseId: cleanedDatabaseId,
                    dataSourceId: cleanedDataSourceId,
                },
            });
            await this.refreshOuterGateStateFromManager();
            await this.postStateToWebview();
            console.error("[ClineProvider] Notion import failed", error);
            void vscode.window.showErrorMessage(`Notion import failed: ${message}`);
        }
    }
    async importMiroIntegration(options) {
        const manager = await this.getOuterGateManager();
        if (!manager) {
            void vscode.window.showErrorMessage("Outer Gate integrations are still starting. Try again in a moment.");
            return;
        }
        try {
            await manager.importMiro(options);
            await this.refreshOuterGateStateFromManager();
            await this.postStateToWebview();
            void vscode.window.showInformationMessage("Miro board synced into the Outer Gates.");
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const existingMeta = manager.getStoredMeta("miro");
            const cleanedBoardId = options.boardId?.trim() ||
                (typeof existingMeta?.extra?.boardId === "string" ? existingMeta.extra.boardId : undefined);
            const cleanedItemTypes = options.itemTypes && options.itemTypes.length > 0
                ? options.itemTypes.join(",")
                : typeof existingMeta?.extra?.itemTypes === "string"
                    ? existingMeta.extra.itemTypes
                    : undefined;
            const existingLabel = typeof existingMeta?.targetLabel === "string" ? existingMeta.targetLabel : undefined;
            await manager.recordIntegrationError("miro", message, {
                targetLabel: cleanedBoardId ?? existingLabel,
                extra: {
                    ...(existingMeta?.extra ?? {}),
                    boardId: cleanedBoardId,
                    itemTypes: cleanedItemTypes,
                },
            });
            await this.refreshOuterGateStateFromManager();
            await this.postStateToWebview();
            console.error("[ClineProvider] Miro import failed", error);
            void vscode.window.showErrorMessage(`Miro import failed: ${message}`);
        }
    }
    async importZipIntegration(zipPath) {
        const manager = await this.getOuterGateManager();
        if (!manager) {
            void vscode.window.showErrorMessage("Outer Gate integrations are still starting. Try again in a moment.");
            return;
        }
        try {
            await manager.importZipArchive(zipPath);
            await this.refreshOuterGateStateFromManager();
            await this.postStateToWebview();
            void vscode.window.showInformationMessage("ZIP archive imported into the Outer Gates.");
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await manager.recordIntegrationError("zip-file", message, {
                targetLabel: zipPath,
                extra: {
                    ...(manager.getStoredMeta("zip-file")?.extra ?? {}),
                    archivePath: zipPath,
                },
            });
            await this.refreshOuterGateStateFromManager();
            await this.postStateToWebview();
            console.error("[ClineProvider] ZIP import failed", error);
            void vscode.window.showErrorMessage(`ZIP import failed: ${message}`);
        }
    }
    ensureOuterGateState() {
        if (!this.outerGateState) {
            this.outerGateState = createInitialOuterGateState(this.workplaceService?.getState());
        }
        return this.outerGateState;
    }
    updateOuterGateState(next) {
        this.outerGateState = this.pruneOuterGateState(next);
    }
    pruneOuterGateState(next) {
        return {
            ...next,
            cloverMessages: [...next.cloverMessages].slice(-CLOVER_MAX_MESSAGES),
            recentInsights: [...next.recentInsights].slice(0, 8),
            cloverSessions: {
                ...next.cloverSessions,
                entries: [...next.cloverSessions.entries].slice(0, CLOVER_SESSION_SUMMARY_LIMIT),
            },
            passionMap: {
                ...next.passionMap,
                points: next.passionMap.points.slice(0, 500).map((point) => ({
                    ...point,
                    coordinates: { ...point.coordinates },
                    metadata: point.metadata ? { ...point.metadata } : undefined,
                })),
                clusters: next.passionMap.clusters.map((cluster) => ({
                    ...cluster,
                    topKeywords: [...cluster.topKeywords],
                    centroid: { ...cluster.centroid },
                })),
            },
        };
    }
    getOuterGateStateSnapshot() {
        return cloneOuterGateState(this.ensureOuterGateState());
    }
    getActiveWorkspaceName() {
        const workplaceSnapshot = this.workplaceService?.getState();
        if (!workplaceSnapshot || workplaceSnapshot.companies.length === 0) {
            return undefined;
        }
        const activeCompanyId = workplaceSnapshot.activeCompanyId ??
            workplaceSnapshot.companies[0]?.id ??
            workplaceSnapshot.companies[0]?.id;
        const activeCompany = workplaceSnapshot.companies.find((company) => company.id === activeCompanyId);
        return activeCompany?.name ?? workplaceSnapshot.companies[0]?.name;
    }
    async ensureCloverSessionsInitialized() {
        if (this.cloverSessionsInitialized) {
            return;
        }
        const service = this.getCloverSessionService();
        if (!service) {
            return;
        }
        if (this.lastCloverSessionFetchErrorAt) {
            const elapsed = Date.now() - this.lastCloverSessionFetchErrorAt;
            if (elapsed < CLOVER_SESSION_RETRY_DELAY_MS) {
                return;
            }
        }
        const state = this.ensureOuterGateState();
        await service.ensureDefaultSession(state.cloverMessages);
        const initialized = await this.refreshCloverSessions({ append: false, syncActiveSession: true });
        if (initialized) {
            this.cloverSessionsInitialized = true;
            this.lastCloverSessionFetchErrorAt = undefined;
            return;
        }
        this.lastCloverSessionFetchErrorAt = Date.now();
    }
    mergeCloverSessionEntries(existing, incoming, append) {
        const combined = append ? [...existing, ...incoming] : [...incoming, ...existing];
        const deduped = [];
        const seen = new Set();
        for (const session of combined) {
            if (seen.has(session.id)) {
                continue;
            }
            deduped.push(session);
            seen.add(session.id);
        }
        return deduped.slice(0, CLOVER_SESSION_SUMMARY_LIMIT);
    }
    async refreshCloverSessions(options = {}) {
        const service = this.getCloverSessionService();
        if (!service) {
            return false;
        }
        const { cursor, append = false, limit = DEFAULT_CLOVER_SESSION_PAGE_SIZE, syncActiveSession = true } = options;
        const state = this.ensureOuterGateState();
        const loadingState = {
            ...state,
            cloverSessions: {
                ...state.cloverSessions,
                isLoading: true,
            },
        };
        this.updateOuterGateState(loadingState);
        try {
            const result = await service.listSessions({ cursor, limit });
            const mergedEntries = this.mergeCloverSessionEntries(state.cloverSessions.entries, result.sessions, append);
            const refreshedState = {
                ...this.ensureOuterGateState(),
                cloverSessions: {
                    entries: mergedEntries,
                    hasMore: result.hasMore,
                    cursor: result.nextCursor,
                    isLoading: false,
                    isInitialFetchComplete: true,
                },
            };
            this.updateOuterGateState(refreshedState);
            await this.broadcastOuterGateStateSnapshot(refreshedState);
            if (syncActiveSession) {
                await this.syncActiveCloverSessionMessages(service.getActiveSessionId());
            }
            this.cloverSessionWarningShown = false;
            return true;
        }
        catch (error) {
            console.error("[ClineProvider.refreshCloverSessions] Failed to fetch Clover sessions", error);
            const hadEntries = state.cloverSessions.entries.length > 0;
            const fallbackState = {
                ...state,
                cloverSessions: {
                    ...state.cloverSessions,
                    isLoading: false,
                    isInitialFetchComplete: hadEntries ? (state.cloverSessions.isInitialFetchComplete ?? true) : true,
                },
            };
            this.updateOuterGateState(fallbackState);
            await this.broadcastOuterGateStateSnapshot(fallbackState);
            if (!this.cloverSessionWarningShown) {
                void vscode.window.showWarningMessage(this.formatCloverSessionFetchError(error));
                this.cloverSessionWarningShown = true;
            }
            return false;
        }
    }
    formatCloverSessionFetchError(error) {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            if (status) {
                return `Clover sessions are unavailable (HTTP ${status}). Check your network connection or POOL_API_URL setting, then try again.`;
            }
            if (error.code) {
                return `Clover sessions are unavailable (${error.code}). Check your network connection or POOL_API_URL setting, then try again.`;
            }
        }
        return "Clover sessions are unavailable right now. Check your network connection or POOL_API_URL setting, then try again.";
    }
    async syncActiveCloverSessionMessages(sessionId) {
        if (!sessionId) {
            return;
        }
        const service = this.getCloverSessionService();
        if (!service) {
            return;
        }
        let session = service.getSession(sessionId);
        if (!session) {
            session = await service.fetchSession(sessionId);
            if (!session) {
                return;
            }
        }
        const state = this.ensureOuterGateState();
        this.updateOuterGateState({
            ...state,
            activeCloverSessionId: sessionId,
            cloverMessages: session.messages.map((message) => ({ ...message })),
        });
    }
    async setActiveCloverSession(sessionId) {
        const service = this.getCloverSessionService();
        if (!service) {
            return;
        }
        await service.setActiveSessionId(sessionId);
        await this.syncActiveCloverSessionMessages(sessionId);
    }
    async broadcastOuterGateStateSnapshot(snapshot) {
        if (this.isApplyingExternalOuterGateState) {
            return;
        }
        const stateSnapshot = snapshot ?? this.getOuterGateStateSnapshot();
        const otherInstances = Array.from(ClineProvider.activeInstances).filter((instance) => instance !== this);
        if (!otherInstances.length) {
            return;
        }
        await Promise.all(otherInstances.map((instance) => instance.applyExternalOuterGateState(cloneOuterGateState(stateSnapshot))));
    }
    async applyExternalOuterGateState(snapshot) {
        this.isApplyingExternalOuterGateState = true;
        try {
            this.updateOuterGateState(snapshot);
            if (snapshot.cloverSessions.isInitialFetchComplete) {
                this.cloverSessionsInitialized = true;
            }
            await this.postOuterGateStateSnapshot(snapshot);
        }
        finally {
            this.isApplyingExternalOuterGateState = false;
        }
    }
    async postOuterGateStateSnapshot(snapshot) {
        if (!this.view?.webview) {
            return;
        }
        await this.postMessageToWebview({
            type: "outerGateState",
            outerGateState: cloneOuterGateState(snapshot),
        });
    }
    getActiveCompanyContext() {
        const workplace = this.getWorkplaceService();
        if (!workplace) {
            return {};
        }
        const snapshot = workplace.getState();
        if (!snapshot.companies.length) {
            return {};
        }
        const activeCompanyId = snapshot.activeCompanyId ?? snapshot.companies[0]?.id ?? snapshot.companies[0]?.id;
        const company = snapshot.companies.find((entry) => entry.id === activeCompanyId) ?? snapshot.companies[0];
        return {
            companyId: company?.id,
            companyName: company?.name,
        };
    }
    async ensureActiveCloverSession() {
        await this.ensureCloverSessionsInitialized();
        const service = this.getCloverSessionService();
        if (!service) {
            return this.ensureOuterGateState().activeCloverSessionId;
        }
        let sessionId = this.ensureOuterGateState().activeCloverSessionId;
        if (!sessionId) {
            const context = this.getActiveCompanyContext();
            const welcomeMessage = createCloverWelcomeMessage();
            welcomeMessage.tokens = await this.estimateCloverTokenCount(welcomeMessage.text);
            const session = await service.createSession({
                companyId: context.companyId,
                companyName: context.companyName,
                initialMessages: [welcomeMessage],
            });
            const summary = service.toSummary(session);
            const stateAfterCreate = this.ensureOuterGateState();
            const mergedEntries = this.mergeCloverSessionEntries(stateAfterCreate.cloverSessions.entries, [summary], false);
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
            });
            sessionId = session.id;
        }
        await this.setActiveCloverSession(sessionId);
        return sessionId;
    }
    async createCloverSession(options) {
        await this.ensureCloverSessionsInitialized();
        const service = this.getCloverSessionService();
        if (!service) {
            return;
        }
        const context = options ?? this.getActiveCompanyContext();
        const welcomeMessage = createCloverWelcomeMessage();
        welcomeMessage.tokens = await this.estimateCloverTokenCount(welcomeMessage.text);
        const session = await service.createSession({
            companyId: context.companyId,
            companyName: context.companyName,
            initialMessages: [welcomeMessage],
        });
        const summary = service.toSummary(session);
        const state = this.ensureOuterGateState();
        const mergedEntries = this.mergeCloverSessionEntries(state.cloverSessions.entries, [summary], false);
        const nextState = {
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
        };
        this.updateOuterGateState(nextState);
        await service.setActiveSessionId(session.id);
        await this.postStateToWebview();
        await this.broadcastOuterGateStateSnapshot();
    }
    async activateCloverSession(sessionId) {
        await this.ensureCloverSessionsInitialized();
        const service = this.getCloverSessionService();
        if (!service) {
            return;
        }
        const session = service.getSession(sessionId);
        if (!session) {
            return;
        }
        const summary = service.toSummary(session);
        const state = this.ensureOuterGateState();
        const mergedEntries = this.mergeCloverSessionEntries(state.cloverSessions.entries, [summary], false);
        await service.setActiveSessionId(sessionId);
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
        });
        await this.postStateToWebview();
        await this.broadcastOuterGateStateSnapshot();
    }
    async loadMoreCloverSessions(cursor, limit) {
        await this.ensureCloverSessionsInitialized();
        const state = this.ensureOuterGateState();
        const nextCursor = cursor ?? state.cloverSessions.cursor;
        if (!nextCursor && state.cloverSessions.entries.length > 0 && !state.cloverSessions.hasMore) {
            return;
        }
        await this.refreshCloverSessions({ cursor: nextCursor, append: true, limit, syncActiveSession: false });
        await this.postStateToWebview();
    }
    async generateOuterGatePassionMap() {
        const requestIso = new Date().toISOString();
        const initialState = this.ensureOuterGateState();
        this.updateOuterGateState({
            ...initialState,
            passionMap: {
                ...initialState.passionMap,
                status: "loading",
                lastRequestedIso: requestIso,
                error: undefined,
            },
        });
        await this.postStateToWebview();
        try {
            const service = this.getCloverSessionService();
            if (!service) {
                throw new Error("Pool analysis service is not configured yet.");
            }
            const analysis = await service.fetchAnalysisItems({ limit: 250 });
            const { points, clusters, summary } = buildPassionMapFromAnalysis(analysis.items);
            const refreshedState = this.ensureOuterGateState();
            const readyCount = analysis.items.filter((item) => item.status === "ready").length;
            const processingCount = analysis.items.filter((item) => item.status === "processing").length;
            const capturedCount = analysis.items.filter((item) => item.status === "captured").length;
            const totalCaptured = typeof analysis.totalItems === "number"
                ? analysis.totalItems
                : readyCount + processingCount + capturedCount;
            const generatedIso = analysis.generatedAt ?? new Date().toISOString();
            const passionMapState = {
                status: "ready",
                points,
                clusters,
                summary,
                generatedAtIso: generatedIso,
                lastRequestedIso: requestIso,
                error: undefined,
            };
            this.updateOuterGateState({
                ...refreshedState,
                analysisPool: {
                    ...refreshedState.analysisPool,
                    totalCaptured,
                    processing: processingCount,
                    ready: readyCount,
                    lastUpdatedIso: generatedIso,
                },
                passionMap: passionMapState,
            });
        }
        catch (error) {
            const refreshedState = this.ensureOuterGateState();
            let message = "Unable to generate the passion map right now.";
            if (axios.isAxiosError(error)) {
                const status = error.response?.status;
                if (status) {
                    message = `Passion map request failed with status ${status}. Check your POOL_API_URL configuration and try again.`;
                }
                else if (error.message) {
                    message = error.message;
                }
            }
            else if (error instanceof Error && error.message) {
                message = error.message;
            }
            this.updateOuterGateState({
                ...refreshedState,
                passionMap: {
                    ...refreshedState.passionMap,
                    status: "error",
                    error: message,
                    lastRequestedIso: requestIso,
                },
            });
        }
        await this.postStateToWebview();
        await this.broadcastOuterGateStateSnapshot();
    }
    buildOuterGatePrompt(latestUserMessage) {
        const state = this.ensureOuterGateState();
        const analysis = state.analysisPool;
        const recentInsights = state.recentInsights.slice(0, 5);
        const conversation = state.cloverMessages
            .slice(-10)
            .map((message) => {
            const speaker = message.speaker === "clover" ? "Clover" : "User";
            return `${speaker}: ${message.text}`;
        })
            .join("\n");
        const insightSummary = recentInsights.length > 0
            ? recentInsights
                .map((insight) => `- ${insight.title}${insight.recommendedWorkspace ? ` → ${insight.recommendedWorkspace}` : ""} (${insight.stage})`)
                .join("\n")
            : "- No recent insights captured yet.";
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
Clover:`;
    }
    async estimateCloverTokenCount(text) {
        if (!text || text.trim().length === 0) {
            return undefined;
        }
        try {
            const blocks = [{ type: "text", text }];
            return await countTokens(blocks);
        }
        catch (error) {
            console.warn("[ClineProvider] Failed to estimate Clover token count", error);
            return undefined;
        }
    }
    async generateOuterGateResponse(prompt) {
        const { apiConfiguration } = await this.getState();
        if (!apiConfiguration || Object.keys(apiConfiguration).length === 0) {
            throw new Error("No language model configuration is available. Configure a provider in API settings to chat with Clover.");
        }
        const response = await singleCompletionHandler(apiConfiguration, prompt);
        return response.trim();
    }
    async handleOuterGateMessage(text, clientMessageId, options) {
        const trimmed = text.trim();
        if (!trimmed) {
            return;
        }
        const sessionId = await this.ensureActiveCloverSession();
        const service = this.getCloverSessionService();
        const baseState = this.ensureOuterGateState();
        const nowIso = new Date().toISOString();
        const messageId = clientMessageId ?? randomUUID();
        const userTokens = await this.estimateCloverTokenCount(trimmed);
        const userMessage = {
            id: messageId,
            speaker: "user",
            text: trimmed,
            timestamp: nowIso,
            tokens: userTokens,
        };
        const hasMessage = baseState.cloverMessages.some((message) => message.id === messageId);
        const nextMessages = hasMessage ? [...baseState.cloverMessages] : [...baseState.cloverMessages, userMessage];
        let updatedState = {
            ...baseState,
            analysisPool: {
                ...baseState.analysisPool,
                lastUpdatedIso: nowIso,
            },
            cloverMessages: nextMessages,
            isCloverProcessing: true,
        };
        if (!hasMessage && sessionId && service) {
            const session = await service.appendMessages(sessionId, [userMessage], this.getActiveCompanyContext());
            const summary = service.toSummary(session);
            updatedState = {
                ...updatedState,
                cloverSessions: {
                    ...updatedState.cloverSessions,
                    entries: this.mergeCloverSessionEntries(updatedState.cloverSessions.entries, [summary], false),
                    hasMore: updatedState.cloverSessions.hasMore,
                    cursor: updatedState.cloverSessions.cursor,
                    isInitialFetchComplete: true,
                },
            };
        }
        this.updateOuterGateState(updatedState);
        await this.postStateToWebview();
        const prompt = this.buildOuterGatePrompt(trimmed);
        try {
            const rawAssistantReply = await this.generateOuterGateResponse(prompt);
            const { text: cleanedAssistantReply, calls: functionCalls, parseErrors } = this.extractCloverFunctionCalls(rawAssistantReply);
            const displayReply = cleanedAssistantReply.trim().length
                ? cleanedAssistantReply
                : "Automation request submitted.";
            const assistantTokens = await this.estimateCloverTokenCount(displayReply);
            const replyMessage = {
                id: randomUUID(),
                speaker: "clover",
                text: displayReply,
                timestamp: new Date().toISOString(),
                tokens: assistantTokens,
                systemPromptPreview: prompt,
            };
            const readyState = this.ensureOuterGateState();
            let stateWithReply = {
                ...readyState,
                analysisPool: {
                    ...readyState.analysisPool,
                    lastUpdatedIso: replyMessage.timestamp,
                },
                cloverMessages: [...readyState.cloverMessages, replyMessage],
                isCloverProcessing: false,
            };
            if (sessionId && service) {
                const session = await service.appendMessages(sessionId, [replyMessage]);
                const summary = service.toSummary(session);
                stateWithReply = {
                    ...stateWithReply,
                    cloverSessions: {
                        ...stateWithReply.cloverSessions,
                        entries: this.mergeCloverSessionEntries(stateWithReply.cloverSessions.entries, [summary], false),
                        hasMore: stateWithReply.cloverSessions.hasMore,
                        cursor: stateWithReply.cloverSessions.cursor,
                        isInitialFetchComplete: true,
                    },
                };
            }
            this.updateOuterGateState(stateWithReply);
            try {
                await this.executeCloverFunctionCalls(functionCalls, parseErrors, sessionId, options?.automationPass ?? 0);
            }
            catch (automationError) {
                console.error("[ClineProvider] Clover automation failed", automationError);
            }
        }
        catch (error) {
            console.error("[ClineProvider] Clover response failed", error);
            const fallbackMessage = error instanceof Error
                ? error.message
                : "I hit a snag reaching the concierge model. Double-check your AI provider configuration and try again.";
            const readyState = this.ensureOuterGateState();
            const errorTokens = await this.estimateCloverTokenCount(fallbackMessage);
            const errorReply = {
                id: randomUUID(),
                speaker: "clover",
                text: fallbackMessage,
                timestamp: new Date().toISOString(),
                tokens: errorTokens,
                systemPromptPreview: prompt,
            };
            let stateWithError = {
                ...readyState,
                analysisPool: {
                    ...readyState.analysisPool,
                    lastUpdatedIso: errorReply.timestamp,
                },
                cloverMessages: [...readyState.cloverMessages, errorReply],
                isCloverProcessing: false,
            };
            if (sessionId && service) {
                const session = await service.appendMessages(sessionId, [errorReply]);
                const summary = service.toSummary(session);
                stateWithError = {
                    ...stateWithError,
                    cloverSessions: {
                        ...stateWithError.cloverSessions,
                        entries: this.mergeCloverSessionEntries(stateWithError.cloverSessions.entries, [summary], false),
                        hasMore: stateWithError.cloverSessions.hasMore,
                        cursor: stateWithError.cloverSessions.cursor,
                        isInitialFetchComplete: true,
                    },
                };
            }
            this.updateOuterGateState(stateWithError);
        }
        await this.postStateToWebview();
        await this.broadcastOuterGateStateSnapshot();
    }
    extractCloverFunctionCalls(raw) {
        if (!raw) {
            return { text: "", calls: [], parseErrors: [] };
        }
        const calls = [];
        const parseErrors = [];
        let text = raw;
        const regex = /<functionCalls>([\s\S]*?)<\/functionCalls>/gi;
        text = text.replace(regex, (_, block) => {
            try {
                const parsed = parseCloverFunctionCallBlock(block);
                calls.push(...parsed);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                parseErrors.push(message);
            }
            return "";
        });
        const cleaned = text
            .replace(/[\n\r]{3,}/g, "\n\n")
            .replace(/[ \t]{2,}/g, " ")
            .trim();
        return { text: cleaned, calls, parseErrors };
    }
    parseListCompaniesOptions(args) {
        const record = coerceRecord(args, "list_companies arguments must be an object");
        const search = toOptionalText(record.search ?? record.query ?? record.name);
        const limit = this.normalizeLookupLimit(record.limit ?? record.count ?? record.max ?? record.page_size, "limit");
        return {
            search,
            limit,
        };
    }
    parseListInsightsOptions(args) {
        const record = coerceRecord(args, "list_insights arguments must be an object");
        const search = toOptionalText(record.search ?? record.query ?? record.title ?? record.summary);
        const stageRaw = record.stage ?? record.status;
        const stage = stageRaw !== undefined ? normalizeInsightStageInput(stageRaw, "stage") : undefined;
        const assignedCompanyId = toOptionalText(record.assigned_company_id ?? record.company_id ?? record.assigned_company ?? record.workspace_company);
        const limit = this.normalizeLookupLimit(record.limit ?? record.count ?? record.max ?? record.page_size, "limit");
        return {
            search,
            stage,
            assignedCompanyId,
            limit,
        };
    }
    formatIsoDateForNote(iso) {
        const normalized = toOptionalText(iso);
        if (!normalized) {
            return undefined;
        }
        const timestamp = Date.parse(normalized);
        if (Number.isNaN(timestamp)) {
            return undefined;
        }
        return new Date(timestamp).toISOString().slice(0, 10);
    }
    truncateForNote(value, limit = CLOVER_LOOKUP_SUMMARY_LIMIT) {
        if (value.length <= limit) {
            return value;
        }
        return `${value.slice(0, Math.max(1, limit - 1)).trim()}…`;
    }
    normalizeLookupLimit(value, field, defaultValue = CLOVER_LOOKUP_DEFAULT_LIMIT, min = CLOVER_LOOKUP_MIN_LIMIT, max = CLOVER_LOOKUP_MAX_LIMIT) {
        if (value === undefined || value === null) {
            return defaultValue;
        }
        let numeric;
        if (typeof value === "number") {
            numeric = value;
        }
        else if (typeof value === "string") {
            const trimmed = value.trim();
            if (!trimmed) {
                return defaultValue;
            }
            const parsed = Number(trimmed);
            if (!Number.isFinite(parsed)) {
                throw new Error(`${field} must be a number`);
            }
            numeric = parsed;
        }
        else {
            throw new Error(`${field} must be a number`);
        }
        if (!Number.isFinite(numeric)) {
            throw new Error(`${field} must be a finite number`);
        }
        const int = Math.trunc(numeric);
        if (int < min || int > max) {
            throw new Error(`${field} must be between ${min} and ${max}`);
        }
        return int;
    }
    break;
}
"list_insights";
{
    const options = this.parseListInsightsOptions(call.arguments);
    const manager = await this.getOuterGateManager();
    const combined = [];
    const seen = new Set();
    const pushInsight = (insight) => {
        if (!insight || !insight.id || seen.has(insight.id)) {
            return;
        }
        combined.push({ ...insight });
        seen.add(insight.id);
    };
    if (manager) {
        for (const stored of manager.listStoredInsights()) {
            pushInsight(storedInsightToOuterGate(stored));
        }
    }
    for (const recent of this.ensureOuterGateState().recentInsights) {
        pushInsight(recent);
    }
    let insights = combined;
    if (options.search) {
        const term = options.search.toLowerCase();
        insights = insights.filter((insight) => {
            const idMatch = insight.id.toLowerCase().includes(term);
            const titleMatch = optionalString(insight.title)?.toLowerCase().includes(term) ?? false;
            const summaryMatch = optionalString(insight.summary)?.toLowerCase().includes(term) ?? false;
            const workspaceMatch = optionalString(insight.recommendedWorkspace)?.toLowerCase().includes(term) ?? false;
            const companyMatch = optionalString(insight.assignedCompanyId)?.toLowerCase().includes(term) ?? false;
            return idMatch || titleMatch || summaryMatch || workspaceMatch || companyMatch;
        });
    }
    if (options.stage) {
        insights = insights.filter((insight) => insight.stage === options.stage);
    }
    if (options.assignedCompanyId) {
        insights = insights.filter((insight) => optionalString(insight.assignedCompanyId) === options.assignedCompanyId);
    }
    if (!insights.length) {
        const filters = [];
        if (options.search) {
            filters.push(`search "${options.search}"`);
        }
        if (options.stage) {
            filters.push(`stage ${options.stage}`);
        }
        if (options.assignedCompanyId) {
            filters.push(`company ${options.assignedCompanyId}`);
        }
        const context = filters.length ? ` for ${filters.join(", ")}` : "";
        summary = `No insights found${context}.`;
        break;
    }
    const total = insights.length;
    const limited = insights.slice(0, options.limit);
    const qualifiers = [];
    if (options.stage) {
        qualifiers.push(`stage ${options.stage}`);
    }
    if (options.assignedCompanyId) {
        qualifiers.push(`company ${options.assignedCompanyId}`);
    }
    if (options.search) {
        qualifiers.push(`search "${options.search}"`);
    }
    const qualifierSuffix = qualifiers.length ? ` (${qualifiers.join(", ")})` : "";
    summary =
        total === 1
            ? `Found 1 insight${qualifierSuffix}.`
            : `Found ${total} insights${qualifierSuffix}.`;
    if (total > options.limit) {
        summary += ` Showing ${limited.length}.`;
    }
    const detailLines = limited.map((insight) => {
        const title = optionalString(insight.title) ?? "(untitled insight)";
        const metaParts = [`stage: ${insight.stage}`];
        const assignedCompany = optionalString(insight.assignedCompanyId);
        if (assignedCompany) {
            metaParts.push(`company: ${assignedCompany}`);
        }
        const workspace = optionalString(insight.recommendedWorkspace);
        if (workspace) {
            metaParts.push(`workspace: ${workspace}`);
        }
        const captured = this.formatIsoDateForNote(insight.capturedAtIso);
        if (captured) {
            metaParts.push(`captured: ${captured}`);
        }
        const summaryText = optionalString(insight.summary);
        const summarySuffix = summaryText
            ? ` — ${this.truncateForNote(summaryText, CLOVER_LOOKUP_SUMMARY_LIMIT)}`
            : "";
        return `${title} — id: ${insight.id}, ${metaParts.join(", ")}${summarySuffix}`;
    });
    if (total > options.limit) {
        detailLines.push(`…${total - options.limit} more not shown`);
    }
    outputLines = detailLines;
    break;
}
"create_company";
{
    const payloads = parseCreateCompanyPayloads(call.arguments);
    if (!payloads.length) {
        const message = "create_company requires at least one company payload.";
        errorNotes.push(message);
        status = "failed";
        error = message;
        summary = "Clover didn't receive any company payloads to create.";
        break;
    }
    for (const payload of payloads) {
        await workplaceService.createCompany(payload);
    }
    const names = payloads
        .map((payload) => optionalString(payload.name))
        .filter((name) => Boolean(name));
    if (payloads.length === 1) {
        summary = names.length
            ? `Created company ${names[0]}.`
            : "Created a new company space.";
    }
    else {
        summary = `Created ${payloads.length} companies.`;
        if (names.length) {
            summary += ` Examples: ${formatAutomationListPreview(names)}.`;
        }
    }
    outputLines = names.length ? names.slice(0, 4) : undefined;
    break;
}
"update_company";
{
    const payloads = parseUpdateCompanyPayloads(call.arguments);
    if (!payloads.length) {
        const message = "update_company requires at least one update payload.";
        errorNotes.push(message);
        status = "failed";
        error = message;
        summary = "No company updates were provided.";
        break;
    }
    const summaries = [];
    for (const payload of payloads) {
        await workplaceService.updateCompany(payload);
        const name = optionalString(payload.name);
        summaries.push(name ? `${payload.id} → ${name}` : `${payload.id}`);
    }
    summary =
        payloads.length === 1
            ? `Updated company ${summaries[0]}.`
            : `Updated ${payloads.length} companies.`;
    outputLines = summaries;
    break;
}
"create_insight";
{
    const payloads = parseCreateInsightPayloads(call.arguments);
    if (!payloads.length) {
        errorNotes.push("create_insight requires at least one insight payload.");
        status = "failed";
        summary = "No insight payloads were provided.";
        break;
    }
    const manager = await this.getOuterGateManager();
    const createdInsights = [];
    for (const payload of payloads) {
        const nowIso = new Date().toISOString();
        let insightId = payload.id;
        if (insightId) {
            const conflict = manager?.getStoredInsightById(insightId) || this.findInsightSnapshot(insightId);
            if (conflict) {
                insightId = `${insightId}-${randomUUID().slice(0, 6)}`;
            }
        }
        if (!insightId) {
            insightId = `insight-${randomUUID()}`;
        }
        const capturedAtIso = payload.capturedAtIso ?? nowIso;
        const nextInsight = {
            id: insightId,
            title: payload.title,
            summary: payload.summary,
            recommendedWorkspace: payload.recommendedWorkspace,
            assignedCompanyId: payload.assignedCompanyId,
            stage: payload.stage ?? "captured",
            sourceType: payload.sourceType ?? "conversation",
            capturedAtIso,
        };
        const stored = {
            ...nextInsight,
            integrationId: CLOVER_CONVERSATION_INTEGRATION_ID,
            upsertedAtIso: nowIso,
        };
        await manager?.upsertInsights([stored]);
        await this.applyInsightMutation({
            nextInsight,
            event: {
                type: "created",
                insight: nextInsight,
                note: payload.note,
            },
            sessionId,
        });
        createdInsights.push(nextInsight);
    }
    summary =
        createdInsights.length === 1
            ? `Captured insight "${optionalString(createdInsights[0].title) ?? createdInsights[0].id}".`
            : `Captured ${createdInsights.length} insights.`;
    outputLines = createdInsights.map((insight) => `${optionalString(insight.title) ?? insight.id} — stage: ${insight.stage}`);
    break;
}
"update_insight";
{
    const payloads = parseUpdateInsightPayloads(call.arguments);
    if (!payloads.length) {
        errorNotes.push("update_insight requires at least one update entry.");
        status = "failed";
        summary = "No insight updates were provided.";
        break;
    }
    const manager = await this.getOuterGateManager();
    const updatedEntries = [];
    for (const payload of payloads) {
        const id = payload.id;
        const storedExisting = manager?.getStoredInsightById(id);
        const previousInsight = storedExisting
            ? storedInsightToOuterGate(storedExisting)
            : this.findInsightSnapshot(id);
        if (!storedExisting && !previousInsight) {
            errorNotes.push(`update_insight: insight "${id}" was not found.`);
            status = "failed";
            error = `Insight ${id} was not found.`;
            continue;
        }
        const baseInsight = storedExisting
            ? storedInsightToOuterGate(storedExisting)
            : previousInsight;
        const updatedInsight = {
            ...baseInsight,
            title: payload.title ?? baseInsight.title,
            summary: payload.summary ?? baseInsight.summary,
            recommendedWorkspace: payload.recommendedWorkspace !== undefined
                ? payload.recommendedWorkspace
                : baseInsight.recommendedWorkspace,
            assignedCompanyId: payload.assignedCompanyId !== undefined
                ? payload.assignedCompanyId
                : baseInsight.assignedCompanyId,
            stage: payload.stage ?? baseInsight.stage,
            sourceType: payload.sourceType ?? baseInsight.sourceType,
            capturedAtIso: payload.capturedAtIso ?? baseInsight.capturedAtIso,
        };
        const changes = diffInsights(baseInsight, updatedInsight);
        const nowIso = new Date().toISOString();
        const stored = {
            ...updatedInsight,
            integrationId: storedExisting?.integrationId ?? CLOVER_CONVERSATION_INTEGRATION_ID,
            upsertedAtIso: nowIso,
        };
        if (changes.length || optionalString(payload.note)) {
            await manager?.upsertInsights([stored]);
            await this.applyInsightMutation({
                nextInsight: updatedInsight,
                previousInsight: baseInsight,
                event: {
                    type: "updated",
                    insight: updatedInsight,
                    note: payload.note,
                    changes,
                },
                sessionId,
            });
            updatedEntries.push(updatedInsight);
        }
    }
    if (updatedEntries.length) {
        summary =
            updatedEntries.length === 1
                ? `Updated insight "${optionalString(updatedEntries[0].title) ?? updatedEntries[0].id}".`
                : `Updated ${updatedEntries.length} insights.`;
        outputLines = updatedEntries.map((entry) => `${optionalString(entry.title) ?? entry.id} — stage: ${entry.stage}`);
    }
    else if (!summary) {
        summary = "No insight updates were applied.";
    }
    break;
}
try { }
catch (automationError) {
    const message = automationError instanceof Error
        ? automationError.message
        : String(automationError);
    errorNotes.push(`${call.name}: ${message}`);
    status = "failed";
    error = message;
    if (!summary) {
        summary = `Couldn't complete ${definition?.title ?? humanizeAutomationCallName(rawName || "automation")}.`;
    }
}
const logMessage = await this.appendCloverAutomationCallLog({
    call,
    definition,
    status,
    summary,
    inputs,
    outputLines,
    error,
    sessionId,
});
results.push({
    name: rawName || definition?.name || "automation",
    title: definition?.title,
    status,
    summary: logMessage.text,
    error,
});
if (errorNotes.length) {
    const joined = errorNotes.map((entry) => `- ${entry}`).join("\n");
    void vscode.window.showErrorMessage(`Clover automation issue:\n${joined}`);
    await this.appendCloverAutomationNote(`I ran into automation issues:\n${joined}`, sessionId);
}
return { results, errorNotes };
formatCloverAutomationFollowup(outcome, CloverAutomationOutcome);
string | undefined;
{
    const summaryLines = outcome.results.map((result) => {
        const prefix = result.status === "succeeded" ? "[ok]" : "[error]";
        return `${prefix} ${result.summary}`;
    });
    const errorLines = outcome.errorNotes
        .filter((note) => note && note.trim().length > 0)
        .map((note) => `[warn] ${note}`);
    if (summaryLines.length === 0 && errorLines.length === 0) {
        return undefined;
    }
    const lines = [...summaryLines, ...errorLines];
    return `Automation update:\n${lines.join("\n")}\n\nClover, please continue working toward the user\'s goal. If more actions are needed, respond with the plan and any <functionCalls> blocks.`;
}
async;
triggerCloverAutomationFollowup(followUp, string, pass, number);
Promise < void  > {
    const: trimmed = followUp.trim(),
    if(, trimmed) {
        return;
    },
    await, this: .handleOuterGateMessage(trimmed, `automation-followup-${pass}-${randomUUID()}`, {
        automationPass: pass,
        triggeredByAutomation: true,
    })
};
findInsightSnapshot(id, string);
OuterGateInsight | undefined;
{
    const state = this.ensureOuterGateState();
    return state.recentInsights.find((entry) => entry.id === id);
}
async;
applyInsightMutation({
    nextInsight,
    previousInsight,
    event,
    sessionId,
}, {
    nextInsight: OuterGateInsight,
    previousInsight: OuterGateInsight,
    event: OuterGateInsightEvent,
    sessionId: string
});
Promise < void  > {
    const: current = this.ensureOuterGateState(),
    const: normalizedNext, OuterGateInsight = { ...nextInsight },
    const: normalizedPrevious = previousInsight ? { ...previousInsight } : undefined,
    const: existingIndex = current.recentInsights.findIndex((entry) => entry.id === normalizedNext.id),
    const: recent = [...current.recentInsights],
    if(existingIndex) { }
} !== -1;
{
    recent.splice(existingIndex, 1);
}
recent.unshift(normalizedNext);
const trimmedRecent = recent.slice(0, 8);
const isNew = !normalizedPrevious;
const prevStage = normalizedPrevious?.stage;
const nextStage = normalizedNext.stage;
let totalCaptured = current.analysisPool.totalCaptured;
let ready = current.analysisPool.ready;
let processing = current.analysisPool.processing;
let assigned = current.analysisPool.assignedThisWeek;
if (isNew) {
    totalCaptured += 1;
    if (nextStage === "ready") {
        ready += 1;
    }
    if (nextStage === "processing") {
        processing += 1;
    }
    if (nextStage === "assigned") {
        assigned += 1;
    }
}
else if (prevStage !== nextStage) {
    if (prevStage === "ready") {
        ready = Math.max(0, ready - 1);
    }
    if (nextStage === "ready") {
        ready += 1;
    }
    if (prevStage === "processing") {
        processing = Math.max(0, processing - 1);
    }
    if (nextStage === "processing") {
        processing += 1;
    }
    if (prevStage === "assigned" && nextStage !== "assigned") {
        assigned = Math.max(0, assigned - 1);
    }
    if (nextStage === "assigned" && prevStage !== "assigned") {
        assigned += 1;
    }
}
const updatedState = {
    ...current,
    analysisPool: {
        ...current.analysisPool,
        totalCaptured,
        ready,
        processing,
        assignedThisWeek: assigned,
        lastUpdatedIso: new Date().toISOString(),
    },
    recentInsights: trimmedRecent,
};
this.updateOuterGateState(updatedState);
const eventClone = {
    ...event,
    note: optionalString(event.note),
    insight: { ...normalizedNext },
    changes: event.changes?.map((change) => ({ ...change })),
};
await this.appendCloverInsightEvent(eventClone, sessionId);
async;
appendCloverInsightEvent(event, OuterGateInsightEvent, sessionId ?  : string);
Promise < void  > {
    const: fallbackNote =
        event.type === "created"
            ? `Captured insight “${event.insight.title}”.`
            : `Updated insight “${event.insight.title}”.`,
    const: text = optionalString(event.note) ?? fallbackNote,
    const: timestamp = new Date().toISOString(),
    const: tokens = await this.estimateCloverTokenCount(text),
    const: message, OuterGateCloverMessage = {
        id: randomUUID(),
        speaker: "clover",
        text,
        timestamp,
        tokens,
        highlight: true,
        insightEvent: {
            ...event,
            note: optionalString(event.note),
            insight: { ...event.insight },
            changes: event.changes?.map((change) => ({ ...change })),
        },
    },
    const: current = this.ensureOuterGateState(),
    this: .updateOuterGateState({
        ...current,
        cloverMessages: [...current.cloverMessages, message],
    }),
    const: service = this.getCloverSessionService(),
    if(, service) { }
} || !sessionId;
{
    return;
}
try {
    const session = await service.appendMessages(sessionId, [message]);
    const summary = service.toSummary(session);
    const refreshed = this.ensureOuterGateState();
    this.updateOuterGateState({
        ...refreshed,
        cloverSessions: {
            ...refreshed.cloverSessions,
            entries: this.mergeCloverSessionEntries(refreshed.cloverSessions.entries, [summary], false),
            hasMore: refreshed.cloverSessions.hasMore,
            cursor: refreshed.cloverSessions.cursor,
            isInitialFetchComplete: true,
        },
    });
}
catch (error) {
    console.warn("[ClineProvider] Failed to persist Clover insight event", error);
}
async;
appendCloverAutomationNote(text, string, sessionId ?  : string);
Promise < void  > {
    const: note = text.trim(),
    if(, note) {
        return;
    },
    const: timestamp = new Date().toISOString(),
    const: tokens = await this.estimateCloverTokenCount(note),
    const: message, OuterGateCloverMessage = {
        id: randomUUID(),
        speaker: "clover",
        text: note,
        timestamp,
        tokens,
    },
    const: current = this.ensureOuterGateState(),
    this: .updateOuterGateState({
        ...current,
        cloverMessages: [...current.cloverMessages, message],
    }),
    const: service = this.getCloverSessionService(),
    if(, service) { }
} || !sessionId;
{
    return;
}
try {
    const session = await service.appendMessages(sessionId, [message]);
    const summary = service.toSummary(session);
    const refreshed = this.ensureOuterGateState();
    this.updateOuterGateState({
        ...refreshed,
        cloverSessions: {
            ...refreshed.cloverSessions,
            entries: this.mergeCloverSessionEntries(refreshed.cloverSessions.entries, [summary], false),
            hasMore: refreshed.cloverSessions.hasMore,
            cursor: refreshed.cloverSessions.cursor,
            isInitialFetchComplete: true,
        },
    });
}
catch (error) {
    console.warn("[ClineProvider] Failed to persist Clover automation note", error);
}
async;
executeCloverFunctionCalls(calls, CloverFunctionCall[], parseErrors, string[], sessionId, string | undefined, pass, number);
Promise < void  > {
    if(, calls) { }, : .length && !parseErrors.length
};
{
    return;
}
if (pass >= CLOVER_MAX_AUTOMATION_PASSES) {
    await this.appendCloverAutomationNote(`Paused automation after ${CLOVER_MAX_AUTOMATION_PASSES} rounds. Summarize the latest results for the user before continuing manually.`, sessionId);
    await this.postStateToWebview();
    await this.broadcastOuterGateStateSnapshot();
    return;
}
const outcome = await this.runCloverAutomationPass(calls, parseErrors, sessionId);
const followUp = this.formatCloverAutomationFollowup(outcome);
if (!followUp) {
    await this.postStateToWebview();
    await this.broadcastOuterGateStateSnapshot();
    return;
}
await this.postStateToWebview();
await this.broadcastOuterGateStateSnapshot();
await this.triggerCloverAutomationFollowup(followUp, pass + 1);
async;
runCloverAutomationPass(calls, CloverFunctionCall[], parseErrors, string[], sessionId, string | undefined);
Promise < CloverAutomationOutcome > {
    const: results, CloverAutomationCallResult, []:  = [],
    const: errorNotes = [...parseErrors],
    const: workplaceService = this.getWorkplaceService(),
    if(, workplaceService) { }
} && calls.length;
{
    errorNotes.push("Workspace automation is unavailable in this session.");
}
if (!workplaceService) {
    for (const call of calls) {
        const rawName = typeof call.name === "string" ? call.name.trim() : "";
        const normalizedName = rawName.toLowerCase();
        const definition = normalizedName
            ? CLOVER_AUTOMATION_DEFINITION_BY_NAME.get(normalizedName)
            : undefined;
        const message = await this.appendCloverAutomationCallLog({
            call,
            definition,
            status: "failed",
            summary: "Automation tools are offline, so this request could not run.",
            inputs: buildAutomationCallInputs(call.arguments),
            error: "Workspace automation is unavailable in this session.",
            sessionId,
        });
        results.push({
            name: rawName || "automation",
            title: definition?.title,
            status: "failed",
            summary: message.text,
            error: "Workspace automation is unavailable in this session.",
        });
    }
}
else if (workplaceService) {
    for (const call of calls) {
        const rawName = typeof call.name === "string" ? call.name.trim() : "";
        const normalizedName = rawName.toLowerCase();
        const inputs = buildAutomationCallInputs(call.arguments);
        if (!normalizedName) {
            const message = "Received a Clover function call without a name.";
            errorNotes.push(message);
            const logMessage = await this.appendCloverAutomationCallLog({
                call,
                status: "failed",
                summary: "Clover attempted to run an unnamed automation call.",
                inputs,
                error: message,
                sessionId,
            });
            results.push({
                name: rawName || "automation",
                status: "failed",
                summary: logMessage.text,
                error: message,
            });
            continue;
        }
        if (!cloverAutomationFunctionNames.has(normalizedName)) {
            const message = `Unknown Clover function "${call.name}" requested.`;
            errorNotes.push(message);
            const logMessage = await this.appendCloverAutomationCallLog({
                call,
                status: "failed",
                summary: `The automation function "${call.name}" is not available.",
						inputs,
						error: "Unknown automation function.",
						sessionId,
					})
					results.push({
						name: rawName,
						status: "failed",
						summary: logMessage.text,
						error: "Unknown automation function.",
					})
					continue
				}
				const definition = CLOVER_AUTOMATION_DEFINITION_BY_NAME.get(
					normalizedName as CloverAutomationFunctionName,
				)
				let summary: string | undefined
				let outputLines: string[] | undefined
				let status: "succeeded" | "failed" = "succeeded"
				let error: string | undefined

				try {
					switch (normalizedName as CloverAutomationFunctionName) {
						case "list_companies": {
							const options = this.parseListCompaniesOptions(call.arguments)
							const stateSnapshot = workplaceService.getState()
							let companies = [...stateSnapshot.companies]
							if (options.search) {
								const term = options.search.toLowerCase()
								companies = companies.filter((company) => {
									const idMatch = company.id.toLowerCase().includes(term)
									const nameMatch = optionalString(company.name)?.toLowerCase().includes(term) ?? false
									return idMatch || nameMatch
								})
							}
							if (companies.length === 0) {
								summary = options.search
									? `, No, companies, matched, search, "${options.search}": . `
									: "No companies exist yet. Capture or create one before updating."
								break
							}
							const total = companies.length
							const limited = companies.slice(0, options.limit)
							const qualifier = options.search ? `, matching, "${options.search}": ` : ""
							summary =
								total === 1
									? `, Found, 1: company$
            }, { qualifier }. `
									: `, Found, $, { total }, companies$, { qualifier }. `
							if (total > options.limit) {
								summary += `, Showing, $, { limited, : .length }. `
							}
							const detailLines = limited.map((company) => {
								const name = optionalString(company.name) ?? "(unnamed company)"
								const departmentCount = company.departments.filter((department) => !department.deletedAt).length
								const teamCount = company.teams.filter((team) => !team.deletedAt).length
								const activeEmployees = company.employees.filter((employee) => !employee.deletedAt).length
								return `, $, { name }, id, $, { company, : .id }, departments, $, { departmentCount }, teams, $, { teamCount }, employees, $, { activeEmployees } `
							})
							if (total > options.limit) {
								detailLines.push(`, $, { total } - options.limit);
        }
        more;
        not;
        shown `)
							}
							outputLines = detailLines
							break

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
			console.error(`;
        Error;
        merging;
        $;
        {
            commandType;
        }
        commands: `, error)
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
			hubSnapshot,
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
			outerGateState: this.getOuterGateStateSnapshot(),
			hubSnapshot,
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
				`[getState];
        failed;
        to;
        get;
        organization;
        allow;
        list: $;
        {
            error instanceof Error ? error.message : String(error);
        }
        `,
			)
		}

		let cloudUserInfo: CloudUserInfo | null = null

		try {
			cloudUserInfo = CloudService.instance.getUserInfo()
		} catch (error) {
			console.error(
				`[getState];
        failed;
        to;
        get;
        cloud;
        user;
        info: $;
        {
            error instanceof Error ? error.message : String(error);
        }
        `,
			)
		}

		let cloudIsAuthenticated: boolean = false

		try {
			cloudIsAuthenticated = CloudService.instance.isAuthenticated()
		} catch (error) {
			console.error(
				`[getState];
        failed;
        to;
        get;
        cloud;
        authentication;
        state: $;
        {
            error instanceof Error ? error.message : String(error);
        }
        `,
			)
		}

		let sharingEnabled: boolean = false

		try {
			sharingEnabled = await CloudService.instance.canShareTask()
		} catch (error) {
			console.error(
				`[getState];
        failed;
        to;
        get;
        sharing;
        enabled;
        state: $;
        {
            error instanceof Error ? error.message : String(error);
        }
        `,
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
				`[getState];
        failed;
        to;
        get;
        organization;
        settings;
        version: $;
        {
            error instanceof Error ? error.message : String(error);
        }
        `,
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
						`[getState];
        failed;
        to;
        get;
        remote;
        control;
        setting;
        from;
        cloud: $;
        {
            error instanceof Error ? error.message : String(error);
        }
        `,
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
			hubSnapshot: this.conversationHub.getSnapshot(),
		}
		const companyCount = result.workplaceState?.companies?.length ?? 0
		const companyNames = result.workplaceState?.companies?.map((company: WorkplaceCompany) => company.name) ?? []
		console.log("[ClineProvider.getState] returning companyCount=%d companyNames=%o", companyCount, companyNames)
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

	// @deprecated - Use `;
        ContextProxy;
        #setValue ` instead.
	private async updateGlobalState<K extends keyof GlobalState>(key: K, value: GlobalState[K]) {
		await this.contextProxy.setValue(key, value)
	}

	// @deprecated - Use `;
        ContextProxy;
        #getValue ` instead.
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
					const message = `[ClineProvider];
        #remoteControlEnabled;
        BridgeOrchestrator.subscribeToTask();
        failed: $;
        {
            error instanceof Error ? error.message : String(error);
        }
        `
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
						const message = `[ClineProvider];
        #remoteControlEnabled;
        BridgeOrchestrator;
        #unsubscribeFromTask();
        failed: $;
        {
            error instanceof Error ? error.message : String(error);
        }
        `
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
			`[createTask];
        $;
        {
            task.parentTask ? "child" : "parent";
        }
        task;
        $;
        {
            task.taskId;
        }
        $;
        {
            task.instanceId;
        }
        instantiated `,
		)

		return task
	}

	public async cancelTask(): Promise<void> {
		const task = this.getCurrentTask()

		if (!task) {
			return
		}

		console.log(`[cancelTask];
        cancelling;
        task;
        $;
        {
            task.taskId;
        }
        $;
        {
            task.instanceId;
        }
        `)

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
			console.log(`[clearTask];
        clearing;
        task;
        $;
        {
            task.taskId;
        }
        $;
        {
            task.instanceId;
        }
        `)
			await this.removeClineFromStack()
		}
	}

	public resumeTask(taskId: string): void {
		// Use the existing showTaskWithId method which handles both current and
		// historical tasks.
		this.showTaskWithId(taskId).catch((error) => {
			this.log(`;
        Failed;
        to;
        resume;
        task;
        $;
        {
            taskId;
        }
        $;
        {
            error.message;
        }
        `)
		})
	}

	private async appendCloverAutomationCallLog(options: CloverAutomationLogOptions): Promise<OuterGateCloverMessage> {
		const {
			call,
			definition,
			status,
			summary,
			inputs,
			outputLines,
			error,
			sessionId,
		} = options
		const rawCallName = typeof call.name === "string" ? call.name.trim() : ""
		const friendlyTitle = definition?.title ?? humanizeAutomationCallName(rawCallName || "automation call")
		const defaultText = status === "succeeded" ? `;
        Completed;
        $;
        {
            friendlyTitle;
        }
        ` : `;
        Failed;
        $;
        {
            friendlyTitle;
        }
        `
		const text = summary ?? defaultText
		const timestamp = new Date().toISOString()
		const tokens = await this.estimateCloverTokenCount(text)
		const message: OuterGateCloverMessage = {
			id: randomUUID(),
			speaker: "clover",
			text,
			timestamp,
			tokens,
			automationCall: this.buildAutomationCallPayload({
				name: rawCallName || friendlyTitle,
				title: definition?.title ?? (rawCallName ? humanizeAutomationCallName(rawCallName) : undefined),
				status,
				summary,
				inputs,
				outputLines,
				error,
			}),
		}

		const current = this.ensureOuterGateState()
		this.updateOuterGateState({
			...current,
			cloverMessages: [...current.cloverMessages, message],
		})

		const service = this.getCloverSessionService()
		if (!service || !sessionId) {
			return message
		}
		try {
			const session = await service.appendMessages(sessionId, [message])
			const summaryState = service.toSummary(session)
			const refreshed = this.ensureOuterGateState()
			this.updateOuterGateState({
				...refreshed,
				cloverSessions: {
					...refreshed.cloverSessions,
					entries: this.mergeCloverSessionEntries(
						refreshed.cloverSessions.entries,
						[summaryState],
						false,
					),
					hasMore: refreshed.cloverSessions.hasMore,
					cursor: refreshed.cloverSessions.cursor,
					isInitialFetchComplete: true,
				},
			})
		} catch (persistError) {
			console.warn("[ClineProvider] Failed to persist Clover automation call log", persistError)
		}

		return message
	}

	private buildAutomationCallPayload(details: {
		name: string
		title?: string
		status: "succeeded" | "failed"
		summary?: string
		inputs?: OuterGateAutomationCallInput[]
		outputLines?: string[]
		error?: string
	}): OuterGateAutomationCall {
		const cleanedInputs = details.inputs?.length
			? details.inputs.map((entry) => ({ ...entry }))
			: undefined
		const cleanedOutputs = details.outputLines?.length ? [...details.outputLines] : undefined
		return {
			name: details.name,
			title: details.title,
			status: details.status,
			summary: details.summary,
			inputs: cleanedInputs,
			outputLines: cleanedOutputs,
			error: details.error,
		}
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
			this.log(`[getTelemetryProperties];
        Failed;
        to;
        get;
        cloud;
        auth;
        state: $;
        {
            error;
        }
        `)
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
			const task = `;
        Set;
        up;
        the;
        MCP;
        server;
        from;
        $;
        {
            mcpDetails.githubUrl;
        }
        while (adhering)
            to;
        these;
        MCP;
        server;
        installation;
        rules: -Use;
        "${mcpDetails.mcpId}";
        server;
        name in $;
        {
            GlobalFileNames.mcpSettings;
        }
        -Create;
        the;
        directory;
        for (the; new MCP; server)
            before;
        starting;
        installation.
            - Use;
        commands;
        aligned;
        with (the)
            user;
        's shell and operating system best practices.
            - The;
        following;
        README;
        may;
        contain;
        instructions;
        that;
        conflict;
        with (the)
            user;
        's OS, in which case proceed thoughtfully.
            - Once;
        installed, demonstrate;
        the;
        server;
        's capabilities by using one of its tools.;
        Here;
        is;
        the;
        project;
        's README to help you get started:\n\n${mcpDetails.readmeContent}\n${mcpDetails.llmsInstallationContent}`;
        // Initialize task and show chat view
        await this.createTask(task);
        await this.postMessageToWebview({
            type: "action",
            action: "chatButtonClicked",
        });
    }
    try { }
    catch (error) {
        console.error("Failed to download MCP:", error);
        let errorMessage = "Failed to download MCP";
        if (axios.isAxiosError(error)) {
            if (error.code === "ECONNABORTED") {
                errorMessage = "Request timed out. Please try again.";
            }
            else if (error.response?.status === 404) {
                errorMessage = "MCP server not found in marketplace.";
            }
            else if (error.response?.status === 500) {
                errorMessage = "Internal server error. Please try again later.";
            }
            else if (!error.response && error.request) {
                errorMessage = "Network error. Please check your internet connection.";
            }
        }
        else if (error instanceof Error) {
            errorMessage = error.message;
        }
        // Show error in both notification and marketplace UI
        vscode.window.showErrorMessage(errorMessage);
        await this.postMessageToWebview({
            type: "mcpDownloadDetails",
            error: errorMessage,
        });
    }
}
// end kilocode_change
// kilocode_change start
// Add new methods for favorite functionality
async;
toggleTaskFavorite(id, string);
{
    const history = this.getGlobalState("taskHistory") ?? [];
    const updatedHistory = history.map((item) => {
        if (item.id === id) {
            return { ...item, isFavorited: !item.isFavorited };
        }
        return item;
    });
    await this.updateGlobalState("taskHistory", updatedHistory);
    await this.postStateToWebview();
}
async;
getFavoriteTasks();
Promise < HistoryItem[] > {
    const: history = this.getGlobalState("taskHistory") ?? [],
    return: history.filter((item) => item.isFavorited)
};
// Modify batch delete to respect favorites
async;
deleteMultipleTasks(taskIds, string[]);
{
    const history = this.getGlobalState("taskHistory") ?? [];
    const favoritedTaskIds = taskIds.filter((id) => history.find((item) => item.id === id)?.isFavorited);
    if (favoritedTaskIds.length > 0) {
        throw new Error("Cannot delete favorited tasks. Please unfavorite them first.");
    }
    for (const id of taskIds) {
        await this.deleteTaskWithId(id);
    }
}
async;
setTaskFileNotFound(id, string);
{
    const history = this.getGlobalState("taskHistory") ?? [];
    const updatedHistory = history.map((item) => {
        if (item.id === id) {
            return { ...item, fileNotfound: true };
        }
        return item;
    });
    await this.updateGlobalState("taskHistory", updatedHistory);
    await this.postStateToWebview();
}
get;
cwd();
{
    return this.currentWorkspacePath || getWorkspacePath();
}
convertToWebviewUri(filePath, string);
string;
{
    try {
        const fileUri = vscode.Uri.file(filePath);
        // Check if we have a webview available
        if (this.view?.webview) {
            const webviewUri = this.view.webview.asWebviewUri(fileUri);
            return webviewUri.toString();
        }
        // Specific error for no webview available
        const error = new Error("No webview available for URI conversion");
        console.error(error.message);
        // Fallback to file URI if no webview available
        return fileUri.toString();
    }
    catch (error) {
        // More specific error handling
        if (error instanceof TypeError) {
            console.error("Invalid file path provided for URI conversion:", error);
        }
        else {
            console.error("Failed to convert to webview URI:", error);
        }
        // Return file URI as fallback
        return vscode.Uri.file(filePath).toString();
    }
}
function createCloverWelcomeMessage(timestampIso = new Date().toISOString()) {
    return {
        id: randomUUID(),
        speaker: "clover",
        text: CLOVER_WELCOME_TEXT,
        timestamp: timestampIso,
    };
}
function cloneOuterGateState(state) {
    return {
        analysisPool: { ...state.analysisPool },
        recentInsights: state.recentInsights.map((insight) => ({ ...insight })),
        suggestions: [...state.suggestions],
        quickActions: state.quickActions.map((action) => ({ ...action })),
        integrations: state.integrations.map((integration) => ({ ...integration })),
        cloverMessages: state.cloverMessages.map((message) => ({
            ...message,
            references: message.references ? [...message.references] : undefined,
            insightEvent: message.insightEvent
                ? {
                    ...message.insightEvent,
                    note: optionalString(message.insightEvent.note),
                    insight: { ...message.insightEvent.insight },
                    changes: message.insightEvent.changes?.map((change) => ({ ...change })),
                }
                : undefined,
            automationCall: message.automationCall
                ? {
                    ...message.automationCall,
                    inputs: message.automationCall.inputs
                        ? message.automationCall.inputs.map((entry) => ({ ...entry }))
                        : undefined,
                    outputLines: message.automationCall.outputLines
                        ? [...message.automationCall.outputLines]
                        : undefined,
                }
                : undefined,
        })),
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
                metadata: point.metadata ? { ...point.metadata } : undefined,
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
    };
}
function createInitialOuterGateState(_workplaceState) {
    const base = cloneOuterGateState(defaultOuterGateState);
    const nowIso = new Date().toISOString();
    base.analysisPool = {
        ...base.analysisPool,
        lastUpdatedIso: nowIso,
    };
    base.cloverMessages = [createCloverWelcomeMessage(nowIso)];
    base.isCloverProcessing = false;
    return base;
}
function buildPassionMapFromAnalysis(items) {
    const sanitized = items
        .filter((item) => Array.isArray(item.embedding) && item.embedding.length >= 2 && item.text && item.text.trim().length > 0)
        .slice(0, 500);
    if (!sanitized.length) {
        return { points: [], clusters: [], summary: undefined };
    }
    const embeddings = sanitized.map((item) => item.embedding);
    const coordinates = runTsneEmbedding(embeddings);
    const nowMs = Date.now();
    const clusterEntries = sanitized.map((item, index) => ({
        item,
        coord: coordinates[index],
        heat: computeRecencyHeat(item.createdAt, nowMs),
    }));
    const clusterCount = estimateClusterCount(clusterEntries.length);
    const { assignments, centroids } = kMeans(clusterEntries.map((entry) => entry.coord), clusterCount);
    const clusterIdCache = new Map();
    const clusterBuckets = new Map();
    const points = clusterEntries.map((entry, index) => {
        const clusterIndex = assignments[index] ?? 0;
        const clusterId = getClusterId(clusterIndex, clusterIdCache);
        const bucket = clusterBuckets.get(clusterId);
        if (bucket) {
            bucket.push(entry);
        }
        else {
            clusterBuckets.set(clusterId, [entry]);
        }
        const snippet = createSnippet(entry.item.text);
        const metadata = buildPassionPointMetadata(entry.item);
        return {
            id: entry.item.id,
            label: createLabelFromSnippet(snippet),
            kind: entry.item.kind,
            status: entry.item.status,
            clusterId,
            coordinates: {
                x: roundCoordinate(entry.coord[0]),
                y: roundCoordinate(entry.coord[1]),
            },
            heat: Number(entry.heat.toFixed(3)),
            createdAtIso: entry.item.createdAt,
            snippet,
            sessionId: entry.item.sessionId,
            tokens: entry.item.tokens,
            metadata,
        };
    });
    const centroidMap = new Map();
    centroids.forEach((centroid, index) => {
        const clusterId = getClusterId(index, clusterIdCache);
        centroidMap.set(clusterId, {
            x: roundCoordinate(centroid[0]),
            y: roundCoordinate(centroid[1]),
        });
    });
    const totalPoints = points.length || 1;
    const clusterDetails = Array.from(clusterBuckets.entries()).map(([clusterId, bucket]) => {
        const texts = bucket.map((entry) => entry.item.text);
        const rawKeywords = extractTopKeywords(texts, 5);
        const topKeywords = rawKeywords.map(toTitleCase);
        const avgHeat = bucket.reduce((sum, entry) => sum + entry.heat, 0) / bucket.length;
        const centroid = centroidMap.get(clusterId) ?? { x: 0, y: 0 };
        return {
            id: clusterId,
            size: bucket.length,
            centroid,
            topKeywords,
            avgHeat,
        };
    });
    const sortedClusters = clusterDetails
        .sort((a, b) => b.size - a.size)
        .map((detail, index) => {
        const label = detail.topKeywords.length
            ? detail.topKeywords.slice(0, 2).join(" • ")
            : `Cluster ${index + 1}`;
        const passionScore = Number(((detail.avgHeat * 0.65) + (detail.size / totalPoints) * 0.35).toFixed(2));
        return {
            id: detail.id,
            label,
            color: PASSION_COLOR_PALETTE[index % PASSION_COLOR_PALETTE.length],
            size: detail.size,
            topKeywords: detail.topKeywords,
            passionScore,
            centroid: detail.centroid,
        };
    });
    const summary = sortedClusters.length
        ? `Top passions: ${sortedClusters
            .slice(0, 4)
            .map((cluster) => `${cluster.label} (${cluster.size})`)
            .join(", ")}`
        : undefined;
    return { points, clusters: sortedClusters, summary };
}
function runTsneEmbedding(embeddings) {
    if (embeddings.length === 0) {
        return [];
    }
    if (embeddings.length === 1) {
        return [[0, 0]];
    }
    if (embeddings.length === 2) {
        return normalizeCoordinatePairs([
            [-1, 0],
            [1, 0],
        ]);
    }
    const basePerplexity = Math.min(30, Math.max(5, Math.floor(Math.sqrt(embeddings.length))));
    const perplexity = Math.min(basePerplexity, Math.max(2, embeddings.length - 1));
    const iterations = Math.min(600, Math.max(300, embeddings.length * 12));
    try {
        const model = new TSNE({
            dim: 2,
            perplexity,
            earlyExaggeration: 4.0,
            learningRate: 200,
            nIter: iterations,
            metric: "euclidean",
            barneshut: embeddings.length > 150,
        });
        model.init({ data: embeddings, type: "dense" });
        model.run();
        const output = model.getOutputScaled();
        return normalizeCoordinatePairs(output);
    }
    catch (error) {
        console.warn("[ClineProvider] t-SNE computation failed, using fallback layout", error);
        return normalizeCoordinatePairs(fallbackLayout(embeddings.length));
    }
}
function normalizeCoordinatePairs(pairs) {
    if (!pairs.length) {
        return [];
    }
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const [x, y] of pairs) {
        if (x < minX)
            minX = x;
        if (x > maxX)
            maxX = x;
        if (y < minY)
            minY = y;
        if (y > maxY)
            maxY = y;
    }
    const centerX = (maxX + minX) / 2;
    const centerY = (maxY + minY) / 2;
    const rangeX = Math.max(maxX - minX, 1e-9);
    const rangeY = Math.max(maxY - minY, 1e-9);
    return pairs.map(([x, y]) => [
        (x - centerX) / (rangeX / 2),
        (y - centerY) / (rangeY / 2),
    ]);
}
function parseCloverFunctionCallBlock(block) {
    const normalized = stripCodeFence(block);
    if (!normalized) {
        return [];
    }
    let parsed;
    try {
        parsed = JSON.parse(normalized);
    }
    catch (error) {
        throw new Error(`functionCalls block must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (Array.isArray(parsed)) {
        return parsed.map((entry, index) => normalizeFunctionCall(entry, index));
    }
    if (isPlainObject(parsed)) {
        const record = parsed;
        if (Array.isArray(record.function_calls)) {
            return record.function_calls.map((entry, index) => normalizeFunctionCall(entry, index));
        }
        return [normalizeFunctionCall(parsed, 0)];
    }
    throw new Error("functionCalls block must be a JSON object or array");
}
function humanizeAutomationCallName(name) {
    if (!name) {
        return "Automation Call";
    }
    return name
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}
function buildAutomationCallInputs(value, maxFields = 6) {
    if (value === null || value === undefined) {
        return [];
    }
    if (Array.isArray(value)) {
        if (!value.length) {
            return [];
        }
        if (value.every(isAutomationPrimitive)) {
            const preview = value
                .slice(0, 3)
                .map((entry) => summarizeAutomationScalar(entry))
                .join(", ");
            return [
                {
                    label: "items",
                    value: value.length > 3 ? `${preview}, …${value.length - 3} more` : preview,
                },
            ];
        }
        return [
            {
                label: "items",
                value: `${value.length} item${value.length === 1 ? "" : "s"}`,
            },
        ];
    }
    if (typeof value !== "object") {
        return [
            {
                label: "value",
                value: summarizeAutomationScalar(value),
            },
        ];
    }
    const entries = Object.entries(value);
    if (!entries.length) {
        return [];
    }
    const result = [];
    for (let index = 0; index < entries.length; index += 1) {
        const [key, val] = entries[index];
        if (index >= maxFields) {
            const remaining = entries.length - index;
            result.push({
                label: "…",
                value: `${remaining} more field${remaining === 1 ? "" : "s"}`,
            });
            break;
        }
        result.push({
            label: formatAutomationLabel(key),
            value: summarizeAutomationValue(val),
        });
    }
    return result;
}
function formatAutomationLabel(key) {
    if (!key) {
        return "value";
    }
    const humanized = humanizeAutomationCallName(key);
    return humanized.replace(/\bId\b/gi, "ID");
}
function summarizeAutomationValue(value) {
    if (value === null || value === undefined) {
        return "—";
    }
    if (typeof value === "string") {
        return truncateAutomationText(value);
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    if (Array.isArray(value)) {
        if (!value.length) {
            return "(empty list)";
        }
        if (value.every(isAutomationPrimitive)) {
            const preview = value
                .slice(0, 3)
                .map((entry) => summarizeAutomationScalar(entry))
                .join(", ");
            return value.length > 3 ? `${preview}, …${value.length - 3} more` : preview;
        }
        return `${value.length} item${value.length === 1 ? "" : "s"}`;
    }
    if (typeof value === "object") {
        const entries = Object.entries(value);
        if (!entries.length) {
            return "(empty object)";
        }
        const preview = entries
            .slice(0, 3)
            .map(([key, val]) => `${formatAutomationLabel(key)}: ${summarizeAutomationScalar(val)}`)
            .join(", ");
        return entries.length > 3 ? `${preview}, …${entries.length - 3} more` : preview;
    }
    return String(value);
}
function summarizeAutomationScalar(value) {
    if (value === null || value === undefined) {
        return "—";
    }
    if (typeof value === "string") {
        return truncateAutomationText(value);
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    if (Array.isArray(value)) {
        return `${value.length} item${value.length === 1 ? "" : "s"}`;
    }
    if (typeof value === "object") {
        return "object";
    }
    return String(value);
}
function truncateAutomationText(value, limit = 120) {
    const trimmed = value.trim();
    if (trimmed.length <= limit) {
        return trimmed;
    }
    return `${trimmed.slice(0, Math.max(1, limit - 1)).trim()}…`;
}
function isAutomationPrimitive(value) {
    return (value === null ||
        value === undefined ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean");
}
function formatAutomationListPreview(items, max = 3) {
    if (!items.length) {
        return "";
    }
    if (items.length <= max) {
        return items.join(", ");
    }
    const visible = items.slice(0, max);
    return `${visible.join(", ")}, …${items.length - max} more`;
}
function stripCodeFence(value) {
    let trimmed = value.trim();
    const fence = /^```[a-zA-Z0-9_-]*\s*([\s\S]*?)\s*```$/;
    let match = trimmed.match(fence);
    if (match) {
        trimmed = match[1]?.trim() ?? "";
    }
    return trimmed;
}
function normalizeFunctionCall(raw, index) {
    if (!isPlainObject(raw)) {
        throw new Error(`function_calls[${index}] must be an object`);
    }
    const record = raw;
    const nameRaw = record.name;
    if (typeof nameRaw !== "string" || !nameRaw.trim()) {
        throw new Error(`function_calls[${index}] is missing a valid name`);
    }
    let args = record.arguments;
    if (typeof args === "string") {
        const trimmed = args.trim();
        if (trimmed) {
            try {
                args = JSON.parse(trimmed);
            }
            catch (error) {
                throw new Error(`function_calls[${index}].arguments must be JSON parseable: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        else {
            args = undefined;
        }
    }
    if (args !== undefined && !isPlainObject(args)) {
        throw new Error(`function_calls[${index}].arguments must be an object`);
    }
    return {
        name: nameRaw.trim(),
        arguments: args,
    };
}
function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function parseCreateCompanyPayloads(args) {
    const record = coerceRecord(args, "create_company arguments must be an object");
    const defaults = {
        name: toOptionalText(record.name ?? record.company_name),
        emoji: toOptionalText(record.emoji ?? record.company_emoji),
        description: toOptionalText(record.description ?? record.company_description),
        vision: toOptionalText(record.vision),
        mission: toOptionalText(record.mission),
        ownerProfile: normalizeOwnerProfileInput(record.owner_profile ?? record.ownerProfile),
        updateDefaultOwnerProfile: normalizeBooleanInput(record.update_default_owner_profile ?? record.updateDefaultOwnerProfile, "update_default_owner_profile"),
    };
    const entries = record.companies !== undefined
        ? coerceRecordArray(record.companies, "companies")
        : [pickCompanyEntryFields(record)];
    if (entries.length === 0) {
        throw new Error("create_company must include at least one entry");
    }
    return entries.map((entry, index) => buildCreateCompanyPayload(entry, defaults, index, entries.length > 1));
}
function buildCreateCompanyPayload(entry, defaults, index, isBulk) {
    const name = toOptionalText(entry.name ?? entry.company_name) ??
        defaults.name;
    if (!name) {
        const suffix = isBulk ? ` (entry ${index + 1})` : "";
        throw new Error(`Company name is required${suffix}`);
    }
    const emoji = toOptionalText(entry.emoji ?? entry.company_emoji) ?? defaults.emoji;
    const description = toOptionalText(entry.description ?? entry.company_description) ?? defaults.description;
    const vision = toOptionalText(entry.vision) ?? defaults.vision;
    const mission = toOptionalText(entry.mission) ?? defaults.mission;
    let ownerProfile = defaults.ownerProfile;
    if (entry.owner_profile !== undefined || entry.ownerProfile !== undefined) {
        ownerProfile = normalizeOwnerProfileInput(entry.owner_profile ?? entry.ownerProfile, "owner_profile");
    }
    let updateDefaultOwnerProfile = defaults.updateDefaultOwnerProfile;
    if (entry.update_default_owner_profile !== undefined || entry.updateDefaultOwnerProfile !== undefined) {
        updateDefaultOwnerProfile = normalizeBooleanInput(entry.update_default_owner_profile ?? entry.updateDefaultOwnerProfile, "update_default_owner_profile");
    }
    return {
        name,
        emoji,
        description,
        vision,
        mission,
        ownerProfile,
        updateDefaultOwnerProfile,
    };
}
function parseUpdateCompanyPayloads(args) {
    const record = coerceRecord(args, "update_company arguments must be an object");
    const defaults = {
        companyId: toOptionalText(record.company_id ?? record.companyId),
        name: toOptionalText(record.name ?? record.company_name),
        emoji: toOptionalText(record.emoji ?? record.company_emoji),
        description: toOptionalText(record.description ?? record.company_description),
        vision: toOptionalText(record.vision),
        mission: toOptionalText(record.mission),
        ownerProfile: normalizeOwnerProfileInput(record.owner_profile ?? record.ownerProfile),
        updateDefaultOwnerProfile: normalizeBooleanInput(record.update_default_owner_profile ?? record.updateDefaultOwnerProfile, "update_default_owner_profile"),
    };
    const entries = record.company_updates !== undefined
        ? coerceRecordArray(record.company_updates, "company_updates")
        : [pickCompanyEntryFields(record)];
    if (entries.length === 0) {
        throw new Error("update_company must include at least one update entry");
    }
    return entries.map((entry, index) => buildUpdateCompanyPayload(entry, defaults, index, entries.length > 1));
}
function buildUpdateCompanyPayload(entry, defaults, index, isBulk) {
    const companyId = toOptionalText(entry.company_id ?? entry.companyId) ?? defaults.companyId;
    if (!companyId) {
        const suffix = isBulk ? ` (entry ${index + 1})` : "";
        throw new Error(`company_id is required${suffix}`);
    }
    const name = toOptionalText(entry.name ?? entry.company_name) ?? defaults.name;
    const emoji = toOptionalText(entry.emoji ?? entry.company_emoji) ?? defaults.emoji;
    const description = toOptionalText(entry.description ?? entry.company_description) ?? defaults.description;
    const vision = toOptionalText(entry.vision) ?? defaults.vision;
    const mission = toOptionalText(entry.mission) ?? defaults.mission;
    let ownerProfile = defaults.ownerProfile;
    if (entry.owner_profile !== undefined || entry.ownerProfile !== undefined) {
        ownerProfile = normalizeOwnerProfileInput(entry.owner_profile ?? entry.ownerProfile, "owner_profile");
    }
    let updateDefaultOwnerProfile = defaults.updateDefaultOwnerProfile;
    if (entry.update_default_owner_profile !== undefined || entry.updateDefaultOwnerProfile !== undefined) {
        updateDefaultOwnerProfile = normalizeBooleanInput(entry.update_default_owner_profile ?? entry.updateDefaultOwnerProfile, "update_default_owner_profile");
    }
    return {
        companyId,
        name,
        emoji,
        description,
        vision,
        mission,
        ownerProfile,
        updateDefaultOwnerProfile,
    };
}
function parseCreateInsightPayloads(args) {
    const record = coerceRecord(args, "create_insight arguments must be an object");
    const defaults = {
        id: normalizeInsightId(record.id ?? record.insight_id),
        title: toOptionalText(record.title ?? record.name ?? record.headline),
        summary: toOptionalText(record.summary ?? record.description ?? record.insight_summary),
        recommendedWorkspace: toOptionalText(record.recommended_workspace ?? record.workspace ?? record.destination),
        assignedCompanyId: toOptionalText(record.assigned_company_id ?? record.company_id ?? record.assigned_company),
        stage: normalizeInsightStageInput(record.stage ?? record.status, "stage"),
        sourceType: normalizeInsightSourceTypeInput(record.source_type ?? record?.sourceType, "source_type"),
        capturedAtIso: normalizeOptionalIsoInput(record.captured_at_iso ?? record?.capturedAtIso, "captured_at_iso"),
        note: normalizeInsightNote(record.note ?? record.insight_note),
    };
    const entries = record.insights !== undefined
        ? coerceRecordArray(record.insights, "insights")
        : [pickInsightEntryFields(record)];
    return entries.map((entry, index) => buildCreateInsightPayload(entry, defaults, index, entries.length > 1));
}
function buildCreateInsightPayload(entry, defaults, index, isBulk) {
    const id = normalizeInsightId(entry.id ?? entry.insight_id) ?? defaults.id;
    const title = toOptionalText(entry.title ?? entry.name ?? entry.headline) ??
        defaults.title;
    if (!title) {
        const suffix = isBulk ? ` (insights[${index}])` : "";
        throw new Error(`Insight title is required${suffix}`);
    }
    const summary = toOptionalText(entry.summary ?? entry.description ?? entry.insight_summary) ?? defaults.summary;
    const recommendedWorkspace = toOptionalText(entry.recommended_workspace ?? entry.workspace ?? entry.destination) ??
        defaults.recommendedWorkspace;
    const assignedCompanyId = toOptionalText(entry.assigned_company_id ?? entry.company_id ?? entry.assigned_company) ??
        defaults.assignedCompanyId;
    const stage = normalizeInsightStageInput(entry.stage ?? entry.status, isBulk ? `insights[${index}].stage` : "stage") ?? defaults.stage ?? "captured";
    const sourceType = normalizeInsightSourceTypeInput(entry.source_type ?? entry?.sourceType, isBulk ? `insights[${index}].source_type` : "source_type") ?? defaults.sourceType ?? "conversation";
    const capturedAtIso = normalizeOptionalIsoInput(entry.captured_at_iso ?? entry?.capturedAtIso, isBulk ? `insights[${index}].captured_at_iso` : "captured_at_iso") ?? defaults.capturedAtIso;
    const note = normalizeInsightNote(entry.note ?? entry.insight_note) ?? defaults.note;
    return {
        id,
        title,
        summary,
        recommendedWorkspace,
        assignedCompanyId,
        stage,
        sourceType,
        capturedAtIso,
        note,
    };
}
function parseUpdateInsightPayloads(args) {
    const record = coerceRecord(args, "update_insight arguments must be an object");
    const defaults = {
        id: normalizeInsightId(record.id ?? record.insight_id),
        title: toOptionalText(record.title ?? record.name ?? record.headline),
        summary: toOptionalText(record.summary ?? record.description ?? record.insight_summary),
        recommendedWorkspace: toOptionalText(record.recommended_workspace ?? record.workspace ?? record.destination),
        assignedCompanyId: toOptionalText(record.assigned_company_id ?? record.company_id ?? record.assigned_company),
        stage: normalizeInsightStageInput(record.stage ?? record.status, "stage"),
        sourceType: normalizeInsightSourceTypeInput(record.source_type ?? record?.sourceType, "source_type"),
        capturedAtIso: normalizeOptionalIsoInput(record.captured_at_iso ?? record?.capturedAtIso, "captured_at_iso"),
        note: normalizeInsightNote(record.note ?? record.insight_note),
    };
    const entries = record.insight_updates !== undefined
        ? coerceRecordArray(record.insight_updates, "insight_updates")
        : [pickInsightEntryFields(record)];
    return entries.map((entry, index) => buildUpdateInsightPayload(entry, defaults, index, entries.length > 1));
}
function buildUpdateInsightPayload(entry, defaults, index, isBulk) {
    const id = normalizeInsightId(entry.id ?? entry.insight_id) ?? defaults.id;
    if (!id) {
        const suffix = isBulk ? ` (insight_updates[${index}])` : "";
        throw new Error(`update_insight is missing id${suffix}`);
    }
    const title = toOptionalText(entry.title ?? entry.name ?? entry.headline) ?? defaults.title;
    const summary = toOptionalText(entry.summary ?? entry.description ?? entry.insight_summary) ?? defaults.summary;
    const recommendedWorkspace = toOptionalText(entry.recommended_workspace ?? entry.workspace ?? entry.destination) ??
        defaults.recommendedWorkspace;
    const assignedCompanyId = toOptionalText(entry.assigned_company_id ?? entry.company_id ?? entry.assigned_company) ??
        defaults.assignedCompanyId;
    const stage = normalizeInsightStageInput(entry.stage ?? entry.status, isBulk ? `insight_updates[${index}].stage` : "stage") ?? defaults.stage;
    const sourceType = normalizeInsightSourceTypeInput(entry.source_type ?? entry?.sourceType, isBulk ? `insight_updates[${index}].source_type` : "source_type") ?? defaults.sourceType;
    const capturedAtIso = normalizeOptionalIsoInput(entry.captured_at_iso ?? entry?.capturedAtIso, isBulk ? `insight_updates[${index}].captured_at_iso` : "captured_at_iso") ?? defaults.capturedAtIso;
    const note = normalizeInsightNote(entry.note ?? entry.insight_note) ?? defaults.note;
    return {
        id,
        title,
        summary,
        recommendedWorkspace,
        assignedCompanyId,
        stage,
        sourceType,
        capturedAtIso,
        note,
    };
}
function storedInsightToOuterGate(stored) {
    const { integrationId: _integrationId, upsertedAtIso: _upsertedAtIso, ...insight } = stored;
    return { ...insight };
}
function diffInsights(previous, next) {
    const changes = [];
    if (optionalString(previous.title) !== optionalString(next.title)) {
        changes.push({ field: "title", from: optionalString(previous.title), to: optionalString(next.title) });
    }
    if (optionalString(previous.summary) !== optionalString(next.summary)) {
        changes.push({ field: "summary", from: optionalString(previous.summary), to: optionalString(next.summary) });
    }
    if (previous.stage !== next.stage) {
        changes.push({ field: "stage", from: previous.stage, to: next.stage });
    }
    if (optionalString(previous.recommendedWorkspace) !== optionalString(next.recommendedWorkspace)) {
        changes.push({
            field: "recommendedWorkspace",
            from: optionalString(previous.recommendedWorkspace),
            to: optionalString(next.recommendedWorkspace),
        });
    }
    if (optionalString(previous.assignedCompanyId) !== optionalString(next.assignedCompanyId)) {
        changes.push({
            field: "assignedCompanyId",
            from: optionalString(previous.assignedCompanyId),
            to: optionalString(next.assignedCompanyId),
        });
    }
    if (optionalString(previous.capturedAtIso) !== optionalString(next.capturedAtIso)) {
        changes.push({
            field: "capturedAtIso",
            from: optionalString(previous.capturedAtIso),
            to: optionalString(next.capturedAtIso),
        });
    }
    if (previous.sourceType !== next.sourceType) {
        changes.push({ field: "sourceType", from: previous.sourceType, to: next.sourceType });
    }
    return changes;
}
function coerceRecord(value, message) {
    if (value === undefined || value === null) {
        return {};
    }
    if (isPlainObject(value)) {
        return value;
    }
    throw new Error(message);
}
function coerceRecordArray(value, field) {
    if (value === undefined || value === null) {
        return [];
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) {
            return [];
        }
        try {
            const parsed = JSON.parse(trimmed);
            return coerceRecordArray(parsed, field);
        }
        catch (error) {
            throw new Error(`${field} must be JSON describing an object or array`);
        }
    }
    if (Array.isArray(value)) {
        if (!value.length) {
            throw new Error(`${field} must include at least one entry`);
        }
        return value.map((entry, index) => {
            if (!isPlainObject(entry)) {
                throw new Error(`${field}[${index}] must be an object`);
            }
            return entry;
        });
    }
    if (isPlainObject(value)) {
        return [value];
    }
    throw new Error(`${field} must be an object or array`);
}
function toOptionalText(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value === "string") {
        return optionalString(value);
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return optionalString(String(value));
    }
    return undefined;
}
function pickCompanyEntryFields(record) {
    const keys = [
        "name",
        "company_name",
        "emoji",
        "company_emoji",
        "description",
        "company_description",
        "vision",
        "mission",
        "owner_profile",
        "ownerProfile",
        "update_default_owner_profile",
        "updateDefaultOwnerProfile",
        "company_id",
        "companyId",
    ];
    const result = {};
    for (const key of keys) {
        if (record[key] !== undefined) {
            result[key] = record[key];
        }
    }
    return result;
}
function pickInsightEntryFields(record) {
    const keys = [
        "id",
        "insight_id",
        "title",
        "name",
        "headline",
        "summary",
        "description",
        "insight_summary",
        "recommended_workspace",
        "workspace",
        "destination",
        "assigned_company_id",
        "assigned_company",
        "company_id",
        "stage",
        "status",
        "source_type",
        "sourceType",
        "captured_at_iso",
        "capturedAtIso",
        "note",
        "insight_note",
    ];
    const result = {};
    for (const key of keys) {
        if (record[key] !== undefined) {
            result[key] = record[key];
        }
    }
    return result;
}
function normalizeInsightId(value) {
    const text = toOptionalText(value);
    return text && text.trim() ? text.trim() : undefined;
}
function normalizeInsightStageInput(value, field) {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new Error(`${field} must be a string`);
    }
    const normalized = value.trim().toLowerCase();
    switch (normalized) {
        case "captured":
        case "capture":
        case "new":
            return "captured";
        case "processing":
        case "in_progress":
        case "pending":
            return "processing";
        case "ready":
        case "prepared":
            return "ready";
        case "assigned":
        case "active":
            return "assigned";
        default:
            throw new Error(`${field} must be one of captured, processing, ready, or assigned`);
    }
}
function normalizeInsightSourceTypeInput(value, field) {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new Error(`${field} must be a string`);
    }
    const normalized = value.trim().toLowerCase();
    switch (normalized) {
        case "conversation":
        case "chat":
            return "conversation";
        case "document":
        case "doc":
            return "document";
        case "voice":
        case "audio":
            return "voice";
        case "integration":
        case "import":
            return "integration";
        default:
            throw new Error(`${field} must be one of conversation, document, voice, or integration`);
    }
}
function normalizeOptionalIsoInput(value, field) {
    const text = toOptionalText(value);
    if (!text) {
        return undefined;
    }
    const timestamp = Date.parse(text);
    if (Number.isNaN(timestamp)) {
        throw new Error(`${field} must be an ISO8601 timestamp`);
    }
    return new Date(timestamp).toISOString();
}
function normalizeInsightNote(value) {
    const text = toOptionalText(value);
    return text && text.trim() ? text.trim() : undefined;
}
function fallbackLayout(count) {
    if (count <= 1) {
        return [[0, 0]];
    }
    const radius = 0.8;
    return Array.from({ length: count }, (_value, index) => {
        const angle = (index / count) * Math.PI * 2;
        return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    });
}
function estimateClusterCount(count) {
    if (count <= 2) {
        return Math.max(1, count);
    }
    if (count <= 8) {
        return 2;
    }
    if (count <= 20) {
        return 3;
    }
    if (count <= 40) {
        return 4;
    }
    if (count <= 80) {
        return 5;
    }
    return Math.min(6, Math.floor(Math.sqrt(count)));
}
function kMeans(points, clusterCount, maxIterations = 50) {
    const count = points.length;
    if (count === 0) {
        return { assignments: [], centroids: [] };
    }
    const dimension = points[0]?.length ?? 2;
    const k = Math.max(1, Math.min(clusterCount, count));
    const centroids = Array.from({ length: k }, (_value, index) => {
        const pointIndex = Math.floor((index * count) / k);
        return [...points[pointIndex]];
    });
    const assignments = new Array(count).fill(0);
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        let changed = false;
        for (let i = 0; i < count; i += 1) {
            let bestIndex = assignments[i];
            let bestDistance = Number.POSITIVE_INFINITY;
            for (let j = 0; j < k; j += 1) {
                const distance = euclideanDistance(points[i], centroids[j]);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestIndex = j;
                }
            }
            if (assignments[i] !== bestIndex) {
                assignments[i] = bestIndex;
                changed = true;
            }
        }
        const sums = Array.from({ length: k }, () => new Array(dimension).fill(0));
        const counts = new Array(k).fill(0);
        for (let i = 0; i < count; i += 1) {
            const clusterIndex = assignments[i];
            counts[clusterIndex] += 1;
            const point = points[i];
            for (let d = 0; d < dimension; d += 1) {
                sums[clusterIndex][d] += point[d];
            }
        }
        for (let j = 0; j < k; j += 1) {
            if (counts[j] === 0) {
                const farthestIndex = findFarthestPoint(points, centroids, assignments);
                centroids[j] = [...points[farthestIndex]];
                assignments[farthestIndex] = j;
                changed = true;
                continue;
            }
            for (let d = 0; d < dimension; d += 1) {
                centroids[j][d] = sums[j][d] / counts[j];
            }
        }
        if (!changed) {
            break;
        }
    }
    return { assignments, centroids };
}
function findFarthestPoint(points, centroids, assignments) {
    let farthestIndex = 0;
    let bestDistance = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < points.length; i += 1) {
        const centroid = centroids[assignments[i]];
        const distance = euclideanDistance(points[i], centroid);
        if (distance > bestDistance) {
            bestDistance = distance;
            farthestIndex = i;
        }
    }
    return farthestIndex;
}
function euclideanDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i += 1) {
        const diff = a[i] - b[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}
function extractTopKeywords(texts, limit) {
    const counts = new Map();
    for (const text of texts) {
        const tokens = text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter((token) => token.length > 2 && !PASSION_STOP_WORDS.has(token));
        const uniqueTokens = new Set(tokens);
        for (const token of uniqueTokens) {
            counts.set(token, (counts.get(token) ?? 0) + 1);
        }
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([token]) => token);
}
function createSnippet(text, maxLength = 160) {
    const condensed = text.replace(/\s+/g, " ").trim();
    if (condensed.length <= maxLength) {
        return condensed;
    }
    return `${condensed.slice(0, maxLength - 1).trimEnd()}…`;
}
function createLabelFromSnippet(snippet) {
    if (!snippet) {
        return "Captured item";
    }
    return snippet.length > 60 ? `${snippet.slice(0, 57).trimEnd()}…` : snippet;
}
function buildPassionPointMetadata(item) {
    const metadata = {};
    if (item.filename) {
        metadata.filename = item.filename;
    }
    if (item.mimeType) {
        metadata.mimeType = item.mimeType;
    }
    if (typeof item.sizeBytes === "number") {
        metadata.sizeBytes = item.sizeBytes;
    }
    if (item.source) {
        metadata.source = item.source;
    }
    if (Array.isArray(item.references) && item.references.length > 0) {
        metadata.references = item.references;
    }
    return Object.keys(metadata).length ? metadata : undefined;
}
function computeRecencyHeat(createdAtIso, nowMs) {
    const createdAt = Date.parse(createdAtIso);
    if (Number.isNaN(createdAt)) {
        return 0.4;
    }
    const ageDays = Math.max(0, (nowMs - createdAt) / (1000 * 60 * 60 * 24));
    const heat = 1 - ageDays / 60;
    return Math.max(0.05, Math.min(1, heat));
}
function getClusterId(index, cache) {
    let id = cache.get(index);
    if (!id) {
        id = `cluster-${index}`;
        cache.set(index, id);
    }
    return id;
}
function toTitleCase(text) {
    if (!text) {
        return text;
    }
    return text.charAt(0).toUpperCase() + text.slice(1);
}
function roundCoordinate(value) {
    const factor = 10 ** PASSION_POINT_DECIMAL_PLACES;
    return Math.round(value * factor) / factor;
}
//# sourceMappingURL=ClineProvider.js.map
