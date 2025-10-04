import React, { useCallback, useMemo, useState } from "react"
import clsx from "clsx"

import {
	VSCodeButton,
	VSCodeDropdown,
	VSCodeOption,
	VSCodeTextArea,
	VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react"

import { useExtensionState } from "@/context/ExtensionStateContext"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { WorkforceCanvas } from "@/components/workplace/WorkforceCanvas"

import type {
	WorkplaceActionItem,
	WorkplaceCompany,
	WorkplaceDepartment,
	WorkplaceEmployee,
	WorkplaceTeam,
} from "@roo/golden/workplace"

interface WorkforceHubViewProps {
	isHidden?: boolean
}

type HubTab = "agents" | "projects" | "playbooks" | "money" | "ideas"

interface MetricSummary {
	title: string
	value: string
	deltaLabel?: string
}

interface SpendBreakdownRow {
	id?: string
	label: string
	amount: number
	percentage: number
}

interface CandidateSuggestion {
	id: string
	name: string
	avatar: string
	role: string
	summary: string
	background: string
	focusAreas: string[]
	intro: string
}

const CANDIDATE_SEEDS: Array<{
	name: string
	avatar: string
	defaultRole: string
	background: string
	focusAreas: string[]
	intro: string
}> = [
	{
		name: "Avery Hill",
		avatar: "🧭",
		defaultRole: "Operations Strategist",
		background:
			"Scaled a solo founder from 0 → 120 deliverables/month by wiring automation checkpoints and async updates.",
		focusAreas: ["Planning cadences", "Process automation", "Client updates"],
		intro: "Calm operator who keeps the workflows humming while spotting blockers early.",
	},
	{
		name: "Nova Chen",
		avatar: "🪐",
		defaultRole: "Creative Content Partner",
		background:
			"Ghostwrote launch campaigns and weekly newsletters with consistent brand voice across three ventures.",
		focusAreas: ["Story arcs", "Repurposing", "Channel strategy"],
		intro: "Story-driven collaborator who turns scattered notes into publish-ready assets fast.",
	},
	{
		name: "Rowan Blake",
		avatar: "🛠️",
		defaultRole: "Product Systems Builder",
		background: "Connected support, billing, and onboarding data into one dashboard so founders could ship faster.",
		focusAreas: ["Workflow design", "Documentation", "Automation"],
		intro: "Systems thinker who loves reducing manual steps and surfacing what matters most.",
	},
	{
		name: "Isla Marin",
		avatar: "📣",
		defaultRole: "Community Growth Lead",
		background: "Grew a creator community to 5K engaged members with thoughtful outreach and recap loops.",
		focusAreas: ["Community ops", "Engagement", "Insights"],
		intro: "Connector who nurtures conversations and turns feedback into action items.",
	},
	{
		name: "Kai Flores",
		avatar: "🧾",
		defaultRole: "Finance & Ops Analyst",
		background:
			"Built simple dashboards that tracked spend vs. runway and flagged contract renewals automatically.",
		focusAreas: ["Budget tracking", "Scenario planning", "Vendor coordination"],
		intro: "Numbers-minded partner who keeps budgets clear without burying you in spreadsheets.",
	},
	{
		name: "Mila Ortiz",
		avatar: "🎨",
		defaultRole: "Design Sprint Partner",
		background:
			"Delivered pitch decks, social frames, and landing pages while keeping a shared brand library up to date.",
		focusAreas: ["Visual storytelling", "Brand systems", "Rapid prototyping"],
		intro: "Visual builder who matches the founder’s vibe across every asset.",
	},
	{
		name: "Jules Mercer",
		avatar: "🧪",
		defaultRole: "Experiment Architect",
		background: "Drafted test plans, tracked results, and translated learnings into next-step playbooks.",
		focusAreas: ["Experiment design", "Analytics", "Iteration"],
		intro: "Test-and-learn partner who keeps experiments tidy and actionable.",
	},
	{
		name: "Ember Ray",
		avatar: "⚡",
		defaultRole: "Support Success Lead",
		background: "Cleared customer queues with tone-perfect replies and escalated only the tricky edge cases.",
		focusAreas: ["Inbox triage", "Knowledge base", "Customer delights"],
		intro: "Customer-first teammate who resolves issues fast and captures insights for improvements.",
	},
]

const toTitleCase = (value: string) =>
	value
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(" ")

const extractKeywords = (text: string, limit = 3) => {
	if (!text.trim()) return []
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, "")
		.split(/\s+/)
		.filter((word) => word.length > 3)
		.slice(0, limit)
		.map(toTitleCase)
}

const generateCandidateSuggestions = (options: {
	company: WorkplaceCompany
	requestText: string
	roleHint?: string
	mode: "describe" | "askExec"
	executiveName?: string
}): CandidateSuggestion[] => {
	const { company, requestText, roleHint, mode, executiveName } = options
	const keywords = extractKeywords(requestText || roleHint || "")
	const requestSummary = requestText.trim() || roleHint?.trim() || "a new teammate"
	const pool = [...CANDIDATE_SEEDS]
	const suggestions: CandidateSuggestion[] = []
	const random = () => Math.floor(Math.random() * pool.length)
	const companyName = company.name

	for (let i = 0; i < 3 && pool.length > 0; i += 1) {
		const seedIndex = pool.length === 1 ? 0 : random()
		const seed = pool.splice(seedIndex, 1)[0]
		const role = roleHint?.trim() ? toTitleCase(roleHint.trim()) : seed.defaultRole
		const focusAreas = [...new Set([...(keywords.length ? keywords : seed.focusAreas), ...seed.focusAreas])].slice(
			0,
			4,
		)
		const summary =
			mode === "askExec" && executiveName
				? `${executiveName} suggests ${seed.name} to cover ${requestSummary} and keep your ${companyName} goals on track.`
				: `${seed.name} can take point on ${requestSummary} so you can stay focused on what’s next.`

		suggestions.push({
			id: `${seed.name.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}-${i}`,
			name: seed.name,
			avatar: seed.avatar,
			role,
			summary,
			background: seed.background,
			focusAreas,
			intro: seed.intro,
		})
	}

	return suggestions
}

const CURRENCY_FORMATTER = new Intl.NumberFormat(undefined, {
	style: "currency",
	currency: "USD",
	maximumFractionDigits: 2,
})

const formatCurrency = (value: number) => CURRENCY_FORMATTER.format(value)

const PRECISE_CURRENCY_FORMATTER = new Intl.NumberFormat(undefined, {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 4,
	maximumFractionDigits: 4,
})

const formatPreciseCurrency = (value: number) => PRECISE_CURRENCY_FORMATTER.format(value)

const formatDuration = (hours: number | undefined) => {
	if (!hours || Number.isNaN(hours) || hours <= 0) {
		return "--"
	}
	const totalMinutes = Math.round(hours * 60)
	const wholeHours = Math.floor(totalMinutes / 60)
	const minutes = totalMinutes % 60
	if (wholeHours === 0) {
		return `${minutes}m`
	}
	if (minutes === 0) {
		return `${wholeHours}h`
	}
	return `${wholeHours}h ${minutes}m`
}

const minutesToTime = (minutes: number | undefined) => {
	if (typeof minutes !== "number" || Number.isNaN(minutes)) {
		return undefined
	}
	const hours = Math.floor(minutes / 60)
	const mins = minutes % 60
	const label = `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`
	return label
}

const getActionItemCost = (item: WorkplaceActionItem): number => {
	if (!item.customProperties) {
		return 0
	}
	let cost = 0
	for (const [key, rawValue] of Object.entries(item.customProperties)) {
		if (!/cost|spend|budget/i.test(key)) {
			continue
		}
		if (typeof rawValue === "number") {
			cost += rawValue
			continue
		}
		if (typeof rawValue === "string") {
			const parsed = Number(rawValue.replace(/[^0-9.-]/g, ""))
			if (!Number.isNaN(parsed)) {
				cost += parsed
			}
		}
	}
	return cost
}

const findDefaultStatusId = (company?: WorkplaceCompany) => {
	if (!company) return undefined
	const sorted = [...company.actionStatuses].sort((a, b) => a.order - b.order)
	return sorted.find((status) => !status.isTerminal)?.id ?? sorted[0]?.id
}

const WorkforceHubView: React.FC<WorkforceHubViewProps> = ({ isHidden = false }) => {
	const { t } = useAppTranslation()
	const {
		workplaceState,
		createEmployee,
		createActionItem,
		assignEmployeeToTeam,
		assignTeamToDepartment,
		removeEmployeeFromTeam,
		createDepartment,
		createTeam,
		updateDepartment,
		updateTeam,
		updateEmployee,
		archiveDepartment,
		archiveTeam,
		archiveEmployee,
		setActiveEmployee,
		createCompany,
		selectCompany,
		workplaceSpend,
		taskHistory,
	} = useExtensionState()

	const companies = useMemo(() => workplaceState?.companies ?? [], [workplaceState?.companies])
	const activeCompanyId = workplaceState?.activeCompanyId
	const activeCompany = useMemo<WorkplaceCompany | undefined>(() => {
		if (!companies.length) return undefined
		return companies.find((company) => company.id === activeCompanyId) ?? companies[0]
	}, [companies, activeCompanyId])

	const employees = useMemo(() => activeCompany?.employees ?? [], [activeCompany?.employees])
	const teams = useMemo(() => activeCompany?.teams ?? [], [activeCompany?.teams])
	const departments = useMemo(() => activeCompany?.departments ?? [], [activeCompany?.departments])
	const actionItems = useMemo(() => activeCompany?.actionItems ?? [], [activeCompany?.actionItems])
	const actionStatuses = useMemo(() => activeCompany?.actionStatuses ?? [], [activeCompany?.actionStatuses])

	const spendEntry = useMemo(() => {
		if (!activeCompanyId) {
			return undefined
		}
		return workplaceSpend?.[activeCompanyId]
	}, [activeCompanyId, workplaceSpend])

	const fallbackMonthSpend = useMemo(() => {
		if (!actionItems) {
			return 0
		}
		const now = new Date()
		const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
		firstOfMonth.setHours(0, 0, 0, 0)

		let total = 0
		for (const item of actionItems) {
			const updatedAt = new Date(item.updatedAt)
			if (Number.isNaN(updatedAt.getTime())) {
				continue
			}
			if (updatedAt >= firstOfMonth) {
				total += getActionItemCost(item)
			}
		}
		return total
	}, [actionItems])

	const monthSpendValue = spendEntry?.monthToDateCost ?? fallbackMonthSpend

	const normalizeWorkspacePath = React.useCallback((value: string | undefined) => {
		if (!value) return undefined
		return value
			.replace(/\\/g, "/")
			.replace(/\/+$|\\+$/g, "")
			.toLowerCase()
	}, [])

	const spendTasks = React.useMemo(() => {
		if (!taskHistory) {
			return []
		}
		const normalizedWorkspace = normalizeWorkspacePath(spendEntry?.workspacePath)
		const firstOfMonth = new Date()
		firstOfMonth.setDate(1)
		firstOfMonth.setHours(0, 0, 0, 0)
		const cutoff = firstOfMonth.getTime()
		return taskHistory
			.filter((item) => {
				if (!item || typeof item.totalCost !== "number" || item.totalCost <= 0) {
					return false
				}
				if (normalizedWorkspace) {
					return normalizeWorkspacePath(item.workspace) === normalizedWorkspace
				}
				return true
			})
			.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
			.map((item) => ({
				id: item.id,
				title: item.task,
				ts: item.ts ?? Date.now(),
				totalCost: item.totalCost,
				isCurrentMonth: (item.ts ?? 0) >= cutoff,
			}))
	}, [normalizeWorkspacePath, spendEntry?.workspacePath, taskHistory])

	const receiptMonthTotal = React.useMemo(
		() => spendTasks.filter((item) => item.isCurrentMonth).reduce((sum, item) => sum + item.totalCost, 0),
		[spendTasks],
	)

	const [showSpendReceipt, setShowSpendReceipt] = useState(false)

	const [selectedTab, setSelectedTab] = useState<HubTab>("agents")
	const [showProjectDialog, setShowProjectDialog] = useState(false)
	const [showHireDialog, setShowHireDialog] = useState(false)
	const [projectTitle, setProjectTitle] = useState("")
	const [projectNotes, setProjectNotes] = useState("")
	const [projectOwnerId, setProjectOwnerId] = useState<string | undefined>(undefined)
	const [projectStatusId, setProjectStatusId] = useState<string | undefined>(() => findDefaultStatusId(activeCompany))
	const [projectError, setProjectError] = useState<string | undefined>(undefined)
	const [ideaTitle, setIdeaTitle] = useState("")
	const [ideaNotes, setIdeaNotes] = useState("")
	const [ideaError, setIdeaError] = useState<string | undefined>(undefined)
	const [hireStage, setHireStage] = useState<"collect" | "review">("collect")
	const [hireMode, setHireMode] = useState<"describe" | "askExec">("describe")
	const [hireRequest, setHireRequest] = useState("")
	const [hireRoleHint, setHireRoleHint] = useState("")
	const [hireContext, setHireContext] = useState("")
	const [candidateOptions, setCandidateOptions] = useState<CandidateSuggestion[]>([])
	const [followUpRequest, setFollowUpRequest] = useState("")
	const [generatingCandidates, setGeneratingCandidates] = useState(false)
	const [hireError, setHireError] = useState<string | undefined>(undefined)
	const [lastHirePrompt, setLastHirePrompt] = useState("")

	const executiveManager = useMemo(() => {
		if (!activeCompany?.executiveManagerId) {
			return undefined
		}
		return employees.find((employee) => employee.id === activeCompany.executiveManagerId)
	}, [activeCompany?.executiveManagerId, employees])

	const executiveName =
		executiveManager?.name ?? t("workforceHub:executiveManager", { defaultValue: "Executive Manager" })

	const terminalStatusIds = useMemo(() => {
		return new Set((actionStatuses ?? []).filter((status) => status.isTerminal).map((status) => status.id))
	}, [actionStatuses])

	const metrics: MetricSummary[] = useMemo(() => {
		if (!activeCompany) {
			return [
				{ title: t("workforceHub:metrics.agents", { defaultValue: "Active agents" }), value: "0" },
				{ title: t("workforceHub:metrics.departments", { defaultValue: "Departments" }), value: "0" },
				{ title: t("workforceHub:metrics.teams", { defaultValue: "Teams" }), value: "0" },
				{ title: t("workforceHub:metrics.unassigned", { defaultValue: "Unassigned agents" }), value: "0" },
				{
					title: t("workforceHub:metrics.newHires", { defaultValue: "New hires" }),
					value: "0",
					deltaLabel: t("workforceHub:metrics.sevenDays", { defaultValue: "past 7 days" }) as string,
				},
				{
					title: t("workforceHub:metrics.projects", { defaultValue: "Projects completed" }),
					value: "0",
					deltaLabel: t("workforceHub:metrics.projectsTrailing", { defaultValue: "past 7 days" }) as string,
				},
				{ title: t("workforceHub:metrics.turnaround", { defaultValue: "Avg turnaround" }), value: "--" },
				{
					title: t("workforceHub:metrics.spend", { defaultValue: "Month-to-date spend" }),
					value: formatCurrency(0),
				},
			]
		}

		const now = new Date()
		const weekAgo = new Date(now)
		weekAgo.setDate(now.getDate() - 7)
		const hireCutoff = new Date(now)
		hireCutoff.setDate(now.getDate() - 7)

		let completedThisWeek = 0
		const completedDurations: number[] = []

		for (const item of actionItems ?? []) {
			if (item.kind === "project" && terminalStatusIds.has(item.statusId)) {
				const updatedAt = new Date(item.updatedAt)
				if (updatedAt >= weekAgo) {
					completedThisWeek += 1
				}
				const createdAt = new Date(item.createdAt)
				if (!Number.isNaN(updatedAt.getTime()) && !Number.isNaN(createdAt.getTime())) {
					const hours = (updatedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60)
					if (hours > 0) {
						completedDurations.push(hours)
					}
				}
			}
		}

		const averageTurnaroundHours = completedDurations.length
			? completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length
			: undefined
		const llmMonthSpend = spendEntry?.monthToDateCost ?? fallbackMonthSpend

		const assignedIds = new Set<string>()
		teams.forEach((team) => {
			;(team.memberships ?? []).forEach((membership) => {
				if (!membership.removedAt) {
					assignedIds.add(membership.employeeId)
				}
			})
		})
		const unassignedCount = employees.filter((employee) => !assignedIds.has(employee.id)).length
		const newHiresCount = employees.filter((employee) => {
			const createdAt = new Date(employee.createdAt)
			return !Number.isNaN(createdAt.getTime()) && createdAt >= hireCutoff
		}).length

		return [
			{
				title: t("workforceHub:metrics.agents", { defaultValue: "Active agents" }),
				value: `${employees.length}`,
			},
			{
				title: t("workforceHub:metrics.departments", { defaultValue: "Departments" }),
				value: `${departments.length}`,
			},
			{
				title: t("workforceHub:metrics.teams", { defaultValue: "Teams" }),
				value: `${teams.length}`,
			},
			{
				title: t("workforceHub:metrics.unassigned", { defaultValue: "Unassigned agents" }),
				value: `${unassignedCount}`,
			},
			{
				title: t("workforceHub:metrics.newHires", { defaultValue: "New hires" }),
				value: `${newHiresCount}`,
				deltaLabel: t("workforceHub:metrics.sevenDays", { defaultValue: "past 7 days" }) as string,
			},
			{
				title: t("workforceHub:metrics.projects", { defaultValue: "Projects completed" }),
				value: `${completedThisWeek}`,
				deltaLabel: t("workforceHub:metrics.projectsTrailing", { defaultValue: "past 7 days" }) as string,
			},
			{
				title: t("workforceHub:metrics.turnaround", { defaultValue: "Avg turnaround" }),
				value: formatDuration(averageTurnaroundHours),
			},
			{
				title: t("workforceHub:metrics.spend", { defaultValue: "Month-to-date spend" }),
				value: formatCurrency(llmMonthSpend),
			},
		]
	}, [
		actionItems,
		activeCompany,
		departments,
		employees,
		fallbackMonthSpend,
		spendEntry,
		t,
		teams,
		terminalStatusIds,
	])

	const spendByEmployee = useMemo(() => {
		if (!activeCompany) return [] as SpendBreakdownRow[]
		const totals = new Map<string, number>()
		for (const item of actionItems ?? []) {
			if (!item.ownerEmployeeId) continue
			const amount = getActionItemCost(item)
			if (!amount) continue
			totals.set(item.ownerEmployeeId, (totals.get(item.ownerEmployeeId) ?? 0) + amount)
		}
		const grandTotal = [...totals.values()].reduce((sum, v) => sum + v, 0)
		return [...totals.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([employeeId, amount]) => {
				const employee = employees.find((entry) => entry.id === employeeId)
				return {
					label: employee
						? `${employee.name} — ${employee.role}`
						: t("common:unknown", { defaultValue: "Unknown" }),
					amount,
					percentage: grandTotal > 0 ? (amount / grandTotal) * 100 : 0,
				}
			})
	}, [actionItems, employees, activeCompany, t])

	const spendByTeam = useMemo(() => {
		if (!activeCompany) return [] as SpendBreakdownRow[]
		const employeeToTeam = new Map<string, WorkplaceTeam>()
		for (const team of teams) {
			for (const member of team.memberships ?? []) {
				if (member.removedAt) continue
				if (!employeeToTeam.has(member.employeeId)) {
					employeeToTeam.set(member.employeeId, team)
				}
			}
		}
		const totals = new Map<string, { team: WorkplaceTeam; amount: number }>()
		for (const item of actionItems ?? []) {
			if (!item.ownerEmployeeId) continue
			const team = employeeToTeam.get(item.ownerEmployeeId)
			if (!team) continue
			const amount = getActionItemCost(item)
			if (!amount) continue
			const entry = totals.get(team.id)
			if (entry) {
				entry.amount += amount
			} else {
				totals.set(team.id, { team, amount })
			}
		}
		const grandTotal = [...totals.values()].reduce((sum, value) => sum + value.amount, 0)
		return [...totals.values()]
			.sort((a, b) => b.amount - a.amount)
			.map(({ team, amount }) => ({
				id: team.id,
				label: team.name,
				amount,
				percentage: grandTotal > 0 ? (amount / grandTotal) * 100 : 0,
			}))
	}, [actionItems, teams, activeCompany])

	const spendByDepartment = useMemo(() => {
		if (!activeCompany) return [] as SpendBreakdownRow[]
		const teamToDepartment = new Map<string, WorkplaceDepartment>()
		for (const department of departments) {
			for (const teamId of department.teamIds ?? []) {
				if (!teamToDepartment.has(teamId)) {
					teamToDepartment.set(teamId, department)
				}
			}
		}
		const teamSpend = new Map(spendByTeam.map((entry) => [entry.id ?? entry.label, entry.amount]))
		const departmentTotals = new Map<string, { department: WorkplaceDepartment; amount: number }>()
		for (const team of teams) {
			const department = teamToDepartment.get(team.id)
			if (!department) continue
			const key = department.id
			const amount = teamSpend.get(team.id) ?? 0
			departmentTotals.set(key, {
				department,
				amount: (departmentTotals.get(key)?.amount ?? 0) + amount,
			})
		}
		const grandTotal = [...departmentTotals.values()].reduce((sum, value) => sum + value.amount, 0)
		return [...departmentTotals.values()]
			.sort((a, b) => b.amount - a.amount)
			.map(({ department, amount }) => ({
				label: department.name,
				amount,
				percentage: grandTotal > 0 ? (amount / grandTotal) * 100 : 0,
			}))
	}, [activeCompany, spendByTeam, departments, teams])

	const scheduleRows = useMemo(() => {
		if (!activeCompany?.workday?.employeeSchedules) {
			return [] as Array<{
				employee: WorkplaceEmployee
				availability: string
				weeklyHours?: number
				timeRange?: string
			}>
		}
		return activeCompany.workday.employeeSchedules
			.filter((schedule) => employees.some((employee) => employee.id === schedule.employeeId))
			.map((schedule) => {
				const employee = employees.find((entry) => entry.id === schedule.employeeId) as WorkplaceEmployee
				const start = minutesToTime(schedule.dailyStartMinute)
				const end = minutesToTime(schedule.dailyEndMinute)
				const timeRange = start && end ? `${start} – ${end}` : undefined
				return {
					employee,
					availability: schedule.availability,
					weeklyHours: schedule.weeklyHoursTarget,
					timeRange,
				}
			})
	}, [activeCompany?.workday?.employeeSchedules, employees])

	const openProjectDialog = useCallback(() => {
		if (!activeCompany) return
		setProjectTitle("")
		setProjectNotes("")
		setProjectOwnerId(undefined)
		setProjectStatusId(findDefaultStatusId(activeCompany))
		setProjectError(undefined)
		setShowProjectDialog(true)
	}, [activeCompany])

	const openHireDialog = useCallback(() => {
		if (!activeCompany) return
		setHireStage("collect")
		setHireMode("describe")
		setHireRequest("")
		setHireRoleHint("")
		setHireContext("")
		setCandidateOptions([])
		setFollowUpRequest("")
		setGeneratingCandidates(false)
		setHireError(undefined)
		setShowHireDialog(true)
	}, [activeCompany])

	const handleCreateProject = useCallback(() => {
		setProjectError(undefined)
		if (!activeCompany) {
			setProjectError(
				t("workforceHub:errors.selectCompany", { defaultValue: "Select a company first." }) as string,
			)
			return
		}
		if (!projectTitle.trim()) {
			setProjectError(
				t("workforceHub:errors.projectTitle", { defaultValue: "Give this project a name." }) as string,
			)
			return
		}
		createActionItem({
			companyId: activeCompany.id,
			title: projectTitle.trim(),
			description: projectNotes.trim() || undefined,
			ownerEmployeeId: projectOwnerId || undefined,
			kind: "project",
			statusId: projectStatusId,
		})
		setShowProjectDialog(false)
	}, [activeCompany, createActionItem, projectNotes, projectOwnerId, projectStatusId, projectTitle, t])

	const handleCreateIdea = useCallback(() => {
		if (!activeCompany) {
			setIdeaError(t("workforceHub:errors.selectCompany", { defaultValue: "Select a company first." }) as string)
			return
		}
		if (!ideaTitle.trim()) {
			setIdeaError(t("workforceHub:errors.ideaTitle", { defaultValue: "Describe your idea first." }) as string)
			return
		}
		createActionItem({
			companyId: activeCompany.id,
			title: ideaTitle.trim(),
			description: ideaNotes.trim() || undefined,
			kind: "goal",
			statusId: projectStatusId,
		})
		setIdeaNotes("")
		setIdeaTitle("")
		setIdeaError(undefined)
	}, [activeCompany, createActionItem, ideaNotes, ideaTitle, projectStatusId, t])

	const handleGenerateCandidates = useCallback(() => {
		setHireError(undefined)
		if (!activeCompany) {
			setHireError(t("workforceHub:errors.selectCompany", { defaultValue: "Select a company first." }) as string)
			return
		}
		const combinedInput = [hireRequest.trim(), hireContext.trim()].filter(Boolean).join(". ")
		let prompt = combinedInput
		if (!prompt && hireMode === "describe" && !hireRoleHint.trim()) {
			setHireError(
				t("workforceHub:errors.hireRequest", {
					defaultValue: "Share what you need or add a role title so {{name}} can suggest options.",
					name: executiveName,
				}) as string,
			)
			return
		}

		if (!prompt && hireMode === "askExec") {
			const topTeam = spendByTeam[0]
			prompt = topTeam
				? `Lighten the workload for ${topTeam.label} and tighten up the handoffs.`
				: `Find an agent who can step in and keep momentum on upcoming projects.`
		}

		const requestText = prompt || hireRoleHint || "Cover core workflows"
		setGeneratingCandidates(true)
		window.setTimeout(() => {
			const suggestions = generateCandidateSuggestions({
				company: activeCompany,
				requestText,
				roleHint: hireRoleHint,
				mode: hireMode,
				executiveName,
			})
			setCandidateOptions(suggestions)
			setLastHirePrompt(requestText)
			setHireStage("review")
			setFollowUpRequest("")
			setGeneratingCandidates(false)
		}, 180)
	}, [activeCompany, executiveName, hireContext, hireMode, hireRequest, hireRoleHint, spendByTeam, t])

	const handleRegenerateCandidates = useCallback(() => {
		setHireError(undefined)
		if (!activeCompany) {
			setHireError(t("workforceHub:errors.selectCompany", { defaultValue: "Select a company first." }) as string)
			return
		}
		const refinement = followUpRequest.trim()
		const prompt = [lastHirePrompt, refinement].filter(Boolean).join(". ") || lastHirePrompt
		setGeneratingCandidates(true)
		window.setTimeout(() => {
			const suggestions = generateCandidateSuggestions({
				company: activeCompany,
				requestText: prompt,
				roleHint: hireRoleHint,
				mode: hireMode,
				executiveName,
			})
			setCandidateOptions(suggestions)
			setLastHirePrompt(prompt)
			setFollowUpRequest("")
			setGeneratingCandidates(false)
		}, 160)
	}, [activeCompany, executiveName, followUpRequest, hireMode, hireRoleHint, lastHirePrompt, t])

	const handleHireCandidate = useCallback(
		(candidate: CandidateSuggestion) => {
			if (!activeCompany) {
				setHireError(
					t("workforceHub:errors.selectCompany", { defaultValue: "Select a company first." }) as string,
				)
				return
			}
			createEmployee({
				companyId: activeCompany.id,
				name: candidate.name,
				role: candidate.role,
				description: candidate.summary,
				personality: candidate.intro,
				customAttributes: {
					recommended_by: executiveName,
					source: "workforce-hub-suggestions",
					focus_areas: candidate.focusAreas.join(", "),
					background: candidate.background,
				},
			})
			setShowHireDialog(false)
		},
		[activeCompany, createEmployee, executiveName, t],
	)

	const handleBackToHireForm = useCallback(() => {
		setHireStage("collect")
		setCandidateOptions([])
		setHireError(undefined)
		setFollowUpRequest("")
		setGeneratingCandidates(false)
	}, [])

	const handleSetActiveEmployee = useCallback(
		(employeeId: string) => {
			if (!activeCompany) return
			setActiveEmployee(activeCompany.id, employeeId)
		},
		[activeCompany, setActiveEmployee],
	)

	const handleSelectCompany = useCallback(
		(companyId: string) => {
			selectCompany(companyId)
		},
		[selectCompany],
	)

	const sortedProjects = useMemo(() => {
		const byStatus = new Map<string, WorkplaceActionItem[]>()
		for (const status of actionStatuses ?? []) {
			byStatus.set(status.id, [])
		}
		for (const item of actionItems ?? []) {
			if (item.kind !== "project") continue
			if (!byStatus.has(item.statusId)) {
				byStatus.set(item.statusId, [])
			}
			byStatus.get(item.statusId)!.push(item)
		}
		return [...byStatus.entries()].map(([statusId, items]) => ({
			status: actionStatuses.find((status) => status.id === statusId),
			items: items.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()),
		}))
	}, [actionItems, actionStatuses])

	const ideaItems = useMemo(() => {
		return (actionItems ?? []).filter((item) => item.kind === "goal")
	}, [actionItems])

	const renderSpendBreakdown = (rows: SpendBreakdownRow[]) => {
		if (!rows.length) {
			return (
				<p className="m-0 text-xs text-[var(--vscode-descriptionForeground)]">
					{t("workforceHub:spend.empty", {
						defaultValue: "Spend will appear once projects start logging usage.",
					})}
				</p>
			)
		}
		return (
			<ul className="m-0 flex flex-col gap-2 p-0">
				{rows.map((row) => (
					<li
						key={row.id ?? row.label}
						className="flex items-center justify-between rounded-md border border-[color-mix(in srgb, var(--vscode-panel-border) 60%, transparent 40%)] bg-[color-mix(in srgb, var(--vscode-editor-background) 92%, rgba(255,255,255,0.05) 8%)] px-3 py-2 text-xs">
						<span className="truncate font-medium">{row.label}</span>
						<span className="ml-3 shrink-0 text-right">
							<span className="block font-semibold">{formatCurrency(row.amount)}</span>
							<span className="text-[var(--vscode-descriptionForeground)]">
								{row.percentage.toFixed(0)}%
							</span>
						</span>
					</li>
				))}
			</ul>
		)
	}

	const renderSchedule = () => {
		if (!scheduleRows.length) {
			return (
				<p className="m-0 text-xs text-[var(--vscode-descriptionForeground)]">
					{t("workforceHub:schedule.empty", {
						defaultValue: "Set weekly availability to see it here.",
					})}
				</p>
			)
		}
		return (
			<ul className="m-0 flex flex-col gap-2 p-0">
				{scheduleRows.map(({ employee, availability, weeklyHours, timeRange }) => (
					<li
						key={employee.id}
						className="rounded-md border border-[color-mix(in srgb, var(--vscode-panel-border) 60%, transparent 40%)] bg-[color-mix(in srgb, var(--vscode-editor-background) 92%, rgba(255,255,255,0.05) 8%)] px-3 py-2 text-xs">
						<div className="flex items-center justify-between gap-3">
							<button
								type="button"
								className="truncate text-left font-medium text-[color-mix(in srgb, var(--vscode-foreground) 90%, rgba(255,255,255,0.12) 10%)] hover:underline"
								onClick={() => handleSetActiveEmployee(employee.id)}>
								{employee.name}
							</button>
							<span className="uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
								{availability.replace(/_/g, " ")}
							</span>
						</div>
						<div className="mt-1 flex items-center justify-between text-[var(--vscode-descriptionForeground)]">
							<span>{employee.role}</span>
							{timeRange && <span>{timeRange}</span>}
						</div>
						{typeof weeklyHours === "number" && (
							<div className="mt-1 text-[var(--vscode-descriptionForeground)]">
								{t("workforceHub:schedule.weeklyHours", {
									defaultValue: "{hours} hrs / week",
									hours: weeklyHours,
								})}
							</div>
						)}
					</li>
				))}
			</ul>
		)
	}

	const renderAgentsTab = () => {
		if (!employees.length) {
			return (
				<div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-[var(--vscode-panel-border)] bg-[color-mix(in srgb, var(--vscode-editor-background) 94%, rgba(255,255,255,0.04) 6%)] p-6 text-center text-sm text-[var(--vscode-descriptionForeground)]">
					<p className="m-0">
						{t("workforceHub:agents.empty", {
							defaultValue: "No agents yet. Hire your first one to start scaling projects.",
						})}
					</p>
					<div className="mt-4 flex flex-wrap justify-center gap-3">
						<VSCodeButton appearance="primary" onClick={openHireDialog}>
							{t("workforceHub:actions.hire", { defaultValue: "Hire an agent" })}
						</VSCodeButton>
						<VSCodeButton appearance="secondary" onClick={openProjectDialog}>
							{t("workforceHub:actions.startProject", { defaultValue: "Start a new project" })}
						</VSCodeButton>
					</div>
				</div>
			)
		}
		return (
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{employees.map((employee) => {
					const ownedProjects = (actionItems ?? []).filter(
						(item) => item.ownerEmployeeId === employee.id && item.kind === "project",
					)
					const completed = ownedProjects.filter((item) => terminalStatusIds.has(item.statusId))
					const avgTurnaround = completed.length
						? completed
								.map((item) =>
									Math.max(
										0,
										new Date(item.updatedAt).getTime() - new Date(item.createdAt).getTime(),
									),
								)
								.reduce((sum, value) => sum + value, 0) /
							(completed.length * 1000 * 60 * 60)
						: undefined
					const spend = ownedProjects
						.map((item) => getActionItemCost(item))
						.reduce((sum, value) => sum + value, 0)
					return (
						<button
							type="button"
							key={employee.id}
							onClick={() => handleSetActiveEmployee(employee.id)}
							className="flex flex-col items-start gap-3 rounded-lg border border-[color-mix(in srgb, var(--vscode-panel-border) 65%, transparent 35%)] bg-[color-mix(in srgb, var(--vscode-editor-background) 92%, rgba(255,255,255,0.06) 8%)] p-4 text-left transition hover:border-[var(--vscode-focusBorder)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vscode-focusBorder)]">
							<div>
								<h3 className="m-0 text-base font-semibold">{employee.name}</h3>
								<p className="m-0 text-xs text-[var(--vscode-descriptionForeground)]">
									{employee.role}
								</p>
							</div>
							<div className="grid w-full grid-cols-2 gap-2 text-xs">
								<div className="rounded-md border border-transparent bg-[color-mix(in srgb, var(--vscode-focusBorder) 8%, transparent 92%)] px-3 py-2">
									<p className="m-0 text-[var(--vscode-descriptionForeground)]">
										{t("workforceHub:agents.projects", { defaultValue: "Projects" })}
									</p>
									<p className="m-0 text-sm font-semibold">{ownedProjects.length}</p>
								</div>
								<div className="rounded-md border border-transparent bg-[color-mix(in srgb, var(--vscode-focusBorder) 8%, transparent 92%)] px-3 py-2">
									<p className="m-0 text-[var(--vscode-descriptionForeground)]">
										{t("workforceHub:agents.turnaround", { defaultValue: "Avg turnaround" })}
									</p>
									<p className="m-0 text-sm font-semibold">{formatDuration(avgTurnaround)}</p>
								</div>
								<div className="rounded-md border border-transparent bg-[color-mix(in srgb, var(--vscode-editorBackground) 90%, rgba(255,255,255,0.08) 10%)] px-3 py-2">
									<p className="m-0 text-[var(--vscode-descriptionForeground)]">
										{t("workforceHub:agents.spend", { defaultValue: "Spend" })}
									</p>
									<p className="m-0 text-sm font-semibold">{formatCurrency(spend)}</p>
								</div>
								<div className="rounded-md border border-transparent bg-[color-mix(in srgb, var(--vscode-editorBackground) 90%, rgba(255,255,255,0.08) 10%)] px-3 py-2">
									<p className="m-0 text-[var(--vscode-descriptionForeground)]">
										{t("workforceHub:agents.started", { defaultValue: "Joined" })}
									</p>
									<p className="m-0 text-sm font-semibold">
										{new Date(employee.createdAt).toLocaleDateString(undefined, {
											month: "short",
											day: "numeric",
										})}
									</p>
								</div>
							</div>
						</button>
					)
				})}
			</div>
		)
	}

	const renderProjectsTab = () => {
		if (!(actionItems ?? []).some((item) => item.kind === "project")) {
			return (
				<div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-[var(--vscode-panel-border)] bg-[color-mix(in srgb, var(--vscode-editor-background) 94%, rgba(255,255,255,0.04) 6%)] p-6 text-center text-sm text-[var(--vscode-descriptionForeground)]">
					<p className="m-0">
						{t("workforceHub:projects.empty", {
							defaultValue: "Nothing queued yet. Start a project and assign it to an agent.",
						})}
					</p>
					<VSCodeButton className="mt-4" appearance="primary" onClick={openProjectDialog}>
						{t("workforceHub:actions.startProject", { defaultValue: "Start a new project" })}
					</VSCodeButton>
				</div>
			)
		}
		return (
			<div className="grid gap-4 md:grid-cols-3">
				{sortedProjects.map(({ status, items }) => (
					<div
						key={status?.id ?? "unknown"}
						className="rounded-lg border border-[color-mix(in srgb, var(--vscode-panel-border) 65%, transparent 35%)] bg-[color-mix(in srgb, var(--vscode-editor-background) 90%, rgba(255,255,255,0.05) 10%)] p-3">
						<h3 className="m-0 mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
							<span>{status?.name ?? t("common:status", { defaultValue: "Status" })}</span>
							<span className="rounded-full bg-[color-mix(in srgb, var(--vscode-focusBorder) 15%, transparent 85%)] px-2 py-0.5 text-[color-mix(in srgb, var(--vscode-foreground) 90%, rgba(255,255,255,0.2) 10%)]">
								{items.length}
							</span>
						</h3>
						<ul className="m-0 flex flex-col gap-2 p-0">
							{items.map((item) => {
								const owner = employees.find((entry) => entry.id === item.ownerEmployeeId)
								const spend = getActionItemCost(item)
								return (
									<li
										key={item.id}
										className="rounded-md border border-[color-mix(in srgb, var(--vscode-panel-border) 60%, transparent 40%)] bg-[color-mix(in srgb, var(--vscode-editor-background) 96%, rgba(0,0,0,0.35) 4%)] px-3 py-2 text-xs">
										<p className="m-0 font-medium">{item.title}</p>
										<p className="m-0 text-[var(--vscode-descriptionForeground)]">
											{owner
												? `${owner.name} · ${owner.role}`
												: t("workforceHub:projects.unassigned", { defaultValue: "Unassigned" })}
										</p>
										<div className="mt-1 flex items-center justify-between text-[var(--vscode-descriptionForeground)]">
											<span>
												{new Date(item.updatedAt).toLocaleDateString(undefined, {
													month: "short",
													day: "numeric",
												})}
											</span>
											<span>{formatCurrency(spend)}</span>
										</div>
									</li>
								)
							})}
						</ul>
					</div>
				))}
			</div>
		)
	}

	const renderPlaybooksTab = () => {
		return (
			<div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-[var(--vscode-panel-border)] bg-[color-mix(in srgb, var(--vscode-editor-background) 94%, rgba(255,255,255,0.04) 6%)] p-6 text-center text-sm text-[var(--vscode-descriptionForeground)]">
				<p className="m-0">
					{t("workforceHub:playbooks.placeholder", {
						defaultValue:
							"Playbooks will let you capture repeatable workflows. Head to the Action Workspace to build your first one.",
					})}
				</p>
				<VSCodeButton className="mt-4" appearance="secondary" onClick={() => setSelectedTab("projects")}>
					{t("workforceHub:playbooks.viewProjects", { defaultValue: "View projects" })}
				</VSCodeButton>
			</div>
		)
	}

	const renderMoneyTab = () => (
		<div className="flex flex-col gap-6">
			<div className="grid gap-3 md:w-fit">
				<section className="flex flex-col gap-2 rounded-lg border border-[color-mix(in srgb, var(--vscode-panel-border) 70%, transparent 30%)] bg-[color-mix(in srgb, var(--vscode-editor-background) 92%, rgba(255,255,255,0.06) 8%)] p-4">
					<h3 className="m-0 text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
						{t("workforceHub:money.llmMonth", { defaultValue: "Month-to-date LLM spend" })}
					</h3>
					<p className="m-0 text-2xl font-semibold">{formatCurrency(monthSpendValue)}</p>
					<p className="m-0 text-xs text-[var(--vscode-descriptionForeground)]">
						{spendEntry?.workspacePath
							? t("workforceHub:money.workspacePath", {
									defaultValue: "Workspace: {{path}}",
									path: spendEntry.workspacePath,
								})
							: t("workforceHub:money.workspaceUnmapped", {
									defaultValue: "Workspace mapping pending",
								})}
					</p>
				</section>
			</div>
			<div className="flex items-center gap-3">
				<button
					type="button"
					onClick={() => setShowSpendReceipt(true)}
					disabled={spendTasks.length === 0}
					className={clsx(
						"inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition",
						spendTasks.length === 0
							? "cursor-not-allowed border-[color-mix(in srgb, var(--vscode-disabledForeground) 40%, transparent 60%)] text-[color-mix(in srgb, var(--vscode-disabledForeground) 80%, transparent 20%)]"
							: "border-[color-mix(in srgb, var(--vscode-focusBorder) 60%, transparent 40%)] text-vscode-focusBorder hover:bg-[color-mix(in srgb, var(--vscode-focusBorder) 10%, transparent 90%)]",
					)}>
					<i className="codicon codicon-receipt" aria-hidden="true" />
					{t("workforceHub:money.viewReceipt", { defaultValue: "View LLM spend receipt" }) as string}
				</button>
				{spendTasks.length === 0 && (
					<p className="text-xs text-[var(--vscode-descriptionForeground)]">
						{
							t("workforceHub:money.receiptEmpty", {
								defaultValue: "Run a few tasks with cost before a receipt is available.",
							}) as string
						}
					</p>
				)}
			</div>
			<div className="grid gap-6 md:grid-cols-3">
				<section className="flex flex-col gap-3 rounded-lg border border-[color-mix(in srgb, var(--vscode-panel-border) 70%, transparent 30%)] bg-[color-mix(in srgb, var(--vscode-editor-background) 92%, rgba(255,255,255,0.06) 8%)] p-4">
					<h3 className="m-0 text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
						{t("workforceHub:money.byEmployee", { defaultValue: "By agent" })}
					</h3>
					{renderSpendBreakdown(spendByEmployee)}
				</section>
				<section className="flex flex-col gap-3 rounded-lg border border-[color-mix(in srgb, var(--vscode-panel-border) 70%, transparent 30%)] bg-[color-mix(in srgb, var(--vscode-editor-background) 92%, rgba(255,255,255,0.06) 8%)] p-4">
					<h3 className="m-0 text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
						{t("workforceHub:money.byTeam", { defaultValue: "By team" })}
					</h3>
					{renderSpendBreakdown(spendByTeam)}
				</section>
				<section className="flex flex-col gap-3 rounded-lg border border-[color-mix(in srgb, var(--vscode-panel-border) 70%, transparent 30%)] bg-[color-mix(in srgb, var(--vscode-editor-background) 92%, rgba(255,255,255,0.06) 8%)] p-4">
					<h3 className="m-0 text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
						{t("workforceHub:money.byDepartment", { defaultValue: "By department" })}
					</h3>
					{renderSpendBreakdown(spendByDepartment)}
				</section>
			</div>
		</div>
	)

	const renderIdeasTab = () => (
		<div className="flex flex-col gap-4">
			<div className="rounded-lg border border-[color-mix(in srgb, var(--vscode-panel-border) 70%, transparent 30%)] bg-[color-mix(in srgb, var(--vscode-editor-background) 92%, rgba(255,255,255,0.06) 8%)] p-4">
				<h3 className="m-0 text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
					{t("workforceHub:ideas.capture", { defaultValue: "Capture a new idea" })}
				</h3>
				<div className="mt-3 flex flex-col gap-3">
					<VSCodeTextField
						placeholder={
							t("workforceHub:ideas.titlePlaceholder", {
								defaultValue: "What do you want to explore?",
							}) as string
						}
						value={ideaTitle}
						onInput={(event: any) => {
							setIdeaTitle(event.target?.value ?? "")
							setIdeaError(undefined)
						}}
					/>
					<VSCodeTextArea
						rows={3}
						placeholder={
							t("workforceHub:ideas.notesPlaceholder", {
								defaultValue: "Optional context for future you.",
							}) as string
						}
						value={ideaNotes}
						onInput={(event: any) => {
							setIdeaNotes(event.target?.value ?? "")
							setIdeaError(undefined)
						}}
					/>
					{ideaError && <p className="m-0 text-xs text-[var(--vscode-errorForeground)]">{ideaError}</p>}
					<div className="flex items-center justify-end gap-2">
						<VSCodeButton
							appearance="secondary"
							onClick={() => {
								setIdeaTitle("")
								setIdeaNotes("")
								setIdeaError(undefined)
							}}>
							{t("workforceHub:actions.reset", { defaultValue: "Reset" })}
						</VSCodeButton>
						<VSCodeButton appearance="primary" onClick={handleCreateIdea}>
							{t("workforceHub:actions.saveIdea", { defaultValue: "Save idea" })}
						</VSCodeButton>
					</div>
				</div>
			</div>
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				{ideaItems.length === 0 ? (
					<p className="col-span-full m-0 rounded-lg border border-dashed border-[var(--vscode-panel-border)] bg-[color-mix(in srgb, var(--vscode-editor-background) 96%, rgba(255,255,255,0.05) 4%)] p-4 text-sm text-[var(--vscode-descriptionForeground)]">
						{t("workforceHub:ideas.empty", { defaultValue: "Ideas you save will land here." })}
					</p>
				) : (
					ideaItems.map((item) => (
						<div
							key={item.id}
							className="rounded-lg border border-[color-mix(in srgb, var(--vscode-panel-border) 60%, transparent 40%)] bg-[color-mix(in srgb, var(--vscode-editor-background) 94%, rgba(255,255,255,0.04) 6%)] p-4 text-sm">
							<h4 className="m-0 text-base font-semibold">{item.title}</h4>
							{item.description && (
								<p className="mt-2 whitespace-pre-wrap text-xs text-[var(--vscode-descriptionForeground)]">
									{item.description}
								</p>
							)}
							<div className="mt-3 flex items-center justify-between text-xs text-[var(--vscode-descriptionForeground)]">
								<span>
									{new Date(item.createdAt).toLocaleDateString(undefined, {
										month: "short",
										day: "numeric",
									})}
								</span>
								<span>
									{item.ownerEmployeeId
										? (employees.find((entry) => entry.id === item.ownerEmployeeId)?.name ?? "")
										: t("workforceHub:ideas.unassigned", { defaultValue: "Unassigned" })}
								</span>
							</div>
						</div>
					))
				)}
			</div>
		</div>
	)

	const renderTabContent = () => {
		switch (selectedTab) {
			case "agents":
				return renderAgentsTab()
			case "projects":
				return renderProjectsTab()
			case "playbooks":
				return renderPlaybooksTab()
			case "money":
				return renderMoneyTab()
			case "ideas":
				return renderIdeasTab()
			default:
				return null
		}
	}

	const title = t("common:workforceHub.title", { defaultValue: "Workforce Hub" }) as string

	return (
		<div
			data-testid="workforce-hub-view"
			className={clsx(
				"workforce-hub fixed inset-0 flex flex-col overflow-hidden bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]",
				isHidden && "hidden",
			)}>
			{showSpendReceipt && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
					<div className="flex max-h-[80vh] w-full max-w-3xl flex-col gap-4 overflow-hidden rounded-2xl border border-[color-mix(in srgb, var(--vscode-focusBorder) 60%, transparent 40%)] bg-[color-mix(in srgb, var(--vscode-editor-background) 96%, rgba(0,0,0,0.35) 4%)] p-6 shadow-2xl">
						<div className="flex items-start justify-between gap-4">
							<div>
								<h2 className="m-0 text-lg font-semibold text-[var(--vscode-editor-foreground)]">
									{
										t("workforceHub:money.receiptTitle", {
											defaultValue: "LLM spend receipt",
										}) as string
									}
								</h2>
								<p className="mt-1 text-sm text-[var(--vscode-descriptionForeground)]">
									{
										t("workforceHub:money.receiptSubtitle", {
											defaultValue:
												"Every completion recorded for this workspace, including fractional charges.",
										}) as string
									}
								</p>
							</div>
							<button
								type="button"
								onClick={() => setShowSpendReceipt(false)}
								className="inline-flex items-center gap-2 rounded-md border border-[color-mix(in srgb, var(--vscode-sideBar-border) 70%, transparent 30%)] bg-transparent px-3 py-1.5 text-sm font-medium text-[var(--vscode-editor-foreground)] transition hover:border-[var(--vscode-focusBorder)] hover:text-[var(--vscode-focusBorder)]">
								<i className="codicon codicon-close" aria-hidden="true" />
								{t("common:actions.close", { defaultValue: "Close" }) as string}
							</button>
						</div>
						<div className="flex flex-wrap items-center gap-4 text-sm text-[var(--vscode-descriptionForeground)]">
							<span>
								{t("workforceHub:money.receiptWorkspace", { defaultValue: "Workspace" }) as string}:{" "}
								{spendEntry?.workspacePath ??
									t("workforceHub:money.workspaceUnmapped", { defaultValue: "Not mapped" })}
							</span>
							<span>
								{t("workforceHub:money.receiptMonthTotal", { defaultValue: "Month total" }) as string}:{" "}
								{formatPreciseCurrency(receiptMonthTotal)}
							</span>
						</div>
						<div className="flex-1 overflow-auto rounded-xl border border-[color-mix(in srgb, var(--vscode-sideBar-border) 70%, transparent 30%)] bg-[color-mix(in srgb, var(--vscode-editor-background) 92%, rgba(255,255,255,0.04) 8%)]">
							{spendTasks.length === 0 ? (
								<div className="flex h-full items-center justify-center px-6 py-16 text-sm text-[var(--vscode-descriptionForeground)]">
									{
										t("workforceHub:money.receiptEmptyState", {
											defaultValue: "No LLM requests have been billed for this workspace yet.",
										}) as string
									}
								</div>
							) : (
								<table className="min-w-full divide-y divide-[color-mix(in srgb, var(--vscode-sideBar-border) 80%, transparent 20%)] text-sm">
									<thead className="bg-[color-mix(in srgb, var(--vscode-editorWidget-background) 92%, rgba(255,255,255,0.1) 8%)] text-[var(--vscode-descriptionForeground)]">
										<tr>
											<th className="px-4 py-2 text-left font-medium uppercase tracking-[0.18em]">
												{
													t("workforceHub:money.receiptTable.when", {
														defaultValue: "When",
													}) as string
												}
											</th>
											<th className="px-4 py-2 text-left font-medium uppercase tracking-[0.18em]">
												{
													t("workforceHub:money.receiptTable.task", {
														defaultValue: "Task",
													}) as string
												}
											</th>
											<th className="px-4 py-2 text-right font-medium uppercase tracking-[0.18em]">
												{
													t("workforceHub:money.receiptTable.cost", {
														defaultValue: "Cost",
													}) as string
												}
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-[color-mix(in srgb, var(--vscode-sideBar-border) 65%, transparent 35%)] text-[var(--vscode-editor-foreground)]">
										{spendTasks.map((entry) => (
											<tr key={entry.id}>
												<td className="px-4 py-2 align-top text-[var(--vscode-descriptionForeground)]">
													{new Date(entry.ts).toLocaleString(undefined, {
														month: "short",
														day: "numeric",
														year: "numeric",
														hour: "numeric",
														minute: "2-digit",
													})}
												</td>
												<td className="px-4 py-2 align-top">
													<p className="m-0 font-medium">
														{entry.title ||
															t("workforceHub:money.receiptUntitled", {
																defaultValue: "Untitled task",
															})}
													</p>
													<p className="m-0 text-xs text-[var(--vscode-descriptionForeground)]">
														{
															t("workforceHub:money.receiptTaskId", {
																defaultValue: "Task",
															}) as string
														}
														: {entry.id}
													</p>
												</td>
												<td className="px-4 py-2 text-right align-top font-mono">
													{formatPreciseCurrency(entry.totalCost)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							)}
						</div>
						<div className="flex flex-col gap-1 rounded-lg border border-[color-mix(in srgb, var(--vscode-sideBar-border) 70%, transparent 30%)] bg-[color-mix(in srgb, var(--vscode-editor-background) 92%, rgba(255,255,255,0.08) 8%)] px-4 py-3 text-xs text-[var(--vscode-descriptionForeground)]">
							<p className="m-0">
								{
									t("workforceHub:money.receiptNote", {
										defaultValue:
											"Values are direct sums from task usage data. Small completions can be fractions of a cent, but still accrue towards your quota.",
									}) as string
								}
							</p>
						</div>
					</div>
				</div>
			)}
			<header className="border-b border-[var(--vscode-panel-border)] px-6 py-5">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<h1 className="m-0 text-xl font-semibold">{title}</h1>
						<p className="m-0 text-sm text-[var(--vscode-descriptionForeground)]">
							{t("workforceHub:subtitle", {
								defaultValue:
									"Keep an eye on your agents, projects, and spend from one friendly space.",
							})}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-3">
						<VSCodeButton appearance="primary" onClick={openProjectDialog}>
							{t("workforceHub:actions.startProject", { defaultValue: "Start a new project" })}
						</VSCodeButton>
						<VSCodeButton appearance="secondary" onClick={openHireDialog}>
							{t("workforceHub:actions.hire", { defaultValue: "Hire an agent" })}
						</VSCodeButton>
					</div>
				</div>
				<div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					{metrics.map((metric) => (
						<div
							key={metric.title}
							className="rounded-lg border border-[color-mix(in srgb, var(--vscode-panel-border) 70%, transparent 30%)] bg-[color-mix(in srgb, var(--vscode-editor-background) 90%, rgba(255,255,255,0.05) 10%)] px-4 py-3">
							<p className="m-0 text-xs uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
								{metric.title}
							</p>
							<p className="m-0 text-2xl font-semibold leading-tight">{metric.value}</p>
							{metric.deltaLabel && (
								<p className="m-0 text-xs text-[var(--vscode-descriptionForeground)]">
									{metric.deltaLabel}
								</p>
							)}
						</div>
					))}
				</div>
				<div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color-mix(in srgb, var(--vscode-sideBar-border) 70%, transparent 30%)] bg-[color-mix(in srgb, var(--vscode-editorWidget-background) 72%, rgba(255,255,255,0.04) 28%)] px-4 py-3 text-sm">
					<div className="flex flex-col">
						<span className="font-semibold text-[var(--vscode-editor-foreground)]">
							{
								t("workforceHub:money.summaryLabel", {
									defaultValue: "LLM spend (month-to-date)",
								}) as string
							}
						</span>
						<span className="text-xs text-[var(--vscode-descriptionForeground)]">
							{formatPreciseCurrency(monthSpendValue)}
							{spendEntry?.workspacePath ? ` · ${spendEntry.workspacePath}` : ""}
						</span>
					</div>
					<button
						type="button"
						onClick={() => setShowSpendReceipt(true)}
						disabled={spendTasks.length === 0}
						className={clsx(
							"inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition",
							spendTasks.length === 0
								? "cursor-not-allowed border border-[color-mix(in srgb, var(--vscode-disabledForeground) 35%, transparent 65%)] text-[color-mix(in srgb, var(--vscode-disabledForeground) 80%, transparent 20%)]"
								: "border border-[color-mix(in srgb, var(--vscode-focusBorder) 65%, transparent 35%)] text-[var(--vscode-focusBorder)] hover:bg-[color-mix(in srgb, var(--vscode-focusBorder) 12%, transparent 88%)]",
						)}>
						<i className="codicon codicon-receipt" aria-hidden="true" />
						{t("workforceHub:money.viewReceipt", { defaultValue: "View LLM spend receipt" }) as string}
					</button>
				</div>
			</header>
			<main className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6">
				{!activeCompany ? (
					<div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
						<p className="max-w-md text-sm text-[var(--vscode-descriptionForeground)]">
							{t("workforceHub:empty", {
								defaultValue: "Create your first company to unlock the workforce hub.",
							})}
						</p>
						<VSCodeButton
							appearance="primary"
							onClick={() =>
								createCompany({
									name: t("workforceHub:sampleCompany", {
										defaultValue: "My First Company",
									}) as string,
								})
							}>
							{t("workforceHub:actions.createCompany", { defaultValue: "Create company" })}
						</VSCodeButton>
					</div>
				) : (
					<>
						<div className="flex flex-col gap-6 lg:flex-row">
							<section className="workforce-hub__canvas flex-1 rounded-xl border border-[color-mix(in srgb, var(--vscode-panel-border) 70%, transparent 30%)] bg-[color-mix(in srgb, var(--vscode-editor-background) 92%, rgba(255,255,255,0.04) 8%)] p-4">
								<WorkforceCanvas
									company={activeCompany}
									onCreateDepartment={(name, description) =>
										createDepartment({ companyId: activeCompany.id, name, description })
									}
									onCreateTeam={(name, description, departmentId) =>
										createTeam({
											companyId: activeCompany.id,
											name,
											description,
											departmentId,
										})
									}
									onCreateEmployee={(name, role) =>
										createEmployee({ companyId: activeCompany.id, name, role })
									}
									onAssignTeamToDepartment={(teamId, departmentId) =>
										assignTeamToDepartment({ companyId: activeCompany.id, teamId, departmentId })
									}
									onAssignEmployeeToTeam={(teamId, employeeId) =>
										assignEmployeeToTeam({ companyId: activeCompany.id, teamId, employeeId })
									}
									onRemoveEmployeeFromTeam={(teamId, employeeId) =>
										removeEmployeeFromTeam({ companyId: activeCompany.id, teamId, employeeId })
									}
									onUpdateDepartment={(departmentId, updates) => {
										const department = departments.find((entry) => entry.id === departmentId)
										if (!department) return
										updateDepartment({
											companyId: activeCompany.id,
											department: {
												...department,
												name: updates.name,
												description: updates.description,
											},
										})
									}}
									onUpdateTeam={(teamId, updates) => {
										const team = teams.find((entry) => entry.id === teamId)
										if (!team) return
										updateTeam({
											companyId: activeCompany.id,
											team: { ...team, name: updates.name, description: updates.description },
										})
									}}
									onUpdateEmployee={(employeeId, updates) => {
										const employee = employees.find((entry) => entry.id === employeeId)
										if (!employee) return
										updateEmployee({
											companyId: activeCompany.id,
											employee: { ...employee, name: updates.name, role: updates.role },
										})
									}}
									onArchiveDepartment={(departmentId) =>
										archiveDepartment({ companyId: activeCompany.id, departmentId })
									}
									onArchiveTeam={(teamId) => archiveTeam({ companyId: activeCompany.id, teamId })}
									onArchiveEmployee={(employeeId) =>
										archiveEmployee({ companyId: activeCompany.id, employeeId })
									}
									onInspectEmployee={(employeeId) => handleSetActiveEmployee(employeeId)}
								/>
							</section>
							<aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[360px]">
								<section className="rounded-xl border border-[color-mix(in srgb, var(--vscode-panel-border) 70%, transparent 30%)] bg-[color-mix(in srgb, var(--vscode-editor-background) 92%, rgba(255,255,255,0.06) 8%)] p-4">
									<div className="flex items-center justify-between gap-2">
										<h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
											{t("workforceHub:panels.agent", { defaultValue: "Agent snapshot" })}
										</h2>
										{companies.length > 1 && (
											<VSCodeDropdown
												value={activeCompany.id}
												onInput={(event: any) => handleSelectCompany(event.target?.value)}>
												{companies.map((company) => (
													<VSCodeOption key={company.id} value={company.id}>
														{company.name}
													</VSCodeOption>
												))}
											</VSCodeDropdown>
										)}
									</div>
									{activeCompany.employees.length === 0 ? (
										<p className="mt-3 text-xs text-[var(--vscode-descriptionForeground)]">
											{t("workforceHub:panels.agentEmpty", {
												defaultValue: "Hire an agent to see their snapshot.",
											})}
										</p>
									) : (
										<button
											type="button"
											className="mt-3 w-full rounded-lg border border-[color-mix(in srgb, var(--vscode-panel-border) 50%, transparent 50%)] bg-[color-mix(in srgb, var(--vscode-editor-background) 94%, rgba(255,255,255,0.05) 6%)] px-3 py-3 text-left text-sm hover:border-[var(--vscode-focusBorder)]"
											onClick={openHireDialog}>
											<div className="flex items-center justify-between">
												<span>
													{t("workforceHub:panels.quickHire", {
														defaultValue: "Need backup? Hire another agent.",
													})}
												</span>
												<span className="codicon codicon-plus" aria-hidden="true" />
											</div>
										</button>
									)}
								</section>
								<section className="rounded-xl border border-[color-mix(in srgb, var(--vscode-panel-border) 70%, transparent 30%)] bg-[color-mix(in srgb, var(--vscode-editor-background) 92%, rgba(255,255,255,0.06) 8%)] p-4">
									<h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
										{t("workforceHub:panels.spend", { defaultValue: "Where your money goes" })}
									</h2>
									<div className="mt-3 flex flex-col gap-2 text-xs text-[var(--vscode-descriptionForeground)]">
										<span>
											{t("workforceHub:panels.spendHint", {
												defaultValue: "See the top consumers across your org.",
											})}
										</span>
									</div>
									<div className="mt-3 space-y-3">
										{renderSpendBreakdown(spendByEmployee.slice(0, 3))}
									</div>
								</section>
								<section className="rounded-xl border border-[color-mix(in srgb, var(--vscode-panel-border) 70%, transparent 30%)] bg-[color-mix(in srgb, var(--vscode-editor-background) 92%, rgba(255,255,255,0.06) 8%)] p-4">
									<h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
										{t("workforceHub:panels.schedule", { defaultValue: "Schedule & availability" })}
									</h2>
									<div className="mt-3">{renderSchedule()}</div>
								</section>
							</aside>
						</div>
						<section className="mt-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[color-mix(in srgb, var(--vscode-panel-border) 70%, transparent 30%)]">
							<div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--vscode-panel-border)] bg-[color-mix(in srgb, var(--vscode-editor-background) 95%, rgba(255,255,255,0.04) 5%)] px-4 py-3 text-sm">
								<button
									type="button"
									className={clsx(
										"rounded-full px-3 py-1",
										selectedTab === "agents"
											? "bg-[color-mix(in srgb, var(--vscode-focusBorder) 20%, transparent 80%)] font-semibold"
											: "hover:bg-[color-mix(in srgb, var(--vscode-focusBorder) 12%, transparent 88%)]",
									)}
									onClick={() => setSelectedTab("agents")}>
									{t("workforceHub:tabs.agents", { defaultValue: "Agents" })}
								</button>
								<button
									type="button"
									className={clsx(
										"rounded-full px-3 py-1",
										selectedTab === "projects"
											? "bg-[color-mix(in srgb, var(--vscode-focusBorder) 20%, transparent 80%)] font-semibold"
											: "hover:bg-[color-mix(in srgb, var(--vscode-focusBorder) 12%, transparent 88%)]",
									)}
									onClick={() => setSelectedTab("projects")}>
									{t("workforceHub:tabs.projects", { defaultValue: "Projects" })}
								</button>
								<button
									type="button"
									className={clsx(
										"rounded-full px-3 py-1",
										selectedTab === "playbooks"
											? "bg-[color-mix(in srgb, var(--vscode-focusBorder) 20%, transparent 80%)] font-semibold"
											: "hover:bg-[color-mix(in srgb, var(--vscode-focusBorder) 12%, transparent 88%)]",
									)}
									onClick={() => setSelectedTab("playbooks")}>
									{t("workforceHub:tabs.playbooks", { defaultValue: "Playbooks" })}
								</button>
								<button
									type="button"
									className={clsx(
										"rounded-full px-3 py-1",
										selectedTab === "money"
											? "bg-[color-mix(in srgb, var(--vscode-focusBorder) 20%, transparent 80%)] font-semibold"
											: "hover:bg-[color-mix(in srgb, var(--vscode-focusBorder) 12%, transparent 88%)]",
									)}
									onClick={() => setSelectedTab("money")}>
									{t("workforceHub:tabs.money", { defaultValue: "Money" })}
								</button>
								<button
									type="button"
									className={clsx(
										"rounded-full px-3 py-1",
										selectedTab === "ideas"
											? "bg-[color-mix(in srgb, var(--vscode-focusBorder) 20%, transparent 80%)] font-semibold"
											: "hover:bg-[color-mix(in srgb, var(--vscode-focusBorder) 12%, transparent 88%)]",
									)}
									onClick={() => setSelectedTab("ideas")}>
									{t("workforceHub:tabs.ideas", { defaultValue: "Ideas" })}
								</button>
							</div>
							<div className="min-h-0 flex-1 overflow-auto p-4">{renderTabContent()}</div>
						</section>
					</>
				)}
			</main>

			{showProjectDialog && (
				<div className="workforce-hub__dialog" role="dialog" aria-modal="true">
					<div className="workforce-hub__dialog-card">
						<header className="flex items-center justify-between">
							<h2 className="m-0 text-base font-semibold">
								{t("workforceHub:dialogs.projectTitle", { defaultValue: "Start a new project" })}
							</h2>
							<button
								className="workforce-hub__dialog-close"
								type="button"
								onClick={() => setShowProjectDialog(false)}>
								<span className="codicon codicon-close" aria-hidden="true" />
								<span className="sr-only">{t("common:close", { defaultValue: "Close" })}</span>
							</button>
						</header>
						<div className="mt-4 flex flex-col gap-3">
							<VSCodeTextField
								value={projectTitle}
								onInput={(event: any) => setProjectTitle(event.target?.value ?? "")}
								placeholder={
									t("workforceHub:dialogs.projectNamePlaceholder", {
										defaultValue: "Project name",
									}) as string
								}
							/>
							<VSCodeTextArea
								rows={4}
								value={projectNotes}
								onInput={(event: any) => setProjectNotes(event.target?.value ?? "")}
								placeholder={
									t("workforceHub:dialogs.projectNotesPlaceholder", {
										defaultValue: "Optional notes or deliverables",
									}) as string
								}
							/>
							<VSCodeDropdown
								value={projectOwnerId ?? ""}
								onInput={(event: any) => setProjectOwnerId(event.target?.value || undefined)}>
								<VSCodeOption value="">
									{t("workforceHub:dialogs.unassigned", { defaultValue: "Leave unassigned" })}
								</VSCodeOption>
								{employees.map((employee) => (
									<VSCodeOption key={employee.id} value={employee.id}>
										{employee.name}
									</VSCodeOption>
								))}
							</VSCodeDropdown>
							<VSCodeDropdown
								value={projectStatusId ?? ""}
								onInput={(event: any) => setProjectStatusId(event.target?.value || undefined)}>
								{(actionStatuses ?? []).map((status) => (
									<VSCodeOption key={status.id} value={status.id}>
										{status.name}
									</VSCodeOption>
								))}
							</VSCodeDropdown>
						</div>
						{projectError && (
							<p className="mt-3 text-xs text-[var(--vscode-errorForeground)]">{projectError}</p>
						)}
						<footer className="mt-4 flex items-center justify-end gap-2">
							<VSCodeButton appearance="secondary" onClick={() => setShowProjectDialog(false)}>
								{t("common:cancel", { defaultValue: "Cancel" })}
							</VSCodeButton>
							<VSCodeButton appearance="primary" onClick={handleCreateProject}>
								{t("workforceHub:dialogs.createProject", { defaultValue: "Create project" })}
							</VSCodeButton>
						</footer>
					</div>
				</div>
			)}

			{showHireDialog && (
				<div className="workforce-hub__dialog" role="dialog" aria-modal="true">
					<div className="workforce-hub__dialog-card">
						<header className="flex items-center justify-between">
							<h2 className="m-0 text-base font-semibold">
								{t("workforceHub:dialogs.hireTitle", { defaultValue: "Hire a new agent" })}
							</h2>
							<button
								className="workforce-hub__dialog-close"
								type="button"
								onClick={() => setShowHireDialog(false)}>
								<span className="codicon codicon-close" aria-hidden="true" />
								<span className="sr-only">{t("common:close", { defaultValue: "Close" })}</span>
							</button>
						</header>
						{hireStage === "collect" ? (
							<div className="workforce-hub__hire-stage">
								<p className="m-0 text-sm text-[var(--vscode-descriptionForeground)]">
									{t("workforceHub:dialogs.hireLead", {
										defaultValue:
											"Tell {{name}} what you need and they’ll shortlist a few agents for you.",
										name: executiveName,
									})}
								</p>
								<div
									className="workforce-hub__mode-toggle"
									role="radiogroup"
									aria-label={
										t("workforceHub:dialogs.hireMode", {
											defaultValue: "How should we help?",
										}) as string
									}>
									<button
										type="button"
										className={clsx(
											"workforce-hub__mode-button",
											hireMode === "describe" && "is-active",
										)}
										onClick={() => setHireMode("describe")}>
										{t("workforceHub:dialogs.modeDescribe", { defaultValue: "I know what I need" })}
									</button>
									<button
										type="button"
										className={clsx(
											"workforce-hub__mode-button",
											hireMode === "askExec" && "is-active",
										)}
										onClick={() => setHireMode("askExec")}>
										{t("workforceHub:dialogs.modeAsk", {
											defaultValue: "Let {{name}} fill the gap",
											name: executiveName,
										})}
									</button>
								</div>
								<VSCodeTextArea
									rows={4}
									value={hireRequest}
									onInput={(event: any) => {
										setHireRequest(event.target?.value ?? "")
										setHireError(undefined)
									}}
									placeholder={
										hireMode === "describe"
											? (t("workforceHub:dialogs.hireRequestPlaceholder", {
													defaultValue: "Describe the work you want covered.",
												}) as string)
											: (t("workforceHub:dialogs.askExecPlaceholder", {
													defaultValue: "Let {{name}} know where you’re stretched.",
													name: executiveName,
												}) as string)
									}
								/>
								<VSCodeTextField
									value={hireRoleHint}
									onInput={(event: any) => {
										setHireRoleHint(event.target?.value ?? "")
										setHireError(undefined)
									}}
									placeholder={
										t("workforceHub:dialogs.roleHintPlaceholder", {
											defaultValue: "Optional role title (e.g. Marketing Partner)",
										}) as string
									}
								/>
								<VSCodeTextArea
									rows={3}
									value={hireContext}
									onInput={(event: any) => {
										setHireContext(event.target?.value ?? "")
										setHireError(undefined)
									}}
									placeholder={
										t("workforceHub:dialogs.contextPlaceholder", {
											defaultValue: "Anything else {{name}} should know?",
											name: executiveName,
										}) as string
									}
								/>
								{hireError && (
									<p className="m-0 text-xs text-[var(--vscode-errorForeground)]">{hireError}</p>
								)}
								<footer className="mt-4 flex items-center justify-end gap-2">
									<VSCodeButton appearance="secondary" onClick={() => setShowHireDialog(false)}>
										{t("common:cancel", { defaultValue: "Cancel" })}
									</VSCodeButton>
									<VSCodeButton
										appearance="primary"
										disabled={generatingCandidates}
										onClick={handleGenerateCandidates}>
										{generatingCandidates
											? t("workforceHub:dialogs.generating", { defaultValue: "Thinking…" })
											: t("workforceHub:dialogs.askExecutive", {
													defaultValue: "Ask {{name}}",
													name: executiveName,
												})}
									</VSCodeButton>
								</footer>
							</div>
						) : (
							<div className="workforce-hub__hire-stage">
								<div className="workforce-hub__exec-reply">
									<div className="workforce-hub__exec-bubble">
										<strong>{executiveName}</strong>
										<span>
											{t("workforceHub:dialogs.execResponse", {
												defaultValue: "Here are a few teammates who can handle {{prompt}}.",
												prompt:
													lastHirePrompt ||
													t("workforceHub:dialogs.execDefaultPrompt", {
														defaultValue: "what you described",
													}),
											})}
										</span>
									</div>
								</div>
								{generatingCandidates ? (
									<p className="mt-4 text-sm text-[var(--vscode-descriptionForeground)]">
										{t("workforceHub:dialogs.generating", { defaultValue: "Thinking…" })}
									</p>
								) : candidateOptions.length > 0 ? (
									<div className="workforce-hub__candidate-grid">
										{candidateOptions.map((candidate) => (
											<div key={candidate.id} className="workforce-hub__candidate-card">
												<div className="workforce-hub__candidate-header">
													<span
														className="workforce-hub__candidate-avatar"
														aria-hidden="true">
														{candidate.avatar}
													</span>
													<div>
														<h3 className="m-0 text-base font-semibold">
															{candidate.name}
														</h3>
														<p className="m-0 text-xs uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
															{candidate.role}
														</p>
													</div>
												</div>
												<p className="mt-3 text-sm">{candidate.summary}</p>
												<p className="m-0 text-xs text-[var(--vscode-descriptionForeground)]">
													{candidate.background}
												</p>
												<ul className="workforce-hub__candidate-focus m-0 mt-3 flex flex-wrap gap-2 p-0">
													{candidate.focusAreas.map((focus) => (
														<li
															key={`${candidate.id}-${focus}`}
															className="workforce-hub__candidate-chip">
															{focus}
														</li>
													))}
												</ul>
												<p className="mt-3 text-xs text-[var(--vscode-descriptionForeground)]">
													{candidate.intro}
												</p>
												<div className="mt-4 flex items-center justify-end gap-2">
													<VSCodeButton
														appearance="primary"
														onClick={() => handleHireCandidate(candidate)}>
														{t("workforceHub:dialogs.hireCandidate", {
															defaultValue: "Hire {{name}}",
															name: candidate.name.split(" ")[0] ?? candidate.name,
														})}
													</VSCodeButton>
												</div>
											</div>
										))}
									</div>
								) : (
									<p className="mt-4 text-sm text-[var(--vscode-descriptionForeground)]">
										{t("workforceHub:dialogs.noCandidates", {
											defaultValue: "No suggestions yet. Ask for another pass.",
										})}
									</p>
								)}
								<div className="workforce-hub__followup mt-5">
									<label className="block text-xs font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
										{t("workforceHub:dialogs.followUpLabel", { defaultValue: "Need tweaks?" })}
									</label>
									<VSCodeTextArea
										rows={3}
										value={followUpRequest}
										onInput={(event: any) => setFollowUpRequest(event.target?.value ?? "")}
										placeholder={
											t("workforceHub:dialogs.followUpPlaceholder", {
												defaultValue: "Ask for a different angle, seniority, or focus.",
											}) as string
										}
									/>
									<div className="mt-3 flex flex-wrap justify-end gap-2">
										<VSCodeButton appearance="secondary" onClick={handleBackToHireForm}>
											{t("workforceHub:dialogs.editRequest", { defaultValue: "Edit request" })}
										</VSCodeButton>
										<VSCodeButton
											appearance="primary"
											disabled={generatingCandidates}
											onClick={handleRegenerateCandidates}>
											{generatingCandidates
												? t("workforceHub:dialogs.generating", { defaultValue: "Thinking…" })
												: t("workforceHub:dialogs.refreshSuggestions", {
														defaultValue: "Request new options",
													})}
										</VSCodeButton>
									</div>
								</div>
								{hireError && (
									<p className="mt-3 text-xs text-[var(--vscode-errorForeground)]">{hireError}</p>
								)}
								<footer className="mt-4 flex items-center justify-end gap-2">
									<VSCodeButton appearance="secondary" onClick={() => setShowHireDialog(false)}>
										{t("common:cancel", { defaultValue: "Cancel" })}
									</VSCodeButton>
								</footer>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	)
}

export default WorkforceHubView
