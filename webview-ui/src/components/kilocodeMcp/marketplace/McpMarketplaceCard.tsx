import { useCallback, useEffect, useMemo, useState } from "react"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@src/components/ui"
import { McpServer } from "../../../../../src/shared/mcp"
import { McpMarketplaceItem } from "../../../../../src/shared/kilocode/mcp"
import { vscode } from "../../../utils/vscode"

interface McpMarketplaceCardProps {
	item: McpMarketplaceItem
	installedServers: McpServer[]
}

const integrationLabelMap: Record<NonNullable<McpMarketplaceItem["integrationType"]>, string> = {
	mcp: "MCP Server",
	"computer-use": "Computer Use",
	"potential-mcp": "Potential MCP",
}

const chipStyle: React.CSSProperties = {
	fontSize: 11,
	padding: "2px 8px",
	borderRadius: 999,
	backgroundColor: "color-mix(in srgb, var(--vscode-badge-background) 85%, transparent)",
	color: "var(--vscode-badge-foreground)",
	textTransform: "uppercase",
	letterSpacing: 0.4,
	fontWeight: 600,
}

const sectionTitleStyle: React.CSSProperties = {
	fontSize: 13,
	fontWeight: 600,
	marginBottom: 6,
	color: "var(--vscode-foreground)",
}

const listStyle: React.CSSProperties = {
	margin: "0 0 12px 0",
	paddingLeft: 18,
	color: "var(--vscode-foreground)",
	fontSize: 12,
	lineHeight: 1.5,
}

const McpMarketplaceCard = ({ item, installedServers }: McpMarketplaceCardProps) => {
	const isInstalled = installedServers.some((server) => server.name === item.mcpId)
	const [isDownloading, setIsDownloading] = useState(false)
	const [isDialogOpen, setIsDialogOpen] = useState(false)
	const [showImage, setShowImage] = useState(Boolean(item.logoUrl))
	const isCurated = item.source === "curated"
	const fallbackDocsUrl = item.docs?.setup || item.docs?.homepage || item.githubUrl

	useEffect(() => {
		const handler = (event: MessageEvent) => {
			const message = event.data
			if (message?.type === "mcpDownloadDetails" && message.mcpId === item.mcpId) {
				setIsDownloading(false)
			}
		}

		window.addEventListener("message", handler)
		return () => window.removeEventListener("message", handler)
	}, [item.mcpId])

	const integrationLabel = integrationLabelMap[(item.integrationType ?? "mcp") as keyof typeof integrationLabelMap]
	const authorUrl = useMemo(() => {
		try {
			const url = new URL(item.githubUrl)
			const pathParts = url.pathname.split("/").filter(Boolean)
			if (pathParts.length >= 1) {
				return `${url.origin}/${pathParts[0]}`
			}
		} catch (error) {
			// ignore invalid URLs
		}
		return item.githubUrl
	}, [item.githubUrl])

	const initialLetter = item.name?.charAt(0)?.toUpperCase() ?? "?"

	const renderLogo = (size: number) => {
		if (showImage && item.logoUrl) {
			return (
				<img
					src={item.logoUrl}
					alt={`${item.name} logo`}
					onError={() => setShowImage(false)}
					style={{
						width: size,
						height: size,
						borderRadius: 8,
						objectFit: "cover",
					}}
				/>
			)
		}

		return (
			<div
				aria-hidden
				style={{
					width: size,
					height: size,
					borderRadius: 8,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					background:
						"linear-gradient(135deg, var(--vscode-editorWidget-background), var(--vscode-input-background))",
					color: "var(--vscode-foreground)",
					fontWeight: 600,
					fontSize: size / 2.5,
				}}>
				{initialLetter}
			</div>
		)
	}

	const handleCardClick = () => {
		setIsDialogOpen(true)
	}

	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault()
			setIsDialogOpen(true)
		}
	}

	const handleInstall = useCallback(() => {
		if (isCurated || isInstalled || isDownloading) {
			return
		}
		setIsDownloading(true)
		vscode.postMessage({
			type: "downloadMcp",
			mcpId: item.mcpId,
		})
	}, [isCurated, isDownloading, isInstalled, item.mcpId])

	const handleOpenDocs = useCallback((url?: string) => {
		if (!url) return
		window.open(url, "_blank", "noopener")
	}, [])

	const cardDescription = useMemo(() => {
		if (!item.description) return ""
		return item.description.length > 140 ? `${item.description.slice(0, 137)}…` : item.description
	}, [item.description])

	const activeTags = (item.tags || []).slice(0, 3)

	return (
		<>
			<div
				role="button"
				tabIndex={0}
				onClick={handleCardClick}
				onKeyDown={handleKeyDown}
				style={{
					backgroundColor: "var(--vscode-editorWidget-background)",
					border: "1px solid var(--vscode-input-border)",
					borderRadius: 8,
					padding: 16,
					display: "flex",
					flexDirection: "column",
					gap: 12,
					transition: "background-color 0.15s ease, border-color 0.15s ease",
				}}>
				<div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
					{renderLogo(40)}
					<div style={{ flex: 1, minWidth: 0 }}>
						<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
							<span style={{ fontWeight: 600, fontSize: 14, color: "var(--vscode-foreground)" }}>
								{item.name}
							</span>
							<span style={chipStyle}>{integrationLabel}</span>
							{item.category ? (
								<span style={{ ...chipStyle, textTransform: "none" }}>{item.category}</span>
							) : null}
						</div>
						{item.author && (
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 6,
									marginTop: 4,
									fontSize: 12,
									color: "var(--vscode-descriptionForeground)",
								}}>
								<span className="codicon codicon-github" />
								<a
									href={authorUrl}
									onClick={(event) => {
										event.stopPropagation()
										window.open(authorUrl, "_blank", "noopener")
									}}
									style={{ color: "var(--vscode-foreground)", textDecoration: "none" }}>
									{item.author}
								</a>
							</div>
						)}
					</div>
				</div>

				{cardDescription && (
					<p style={{ margin: 0, fontSize: 12, color: "var(--vscode-descriptionForeground)" }}>
						{cardDescription}
					</p>
				)}

				{activeTags.length > 0 && (
					<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
						{activeTags.map((tag) => (
							<span
								key={tag}
								style={{
									fontSize: 11,
									padding: "2px 6px",
									borderRadius: 6,
									backgroundColor: "var(--vscode-input-background)",
									color: "var(--vscode-descriptionForeground)",
								}}>
								{tag}
							</span>
						))}
					</div>
				)}

				<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
					<VSCodeButton
						appearance="secondary"
						onClick={(event) => {
							event.stopPropagation()
							setIsDialogOpen(true)
						}}>
						View Details
					</VSCodeButton>
					{isCurated ? (
						<VSCodeButton
							onClick={(event) => {
								event.stopPropagation()
								handleOpenDocs(fallbackDocsUrl)
							}}>
							Open Docs
						</VSCodeButton>
					) : (
						<VSCodeButton
							disabled={isInstalled || isDownloading}
							onClick={(event) => {
								event.stopPropagation()
								handleInstall()
							}}>
							{isInstalled ? "Installed" : isDownloading ? "Installing…" : "Install"}
						</VSCodeButton>
					)}
				</div>
			</div>

			<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
							{renderLogo(56)}
							<div style={{ flex: 1 }}>
								<DialogTitle>{item.name}</DialogTitle>
								<DialogDescription>
									{integrationLabel}
									{item.category ? ` • ${item.category}` : ""}
								</DialogDescription>
							</div>
						</div>
					</DialogHeader>

					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 16,
							maxHeight: "60vh",
							overflowY: "auto",
						}}>
						{item.description && <p style={{ margin: 0 }}>{item.description}</p>}

						{item.docs && (
							<div>
								<div style={sectionTitleStyle}>Documentation</div>
								<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
									{item.docs.homepage && (
										<VSCodeButton
											appearance="secondary"
											onClick={(event) => {
												event.stopPropagation()
												handleOpenDocs(item.docs!.homepage!)
											}}>
											<span className="codicon codicon-home" style={{ marginRight: 4 }} />{" "}
											Homepage
										</VSCodeButton>
									)}
									{item.docs.setup && (
										<VSCodeButton
											appearance="secondary"
											onClick={(event) => {
												event.stopPropagation()
												handleOpenDocs(item.docs!.setup!)
											}}>
											<span className="codicon codicon-wrench" style={{ marginRight: 4 }} /> Setup
											Guide
										</VSCodeButton>
									)}
									{item.docs.apiReference && (
										<VSCodeButton
											appearance="secondary"
											onClick={(event) => {
												event.stopPropagation()
												handleOpenDocs(item.docs!.apiReference!)
											}}>
											<span className="codicon codicon-code" style={{ marginRight: 4 }} /> API
											Reference
										</VSCodeButton>
									)}
									{item.docs.marketplace && (
										<VSCodeButton
											appearance="secondary"
											onClick={(event) => {
												event.stopPropagation()
												handleOpenDocs(item.docs!.marketplace!)
											}}>
											<span className="codicon codicon-extensions" style={{ marginRight: 4 }} />{" "}
											Marketplace Listing
										</VSCodeButton>
									)}
								</div>
							</div>
						)}

						{item.credentials?.length ? (
							<div>
								<div style={sectionTitleStyle}>Secrets</div>
								<ul style={listStyle}>
									{item.credentials.map((cred) => (
										<li key={cred.key}>
											<code>{cred.placeholder || cred.key}</code>
											{cred.description ? ` — ${cred.description}` : ""}
										</li>
									))}
								</ul>
							</div>
						) : null}

						{item.methods?.length ? (
							<div>
								<div style={sectionTitleStyle}>Methods</div>
								<ul style={listStyle}>
									{item.methods.map((method) => (
										<li key={method.name}>
											<strong>{method.name}</strong>
											{method.description ? ` — ${method.description}` : ""}
										</li>
									))}
								</ul>
							</div>
						) : null}

						{item.supportedBrands?.length ? (
							<div>
								<div style={sectionTitleStyle}>Optimized For</div>
								<ul style={listStyle}>
									{item.supportedBrands.map((brand) => (
										<li key={brand.name}>
											<strong>{brand.name}</strong>
											{brand.notes ? ` — ${brand.notes}` : ""}
										</li>
									))}
								</ul>
							</div>
						) : null}

						{item.notes?.length ? (
							<div>
								<div style={sectionTitleStyle}>Notes</div>
								<ul style={listStyle}>
									{item.notes.map((note, idx) => (
										<li key={idx}>{note}</li>
									))}
								</ul>
							</div>
						) : null}

						<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
							{item.tags?.map((tag) => (
								<span
									key={tag}
									style={{
										fontSize: 11,
										padding: "2px 6px",
										borderRadius: 6,
										backgroundColor: "var(--vscode-input-background)",
										color: "var(--vscode-descriptionForeground)",
									}}>
									#{tag}
								</span>
							))}
						</div>
					</div>

					<DialogFooter>
						{isCurated ? (
							<VSCodeButton
								onClick={(event) => {
									event.stopPropagation()
									handleOpenDocs(fallbackDocsUrl)
								}}>
								Open Docs
							</VSCodeButton>
						) : (
							<VSCodeButton
								disabled={isInstalled || isDownloading}
								onClick={(event) => {
									event.stopPropagation()
									handleInstall()
								}}>
								{isInstalled ? "Installed" : isDownloading ? "Installing…" : "Install"}
							</VSCodeButton>
						)}
						<VSCodeButton appearance="secondary" onClick={() => setIsDialogOpen(false)}>
							Close
						</VSCodeButton>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}

export default McpMarketplaceCard
