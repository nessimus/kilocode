import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import clsx from "clsx"

import { useExtensionState } from "@/context/ExtensionStateContext"
import type { ExtensionMessage } from "@roo/ExtensionMessage"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmojiPickerField } from "@/components/emoji"
import OuterGateCloverConsole from "./OuterGateCloverConsole"
import {
	defaultOuterGateState,
	OuterGateCloverSessionSummary,
	OuterGateInsight,
	OuterGateInsightStage,
	type OuterGateIntegration,
} from "@roo/golden/outerGate"
import { cn } from "@/lib/utils"
import { vscode } from "@/utils/vscode"

import "./outer-gate.css"
import OuterGatePassionMap from "./OuterGatePassionMap"

const formatNumber = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)

const formatDayTime = (iso?: string) => {
	if (!iso) {
		return "Just now"
	}

	try {
		const date = new Date(iso)
		return new Intl.DateTimeFormat(undefined, {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		}).format(date)
	} catch {
		return "Recently"
	}
}

const stageVariantMap: Record<string, string> = {
	captured:
		"bg-[color-mix(in_srgb,var(--primary)_22%,rgba(255,255,255,0.65)_78%)] text-[color-mix(in_srgb,var(--primary-foreground,#221602)_88%,rgba(255,255,255,0.1)_12%)]",
	processing:
		"bg-[color-mix(in_srgb,var(--vscode-editor-foreground)_12%,rgba(255,255,255,0.12)_88%)] text-[color-mix(in_srgb,var(--primary)_60%,rgba(255,255,255,0.24)_40%)]",
	ready: "bg-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.7)_82%)] text-[color-mix(in_srgb,var(--primary-foreground,#1d1405)_92%,rgba(255,255,255,0.05)_8%)]",
	assigned:
		"bg-[color-mix(in_srgb,rgba(24,18,8,0.85)_80%,rgba(212,175,55,0.3)_20%)] text-[color-mix(in_srgb,var(--primary)_68%,rgba(255,255,255,0.38)_32%)]",
}

const insightStageLabel: Record<string, string> = {
	captured: "Captured",
	processing: "Processing",
	ready: "Ready",
	assigned: "Assigned",
}

const insightStageOptions: { value: OuterGateInsightStage; label: string }[] = (
	["captured", "processing", "ready", "assigned"] as OuterGateInsightStage[]
).map((value) => ({ value, label: insightStageLabel[value] ?? value }))

const insightIconClass: Record<OuterGateInsight["sourceType"], string> = {
	conversation: "codicon-comment-discussion",
	document: "codicon-file-text",
	voice: "codicon-mic",
	integration: "codicon-plug",
}

const integrationStatusLabel: Record<OuterGateIntegration["status"], string> = {
	connected: "Connected",
	not_connected: "Not Connected",
	coming_soon: "Coming Soon",
	error: "Connection Error",
}

const integrationStatusVariant: Record<OuterGateIntegration["status"], "default" | "secondary" | "outline"> = {
	connected: "default",
	not_connected: "secondary",
	coming_soon: "outline",
	error: "secondary",
}

type CompanyFormState = {
	name: string
	emoji: string
	description: string
	mission: string
	vision: string
}

type InsightFormState = {
	title: string
	summary: string
	stage: OuterGateInsightStage
	recommendedWorkspace: string
}

const createEmptyCompanyForm = (): CompanyFormState => ({
	name: "",
	emoji: "",
	description: "",
	mission: "",
	vision: "",
})

const createInsightFormState = (insight?: OuterGateInsight): InsightFormState => ({
	title: insight?.title ?? "",
	summary: insight?.summary ?? "",
	stage: insight?.stage ?? "captured",
	recommendedWorkspace: insight?.recommendedWorkspace ?? insight?.assignedCompanyId ?? "",
})

const CONNECTED_FEEDS_SECTION_ID = "outer-gate-connected-feeds"

const OuterGateView: React.FC = () => {
	const {
		outerGateState,
		sendOuterGateMessage,
		triggerOuterGateAction,
		requestOuterGatePassionMap,
		updateOuterGateInsight,
		deleteOuterGateInsight,
		workplaceState,
		workplaceRootUri,
		cwd,
		createCompany,
		updateCompany,
		setCompanyFavorite,
		deleteCompany,
		selectCompany,
		createCloverSession,
		activateCloverSession,
		loadMoreCloverSessions,
	} = useExtensionState()
	const resolvedState = outerGateState ?? defaultOuterGateState
	const [createCompanyForm, setCreateCompanyForm] = useState<CompanyFormState>(() => createEmptyCompanyForm())
	const [editCompanyForm, setEditCompanyForm] = useState<CompanyFormState>(() => createEmptyCompanyForm())
	const [createCompanyError, setCreateCompanyError] = useState<string | undefined>()
	const [editCompanyError, setEditCompanyError] = useState<string | undefined>()
	const [isCreateCompanyModalOpen, setIsCreateCompanyModalOpen] = useState(false)
	const [isEditCompanyModalOpen, setIsEditCompanyModalOpen] = useState(false)
	const [activeEditCompanyId, setActiveEditCompanyId] = useState<string | null>(null)
	const activeEditCompanyIdRef = useRef<string | null>(null)
	const [favoritePending, setFavoritePending] = useState<Record<string, boolean>>({})
	const [deletePending, setDeletePending] = useState<Record<string, boolean>>({})
	const [updatePending, setUpdatePending] = useState<Record<string, boolean>>({})
	const [optimisticFavorites, setOptimisticFavorites] = useState<Record<string, boolean>>({})
	const [optimisticDeleted, setOptimisticDeleted] = useState<Record<string, boolean>>({})
	const [mutationErrors, setMutationErrors] = useState<Record<string, string | undefined>>({})
	const [activeDeleteDialog, setActiveDeleteDialog] = useState<string | null>(null)
	const [deleteConfirmationText, setDeleteConfirmationText] = useState<string>("")
	const [viewMode, setViewMode] = useState<"overview" | "passionMap">("overview")
	const [activeInsightId, setActiveInsightId] = useState<string | null>(null)
	const [insightForm, setInsightForm] = useState<InsightFormState>(() => createInsightFormState())
	const [isInsightModalOpen, setIsInsightModalOpen] = useState(false)
	const [isInsightSubmitting, setIsInsightSubmitting] = useState(false)
	const [insightError, setInsightError] = useState<string | undefined>()
	const [insightToDelete, setInsightToDelete] = useState<OuterGateInsight | null>(null)
	const [isInsightDeletePending, setIsInsightDeletePending] = useState(false)

	useEffect(() => {
		activeEditCompanyIdRef.current = activeEditCompanyId
	}, [activeEditCompanyId])

	const {
		analysisPool,
		recentInsights,
		suggestions,
		quickActions,
		integrations,
		cloverMessages,
		isCloverProcessing,
		cloverSessions,
		activeCloverSessionId,
	} = resolvedState
	const passionMapState = resolvedState.passionMap

	useEffect(() => {
		if (viewMode === "passionMap" && passionMapState.status === "idle") {
			requestOuterGatePassionMap()
		}
	}, [viewMode, passionMapState.status, requestOuterGatePassionMap])

	const courtyardCompanies = useMemo(() => {
		const companyList = workplaceState?.companies ?? []
		if (!companyList.length) {
			return []
		}

		const toMs = (value?: string) => {
			if (!value) {
				return 0
			}
			const ms = Date.parse(value)
			return Number.isNaN(ms) ? 0 : ms
		}

		return [...companyList].sort((a, b) => toMs(b.updatedAt ?? b.createdAt) - toMs(a.updatedAt ?? a.createdAt))
	}, [workplaceState?.companies])

	const activeEditCompany = useMemo(
		() => courtyardCompanies.find((company) => company.id === activeEditCompanyId) ?? null,
		[courtyardCompanies, activeEditCompanyId],
	)

	const cloverSessionEntries = cloverSessions?.entries ?? []
	const hasMoreCloverSessions = cloverSessions?.hasMore ?? false
	const isLoadingCloverSessions = cloverSessions?.isLoading ?? false
	const cloverSessionCursor = cloverSessions?.cursor
	const cloverSessionsLoaded = cloverSessions?.isInitialFetchComplete ?? false

	const normalizeFsPath = useCallback((value?: string | null): string | undefined => {
		if (!value) {
			return undefined
		}
		return value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()
	}, [])

	const handleCheckIn = useCallback(
		(companyId?: string, companyName?: string) => {
			const trimmedName = companyName?.trim()
			const resolvedCompanyId =
				companyId ||
				(trimmedName ? courtyardCompanies.find((entry) => entry.name?.trim() === trimmedName)?.id : undefined)

			if (resolvedCompanyId) {
				selectCompany(resolvedCompanyId)
			}

			const normalizedRoot = normalizeFsPath(workplaceRootUri)
			const normalizedCwd = normalizeFsPath(cwd)
			const inRootWorkspace = Boolean(normalizedRoot) && normalizedRoot === normalizedCwd

			if (!inRootWorkspace) {
				vscode.postMessage({ type: "action", action: "switchTab", tab: "lobby" })
				vscode.postMessage({ type: "action", action: "focusChatInput" })
				window.postMessage({ type: "action", action: "switchTab", tab: "lobby" }, "*")
				window.postMessage({ type: "action", action: "focusChatInput" }, "*")
			}
		},
		[courtyardCompanies, cwd, normalizeFsPath, selectCompany, workplaceRootUri],
	)

	const activeCompanyContext = useMemo(() => {
		const activeId = workplaceState?.activeCompanyId
		if (activeId) {
			const activeCompany = courtyardCompanies.find((company) => company.id === activeId)
			if (activeCompany) {
				return { companyId: activeCompany.id, companyName: activeCompany.name ?? undefined }
			}
		}
		const fallback = courtyardCompanies[0]
		return fallback ? { companyId: fallback.id, companyName: fallback.name ?? undefined } : {}
	}, [courtyardCompanies, workplaceState?.activeCompanyId])

	const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null)
	const sessionLoadRequestedRef = useRef(false)

	useEffect(() => {
		sessionLoadRequestedRef.current = false
	}, [cloverSessionCursor])

	useEffect(() => {
		if (!cloverSessionsLoaded || !hasMoreCloverSessions) {
			return
		}
		const sentinel = loadMoreSentinelRef.current
		if (!sentinel) {
			return
		}
		const observer = new IntersectionObserver((entries) => {
			const entry = entries[0]
			if (!entry?.isIntersecting) {
				return
			}
			if (sessionLoadRequestedRef.current || isLoadingCloverSessions) {
				return
			}
			sessionLoadRequestedRef.current = true
			loadMoreCloverSessions(cloverSessionCursor)
		})
		observer.observe(sentinel)
		return () => observer.disconnect()
	}, [
		cloverSessionsLoaded,
		hasMoreCloverSessions,
		isLoadingCloverSessions,
		loadMoreCloverSessions,
		cloverSessionCursor,
	])

	const handleSessionPickup = useCallback(
		(session: OuterGateCloverSessionSummary) => {
			if (session.companyId) {
				selectCompany(session.companyId)
			}
			activateCloverSession(session.id)
			window.postMessage({ type: "outerGateFocusComposer" }, "*")
		},
		[activateCloverSession, selectCompany],
	)

	const handleNewChat = useCallback(() => {
		createCloverSession(activeCompanyContext)
		window.postMessage(
			{
				type: "outerGatePrefillDraft",
				text: "",
				replace: true,
				focus: true,
			},
			"*",
		)
	}, [activeCompanyContext, createCloverSession])

	const handleCreateCompanyModalChange = useCallback((open: boolean) => {
		setIsCreateCompanyModalOpen(open)
		if (!open) {
			setCreateCompanyForm(createEmptyCompanyForm())
			setCreateCompanyError(undefined)
		}
	}, [])

	const handleEditCompanyModalChange = useCallback((open: boolean) => {
		setIsEditCompanyModalOpen(open)
		if (!open) {
			setEditCompanyForm(createEmptyCompanyForm())
			setEditCompanyError(undefined)
			setActiveEditCompanyId(null)
			activeEditCompanyIdRef.current = null
		}
	}, [])

	const handleQuickAction = (slug: string) => {
		if (slug === "create-company" || slug === "create-workspace") {
			handleCreateCompanyModalChange(true)
			return
		}

		if (slug === "import-data") {
			const connectedFeedsSection = document.getElementById(CONNECTED_FEEDS_SECTION_ID)
			if (connectedFeedsSection) {
				connectedFeedsSection.scrollIntoView({ behavior: "smooth", block: "start" })
			}
			return
		}

		triggerOuterGateAction(slug)
	}

	const handleCreateCompanySubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		const trimmedName = createCompanyForm.name.trim()
		if (!trimmedName) {
			setCreateCompanyError("Company name is required.")
			return
		}

		const emojiValue = createCompanyForm.emoji.trim()
		const descriptionValue = createCompanyForm.description.trim()
		const missionValue = createCompanyForm.mission.trim()
		const visionValue = createCompanyForm.vision.trim()

		createCompany({
			name: trimmedName,
			emoji: emojiValue ? emojiValue : undefined,
			description: descriptionValue ? descriptionValue : undefined,
			mission: missionValue || undefined,
			vision: visionValue || undefined,
		})

		handleCreateCompanyModalChange(false)
	}

	const handleEditCompanySubmit = useCallback(
		(event: React.FormEvent<HTMLFormElement>) => {
			event.preventDefault()
			const companyId = activeEditCompanyIdRef.current
			if (!companyId) {
				setEditCompanyError("Select a company to update.")
				return
			}

			const trimmedName = editCompanyForm.name.trim()
			if (!trimmedName) {
				setEditCompanyError("Company name is required.")
				return
			}

			const emojiValue = editCompanyForm.emoji.trim()
			const descriptionValue = editCompanyForm.description.trim()
			const missionValue = editCompanyForm.mission.trim()
			const visionValue = editCompanyForm.vision.trim()

			setEditCompanyError(undefined)
			setUpdatePending((prev) => ({ ...prev, [companyId]: true }))
			setMutationErrors((prev) => {
				if (!prev[companyId]) {
					return prev
				}
				const next = { ...prev }
				delete next[companyId]
				return next
			})

			updateCompany({
				id: companyId,
				name: trimmedName,
				emoji: emojiValue ? emojiValue : "",
				description: descriptionValue ? descriptionValue : "",
				mission: missionValue || undefined,
				vision: visionValue || undefined,
			})
		},
		[editCompanyForm, updateCompany],
	)

	const handleFavoriteToggle = useCallback(
		(companyId: string, nextFavorite: boolean) => {
			setFavoritePending((prev) => ({ ...prev, [companyId]: true }))
			setOptimisticFavorites((prev) => ({ ...prev, [companyId]: nextFavorite }))
			setMutationErrors((prev) => {
				if (!prev[companyId]) {
					return prev
				}
				const next = { ...prev }
				delete next[companyId]
				return next
			})
			setCompanyFavorite({ companyId, isFavorite: nextFavorite })
		},
		[setCompanyFavorite],
	)

	const handleEditCompany = useCallback(
		(companyId: string) => {
			const company = courtyardCompanies.find((entry) => entry.id === companyId)
			if (!company) {
				return
			}

			selectCompany(companyId)
			setEditCompanyForm({
				name: company.name ?? "",
				emoji: company.emoji ?? "",
				description: company.description ?? "",
				mission: company.mission ?? "",
				vision: company.vision ?? "",
			})
			setEditCompanyError(undefined)
			setActiveEditCompanyId(companyId)
			activeEditCompanyIdRef.current = companyId
			setIsEditCompanyModalOpen(true)
		},
		[courtyardCompanies, selectCompany],
	)

	const handleDeleteRequest = useCallback((companyId: string) => {
		setDeleteConfirmationText("")
		setMutationErrors((prev) => {
			if (!prev[companyId]) {
				return prev
			}
			const next = { ...prev }
			delete next[companyId]
			return next
		})
		setActiveDeleteDialog(companyId)
	}, [])

	const handleConfirmDelete = useCallback(
		(companyId: string) => {
			setMutationErrors((prev) => {
				if (!prev[companyId]) {
					return prev
				}
				const next = { ...prev }
				delete next[companyId]
				return next
			})
			setDeletePending((prev) => ({ ...prev, [companyId]: true }))
			setOptimisticDeleted((prev) => ({ ...prev, [companyId]: true }))
			deleteCompany({ companyId })
		},
		[deleteCompany],
	)

	const handleInsightModalChange = useCallback((open: boolean) => {
		if (!open) {
			setActiveInsightId(null)
			setInsightForm(createInsightFormState())
			setInsightError(undefined)
			setIsInsightSubmitting(false)
		}

		setIsInsightModalOpen(open)
	}, [])

	const handleEditInsight = useCallback((insight: OuterGateInsight) => {
		setActiveInsightId(insight.id)
		setInsightForm(createInsightFormState(insight))
		setInsightError(undefined)
		setIsInsightSubmitting(false)
		setIsInsightModalOpen(true)
	}, [])

	const handleInsightInputChange = useCallback((field: keyof InsightFormState, value: string) => {
		setInsightForm((prev) => ({ ...prev, [field]: value }))
	}, [])

	const handleInsightSubmit = useCallback(
		(event: React.FormEvent<HTMLFormElement>) => {
			event.preventDefault()
			if (!activeInsightId) {
				return
			}

			const trimmedTitle = insightForm.title.trim()
			if (!trimmedTitle) {
				setInsightError("Title is required.")
				return
			}

			setInsightError(undefined)
			setIsInsightSubmitting(true)

			const trimmedSummary = insightForm.summary.trim()
			const trimmedWorkspace = insightForm.recommendedWorkspace.trim()

			updateOuterGateInsight(activeInsightId, {
				title: trimmedTitle,
				summary: trimmedSummary.length > 0 ? trimmedSummary : null,
				stage: insightForm.stage,
				recommendedWorkspace: trimmedWorkspace.length > 0 ? trimmedWorkspace : null,
				assignedCompanyId: trimmedWorkspace.length > 0 ? trimmedWorkspace : null,
			})

			setIsInsightSubmitting(false)
			setIsInsightModalOpen(false)
			setActiveInsightId(null)
			setInsightForm(createInsightFormState())
		},
		[activeInsightId, insightForm, updateOuterGateInsight],
	)

	const handleDeleteInsightRequest = useCallback((insight: OuterGateInsight) => {
		setInsightToDelete(insight)
		setIsInsightDeletePending(false)
	}, [])

	const handleDeleteInsightConfirm = useCallback(() => {
		if (!insightToDelete) {
			return
		}
		setIsInsightDeletePending(true)
		deleteOuterGateInsight(insightToDelete.id)
		setInsightToDelete(null)
		setIsInsightDeletePending(false)
	}, [deleteOuterGateInsight, insightToDelete])

	useEffect(() => {
		const handler = (event: MessageEvent) => {
			if (event.data?.type === "outerGateFocusComposer") {
				const composer = document.querySelector<HTMLTextAreaElement>("[data-outer-gate-composer]")
				composer?.focus()
			}

			if (event.data?.type === "outerGateOpenCreateCompanyModal") {
				handleCreateCompanyModalChange(true)
			}
		}

		window.addEventListener("message", handler)
		return () => window.removeEventListener("message", handler)
	}, [handleCreateCompanyModalChange])

	useEffect(() => {
		const handler = (event: MessageEvent<ExtensionMessage>) => {
			const data = event.data
			if (!data || data.type !== "workplaceCompanyMutationResult" || !data.companyId) {
				return
			}
			const { companyId, mutation, success, error } = data
			if (mutation === "setFavorite") {
				setFavoritePending((prev) => {
					if (!prev[companyId]) {
						return prev
					}
					const next = { ...prev }
					delete next[companyId]
					return next
				})
				setOptimisticFavorites((prev) => {
					if (!prev[companyId]) {
						return prev
					}
					const next = { ...prev }
					delete next[companyId]
					return next
				})
				setMutationErrors((prev) => {
					if (success) {
						if (!prev[companyId]) {
							return prev
						}
						const next = { ...prev }
						delete next[companyId]
						return next
					}
					return {
						...prev,
						[companyId]: error ?? "Unable to update favorite. Please try again.",
					}
				})
			} else if (mutation === "delete") {
				setDeletePending((prev) => {
					if (!prev[companyId]) {
						return prev
					}
					const next = { ...prev }
					delete next[companyId]
					return next
				})
				setOptimisticDeleted((prev) => {
					if (!prev[companyId]) {
						return prev
					}
					const next = { ...prev }
					delete next[companyId]
					return next
				})
				if (success) {
					setActiveDeleteDialog((prev) => (prev === companyId ? null : prev))
					setDeleteConfirmationText("")
				}
				setMutationErrors((prev) => {
					if (success) {
						if (!prev[companyId]) {
							return prev
						}
						const next = { ...prev }
						delete next[companyId]
						return next
					}
					return {
						...prev,
						[companyId]: error ?? "Unable to delete workspace. Please try again.",
					}
				})
			} else if (mutation === "update") {
				setUpdatePending((prev) => {
					if (!prev[companyId]) {
						return prev
					}
					const next = { ...prev }
					delete next[companyId]
					return next
				})
				if (success) {
					setMutationErrors((prev) => {
						if (!prev[companyId]) {
							return prev
						}
						const next = { ...prev }
						delete next[companyId]
						return next
					})
					if (activeEditCompanyIdRef.current === companyId) {
						handleEditCompanyModalChange(false)
					}
				} else {
					const fallbackError = error ?? "Unable to update workspace. Please try again."
					setMutationErrors((prev) => ({ ...prev, [companyId]: fallbackError }))
					if (activeEditCompanyIdRef.current === companyId) {
						setEditCompanyError(fallbackError)
					}
				}
			}
		}
		window.addEventListener("message", handler)
		return () => window.removeEventListener("message", handler)
	}, [handleEditCompanyModalChange])

	useEffect(() => {
		if (!activeDeleteDialog) {
			setDeleteConfirmationText("")
		}
	}, [activeDeleteDialog])

	useEffect(() => {
		const companyIds = new Set(courtyardCompanies.map((entry) => entry.id))
		const pruneMap = <T,>(state: Record<string, T>) => {
			let mutated = false
			const next: Record<string, T> = {}
			for (const [key, value] of Object.entries(state)) {
				if (companyIds.has(key)) {
					next[key] = value
				} else {
					mutated = true
				}
			}
			return mutated ? next : state
		}

		setFavoritePending((prev) => pruneMap(prev))
		setDeletePending((prev) => pruneMap(prev))
		setUpdatePending((prev) => pruneMap(prev))
		setOptimisticFavorites((prev) => pruneMap(prev))
		setOptimisticDeleted((prev) => pruneMap(prev))
		setMutationErrors((prev) => pruneMap(prev))
	}, [courtyardCompanies])

	const courtyardTotals = useMemo(() => {
		const totals = courtyardCompanies.reduce(
			(acc, company) => {
				const activeEmployees = (company.employees ?? []).filter((employee) => !employee.deletedAt)
				const activeTeams = (company.teams ?? []).filter((team) => !team.deletedAt)
				const activeDepartments = (company.departments ?? []).filter((department) => !department.deletedAt)

				return {
					...acc,
					employees: acc.employees + activeEmployees.length,
					teams: acc.teams + activeTeams.length,
					departments: acc.departments + activeDepartments.length,
				}
			},
			{ companies: courtyardCompanies.length, employees: 0, teams: 0, departments: 0 },
		)

		const { companies, employees, teams, departments } = totals
		const summaryParts = [
			`${formatNumber(companies)} ${companies === 1 ? "company" : "companies"}`,
			`${formatNumber(employees)} ${employees === 1 ? "employee" : "employees"}`,
			`${formatNumber(teams)} ${teams === 1 ? "team" : "teams"}`,
			`${formatNumber(departments)} ${departments === 1 ? "department" : "departments"}`,
		]

		return {
			...totals,
			summary: summaryParts.join(" · "),
		}
	}, [courtyardCompanies])

	const stats = useMemo(
		() => [
			{
				label: "Captured",
				value: formatNumber(analysisPool.totalCaptured),
				helpText: "Ideas logged through Outer Gate",
			},
			{
				label: "In Processing",
				value: formatNumber(analysisPool.processing),
				helpText: "Items Clover is categorizing",
			},
			{
				label: "Ready for Review",
				value: formatNumber(analysisPool.ready),
				helpText: "Insights ready to assign",
			},
			{
				label: "Assigned This Week",
				value: formatNumber(analysisPool.assignedThisWeek),
				helpText: "Artifacts moved into workspaces",
			},
		],
		[analysisPool],
	)

	const isCreateCompanySubmitDisabled = !createCompanyForm.name.trim()
	const isEditCompanySubmitDisabled = !activeEditCompanyId || !editCompanyForm.name.trim()
	const isEditSubmitting = activeEditCompanyId ? Boolean(updatePending[activeEditCompanyId]) : false
	const editCompanyLabel = activeEditCompany?.name?.trim() || "company"

	if (viewMode === "passionMap") {
		return (
			<OuterGatePassionMap
				passionMap={passionMapState}
				analysisPool={analysisPool}
				onBack={() => setViewMode("overview")}
				onRefresh={requestOuterGatePassionMap}
			/>
		)
	}

	return (
		<div className="relative flex h-full w-full overflow-x-hidden">
			<div className="outer-gate-backdrop" aria-hidden />
			<div className="outer-gate-glow-ring" aria-hidden />
			<div className="outer-gate-gateways pointer-events-none" aria-hidden />
			<div className="outer-gate-grid pointer-events-none absolute inset-0" aria-hidden />

			<div className="relative z-[2] flex h-full w-full flex-col gap-8 px-10 pb-9 pt-8">
				<header className="flex flex-col gap-6 text-[color-mix(in_srgb,var(--vscode-foreground)_90%,rgba(255,255,255,0.12)_10%)]">
					<div className="flex flex-wrap items-end justify-between gap-6">
						<div className="max-w-2xl space-y-3">
							<p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color-mix(in_srgb,var(--primary)_62%,rgba(255,255,255,0.38)_38%)]">
								Outer Gates
							</p>
							<h1 className="text-3xl font-semibold leading-tight">
								Where every passion checks in before it becomes a company.
							</h1>
							<p className="max-w-xl text-sm text-[color-mix(in_srgb,var(--vscode-foreground)_74%,rgba(255,255,255,0.22)_26%)]">
								Clover listens at the gate, orchestrates your imports, and surfaces what deserves a
								dedicated workspace.
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-3 text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_60%,rgba(255,255,255,0.3)_40%)]">
							<span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--primary)_20%,rgba(255,255,255,0.22)_80%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_65%,rgba(255,255,255,0.08)_35%)] px-3 py-1 uppercase tracking-[0.22em] text-[color-mix(in_srgb,var(--primary)_62%,rgba(255,255,255,0.2)_38%)]">
								<span className="codicon codicon-history" /> Updated{" "}
								{formatDayTime(analysisPool.lastUpdatedIso)}
							</span>
						</div>
					</div>
					<div className="flex flex-wrap gap-3">
						{quickActions.map((action) => (
							<Button
								key={action.slug}
								onClick={() => handleQuickAction(action.slug)}
								variant="secondary"
								className="group flex h-auto flex-1 min-w-[190px] items-center justify-between gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.25)_82%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_76%,rgba(255,248,220,0.16)_24%)] px-5 py-4 text-left text-[0.95rem] font-medium text-[color-mix(in_srgb,var(--vscode-foreground)_82%,rgba(255,255,255,0.14)_18%)] shadow-[0_18px_38px_rgba(18,12,4,0.32)] transition-transform hover:-translate-y-[2px] hover:border-[color-mix(in_srgb,var(--primary)_32%,rgba(255,255,255,0.35)_68%)] hover:text-[color-mix(in_srgb,var(--primary)_62%,rgba(255,255,255,0.2)_38%)]">
								<span className="flex flex-col gap-1 text-left">
									<span className="text-sm font-semibold uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--primary)_58%,rgba(255,255,255,0.28)_42%)]">
										{action.title}
									</span>
									<span className="text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_70%,rgba(255,255,255,0.2)_30%)]">
										{action.description}
									</span>
								</span>
								<span
									className="codicon text-lg text-[color-mix(in_srgb,var(--primary)_68%,rgba(255,255,255,0.32)_32%)] group-hover:translate-x-1 transition-transform"
									aria-hidden>
									{action.icon ? (
										<span className={clsx("codicon", action.icon)} />
									) : (
										<span className="codicon codicon-arrow-right" />
									)}
								</span>
							</Button>
						))}
					</div>
				</header>

				<div className="grid flex-1 grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
					<div className="flex min-h-0 flex-col gap-6 overflow-hidden">
						<section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
							{stats.map((stat) => (
								<Card
									key={stat.label}
									className="border-[color-mix(in_srgb,var(--primary)_16%,rgba(255,255,255,0.2)_84%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_82%,rgba(255,255,255,0.1)_18%)] shadow-[0_18px_40px_rgba(14,9,2,0.28)]">
									<CardHeader className="pb-2">
										<CardTitle className="text-xs font-semibold uppercase tracking-[0.22em] text-[color-mix(in_srgb,var(--primary)_58%,rgba(255,255,255,0.26)_42%)]">
											{stat.label}
										</CardTitle>
										<CardDescription className="text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_58%,rgba(255,255,255,0.28)_42%)]">
											{stat.helpText}
										</CardDescription>
									</CardHeader>
									<CardContent className="pb-6 pt-0">
										<p className="text-3xl font-semibold tracking-tight text-[color-mix(in_srgb,var(--vscode-foreground)_88%,rgba(255,255,255,0.12)_12%)]">
											{stat.value}
										</p>
									</CardContent>
								</Card>
							))}
						</section>

						<section className="grid min-h-0 grid-cols-1 gap-4 overflow-auto pr-1">
							<Card className="border-transparent bg-[color-mix(in_srgb,var(--vscode-editor-background)_78%,rgba(255,255,255,0.1)_22%)] shadow-[0_24px_48px_rgba(12,8,2,0.26)]">
								<CardHeader>
									<div className="flex items-start justify-between gap-3">
										<div>
											<CardTitle className="text-lg font-semibold text-[color-mix(in_srgb,var(--vscode-foreground)_88%,rgba(255,255,255,0.12)_12%)]">
												Courtyard
											</CardTitle>
											<CardDescription className="text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_68%,rgba(255,255,255,0.24)_32%)]">
												Your live ventures and workspaces ready for their next check-in.
											</CardDescription>
											<p className="mt-1 text-[0.7rem] text-[color-mix(in_srgb,var(--vscode-foreground)_56%,rgba(255,255,255,0.22)_44%)]">
												{courtyardTotals.summary}
											</p>
										</div>
										<Button
											variant="secondary"
											size="sm"
											className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--primary)_16%,rgba(255,255,255,0.26)_84%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_70%,rgba(255,255,255,0.12)_30%)] px-3 py-1 text-xs font-medium text-[color-mix(in_srgb,var(--primary)_62%,rgba(255,255,255,0.22)_38%)] shadow-[0_16px_28px_rgba(14,9,2,0.28)] hover:border-[color-mix(in_srgb,var(--primary)_32%,rgba(255,255,255,0.3)_68%)]"
											onClick={() => handleQuickAction("create-company")}>
											<span className="codicon codicon-add" /> Create company
										</Button>
									</div>
								</CardHeader>
								<CardContent>
									{courtyardCompanies.length === 0 ? (
										<div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--primary)_16%,rgba(255,255,255,0.32)_84%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_84%,rgba(255,255,255,0.08)_16%)] px-6 py-8 text-sm text-[color-mix(in_srgb,var(--vscode-foreground)_70%,rgba(255,255,255,0.22)_30%)]">
											<p className="max-w-xl text-[0.95rem] leading-relaxed">
												You haven’t created any companies yet. Spin up your first workspace to
												give Clover a home for your next big idea.
											</p>
											<Button
												variant="secondary"
												className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.28)_82%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_72%,rgba(255,255,255,0.12)_28%)] px-4 py-2 text-sm font-medium text-[color-mix(in_srgb,var(--primary)_64%,rgba(255,255,255,0.24)_36%)] shadow-[0_14px_28px_rgba(12,8,2,0.26)] hover:border-[color-mix(in_srgb,var(--primary)_32%,rgba(255,255,255,0.3)_68%)]"
												onClick={() => handleQuickAction("create-company")}>
												Create your first company
												<span className="codicon codicon-arrow-right" />
											</Button>
										</div>
									) : (
										<div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 px-1">
											{courtyardCompanies.map((company) => {
												const trimmedName = company.name?.trim() ?? ""
												const customEmoji = company.emoji?.trim()
												const fallbackLabel = trimmedName || "Untitled Company"
												let companyIcon = customEmoji || "🏛️"
												let companyLabel = fallbackLabel
												if (!customEmoji) {
													const leadingSymbol = trimmedName.match(/^[^\w\s]/u)?.[0]
													if (leadingSymbol) {
														companyIcon = leadingSymbol
														const remainder = trimmedName.slice(leadingSymbol.length)
														companyLabel =
															remainder && /^\s/.test(remainder)
																? remainder.trimStart() || fallbackLabel
																: remainder || fallbackLabel
													}
												} else if (!trimmedName) {
													companyLabel = fallbackLabel
												}
												const summary =
													company.description?.trim() ||
													company.mission?.trim() ||
													company.vision?.trim()
												const employeeCount = formatNumber(company.employees.length)
												const departmentCount = formatNumber(company.departments.length)
												const teamCount = formatNumber(company.teams.length)
												const isFavoriteLoading = Boolean(favoritePending[company.id])
												const isDeleteLoading = Boolean(deletePending[company.id])
												const isUpdateLoading = Boolean(updatePending[company.id])
												const isDeleting =
													Boolean(optimisticDeleted[company.id]) || isDeleteLoading
												const isFavorited =
													optimisticFavorites[company.id] ?? company.isFavorite ?? false
												const menuDisabled =
													isFavoriteLoading || isDeleteLoading || isUpdateLoading
												const mutationError = mutationErrors[company.id]
												const isDeleteDialogOpen = activeDeleteDialog === company.id
												const confirmationTarget =
													companyLabel || trimmedName || "Untitled Company"
												const confirmationValue = isDeleteDialogOpen
													? deleteConfirmationText
													: ""
												const normalizedConfirmationInput = confirmationValue.trim()
												const isConfirmationAccurate =
													normalizedConfirmationInput === confirmationTarget
												const showConfirmationHint =
													confirmationValue.length > 0 && !isConfirmationAccurate

												return (
													<div
														key={company.id}
														className={clsx(
															"flex min-w-[280px] max-w-[320px] snap-start flex-col justify-between gap-4 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_12%,rgba(255,255,255,0.18)_88%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_84%,rgba(255,255,255,0.08)_16%)] p-5 shadow-[0_16px_32px_rgba(8,5,1,0.24)] transition-transform hover:-translate-y-[2px]",
															isDeleting && "opacity-60 pointer-events-none",
														)}
														aria-busy={
															isDeleteLoading || isUpdateLoading ? true : undefined
														}>
														<div className="flex flex-col gap-3">
															<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1">
																<span className="text-3xl leading-none" aria-hidden>
																	{companyIcon}
																</span>
																<div className="min-w-0">
																	<div className="flex items-start gap-2">
																		<h3 className="truncate text-base font-semibold text-[color-mix(in_srgb,var(--vscode-foreground)_90%,rgba(255,255,255,0.1)_10%)]">
																			{companyLabel}
																		</h3>
																		{isFavorited && (
																			<span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--primary)_36%,rgba(255,255,255,0.3)_64%)] bg-[color-mix(in_srgb,var(--primary)_24%,rgba(255,255,255,0.08)_76%)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-[color-mix(in_srgb,var(--primary-foreground,#211703)_90%,rgba(255,255,255,0.14)_10%)]">
																				<span
																					className="codicon codicon-star-full"
																					aria-hidden
																				/>
																				<span className="sr-only">
																					Favorited workspace
																				</span>
																			</span>
																		)}
																	</div>
																</div>
																<div className="col-start-3 row-start-1 self-start justify-self-end">
																	<DropdownMenu>
																		<DropdownMenuTrigger asChild>
																			<Button
																				variant="ghost"
																				size="icon"
																				aria-label={`${companyLabel} options`}
																				disabled={menuDisabled}
																				className="text-[color-mix(in_srgb,var(--vscode-foreground)_64%,rgba(255,255,255,0.24)_36%)] hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_70%,rgba(255,255,255,0.12)_30%)]">
																				{menuDisabled ? (
																					<span
																						className="codicon codicon-sync animate-spin"
																						aria-hidden
																					/>
																				) : (
																					<span
																						className="codicon codicon-kebab-vertical"
																						aria-hidden
																					/>
																				)}
																			</Button>
																		</DropdownMenuTrigger>
																		<DropdownMenuContent
																			align="end"
																			className="w-56 rounded-xl border border-[color-mix(in_srgb,var(--primary)_26%,rgba(255,255,255,0.28)_74%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_78%,rgba(15,12,4,0.36)_22%)]/95 p-1 text-sm shadow-[0_20px_40px_rgba(8,5,1,0.45)] backdrop-blur-md">
																			<DropdownMenuItem
																				onSelect={() =>
																					handleFavoriteToggle(
																						company.id,
																						!isFavorited,
																					)
																				}
																				disabled={
																					isDeleteLoading || isUpdateLoading
																				}>
																				<span
																					className={`codicon ${isFavorited ? "codicon-star-full" : "codicon-star-empty"}`}
																					aria-hidden
																				/>
																				{isFavorited
																					? "Unfavorite workspace"
																					: "Favorite workspace"}
																			</DropdownMenuItem>
																			<DropdownMenuItem
																				onSelect={() =>
																					handleEditCompany(company.id)
																				}
																				disabled={
																					isDeleteLoading || isUpdateLoading
																				}>
																				<span
																					className="codicon codicon-edit"
																					aria-hidden
																				/>
																				Edit details
																			</DropdownMenuItem>
																			<DropdownMenuSeparator />
																			<DropdownMenuItem
																				className="text-[color-mix(in_srgb,var(--vscode-editorError-foreground,#ff6b6b)_88%,rgba(255,255,255,0.24)_12%)] focus:bg-[color-mix(in_srgb,var(--vscode-editorError-foreground,#ff6b6b)_24%,rgba(255,255,255,0.12)_76%)] focus:text-[color-mix(in_srgb,var(--vscode-editorError-foreground,#ff9b9b)_92%,rgba(255,255,255,0.1)_8%)]"
																				onSelect={() =>
																					handleDeleteRequest(company.id)
																				}>
																				<span
																					className="codicon codicon-trash"
																					aria-hidden
																				/>
																				Delete workspace
																			</DropdownMenuItem>
																		</DropdownMenuContent>
																	</DropdownMenu>
																</div>
																<p className="col-span-2 col-start-1 text-[11px] uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--vscode-foreground)_52%,rgba(255,255,255,0.28)_48%)] leading-[1.2]">
																	Updated {formatDayTime(company.updatedAt)}
																</p>
															</div>
															<p className="line-clamp-3 text-sm leading-relaxed text-[color-mix(in_srgb,var(--vscode-foreground)_70%,rgba(255,255,255,0.22)_30%)]">
																{summary ??
																	"Set a mission so Clover knows where to guide your check-ins."}
															</p>
															{isUpdateLoading && (
																<p
																	className="flex items-center gap-2 text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_62%,rgba(255,255,255,0.2)_38%)]"
																	role="status"
																	aria-live="polite">
																	<span
																		className="codicon codicon-sync animate-spin"
																		aria-hidden
																	/>{" "}
																	Saving changes…
																</p>
															)}
															{isDeleteLoading && (
																<p
																	className="flex items-center gap-2 text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_62%,rgba(255,255,255,0.2)_38%)]"
																	role="status"
																	aria-live="polite">
																	<span
																		className="codicon codicon-sync animate-spin"
																		aria-hidden
																	/>{" "}
																	Deleting workspace…
																</p>
															)}
														</div>
														<div className="flex flex-col gap-3">
															<div className="flex flex-wrap gap-2 text-[0.68rem] uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--vscode-foreground)_54%,rgba(255,255,255,0.26)_46%)]">
																<Badge
																	variant="outline"
																	className="border-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.24)_82%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_80%,rgba(255,255,255,0.1)_20%)] px-3 py-1 text-[0.62rem] text-[color-mix(in_srgb,var(--primary)_58%,rgba(255,255,255,0.24)_42%)]">
																	<span className="inline-flex items-center gap-1">
																		<span
																			className="codicon codicon-person"
																			aria-hidden
																		/>{" "}
																		{employeeCount} teammates
																	</span>
																</Badge>
																<Badge
																	variant="outline"
																	className="border-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.24)_82%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_80%,rgba(255,255,255,0.1)_20%)] px-3 py-1 text-[0.62rem] text-[color-mix(in_srgb,var(--primary)_58%,rgba(255,255,255,0.24)_42%)]">
																	<span className="inline-flex items-center gap-1">
																		<span
																			className="codicon codicon-organization"
																			aria-hidden
																		/>{" "}
																		{departmentCount} departments
																	</span>
																</Badge>
																<Badge
																	variant="outline"
																	className="border-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.24)_82%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_80%,rgba(255,255,255,0.1)_20%)] px-3 py-1 text-[0.62rem] text-[color-mix(in_srgb,var(--primary)_58%,rgba(255,255,255,0.24)_42%)]">
																	<span className="inline-flex items-center gap-1">
																		<span
																			className="codicon codicon-versions"
																			aria-hidden
																		/>{" "}
																		{teamCount} teams
																	</span>
																</Badge>
															</div>
															<Button
																variant="secondary"
																disabled={isDeleteLoading || isUpdateLoading}
																className="w-full items-center justify-center gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_24%,rgba(255,255,255,0.26)_76%)] bg-[color-mix(in_srgb,var(--primary)_78%,rgba(255,255,255,0.08)_22%)] py-2.5 text-sm font-semibold text-[color-mix(in_srgb,var(--primary-foreground,#211703)_88%,rgba(255,255,255,0.08)_12%)] shadow-[0_16px_32px_rgba(212,175,55,0.32)] hover:-translate-y-[1px] hover:bg-[color-mix(in_srgb,var(--primary)_84%,rgba(255,255,255,0.12)_16%)] disabled:opacity-70"
																onClick={() =>
																	handleCheckIn(
																		company.id,
																		companyLabel || company.name,
																	)
																}>
																{isDeleteLoading ? (
																	<>
																		<span
																			className="codicon codicon-sync animate-spin"
																			aria-hidden
																		/>{" "}
																		Deleting…
																	</>
																) : (
																	<>
																		Check-In Now
																		<span
																			className="codicon codicon-location"
																			aria-hidden
																		/>
																	</>
																)}
															</Button>
														</div>

														{mutationError && (
															<p
																role="status"
																aria-live="polite"
																className="rounded-lg border border-[color-mix(in_srgb,var(--vscode-editorError-foreground,#ff6b6b)_60%,rgba(255,255,255,0.24)_40%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_80%,rgba(255,90,90,0.16)_20%)] px-3 py-2 text-xs text-[color-mix(in_srgb,var(--vscode-editorError-foreground,#ff8484)_88%,rgba(255,255,255,0.12)_12%)]">
																{mutationError}
															</p>
														)}

														<AlertDialog
															open={activeDeleteDialog === company.id}
															onOpenChange={(open) =>
																setActiveDeleteDialog(open ? company.id : null)
															}>
															<AlertDialogContent className="max-w-sm">
																<AlertDialogHeader>
																	<AlertDialogTitle>
																		Delete {confirmationTarget}
																	</AlertDialogTitle>
																	<AlertDialogDescription className="space-y-3 text-sm text-[color-mix(in_srgb,var(--vscode-foreground)_82%,rgba(255,255,255,0.18)_18%)]">
																		<p>
																			This will permanently remove{" "}
																			<span className="font-semibold text-[color-mix(in_srgb,var(--primary)_68%,rgba(255,255,255,0.28)_32%)]">
																				{confirmationTarget}
																			</span>
																			and its AI teammates. Enter the workspace
																			name exactly to confirm.
																		</p>
																		<div className="space-y-2">
																			<Input
																				type="text"
																				value={confirmationValue}
																				onChange={(event) =>
																					setDeleteConfirmationText(
																						event.target.value,
																					)
																				}
																				autoFocus={isDeleteDialogOpen}
																				placeholder={`Type ${confirmationTarget}`}
																				aria-label={`Type ${confirmationTarget} to confirm deletion`}
																				aria-invalid={
																					showConfirmationHint
																						? true
																						: undefined
																				}
																				disabled={
																					!isDeleteDialogOpen ||
																					isDeleteLoading
																				}
																			/>
																			<p
																				className={cn(
																					"text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_60%,rgba(255,255,255,0.28)_40%)]",
																					showConfirmationHint &&
																						"text-[color-mix(in_srgb,var(--vscode-editorError-foreground,#ff6b6b)_88%,rgba(255,255,255,0.22)_12%)]",
																				)}
																				aria-live="polite">
																				Type{" "}
																				<span className="font-semibold">
																					{confirmationTarget}
																				</span>{" "}
																				to enable deletion.
																			</p>
																		</div>
																	</AlertDialogDescription>
																</AlertDialogHeader>
																<AlertDialogFooter>
																	<AlertDialogCancel asChild>
																		<Button variant="secondary">Cancel</Button>
																	</AlertDialogCancel>
																	<AlertDialogAction asChild>
																		<Button
																			variant="destructive"
																			onClick={() =>
																				handleConfirmDelete(company.id)
																			}
																			disabled={
																				isDeleteLoading ||
																				!isConfirmationAccurate
																			}>
																			{isDeleteLoading ? (
																				<span
																					className="codicon codicon-sync animate-spin"
																					aria-hidden
																				/>
																			) : (
																				<span
																					className="codicon codicon-trash"
																					aria-hidden
																				/>
																			)}
																			Delete workspace
																		</Button>
																	</AlertDialogAction>
																</AlertDialogFooter>
															</AlertDialogContent>
														</AlertDialog>
													</div>
												)
											})}
										</div>
									)}
								</CardContent>
							</Card>

							<Card className="border-transparent bg-[color-mix(in_srgb,var(--vscode-editor-background)_78%,rgba(255,255,255,0.1)_22%)] shadow-[0_24px_48px_rgba(12,8,2,0.26)]">
								<CardHeader>
									<div className="flex items-start justify-between gap-3">
										<div className="space-y-2">
											<CardTitle className="text-lg font-semibold text-[color-mix(in_srgb,var(--vscode-foreground)_88%,rgba(255,255,255,0.12)_12%)]">
												Recent Chats with Clover
											</CardTitle>
											<CardDescription className="text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_68%,rgba(255,255,255,0.24)_32%)]">
												Pick up where you left off or spin up a fresh concierge thread. Clover
												AI chats stay personal—they aren’t shared with any company.
											</CardDescription>
										</div>
										<Button
											variant="default"
											onClick={handleNewChat}
											size="sm"
											className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--primary)_82%,rgba(255,255,255,0.08)_18%)] px-3 py-1 text-xs font-semibold text-[color-mix(in_srgb,var(--primary-foreground,#211703)_90%,rgba(255,255,255,0.08)_10%)] shadow-[0_16px_28px_rgba(212,175,55,0.28)] hover:bg-[color-mix(in_srgb,var(--primary)_88%,rgba(255,255,255,0.12)_12%)]">
											<span className="codicon codicon-comment-add" /> New Chat
										</Button>
									</div>
								</CardHeader>
								<CardContent className="space-y-4">
									{!cloverSessionsLoaded && isLoadingCloverSessions ? (
										<div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
											{[0, 1, 2, 3].map((index) => (
												<div
													key={index}
													className="flex min-w-[280px] max-w-[320px] shrink-0 snap-start flex-col gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_12%,rgba(255,255,255,0.18)_88%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_84%,rgba(255,255,255,0.08)_16%)] p-4 shadow-[0_16px_32px_rgba(8,5,1,0.18)] animate-pulse">
													<div className="h-4 w-2/3 rounded bg-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.22)_82%)]" />
													<div className="h-3 w-1/3 rounded bg-[color-mix(in_srgb,var(--primary)_12%,rgba(255,255,255,0.18)_88%)]" />
													<div className="h-12 rounded bg-[color-mix(in_srgb,var(--primary)_12%,rgba(255,255,255,0.14)_88%)]" />
													<div className="h-3 w-1/4 rounded bg-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.18)_82%)]" />
												</div>
											))}
										</div>
									) : cloverSessionEntries.length === 0 ? (
										<div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--primary)_16%,rgba(255,255,255,0.32)_84%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_84%,rgba(255,255,255,0.08)_16%)] px-6 py-8 text-sm text-[color-mix(in_srgb,var(--vscode-foreground)_70%,rgba(255,255,255,0.24)_30%)]">
											<p className="max-w-md text-[0.95rem] leading-relaxed">
												No Clover chats yet. Launch a new conversation to capture what’s top of
												mind.
											</p>
											<Button
												variant="default"
												onClick={handleNewChat}
												size="sm"
												className="inline-flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--primary)_82%,rgba(255,255,255,0.08)_18%)] px-4 py-2 text-xs font-semibold text-[color-mix(in_srgb,var(--primary-foreground,#211703)_88%,rgba(255,255,255,0.08)_12%)] shadow-[0_16px_32px_rgba(212,175,55,0.32)] hover:bg-[color-mix(in_srgb,var(--primary)_88%,rgba(255,255,255,0.12)_12%)]">
												<span className="codicon codicon-comment-add" /> New Chat
											</Button>
										</div>
									) : (
										<>
											<div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
												{cloverSessionEntries.map((session) => {
													const isActive = session.id === activeCloverSessionId
													return (
														<div
															key={session.id}
															className={clsx(
																"flex min-w-[280px] max-w-[320px] shrink-0 snap-start flex-col justify-between gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_12%,rgba(255,255,255,0.18)_88%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_84%,rgba(255,255,255,0.1)_16%)] p-4 shadow-[0_16px_32px_rgba(8,5,1,0.22)] transition-transform hover:-translate-y-[1px]",
																isActive &&
																	"border-[color-mix(in_srgb,var(--primary)_42%,rgba(255,255,255,0.32)_58%)]",
															)}>
															<div className="flex items-start justify-between gap-3">
																<div className="min-w-0 space-y-1">
																	<h3 className="truncate text-sm font-semibold text-[color-mix(in_srgb,var(--vscode-foreground)_88%,rgba(255,255,255,0.12)_12%)]">
																		{session.title}
																	</h3>
																	<p className="text-[11px] uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--vscode-foreground)_54%,rgba(255,255,255,0.26)_46%)]">
																		Updated {formatDayTime(session.updatedAtIso)}
																	</p>
																</div>
															</div>
															<p className="line-clamp-2 text-sm text-[color-mix(in_srgb,var(--vscode-foreground)_72%,rgba(255,255,255,0.22)_28%)]">
																{session.preview}
															</p>
															<div className="flex items-center justify-between gap-3 text-[0.68rem] uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--vscode-foreground)_52%,rgba(255,255,255,0.28)_48%)]">
																<span>
																	{session.messageCount}{" "}
																	{session.messageCount === 1
																		? "message"
																		: "messages"}
																</span>
																<Button
																	variant="default"
																	size="sm"
																	onClick={() => handleSessionPickup(session)}
																	className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--primary)_82%,rgba(255,255,255,0.08)_18%)] px-3 py-1 text-xs font-semibold text-[color-mix(in_srgb,var(--primary-foreground,#211703)_88%,rgba(255,255,255,0.08)_12%)] shadow-[0_14px_28px_rgba(212,175,55,0.3)] hover:bg-[color-mix(in_srgb,var(--primary)_88%,rgba(255,255,255,0.12)_12%)]">
																	Pickup
																</Button>
															</div>
														</div>
													)
												})}
												{hasMoreCloverSessions && (
													<div ref={loadMoreSentinelRef} className="h-full w-1 shrink-0" />
												)}
											</div>
											{isLoadingCloverSessions && (
												<div className="flex items-center gap-2 text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_60%,rgba(255,255,255,0.28)_40%)]">
													<span
														className="codicon codicon-sync codicon-modifier-spin"
														aria-hidden
													/>
													<span>Loading more chats…</span>
												</div>
											)}
										</>
									)}
								</CardContent>
							</Card>

							<Card className="border-transparent bg-[color-mix(in_srgb,var(--vscode-editor-background)_78%,rgba(255,255,255,0.1)_22%)] shadow-[0_24px_48px_rgba(12,8,2,0.26)]">
								<CardHeader>
									<div className="flex items-start justify-between gap-3">
										<div>
											<CardTitle className="text-lg font-semibold text-[color-mix(in_srgb,var(--vscode-foreground)_88%,rgba(255,255,255,0.12)_12%)]">
												Outer Gate Insights
											</CardTitle>
											<CardDescription className="text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_68%,rgba(255,255,255,0.24)_32%)]">
												Most recent captures waiting to be assigned or refined.
											</CardDescription>
										</div>
										<Button
											variant="ghost"
											size="sm"
											className="rounded-full border border-transparent bg-[color-mix(in_srgb,var(--primary)_12%,rgba(255,255,255,0.16)_88%)] px-3 py-1 text-xs text-[color-mix(in_srgb,var(--primary)_62%,rgba(255,255,255,0.24)_38%)] hover:border-[color-mix(in_srgb,var(--primary)_28%,rgba(255,255,255,0.3)_72%)]"
											onClick={() => {
												setViewMode("passionMap")
												requestOuterGatePassionMap()
											}}>
											<span className="codicon codicon-briefcase" /> Explore Insights
										</Button>
									</div>
								</CardHeader>
								<CardContent>
									{recentInsights.length === 0 ? (
										<p className="text-sm text-[color-mix(in_srgb,var(--vscode-foreground)_70%,rgba(255,255,255,0.2)_30%)]">
											No insights yet. Capture a thought with Clover to get started.
										</p>
									) : (
										<div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 px-1">
											{recentInsights.map((insight) => (
												<div
													key={insight.id}
													className="group flex min-w-[280px] max-w-[320px] snap-start flex-col gap-4 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_12%,rgba(255,255,255,0.18)_88%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_84%,rgba(255,255,255,0.08)_16%)] p-4 shadow-[0_16px_32px_rgba(8,5,1,0.24)] transition-transform hover:-translate-y-[2px]">
													<div className="flex items-start justify-between gap-3">
														<div className="flex items-center gap-2 text-xs text-[color-mix(in_srgb,var(--primary)_52%,rgba(255,255,255,0.32)_48%)]">
															<span
																className={clsx(
																	"codicon",
																	insightIconClass[insight.sourceType],
																)}
																aria-hidden
															/>
															<span>{insight.recommendedWorkspace ?? "Unassigned"}</span>
														</div>
														<div className="flex items-start gap-2">
															<Badge
																variant="outline"
																className={cn(
																	"border-none px-3 py-1 text-[0.65rem] uppercase tracking-[0.22em]",
																	stageVariantMap[insight.stage],
																)}>
																{insightStageLabel[insight.stage] ?? insight.stage}
															</Badge>
															<DropdownMenu>
																<DropdownMenuTrigger asChild>
																	<Button
																		variant="ghost"
																		size="icon"
																		aria-label="Insight options"
																		className="h-7 w-7 rounded-full border border-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.24)_82%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_78%,rgba(255,255,255,0.12)_22%)] text-[color-mix(in_srgb,var(--primary)_62%,rgba(255,255,255,0.22)_38%)] transition hover:border-[color-mix(in_srgb,var(--primary)_28%,rgba(255,255,255,0.3)_72%)]">
																		<span
																			className="codicon codicon-kebab-vertical"
																			aria-hidden
																		/>
																	</Button>
																</DropdownMenuTrigger>
																<DropdownMenuContent
																	align="end"
																	className="min-w-[160px]">
																	<DropdownMenuItem
																		onSelect={() => handleEditInsight(insight)}>
																		Edit insight
																	</DropdownMenuItem>
																	<DropdownMenuItem
																		onSelect={() =>
																			handleDeleteInsightRequest(insight)
																		}
																		className="text-[var(--vscode-errorForeground)] focus:text-[var(--vscode-errorForeground)]">
																		Delete insight
																	</DropdownMenuItem>
																</DropdownMenuContent>
															</DropdownMenu>
														</div>
													</div>
													<div className="space-y-2">
														<h3 className="text-base font-semibold text-[color-mix(in_srgb,var(--vscode-foreground)_88%,rgba(255,255,255,0.12)_12%)]">
															{insight.title}
														</h3>
														{insight.summary && (
															<p className="text-sm text-[color-mix(in_srgb,var(--vscode-foreground)_70%,rgba(255,255,255,0.22)_30%)]">
																{insight.summary}
															</p>
														)}
													</div>
													<div className="mt-auto flex flex-col gap-3">
														<div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-[color-mix(in_srgb,var(--vscode-foreground)_50%,rgba(255,255,255,0.28)_50%)]">
															<span>{formatDayTime(insight.capturedAtIso)}</span>
															{(insight.assignedCompanyId ||
																insight.recommendedWorkspace) && (
																<span>
																	Destined for{" "}
																	{insight.assignedCompanyId ??
																		insight.recommendedWorkspace}
																</span>
															)}
														</div>
													</div>
												</div>
											))}
										</div>
									)}
								</CardContent>
							</Card>

							<Card
								id={CONNECTED_FEEDS_SECTION_ID}
								tabIndex={-1}
								className="border-transparent bg-[color-mix(in_srgb,var(--vscode-editor-background)_80%,rgba(255,255,255,0.1)_20%)] shadow-[0_20px_44px_rgba(10,6,0,0.26)]">
								<CardHeader>
									<CardTitle className="text-lg font-semibold text-[color-mix(in_srgb,var(--vscode-foreground)_86%,rgba(255,255,255,0.12)_14%)]">
										Connected Feeds
									</CardTitle>
									<CardDescription className="text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_66%,rgba(255,255,255,0.2)_34%)]">
										Manage the sources Clover watches across your life.
									</CardDescription>
								</CardHeader>
								<CardContent>
									{integrations.length === 0 ? (
										<Button
											variant="secondary"
											onClick={() => triggerOuterGateAction("import-data")}
											className="w-full items-center justify-between gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_20%,rgba(255,255,255,0.2)_80%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_82%,rgba(255,255,255,0.08)_18%)] px-4 py-3 text-sm font-medium text-[color-mix(in_srgb,var(--vscode-foreground)_80%,rgba(255,255,255,0.18)_20%)] shadow-[0_16px_32px_rgba(8,5,1,0.22)] hover:border-[color-mix(in_srgb,var(--primary)_32%,rgba(255,255,255,0.3)_68%)]">
											Connect a source
											<span className="codicon codicon-add" />
										</Button>
									) : (
										<div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 px-1">
											{integrations.map((integration) => (
												<div
													key={integration.id}
													className="flex min-w-[240px] max-w-[280px] snap-start flex-col gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,rgba(255,255,255,0.22)_86%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_84%,rgba(255,255,255,0.1)_16%)] px-4 py-4 text-sm shadow-[0_16px_32px_rgba(8,5,1,0.2)]">
													<div className="flex items-center gap-3">
														<span
															className={clsx(
																"codicon text-xl",
																integration.providerIcon ?? "codicon-database",
															)}
															aria-hidden
														/>
														<div className="min-w-0">
															<p className="truncate text-sm font-medium text-[color-mix(in_srgb,var(--vscode-foreground)_84%,rgba(255,255,255,0.12)_16%)]">
																{integration.name}
															</p>
															{integration.description && (
																<p className="text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_64%,rgba(255,255,255,0.22)_36%)]">
																	{integration.description}
																</p>
															)}
														</div>
													</div>
													<Badge
														variant={integrationStatusVariant[integration.status]}
														className="w-fit px-3 py-1 text-[0.65rem] uppercase tracking-[0.22em]">
														{integrationStatusLabel[integration.status]}
													</Badge>
												</div>
											))}
										</div>
									)}
								</CardContent>
							</Card>
						</section>
					</div>

					<div className="outer-gate-clover-pane flex min-h-0 flex-col">
						<OuterGateCloverConsole
							title="Clover AI Concierge"
							subtitle="Voice what matters. I’ll align it with the right workspace and teammates."
							status={isCloverProcessing ? "Processing" : "Ready"}
							messages={cloverMessages}
							suggestions={suggestions}
							isProcessing={isCloverProcessing}
							onSend={sendOuterGateMessage}
							onSuggestionSelected={sendOuterGateMessage}
						/>
					</div>
				</div>
			</div>

			<Dialog open={isInsightModalOpen} onOpenChange={handleInsightModalChange}>
				<DialogContent className="max-w-lg">
					<form onSubmit={handleInsightSubmit} className="space-y-5" aria-busy={isInsightSubmitting}>
						<DialogHeader>
							<DialogTitle>Edit Insight</DialogTitle>
						</DialogHeader>

						<div className="space-y-4">
							<div className="flex flex-col gap-2">
								<label
									htmlFor="outer-gate-insight-title"
									className="text-sm font-medium text-[var(--vscode-foreground)]">
									Title
								</label>
								<Input
									required
									id="outer-gate-insight-title"
									value={insightForm.title}
									onChange={(event) => handleInsightInputChange("title", event.target.value)}
									placeholder="Summarize the insight"
								/>
							</div>
							<div className="flex flex-col gap-2">
								<label
									htmlFor="outer-gate-insight-stage"
									className="text-sm font-medium text-[var(--vscode-foreground)]">
									Stage
								</label>
								<Select
									value={insightForm.stage}
									onValueChange={(value) =>
										handleInsightInputChange("stage", value as OuterGateInsightStage)
									}>
									<SelectTrigger id="outer-gate-insight-stage" className="w-full">
										<SelectValue placeholder="Select stage" />
									</SelectTrigger>
									<SelectContent>
										{insightStageOptions.map(({ value, label }) => (
											<SelectItem key={value} value={value}>
												{label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="flex flex-col gap-2">
								<label
									htmlFor="outer-gate-insight-summary"
									className="text-sm font-medium text-[var(--vscode-foreground)]">
									Summary (optional)
								</label>
								<Textarea
									id="outer-gate-insight-summary"
									value={insightForm.summary}
									onChange={(event) => handleInsightInputChange("summary", event.target.value)}
									placeholder="Add a short summary or leave blank"
									rows={3}
								/>
							</div>
							<div className="flex flex-col gap-2">
								<label
									htmlFor="outer-gate-insight-workspace"
									className="text-sm font-medium text-[var(--vscode-foreground)]">
									Recommended workspace (optional)
								</label>
								<Input
									id="outer-gate-insight-workspace"
									value={insightForm.recommendedWorkspace}
									onChange={(event) =>
										handleInsightInputChange("recommendedWorkspace", event.target.value)
									}
									placeholder="Unassigned"
								/>
							</div>
							{insightError && (
								<p className="text-sm text-[color-mix(in_srgb,var(--vscode-editorError-foreground,#ff6b6b)_82%,rgba(255,255,255,0.2)_18%)]">
									{insightError}
								</p>
							)}
						</div>

						<DialogFooter>
							<Button type="button" variant="secondary" onClick={() => handleInsightModalChange(false)}>
								Cancel
							</Button>
							<Button type="submit" disabled={isInsightSubmitting}>
								{isInsightSubmitting ? (
									<span className="flex items-center gap-2">
										<span className="codicon codicon-sync animate-spin" aria-hidden /> Saving…
									</span>
								) : (
									"Save Insight"
								)}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<AlertDialog
				open={Boolean(insightToDelete)}
				onOpenChange={(open) => {
					if (!open) {
						setInsightToDelete(null)
						setIsInsightDeletePending(false)
					}
				}}>
				<AlertDialogContent className="max-w-sm">
					<AlertDialogHeader>
						<AlertDialogTitle>Delete {insightToDelete?.title ?? "this insight"}?</AlertDialogTitle>
						<AlertDialogDescription className="text-sm text-[color-mix(in_srgb,var(--vscode-foreground)_82%,rgba(255,255,255,0.18)_18%)]">
							This permanently removes the insight from your recent captures. You can always capture a new
							one later, but this action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel asChild>
							<Button type="button" variant="secondary">
								Keep Insight
							</Button>
						</AlertDialogCancel>
						<AlertDialogAction asChild>
							<Button
								variant="destructive"
								onClick={handleDeleteInsightConfirm}
								disabled={isInsightDeletePending}>
								{isInsightDeletePending ? (
									<span className="flex items-center gap-2">
										<span className="codicon codicon-sync animate-spin" aria-hidden /> Removing…
									</span>
								) : (
									<span className="flex items-center gap-2">
										<span className="codicon codicon-trash" aria-hidden /> Delete Insight
									</span>
								)}
							</Button>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<Dialog open={isEditCompanyModalOpen} onOpenChange={handleEditCompanyModalChange}>
				<DialogContent className="max-w-lg">
					<form onSubmit={handleEditCompanySubmit} className="space-y-5" aria-busy={isEditSubmitting}>
						<DialogHeader>
							<DialogTitle>Edit {editCompanyLabel}</DialogTitle>
						</DialogHeader>

						<div className="space-y-4">
							<div className="flex flex-col gap-2">
								<label
									htmlFor="edit-company-name"
									className="text-sm font-medium text-[var(--vscode-foreground)]">
									Company name
								</label>
								<Input
									id="edit-company-name"
									value={editCompanyForm.name}
									onChange={(event) =>
										setEditCompanyForm((prev) => ({ ...prev, name: event.target.value }))
									}
									autoFocus
									disabled={isEditSubmitting}
									placeholder="Northwind Ventures"
								/>
							</div>

							<div className="flex flex-col gap-2">
								<label
									htmlFor="edit-company-emoji"
									className="text-sm font-medium text-[var(--vscode-foreground)]">
									Company emoji (optional)
								</label>
								<EmojiPickerField
									id="edit-company-emoji"
									value={editCompanyForm.emoji}
									onChange={(event) =>
										setEditCompanyForm((prev) => ({ ...prev, emoji: event.target.value }))
									}
									onEmojiSelect={(emoji) => setEditCompanyForm((prev) => ({ ...prev, emoji }))}
									disabled={isEditSubmitting}
									placeholder="🚀"
									maxLength={4}
								/>
							</div>

							<div className="flex flex-col gap-2">
								<label
									htmlFor="edit-company-description"
									className="text-sm font-medium text-[var(--vscode-foreground)]">
									Company description (optional)
								</label>
								<Textarea
									id="edit-company-description"
									value={editCompanyForm.description}
									onChange={(event) =>
										setEditCompanyForm((prev) => ({ ...prev, description: event.target.value }))
									}
									disabled={isEditSubmitting}
									placeholder="Summarize what this workspace is for."
									rows={3}
								/>
							</div>

							<div className="flex flex-col gap-2">
								<label
									htmlFor="edit-company-mission"
									className="text-sm font-medium text-[var(--vscode-foreground)]">
									Mission statement
								</label>
								<Textarea
									id="edit-company-mission"
									value={editCompanyForm.mission}
									onChange={(event) =>
										setEditCompanyForm((prev) => ({ ...prev, mission: event.target.value }))
									}
									disabled={isEditSubmitting}
									placeholder="Give Clover a guiding objective for this team."
									rows={3}
								/>
							</div>

							<div className="flex flex-col gap-2">
								<label
									htmlFor="edit-company-vision"
									className="text-sm font-medium text-[var(--vscode-foreground)]">
									Vision (optional)
								</label>
								<Textarea
									id="edit-company-vision"
									value={editCompanyForm.vision}
									onChange={(event) =>
										setEditCompanyForm((prev) => ({ ...prev, vision: event.target.value }))
									}
									disabled={isEditSubmitting}
									placeholder="Paint the future state you want Clover to steer toward."
									rows={3}
								/>
							</div>

							{editCompanyError && (
								<p className="text-xs text-[var(--vscode-errorForeground)]">{editCompanyError}</p>
							)}
						</div>

						<DialogFooter>
							<Button
								type="button"
								variant="ghost"
								onClick={() => handleEditCompanyModalChange(false)}
								disabled={isEditSubmitting}>
								Cancel
							</Button>
							<Button type="submit" disabled={isEditCompanySubmitDisabled || isEditSubmitting}>
								{isEditSubmitting ? (
									<>
										<span className="codicon codicon-sync animate-spin" aria-hidden /> Saving…
									</>
								) : (
									"Save changes"
								)}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog open={isCreateCompanyModalOpen} onOpenChange={handleCreateCompanyModalChange}>
				<DialogContent className="max-w-lg">
					<form onSubmit={handleCreateCompanySubmit} className="space-y-5">
						<DialogHeader>
							<DialogTitle>Spin up a company</DialogTitle>
						</DialogHeader>

						<div className="space-y-4">
							<div className="flex flex-col gap-2">
								<label
									htmlFor="create-company-name"
									className="text-sm font-medium text-[var(--vscode-foreground)]">
									Company name
								</label>
								<Input
									id="create-company-name"
									value={createCompanyForm.name}
									onChange={(event) => {
										setCreateCompanyForm((prev) => ({ ...prev, name: event.target.value }))
										if (createCompanyError) {
											setCreateCompanyError(undefined)
										}
									}}
									placeholder="Northwind Ventures"
									autoFocus
								/>
							</div>

							<div className="flex flex-col gap-2">
								<label
									htmlFor="create-company-emoji"
									className="text-sm font-medium text-[var(--vscode-foreground)]">
									Company emoji (optional)
								</label>
								<EmojiPickerField
									id="create-company-emoji"
									value={createCompanyForm.emoji}
									onChange={(event) =>
										setCreateCompanyForm((prev) => ({ ...prev, emoji: event.target.value }))
									}
									onEmojiSelect={(emoji) => setCreateCompanyForm((prev) => ({ ...prev, emoji }))}
									placeholder="🚀"
									maxLength={4}
								/>
							</div>

							<div className="flex flex-col gap-2">
								<label
									htmlFor="create-company-description"
									className="text-sm font-medium text-[var(--vscode-foreground)]">
									Company description (optional)
								</label>
								<Textarea
									id="create-company-description"
									value={createCompanyForm.description}
									onChange={(event) =>
										setCreateCompanyForm((prev) => ({ ...prev, description: event.target.value }))
									}
									placeholder="Summarize what this workspace is for."
									rows={3}
								/>
							</div>

							<div className="flex flex-col gap-2">
								<label
									htmlFor="create-company-mission"
									className="text-sm font-medium text-[var(--vscode-foreground)]">
									Mission statement
								</label>
								<Textarea
									id="create-company-mission"
									value={createCompanyForm.mission}
									onChange={(event) =>
										setCreateCompanyForm((prev) => ({ ...prev, mission: event.target.value }))
									}
									placeholder="Give Clover a guiding objective for this team."
									rows={3}
								/>
							</div>

							<div className="flex flex-col gap-2">
								<label
									htmlFor="create-company-vision"
									className="text-sm font-medium text-[var(--vscode-foreground)]">
									Vision (optional)
								</label>
								<Textarea
									id="create-company-vision"
									value={createCompanyForm.vision}
									onChange={(event) =>
										setCreateCompanyForm((prev) => ({ ...prev, vision: event.target.value }))
									}
									placeholder="Paint the future state you want Clover to steer toward."
									rows={3}
								/>
							</div>

							{createCompanyError && (
								<p className="text-xs text-[var(--vscode-errorForeground)]">{createCompanyError}</p>
							)}
						</div>

						<DialogFooter>
							<Button type="button" variant="ghost" onClick={() => handleCreateCompanyModalChange(false)}>
								Cancel
							</Button>
							<Button type="submit" disabled={isCreateCompanySubmitDisabled}>
								Create company
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	)
}

export default OuterGateView
