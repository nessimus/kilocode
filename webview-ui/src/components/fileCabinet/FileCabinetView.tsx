import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import clsx from "clsx"
import deepEqual from "fast-deep-equal"

import type { JSONContent } from "@tiptap/core"
import type { FileCabinetPreview } from "@roo-code/types"

import { useExtensionState } from "@/context/ExtensionStateContext"
import { useAppTranslation } from "@/i18n/TranslationContext"
import RichTextEditor from "@/components/brainstorm/RichTextEditor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { vscode } from "@/utils/vscode"

interface FileCabinetViewProps {
	isHidden?: boolean
}

interface MetricPill {
	id: string
	label: string
	value: string
	delta?: string
	icon: string
	accent: string
}

interface FeaturedCollection {
	id: string
	title: string
	description: string
	icon: string
}

interface DeliverableCard {
	id: string
	title: string
	status: "needsReview" | "inReview" | "approved"
	dueDate: string
	dueDateIso: string
	actionLinkLabel: string
	owner: string
	reviewer: string
	summary: string
	linkedAction: string
	description: string
	activity: ActivityEntry[]
	checkpoints: string[]
}

interface FolderCard {
	id: string
	title: string
	description: string
	tags: string[]
	sizeLabel: string
	owner: string
	updatedAt: string
	updatedAtIso: string
	itemCount: number
	collaborators: string[]
	path: string
	activity: ActivityEntry[]
}

interface ActivityEntry {
	id: string
	label: string
	timestamp: string
	actor: string
}

interface FileVersionItem {
	id: string
	label: string
	updatedAt: string
	actor: string
}

interface RecentFileRow {
	id: string
	title: string
	type: "doc" | "sheet" | "media" | "pdf"
	updatedAt: string
	updatedAtIso: string
	size: string
	owner: string
	tags: string[]
	createdAt: string
	createdBy: string
	createdAtIso: string
	description: string
	activity: ActivityEntry[]
	versions: FileVersionItem[]
	sharedWith: string[]
	favorited?: boolean
	content?: JSONContent
	path?: string
	companyId?: string
	kind?: string
	byteSize?: number
}

const METRIC_SKINS: Array<Pick<MetricPill, "id" | "label" | "icon" | "accent">> = [
	{
		id: "total-files",
		label: "Total files",
		icon: "codicon-organization",
		accent: "bg-gradient-to-r from-emerald-400/25 via-emerald-400/10 to-transparent border border-emerald-400/30",
	},
	{
		id: "recent-updates",
		label: "Updated in 24h",
		icon: "codicon-history",
		accent: "bg-gradient-to-r from-sky-400/25 via-sky-400/10 to-transparent border border-sky-400/30",
	},
	{
		id: "storage",
		label: "Storage",
		icon: "codicon-database",
		accent: "bg-gradient-to-r from-purple-400/25 via-purple-400/10 to-transparent border border-purple-400/30",
	},
	{
		id: "review-queue",
		label: "Review queue",
		icon: "codicon-tasklist",
		accent: "bg-gradient-to-r from-amber-400/25 via-amber-400/10 to-transparent border border-amber-400/35",
	},
]

const WORKSPACE_VIEWS = [
	{ id: "all", label: "All", icon: "codicon-circle-large", description: "Every artifact across the workspace" },
	{ id: "recent", label: "Recent", icon: "codicon-clock", description: "Touched in the last 7 days" },
	{ id: "shared", label: "Shared", icon: "codicon-organization", description: "Visible beyond the core team" },
	{ id: "favorites", label: "Favorites", icon: "codicon-star-full", description: "Starred for quick access" },
]

const LIBRARY_CATEGORIES = [
	{
		id: "deliverables",
		label: "Deliverables",
		icon: "codicon-git-pull-request",
		description: "Action-ready outputs",
	},
	{ id: "folders", label: "Folders", icon: "codicon-folder", description: "Structured collections" },
	{ id: "tags", label: "Tags", icon: "codicon-tag", description: "Topic lenses" },
	{ id: "approvals", label: "Approvals", icon: "codicon-verified", description: "Review checkpoints" },
]

const FEATURED_COLLECTIONS: FeaturedCollection[] = [
	{
		id: "product-specs",
		title: "Product Specs",
		description: "Centralized requirements, user stories, and release criteria.",
		icon: "codicon-symbol-parameter",
	},
	{
		id: "engineering-guidelines",
		title: "Engineering Guidelines",
		description: "Standards that keep services resilient and scalable.",
		icon: "codicon-server-process",
	},
	{
		id: "design-system",
		title: "Design System",
		description: "Usage rules, components, and brand guardrails.",
		icon: "codicon-symbol-color",
	},
	{
		id: "release-notes",
		title: "Release Notes",
		description: "Chronological log of launches, fixes, and learnings.",
		icon: "codicon-rocket",
	},
]

const DELIVERABLES: DeliverableCard[] = [
	{
		id: "launch-brief",
		title: "October Launch Brief",
		status: "needsReview",
		dueDate: "Due Oct 1, 2025",
		dueDateIso: "2025-10-01T17:00:00.000Z",
		actionLinkLabel: "Request review",
		owner: "Jordan",
		reviewer: "Mila",
		summary:
			"Final approval package covering messaging, rollout plan, and risk mitigations for the October launch.",
		linkedAction: "Launch Checklist",
		description: "All launch owners need to confirm dependencies before this ships to the external press list.",
		activity: [
			{
				id: "launch-brief-activity-1",
				label: "Jordan routed draft to creative",
				timestamp: "Sep 30, 2025 · 10:05 AM",
				actor: "Jordan",
			},
			{
				id: "launch-brief-activity-2",
				label: "Mila requested tone tweaks",
				timestamp: "Sep 29, 2025 · 7:42 PM",
				actor: "Mila",
			},
		],
		checkpoints: ["Messaging review", "Exec approval", "Ready for scheduling"],
	},
	{
		id: "retrospective",
		title: "Sprint 44 Retrospective",
		status: "inReview",
		dueDate: "Reviewing · Sep 30, 2025",
		dueDateIso: "2025-09-30T23:59:00.000Z",
		actionLinkLabel: "Track feedback",
		owner: "Nova",
		reviewer: "Avery",
		summary: "Collective notes and actions to close Sprint 44 gaps before planning the next cycle.",
		linkedAction: "Retro Notes - Sprint 44",
		description:
			"Capture final feedback from reviewers so action owners can ship follow-ups before the next standup.",
		activity: [
			{
				id: "retro-activity-1",
				label: "Avery added blocker resolution template",
				timestamp: "Sep 29, 2025 · 9:15 PM",
				actor: "Avery",
			},
			{
				id: "retro-activity-2",
				label: "Nova tagged owners on follow-ups",
				timestamp: "Sep 29, 2025 · 5:02 PM",
				actor: "Nova",
			},
		],
		checkpoints: ["Collect feedback", "Assign owners", "Publish recap"],
	},
	{
		id: "pricing-sheet",
		title: "Q4 Pricing Update",
		status: "approved",
		dueDate: "Approved Sep 27, 2025",
		dueDateIso: "2025-09-27T16:30:00.000Z",
		actionLinkLabel: "Open deliverable",
		owner: "Kai",
		reviewer: "Executive Ops",
		summary: "Approved pricing matrix with rollout guidance for all revenue channels.",
		linkedAction: "Pricing Strategy Board",
		description: "Green-lit by exec ops; ready to sync with sales and customer success teams.",
		activity: [
			{
				id: "pricing-activity-1",
				label: "Executive Ops approved revisions",
				timestamp: "Sep 27, 2025 · 4:30 PM",
				actor: "Executive Ops",
			},
			{
				id: "pricing-activity-2",
				label: "Kai synced final numbers",
				timestamp: "Sep 27, 2025 · 11:48 AM",
				actor: "Kai",
			},
		],
		checkpoints: ["Finance sign-off", "GTMS alignment", "Customer messaging"],
	},
]

const STATIC_FOLDERS: FolderCard[] = [
	{
		id: "library-design",
		title: "Design Library",
		description: "Components, tokens, rituals, and creative assets.",
		tags: ["Brand", "Components"],
		sizeLabel: "8.4 GB",
		owner: "Mila Ortiz",
		updatedAt: "Updated Sep 29, 2025",
		updatedAtIso: "2025-09-29T20:05:00.000Z",
		itemCount: 186,
		collaborators: ["Mila", "Nova", "Rowan"],
		path: "Golden Workplace/Design/Library",
		activity: [
			{
				id: "library-design-activity-1",
				label: "Mila refreshed component tokens",
				timestamp: "Sep 29, 2025 · 8:05 PM",
				actor: "Mila",
			},
			{
				id: "library-design-activity-2",
				label: "Nova uploaded hero imagery",
				timestamp: "Sep 28, 2025 · 6:12 PM",
				actor: "Nova",
			},
		],
	},
	{
		id: "growth-plays",
		title: "Growth Plays",
		description: "Campaign blueprints, scripts, and performance snapshots.",
		tags: ["Lifecycle", "Outbound"],
		sizeLabel: "4.2 GB",
		owner: "Isla Marin",
		updatedAt: "Updated Sep 28, 2025",
		updatedAtIso: "2025-09-28T18:30:00.000Z",
		itemCount: 94,
		collaborators: ["Isla", "Jordan"],
		path: "Golden Workplace/Growth/Plays",
		activity: [
			{
				id: "growth-plays-activity-1",
				label: "Isla exported Q4 sequence scripts",
				timestamp: "Sep 28, 2025 · 6:30 PM",
				actor: "Isla",
			},
			{
				id: "growth-plays-activity-2",
				label: "Jordan annotated outbound split tests",
				timestamp: "Sep 28, 2025 · 4:18 PM",
				actor: "Jordan",
			},
		],
	},
	{
		id: "finance-desk",
		title: "Finance Desk",
		description: "Runway tracker, vendor agreements, and spend reviews.",
		tags: ["Budget", "Compliance"],
		sizeLabel: "2.1 GB",
		owner: "Kai Flores",
		updatedAt: "Updated Sep 27, 2025",
		updatedAtIso: "2025-09-27T17:20:00.000Z",
		itemCount: 68,
		collaborators: ["Kai", "Executive Ops"],
		path: "Golden Workplace/Finance/Desk",
		activity: [
			{
				id: "finance-desk-activity-1",
				label: "Kai uploaded vendor renewal schedule",
				timestamp: "Sep 27, 2025 · 5:20 PM",
				actor: "Kai",
			},
			{
				id: "finance-desk-activity-2",
				label: "Executive Ops reviewed spend alerts",
				timestamp: "Sep 27, 2025 · 2:05 PM",
				actor: "Executive Ops",
			},
		],
	},
]

const RECENT_FILE_FILTERS = [
	{ id: "all", label: "All" },
	{ id: "documents", label: "Documents" },
	{ id: "media", label: "Media" },
]

const STATIC_RECENT_FILES: RecentFileRow[] = [
	{
		id: "launch-checklist",
		title: "Launch Checklist",
		type: "doc",
		updatedAt: "Sep 30, 2025 · 10:12 AM",
		updatedAtIso: "2025-09-30T10:12:00.000-07:00",
		size: "220 KB",
		owner: "Jordan",
		tags: ["Launch", "Ops"],
		createdAt: "Created Sep 24, 2025 · 9:08 AM",
		createdAtIso: "2025-09-24T09:08:00.000-07:00",
		createdBy: "Jordan",
		description:
			"Checklist driving the October launch milestones across marketing, product, and go-to-market tasks.",
		activity: [
			{
				id: "launch-checklist-activity-1",
				label: "Jordan shipped edits to sections 3 & 4",
				timestamp: "Sep 30, 2025 · 10:12 AM",
				actor: "Jordan",
			},
			{
				id: "launch-checklist-activity-2",
				label: "Avery left feedback on risk mitigation",
				timestamp: "Sep 29, 2025 · 8:41 PM",
				actor: "Avery",
			},
		],
		versions: [
			{
				id: "launch-checklist-v3",
				label: "v3 · Final review",
				updatedAt: "Sep 30, 2025 · 10:12 AM",
				actor: "Jordan",
			},
			{
				id: "launch-checklist-v2",
				label: "v2 · Added GTM owners",
				updatedAt: "Sep 28, 2025 · 6:55 PM",
				actor: "Jordan",
			},
		],
		sharedWith: ["Avery", "Nova"],
		favorited: true,
		content: {
			type: "doc",
			content: [
				{
					type: "heading",
					attrs: { level: 2 },
					content: [{ type: "text", text: "Launch Checklist" }],
				},
				{
					type: "paragraph",
					content: [{ type: "text", text: "- Finalize launch narrative" }],
				},
				{
					type: "paragraph",
					content: [{ type: "text", text: "- Prep customer email + socials" }],
				},
				{
					type: "paragraph",
					content: [{ type: "text", text: "- Confirm support playbook" }],
				},
			],
		},
	},
	{
		id: "brand-refresh",
		title: "Brand Refresh Concepts",
		type: "media",
		updatedAt: "Sep 29, 2025 · 6:45 PM",
		updatedAtIso: "2025-09-29T18:45:00.000-07:00",
		size: "18.2 MB",
		owner: "Mila",
		tags: ["Design", "Campaign"],
		createdAt: "Created Sep 26, 2025 · 4:32 PM",
		createdAtIso: "2025-09-26T16:32:00.000-07:00",
		createdBy: "Mila",
		description: "Figma export of updated color tokens, social frames, and brand photography treatments.",
		activity: [
			{
				id: "brand-refresh-activity-1",
				label: "Mila uploaded high-res assets",
				timestamp: "Sep 29, 2025 · 6:45 PM",
				actor: "Mila",
			},
			{
				id: "brand-refresh-activity-2",
				label: "Nova requested copy alignment",
				timestamp: "Sep 29, 2025 · 2:58 PM",
				actor: "Nova",
			},
		],
		versions: [
			{
				id: "brand-refresh-v2",
				label: "v2 · Lighting pass",
				updatedAt: "Sep 29, 2025 · 6:45 PM",
				actor: "Mila",
			},
			{
				id: "brand-refresh-v1",
				label: "v1 · Initial comps",
				updatedAt: "Sep 27, 2025 · 1:10 PM",
				actor: "Mila",
			},
		],
		sharedWith: ["Design Guild", "Executive Ops"],
	},
	{
		id: "kpi-dashboard",
		title: "Weekly KPI Dashboard",
		type: "sheet",
		updatedAt: "Sep 29, 2025 · 2:03 PM",
		updatedAtIso: "2025-09-29T14:03:00.000-07:00",
		size: "1.4 MB",
		owner: "Kai",
		tags: ["Metrics", "Finance"],
		createdAt: "Created Sep 22, 2025 · 8:17 AM",
		createdAtIso: "2025-09-22T08:17:00.000-07:00",
		createdBy: "Kai",
		description: "Live spreadsheet syncing revenue, burn, and pipeline metrics for weekly exec review.",
		activity: [
			{
				id: "kpi-dashboard-activity-1",
				label: "Kai refreshed revenue actuals",
				timestamp: "Sep 29, 2025 · 2:03 PM",
				actor: "Kai",
			},
			{
				id: "kpi-dashboard-activity-2",
				label: "Isla annotated marketing lift",
				timestamp: "Sep 28, 2025 · 7:22 PM",
				actor: "Isla",
			},
		],
		versions: [
			{
				id: "kpi-dashboard-v5",
				label: "v5 · Added sentiment column",
				updatedAt: "Sep 29, 2025 · 2:03 PM",
				actor: "Kai",
			},
			{
				id: "kpi-dashboard-v4",
				label: "v4 · Pipeline breakout",
				updatedAt: "Sep 27, 2025 · 11:56 AM",
				actor: "Kai",
			},
		],
		sharedWith: ["Finance Desk"],
	},
	{
		id: "retro-notes",
		title: "Retro Notes - Sprint 44",
		type: "pdf",
		updatedAt: "Sep 28, 2025 · 8:20 PM",
		updatedAtIso: "2025-09-28T20:20:00.000-07:00",
		size: "930 KB",
		owner: "Nova",
		tags: ["Retro", "Team"],
		createdAt: "Created Sep 27, 2025 · 5:05 PM",
		createdAtIso: "2025-09-27T17:05:00.000-07:00",
		createdBy: "Avery",
		description: "Compiled summary of Sprint 44 outcomes, wins, and follow-up actions from retrospective.",
		activity: [
			{
				id: "retro-notes-activity-1",
				label: "Nova exported notes to PDF",
				timestamp: "Sep 28, 2025 · 8:20 PM",
				actor: "Nova",
			},
			{
				id: "retro-notes-activity-2",
				label: "Rowan tagged blockers",
				timestamp: "Sep 28, 2025 · 6:37 PM",
				actor: "Rowan",
			},
		],
		versions: [
			{
				id: "retro-notes-v2",
				label: "v2 · Final export",
				updatedAt: "Sep 28, 2025 · 8:20 PM",
				actor: "Nova",
			},
			{
				id: "retro-notes-v1",
				label: "v1 · Draft notes",
				updatedAt: "Sep 27, 2025 · 7:48 PM",
				actor: "Avery",
			},
		],
		sharedWith: [],
	},
]

const FILE_TYPE_ICON: Record<RecentFileRow["type"], string> = {
	doc: "codicon-symbol-file",
	sheet: "codicon-table",
	media: "codicon-device-camera",
	pdf: "codicon-file-pdf",
}

const FILE_TYPE_LABELS: Record<RecentFileRow["type"], string> = {
	doc: "Document",
	sheet: "Spreadsheet",
	media: "Media",
	pdf: "PDF",
}

const formatBytes = (bytes?: number): string => {
	if (bytes === undefined || Number.isNaN(bytes)) {
		return "0 B"
	}
	if (bytes === 0) {
		return "0 B"
	}
	const units = ["B", "KB", "MB", "GB", "TB"]
	let value = bytes
	let unitIndex = 0
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024
		unitIndex += 1
	}
	const display = value % 1 === 0 ? value.toString() : value.toFixed(1)
	return `${display} ${units[unitIndex]}`
}

const formatDisplayDateTime = (iso?: string): string => {
	if (!iso) {
		return "Unknown"
	}
	const parsed = new Date(iso)
	if (Number.isNaN(parsed.getTime())) {
		return "Unknown"
	}
	return parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

const mapFileKindToRecentType = (kind?: string): RecentFileRow["type"] => {
	switch (kind) {
		case "spreadsheet":
			return "sheet"
		case "pdf":
			return "pdf"
		case "image":
		case "video":
		case "audio":
		case "archive":
			return "media"
		default:
			return "doc"
	}
}

const buildPreviewCacheKey = (companyId?: string, path?: string) => {
	if (!companyId || !path) {
		return undefined
	}
	const normalizedPath = path.startsWith("/") ? path : `/${path}`
	return `${companyId}::${normalizedPath}`
}

const resolveAbsolutePath = (rootUri: string, relativePath: string): string | undefined => {
	try {
		const normalizedRelative = relativePath.startsWith("/") ? relativePath.slice(1) : relativePath
		const base = new URL(rootUri)
		let basePath = decodeURIComponent(base.pathname)
		if (/^\/[A-Za-z]:/.test(basePath)) {
			basePath = basePath.slice(1)
		}
		if (!basePath.endsWith("/")) {
			basePath = `${basePath}/`
		}
		return `${basePath}${normalizedRelative}`
	} catch (_error) {
		return undefined
	}
}

const collectInlineText = (nodes?: JSONContent[]): string => {
	if (!nodes || nodes.length === 0) {
		return ""
	}
	return nodes
		.map((node) => {
			if (node.type === "text") {
				return node.text ?? ""
			}
			if (Array.isArray(node.content)) {
				return collectInlineText(node.content)
			}
			return ""
		})
		.join("")
}

const serializeRichTextToPlainText = (content: JSONContent | undefined): string => {
	if (!content || !Array.isArray(content.content)) {
		return ""
	}
	const lines: string[] = []
	for (const node of content.content) {
		switch (node.type) {
			case "paragraph": {
				const text = collectInlineText(node.content)
				lines.push(text.trimEnd())
				break
			}
			case "bulletList": {
				for (const item of node.content ?? []) {
					const text = collectInlineText(item.content)
					if (text) {
						lines.push(`- ${text.trim()}`)
					}
				}
				break
			}
			default: {
				const text = collectInlineText(node.content)
				if (text) {
					lines.push(text.trimEnd())
				}
			}
		}
	}
	return lines.join("\n\n").trim()
}

const convertPreviewToDoc = (preview?: FileCabinetPreview): JSONContent => {
	const pickText = () => {
		if (preview?.markdown && preview.markdown.trim().length > 0) {
			return preview.markdown
		}
		if (preview?.text && preview.text.trim().length > 0) {
			return preview.text
		}
		return ""
	}
	const text = pickText()
	if (!text) {
		return cloneContent(EMPTY_DOC_CONTENT)
	}
	const paragraphs = text.split(/\r?\n\r?\n/).map((block) => ({
		type: "paragraph",
		content: [{ type: "text", text: block.replace(/\r?\n/g, " ") }],
	}))
	return {
		type: "doc",
		content: paragraphs.length > 0 ? paragraphs : cloneContent(EMPTY_DOC_CONTENT).content,
	}
}

const VIEW_TOGGLES = [
	{ id: "grid", label: "Grid", icon: "codicon-grid-view" },
	{ id: "list", label: "List", icon: "codicon-list-tree" },
]

const SORT_OPTIONS = [
	{ id: "newest", label: "Newest" },
	{ id: "name", label: "Name" },
	{ id: "owner", label: "Owner" },
]

const NEW_MENU_ITEMS = [
	{ id: "doc", label: "Doc draft", hint: "Meeting notes, specs" },
	{ id: "folder", label: "Folder", hint: "Organize by team or project" },
	{ id: "spreadsheet", label: "Spreadsheet", hint: "KPIs, trackers" },
	{ id: "deliverable", label: "Deliverable", hint: "Assign reviewer + due date" },
]

const statusStyles: Record<DeliverableCard["status"], string> = {
	needsReview: "bg-amber-400/15 text-amber-200 border border-amber-400/40",
	inReview: "bg-sky-400/10 text-sky-200 border border-sky-400/35",
	approved: "bg-emerald-400/10 text-emerald-200 border border-emerald-400/35",
}

const statusLabels: Record<DeliverableCard["status"], string> = {
	needsReview: "Needs review",
	inReview: "In review",
	approved: "Approved",
}

const formatNumber = (value: number) => new Intl.NumberFormat().format(value)

const parseSizeToMB = (value: string) => {
	const normalized = value.trim().toLowerCase()
	const match = normalized.match(/([0-9]+(?:\.[0-9]+)?)/)
	if (!match) {
		return 0
	}
	const number = parseFloat(match[1])
	if (Number.isNaN(number)) {
		return 0
	}
	if (normalized.includes("gb")) {
		return number * 1024
	}
	if (normalized.includes("kb")) {
		return number / 1024
	}
	// treat MB and other units as MB
	return number
}

const cloneContent = (content: JSONContent): JSONContent => JSON.parse(JSON.stringify(content))

const EMPTY_DOC_CONTENT: JSONContent = {
	type: "doc",
	content: [
		{
			type: "paragraph",
			content: [{ type: "text", text: "" }],
		},
	],
}

type SelectionTarget = {
	type: "file" | "folder" | "deliverable"
	id: string
}

const FileCabinetView: React.FC<FileCabinetViewProps> = ({ isHidden = false }) => {
	const { t } = useAppTranslation()
	const {
		workplaceState,
		fileCabinetSnapshot,
		isFileCabinetLoading,
		fileCabinetError,
		requestFileCabinetSnapshot,
		createFileCabinetFolder,
		createFileCabinetFile,
		fileCabinetPreviews,
		fileCabinetPreviewLoading,
		fileCabinetPreviewErrors,
		requestFileCabinetPreview,
		writeFileCabinetFile,
		openFileCabinetFolder,
		lastCreatedFile,
		clearLastCreatedFile,
	} = useExtensionState()

	const companies = useMemo(() => workplaceState?.companies ?? [], [workplaceState?.companies])
	const activeCompanyId = workplaceState?.activeCompanyId
	const activeCompany = useMemo(() => {
		if (!companies.length) return undefined
		return companies.find((company) => company.id === activeCompanyId) ?? companies[0]
	}, [companies, activeCompanyId])

	const companyName =
		activeCompany?.name ?? t("common:fileCabinet.placeholderCompany", { defaultValue: "Golden Workplace" })

	useEffect(() => {
		if (isHidden || !activeCompanyId) {
			return
		}
		if (fileCabinetSnapshot?.companyId === activeCompanyId) {
			lastRequestedCompanyRef.current = activeCompanyId
			return
		}
		if (lastRequestedCompanyRef.current === activeCompanyId && isFileCabinetLoading) {
			return
		}
		lastRequestedCompanyRef.current = activeCompanyId
		requestFileCabinetSnapshot(activeCompanyId)
	}, [isHidden, activeCompanyId, fileCabinetSnapshot?.companyId, isFileCabinetLoading, requestFileCabinetSnapshot])

	const folderCards = useMemo<FolderCard[]>(() => {
		if (fileCabinetSnapshot) {
			const folders = fileCabinetSnapshot.folders ?? []
			if (!folders.length) {
				return []
			}
			const generatedAtIso = fileCabinetSnapshot.generatedAt
			const generatedAtDisplay = new Date(generatedAtIso).toLocaleString()
			return folders.map((folder) => {
				const itemCount = folder.fileCount + folder.subfolderCount
				const displayTitle = folder.name || folder.path.split("/").pop() || folder.path || "Folder"
				const parentDescription = folder.parentPath
					? t("common:fileCabinet.folderNestedIn", {
							defaultValue: "Nested in /{{parent}}",
							parent: folder.parentPath,
						})
					: t("common:fileCabinet.folderAtRoot", { defaultValue: "Workspace root" })
				const pathLabel = folder.path ? `/${folder.path}` : "/"
				return {
					id: folder.path || displayTitle,
					title: displayTitle,
					description: parentDescription,
					tags: [],
					sizeLabel: itemCount === 1 ? "1 item" : `${itemCount} items`,
					owner: companyName,
					updatedAt: generatedAtDisplay,
					updatedAtIso: generatedAtIso,
					itemCount,
					collaborators: [],
					path: pathLabel,
					activity: [],
				}
			})
		}
		return STATIC_FOLDERS
	}, [companyName, fileCabinetSnapshot, t])

	const recentFiles = useMemo<RecentFileRow[]>(() => {
		const snapshotFiles = fileCabinetSnapshot?.files ?? []
		if (snapshotFiles.length === 0) {
			return STATIC_RECENT_FILES
		}
		return snapshotFiles
			.map((file) => {
				const type = mapFileKindToRecentType(file.kind)
				const updatedAtLabel = formatDisplayDateTime(file.modifiedAt)
				const createdAtLabel = formatDisplayDateTime(file.createdAt)
				const sizeLabel = formatBytes(file.byteSize)
				const tags = file.topLevelFolder ? [file.topLevelFolder] : []
				return {
					id: file.id,
					title: file.name,
					type,
					updatedAt: updatedAtLabel,
					updatedAtIso: file.modifiedAt,
					size: sizeLabel,
					owner: file.topLevelFolder ?? companyName,
					tags,
					createdAt: createdAtLabel,
					createdAtIso: file.createdAt,
					createdBy: companyName,
					description: file.path,
					activity: [],
					versions: [],
					sharedWith: [],
					favorited: false,
					content: undefined,
					path: file.path,
					companyId: fileCabinetSnapshot?.companyId,
					kind: file.kind,
					byteSize: file.byteSize,
				}
			})
			.sort((a, b) => {
				const bTime = Date.parse(b.updatedAtIso)
				const aTime = Date.parse(a.updatedAtIso)
				if (Number.isNaN(bTime) || Number.isNaN(aTime)) {
					return 0
				}
				return bTime - aTime
			})
	}, [companyName, fileCabinetSnapshot])

	const [activeView, setActiveView] = useState<string>(WORKSPACE_VIEWS[0]?.id ?? "all")
	const [activeCategory, setActiveCategory] = useState<string>(LIBRARY_CATEGORIES[0]?.id ?? "deliverables")
	const [recentViewMode, setRecentViewMode] = useState<string>(VIEW_TOGGLES[0]?.id ?? "grid")
	const [recentFilter, setRecentFilter] = useState<string>(RECENT_FILE_FILTERS[0]?.id ?? "all")
	const [sortOption, setSortOption] = useState<string>(SORT_OPTIONS[0]?.id ?? "newest")
	const [searchQuery, setSearchQuery] = useState<string>("")
	const searchInputRef = useRef<HTMLInputElement | null>(null)
	const deliverablesSectionRef = useRef<HTMLDivElement | null>(null)
	const foldersSectionRef = useRef<HTMLDivElement | null>(null)
	const recentFilesSectionRef = useRef<HTMLDivElement | null>(null)
	const categoryScrollInitializedRef = useRef(false)
	const lastRequestedCompanyRef = useRef<string | undefined>()
	const autoSaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
	const [selectedItem, setSelectedItem] = useState<SelectionTarget | null>(() =>
		recentFiles[0] ? { type: "file", id: recentFiles[0].id } : null,
	)
	const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false)
	const [newFolderName, setNewFolderName] = useState("")
	const [newFolderError, setNewFolderError] = useState<string | null>(null)
	const newFolderInputRef = useRef<HTMLInputElement | null>(null)

	const trimmedSearchQuery = searchQuery.trim()
	const normalizedQuery = trimmedSearchQuery.toLowerCase()
	const hasSearchQuery = normalizedQuery.length > 0

	const selectItem = useCallback((next: SelectionTarget) => {
		setSelectedItem(next)
	}, [])

	const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		setSearchQuery(event.target.value)
	}, [])

	const handleSearchKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Escape" && hasSearchQuery) {
				setSearchQuery("")
				event.preventDefault()
			}
		},
		[hasSearchQuery],
	)

	const handleClearSearch = useCallback(() => {
		setSearchQuery("")
		requestAnimationFrame(() => searchInputRef.current?.focus())
	}, [])

	const handleResetView = useCallback(() => {
		setActiveView("all")
	}, [])

	const handleResetTypeFilter = useCallback(() => {
		setRecentFilter("all")
	}, [])

	const handleResetSort = useCallback(() => {
		setSortOption("newest")
	}, [])

	const handleResetCategory = useCallback(() => {
		setActiveCategory("deliverables")
		categoryScrollInitializedRef.current = false
	}, [])

	const isDefaultFilters = useMemo(
		() =>
			!hasSearchQuery &&
			activeView === "all" &&
			recentFilter === "all" &&
			sortOption === "newest" &&
			activeCategory === "deliverables",
		[activeCategory, activeView, hasSearchQuery, recentFilter, sortOption],
	)

	const handleResetFilters = useCallback(() => {
		setSearchQuery("")
		setActiveView("all")
		setRecentFilter("all")
		setSortOption("newest")
		setActiveCategory("deliverables")
		categoryScrollInitializedRef.current = false
		if (recentFiles[0]) {
			setSelectedItem({ type: "file", id: recentFiles[0].id })
		} else if (DELIVERABLES[0]) {
			setSelectedItem({ type: "deliverable", id: DELIVERABLES[0].id })
		} else if (folderCards[0]) {
			setSelectedItem({ type: "folder", id: folderCards[0].id })
		} else {
			setSelectedItem(null)
		}
		requestAnimationFrame(() => searchInputRef.current?.focus())
	}, [folderCards, recentFiles])

	const handleCreateFolderOpenChange = useCallback((open: boolean) => {
		setIsCreateFolderOpen(open)
		if (!open) {
			setNewFolderName("")
			setNewFolderError(null)
		}
	}, [])

	const handleConfirmCreateFolder = useCallback(() => {
		if (!activeCompany?.id) {
			return
		}
		const sanitized = newFolderName.trim()
		if (!sanitized) {
			setNewFolderError(
				(t("common:fileCabinet.newFolderNameRequired", {
					defaultValue: "Folder name is required",
				}) as string) || "Folder name is required",
			)
			return
		}
		const normalized = sanitized.replace(/\\+/g, "/").replace(/\/+/g, "/").replace(/^\/+/, "").replace(/\/+$/, "")
		if (!normalized) {
			setNewFolderError(
				(t("common:fileCabinet.newFolderNameInvalid", {
					defaultValue: "Enter a folder name without leading or trailing slashes",
				}) as string) || "Enter a folder name without leading or trailing slashes",
			)
			return
		}
		setNewFolderError(null)
		createFileCabinetFolder({ companyId: activeCompany.id, path: normalized })
		setIsCreateFolderOpen(false)
		setNewFolderName("")
	}, [activeCompany?.id, createFileCabinetFolder, newFolderName, t])

	const handleNewFolderNameChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			setNewFolderName(event.target.value)
			if (newFolderError) {
				setNewFolderError(null)
			}
		},
		[newFolderError],
	)

	const handleNewFolderFormSubmit = useCallback(
		(event: React.FormEvent<HTMLFormElement>) => {
			event.preventDefault()
			handleConfirmCreateFolder()
		},
		[handleConfirmCreateFolder],
	)

	const selectedFile = useMemo(() => {
		if (selectedItem?.type !== "file") {
			return null
		}
		return recentFiles.find((file) => file.id === selectedItem.id) ?? null
	}, [recentFiles, selectedItem])

	const selectedFolder = useMemo(() => {
		if (selectedItem?.type !== "folder") {
			return null
		}
		return folderCards.find((folder) => folder.id === selectedItem.id) ?? null
	}, [folderCards, selectedItem])

	const selectedDeliverable = useMemo(() => {
		if (selectedItem?.type !== "deliverable") {
			return null
		}
		return DELIVERABLES.find((deliverable) => deliverable.id === selectedItem.id) ?? null
	}, [selectedItem])

	const selectedFilePreviewKey = useMemo(
		() => buildPreviewCacheKey(activeCompany?.id, selectedFile?.path),
		[activeCompany?.id, selectedFile?.path],
	)
	const selectedFilePreview = selectedFilePreviewKey ? fileCabinetPreviews[selectedFilePreviewKey] : undefined
	const selectedFilePreviewIsLoading = selectedFilePreviewKey
		? Boolean(fileCabinetPreviewLoading[selectedFilePreviewKey])
		: false
	const selectedFilePreviewError = selectedFilePreviewKey
		? fileCabinetPreviewErrors[selectedFilePreviewKey]
		: undefined

	const fileContentDefaults = useMemo(() => {
		const result: Record<string, JSONContent> = {}
		recentFiles.forEach((file) => {
			if (file.type === "doc") {
				result[file.id] = cloneContent(EMPTY_DOC_CONTENT)
			}
		})
		return result
	}, [recentFiles])

	const [fileSavedContent, setFileSavedContent] = useState<Record<string, JSONContent>>(() => ({
		...fileContentDefaults,
	}))
	const [fileDraftContent, setFileDraftContent] = useState<Record<string, JSONContent>>(() => ({
		...fileContentDefaults,
	}))
	const [fileSaveStatus, setFileSaveStatus] = useState<Record<string, "saved" | "saving" | "idle">>({})
	const [editingFileId, setEditingFileId] = useState<string | null>(null)
	const openEditor = useCallback((fileId: string) => {
		setEditingFileId(fileId)
	}, [])
	const closeEditor = useCallback(() => setEditingFileId(null), [])

	useEffect(() => {
		if (!activeCompany?.id || !selectedFile?.path || !selectedFilePreviewKey) {
			return
		}
		if (selectedFilePreview || selectedFilePreviewIsLoading) {
			return
		}
		requestFileCabinetPreview(activeCompany.id, selectedFile.path)
	}, [
		activeCompany?.id,
		requestFileCabinetPreview,
		selectedFile?.path,
		selectedFilePreview,
		selectedFilePreviewIsLoading,
		selectedFilePreviewKey,
	])

	const handleOpenInEditor = useCallback(() => {
		if (!selectedFile?.path || !fileCabinetSnapshot?.rootUri) {
			return
		}
		const absolutePath = resolveAbsolutePath(fileCabinetSnapshot.rootUri, selectedFile.path)
		if (!absolutePath) {
			return
		}
		vscode.postMessage({ type: "openFile", text: absolutePath })
	}, [fileCabinetSnapshot?.rootUri, selectedFile?.path])

	const handleOpenSelectedFolder = useCallback(() => {
		if (!selectedFolder || !activeCompany?.id) {
			return
		}
		const normalized = selectedFolder.path.replace(/^\/+/, "").replace(/\/+$/, "")
		openFileCabinetFolder(activeCompany.id, normalized || undefined)
	}, [activeCompany?.id, openFileCabinetFolder, selectedFolder])

	const handleCreateDocument = useCallback(() => {
		if (!selectedFolder || !activeCompany?.id) {
			return
		}
		const normalizedDirectory = selectedFolder.path.replace(/^\/+/, "").replace(/\/+$/, "")
		createFileCabinetFile({
			companyId: activeCompany.id,
			directory: normalizedDirectory,
			preferredBaseName: "Untitled",
			extension: ".md",
			initialContents: "",
			encoding: "utf8",
		})
	}, [activeCompany?.id, createFileCabinetFile, selectedFolder])

	useEffect(() => {
		if (!isCreateFolderOpen) {
			return
		}
		requestAnimationFrame(() => newFolderInputRef.current?.focus())
	}, [isCreateFolderOpen])

	useEffect(() => {
		if (!selectedFile || selectedFile.type !== "doc") {
			return
		}
		const preview = selectedFilePreview
		if (!preview) {
			return
		}
		const baseDoc = convertPreviewToDoc(preview)
		setFileSavedContent((prev) =>
			prev[selectedFile.id] ? prev : { ...prev, [selectedFile.id]: cloneContent(baseDoc) },
		)
		setFileDraftContent((prev) =>
			prev[selectedFile.id] ? prev : { ...prev, [selectedFile.id]: cloneContent(baseDoc) },
		)
	}, [selectedFile, selectedFilePreview])

	useEffect(() => {
		if (!lastCreatedFile || !fileCabinetSnapshot || fileCabinetSnapshot.companyId !== lastCreatedFile.companyId) {
			return
		}
		const createdFile = recentFiles.find((file) => file.path === lastCreatedFile.path)
		if (!createdFile) {
			return
		}
		setFileSavedContent((prev) => ({ ...prev, [createdFile.id]: cloneContent(EMPTY_DOC_CONTENT) }))
		setFileDraftContent((prev) => ({ ...prev, [createdFile.id]: cloneContent(EMPTY_DOC_CONTENT) }))
		setFileSaveStatus((prev) => ({ ...prev, [createdFile.id]: "idle" }))
		selectItem({ type: "file", id: createdFile.id })
		openEditor(createdFile.id)
		if (activeCompany?.id && createdFile.path) {
			requestFileCabinetPreview(activeCompany.id, createdFile.path)
		}
		clearLastCreatedFile()
	}, [
		activeCompany?.id,
		clearLastCreatedFile,
		fileCabinetSnapshot,
		lastCreatedFile,
		recentFiles,
		openEditor,
		requestFileCabinetPreview,
		selectItem,
		setFileDraftContent,
		setFileSaveStatus,
		setFileSavedContent,
	])

	useEffect(() => {
		const targets: Record<string, React.RefObject<HTMLDivElement>> = {
			deliverables: deliverablesSectionRef,
			folders: foldersSectionRef,
			tags: recentFilesSectionRef,
			approvals: deliverablesSectionRef,
		}

		const targetRef = targets[activeCategory]
		if (!targetRef?.current) {
			categoryScrollInitializedRef.current = true
			return
		}

		if (!categoryScrollInitializedRef.current) {
			categoryScrollInitializedRef.current = true
			return
		}

		try {
			targetRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
		} catch (_error) {
			// ignore scroll failures (e.g. unsupported smooth scrolling)
		}
	}, [activeCategory])

	const searchFilteredFiles = useMemo(() => {
		const matchesTypeFilter = (file: RecentFileRow) => {
			switch (recentFilter) {
				case "documents":
					return file.type === "doc" || file.type === "sheet" || file.type === "pdf"
				case "media":
					return file.type === "media"
				default:
					return true
			}
		}

		const matchesSearch = (file: RecentFileRow) => {
			if (!hasSearchQuery) {
				return true
			}
			const haystack = [file.title, file.owner, file.description, ...file.tags, ...file.sharedWith]
				.join(" ")
				.toLowerCase()
			return haystack.includes(normalizedQuery)
		}

		return recentFiles.filter((file) => matchesTypeFilter(file) && matchesSearch(file))
	}, [hasSearchQuery, normalizedQuery, recentFilter, recentFiles])

	const filteredDeliverables = useMemo(() => {
		if (!hasSearchQuery) {
			return DELIVERABLES
		}
		return DELIVERABLES.filter((deliverable) => {
			const haystack = [
				deliverable.title,
				deliverable.summary,
				deliverable.description,
				deliverable.owner,
				deliverable.reviewer,
				deliverable.linkedAction,
				...deliverable.checkpoints,
				...deliverable.activity.map((item) => `${item.label} ${item.actor}`),
			]
				.join(" ")
				.toLowerCase()
			return haystack.includes(normalizedQuery)
		})
	}, [hasSearchQuery, normalizedQuery])

	const filteredFolders = useMemo(() => {
		if (!hasSearchQuery) {
			return folderCards
		}
		return folderCards.filter((folder) => {
			const haystack = [
				folder.title,
				folder.description,
				folder.owner,
				folder.path,
				...folder.tags,
				...folder.collaborators,
				...folder.activity.map((item) => `${item.label} ${item.actor}`),
			]
				.join(" ")
				.toLowerCase()
			return haystack.includes(normalizedQuery)
		})
	}, [folderCards, hasSearchQuery, normalizedQuery])

	useEffect(() => {
		setFileSavedContent((prev) => ({ ...fileContentDefaults, ...prev }))
		setFileDraftContent((prev) => ({ ...fileContentDefaults, ...prev }))
	}, [fileContentDefaults])

	const activeEditorFile = useMemo(() => {
		if (!editingFileId) return null
		return recentFiles.find((file) => file.id === editingFileId) ?? null
	}, [editingFileId, recentFiles])

	useEffect(() => {
		if (!editingFileId) {
			return
		}
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setEditingFileId(null)
			}
		}
		document.addEventListener("keydown", handleKeyDown)
		return () => {
			document.removeEventListener("keydown", handleKeyDown)
		}
	}, [editingFileId])

	const ensureFileState = useCallback(
		(file: RecentFileRow) => {
			if (file.type !== "doc") {
				return
			}
			const previewKey = buildPreviewCacheKey(activeCompany?.id ?? file.companyId, file.path)
			const preview = previewKey ? fileCabinetPreviews[previewKey] : undefined
			const baseDoc = convertPreviewToDoc(preview)
			setFileSavedContent((prev) => {
				if (prev[file.id]) {
					return prev
				}
				return { ...prev, [file.id]: cloneContent(baseDoc) }
			})
			setFileDraftContent((prev) => {
				if (prev[file.id]) {
					return prev
				}
				return { ...prev, [file.id]: cloneContent(baseDoc) }
			})
		},
		[activeCompany?.id, fileCabinetPreviews],
	)

	useEffect(() => {
		if (selectedFile) {
			ensureFileState(selectedFile)
		}
	}, [ensureFileState, selectedFile])

	useEffect(() => {
		if (activeEditorFile) {
			ensureFileState(activeEditorFile)
		}
	}, [activeEditorFile, ensureFileState])

	useEffect(() => {
		const activeId = editingFileId
		if (!activeId) {
			return
		}
		const draft = fileDraftContent[activeId]
		const saved = fileSavedContent[activeId]
		if (!draft || !saved) {
			return
		}
		if (deepEqual(draft, saved)) {
			if (autoSaveTimersRef.current[activeId]) {
				clearTimeout(autoSaveTimersRef.current[activeId])
				delete autoSaveTimersRef.current[activeId]
			}
			return
		}
		if ((fileSaveStatus[activeId] ?? "idle") === "saving") {
			return
		}
		const existingTimer = autoSaveTimersRef.current[activeId]
		if (existingTimer) {
			clearTimeout(existingTimer)
		}
		const timerId = setTimeout(() => {
			handleFileSave(activeId)
		}, 1500)
		autoSaveTimersRef.current[activeId] = timerId
		return () => {
			clearTimeout(timerId)
			if (autoSaveTimersRef.current[activeId] === timerId) {
				delete autoSaveTimersRef.current[activeId]
			}
		}
	}, [editingFileId, fileDraftContent, fileSaveStatus, fileSavedContent, handleFileSave])

	const handleFileContentChange = useCallback((fileId: string, content: JSONContent) => {
		setFileDraftContent((prev) => ({ ...prev, [fileId]: content }))
		setFileSaveStatus((prev) => {
			if (prev[fileId] === "saving") {
				return prev
			}
			return { ...prev, [fileId]: "idle" }
		})
	}, [])

	const handleFileRevert = useCallback(
		(fileId: string) => {
			setFileDraftContent((prev) => ({
				...prev,
				[fileId]: cloneContent(fileSavedContent[fileId] ?? EMPTY_DOC_CONTENT),
			}))
			setFileSaveStatus((prev) => ({ ...prev, [fileId]: "idle" }))
		},
		[fileSavedContent],
	)

	const handleFileSave = useCallback(
		(fileId: string) => {
			const draft = fileDraftContent[fileId]
			const targetFile = recentFiles.find((file) => file.id === fileId)
			if (!draft || !targetFile) {
				return
			}
			const companyId = activeCompany?.id ?? fileCabinetSnapshot?.companyId ?? targetFile.companyId
			const relativePath = targetFile.path?.replace(/^\/+/, "")
			if (!companyId || !relativePath) {
				setFileSaveStatus((prev) => ({ ...prev, [fileId]: "idle" }))
				return
			}
			const serialized = serializeRichTextToPlainText(draft)
			setFileSaveStatus((prev) => ({ ...prev, [fileId]: "saving" }))
			writeFileCabinetFile({
				companyId,
				path: relativePath,
				contents: serialized,
				encoding: "utf8",
			})
			setFileSavedContent((prev) => ({ ...prev, [fileId]: cloneContent(draft) }))
			setFileSaveStatus((prev) => ({ ...prev, [fileId]: "saved" }))
			setTimeout(() => {
				setFileSaveStatus((prev) => ({ ...prev, [fileId]: "idle" }))
			}, 1600)
			setTimeout(() => {
				requestFileCabinetSnapshot(companyId)
			}, 250)
		},
		[
			activeCompany?.id,
			fileCabinetSnapshot?.companyId,
			fileDraftContent,
			recentFiles,
			requestFileCabinetSnapshot,
			writeFileCabinetFile,
		],
	)

	const detailContent = useMemo(() => {
		if (selectedItem?.type === "file" && selectedFile) {
			const baseSaved =
				fileSavedContent[selectedFile.id] ??
				(selectedFile.content ? cloneContent(selectedFile.content) : cloneContent(EMPTY_DOC_CONTENT))
			const draftContent = fileDraftContent[selectedFile.id] ?? baseSaved
			const docSaveState = fileSaveStatus[selectedFile.id] ?? "idle"
			const showEditor = selectedFile.type === "doc" && !selectedFile.companyId
			const docIsDirty = showEditor && !deepEqual(draftContent, baseSaved)

			return (
				<div className="mt-5 flex flex-col gap-6">
					<div className="space-y-3 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
						<div className="flex items-start justify-between gap-3">
							<div>
								<h3 className="text-lg font-semibold text-vscode-foreground">{selectedFile.title}</h3>
								<p className="mt-1 inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
									<i
										className={clsx("codicon", FILE_TYPE_ICON[selectedFile.type])}
										aria-hidden="true"
									/>
									{FILE_TYPE_LABELS[selectedFile.type]}
								</p>
							</div>
							{showEditor ? (
								<button
									type="button"
									onClick={() => openEditor(selectedFile.id)}
									className="rounded-xl border border-transparent bg-[linear-gradient(120deg,rgba(94,229,163,0.85),rgba(63,162,255,0.85))] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-[0_10px_24px_rgba(40,190,200,0.35)] transition hover:shadow-[0_12px_28px_rgba(40,190,200,0.45)]">
									Open full editor
								</button>
							) : (
								<button
									type="button"
									onClick={handleOpenInEditor}
									className="rounded-xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_45%,transparent)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-vscode-foreground transition hover:border-[color-mix(in_srgb,var(--vscode-focusBorder)_55%,transparent)]">
									Open in VS Code
								</button>
							)}
						</div>
						<p className="text-sm">{selectedFile.description}</p>
					</div>
					<div className="rounded-2xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_32%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)] p-4">
						<div className="mb-3 flex items-center justify-between gap-3">
							<h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
								Preview
							</h4>
							{selectedFilePreview &&
								!selectedFilePreviewIsLoading &&
								!selectedFilePreviewError &&
								selectedFilePreview.contentType && (
									<span className="text-[10px] uppercase tracking-wider text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_65%,transparent)]">
										{selectedFilePreview.contentType}
									</span>
								)}
						</div>
						{selectedFilePreviewIsLoading ? (
							<p className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
								Loading preview…
							</p>
						) : selectedFilePreviewError || selectedFilePreview?.error ? (
							<p className="text-xs text-amber-300">
								{selectedFilePreviewError ?? selectedFilePreview?.error ?? "Preview unavailable"}
							</p>
						) : selectedFilePreview?.base64 ? (
							<div className="flex items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)] p-3">
								<img
									src={`data:${selectedFilePreview.contentType ?? "image/*"};base64,${selectedFilePreview.base64}`}
									alt={selectedFile.title}
									className="max-h-72 w-auto max-w-full rounded-lg object-contain"
								/>
							</div>
						) : selectedFilePreview?.markdown ? (
							<pre className="max-h-72 overflow-auto rounded-xl bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)] p-3 text-xs leading-relaxed text-vscode-foreground whitespace-pre-wrap">
								{selectedFilePreview.markdown}
							</pre>
						) : selectedFilePreview?.text ? (
							<pre className="max-h-72 overflow-auto rounded-xl bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)] p-3 font-mono text-xs leading-relaxed text-vscode-foreground whitespace-pre-wrap">
								{selectedFilePreview.text}
							</pre>
						) : (
							<p className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
								Preview not available for this file type.
							</p>
						)}
					</div>
					<div className="grid gap-3 rounded-xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_30%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] p-4 text-xs">
						<div className="flex items-center gap-2 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
							<i className="codicon codicon-person" aria-hidden="true" />
							<span className="font-semibold text-vscode-foreground">Owner</span>
							<span>{selectedFile.owner}</span>
						</div>
						<div className="flex items-center gap-2 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
							<i className="codicon codicon-account" aria-hidden="true" />
							<span className="font-semibold text-vscode-foreground">Created by</span>
							<span>{selectedFile.createdBy}</span>
						</div>
						<div className="flex items-center gap-2 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
							<i className="codicon codicon-calendar" aria-hidden="true" />
							<span className="font-semibold text-vscode-foreground">Created</span>
							<span>{selectedFile.createdAt}</span>
						</div>
						<div className="flex items-center gap-2 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
							<i className="codicon codicon-history" aria-hidden="true" />
							<span className="font-semibold text-vscode-foreground">Last updated</span>
							<span>{selectedFile.updatedAt}</span>
						</div>
						<div className="flex items-center gap-2 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
							<i className="codicon codicon-database" aria-hidden="true" />
							<span className="font-semibold text-vscode-foreground">File size</span>
							<span>{selectedFile.size}</span>
						</div>
						{selectedFile.sharedWith.length > 0 && (
							<div className="flex items-center gap-2 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
								<i className="codicon codicon-organization" aria-hidden="true" />
								<span className="font-semibold text-vscode-foreground">Shared with</span>
								<span>{selectedFile.sharedWith.join(", ")}</span>
							</div>
						)}
					</div>
					<div>
						<h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
							Tags
						</h4>
						<div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
							{selectedFile.tags.map((tag) => (
								<span
									key={tag}
									className="rounded-full border border-[color-mix(in_srgb,var(--vscode-panel-border)_40%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)] px-2 py-1 font-medium">
									{tag}
								</span>
							))}
						</div>
					</div>
					{showEditor && (
						<div className="flex flex-col gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_32%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] p-4">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="flex flex-col gap-1 text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
									<span className="text-sm font-semibold text-vscode-foreground">
										Document editing
									</span>
									<span>Open the full-page editor for a focused writing experience.</span>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									{docIsDirty && (
										<>
											<button
												type="button"
												onClick={() => handleFileSave(selectedFile.id)}
												disabled={docSaveState === "saving"}
												className={clsx(
													"inline-flex items-center gap-2 rounded-full border border-transparent bg-[linear-gradient(120deg,rgba(94,229,163,0.85),rgba(63,162,255,0.85))] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white shadow-[0_6px_14px_rgba(40,190,200,0.35)] transition",
													docSaveState !== "saving"
														? "hover:shadow-[0_10px_20px_rgba(40,190,200,0.45)]"
														: "opacity-40",
												)}>
												{docSaveState === "saving" ? "Saving…" : "Save changes"}
											</button>
											<button
												type="button"
												onClick={() => handleFileRevert(selectedFile.id)}
												disabled={docSaveState === "saving"}
												className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--vscode-panel-border)_45%,transparent)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition hover:border-[color-mix(in_srgb,var(--vscode-focusBorder)_55%,transparent)]">
												Discard
											</button>
										</>
									)}
									<button
										type="button"
										onClick={() => openEditor(selectedFile.id)}
										className="inline-flex items-center gap-2 rounded-full border border-transparent bg-[linear-gradient(120deg,rgba(88,123,255,0.85),rgba(124,88,255,0.85))] px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white shadow-[0_8px_16px_rgba(88,123,255,0.35)] transition hover:shadow-[0_12px_24px_rgba(88,123,255,0.45)]">
										<i className="codicon codicon-window" aria-hidden="true" />
										Open full editor
									</button>
								</div>
							</div>
							{docIsDirty ? (
								<span className="inline-flex items-center gap-2 text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
									<i className="codicon codicon-edit" aria-hidden="true" />
									Unsaved changes will carry into the full editor until you save or discard them.
								</span>
							) : docSaveState === "saved" ? (
								<span className="inline-flex items-center gap-2 text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
									<i className="codicon codicon-check" aria-hidden="true" />
									Changes are saved locally.
								</span>
							) : null}
						</div>
					)}
					<div>
						<h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
							Versions
						</h4>
						<ul className="mt-2 space-y-2 text-xs">
							{selectedFile.versions.map((version) => (
								<li
									key={version.id}
									className="flex items-center justify-between gap-3 rounded-lg border border-[color-mix(in_srgb,var(--vscode-panel-border)_35%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)] px-3 py-2">
									<span className="font-medium text-vscode-foreground">{version.label}</span>
									<span className="text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)]">
										{version.updatedAt} · {version.actor}
									</span>
								</li>
							))}
						</ul>
					</div>
					<div>
						<h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
							Recent activity
						</h4>
						<ul className="mt-2 space-y-2 text-xs">
							{selectedFile.activity.map((entry) => (
								<li
									key={entry.id}
									className="rounded-lg border border-[color-mix(in_srgb,var(--vscode-panel-border)_32%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] px-3 py-2">
									<span className="flex items-center gap-2 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)]">
										<i className="codicon codicon-comment-discussion" aria-hidden="true" />
										<span className="font-medium text-vscode-foreground">{entry.label}</span>
									</span>
									<span className="mt-1 block text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_65%,transparent)]">
										{entry.timestamp} · {entry.actor}
									</span>
								</li>
							))}
						</ul>
					</div>
				</div>
			)
		}

		if (selectedItem?.type === "folder" && selectedFolder) {
			return (
				<div className="mt-5 flex flex-col gap-6">
					<div className="space-y-3 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<h3 className="text-lg font-semibold text-vscode-foreground">{selectedFolder.title}</h3>
								<p className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)]">
									{selectedFolder.description}
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<button
									type="button"
									onClick={handleOpenSelectedFolder}
									className="rounded-xl border border-transparent bg-[linear-gradient(120deg,rgba(94,229,163,0.85),rgba(63,162,255,0.85))] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-[0_10px_24px_rgba(40,190,200,0.35)] transition hover:shadow-[0_12px_28px_rgba(40,190,200,0.45)]">
									{t("common:fileCabinet.openFolder", { defaultValue: "Open folder" }) as string}
								</button>
								<button
									type="button"
									onClick={handleCreateDocument}
									className="rounded-xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_45%,transparent)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-vscode-foreground transition hover:border-[color-mix(in_srgb,var(--vscode-focusBorder)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--vscode-focusBorder)_18%,transparent)]">
									New document
								</button>
							</div>
						</div>
						<div className="grid gap-3 rounded-xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_30%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] p-4 text-xs">
							<div className="flex items-center gap-2 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
								<i className="codicon codicon-folder" aria-hidden="true" />
								<span className="font-semibold text-vscode-foreground">Path</span>
								<span>{selectedFolder.path}</span>
							</div>
							<div className="flex items-center gap-2 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
								<i className="codicon codicon-organization" aria-hidden="true" />
								<span className="font-semibold text-vscode-foreground">Items</span>
								<span>{selectedFolder.itemCount}</span>
							</div>
							<div className="flex items-center gap-2 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
								<i className="codicon codicon-person" aria-hidden="true" />
								<span className="font-semibold text-vscode-foreground">Owner</span>
								<span>{selectedFolder.owner}</span>
							</div>
							<div className="flex items-center gap-2 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
								<i className="codicon codicon-account" aria-hidden="true" />
								<span className="font-semibold text-vscode-foreground">Collaborators</span>
								<span>{selectedFolder.collaborators.join(", ")}</span>
							</div>
							<div className="flex items-center gap-2 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
								<i className="codicon codicon-history" aria-hidden="true" />
								<span className="font-semibold text-vscode-foreground">Updated</span>
								<span>{selectedFolder.updatedAt}</span>
							</div>
						</div>
					</div>
					<div>
						<h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
							Tags
						</h4>
						<div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
							{selectedFolder.tags.map((tag) => (
								<span
									key={tag}
									className="rounded-full border border-[color-mix(in_srgb,var(--vscode-panel-border)_40%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)] px-2 py-1 font-medium">
									{tag}
								</span>
							))}
						</div>
					</div>
					<div>
						<h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
							Recent activity
						</h4>
						<ul className="mt-2 space-y-2 text-xs">
							{selectedFolder.activity.map((entry) => (
								<li
									key={entry.id}
									className="rounded-lg border border-[color-mix(in_srgb,var(--vscode-panel-border)_32%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] px-3 py-2">
									<span className="flex items-center gap-2 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)]">
										<i className="codicon codicon-comment-discussion" aria-hidden="true" />
										<span className="font-medium text-vscode-foreground">{entry.label}</span>
									</span>
									<span className="mt-1 block text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_65%,transparent)]">
										{entry.timestamp} · {entry.actor}
									</span>
								</li>
							))}
						</ul>
					</div>
				</div>
			)
		}

		if (selectedItem?.type === "deliverable" && selectedDeliverable) {
			return (
				<div className="mt-5 flex flex-col gap-6">
					<div className="space-y-3 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
						<div className="flex items-start justify-between gap-3">
							<div className="space-y-2">
								<h3 className="text-lg font-semibold text-vscode-foreground">
									{selectedDeliverable.title}
								</h3>
								<span
									className={clsx(
										"inline-flex items-center gap-2 rounded-full px-3 py-[5px] text-xs font-semibold uppercase tracking-wide",
										statusStyles[selectedDeliverable.status],
									)}>
									{statusLabels[selectedDeliverable.status]}
								</span>
								<p className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)]">
									{selectedDeliverable.dueDate}
								</p>
							</div>
							<button
								type="button"
								className="rounded-xl border border-transparent bg-[linear-gradient(120deg,rgba(94,229,163,0.85),rgba(63,162,255,0.85))] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-[0_10px_24px_rgba(40,190,200,0.35)] transition hover:shadow-[0_12px_28px_rgba(40,190,200,0.45)]">
								Open deliverable
							</button>
						</div>
						<p className="text-sm text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
							{selectedDeliverable.summary}
						</p>
						<p className="text-sm text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)]">
							{selectedDeliverable.description}
						</p>
					</div>
					<div className="grid gap-3 rounded-xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_30%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] p-4 text-xs">
						<div className="flex items-center gap-2 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
							<i className="codicon codicon-person" aria-hidden="true" />
							<span className="font-semibold text-vscode-foreground">Owner</span>
							<span>{selectedDeliverable.owner}</span>
						</div>
						<div className="flex items-center gap-2 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
							<i className="codicon codicon-comment-discussion" aria-hidden="true" />
							<span className="font-semibold text-vscode-foreground">Reviewer</span>
							<span>{selectedDeliverable.reviewer}</span>
						</div>
						<div className="flex items-center gap-2 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
							<i className="codicon codicon-symbol-event" aria-hidden="true" />
							<span className="font-semibold text-vscode-foreground">Linked action</span>
							<span>{selectedDeliverable.linkedAction}</span>
						</div>
					</div>
					<div>
						<h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
							Checkpoints
						</h4>
						<ul className="mt-2 space-y-2 text-xs">
							{selectedDeliverable.checkpoints.map((step) => (
								<li
									key={step}
									className="flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--vscode-panel-border)_35%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)] px-3 py-2">
									<i className="codicon codicon-check" aria-hidden="true" />
									<span className="font-medium text-vscode-foreground">{step}</span>
								</li>
							))}
						</ul>
					</div>
					<div>
						<h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
							Recent activity
						</h4>
						<ul className="mt-2 space-y-2 text-xs">
							{selectedDeliverable.activity.map((entry) => (
								<li
									key={entry.id}
									className="rounded-lg border border-[color-mix(in_srgb,var(--vscode-panel-border)_32%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] px-3 py-2">
									<span className="flex items-center gap-2 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)]">
										<i className="codicon codicon-comment-discussion" aria-hidden="true" />
										<span className="font-medium text-vscode-foreground">{entry.label}</span>
									</span>
									<span className="mt-1 block text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_65%,transparent)]">
										{entry.timestamp} · {entry.actor}
									</span>
								</li>
							))}
						</ul>
					</div>
				</div>
			)
		}

		return (
			<div className="mt-4 space-y-3">
				<p className="text-base font-semibold text-vscode-foreground">
					Select a deliverable, folder, or file to preview details.
				</p>
				<p>
					This panel shows metadata, recent activity, and inline previews for any file or folder you
					highlight.
				</p>
			</div>
		)
	}, [
		selectedDeliverable,
		selectedFile,
		selectedFolder,
		selectedItem,
		fileDraftContent,
		fileSaveStatus,
		fileSavedContent,
		selectedFilePreview,
		selectedFilePreviewError,
		selectedFilePreviewIsLoading,
		handleCreateDocument,
		handleFileRevert,
		handleFileSave,
		handleOpenInEditor,
		handleOpenSelectedFolder,
		openEditor,
		t,
	])

	const totalDeliverables = DELIVERABLES.length
	const totalFolders = folderCards.length
	const totalRecentFiles = recentFiles.length
	const categoryNoticeMap: Record<string, string | undefined> = {
		tags: "Tag-based library views are on the roadmap. For now, use search and filters to jump to the files you need.",
		approvals:
			"Approvals will surface a consolidated review queue soon. Track pending deliverables in the lane below for now.",
	}
	const categoryNotice = categoryNoticeMap[activeCategory]

	const isDeliverablesActive = activeCategory === "deliverables" || activeCategory === "approvals"
	const isFoldersActive = activeCategory === "folders"
	const isRecentActive = activeCategory === "tags"
	const recentCutoff = useMemo(() => Date.now() - 7 * 24 * 60 * 60 * 1000, [])
	const workspaceViewCounts = useMemo(() => {
		const recentCount = searchFilteredFiles.filter((file) => {
			const updatedTime = Date.parse(file.updatedAtIso)
			return !Number.isNaN(updatedTime) && updatedTime >= recentCutoff
		}).length
		const sharedCount = searchFilteredFiles.filter((file) => file.sharedWith.length > 0).length
		const favoritesCount = searchFilteredFiles.filter((file) => Boolean(file.favorited)).length
		return {
			all: searchFilteredFiles.length,
			recent: recentCount,
			shared: sharedCount,
			favorites: favoritesCount,
		}
	}, [recentCutoff, searchFilteredFiles])
	const metrics = useMemo<MetricPill[]>(() => {
		const totalFiles = recentFiles.length
		const favoritesTotal = recentFiles.filter((file) => file.favorited).length
		const updates24h = recentFiles.filter((file) => {
			const updatedTime = Date.parse(file.updatedAtIso)
			if (Number.isNaN(updatedTime)) return false
			return updatedTime >= Date.now() - 24 * 60 * 60 * 1000
		}).length
		const reviewQueueTotal = DELIVERABLES.filter((deliverable) => deliverable.status !== "approved").length
		const monthApproved = DELIVERABLES.filter((deliverable) => {
			if (deliverable.status !== "approved") return false
			const date = Date.parse(deliverable.dueDateIso)
			if (Number.isNaN(date)) return false
			const now = new Date()
			return new Date(date).getMonth() === now.getMonth() && new Date(date).getFullYear() === now.getFullYear()
		}).length
		const totalFolderSizeMB = folderCards.reduce((sum, folder) => sum + parseSizeToMB(folder.sizeLabel), 0)
		const totalFileSizeMB = recentFiles.reduce((sum, file) => sum + parseSizeToMB(file.size), 0)
		const totalSizeMB = totalFolderSizeMB + totalFileSizeMB
		const totalSizeGB = totalSizeMB / 1024
		const reviewDelta = reviewQueueTotal ? `Includes ${reviewQueueTotal} pending` : "All clear"

		return METRIC_SKINS.map((skin) => {
			switch (skin.id) {
				case "total-files":
					return {
						...skin,
						value: formatNumber(totalFiles),
						delta: favoritesTotal ? `${favoritesTotal} favorites` : undefined,
					}
				case "recent-updates":
					return {
						...skin,
						value: formatNumber(updates24h),
						delta: updates24h ? "Tracked past 24 hours" : "No changes today",
					}
				case "storage":
					return {
						...skin,
						value: `${totalSizeGB >= 1 ? totalSizeGB.toFixed(1) : Math.max(totalSizeMB / 1024, 0.1).toFixed(1)} GB`,
						delta: `${folderCards.length} folders + quick files`,
					}
				case "review-queue":
					return {
						...skin,
						value: formatNumber(reviewQueueTotal),
						delta: reviewQueueTotal ? reviewDelta : `${monthApproved} approved this month`,
					}
				default:
					return {
						...skin,
						value: "-",
					}
			}
		})
	}, [folderCards, recentFiles])

	const activeFilterChips = useMemo(() => {
		const chips: Array<{ id: string; label: string; onRemove: () => void }> = []
		if (hasSearchQuery) {
			chips.push({
				id: "search",
				label: `Search: “${trimmedSearchQuery}”`,
				onRemove: handleClearSearch,
			})
		}
		if (activeView !== "all") {
			const viewLabel = WORKSPACE_VIEWS.find((view) => view.id === activeView)?.label ?? "All"
			chips.push({ id: "view", label: `View: ${viewLabel}`, onRemove: handleResetView })
		}
		if (recentFilter !== "all") {
			const typeLabel = RECENT_FILE_FILTERS.find((filter) => filter.id === recentFilter)?.label ?? "All"
			chips.push({ id: "type", label: `Type: ${typeLabel}`, onRemove: handleResetTypeFilter })
		}
		if (sortOption !== "newest") {
			const sortLabel = SORT_OPTIONS.find((option) => option.id === sortOption)?.label ?? "Newest"
			chips.push({ id: "sort", label: `Sort: ${sortLabel}`, onRemove: handleResetSort })
		}
		if (activeCategory !== "deliverables") {
			const categoryLabel =
				LIBRARY_CATEGORIES.find((category) => category.id === activeCategory)?.label ?? "Deliverables"
			chips.push({ id: "category", label: `Category: ${categoryLabel}`, onRemove: handleResetCategory })
		}
		return chips
	}, [
		activeCategory,
		activeView,
		handleClearSearch,
		handleResetCategory,
		handleResetSort,
		handleResetTypeFilter,
		handleResetView,
		hasSearchQuery,
		recentFilter,
		sortOption,
		trimmedSearchQuery,
	])

	const title = t("common:fileCabinet.title", { defaultValue: "File Cabinet" }) as string
	const subtitle = t("common:fileCabinet.subtitle", {
		defaultValue: "Browse every artifact, deliverable, and resource without digging through folders.",
	}) as string

	const filteredRecentFiles = useMemo(() => {
		const matchesView = (file: RecentFileRow) => {
			switch (activeView) {
				case "favorites":
					return Boolean(file.favorited)
				case "shared":
					return file.sharedWith.length > 0
				case "recent": {
					const updatedTime = Date.parse(file.updatedAtIso)
					if (Number.isNaN(updatedTime)) return false
					const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
					return updatedTime >= sevenDaysAgo
				}
				case "all":
				default:
					return true
			}
		}

		const filtered = searchFilteredFiles.filter(matchesView)
		const sorted = [...filtered]

		switch (sortOption) {
			case "name":
				sorted.sort((a, b) => a.title.localeCompare(b.title))
				break
			case "owner":
				sorted.sort((a, b) => a.owner.localeCompare(b.owner))
				break
			case "newest":
			default:
				sorted.sort((a, b) => Date.parse(b.updatedAtIso) - Date.parse(a.updatedAtIso))
				break
		}

		return sorted
	}, [activeView, searchFilteredFiles, sortOption])

	const searchSummaryCounts = useMemo(
		() => ({
			deliverables: filteredDeliverables.length,
			folders: filteredFolders.length,
			files: filteredRecentFiles.length,
		}),
		[filteredDeliverables, filteredFolders, filteredRecentFiles],
	)

	useEffect(() => {
		const isCurrentVisible = (item: SelectionTarget | null) => {
			if (!item) return false
			switch (item.type) {
				case "file":
					return filteredRecentFiles.some((file) => file.id === item.id)
				case "folder":
					return filteredFolders.some((folder) => folder.id === item.id)
				case "deliverable":
					return filteredDeliverables.some((deliverable) => deliverable.id === item.id)
				default:
					return false
			}
		}

		if (isCurrentVisible(selectedItem)) {
			return
		}

		const nextSelection = filteredRecentFiles[0]
			? ({ type: "file", id: filteredRecentFiles[0].id } as SelectionTarget)
			: filteredDeliverables[0]
				? ({ type: "deliverable", id: filteredDeliverables[0].id } as SelectionTarget)
				: filteredFolders[0]
					? ({ type: "folder", id: filteredFolders[0].id } as SelectionTarget)
					: null

		setSelectedItem(nextSelection)
	}, [filteredDeliverables, filteredFolders, filteredRecentFiles, selectedItem])

	return (
		<div
			data-testid="file-cabinet-view"
			className={clsx(
				"fixed inset-0 flex flex-col bg-[linear-gradient(135deg,rgba(19,21,36,0.9),rgba(28,30,45,0.92))] text-vscode-editor-foreground",
				isHidden && "hidden",
			)}>
			<div className="flex flex-1 overflow-hidden">
				<aside className="hidden w-72 shrink-0 border-r border-[color-mix(in_srgb,var(--vscode-panel-border)_40%,transparent)] bg-[rgba(20,22,34,0.6)] backdrop-blur lg:block">
					<div className="sticky top-0 flex h-full flex-col gap-6 overflow-y-auto p-6">
						<div>
							<h2 className="text-xs font-semibold uppercase tracking-wider text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
								Workspace Views
							</h2>
							<div className="mt-3 flex flex-col gap-2">
								{WORKSPACE_VIEWS.map((view) => {
									const isActive = activeView === view.id
									const viewCount =
										workspaceViewCounts[view.id as keyof typeof workspaceViewCounts] ?? 0
									return (
										<button
											type="button"
											key={view.id}
											onClick={() => setActiveView(view.id)}
											className={clsx(
												"group flex flex-col gap-1 rounded-lg border border-transparent px-3 py-2 text-left transition",
												isActive
													? "bg-[color-mix(in_srgb,var(--vscode-focusBorder)_18%,transparent)] border-[color-mix(in_srgb,var(--vscode-focusBorder)_35%,transparent)] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
													: "hover:border-[color-mix(in_srgb,var(--vscode-panel-border)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)]",
											)}
											aria-pressed={isActive}>
											<span className="flex items-center gap-2 text-sm font-medium text-vscode-foreground">
												<i
													className={clsx("codicon text-base", view.icon)}
													aria-hidden="true"
												/>
												{view.label}
												{viewCount > 0 && (
													<span className="ml-auto inline-flex items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--vscode-focusBorder)_18%,transparent)] px-2 py-[2px] text-[11px] font-semibold">
														{viewCount}
													</span>
												)}
											</span>
											<span className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
												{view.description}
											</span>
										</button>
									)
								})}
							</div>
						</div>

						<div>
							<h2 className="text-xs font-semibold uppercase tracking-wider text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
								Library
							</h2>
							<div className="mt-3 flex flex-col gap-2">
								{LIBRARY_CATEGORIES.map((category) => {
									const isActive = activeCategory === category.id
									return (
										<button
											type="button"
											key={category.id}
											onClick={() => setActiveCategory(category.id)}
											className={clsx(
												"group flex items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition",
												isActive
													? "bg-[color-mix(in_srgb,var(--vscode-focusBorder)_16%,transparent)] border-[color-mix(in_srgb,var(--vscode-focusBorder)_30%,transparent)]"
													: "hover:border-[color-mix(in_srgb,var(--vscode-panel-border)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)]",
											)}
											aria-pressed={isActive}>
											<span className="flex flex-col">
												<span className="flex items-center gap-2 text-sm font-medium text-vscode-foreground">
													<i
														className={clsx("codicon text-base", category.icon)}
														aria-hidden="true"
													/>
													{category.label}
												</span>
												<span className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
													{category.description}
												</span>
											</span>
											<i
												className="codicon codicon-chevron-right text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_65%,transparent)]"
												aria-hidden="true"
											/>
										</button>
									)
								})}
							</div>
						</div>
						<div className="rounded-xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_35%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] p-4 text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
							<strong className="block text-sm font-semibold text-vscode-foreground">Tip</strong>
							<span className="mt-1 block">
								Press{" "}
								<kbd className="rounded bg-[color-mix(in_srgb,var(--vscode-editor-background)_70%,transparent)] px-1 py-[1px] text-[11px]">
									⌘
								</kbd>
								<kbd className="ml-1 rounded bg-[color-mix(in_srgb,var(--vscode-editor-background)_70%,transparent)] px-1 py-[1px] text-[11px]">
									K
								</kbd>{" "}
								to jump between filters once the command palette ships.
							</span>
						</div>
					</div>
				</aside>

				<main className="flex-1 overflow-y-auto">
					<div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-8 md:px-10">
						<section className="flex flex-col gap-6 rounded-3xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_35%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] p-6 shadow-[0_15px_40px_rgba(12,16,30,0.35)] lg:p-8">
							<div className="flex flex-wrap items-center gap-3 text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
								<span className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--vscode-focusBorder)_35%,transparent)] bg-[color-mix(in_srgb,var(--vscode-focusBorder)_18%,transparent)] px-3 py-1 font-semibold text-[11px] tracking-wide uppercase text-vscode-foreground">
									<i className="codicon codicon-home" aria-hidden="true" />
									{companyName}
								</span>
								<span
									className="h-1 w-1 rounded-full bg-[color-mix(in_srgb,var(--vscode-descriptionForeground)_55%,transparent)]"
									aria-hidden="true"
								/>
								<span>Golden Workplace · Files</span>
							</div>
							<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
								<div className="max-w-xl space-y-2">
									<h1 className="text-3xl font-semibold tracking-tight text-vscode-foreground lg:text-4xl">
										{title}
									</h1>
									<p className="text-sm text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
										{subtitle}
									</p>
								</div>
								<div className="flex w-full flex-col gap-3 text-sm text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)] sm:flex-row sm:items-center sm:justify-end">
									<label className="relative flex-1 text-sm sm:max-w-sm">
										<span className="sr-only">Search files</span>
										<i
											className="codicon codicon-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]"
											aria-hidden="true"
										/>
										<input
											type="search"
											placeholder="Search by name, tag, owner"
											autoComplete="off"
											value={searchQuery}
											onChange={handleSearchChange}
											onKeyDown={handleSearchKeyDown}
											ref={searchInputRef}
											className="w-full rounded-xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_45%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_95%,transparent)] py-2 pl-10 pr-12 text-sm font-medium text-vscode-foreground outline-none transition focus:border-[color-mix(in_srgb,var(--vscode-focusBorder)_80%,transparent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--vscode-focusBorder)_55%,transparent)]"
										/>
										{hasSearchQuery && (
											<button
												type="button"
												onClick={handleClearSearch}
												className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)] transition hover:text-vscode-foreground">
												<span className="sr-only">Clear search</span>
												<i className="codicon codicon-close" aria-hidden="true" />
											</button>
										)}
									</label>
									<div className="flex items-center gap-2">
										<details className="relative">
											<summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_45%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)] px-4 py-2 text-sm font-medium text-vscode-foreground shadow-[0_2px_8px_rgba(10,14,28,0.35)] transition hover:border-[color-mix(in_srgb,var(--vscode-focusBorder)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)]">
												<i className="codicon codicon-add" aria-hidden="true" />
												New
											</summary>
											<div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_35%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)] shadow-[0_18px_45px_rgba(10,12,24,0.55)]">
												<ul className="flex flex-col divide-y divide-[color-mix(in_srgb,var(--vscode-panel-border)_35%,transparent)]">
													{NEW_MENU_ITEMS.map((item) => (
														<li key={item.id}>
															<button
																type="button"
																className="flex w-full flex-col items-start gap-1 px-4 py-3 text-left text-sm transition hover:bg-[color-mix(in_srgb,var(--vscode-focusBorder)_12%,transparent)]">
																<span className="font-medium text-vscode-foreground">
																	{item.label}
																</span>
																<span className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)]">
																	{item.hint}
																</span>
															</button>
														</li>
													))}
												</ul>
											</div>
										</details>
										<button
											type="button"
											className="flex items-center gap-2 rounded-xl border border-transparent bg-[linear-gradient(120deg,rgba(88,123,255,0.85),rgba(124,88,255,0.85))] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_25px_rgba(49,82,255,0.35)] transition hover:shadow-[0_14px_30px_rgba(49,82,255,0.45)]">
											<i className="codicon codicon-cloud-upload" aria-hidden="true" />
											Upload
										</button>
									</div>
								</div>
							</div>
							<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
								{metrics.map((metric) => (
									<div
										key={metric.id}
										className={clsx(
											"flex flex-col gap-1 rounded-2xl p-4 text-sm text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)] transition",
											metric.accent,
										)}>
										<span className="flex items-center justify-between text-xs uppercase tracking-wide text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_65%,transparent)]">
											{metric.label}
											<i className={clsx("codicon text-base", metric.icon)} aria-hidden="true" />
										</span>
										<span className="text-2xl font-semibold text-vscode-foreground">
											{metric.value}
										</span>
										{metric.delta && (
											<span className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
												{metric.delta}
											</span>
										)}
									</div>
								))}
							</div>

							{hasSearchQuery && (
								<div className="rounded-2xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_35%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)] p-4 text-sm text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
									<p className="flex flex-wrap items-center gap-2 text-vscode-foreground">
										<span className="inline-flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--vscode-focusBorder)_18%,transparent)] px-3 py-1 text-xs font-semibold uppercase tracking-wide">
											Search
										</span>
										“{trimmedSearchQuery}” matched
										<strong className="text-vscode-foreground">
											{searchSummaryCounts.deliverables}
										</strong>{" "}
										deliverables,
										<strong className="text-vscode-foreground">
											{searchSummaryCounts.folders}
										</strong>{" "}
										folders, and
										<strong className="text-vscode-foreground">
											{searchSummaryCounts.files}
										</strong>{" "}
										files.
									</p>
								</div>
							)}
						</section>

						{categoryNotice && (
							<div className="rounded-2xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_35%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)] p-4 text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
								<p className="flex items-center gap-2 text-sm text-vscode-foreground">
									<i className="codicon codicon-lightbulb" aria-hidden="true" />
									<span>{categoryNotice}</span>
								</p>
							</div>
						)}

						<section aria-labelledby="featured-collections" className="space-y-4">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<h2
									id="featured-collections"
									className="text-sm font-semibold uppercase tracking-[0.25em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
									Featured Collections
								</h2>
								<button
									type="button"
									className="text-xs font-medium text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)] underline-offset-4 transition hover:text-vscode-foreground hover:underline">
									View library
								</button>
							</div>
							<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
								{FEATURED_COLLECTIONS.map((collection) => (
									<article
										key={collection.id}
										className="group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_32%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] p-5 shadow-[0_12px_28px_rgba(8,12,24,0.35)] transition hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--vscode-focusBorder)_38%,transparent)] hover:shadow-[0_18px_40px_rgba(12,18,40,0.45)]">
										<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--vscode-focusBorder)_20%,transparent)] text-lg text-vscode-foreground">
											<i className={clsx("codicon", collection.icon)} aria-hidden="true" />
										</span>
										<div className="mt-4 space-y-2 text-sm text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
											<h3 className="text-lg font-semibold text-vscode-foreground">
												{collection.title}
											</h3>
											<p>{collection.description}</p>
										</div>
										<button
											type="button"
											className="mt-5 inline-flex items-center gap-2 self-start rounded-full border border-[color-mix(in_srgb,var(--vscode-focusBorder)_35%,transparent)] bg-[color-mix(in_srgb,var(--vscode-focusBorder)_18%,transparent)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-vscode-foreground transition group-hover:border-[color-mix(in_srgb,var(--vscode-focusBorder)_55%,transparent)]">
											Connect
											<i className="codicon codicon-arrow-right" aria-hidden="true" />
										</button>
									</article>
								))}
							</div>
						</section>

						<section
							aria-labelledby="deliverables-lane"
							ref={deliverablesSectionRef}
							className={clsx(
								"space-y-4",
								isDeliverablesActive &&
									"ring-1 ring-[color-mix(in_srgb,var(--vscode-focusBorder)_45%,transparent)] ring-offset-1 ring-offset-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)]",
							)}>
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<h2
										id="deliverables-lane"
										className="text-sm font-semibold uppercase tracking-[0.25em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
										Deliverables
									</h2>
									<p className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
										Action-ready outputs with reviewer assignments.
									</p>
									{hasSearchQuery && (
										<p className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_65%,transparent)]">
											Showing {filteredDeliverables.length} of {totalDeliverables} deliverables
										</p>
									)}
								</div>
								<button
									type="button"
									className="text-xs font-medium text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)] underline-offset-4 transition hover:text-vscode-foreground hover:underline">
									Open review queue
								</button>
							</div>
							<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
								{filteredDeliverables.length === 0 ? (
									<div className="col-span-full rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--vscode-panel-border)_35%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] p-8 text-center text-sm text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)]">
										No deliverables match{" "}
										{trimmedSearchQuery ? `“${trimmedSearchQuery}”` : "the current filters"}.
									</div>
								) : (
									filteredDeliverables.map((deliverable) => {
										const isSelected =
											selectedItem?.type === "deliverable" && selectedItem.id === deliverable.id
										return (
											<article
												key={deliverable.id}
												tabIndex={0}
												role="button"
												data-selected={isSelected ? "true" : undefined}
												onClick={() => selectItem({ type: "deliverable", id: deliverable.id })}
												onKeyDown={(event) => {
													if (event.key === "Enter" || event.key === " ") {
														event.preventDefault()
														selectItem({ type: "deliverable", id: deliverable.id })
													}
												}}
												aria-selected={isSelected}
												className={clsx(
													"flex h-full flex-col justify-between rounded-2xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_35%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] p-5 shadow-[0_14px_30px_rgba(10,14,26,0.4)] transition focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--vscode-focusBorder)_55%,transparent)]",
													isSelected
														? "border-[color-mix(in_srgb,var(--vscode-focusBorder)_60%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_82%,transparent)] shadow-[0_18px_32px_rgba(14,18,30,0.45)]"
														: "hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--vscode-focusBorder)_45%,transparent)]",
												)}>
												<div className="flex items-start justify-between gap-3">
													<div className="space-y-2">
														<h3 className="text-lg font-semibold text-vscode-foreground">
															{deliverable.title}
														</h3>
														<span
															className={clsx(
																"inline-flex items-center gap-2 rounded-full px-3 py-[5px] text-xs font-semibold uppercase tracking-wide",
																statusStyles[deliverable.status],
															)}>
															{statusLabels[deliverable.status]}
														</span>
														<p className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
															{deliverable.dueDate}
														</p>
														<p className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)]">
															{deliverable.summary}
														</p>
													</div>
													<button
														type="button"
														className="rounded-full border border-[color-mix(in_srgb,var(--vscode-panel-border)_40%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] p-2 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)] transition hover:border-[color-mix(in_srgb,var(--vscode-focusBorder)_45%,transparent)] hover:text-vscode-foreground"
														aria-label="Open quick actions">
														<i className="codicon codicon-ellipsis" aria-hidden="true" />
													</button>
												</div>
												<div className="mt-4 flex flex-col gap-2 text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
													<span className="flex items-center gap-2">
														<i className="codicon codicon-person" aria-hidden="true" />
														Owner · {deliverable.owner}
													</span>
													<span className="flex items-center gap-2">
														<i
															className="codicon codicon-comment-discussion"
															aria-hidden="true"
														/>
														Reviewer · {deliverable.reviewer}
													</span>
												</div>
												<button
													type="button"
													className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-transparent bg-[linear-gradient(120deg,rgba(94,229,163,0.85),rgba(63,162,255,0.85))] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_25px_rgba(40,190,200,0.35)] transition hover:shadow-[0_16px_32px_rgba(40,190,200,0.45)]">
													{deliverable.actionLinkLabel}
													<i className="codicon codicon-arrow-right" aria-hidden="true" />
												</button>
											</article>
										)
									})
								)}
							</div>
						</section>

						<section
							aria-labelledby="folders-section"
							ref={foldersSectionRef}
							className={clsx(
								"space-y-4",
								isFoldersActive &&
									"ring-1 ring-[color-mix(in_srgb,var(--vscode-focusBorder)_45%,transparent)] ring-offset-1 ring-offset-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)]",
							)}>
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<h2
										id="folders-section"
										className="text-sm font-semibold uppercase tracking-[0.25em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
										Folders
									</h2>
									<p className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
										Team libraries, shortcuts, and shared archives.
									</p>
									{hasSearchQuery && (
										<p className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_65%,transparent)]">
											Showing {filteredFolders.length} of {totalFolders} folders
										</p>
									)}
								</div>
								<Popover open={isCreateFolderOpen} onOpenChange={handleCreateFolderOpenChange}>
									<PopoverTrigger asChild>
										<button
											type="button"
											disabled={isFileCabinetLoading}
											className="flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--vscode-panel-border)_45%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-vscode-foreground transition hover:border-[color-mix(in_srgb,var(--vscode-focusBorder)_48%,transparent)] disabled:opacity-60">
											<i className="codicon codicon-folder" aria-hidden="true" />
											{
												t("common:fileCabinet.newFolderButton", {
													defaultValue: "New folder",
												}) as string
											}
										</button>
									</PopoverTrigger>
									<PopoverContent align="end" className="w-72 p-4 space-y-3">
										<form className="space-y-3" onSubmit={handleNewFolderFormSubmit}>
											<label
												htmlFor="file-cabinet-new-folder"
												className="text-xs font-semibold uppercase tracking-wide text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
												{
													t("common:fileCabinet.newFolderPrompt", {
														defaultValue: "Name your new folder",
													}) as string
												}
											</label>
											<Input
												id="file-cabinet-new-folder"
												ref={newFolderInputRef}
												value={newFolderName}
												onChange={handleNewFolderNameChange}
												placeholder={
													t("common:fileCabinet.newFolderPrompt", {
														defaultValue: "Name your new folder",
													}) as string
												}
												autoComplete="off"
												onKeyDown={(event) => {
													if (event.key === "Escape") {
														event.preventDefault()
														handleCreateFolderOpenChange(false)
													}
												}}
											/>
											{newFolderError ? (
												<p className="text-xs text-amber-300">{newFolderError}</p>
											) : null}
											<div className="flex justify-end gap-2">
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() => handleCreateFolderOpenChange(false)}>
													{t("common:cancel", { defaultValue: "Cancel" }) as string}
												</Button>
												<Button type="submit" size="sm" disabled={isFileCabinetLoading}>
													{
														t("common:fileCabinet.newFolderCreateAction", {
															defaultValue: "Create folder",
														}) as string
													}
												</Button>
											</div>
										</form>
									</PopoverContent>
								</Popover>
								{fileCabinetError && (
									<p className="w-full text-xs text-amber-300 lg:w-auto" role="status">
										{fileCabinetError}
									</p>
								)}
								{!fileCabinetError && isFileCabinetLoading && (
									<p
										className="w-full text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)] lg:w-auto"
										role="status">
										Syncing workspace folders…
									</p>
								)}
							</div>
							<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
								{filteredFolders.length === 0 ? (
									<div className="col-span-full rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--vscode-panel-border)_35%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] p-8 text-center text-sm text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)]">
										No folders match{" "}
										{trimmedSearchQuery ? `“${trimmedSearchQuery}”` : "the current filters"}.
									</div>
								) : (
									filteredFolders.map((folder) => {
										const isSelected =
											selectedItem?.type === "folder" && selectedItem.id === folder.id
										return (
											<article
												key={folder.id}
												tabIndex={0}
												role="button"
												data-selected={isSelected ? "true" : undefined}
												onClick={() => selectItem({ type: "folder", id: folder.id })}
												onKeyDown={(event) => {
													if (event.key === "Enter" || event.key === " ") {
														event.preventDefault()
														selectItem({ type: "folder", id: folder.id })
													}
												}}
												aria-selected={isSelected}
												className={clsx(
													"group flex h-full flex-col justify-between rounded-2xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_32%,transparent)] bg-[radial-gradient(circle_at_top_right,rgba(108,120,255,0.12),transparent_60%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)] p-5 shadow-[0_12px_25px_rgba(10,14,28,0.35)] transition focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--vscode-focusBorder)_55%,transparent)]",
													isSelected
														? "border-[color-mix(in_srgb,var(--vscode-focusBorder)_55%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_84%,transparent)] shadow-[0_16px_28px_rgba(12,16,30,0.45)]"
														: "hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--vscode-focusBorder)_45%,transparent)]",
												)}>
												<div className="flex items-start justify-between">
													<div className="space-y-2">
														<span className="inline-flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--vscode-focusBorder)_15%,transparent)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-vscode-foreground">
															<i className="codicon codicon-folder" aria-hidden="true" />
															{folder.sizeLabel}
														</span>
														<h3 className="text-lg font-semibold text-vscode-foreground">
															{folder.title}
														</h3>
														<p className="text-sm text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
															{folder.description}
														</p>
													</div>
													<button
														type="button"
														className="rounded-full border border-[color-mix(in_srgb,var(--vscode-panel-border)_40%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] p-2 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)] transition hover:border-[color-mix(in_srgb,var(--vscode-focusBorder)_45%,transparent)] hover:text-vscode-foreground"
														aria-label="Favorite folder">
														<i className="codicon codicon-star" aria-hidden="true" />
													</button>
												</div>
												<p className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
													{folder.itemCount} items · {folder.path}
												</p>
												<div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)]">
													{folder.tags.map((tag) => (
														<span
															key={tag}
															className="rounded-full border border-[color-mix(in_srgb,var(--vscode-panel-border)_45%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] px-2 py-1 text-[11px] font-medium">
															{tag}
														</span>
													))}
												</div>
												<div className="mt-4 flex flex-col gap-1 text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)]">
													<span className="flex items-center gap-2">
														<i className="codicon codicon-person" aria-hidden="true" />
														Owner · {folder.owner}
													</span>
													<span className="flex items-center gap-2">
														<i className="codicon codicon-history" aria-hidden="true" />
														{folder.updatedAt}
													</span>
													<span className="flex items-center gap-2">
														<i className="codicon codicon-account" aria-hidden="true" />
														Collaborators · {folder.collaborators.join(", ")}
													</span>
												</div>
											</article>
										)
									})
								)}
							</div>
						</section>

						<section
							aria-labelledby="recent-files"
							ref={recentFilesSectionRef}
							className={clsx(
								"space-y-4",
								isRecentActive &&
									"ring-1 ring-[color-mix(in_srgb,var(--vscode-focusBorder)_45%,transparent)] ring-offset-1 ring-offset-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)]",
							)}>
							<div className="flex flex-wrap items-center justify-between gap-4">
								<div>
									<h2
										id="recent-files"
										className="text-sm font-semibold uppercase tracking-[0.25em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
										Recent Files
									</h2>
									<p className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
										Switch views, filter by type, and triage inline.
									</p>
									{hasSearchQuery && (
										<p className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_65%,transparent)]">
											Showing {filteredRecentFiles.length} of {totalRecentFiles} files
										</p>
									)}
								</div>
								<div className="flex flex-wrap items-center gap-3 text-xs">
									<div className="flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--vscode-panel-border)_40%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] px-3 py-2">
										<span className="text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
											Sort
										</span>
										<select
											value={sortOption}
											onChange={(event) => setSortOption(event.target.value)}
											className="rounded-md border border-transparent bg-transparent text-sm font-medium text-vscode-foreground outline-none focus:border-[color-mix(in_srgb,var(--vscode-focusBorder)_45%,transparent)]">
											{SORT_OPTIONS.map((option) => (
												<option
													key={option.id}
													value={option.id}
													className="bg-[color-mix(in_srgb,var(--vscode-editor-background)_95%,transparent)]">
													{option.label}
												</option>
											))}
										</select>
									</div>
									<div className="flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--vscode-panel-border)_40%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] p-1">
										{VIEW_TOGGLES.map((toggle) => {
											const isActive = recentViewMode === toggle.id
											return (
												<button
													type="button"
													key={toggle.id}
													onClick={() => setRecentViewMode(toggle.id)}
													className={clsx(
														"flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition",
														isActive
															? "bg-[color-mix(in_srgb,var(--vscode-focusBorder)_35%,transparent)] text-vscode-foreground"
															: "text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)] hover:text-vscode-foreground",
													)}
													aria-pressed={isActive}>
													<i className={clsx("codicon", toggle.icon)} aria-hidden="true" />
													{toggle.label}
												</button>
											)
										})}
									</div>
								</div>
							</div>
							<div className="flex flex-wrap gap-2">
								{RECENT_FILE_FILTERS.map((filter) => {
									const isActive = recentFilter === filter.id
									return (
										<button
											type="button"
											key={filter.id}
											onClick={() => setRecentFilter(filter.id)}
											className={clsx(
												"rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition",
												isActive
													? "border-[color-mix(in_srgb,var(--vscode-focusBorder)_45%,transparent)] bg-[color-mix(in_srgb,var(--vscode-focusBorder)_20%,transparent)] text-vscode-foreground"
													: "border-[color-mix(in_srgb,var(--vscode-panel-border)_40%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)] hover:text-vscode-foreground",
											)}
											aria-pressed={isActive}>
											{filter.label}
										</button>
									)
								})}
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<button
									type="button"
									onClick={handleResetFilters}
									disabled={isDefaultFilters}
									className={clsx(
										"inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition",
										isDefaultFilters
											? "cursor-not-allowed border-[color-mix(in_srgb,var(--vscode-panel-border)_35%,transparent)] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_60%,transparent)]"
											: "border-[color-mix(in_srgb,var(--vscode-panel-border)_45%,transparent)] text-vscode-foreground hover:border-[color-mix(in_srgb,var(--vscode-focusBorder)_55%,transparent)]",
									)}>
									<i className="codicon codicon-refresh" aria-hidden="true" />
									Reset filters
								</button>
								{hasSearchQuery && (
									<span className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
										Press{" "}
										<kbd className="rounded bg-[color-mix(in_srgb,var(--vscode-editor-background)_70%,transparent)] px-1 py-[1px] text-[11px]">
											Esc
										</kbd>{" "}
										to clear search
									</span>
								)}
							</div>
							{activeFilterChips.length > 0 && (
								<div className="flex flex-wrap items-center gap-2 text-xs">
									{activeFilterChips.map((chip) => (
										<button
											key={chip.id}
											onClick={chip.onRemove}
											className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--vscode-panel-border)_45%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)] px-3 py-1 font-semibold uppercase tracking-wide text-vscode-foreground transition hover:border-[color-mix(in_srgb,var(--vscode-focusBorder)_55%,transparent)]">
											<span>{chip.label}</span>
											<i className="codicon codicon-close" aria-hidden="true" />
										</button>
									))}
								</div>
							)}

							<div
								className={clsx(
									"grid gap-4",
									recentViewMode === "grid" ? "sm:grid-cols-2 xl:grid-cols-3" : "",
								)}>
								{filteredRecentFiles.length === 0 ? (
									<div className="col-span-full rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--vscode-panel-border)_35%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] p-10 text-center text-sm text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)]">
										No files match{" "}
										{hasSearchQuery ? `“${trimmedSearchQuery}”` : "the current filters"}. Try
										switching the type filter or clearing sort.
									</div>
								) : (
									filteredRecentFiles.map((file) => {
										const isSelected = selectedItem?.type === "file" && selectedItem.id === file.id
										return (
											<article
												key={file.id}
												tabIndex={0}
												role="button"
												data-selected={isSelected ? "true" : undefined}
												onClick={() => selectItem({ type: "file", id: file.id })}
												onKeyDown={(event) => {
													if (event.key === "Enter" || event.key === " ") {
														event.preventDefault()
														selectItem({ type: "file", id: file.id })
													}
												}}
												aria-selected={isSelected}
												className={clsx(
													"flex flex-col gap-4 rounded-2xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_35%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)] p-4 shadow-[0_12px_26px_rgba(12,16,32,0.35)] transition focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--vscode-focusBorder)_55%,transparent)]",
													recentViewMode === "list" &&
														"sm:flex-row sm:items-center sm:justify-between sm:gap-6",
													isSelected
														? "border-[color-mix(in_srgb,var(--vscode-focusBorder)_65%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_85%,transparent)] shadow-[0_16px_34px_rgba(18,22,40,0.45)]"
														: "hover:border-[color-mix(in_srgb,var(--vscode-focusBorder)_45%,transparent)]",
												)}>
												<div className="flex flex-1 items-start gap-3">
													<div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_45%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_85%,transparent)] text-lg text-vscode-foreground">
														<i
															className={clsx("codicon", FILE_TYPE_ICON[file.type])}
															aria-hidden="true"
														/>
													</div>
													<div className="space-y-2">
														<div className="flex flex-wrap items-center gap-2">
															<h3 className="text-base font-semibold text-vscode-foreground">
																{file.title}
															</h3>
															{file.favorited && (
																<i
																	className="codicon codicon-star-full text-amber-300"
																	aria-label="Favorited"
																/>
															)}
														</div>
														<p className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)]">
															{file.updatedAt} · {file.size}
														</p>
														<div className="flex flex-wrap items-center gap-2 text-[11px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
															<span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--vscode-panel-border)_45%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] px-2 py-1 font-medium">
																<i
																	className="codicon codicon-person"
																	aria-hidden="true"
																/>
																{file.owner}
															</span>
															{file.tags.map((tag) => (
																<span
																	key={tag}
																	className="rounded-full border border-[color-mix(in_srgb,var(--vscode-panel-border)_40%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)] px-2 py-1 font-medium">
																	{tag}
																</span>
															))}
															{file.sharedWith.length > 0 && (
																<span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--vscode-panel-border)_40%,transparent)] bg-[color-mix(in_srgb,var(--vscode-focusBorder)_15%,transparent)] px-2 py-1 font-medium">
																	<i
																		className="codicon codicon-organization"
																		aria-hidden="true"
																	/>
																	{file.sharedWith.length === 1
																		? file.sharedWith[0]
																		: `${file.sharedWith[0]} +${file.sharedWith.length - 1}`}
																</span>
															)}
														</div>
													</div>
												</div>
												<div className="flex items-end gap-2 self-stretch text-sm text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
													<button
														type="button"
														className="flex items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_45%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] px-3 py-2 font-medium transition hover:border-[color-mix(in_srgb,var(--vscode-focusBorder)_45%,transparent)]">
														Open
													</button>
													<button
														type="button"
														className="rounded-xl border border-transparent bg-[color-mix(in_srgb,var(--vscode-focusBorder)_18%,transparent)] px-3 py-2 font-medium text-vscode-foreground transition hover:border-[color-mix(in_srgb,var(--vscode-focusBorder)_45%,transparent)]">
														Share
													</button>
												</div>
											</article>
										)
									})
								)}
							</div>
						</section>
					</div>
				</main>

				<aside className="hidden w-[22rem] shrink-0 border-l border-[color-mix(in_srgb,var(--vscode-panel-border)_40%,transparent)] bg-[rgba(18,20,32,0.65)] backdrop-blur-xl 2xl:flex">
					<div className="sticky top-0 flex h-full flex-col gap-6 overflow-y-auto p-6">
						<div className="rounded-2xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_32%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] p-6 text-sm text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
							<h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
								Details
							</h2>
							{detailContent}
						</div>
					</div>
				</aside>
			</div>

			{activeEditorFile && editingFileId && (
				<div className="fixed inset-0 z-50 flex items-center justify-center">
					<div
						className="absolute inset-0 bg-[color-mix(in_srgb,black_70%,transparent)] backdrop-blur"
						onClick={closeEditor}
					/>
					<div className="relative z-10 flex h-[min(90vh,780px)] w-[min(960px,92vw)] flex-col overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_55%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] shadow-[0_30px_80px_rgba(10,12,24,0.65)]">
						<header className="flex items-start justify-between gap-4 border-b border-[color-mix(in_srgb,var(--vscode-panel-border)_35%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)] px-6 py-4">
							<div className="flex flex-col gap-1">
								<span className="text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
									Document Editor
								</span>
								<h2 className="text-xl font-semibold text-vscode-foreground">
									{activeEditorFile.title}
								</h2>
								<div className="flex flex-wrap items-center gap-2 text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
									<span className="inline-flex items-center gap-1">
										<i className="codicon codicon-person" aria-hidden="true" />
										Owned by {activeEditorFile.owner}
									</span>
									{activeEditorFile.sharedWith.length > 0 && (
										<span className="inline-flex items-center gap-1">
											<i className="codicon codicon-organization" aria-hidden="true" />
											Shared with {activeEditorFile.sharedWith.join(", ")}
										</span>
									)}
								</div>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								{(() => {
									const savedContent =
										fileSavedContent[editingFileId] ??
										(activeEditorFile.content
											? cloneContent(activeEditorFile.content)
											: cloneContent(EMPTY_DOC_CONTENT))
									const draftContent = fileDraftContent[editingFileId] ?? savedContent
									const docIsDirty = !deepEqual(draftContent, savedContent)
									const docSaveState = fileSaveStatus[editingFileId] ?? "idle"
									return (
										<>
											{docIsDirty ? (
												<span className="inline-flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--vscode-focusBorder)_18%,transparent)] px-3 py-1 text-xs font-semibold text-vscode-focusBorder">
													<i className="codicon codicon-edit" aria-hidden="true" />
													Unsaved changes
												</span>
											) : docSaveState === "saved" ? (
												<span className="inline-flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--vscode-focusBorder)_15%,transparent)] px-3 py-1 text-xs font-semibold text-vscode-focusBorder">
													<i className="codicon codicon-check" aria-hidden="true" />
													Saved
												</span>
											) : null}
											<button
												type="button"
												onClick={() => handleFileSave(editingFileId!)}
												disabled={!docIsDirty || docSaveState === "saving"}
												className={clsx(
													"inline-flex items-center gap-2 rounded-full border border-transparent bg-[linear-gradient(120deg,rgba(94,229,163,0.85),rgba(63,162,255,0.85))] px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white shadow-[0_8px_18px_rgba(40,190,200,0.35)] transition",
													docIsDirty && docSaveState !== "saving"
														? "hover:shadow-[0_12px_24px_rgba(40,190,200,0.45)]"
														: "opacity-40",
												)}>
												{docSaveState === "saving" ? "Saving…" : "Save"}
											</button>
											<button
												type="button"
												onClick={() => handleFileRevert(editingFileId!)}
												disabled={!docIsDirty || docSaveState === "saving"}
												className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--vscode-panel-border)_45%,transparent)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-vscode-foreground transition hover:border-[color-mix(in_srgb,var(--vscode-focusBorder)_55%,transparent)]">
												Discard
											</button>
											<button
												type="button"
												onClick={closeEditor}
												className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--vscode-panel-border)_45%,transparent)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-vscode-foreground transition hover:border-[color-mix(in_srgb,var(--vscode-focusBorder)_55%,transparent)]">
												Close
											</button>
										</>
									)
								})()}
							</div>
						</header>
						<div className="flex flex-1 flex-col overflow-y-auto px-6 py-5">
							<RichTextEditor
								value={
									fileDraftContent[editingFileId] ??
									(activeEditorFile.content
										? cloneContent(activeEditorFile.content)
										: cloneContent(EMPTY_DOC_CONTENT))
								}
								onChange={(content) => handleFileContentChange(editingFileId!, content)}
								placeholder="Write or paste your document content..."
								minHeight={360}
								appearance="transparent"
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

export default FileCabinetView
