import React, { useCallback, useEffect, useRef, useState, useMemo } from "react"
import { useEvent } from "react-use"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { ExtensionMessage } from "@roo/ExtensionMessage"
import TranslationProvider from "./i18n/TranslationContext"
import { MarketplaceViewStateManager } from "./components/marketplace/MarketplaceViewStateManager"

import { vscode } from "./utils/vscode"
import { telemetryClient } from "./utils/TelemetryClient"
import { TelemetryEventName } from "@roo-code/types"
import { initializeSourceMaps, exposeSourceMapsForDebugging } from "./utils/sourceMapInitializer"
import { ExtensionStateContextProvider, useExtensionState } from "./context/ExtensionStateContext"
import ChatView, { ChatViewRef } from "./components/chat/ChatView"
import HubView from "./components/hub/HubView"
import ChatsHubView from "./components/chats/ChatsHubView"
import HistoryView from "./components/history/HistoryView"
import SettingsView, { SettingsViewRef } from "./components/settings/SettingsView"
import WelcomeView from "./components/kilocode/Welcome/WelcomeView" // kilocode_change
import ProfileView from "./components/kilocode/profile/ProfileView" // kilocode_change
import ActionWorkspaceView from "./components/workplace/ActionWorkspaceView"
import WorkforceView from "./components/workplace/WorkforceView"
import McpView from "./components/mcp/McpView"
import { MarketplaceView } from "./components/marketplace/MarketplaceView"
import ModesView from "./components/modes/ModesView"
import { HumanRelayDialog } from "./components/human-relay/HumanRelayDialog"
import BottomControls from "./components/kilocode/BottomControls" // kilocode_change
import { MemoryService } from "./services/MemoryService" // kilocode_change
import { CheckpointRestoreDialog } from "./components/chat/CheckpointRestoreDialog"
import { DeleteMessageDialog, EditMessageDialog } from "./components/chat/MessageModificationConfirmationDialog"
import ErrorBoundary from "./components/ErrorBoundary"
// import { AccountView } from "./components/account/AccountView" // kilocode_change: we have our own profile view
// import { CloudView } from "./components/cloud/CloudView" // kilocode_change: not rendering this
import { useAddNonInteractiveClickListener } from "./components/ui/hooks/useNonInteractiveClick"
import { TooltipProvider } from "./components/ui/tooltip"
import { STANDARD_TOOLTIP_DELAY } from "./components/ui/standard-tooltip"
import { useKiloIdentity } from "./utils/kilocode/useKiloIdentity"
import OuterGateView from "./components/kilocode/outerGate/OuterGateView"
import BrainstormHubPage from "./components/surfaces/BrainstormHubPage"
import SurfaceDetailPage from "./components/surfaces/SurfaceDetailPage"
import type { BrainstormSurfaceSummary } from "./components/surfaces/types"

type Tab =
	| "settings"
	| "history"
	| "mcp"
	| "modes"
	| "lobby"
	| "hub"
	| "chatsHub"
	| "marketplace"
	| "account"
	| "cloud"
	| "profile"
	| "workspace"
	| "workforce"
	| "outerGate"
	| "brainstorm"

type ViewRoute = { page: "lobby" } | { page: "brainstorm" } | { page: "surface"; surfaceId: string }

const normalizePath = (path: string) => {
	if (!path) {
		return "/"
	}
	const trimmed = path.split("?")[0]?.split("#")[0] ?? "/"
	if (trimmed === "") {
		return "/"
	}
	return trimmed.endsWith("/") && trimmed !== "/" ? trimmed.slice(0, -1) : trimmed
}

const parsePath = (pathname: string): ViewRoute => {
	const normalized = normalizePath(pathname)
	const surfaceMatch = normalized.match(/^\/surfaces\/([^/]+)$/)
	if (surfaceMatch) {
		return { page: "surface", surfaceId: decodeURIComponent(surfaceMatch[1]) }
	}
	if (normalized === "/brainstorm") {
		return { page: "brainstorm" }
	}
	if (normalized === "/lobby" || normalized === "/") {
		return { page: "lobby" }
	}
	return { page: "lobby" }
}

const buildPath = (route: ViewRoute) => {
	switch (route.page) {
		case "brainstorm":
			return "/brainstorm"
		case "surface":
			return `/surfaces/${encodeURIComponent(route.surfaceId)}`
		default:
			return "/lobby"
	}
}

interface HumanRelayDialogState {
	isOpen: boolean
	requestId: string
	promptText: string
}

interface DeleteMessageDialogState {
	isOpen: boolean
	messageTs: number
	hasCheckpoint: boolean
}

interface EditMessageDialogState {
	isOpen: boolean
	messageTs: number
	text: string
	hasCheckpoint: boolean
	images?: string[]
}

// Memoize dialog components to prevent unnecessary re-renders
const MemoizedDeleteMessageDialog = React.memo(DeleteMessageDialog)
const MemoizedEditMessageDialog = React.memo(EditMessageDialog)
const MemoizedCheckpointRestoreDialog = React.memo(CheckpointRestoreDialog)
const MemoizedHumanRelayDialog = React.memo(HumanRelayDialog)

const tabsByMessageAction: Partial<Record<NonNullable<ExtensionMessage["action"]>, Tab>> = {
	chatButtonClicked: "lobby",
	settingsButtonClicked: "settings",
	promptsButtonClicked: "modes",
	mcpButtonClicked: "mcp",
	historyButtonClicked: "history",
	profileButtonClicked: "profile",
	marketplaceButtonClicked: "marketplace",
	hubButtonClicked: "hub",
	// cloudButtonClicked: "cloud", // kilocode_change: no cloud
}

const App = () => {
	const {
		didHydrateState,
		showWelcome,
		shouldShowAnnouncement,
		telemetrySetting,
		telemetryKey,
		machineId,
		// cloudUserInfo, // kilocode_change not used
		// cloudIsAuthenticated, // kilocode_change not used
		renderContext,
		mdmCompliant,
		apiConfiguration, // kilocode_change
		endlessSurface,
		createSurface,
		setActiveSurface,
	} = useExtensionState()

	// Create a persistent state manager
	const marketplaceStateManager = useMemo(() => new MarketplaceViewStateManager(), [])

	const surfaces = useMemo<BrainstormSurfaceSummary[]>(() => {
		return (endlessSurface?.surfaces ?? []).map((surface) => {
			const surfaceWithExtras = surface as typeof surface & {
				owner?: string
				emoji?: string
			}
			return {
				id: surface.id,
				title: surface.title,
				description: surface.description,
				createdAt: new Date(surface.createdAt).toISOString(),
				updatedAt: new Date(surface.updatedAt).toISOString(),
				owner: surfaceWithExtras.owner,
				tags: surface.tags,
				emoji: surfaceWithExtras.emoji,
			}
		})
	}, [endlessSurface?.surfaces])

	const activeSurfaceId = endlessSurface?.activeSurfaceId

	const [showAnnouncement, setShowAnnouncement] = useState(false)
	const [tab, setTab] = useState<Tab>("outerGate")
	const [route, setRoute] = useState<ViewRoute>(() =>
		parsePath(typeof window !== "undefined" ? window.location.pathname : "/"),
	)
	const [brainstormSearch, setBrainstormSearch] = useState("")
	const pendingSurfaceCreation = useRef(false)

	const handleCreateSurface = useCallback(async () => {
		pendingSurfaceCreation.current = true
		try {
			await createSurface()
		} catch (error) {
			pendingSurfaceCreation.current = false
			console.error("Failed to create surface", error)
		}
	}, [createSurface])
	const [humanRelayDialogState, setHumanRelayDialogState] = useState<HumanRelayDialogState>({
		isOpen: false,
		requestId: "",
		promptText: "",
	})

	const [deleteMessageDialogState, setDeleteMessageDialogState] = useState<DeleteMessageDialogState>({
		isOpen: false,
		messageTs: 0,
		hasCheckpoint: false,
	})

	const [editMessageDialogState, setEditMessageDialogState] = useState<EditMessageDialogState>({
		isOpen: false,
		messageTs: 0,
		text: "",
		hasCheckpoint: false,
		images: [],
	})

	const settingsRef = useRef<SettingsViewRef>(null)
	const chatViewRef = useRef<ChatViewRef & { focusInput: () => void }>(null) // kilocode_change

	const navigate = useCallback((nextRoute: ViewRoute, options?: { replace?: boolean }) => {
		const nextPath = buildPath(nextRoute)
		const currentPath = typeof window !== "undefined" ? normalizePath(window.location.pathname) : "/"
		if (typeof window !== "undefined" && nextPath !== currentPath) {
			try {
				if (options?.replace) {
					window.history.replaceState({}, "", nextPath)
				} else {
					window.history.pushState({}, "", nextPath)
				}
			} catch (error) {
				console.warn("Failed to update history state", error)
			}
		}
		setRoute(nextRoute)
	}, [])

	const switchTab = useCallback(
		(newTab: Tab) => {
			// Only check MDM compliance if mdmCompliant is explicitly false (meaning there's an MDM policy and user is non-compliant)
			// If mdmCompliant is undefined or true, allow tab switching
			if (mdmCompliant === false && newTab !== "cloud") {
				// Notify the user that authentication is required by their organization
				vscode.postMessage({ type: "showMdmAuthRequiredNotification" })
				return
			}

			setCurrentSection(undefined)
			setCurrentMarketplaceTab(undefined)

			if (newTab === "brainstorm") {
				navigate({ page: "brainstorm" })
			} else if (route.page !== "lobby" && (route.page === "brainstorm" || route.page === "surface")) {
				navigate({ page: "lobby" })
			}

			if (settingsRef.current?.checkUnsaveChanges) {
				settingsRef.current.checkUnsaveChanges(() => setTab(newTab))
			} else {
				setTab(newTab)
			}
		},
		[mdmCompliant, navigate, route.page],
	)

	const [currentSection, setCurrentSection] = useState<string | undefined>(undefined)
	const [_currentMarketplaceTab, setCurrentMarketplaceTab] = useState<string | undefined>(undefined)

	const onMessage = useCallback(
		(e: MessageEvent) => {
			const message: ExtensionMessage = e.data

			if (message.type === "action" && message.action) {
				// kilocode_change begin
				if (message.action === "focusChatInput") {
					if (tab !== "lobby") {
						switchTab("lobby")
					}
					chatViewRef.current?.focusInput()
					return
				}
				// kilocode_change end

				// Handle switchTab action with tab parameter
				if (message.action === "switchTab" && message.tab) {
					const targetTab = message.tab as Tab
					switchTab(targetTab)
					setCurrentSection(undefined)
					setCurrentMarketplaceTab(undefined)
				} else {
					// Handle other actions using the mapping
					const newTab = tabsByMessageAction[message.action]
					const section = message.values?.section as string | undefined
					const marketplaceTab = message.values?.marketplaceTab as string | undefined

					if (newTab) {
						switchTab(newTab)
						setCurrentSection(section)
						setCurrentMarketplaceTab(marketplaceTab)
					}
				}
			}

			if (message.type === "showHumanRelayDialog" && message.requestId && message.promptText) {
				const { requestId, promptText } = message
				setHumanRelayDialogState({ isOpen: true, requestId, promptText })
			}

			if (message.type === "showDeleteMessageDialog" && message.messageTs) {
				setDeleteMessageDialogState({
					isOpen: true,
					messageTs: message.messageTs,
					hasCheckpoint: message.hasCheckpoint || false,
				})
			}

			if (message.type === "showEditMessageDialog" && message.messageTs && message.text) {
				setEditMessageDialogState({
					isOpen: true,
					messageTs: message.messageTs,
					text: message.text,
					hasCheckpoint: message.hasCheckpoint || false,
					images: message.images || [],
				})
			}

			if (message.type === "openSurface" && message.surfaceId) {
				void setActiveSurface(message.surfaceId)
				navigate({ page: "surface", surfaceId: message.surfaceId })
			}

			if (message.type === "acceptInput") {
				chatViewRef.current?.acceptInput()
			}
		},
		// kilocode_change: add tab
		[tab, switchTab, navigate, setActiveSurface],
	)

	useEvent("message", onMessage)

	useEffect(() => {
		if (typeof window === "undefined") {
			return
		}
		const handlePopState = () => {
			setRoute(parsePath(window.location.pathname))
		}
		window.addEventListener("popstate", handlePopState)
		return () => window.removeEventListener("popstate", handlePopState)
	}, [])

	useEffect(() => {
		if (typeof window === "undefined") {
			return
		}
		const currentPath = normalizePath(window.location.pathname)
		if (currentPath === "/") {
			navigate({ page: "lobby" }, { replace: true })
		}
	}, [navigate])

	useEffect(() => {
		if (route.page === "brainstorm" || route.page === "surface") {
			if (tab !== "brainstorm") {
				setTab("brainstorm")
			}
			return
		}
		if (tab === "brainstorm" && route.page === "lobby") {
			setTab("lobby")
		}
	}, [route, tab])

	useEffect(() => {
		if (shouldShowAnnouncement) {
			setShowAnnouncement(true)
			vscode.postMessage({ type: "didShowAnnouncement" })
		}
	}, [shouldShowAnnouncement])

	// kilocode_change start
	const telemetryDistinctId = useKiloIdentity(apiConfiguration?.kilocodeToken ?? "", machineId ?? "")
	useEffect(() => {
		if (didHydrateState) {
			telemetryClient.updateTelemetryState(telemetrySetting, telemetryKey, telemetryDistinctId)

			// kilocode_change start
			const memoryService = new MemoryService()
			memoryService.start()
			return () => memoryService.stop()
			// kilocode_change end
		}
	}, [telemetrySetting, telemetryKey, telemetryDistinctId, didHydrateState])
	// kilocode_change end

	// Tell the extension that we are ready to receive messages.
	useEffect(() => vscode.postMessage({ type: "webviewDidLaunch" }), [])

	// Initialize source map support for better error reporting
	useEffect(() => {
		// Initialize source maps for better error reporting in production
		initializeSourceMaps()

		// Expose source map debugging utilities in production
		if (process.env.NODE_ENV === "production") {
			exposeSourceMapsForDebugging()
		}

		// Log initialization for debugging
		console.debug("App initialized with source map support")
	}, [])

	// Focus the WebView when non-interactive content is clicked (only in editor/tab mode)
	useAddNonInteractiveClickListener(
		useCallback(() => {
			// Only send focus request if we're in editor (tab) mode, not sidebar
			if (renderContext === "editor") {
				vscode.postMessage({ type: "focusPanelRequest" })
			}
		}, [renderContext]),
	)
	// Track marketplace tab views
	useEffect(() => {
		if (tab === "marketplace") {
			telemetryClient.capture(TelemetryEventName.MARKETPLACE_TAB_VIEWED)
		}
	}, [tab])

	useEffect(() => {
		if (pendingSurfaceCreation.current && activeSurfaceId) {
			navigate({ page: "surface", surfaceId: activeSurfaceId })
			pendingSurfaceCreation.current = false
		}
	}, [activeSurfaceId, navigate])

	if (!didHydrateState) {
		return null
	}

	// Do not conditionally load ChatView, it's expensive and there's state we
	// don't want to lose (user input, disableInput, askResponse promise, etc.)
	return showWelcome ? (
		<WelcomeView />
	) : (
		<>
			{tab === "outerGate" && <OuterGateView />}
			{tab === "modes" && <ModesView onDone={() => switchTab("lobby")} />}
			{tab === "mcp" && <McpView onDone={() => switchTab("lobby")} />}
			{tab === "history" && <HistoryView onDone={() => switchTab("lobby")} />}
			{tab === "settings" && (
				<SettingsView ref={settingsRef} onDone={() => switchTab("lobby")} targetSection={currentSection} /> // kilocode_change
			)}
			{/* kilocode_change: add profileview */}
			{tab === "profile" && <ProfileView onDone={() => switchTab("lobby")} />}
			{tab === "workspace" && <ActionWorkspaceView onDone={() => switchTab("lobby")} />}
			{tab === "workforce" && <WorkforceView onDone={() => switchTab("lobby")} />}
			{tab === "marketplace" && (
				<MarketplaceView
					stateManager={marketplaceStateManager}
					onDone={() => switchTab("lobby")}
					// kilocode_change: targetTab="mode"
					targetTab="mode"
				/>
			)}
			{/* kilocode_change: no cloud view */}
			{/* {tab === "cloud" && (
				<CloudView
					userInfo={cloudUserInfo}
					isAuthenticated={cloudIsAuthenticated}
					cloudApiUrl={cloudApiUrl}
					onDone={() => switchTab("lobby")}
				/>
			)} */}
			{/* kilocode_change: we have our own profile view */}
			{/* {tab === "account" && (
				<AccountView userInfo={cloudUserInfo} isAuthenticated={false} onDone={() => switchTab("lobby")} />
			)} */}
			<ChatView
				ref={chatViewRef}
				isHidden={tab !== "lobby"}
				showAnnouncement={showAnnouncement}
				hideAnnouncement={() => setShowAnnouncement(false)}
			/>
			<HubView isHidden={tab !== "hub"} targetSection={currentSection} />
			<ChatsHubView
				isHidden={tab !== "chatsHub"}
				showAnnouncement={showAnnouncement}
				hideAnnouncement={() => setShowAnnouncement(false)}
			/>
			{route.page === "brainstorm" && tab === "brainstorm" && (
				<BrainstormHubPage
					surfaces={surfaces}
					searchTerm={brainstormSearch}
					onSearchChange={setBrainstormSearch}
					onCreateSurface={() => {
						void handleCreateSurface()
					}}
					onOpenSurface={(surfaceId) => {
						void setActiveSurface(surfaceId)
						navigate({ page: "surface", surfaceId })
					}}
				/>
			)}
			{route.page === "surface" && tab === "brainstorm" && (
				<SurfaceDetailPage surfaceId={route.surfaceId} onBack={() => navigate({ page: "brainstorm" })} />
			)}
			<MemoizedHumanRelayDialog
				isOpen={humanRelayDialogState.isOpen}
				requestId={humanRelayDialogState.requestId}
				promptText={humanRelayDialogState.promptText}
				onClose={() => setHumanRelayDialogState((prev) => ({ ...prev, isOpen: false }))}
				onSubmit={(requestId, text) => vscode.postMessage({ type: "humanRelayResponse", requestId, text })}
				onCancel={(requestId) => vscode.postMessage({ type: "humanRelayCancel", requestId })}
			/>
			{deleteMessageDialogState.hasCheckpoint ? (
				<MemoizedCheckpointRestoreDialog
					open={deleteMessageDialogState.isOpen}
					type="delete"
					hasCheckpoint={deleteMessageDialogState.hasCheckpoint}
					onOpenChange={(open: boolean) => setDeleteMessageDialogState((prev) => ({ ...prev, isOpen: open }))}
					onConfirm={(restoreCheckpoint: boolean) => {
						vscode.postMessage({
							type: "deleteMessageConfirm",
							messageTs: deleteMessageDialogState.messageTs,
							restoreCheckpoint,
						})
						setDeleteMessageDialogState((prev) => ({ ...prev, isOpen: false }))
					}}
				/>
			) : (
				<MemoizedDeleteMessageDialog
					open={deleteMessageDialogState.isOpen}
					onOpenChange={(open: boolean) => setDeleteMessageDialogState((prev) => ({ ...prev, isOpen: open }))}
					onConfirm={() => {
						vscode.postMessage({
							type: "deleteMessageConfirm",
							messageTs: deleteMessageDialogState.messageTs,
						})
						setDeleteMessageDialogState((prev) => ({ ...prev, isOpen: false }))
					}}
				/>
			)}
			{editMessageDialogState.hasCheckpoint ? (
				<MemoizedCheckpointRestoreDialog
					open={editMessageDialogState.isOpen}
					type="edit"
					hasCheckpoint={editMessageDialogState.hasCheckpoint}
					onOpenChange={(open: boolean) => setEditMessageDialogState((prev) => ({ ...prev, isOpen: open }))}
					onConfirm={(restoreCheckpoint: boolean) => {
						vscode.postMessage({
							type: "editMessageConfirm",
							messageTs: editMessageDialogState.messageTs,
							text: editMessageDialogState.text,
							restoreCheckpoint,
						})
						setEditMessageDialogState((prev) => ({ ...prev, isOpen: false }))
					}}
				/>
			) : (
				<MemoizedEditMessageDialog
					open={editMessageDialogState.isOpen}
					onOpenChange={(open: boolean) => setEditMessageDialogState((prev) => ({ ...prev, isOpen: open }))}
					onConfirm={() => {
						vscode.postMessage({
							type: "editMessageConfirm",
							messageTs: editMessageDialogState.messageTs,
							text: editMessageDialogState.text,
							images: editMessageDialogState.images,
						})
						setEditMessageDialogState((prev) => ({ ...prev, isOpen: false }))
					}}
				/>
			)}
			{/* kilocode_change */}
			{/* Lobby, modes and history view contain their own bottom controls */}
			{!["lobby", "chatsHub", "modes", "history", "outerGate"].includes(tab) && (
				<div className="fixed inset-0 top-auto">
					<BottomControls />
				</div>
			)}
		</>
	)
}

const queryClient = new QueryClient()

const AppWithProviders = () => (
	<ErrorBoundary>
		<ExtensionStateContextProvider>
			<TranslationProvider>
				<QueryClientProvider client={queryClient}>
					<TooltipProvider delayDuration={STANDARD_TOOLTIP_DELAY}>
						<App />
					</TooltipProvider>
				</QueryClientProvider>
			</TranslationProvider>
		</ExtensionStateContextProvider>
	</ErrorBoundary>
)

export default AppWithProviders
