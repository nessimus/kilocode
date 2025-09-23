import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import clsx from "clsx"

import { useExtensionState } from "@/context/ExtensionStateContext"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import OuterGateCloverConsole from "./OuterGateCloverConsole"
import {
	defaultOuterGateState,
	OuterGateCloverSessionSummary,
	OuterGateInsight,
	type OuterGateIntegration,
} from "@roo/golden/outerGate"
import { cn } from "@/lib/utils"

import "./outer-gate.css"

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
}

const integrationStatusVariant: Record<OuterGateIntegration["status"], "default" | "secondary" | "outline"> = {
	connected: "default",
	not_connected: "secondary",
	coming_soon: "outline",
}

const OuterGateView: React.FC = () => {
	const {
		outerGateState,
		sendOuterGateMessage,
		triggerOuterGateAction,
		workplaceState,
		createCompany,
		selectCompany,
		createCloverSession,
		activateCloverSession,
		loadMoreCloverSessions,
	} = useExtensionState()
	const resolvedState = outerGateState ?? defaultOuterGateState
	const [createCompanyForm, setCreateCompanyForm] = useState({ name: "", mission: "", vision: "" })
	const [createCompanyError, setCreateCompanyError] = useState<string | undefined>()
	const [isCreateCompanyModalOpen, setIsCreateCompanyModalOpen] = useState(false)

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

	const cloverSessionEntries = cloverSessions?.entries ?? []
	const hasMoreCloverSessions = cloverSessions?.hasMore ?? false
	const isLoadingCloverSessions = cloverSessions?.isLoading ?? false
	const cloverSessionCursor = cloverSessions?.cursor
	const cloverSessionsLoaded = cloverSessions?.isInitialFetchComplete ?? false

	const handleCheckIn = useCallback(
		(companyId?: string, companyName?: string) => {
			const trimmedName = companyName?.trim()
			const resolvedCompanyId =
				companyId ||
				(trimmedName ? courtyardCompanies.find((entry) => entry.name?.trim() === trimmedName)?.id : undefined)

			if (resolvedCompanyId) {
				selectCompany(resolvedCompanyId)
			}

			window.postMessage({ type: "action", action: "switchTab", tab: "lobby" }, "*")
			window.postMessage({ type: "action", action: "focusChatInput" }, "*")
		},
		[courtyardCompanies, selectCompany],
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
			window.postMessage({ type: "action", action: "switchTab", tab: "lobby" }, "*")
			window.postMessage({ type: "action", action: "focusChatInput" }, "*")
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
			setCreateCompanyForm({ name: "", mission: "", vision: "" })
			setCreateCompanyError(undefined)
		}
	}, [])

	const handleQuickAction = (slug: string) => {
		if (slug === "create-company") {
			handleCreateCompanyModalChange(true)
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

		createCompany({
			name: trimmedName,
			mission: createCompanyForm.mission.trim() || undefined,
			vision: createCompanyForm.vision.trim() || undefined,
		})

		handleCreateCompanyModalChange(false)
	}

	const handlePromptInsert = useCallback(
		(prompt: string) => {
			const text = prompt.trim()
			if (!text) {
				return
			}
			createCloverSession(activeCompanyContext)
			window.postMessage(
				{
					type: "outerGatePrefillDraft",
					text,
					replace: true,
					focus: true,
				},
				"*",
			)
		},
		[activeCompanyContext, createCloverSession],
	)

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

	return (
		<div className="relative flex h-full w-full overflow-hidden">
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

						{suggestions.length > 0 && (
							<section>
								<Card className="border-transparent bg-[color-mix(in_srgb,var(--vscode-editor-background)_78%,rgba(255,255,255,0.1)_22%)] shadow-[0_18px_36px_rgba(10,6,0,0.24)]">
									<CardHeader>
										<CardTitle className="text-base font-semibold text-[color-mix(in_srgb,var(--vscode-foreground)_86%,rgba(255,255,255,0.12)_14%)]">
											Suggested Prompts
										</CardTitle>
										<CardDescription className="text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_68%,rgba(255,255,255,0.2)_32%)]">
											Use these to jump-start Clover’s analysis.
										</CardDescription>
									</CardHeader>
									<CardContent className="flex flex-wrap gap-2">
										{suggestions.map((suggestion) => (
											<Button
												key={suggestion}
												variant="outline"
												className="rounded-full border-[color-mix(in_srgb,var(--primary)_22%,rgba(255,255,255,0.22)_78%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_85%,rgba(255,255,255,0.08)_15%)] px-4 py-2 text-xs font-medium text-[color-mix(in_srgb,var(--vscode-foreground)_72%,rgba(255,255,255,0.2)_28%)] hover:border-[color-mix(in_srgb,var(--primary)_34%,rgba(255,255,255,0.3)_66%)]"
												onClick={() => handlePromptInsert(suggestion)}>
												{suggestion}
											</Button>
										))}
									</CardContent>
								</Card>
							</section>
						)}

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
												const leadingSymbol = trimmedName.match(/^[^\w\s]/u)?.[0]
												const companyIcon = leadingSymbol ?? "🏛️"
												const remainder = leadingSymbol
													? trimmedName.slice(leadingSymbol.length)
													: ""
												const companyLabel =
													remainder && /^\s/.test(remainder)
														? remainder.trimStart() || trimmedName
														: trimmedName || "Untitled Company"
												const mission = company.mission?.trim() || company.vision?.trim()
												const employeeCount = formatNumber(company.employees.length)
												const departmentCount = formatNumber(company.departments.length)
												const teamCount = formatNumber(company.teams.length)
												return (
													<div
														key={company.id}
														className="flex min-w-[280px] max-w-[320px] snap-start flex-col justify-between gap-4 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_12%,rgba(255,255,255,0.18)_88%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_84%,rgba(255,255,255,0.08)_16%)] p-5 shadow-[0_16px_32px_rgba(8,5,1,0.24)] transition-transform hover:-translate-y-[2px]">
														<div className="flex flex-col gap-4">
															<div className="flex items-start gap-3">
																<span className="text-3xl leading-none">
																	{companyIcon}
																</span>
																<div className="min-w-0">
																	<h3 className="truncate text-base font-semibold text-[color-mix(in_srgb,var(--vscode-foreground)_90%,rgba(255,255,255,0.1)_10%)]">
																		{companyLabel}
																	</h3>
																	<p className="text-[11px] uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--vscode-foreground)_52%,rgba(255,255,255,0.28)_48%)]">
																		Updated {formatDayTime(company.updatedAt)}
																	</p>
																</div>
															</div>
															<p className="line-clamp-3 text-sm leading-relaxed text-[color-mix(in_srgb,var(--vscode-foreground)_70%,rgba(255,255,255,0.22)_30%)]">
																{mission ??
																	"Set a mission so Clover knows where to guide your check-ins."}
															</p>
														</div>
														<div className="flex flex-col gap-3">
															<div className="flex flex-wrap gap-2 text-[0.68rem] uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--vscode-foreground)_54%,rgba(255,255,255,0.26)_46%)]">
																<Badge
																	variant="outline"
																	className="border-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.24)_82%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_80%,rgba(255,255,255,0.1)_20%)] px-3 py-1 text-[0.62rem] text-[color-mix(in_srgb,var(--primary)_58%,rgba(255,255,255,0.24)_42%)]">
																	<span className="inline-flex items-center gap-1">
																		<span className="codicon codicon-person" />{" "}
																		{employeeCount} teammates
																	</span>
																</Badge>
																<Badge
																	variant="outline"
																	className="border-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.24)_82%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_80%,rgba(255,255,255,0.1)_20%)] px-3 py-1 text-[0.62rem] text-[color-mix(in_srgb,var(--primary)_58%,rgba(255,255,255,0.24)_42%)]">
																	<span className="inline-flex items-center gap-1">
																		<span className="codicon codicon-organization" />{" "}
																		{departmentCount} departments
																	</span>
																</Badge>
																<Badge
																	variant="outline"
																	className="border-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.24)_82%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_80%,rgba(255,255,255,0.1)_20%)] px-3 py-1 text-[0.62rem] text-[color-mix(in_srgb,var(--primary)_58%,rgba(255,255,255,0.24)_42%)]">
																	<span className="inline-flex items-center gap-1">
																		<span className="codicon codicon-versions" />{" "}
																		{teamCount} teams
																	</span>
																</Badge>
															</div>
															<Button
																variant="secondary"
																className="w-full items-center justify-center gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_24%,rgba(255,255,255,0.26)_76%)] bg-[color-mix(in_srgb,var(--primary)_78%,rgba(255,255,255,0.08)_22%)] py-2.5 text-sm font-semibold text-[color-mix(in_srgb,var(--primary-foreground,#211703)_88%,rgba(255,255,255,0.08)_12%)] shadow-[0_16px_32px_rgba(212,175,55,0.32)] hover:-translate-y-[1px] hover:bg-[color-mix(in_srgb,var(--primary)_84%,rgba(255,255,255,0.12)_16%)]"
																onClick={() =>
																	handleCheckIn(
																		company.id,
																		companyLabel || company.name,
																	)
																}>
																Check-In Now
																<span className="codicon codicon-location" />
															</Button>
														</div>
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
												Pick up where you left off or spin up a fresh concierge thread.
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
										<div className="grid gap-3 md:grid-cols-2">
											{[0, 1, 2, 3].map((index) => (
												<div
													key={index}
													className="flex flex-col gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_12%,rgba(255,255,255,0.18)_88%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_84%,rgba(255,255,255,0.08)_16%)] p-4 shadow-[0_16px_32px_rgba(8,5,1,0.18)] animate-pulse">
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
											<div className="grid gap-3 md:grid-cols-2">
												{cloverSessionEntries.map((session) => {
													const isActive = session.id === activeCloverSessionId
													return (
														<div
															key={session.id}
															className={clsx(
																"flex flex-col justify-between gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_12%,rgba(255,255,255,0.18)_88%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_84%,rgba(255,255,255,0.1)_16%)] p-4 shadow-[0_16px_32px_rgba(8,5,1,0.22)] transition-transform hover:-translate-y-[1px]",
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
																{session.companyName && (
																	<Badge
																		variant="outline"
																		className="whitespace-nowrap rounded-full border-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.28)_82%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_80%,rgba(255,255,255,0.1)_20%)] px-3 py-1 text-[0.62rem] uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--primary)_58%,rgba(255,255,255,0.24)_42%)]">
																		{session.companyName}
																	</Badge>
																)}
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
											</div>
											{hasMoreCloverSessions && <div ref={loadMoreSentinelRef} className="h-1" />}
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
											onClick={() => {}}>
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
														<Badge
															variant="outline"
															className={cn(
																"border-none px-3 py-1 text-[0.65rem] uppercase tracking-[0.22em]",
																stageVariantMap[insight.stage],
															)}>
															{insightStageLabel[insight.stage] ?? insight.stage}
														</Badge>
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
														<div className="flex items-center justify-end">
															<Button
																variant="ghost"
																size="sm"
																className="ml-auto inline-flex items-center gap-1 rounded-xl border border-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.24)_82%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_78%,rgba(255,255,255,0.12)_22%)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-[color-mix(in_srgb,var(--primary)_62%,rgba(255,255,255,0.22)_38%)] shadow-[0_10px_22px_rgba(12,8,2,0.24)] transition-transform hover:-translate-y-[1px] hover:border-[color-mix(in_srgb,var(--primary)_28%,rgba(255,255,255,0.3)_72%)]"
																onClick={() => {}}>
																Details
																<span
																	className="codicon codicon-chevron-right"
																	aria-hidden
																/>
															</Button>
														</div>
													</div>
												</div>
											))}
										</div>
									)}
								</CardContent>
							</Card>

							<Card className="border-transparent bg-[color-mix(in_srgb,var(--vscode-editor-background)_80%,rgba(255,255,255,0.1)_20%)] shadow-[0_20px_44px_rgba(10,6,0,0.26)]">
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

					<div className="flex min-h-0 flex-col">
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
