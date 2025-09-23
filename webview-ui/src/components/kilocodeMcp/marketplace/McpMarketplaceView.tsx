import { useEffect, useMemo, useState } from "react"
import {
	VSCodeButton,
	VSCodeProgressRing,
	VSCodeRadioGroup,
	VSCodeRadio,
	VSCodeDropdown,
	VSCodeOption,
	VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react"
import { McpMarketplaceItem, ToolIntegrationType, ToolLibrarySource } from "../../../../../src/shared/kilocode/mcp"
import { useExtensionState } from "../../../context/ExtensionStateContext"
import { vscode } from "../../../utils/vscode"
import McpMarketplaceCard from "./McpMarketplaceCard"
import McpSubmitCard from "./McpSubmitCard"
type McpMarketplaceViewProps = {
	allowedIntegrationTypes?: ToolIntegrationType[]
	allowedSources?: ToolLibrarySource[]
	defaultIntegrationFilter?: "all" | ToolIntegrationType
}

const integrationFilterLabels: Record<"all" | ToolIntegrationType, string> = {
	all: "All Integration Types",
	mcp: "MCP Server",
	"computer-use": "Computer Use",
	"potential-mcp": "Potential MCP",
}

const McpMarketplaceView = ({
	allowedIntegrationTypes,
	allowedSources,
	defaultIntegrationFilter = "all",
}: McpMarketplaceViewProps) => {
	const { mcpServers } = useExtensionState()
	const [items, setItems] = useState<McpMarketplaceItem[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [isRefreshing, setIsRefreshing] = useState(false)
	const [searchQuery, setSearchQuery] = useState("")
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
	const [sortBy, setSortBy] = useState<"newest" | "stars" | "name">("newest")
	const [integrationFilter, setIntegrationFilter] = useState<"all" | ToolIntegrationType>(defaultIntegrationFilter)

	const constrainedItems = useMemo(() => {
		return items.filter((item) => {
			const integration = (item.integrationType ?? "mcp") as ToolIntegrationType
			const source = (item.source ?? "remote") as ToolLibrarySource

			if (allowedIntegrationTypes?.length && !allowedIntegrationTypes.includes(integration)) {
				return false
			}

			if (allowedSources?.length && !allowedSources.includes(source)) {
				return false
			}

			return true
		})
	}, [items, allowedIntegrationTypes, allowedSources])

	const categories = useMemo(() => {
		const uniqueCategories = new Set(constrainedItems.map((item) => item.category))
		return Array.from(uniqueCategories).sort()
	}, [constrainedItems])

	const integrationOptions = useMemo(() => {
		const uniqueTypes = new Set<ToolIntegrationType>()
		constrainedItems.forEach((item) => {
			uniqueTypes.add((item.integrationType ?? "mcp") as ToolIntegrationType)
		})
		const sorted = Array.from(uniqueTypes).sort()
		return ["all", ...sorted] as ("all" | ToolIntegrationType)[]
	}, [constrainedItems])

	useEffect(() => {
		if (integrationFilter !== "all" && !integrationOptions.includes(integrationFilter)) {
			setIntegrationFilter("all")
		}
	}, [integrationFilter, integrationOptions])

	const filteredItems = useMemo(() => {
		return constrainedItems
			.filter((item) => {
				const matchesSearch =
					searchQuery === "" ||
					item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
					item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
					item.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
				const matchesCategory = !selectedCategory || item.category === selectedCategory
				const matchesIntegration =
					integrationFilter === "all" || (item.integrationType ?? "mcp") === integrationFilter
				return matchesSearch && matchesCategory && matchesIntegration
			})
			.sort((a, b) => {
				switch (sortBy) {
					// case "downloadCount":
					// 	return b.downloadCount - a.downloadCount
					case "stars":
						return b.githubStars - a.githubStars
					case "name":
						return a.name.localeCompare(b.name)
					case "newest":
						return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
					default:
						return 0
				}
			})
	}, [constrainedItems, searchQuery, selectedCategory, integrationFilter, sortBy])

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "mcpMarketplaceCatalog") {
				if (message.error) {
					setError(message.error)
				} else {
					setItems(message.mcpMarketplaceCatalog?.items || [])
					setError(null)
				}
				setIsLoading(false)
				setIsRefreshing(false)
			} else if (message.type === "mcpDownloadDetails") {
				if (message.error) {
					setError(message.error)
				}
			}
		}

		window.addEventListener("message", handleMessage)

		// Fetch marketplace catalog
		fetchMarketplace()

		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [])

	const fetchMarketplace = (forceRefresh: boolean = false) => {
		if (forceRefresh) {
			setIsRefreshing(true)
		} else {
			setIsLoading(true)
		}
		setError(null)
		vscode.postMessage({ type: "fetchMcpMarketplace", bool: forceRefresh })
	}

	if (isLoading || isRefreshing) {
		return (
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					alignItems: "center",
					height: "100%",
					padding: "20px",
				}}>
				<VSCodeProgressRing />
			</div>
		)
	}

	if (error) {
		return (
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					justifyContent: "center",
					alignItems: "center",
					height: "100%",
					padding: "20px",
					gap: "12px",
				}}>
				<div style={{ color: "var(--vscode-errorForeground)" }}>{error}</div>
				<VSCodeButton appearance="secondary" onClick={() => fetchMarketplace(true)}>
					<span className="codicon codicon-refresh" style={{ marginRight: "6px" }} />
					Retry
				</VSCodeButton>
			</div>
		)
	}

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				width: "100%",
			}}>
			<div style={{ padding: "20px 20px 5px", display: "flex", flexDirection: "column", gap: "16px" }}>
				{/* Search row */}
				<VSCodeTextField
					style={{ width: "100%" }}
					placeholder="Search tools..."
					value={searchQuery}
					onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}>
					<div
						slot="start"
						className="codicon codicon-search"
						style={{
							fontSize: 13,
							opacity: 0.8,
						}}
					/>
					{searchQuery && (
						<div
							className="codicon codicon-close"
							aria-label="Clear search"
							onClick={() => setSearchQuery("")}
							slot="end"
							style={{
								display: "flex",
								justifyContent: "center",
								alignItems: "center",
								height: "100%",
								cursor: "pointer",
							}}
						/>
					)}
				</VSCodeTextField>

				{/* Filter row */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "8px",
					}}>
					<span
						style={{
							fontSize: "11px",
							color: "var(--vscode-descriptionForeground)",
							textTransform: "uppercase",
							fontWeight: 500,
							flexShrink: 0,
						}}>
						Filter:
					</span>
					<div
						style={{
							position: "relative",
							zIndex: 2,
							flex: 1,
						}}>
						<VSCodeDropdown
							style={{
								width: "100%",
							}}
							value={selectedCategory || ""}
							onChange={(e) => setSelectedCategory((e.target as HTMLSelectElement).value || null)}>
							<VSCodeOption value="">All Categories</VSCodeOption>
							{categories.map((category) => (
								<VSCodeOption key={category} value={category}>
									{category}
								</VSCodeOption>
							))}
						</VSCodeDropdown>
					</div>
					<div
						style={{
							position: "relative",
							zIndex: 1,
							flex: 1,
						}}>
						<VSCodeDropdown
							style={{ width: "100%" }}
							value={integrationFilter}
							onChange={(e) =>
								setIntegrationFilter((e.target as HTMLSelectElement).value as typeof integrationFilter)
							}>
							{integrationOptions.map((option) => (
								<VSCodeOption key={option} value={option}>
									{integrationFilterLabels[option]}
								</VSCodeOption>
							))}
						</VSCodeDropdown>
					</div>
				</div>

				{/* Sort row */}
				<div
					style={{
						display: "flex",
						gap: "8px",
					}}>
					<span
						style={{
							fontSize: "11px",
							color: "var(--vscode-descriptionForeground)",
							textTransform: "uppercase",
							fontWeight: 500,
							marginTop: "3px",
						}}>
						Sort:
					</span>
					<VSCodeRadioGroup
						style={{
							display: "flex",
							flexWrap: "wrap",
							marginTop: "-2.5px",
						}}
						value={sortBy}
						onChange={(e) => setSortBy((e.target as HTMLInputElement).value as typeof sortBy)}>
						{/* <VSCodeRadio value="downloadCount">Most Installs</VSCodeRadio> */}
						<VSCodeRadio value="newest">Newest</VSCodeRadio>
						<VSCodeRadio value="stars">GitHub Stars</VSCodeRadio>
						<VSCodeRadio value="name">Name</VSCodeRadio>
					</VSCodeRadioGroup>
				</div>
			</div>

			<style>
				{`
				.mcp-search-input,
				.mcp-select {
				box-sizing: border-box;
				}
				.mcp-search-input {
				min-width: 140px;
				}
				.mcp-search-input:focus,
				.mcp-select:focus {
				border-color: var(--vscode-focusBorder) !important;
				}
				.mcp-search-input:hover,
				.mcp-select:hover {
				opacity: 0.9;
				}
			`}
			</style>
			<div style={{ display: "flex", flexDirection: "column" }}>
				{filteredItems.length === 0 ? (
					<div
						style={{
							display: "flex",
							justifyContent: "center",
							alignItems: "center",
							height: "100%",
							padding: "20px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						{searchQuery || selectedCategory || integrationFilter !== "all"
							? "No matching tools found"
							: "No tools found in the library"}
					</div>
				) : (
					filteredItems.map((item) => (
						<McpMarketplaceCard key={item.mcpId} item={item} installedServers={mcpServers} />
					))
				)}
				<McpSubmitCard />
			</div>
		</div>
	)
}

export default McpMarketplaceView
