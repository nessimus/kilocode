import { useState, useEffect, useMemo, useContext, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Tab, TabContent, TabHeader } from "../common/Tab"
import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { MarketplaceViewStateManager } from "./MarketplaceViewStateManager"
import { useStateManager } from "./useStateManager"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { vscode } from "@/utils/vscode"
import { MarketplaceListView } from "./MarketplaceListView"
import { cn } from "@/lib/utils"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ExtensionStateContext } from "@/context/ExtensionStateContext"
import McpMarketplaceView from "../kilocodeMcp/marketplace/McpMarketplaceView"

interface MarketplaceViewProps {
	onDone?: () => void
	stateManager: MarketplaceViewStateManager
	targetTab?: "mcp" | "mode" | "tool"
	hideHeader?: boolean // kilocode_change
}
export function MarketplaceView({ stateManager, onDone, targetTab, hideHeader = false }: MarketplaceViewProps) {
	const { t } = useAppTranslation()
	const [state, manager] = useStateManager(stateManager)
	const [hasReceivedInitialState, setHasReceivedInitialState] = useState(false)
	const extensionState = useContext(ExtensionStateContext)
	const [lastOrganizationSettingsVersion, setLastOrganizationSettingsVersion] = useState<number>(
		extensionState?.organizationSettingsVersion ?? -1,
	)
	const [uiTab, setUiTab] = useState<"mcp" | "tool" | "mode">(
		targetTab === "tool" ? "tool" : targetTab === "mode" ? "mode" : "mcp",
	)
	const [toolIdea, setToolIdea] = useState("")

	const handleTabChange = useCallback((nextTab: "mcp" | "tool" | "mode") => {
		setUiTab(nextTab)
	}, [])

	const handleCreateTool = useCallback(() => {
		const trimmed = toolIdea.trim()
		if (!trimmed) return
		const prompt = `Create a new MCP tool that ${trimmed}. Include tool schema, required environment variables, setup instructions, and any dependencies.`
		window.postMessage({ type: "action", action: "chatButtonClicked" }, "*")
		window.postMessage({ type: "insertTextToChatArea", text: prompt }, "*")
		setToolIdea("")
	}, [toolIdea])

	useEffect(() => {
		const currentVersion = extensionState?.organizationSettingsVersion ?? -1
		if (currentVersion !== lastOrganizationSettingsVersion) {
			vscode.postMessage({
				type: "fetchMarketplaceData",
			})
		}
		setLastOrganizationSettingsVersion(currentVersion)
	}, [extensionState?.organizationSettingsVersion, lastOrganizationSettingsVersion])

	// Track when we receive the initial state
	useEffect(() => {
		// Check if we already have items (state might have been received before mount)
		if (state.allItems.length > 0 && !hasReceivedInitialState) {
			setHasReceivedInitialState(true)
		}
	}, [state.allItems, hasReceivedInitialState])

	useEffect(() => {
		if (!targetTab) {
			return
		}

		if (targetTab === "tool") {
			setUiTab("tool")
		} else {
			setUiTab(targetTab)
		}
	}, [targetTab])

	useEffect(() => {
		if (uiTab === "mcp" || uiTab === "mode") {
			manager.transition({ type: "SET_ACTIVE_TAB", payload: { tab: uiTab } })
		}
	}, [uiTab, manager])

	// Ensure marketplace state manager processes messages when component mounts
	useEffect(() => {
		// When the marketplace view first mounts, we need to trigger a state update
		// to ensure we get the current marketplace items. We do this by sending
		// a filter message with empty filters, which will cause the extension to
		// send back the full state including all marketplace items.
		if (!hasReceivedInitialState && state.allItems.length === 0) {
			// Fetch marketplace data on demand
			// Note: isFetching is already true by default for initial load
			vscode.postMessage({
				type: "fetchMarketplaceData",
			})
		}

		// Listen for state changes to know when initial data arrives
		const unsubscribe = manager.onStateChange((newState) => {
			// Mark as received initial state when we get any state update
			// This prevents infinite loops and ensures proper state handling
			if (!hasReceivedInitialState && (newState.allItems.length > 0 || newState.displayItems !== undefined)) {
				setHasReceivedInitialState(true)
			}
		})

		const handleVisibilityMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "webviewVisible" && message.visible === true) {
				// Data will be automatically fresh when panel becomes visible
				// No manual fetching needed since we removed caching
			}
		}

		window.addEventListener("message", handleVisibilityMessage)
		return () => {
			window.removeEventListener("message", handleVisibilityMessage)
			unsubscribe()
		}
	}, [manager, hasReceivedInitialState, state.allItems.length])

	// Memoize all available tags
	const allTags = useMemo(
		() => Array.from(new Set(state.allItems.flatMap((item) => item.tags || []))).sort(),
		[state.allItems],
	)

	// Memoize filtered tags
	const filteredTags = useMemo(() => allTags, [allTags])

	const tabOrder: Array<"mcp" | "tool" | "mode"> = ["mcp", "tool", "mode"]
	const sliderIndex = tabOrder.indexOf(uiTab)
	const sliderWidth = 100 / tabOrder.length

	return (
		<TooltipProvider delayDuration={300}>
			{/* kilocode_change: add className relative */}
			<Tab className="relative">
				{/*  kilocode_change: display header conditionally */}
				<TabHeader
					style={{ display: hideHeader ? "none" : "flex" }}
					className="flex flex-col sticky top-0 z-10 px-3 py-2 bg-vscode-sideBar-background">
					<div className="flex justify-between items-center px-2">
						<h3 className="font-bold m-0">{t("marketplace:title")}</h3>
						<div className="flex gap-2 items-center">
							<Button
								variant="default"
								onClick={() => {
									onDone?.()
								}}>
								{t("marketplace:done")}
							</Button>
						</div>
					</div>

					<div className="w-full mt-2">
						<div className="flex relative py-1">
							<div className="absolute w-full h-[2px] -bottom-[2px] bg-vscode-input-border">
								<div
									className="absolute h-[2px] bottom-0 bg-vscode-button-background transition-all duration-300 ease-in-out"
									style={{ width: `${sliderWidth}%`, left: `${sliderWidth * sliderIndex}%` }}
								/>
							</div>
							<button
								className={cn(
									"flex items-center justify-center gap-2 flex-1 text-sm font-medium rounded-sm transition-colors duration-300 relative z-10",
									uiTab === "mcp" ? "text-vscode-foreground" : "text-vscode-descriptionForeground",
								)}
								onClick={() => handleTabChange("mcp")}>
								MCP
							</button>
							<button
								className={cn(
									"flex items-center justify-center gap-2 flex-1 text-sm font-medium rounded-sm transition-colors duration-300 relative z-10",
									uiTab === "tool" ? "text-vscode-foreground" : "text-vscode-descriptionForeground",
								)}
								onClick={() => handleTabChange("tool")}>
								Tools
							</button>
							<button
								className={cn(
									"flex items-center justify-center gap-2 flex-1 text-sm font-medium rounded-sm transition-colors duration-300 relative z-10",
									uiTab === "mode" ? "text-vscode-foreground" : "text-vscode-descriptionForeground",
								)}
								onClick={() => handleTabChange("mode")}>
								Modes
							</button>
						</div>
					</div>
				</TabHeader>

				<TabContent className="p-3 pt-2">
					{uiTab === "mcp" && (
						<MarketplaceListView
							stateManager={stateManager}
							allTags={allTags}
							filteredTags={filteredTags}
							filterByType="mcp"
						/>
					)}
					{uiTab === "mode" && (
						<MarketplaceListView
							stateManager={stateManager}
							allTags={allTags}
							filteredTags={filteredTags}
							filterByType="mode"
						/>
					)}
					{uiTab === "tool" && (
						<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
							<div
								style={{
									padding: 16,
									borderRadius: 8,
									backgroundColor: "var(--vscode-editorWidget-background)",
									border: "1px solid var(--vscode-input-border)",
									display: "flex",
									flexDirection: "column",
									gap: 12,
								}}>
								<div style={{ fontWeight: 600, fontSize: 14, color: "var(--vscode-foreground)" }}>
									Describe the tool you need and let Roo build it
								</div>
								<p style={{ margin: 0, fontSize: 12, color: "var(--vscode-descriptionForeground)" }}>
									Type a natural-language request and we’ll draft the MCP server, methods, and setup
									instructions for your AI employees.
								</p>
								<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
									<VSCodeTextField
										style={{ flex: 1, minWidth: 220 }}
										placeholder="e.g., monitor Product Hunt launches and email summaries"
										value={toolIdea}
										onInput={(event) => setToolIdea((event.target as HTMLInputElement).value)}
									/>
									<VSCodeButton onClick={handleCreateTool} disabled={!toolIdea.trim()}>
										Ask Roo to create it
									</VSCodeButton>
								</div>
							</div>

							<div className="min-h-[400px]">
								<McpMarketplaceView allowedSources={["curated"]} />
							</div>
						</div>
					)}
				</TabContent>
			</Tab>
		</TooltipProvider>
	)
}
