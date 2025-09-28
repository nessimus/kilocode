import * as vscode from "vscode"
import * as dotenvx from "@dotenvx/dotenvx"
import { existsSync } from "fs"
import * as path from "path"

// Load environment variables from .env file
try {
	// Specify path to .env file in the project root directory
	const envPath = path.join(__dirname, "..", ".env")
	if (existsSync(envPath)) {
		dotenvx.config({ path: envPath })
	}
} catch (e) {
	// Silently handle environment loading errors
	console.warn("Failed to load environment variables:", e)
}

import type { CloudUserInfo, AuthState } from "@roo-code/types"
import { CloudService, BridgeOrchestrator } from "@roo-code/cloud"
import { TelemetryService, PostHogTelemetryClient } from "@roo-code/telemetry"

import "./utils/path" // Necessary to have access to String.prototype.toPosix.
import { createOutputChannelLogger, createDualLogger } from "./utils/outputChannelLogger"

import { Package } from "./shared/package"
import { formatLanguage } from "./shared/language"
import { ContextProxy } from "./core/config/ContextProxy"
import { ClineProvider } from "./core/webview/ClineProvider"
import { EndlessSurfaceService } from "./core/surfaces/EndlessSurfaceService"
import { DIFF_VIEW_URI_SCHEME } from "./integrations/editor/DiffViewProvider"
import { TerminalRegistry } from "./integrations/terminal/TerminalRegistry"
import { McpServerManager } from "./services/mcp/McpServerManager"
import { CodeIndexManager } from "./services/code-index/manager"
import { registerCommitMessageProvider } from "./services/commit-message"
import { MdmService } from "./services/mdm/MdmService"
import { migrateSettings } from "./utils/migrateSettings"
import { checkAndRunAutoLaunchingTask as checkAndRunAutoLaunchingTask } from "./utils/autoLaunchingTask"
import { autoImportSettings } from "./utils/autoImportSettings"
import { API } from "./extension/api"

import {
	handleUri,
	registerCommands,
	registerCodeActions,
	registerTerminalActions,
	CodeActionProvider,
} from "./activate"
import { initializeI18n } from "./i18n"
import { registerGhostProvider } from "./services/ghost" // kilocode_change
import { TerminalWelcomeService } from "./services/terminal-welcome/TerminalWelcomeService" // kilocode_change
import { getKiloCodeWrapperProperties } from "./core/kilocode/wrapper" // kilocode_change
import { createWorkplaceService } from "./services/workplace/WorkplaceService"
import { WorkplaceFilesystemManager, FOCUS_SIDEBAR_FLAG_KEY } from "./services/workplace/WorkplaceFilesystemManager"
import { CloverSessionService } from "./services/outerGate/CloverSessionService"

/**
 * Built using https://github.com/microsoft/vscode-webview-ui-toolkit
 *
 * Inspired by:
 *  - https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/default/weather-webview
 *  - https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/frameworks/hello-world-react-cra
 */

let outputChannel: vscode.OutputChannel
let extensionContext: vscode.ExtensionContext
let cloudService: CloudService | undefined

let authStateChangedHandler: ((data: { state: AuthState; previousState: AuthState }) => Promise<void>) | undefined
let settingsUpdatedHandler: (() => void) | undefined
let userInfoHandler: ((data: { userInfo: CloudUserInfo }) => Promise<void>) | undefined

// This method is called when your extension is activated.
// Your extension is activated the very first time the command is executed.
export async function activate(context: vscode.ExtensionContext) {
	extensionContext = context
	outputChannel = vscode.window.createOutputChannel("Kilo-Code")
	context.subscriptions.push(outputChannel)
	outputChannel.appendLine(`${Package.name} extension activated - ${JSON.stringify(Package)}`)

	// Migrate old settings to new
	await migrateSettings(context, outputChannel)

	// Initialize telemetry service.
	const telemetryService = TelemetryService.createInstance()

	const posthogApiKey = process.env.KILOCODE_POSTHOG_API_KEY?.trim()
	if (posthogApiKey) {
		try {
			telemetryService.register(new PostHogTelemetryClient())
		} catch (error) {
			console.warn("Failed to register PostHogTelemetryClient:", error)
		}
	} else {
		console.info("Skipping PostHog telemetry registration: KILOCODE_POSTHOG_API_KEY not set")
	}

	// Create logger for cloud services.
	const cloudLogger = createDualLogger(createOutputChannelLogger(outputChannel))

	// kilocode_change start: no Roo cloud service
	// Initialize Roo Code Cloud service.
	// const cloudService = await CloudService.createInstance(context, cloudLogger)

	// try {
	// 	if (cloudService.telemetryClient) {
	// 		TelemetryService.instance.register(cloudService.telemetryClient)
	// 	}
	// } catch (error) {
	// 	outputChannel.appendLine(
	// 		`[CloudService] Failed to register TelemetryClient: ${error instanceof Error ? error.message : String(error)}`,
	// 	)
	// }

	// const postStateListener = () => {
	// 	ClineProvider.getVisibleInstance()?.postStateToWebview()
	// }

	// cloudService.on("auth-state-changed", postStateListener)
	// cloudService.on("user-info", postStateListener)
	// cloudService.on("settings-updated", postStateListener)

	// // Add to subscriptions for proper cleanup on deactivate
	// context.subscriptions.push(cloudService)
	// kilocode_change end

	// Initialize MDM service
	const mdmService = await MdmService.createInstance(cloudLogger)

	// Initialize i18n for internationalization support
	initializeI18n(context.globalState.get("language") ?? formatLanguage(vscode.env.language))

	// Initialize terminal shell execution handlers.
	TerminalRegistry.initialize()

	// Get default commands from configuration.
	const defaultCommands = vscode.workspace.getConfiguration(Package.name).get<string[]>("allowedCommands") || []

	// Initialize global state if not already set.
	if (!context.globalState.get("allowedCommands")) {
		context.globalState.update("allowedCommands", defaultCommands)
	}

	// kilocode_change start
	if (!context.globalState.get("firstInstallCompleted")) {
		await context.globalState.update("telemetrySetting", "enabled")
	}
	// kilocode_change end

	const contextProxy = await ContextProxy.getInstance(context)
	const workplaceService = await createWorkplaceService(context)
	const workplaceFilesystemManager = new WorkplaceFilesystemManager(context)
	await workplaceFilesystemManager.initialize(workplaceService.getState())
	workplaceService.attachStateObserver(workplaceFilesystemManager)
	const cloverSessionService = new CloverSessionService(context, () => workplaceService)
	const endlessSurfaceService = new EndlessSurfaceService(context, (message, ...rest) => {
		const serializedRest = rest.map((entry) =>
			typeof entry === "string"
				? entry
				: (() => {
						try {
							return JSON.stringify(entry)
						} catch {
							return String(entry)
						}
					})(),
		)
		outputChannel.appendLine([message, ...serializedRest].join(" "))
	})
	await endlessSurfaceService.initialize()

	// Initialize code index managers for all workspace folders.
	const codeIndexManagers: CodeIndexManager[] = []

	if (vscode.workspace.workspaceFolders) {
		for (const folder of vscode.workspace.workspaceFolders) {
			const manager = CodeIndexManager.getInstance(context, folder.uri.fsPath)

			if (manager) {
				codeIndexManagers.push(manager)

				try {
					await manager.initialize(contextProxy)
				} catch (error) {
					outputChannel.appendLine(
						`[CodeIndexManager] Error during background CodeIndexManager configuration/indexing for ${folder.uri.fsPath}: ${error.message || error}`,
					)
				}

				context.subscriptions.push(manager)
			}
		}
	}

	// Initialize the provider *before* the Roo Code Cloud service.
	const provider = new ClineProvider(context, outputChannel, "sidebar", contextProxy, mdmService)
	provider.attachWorkplaceService(workplaceService)
	provider.attachWorkplaceFilesystemManager(workplaceFilesystemManager)
	provider.attachEndlessSurfaceService(endlessSurfaceService)
	provider.attachCloverSessionService(cloverSessionService)
	const fsConfigListener = workplaceFilesystemManager.addConfigurationListener(() => provider.postStateToWebview())
	context.subscriptions.push(fsConfigListener)

	const shouldFocusSidebar = context.globalState.get<boolean>(FOCUS_SIDEBAR_FLAG_KEY)
	if (shouldFocusSidebar) {
		await context.globalState.update(FOCUS_SIDEBAR_FLAG_KEY, false)
		try {
			await vscode.commands.executeCommand("kilo-code.SidebarProvider.focus")
		} catch (error) {
			outputChannel.appendLine(
				`[WorkplaceFilesystem] Failed to focus sidebar: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	// Initialize Roo Code Cloud service.
	const postStateListener = () => ClineProvider.getVisibleInstance()?.postStateToWebview()

	authStateChangedHandler = async (data: { state: AuthState; previousState: AuthState }) => {
		postStateListener()

		if (data.state === "logged-out") {
			try {
				await BridgeOrchestrator.disconnect()
				cloudLogger("[CloudService] BridgeOrchestrator disconnected on logout")
			} catch (error) {
				cloudLogger(
					`[CloudService] Failed to disconnect BridgeOrchestrator on logout: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		}
	}

	settingsUpdatedHandler = async () => {
		const userInfo = CloudService.instance.getUserInfo()

		if (userInfo && CloudService.instance.cloudAPI) {
			try {
				const config = await CloudService.instance.cloudAPI.bridgeConfig()

				const isCloudAgent =
					typeof process.env.ROO_CODE_CLOUD_TOKEN === "string" && process.env.ROO_CODE_CLOUD_TOKEN.length > 0

				const remoteControlEnabled = isCloudAgent
					? true
					: (CloudService.instance.getUserSettings()?.settings?.extensionBridgeEnabled ?? false)

				await BridgeOrchestrator.connectOrDisconnect(userInfo, remoteControlEnabled, {
					...config,
					provider,
					sessionId: vscode.env.sessionId,
				})
			} catch (error) {
				cloudLogger(
					`[CloudService] BridgeOrchestrator#connectOrDisconnect failed on settings change: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		}

		postStateListener()
	}

	userInfoHandler = async ({ userInfo }: { userInfo: CloudUserInfo }) => {
		postStateListener()

		if (!CloudService.instance.cloudAPI) {
			cloudLogger("[CloudService] CloudAPI is not initialized")
			return
		}

		try {
			const config = await CloudService.instance.cloudAPI.bridgeConfig()

			const isCloudAgent =
				typeof process.env.ROO_CODE_CLOUD_TOKEN === "string" && process.env.ROO_CODE_CLOUD_TOKEN.length > 0

			const remoteControlEnabled = isCloudAgent
				? true
				: (CloudService.instance.getUserSettings()?.settings?.extensionBridgeEnabled ?? false)

			await BridgeOrchestrator.connectOrDisconnect(userInfo, remoteControlEnabled, {
				...config,
				provider,
				sessionId: vscode.env.sessionId,
			})
		} catch (error) {
			cloudLogger(
				`[CloudService] BridgeOrchestrator#connectOrDisconnect failed on user change: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	cloudService = await CloudService.createInstance(context, cloudLogger, {
		"auth-state-changed": authStateChangedHandler,
		"settings-updated": settingsUpdatedHandler,
		"user-info": userInfoHandler,
	})

	try {
		if (cloudService.telemetryClient) {
			// TelemetryService.instance.register(cloudService.telemetryClient) kilocode_change
		}
	} catch (error) {
		outputChannel.appendLine(
			`[CloudService] Failed to register TelemetryClient: ${error instanceof Error ? error.message : String(error)}`,
		)
	}

	// Add to subscriptions for proper cleanup on deactivate.
	context.subscriptions.push(cloudService)

	// Trigger initial cloud profile sync now that CloudService is ready
	try {
		await provider.initializeCloudProfileSyncWhenReady()
	} catch (error) {
		outputChannel.appendLine(
			`[CloudService] Failed to initialize cloud profile sync: ${error instanceof Error ? error.message : String(error)}`,
		)
	}

	// Finish initializing the provider.
	TelemetryService.instance.setProvider(provider)

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ClineProvider.sideBarId, provider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
	)

	// kilocode_change start
	if (!context.globalState.get("firstInstallCompleted")) {
		outputChannel.appendLine("First installation detected, opening Kilo Code sidebar!")
		try {
			await vscode.commands.executeCommand("kilo-code.SidebarProvider.focus")

			outputChannel.appendLine("Opening Kilo Code walkthrough")

			// this can crash, see:
			// https://discord.com/channels/1349288496988160052/1395865796026040470
			await vscode.commands.executeCommand(
				"workbench.action.openWalkthrough",
				"kilocode.kilo-code#kiloCodeWalkthrough",
				false,
			)
		} catch (error) {
			outputChannel.appendLine(`Error during first-time setup: ${error.message}`)
		} finally {
			await context.globalState.update("firstInstallCompleted", true)
		}
	}
	// kilocode_change end

	// Auto-import configuration if specified in settings
	try {
		await autoImportSettings(outputChannel, {
			providerSettingsManager: provider.providerSettingsManager,
			contextProxy: provider.contextProxy,
			customModesManager: provider.customModesManager,
		})
	} catch (error) {
		outputChannel.appendLine(
			`[AutoImport] Error during auto-import: ${error instanceof Error ? error.message : String(error)}`,
		)
	}

	registerCommands({
		context,
		outputChannel,
		provider,
		workplaceService,
		endlessSurfaceService,
		cloverSessionService,
	})

	context.subscriptions.push(
		vscode.commands.registerCommand(`${Package.name}.chooseWorkplaceFolder`, async () => {
			await workplaceFilesystemManager.chooseRootFolder()
			const root = workplaceFilesystemManager.getRootUri()
			if (root) {
				void vscode.window.showInformationMessage(
					`Golden Workplace root set to ${root.fsPath}. Opening the associated workspace...`,
				)
			}
		}),
	)

	const dumpCodexInfoDisposable = vscode.commands.registerCommand("golden-workplace.dev.dumpCodexInfo", async () => {
		const codex = vscode.extensions.getExtension("openai.chatgpt")

		if (!codex) {
			outputChannel.appendLine("[Codex] Extension not found")
			return
		}

		outputChannel.appendLine(`[Codex] ID=${codex.id}, active=${codex.isActive}`)

		const api = await codex.activate()
		const apiKeys = api ? Object.keys(api) : []

		outputChannel.appendLine(`[Codex] Exported keys: ${apiKeys.length ? apiKeys.join(", ") : "[none]"}`)

		const commands = await vscode.commands.getCommands(true)
		const codexCommands = commands.filter(
			(command) => command.startsWith("chatgpt.") || command.includes("codex") || command.includes("openai"),
		)

		outputChannel.appendLine(`[Codex] Commands: ${codexCommands.join(", ")}`)
	})
	context.subscriptions.push(dumpCodexInfoDisposable)

	/**
	 * We use the text document content provider API to show the left side for diff
	 * view by creating a virtual document for the original content. This makes it
	 * readonly so users know to edit the right side if they want to keep their changes.
	 *
	 * This API allows you to create readonly documents in VSCode from arbitrary
	 * sources, and works by claiming an uri-scheme for which your provider then
	 * returns text contents. The scheme must be provided when registering a
	 * provider and cannot change afterwards.
	 *
	 * Note how the provider doesn't create uris for virtual documents - its role
	 * is to provide contents given such an uri. In return, content providers are
	 * wired into the open document logic so that providers are always considered.
	 *
	 * https://code.visualstudio.com/api/extension-guides/virtual-documents
	 */
	const diffContentProvider = new (class implements vscode.TextDocumentContentProvider {
		provideTextDocumentContent(uri: vscode.Uri): string {
			return Buffer.from(uri.query, "base64").toString("utf-8")
		}
	})()

	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(DIFF_VIEW_URI_SCHEME, diffContentProvider),
	)

	context.subscriptions.push(vscode.window.registerUriHandler({ handleUri }))

	// Register code actions provider.
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider({ pattern: "**/*" }, new CodeActionProvider(), {
			providedCodeActionKinds: CodeActionProvider.providedCodeActionKinds,
		}),
	)

	// kilocode_change start
	const kilocodeWrapperProperties = getKiloCodeWrapperProperties()
	if (!kilocodeWrapperProperties.kiloCodeWrapped) {
		registerGhostProvider(context, provider)
	}
	// kilocode_change end
	registerCommitMessageProvider(context, outputChannel) // kilocode_change
	registerCodeActions(context)
	registerTerminalActions(context)

	// Allows other extensions to activate once Kilo Code is ready.
	vscode.commands.executeCommand(`${Package.name}.activationCompleted`)

	// Implements the `RooCodeAPI` interface.
	const socketPath = process.env.KILO_IPC_SOCKET_PATH ?? process.env.ROO_CODE_IPC_SOCKET_PATH // kilocode_change
	const enableLogging = typeof socketPath === "string"

	// Watch the core files and automatically reload the extension host.
	if (process.env.NODE_ENV === "development") {
		const watchPaths = [
			{ path: context.extensionPath, pattern: "**/*.ts" },
			{ path: path.join(context.extensionPath, "../packages/types"), pattern: "**/*.ts" },
			{ path: path.join(context.extensionPath, "../packages/telemetry"), pattern: "**/*.ts" },
			{ path: path.join(context.extensionPath, "node_modules/@roo-code/cloud"), pattern: "**/*" },
		]

		console.log(
			`♻️♻️♻️ Core auto-reloading: Watching for changes in ${watchPaths.map(({ path }) => path).join(", ")}`,
		)

		// Create a debounced reload function to prevent excessive reloads
		let reloadTimeout: NodeJS.Timeout | undefined
		const DEBOUNCE_DELAY = 1_000

		const debouncedReload = (uri: vscode.Uri) => {
			if (reloadTimeout) {
				clearTimeout(reloadTimeout)
			}

			console.log(`♻️ ${uri.fsPath} changed; scheduling reload...`)

			reloadTimeout = setTimeout(() => {
				console.log(`♻️ Reloading host after debounce delay...`)
				vscode.commands.executeCommand("workbench.action.reloadWindow")
			}, DEBOUNCE_DELAY)
		}

		watchPaths.forEach(({ path: watchPath, pattern }) => {
			const relPattern = new vscode.RelativePattern(vscode.Uri.file(watchPath), pattern)
			const watcher = vscode.workspace.createFileSystemWatcher(relPattern, false, false, false)

			// Listen to all change types to ensure symlinked file updates trigger reloads.
			watcher.onDidChange(debouncedReload)
			watcher.onDidCreate(debouncedReload)
			watcher.onDidDelete(debouncedReload)

			context.subscriptions.push(watcher)
		})

		// Clean up the timeout on deactivation
		context.subscriptions.push({
			dispose: () => {
				if (reloadTimeout) {
					clearTimeout(reloadTimeout)
				}
			},
		})
	}

	await checkAndRunAutoLaunchingTask(context) // kilocode_change

	return new API(outputChannel, provider, endlessSurfaceService, socketPath, enableLogging)
}

// This method is called when your extension is deactivated.
export async function deactivate() {
	outputChannel.appendLine(`${Package.name} extension deactivated`)

	if (cloudService && CloudService.hasInstance()) {
		try {
			if (authStateChangedHandler) {
				CloudService.instance.off("auth-state-changed", authStateChangedHandler)
			}

			if (settingsUpdatedHandler) {
				CloudService.instance.off("settings-updated", settingsUpdatedHandler)
			}

			if (userInfoHandler) {
				CloudService.instance.off("user-info", userInfoHandler as any)
			}

			outputChannel.appendLine("CloudService event handlers cleaned up")
		} catch (error) {
			outputChannel.appendLine(
				`Failed to clean up CloudService event handlers: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	const bridge = BridgeOrchestrator.getInstance()

	if (bridge) {
		await bridge.disconnect()
	}

	await McpServerManager.cleanup(extensionContext)
	TelemetryService.instance.shutdown()
	TerminalRegistry.cleanup()
}
