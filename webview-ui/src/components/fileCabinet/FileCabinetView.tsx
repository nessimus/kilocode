import React, { useCallback, useEffect, useMemo, useState } from "react"
import { formatDistanceToNow } from "date-fns"

import { useExtensionState } from "@/context/ExtensionStateContext"
import { useAppTranslation } from "@/i18n/TranslationContext"
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Textarea,
} from "@/components/ui"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { vscode } from "@/utils/vscode"
import type { ExtensionMessage } from "@roo/ExtensionMessage"
import type { FileCabinetFileKind, FileCabinetPreview, FileCabinetSnapshot } from "@roo/fileCabinet"

interface FileCabinetViewProps {
	isHidden?: boolean
}

type FilterKey = "all" | "documents" | "images" | "media" | "markdown" | "spreadsheets" | "favorites"
type SortKey = "recent" | "name" | "size" | "type"
type ViewMode = "grid" | "list"
type CollectionKey = "collection:all" | "collection:recent" | "collection:favorites" | `folder:${string}`

interface CabinetFile {
	id: string
	path: string
	name: string
	kind: FileCabinetFileKind
	extension: string
	sizeBytes: number
	createdAt: string
	modifiedAt: string
	folderTrail: string[]
	topLevel?: string
	starred: boolean
}

const filters: { id: FilterKey; label: string }[] = [
	{ id: "all", label: "All" },
	{ id: "documents", label: "Docs" },
	{ id: "images", label: "Images" },
	{ id: "media", label: "Media" },
	{ id: "spreadsheets", label: "Sheets" },
	{ id: "markdown", label: "Notes" },
	{ id: "favorites", label: "Starred" },
]

const sortOptions: { id: SortKey; label: string }[] = [
	{ id: "recent", label: "Last updated" },
	{ id: "name", label: "Alphabetical" },
	{ id: "size", label: "File size" },
	{ id: "type", label: "Type" },
]

const formatBytes = (bytes: number) => {
	if (!bytes) return "0 B"
	const units = ["B", "KB", "MB", "GB"]
	const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
	const value = bytes / 1024 ** exponent
	return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

const kindIcon = (kind: FileCabinetFileKind, className?: string) => {
	const base = cn("codicon text-base", className)
	switch (kind) {
		case "image":
			return <span className={cn(base, "codicon-device-camera text-[#F2C94C]")} />
		case "video":
			return <span className={cn(base, "codicon-video text-[#56CCF2]")} />
		case "audio":
			return <span className={cn(base, "codicon-broadcast text-[#BB6BD9]")} />
		case "spreadsheet":
			return <span className={cn(base, "codicon-table text-[#2CB178]")} />
		case "presentation":
			return <span className={cn(base, "codicon-presentation text-[#C56AE0]")} />
		case "markdown":
		case "text":
		case "code":
			return <span className={cn(base, "codicon-symbol-text text-[#7D7FFF]")} />
		case "pdf":
			return <span className={cn(base, "codicon-file-pdf text-[#FF7A59]")} />
		case "doc":
			return <span className={cn(base, "codicon-file text-[#3B91F7]")} />
		case "archive":
			return <span className={cn(base, "codicon-package text-[#A374FF]")} />
		default:
			return <span className={cn(base, "codicon-file-text")} />
	}
}

const FileCabinetView: React.FC<FileCabinetViewProps> = ({ isHidden = false }) => {
	const { t } = useAppTranslation()
	const { workplaceState } = useExtensionState()

	const resolvedCompanyId = workplaceState?.activeCompanyId ?? workplaceState?.companies[0]?.id ?? ""
	const activeCompany = workplaceState?.companies.find((company) => company.id === resolvedCompanyId)

	const [snapshot, setSnapshot] = useState<FileCabinetSnapshot | null>(null)
	const [files, setFiles] = useState<CabinetFile[]>([])
	const [preview, setPreview] = useState<FileCabinetPreview | null>(null)
	const [searchTerm, setSearchTerm] = useState("")
	const [filter, setFilter] = useState<FilterKey>("all")
	const [sort, setSort] = useState<SortKey>("recent")
	const [viewMode, setViewMode] = useState<ViewMode>("grid")
	const [collection, setCollection] = useState<CollectionKey>("collection:all")
	const [selectedPath, setSelectedPath] = useState<string | null>(null)
	const [markdownDraft, setMarkdownDraft] = useState("")
	const [isLoading, setIsLoading] = useState(false)
	const [loadError, setLoadError] = useState<string | undefined>()
	const [isSaving, setIsSaving] = useState<"idle" | "saving" | "success" | "error">("idle")

	useEffect(() => {
		const handler = (event: MessageEvent) => {
			const message = event.data as ExtensionMessage

			if (message.type === "fileCabinetSnapshot") {
				setIsLoading(false)
				setLoadError(message.text)
				setSnapshot(message.fileCabinetSnapshot ?? null)
			}

			if (message.type === "fileCabinetPreview" && message.fileCabinetPreview) {
				setPreview(message.fileCabinetPreview)
				if (message.fileCabinetPreview.markdown) {
					setMarkdownDraft(message.fileCabinetPreview.markdown)
				} else if (message.fileCabinetPreview.text) {
					setMarkdownDraft(message.fileCabinetPreview.text)
				} else {
					setMarkdownDraft("")
				}
			}

			if (message.type === "fileCabinetWriteResult") {
				if (message.fileCabinetWriteSuccess) {
					setIsSaving("success")
					setTimeout(() => setIsSaving("idle"), 1500)
				} else {
					setIsSaving("error")
				}
			}
		}

		window.addEventListener("message", handler)
		return () => window.removeEventListener("message", handler)
	}, [])

	useEffect(() => {
		if (!resolvedCompanyId) {
			return
		}
		setIsLoading(true)
		setLoadError(undefined)
		vscode.postMessage({
			type: "fileCabinetLoad",
			fileCabinetCompanyId: resolvedCompanyId,
		})
	}, [resolvedCompanyId])

	useEffect(() => {
		if (!snapshot) {
			setFiles([])
			setSelectedPath(null)
			return
		}

		setFiles((prev) => {
			const starredLookup = new Set(prev.filter((item) => item.starred).map((item) => item.path))
			const transformed = snapshot.files.map<CabinetFile>((file) => ({
				id: file.id,
				path: file.path,
				name: file.name,
				kind: file.kind,
				extension: file.extension,
				sizeBytes: file.byteSize,
				createdAt: file.createdAt,
				modifiedAt: file.modifiedAt,
				folderTrail: file.segments.slice(0, Math.max(0, file.segments.length - 1)),
				topLevel: file.topLevelFolder,
				starred: starredLookup.has(file.path),
			}))

			if (!selectedPath && transformed.length > 0) {
				setSelectedPath(transformed[0].path)
			}

			return transformed
		})
	}, [snapshot, selectedPath])

	useEffect(() => {
		if (!selectedPath || !resolvedCompanyId) {
			return
		}
		setPreview((prevPreview) => (prevPreview?.path === selectedPath ? prevPreview : null))
		vscode.postMessage({
			type: "fileCabinetPreview",
			fileCabinetCompanyId: resolvedCompanyId,
			fileCabinetPath: selectedPath,
		})
	}, [selectedPath, resolvedCompanyId])

	const toggleStarred = useCallback((path: string) => {
		setFiles((prev) => prev.map((item) => (item.path === path ? { ...item, starred: !item.starred } : item)))
	}, [])

	const highlightEntries = useMemo(() => {
		return [...files]
			.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
			.slice(0, 5)
	}, [files])

	const navSections = useMemo(() => {
		const folderItems = (snapshot?.folders ?? [])
			.filter((folder) => folder.depth === 1)
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((folder) => ({
				label: folder.name,
				icon: "codicon-folder",
				value: `folder:${folder.path}` as CollectionKey,
			}))

		return [
			{
				label: "Shortcuts",
				items: [
					{ label: "All files", icon: "codicon-home", value: "collection:all" as CollectionKey },
					{ label: "Recents", icon: "codicon-history", value: "collection:recent" as CollectionKey },
					{ label: "Favorites", icon: "codicon-star-full", value: "collection:favorites" as CollectionKey },
				],
			},
			{
				label: "Folders",
				items: folderItems,
			},
		]
	}, [snapshot?.folders])

	const filteredByCollection = useMemo(() => {
		const [scope, identifier] = collection.split(":") as ["collection" | "folder", string]

		if (scope === "collection") {
			switch (identifier) {
				case "all":
					return files
				case "recent":
					return [...files].sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
				case "favorites":
					return files.filter((item) => item.starred)
				default:
					return files
			}
		}

		if (scope === "folder") {
			return files.filter((item) => item.folderTrail[0] === identifier)
		}

		return files
	}, [collection, files])

	const filteredItems = useMemo(() => {
		const query = searchTerm.trim().toLowerCase()
		let next = filteredByCollection

		if (filter !== "all") {
			switch (filter) {
				case "documents":
					next = next.filter((item) => ["doc", "pdf"].includes(item.kind))
					break
				case "images":
					next = next.filter((item) => item.kind === "image")
					break
				case "media":
					next = next.filter((item) => item.kind === "video" || item.kind === "audio")
					break
				case "spreadsheets":
					next = next.filter((item) => item.kind === "spreadsheet")
					break
				case "markdown":
					next = next.filter((item) => item.kind === "markdown" || item.kind === "text" || item.kind === "code")
					break
				case "favorites":
					next = next.filter((item) => item.starred)
					break
			}
		}

		if (query) {
			next = next.filter((item) => {
				const haystack = [item.name, item.path, item.folderTrail.join(" ")].join(" ").toLowerCase()
				return haystack.includes(query)
			})
		}

		return [...next].sort((a, b) => {
			switch (sort) {
				case "name":
					return a.name.localeCompare(b.name)
				case "size":
					return b.sizeBytes - a.sizeBytes
				case "type":
					return a.kind.localeCompare(b.kind)
				case "recent":
				default:
					return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
			}
		})
	}, [filteredByCollection, filter, searchTerm, sort])

	useEffect(() => {
		if (selectedPath && !filteredItems.some((item) => item.path === selectedPath)) {
			setSelectedPath(filteredItems[0]?.path ?? null)
		}
	}, [filteredItems, selectedPath])

	const selectedItem = useMemo(
		() => (selectedPath ? files.find((file) => file.path === selectedPath) ?? null : null),
		[files, selectedPath],
	)

	const handleOpenInEditor = useCallback(() => {
		if (!selectedItem) return
		vscode.postMessage({ type: "openFile", text: selectedItem.path })
	}, [selectedItem])

	const handleSaveDraft = useCallback(() => {
		if (!selectedItem || !resolvedCompanyId) return
		setIsSaving("saving")
		vscode.postMessage({
			type: "fileCabinetWriteFile",
			fileCabinetWritePayload: {
				companyId: resolvedCompanyId,
				path: selectedItem.path,
				contents: markdownDraft,
				encoding: "utf8",
			},
		})
	}, [markdownDraft, resolvedCompanyId, selectedItem])

	return (
		<div
			data-testid="file-cabinet-view"
			className={cn(
				"fixed inset-0 flex h-full w-full overflow-hidden bg-vscode-editor-background text-vscode-editor-foreground",
				isHidden && "hidden",
			)}
		>
			<aside className="hidden w-[236px] shrink-0 border-r border-vscode-panel-border bg-vscode-sideBar-background/80 backdrop-blur-md md:flex md:flex-col">
				<div className="border-b border-vscode-panel-border px-4 py-5">
					<h2 className="text-sm font-semibold uppercase tracking-wide text-vscode-titleBar-inactiveForeground">
						{t("common:fileCabinet.title", { defaultValue: "File Cabinet" })}
					</h2>
					<p className="mt-1 text-xs text-vscode-foreground/60">{activeCompany?.name ?? "Workspace"}</p>
				</div>
				<nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
					{navSections.map((section) => (
						<div key={section.label} className="space-y-3">
							<p className="text-xs uppercase tracking-wide text-vscode-foreground/50">{section.label}</p>
							<div className="space-y-1">
								{section.items.map((item) => {
									const isActive = collection === item.value
									return (
										<button
											key={item.value}
											onClick={() => setCollection(item.value)}
											className={cn(
												"flex w-full items-center gap-2 rounded-xs px-2.5 py-2 text-sm transition",
												"hover:bg-vscode-list-hoverBackground hover:text-vscode-list-hoverForeground",
												isActive &&
													"bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground",
											)}
										>
											<span className={cn("codicon text-base", item.icon)} />
											<span className="truncate">{item.label}</span>
										</button>
									)
								})}
							</div>
						</div>
					))}

					{highlightEntries.length > 0 && (
						<div className="space-y-3">
							<p className="text-xs uppercase tracking-wide text-vscode-foreground/50">Recent touchpoints</p>
							<div className="space-y-2">
								{highlightEntries.map((file) => (
									<button
										key={file.path}
										onClick={() => setSelectedPath(file.path)}
										className={cn(
											"flex w-full flex-col gap-1 rounded-md border border-transparent bg-vscode-editor-background/60 px-3 py-2 text-left text-xs transition",
											"hover:border-vscode-focusBorder/60 hover:bg-vscode-editor-background",
										)}
									>
										<p className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-vscode-foreground/45">
											{kindIcon(file.kind)}
											<span>{formatDistanceToNow(new Date(file.modifiedAt), { addSuffix: true })}</span>
										</p>
										<p className="line-clamp-1 text-sm font-medium text-vscode-foreground/90">{file.name}</p>
										<p className="line-clamp-2 text-[11px] text-vscode-foreground/60">{file.folderTrail.join(" / ") || "Workspace"}</p>
									</button>
								))}
							</div>
						</div>
					)}
				</nav>
				<div className="border-t border-vscode-panel-border px-4 py-4 text-xs text-vscode-foreground/50">
					<div className="flex items-center gap-2">
						<span className="codicon codicon-cloud" />
						<span>Synced with your company folder.</span>
					</div>
				</div>
			</aside>

			<div className="flex flex-1 flex-col overflow-hidden">
				<header className="border-b border-vscode-panel-border px-6 py-5">
					<div className="flex flex-wrap items-center gap-4">
						<div className="flex items-center gap-3">
							<div className="flex size-9 items-center justify-center rounded-full bg-vscode-button-secondaryBackground text-lg">
								{activeCompany?.emoji ?? "📂"}
							</div>
							<div>
								<p className="text-xs uppercase tracking-wide text-vscode-foreground/60">
									{["Home", activeCompany?.name ?? "Company"].join(" / ")}
								</p>
								<h1 className="text-xl font-semibold">{t("common:fileCabinet.title", { defaultValue: "File Cabinet" })}</h1>
							</div>
						</div>
						<div className="ml-auto flex items-center gap-2">
							<Button variant="outline" size="sm" className="gap-2" disabled>
								<span className="codicon codicon-upload" />
								Upload
							</Button>
							<Button size="sm" className="gap-2" disabled>
								<span className="codicon codicon-add" />
								New
							</Button>
						</div>
					</div>
					<div className="mt-5 flex flex-wrap items-center gap-3">
						<div className="relative w-full max-w-xl">
							<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-vscode-foreground/45 codicon codicon-search" />
							<Input
								type="search"
								value={searchTerm}
								onChange={(event) => setSearchTerm(event.target.value)}
								placeholder="Search files"
								className="pl-9 pr-12"
							/>
							<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-vscode-foreground/40">
								⌘K
							</span>
						</div>
						<Button variant="ghost" size="sm" className="gap-2 text-xs text-vscode-foreground/70" disabled>
							<span className="codicon codicon-filter" />
							Advanced filters
						</Button>
						<div className="ml-auto flex items-center gap-2 text-xs text-vscode-foreground/60">
							{isLoading ? (
								<Badge variant="outline" className="gap-1 border-vscode-panel-border bg-transparent text-[11px] text-vscode-foreground/70">
									<span className="codicon codicon-sync" />
									Syncing…
								</Badge>
							) : (
								<Badge variant="outline" className="gap-1 border-vscode-panel-border bg-transparent text-[11px] text-vscode-foreground/70">
									<span className="codicon codicon-check" />
									Up to date
								</Badge>
							)}
						</div>
					</div>
					{loadError && <p className="mt-3 text-xs text-red-400">{loadError}</p>}
				</header>

				<div className="flex flex-1 overflow-hidden">
					<div className="flex flex-1 flex-col overflow-hidden">
						<div className="sticky top-0 z-10 border-b border-vscode-panel-border bg-vscode-editor-background/90 px-6 py-4 backdrop-blur">
							<div className="flex flex-wrap items-center gap-3">
								<div className="flex flex-wrap items-center gap-2">
									{filters.map((option) => {
										const isActive = filter === option.id
										return (
											<button
												key={option.id}
												onClick={() => setFilter(option.id)}
												className={cn(
													"rounded-full border px-3 py-1 text-xs transition",
													isActive
														? "border-vscode-focusBorder bg-vscode-editor-background text-vscode-foreground"
														: "border-transparent bg-vscode-editor-background/40 text-vscode-foreground/60 hover:border-vscode-focusBorder/40",
											)}
											>
												{option.label}
											</button>
										)
									})}
								</div>
								<div className="ml-auto flex items-center gap-2">
									<Select value={sort} onValueChange={(value: SortKey) => setSort(value)}>
										<SelectTrigger className="h-7 text-xs text-vscode-foreground/70">
											<SelectValue placeholder="Sort" />
										</SelectTrigger>
										<SelectContent>
											{sortOptions.map((option) => (
												<SelectItem key={option.id} value={option.id}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<div className="flex items-center gap-1 rounded-xs border border-vscode-panel-border bg-vscode-editor-background p-1 text-base text-vscode-foreground/50">
										<button
											type="button"
											onClick={() => setViewMode("grid")}
											className={cn(
												"rounded-[4px] px-2 py-1",
												viewMode === "grid" && "bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground",
											)}
										>
											<span className="codicon codicon-grid" />
										</button>
										<button
											type="button"
											onClick={() => setViewMode("list")}
											className={cn(
												"rounded-[4px] px-2 py-1",
												viewMode === "list" && "bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground",
											)}
										>
											<span className="codicon codicon-list-flat" />
										</button>
									</div>
								</div>
							</div>
						</div>

						<div className="flex-1 overflow-y-auto px-6 pb-12">
							{viewMode === "grid" ? (
								<div className="grid gap-4 pt-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
									{filteredItems.map((item) => {
										const isActive = selectedPath === item.path
										return (
											<button
												key={item.path}
												onClick={() => setSelectedPath(item.path)}
												className={cn(
													"flex flex-col gap-3 rounded-lg border px-4 py-4 text-left transition",
													"border-vscode-panel-border bg-vscode-editor-background/70 hover:border-vscode-focusBorder",
													isActive && "border-vscode-focusBorder bg-vscode-editor-background",
											)}
											>
												<div className="flex items-start gap-3">
													<div className="flex size-9 items-center justify-center rounded-md bg-vscode-dropdown-background text-lg">
														{kindIcon(item.kind)}
													</div>
													<div className="flex-1">
														<p className="flex items-center gap-2 text-xs text-vscode-foreground/50">
															{item.topLevel ?? "Workspace"}
															<span>•</span>
															{formatDistanceToNow(new Date(item.modifiedAt), { addSuffix: true })}
														</p>
														<p className="mt-1 line-clamp-2 text-sm font-medium text-vscode-foreground/95">{item.name}</p>
														<p className="mt-1 text-xs text-vscode-foreground/55 line-clamp-2">
															{item.folderTrail.slice(1).join(" / ") || "No additional folders"}
														</p>
													</div>
													<button
														type="button"
														onClick={(event) => {
															event.stopPropagation()
															toggleStarred(item.path)
														}}
														className={cn(
															"codicon text-base text-vscode-foreground/40 transition",
															item.starred ? "codicon-star-full text-[#F2C94C]" : "codicon-star",
														)}
													/>
												</div>
												<div className="flex flex-wrap items-center gap-2 text-[11px] text-vscode-foreground/45">
													<span>{item.extension.toUpperCase() || item.kind}</span>
													<span>•</span>
													<span>{formatBytes(item.sizeBytes)}</span>
												</div>
											</button>
									)
									})}
								</div>
							) : (
								<div className="space-y-2 pt-4">
									{filteredItems.map((item) => {
										const isActive = selectedPath === item.path
										return (
											<button
												key={item.path}
												onClick={() => setSelectedPath(item.path)}
												className={cn(
													"flex items-center gap-4 rounded-md border border-transparent px-4 py-3 text-left transition",
													"hover:border-vscode-focusBorder/40",
													isActive && "border-vscode-focusBorder bg-vscode-editor-background",
											)}
											>
												<div className="hidden w-24 text-xs text-vscode-foreground/45 md:block">
													{formatDistanceToNow(new Date(item.modifiedAt), { addSuffix: true })}
												</div>
												<div className="flex items-center gap-3">
													<div className="flex size-8 items-center justify-center rounded-md bg-vscode-dropdown-background text-base">
														{kindIcon(item.kind)}
													</div>
													<div>
														<p className="text-sm font-medium text-vscode-foreground/95">{item.name}</p>
														<p className="text-xs text-vscode-foreground/55">{item.topLevel ?? "Workspace"}</p>
													</div>
												</div>
												<div className="ml-auto flex items-center gap-2 text-xs text-vscode-foreground/50">
													<span>{formatBytes(item.sizeBytes)}</span>
													<button
														type="button"
														onClick={(event) => {
															event.stopPropagation()
															toggleStarred(item.path)
														}}
														className={cn(
															"codicon text-base text-vscode-foreground/40 transition",
															item.starred ? "codicon-star-full text-[#F2C94C]" : "codicon-star",
														)}
													/>
												</div>
											</button>
										)
									})}
								</div>
							)}

							{!isLoading && filteredItems.length === 0 && (
								<div className="pt-16 text-center text-sm text-vscode-foreground/45">
									<p>No files match your filters yet.</p>
									<p className="mt-2 text-xs">Try clearing search or syncing new folders.</p>
								</div>
							)}
						</div>
					</div>

					<aside className="hidden w-[360px] shrink-0 border-l border-vscode-panel-border bg-vscode-editor-background/95 px-5 py-6 lg:flex lg:flex-col">
						{selectedItem ? (
							<div className="flex h-full flex-col overflow-hidden">
								<div className="flex items-start gap-3">
									<div className="flex size-10 items-center justify-center rounded-md bg-vscode-dropdown-background text-xl">
										{kindIcon(selectedItem.kind)}
									</div>
									<div className="flex-1 min-w-0">
										<p className="text-xs uppercase tracking-wide text-vscode-foreground/50">
											{selectedItem.topLevel ?? "Workspace"}
										</p>
										<h2 className="truncate text-lg font-semibold text-vscode-foreground/95">{selectedItem.name}</h2>
										<p className="text-xs text-vscode-foreground/55">
											Updated {formatDistanceToNow(new Date(selectedItem.modifiedAt), { addSuffix: true })}
										</p>
									</div>
									<button
										onClick={() => toggleStarred(selectedItem.path)}
										className={cn(
											"codicon text-base text-vscode-foreground/40 transition",
											selectedItem.starred ? "codicon-star-full text-[#F2C94C]" : "codicon-star",
										)}
									/>
								</div>

								<div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-vscode-foreground/50">
									<span>{selectedItem.extension.toUpperCase() || selectedItem.kind}</span>
									<span>•</span>
									<span>{formatBytes(selectedItem.sizeBytes)}</span>
									<span>•</span>
									<span>{selectedItem.path}</span>
								</div>

								<div className="mt-5 flex flex-wrap gap-2">
									<Button onClick={handleOpenInEditor} size="sm" variant="outline" className="gap-2">
										<span className="codicon codicon-go-to-file" />
										Open
									</Button>
								</div>

								<Separator className="my-5 border-vscode-panel-border" />

								<div className="flex-1 overflow-y-auto pr-1">
									<Card className="border-vscode-panel-border bg-vscode-editor-background/60">
										<CardHeader>
											<CardTitle className="text-sm">Preview</CardTitle>
											<CardDescription className="text-xs text-vscode-foreground/55">
												Quick look at the file contents.
											</CardDescription>
										</CardHeader>
										<CardContent className="space-y-4">
											{preview?.base64 ? (
												<div className="overflow-hidden rounded-md border border-vscode-panel-border">
													<img
														src={`data:${preview.contentType ?? "image/*"};base64,${preview.base64}`}
														alt={selectedItem.name}
														className="h-auto w-full object-cover"
													/>
												</div>
											) : preview?.markdown ? (
												<div className="space-y-3">
													<Textarea
														value={markdownDraft}
														onChange={(event) => setMarkdownDraft(event.target.value)}
														className="min-h-[180px] text-sm"
													/>
													<Button onClick={handleSaveDraft} size="sm" className="gap-2" disabled={isSaving === "saving"}>
														<span className="codicon codicon-save" />
														{isSaving === "saving" ? "Saving…" : "Save changes"}
													</Button>
													{isSaving === "error" && <p className="text-xs text-red-400">Failed to save file.</p>}
												</div>
											) : preview?.text ? (
												<div className="space-y-3">
													<Textarea
														value={markdownDraft}
														onChange={(event) => setMarkdownDraft(event.target.value)}
														className="min-h-[180px] text-sm"
													/>
													<Button onClick={handleSaveDraft} size="sm" className="gap-2" disabled={isSaving === "saving"}>
														<span className="codicon codicon-save" />
														{isSaving === "saving" ? "Saving…" : "Save changes"}
													</Button>
													{isSaving === "error" && <p className="text-xs text-red-400">Failed to save file.</p>}
												</div>
											) : (
												<div className="rounded-md border border-dashed border-vscode-panel-border bg-vscode-editor-background/40 p-4 text-xs text-vscode-foreground/60">
													{preview?.error ?? "Preview not available yet."}
												</div>
											)}
										</CardContent>
									</Card>

									<Separator className="my-6 border-vscode-panel-border" />

									<div>
										<p className="text-sm font-semibold text-vscode-foreground/90">Timeline</p>
										<ul className="mt-3 space-y-4 text-xs">
											<li className="flex gap-3">
												<div className="mt-1 h-2 w-2 rounded-full bg-vscode-focusBorder" />
												<div>
													<p className="font-medium text-vscode-foreground/85">Last modified</p>
													<p className="text-vscode-foreground/60">{formatDistanceToNow(new Date(selectedItem.modifiedAt), { addSuffix: true })}</p>
													<p className="text-[11px] text-vscode-foreground/45">{new Date(selectedItem.modifiedAt).toLocaleString()}</p>
												</div>
											</li>
											<li className="flex gap-3">
												<div className="mt-1 h-2 w-2 rounded-full bg-vscode-focusBorder/60" />
												<div>
													<p className="font-medium text-vscode-foreground/85">Created</p>
													<p className="text-vscode-foreground/60">{formatDistanceToNow(new Date(selectedItem.createdAt), { addSuffix: true })}</p>
													<p className="text-[11px] text-vscode-foreground/45">{new Date(selectedItem.createdAt).toLocaleString()}</p>
												</div>
											</li>
										</ul>
									</div>
								</div>
							</div>
						) : (
							<div className="flex h-full flex-col items-center justify-center text-center text-sm text-vscode-foreground/50">
								<span className="codicon codicon-mirror text-2xl" />
								<p className="mt-3 font-medium">Select a file to preview</p>
								<p className="mt-1 text-xs">Rich previews and version hints appear here.</p>
							</div>
						)}
					</aside>
				</div>
			</div>
		</div>
	)
}

export default FileCabinetView
