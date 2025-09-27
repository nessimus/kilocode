import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Dispatch, DragEvent, SetStateAction, ChangeEvent } from "react"
import {
	VSCodeButton,
	VSCodeDropdown,
	VSCodeOption,
	VSCodeTextArea,
	VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react"

import { SearchableSelect, type SearchableSelectOption } from "@/components/ui"
import { cn } from "@/lib/utils"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { vscode } from "@/utils/vscode"
import WorkdayScheduleBoard from "./WorkdayScheduleBoard"
import type { HubMessage, HubRoom } from "@roo/hub"
import type {
	WorkplaceActionItem,
	WorkplaceActionStatus,
	WorkplaceCompany,
	WorkplaceEmployee,
	WorkplaceEmployeeAvailability,
	WorkplaceActionItemKind,
	StartActionItemsPayload,
} from "@roo/golden/workplace"

interface ActionWorkspaceViewProps {
	onDone: () => void
}

interface ActionItemDraft {
	title: string
	kind: WorkplaceActionItemKind
	statusId: string
	description: string
	ownerEmployeeId: string
	dueAt: string
}

const createInitialDraft = (
	defaultStatusId: string,
	defaultKind: WorkplaceActionItemKind = "task",
): ActionItemDraft => ({
	title: "",
	kind: defaultKind,
	statusId: defaultStatusId,
	description: "",
	ownerEmployeeId: "",
	dueAt: "",
})

const formatDueDateInput = (value?: string) => {
	if (!value) return ""
	try {
		const date = new Date(value)
		if (Number.isNaN(date.getTime())) {
			return value
		}
		return date.toISOString().slice(0, 10)
	} catch {
		return value
	}
}

const sanitizeActionForUpdate = (draft: WorkplaceActionItem, source: WorkplaceActionItem): WorkplaceActionItem => ({
	...draft,
	title: draft.title.trim() || source.title,
	description: draft.description?.trim() ? draft.description.trim() : undefined,
	ownerEmployeeId: draft.ownerEmployeeId || undefined,
	dueAt: draft.dueAt || undefined,
	customProperties: draft.customProperties,
	relationIds: draft.relationIds,
})

const EMPTY_EMPLOYEES: WorkplaceEmployee[] = []

const formatRelativeTime = (value?: string | number): string => {
	if (value === undefined || value === null) {
		return "moments ago"
	}
	const date = typeof value === "number" ? new Date(value) : new Date(value)
	if (Number.isNaN(date.getTime())) {
		return "moments ago"
	}
	const diffMs = Date.now() - date.getTime()
	const diffSeconds = diffMs / 1000
	const absSeconds = Math.abs(diffSeconds)
	const suffix = diffSeconds >= 0 ? "ago" : "from now"

	if (absSeconds < 45) {
		return diffSeconds >= 0 ? "just now" : "in a few seconds"
	}
	if (absSeconds < 90) {
		return `1 minute ${suffix}`
	}
	const absMinutes = absSeconds / 60
	if (absMinutes < 45) {
		return `${Math.round(absMinutes)} minutes ${suffix}`
	}
	if (absMinutes < 90) {
		return `1 hour ${suffix}`
	}
	const absHours = absMinutes / 60
	if (absHours < 24) {
		return `${Math.round(absHours)} hours ${suffix}`
	}
	if (absHours < 48) {
		return diffSeconds >= 0 ? "yesterday" : "tomorrow"
	}
	const absDays = absHours / 24
	if (absDays < 30) {
		return `${Math.round(absDays)} days ${suffix}`
	}
	const absMonths = absDays / 30
	if (absMonths < 18) {
		return `${Math.round(absMonths)} months ${suffix}`
	}
	const absYears = absDays / 365
	return `${Math.round(absYears)} years ${suffix}`
}

const createMessageSnippet = (input?: string, limit = 18): string | undefined => {
	if (!input) {
		return undefined
	}
	const sanitized = input.replace(/\s+/g, " ").trim()
	if (!sanitized) {
		return undefined
	}
	const words = sanitized.split(" ")
	if (words.length <= limit) {
		return sanitized
	}
	return `${words.slice(0, limit).join(" ")}…`
}

const ActionWorkspaceView = ({ onDone }: ActionWorkspaceViewProps) => {
	const {
		workplaceState,
		selectCompany,
		createActionItem,
		updateActionItem,
		deleteActionItem,
		createActionStatus,
		startActionItems,
		startWorkday,
		haltWorkday,
		updateEmployeeSchedule,
		createShift,
		updateShift,
		deleteShift,
		setActiveEmployee,
		hubSnapshot,
		setActiveHubRoom,
	} = useExtensionState()

	const companies = useMemo(() => workplaceState?.companies ?? [], [workplaceState?.companies])
	const activeCompany = useMemo<WorkplaceCompany | undefined>(() => {
		const activeId = workplaceState?.activeCompanyId
		if (companies.length === 0) return undefined
		return companies.find((company) => company.id === activeId) ?? companies[0]
	}, [companies, workplaceState?.activeCompanyId])
	const activeCompanyId = activeCompany?.id

	const statusOrder = useMemo(() => {
		if (!activeCompany) return new Map<string, number>()
		return new Map<string, number>(
			[...activeCompany.actionStatuses]
				.sort((a, b) => a.order - b.order)
				.map((status, index) => [status.id, index]),
		)
	}, [activeCompany])

	const sortedStatuses = useMemo<WorkplaceActionStatus[]>(() => {
		if (!activeCompany) return []
		return [...activeCompany.actionStatuses].sort((a, b) => a.order - b.order)
	}, [activeCompany])

	const statusById = useMemo(() => {
		return new Map(sortedStatuses.map((status) => [status.id, status]))
	}, [sortedStatuses])

	const employees = activeCompany?.employees ?? EMPTY_EMPLOYEES
	const shifts = useMemo(() => activeCompany?.shifts ?? [], [activeCompany?.shifts])
	const workday = activeCompany?.workday
	const availabilityMap = useMemo(() => {
		const map = new Map<string, WorkplaceEmployeeAvailability>()
		if (workday?.employeeSchedules) {
			for (const schedule of workday.employeeSchedules) {
				map.set(schedule.employeeId, schedule.availability as WorkplaceEmployeeAvailability)
			}
		}
		return map
	}, [workday?.employeeSchedules])
	const activeWorkdayEmployeeIds = useMemo(
		() => new Set(workday?.activeEmployeeIds ?? []),
		[workday?.activeEmployeeIds],
	)
	const availabilityStats = useMemo(() => {
		const stats = {
			available: 0,
			flexible: 0,
			onCall: 0,
			suspended: 0,
		}
		for (const employee of employees) {
			const status = availabilityMap.get(employee.id) ?? "available"
			switch (status) {
				case "flexible":
					stats.flexible += 1
					break
				case "on_call":
					stats.onCall += 1
					break
				case "suspended":
					stats.suspended += 1
					break
				case "available":
				default:
					stats.available += 1
				}
		}
		return stats
	}, [employees, availabilityMap])

	const autoEligibleEmployeeIds = useMemo(
		() =>
			employees
				.filter((employee) => {
					const status = availabilityMap.get(employee.id) ?? "available"
					return status === "available" || status === "flexible"
				})
				.map((employee) => employee.id),
		[employees, availabilityMap],
	)
	const workdayStatus = workday?.status ?? "idle"
	const workdayStatusMeta = useMemo(() => {
		switch (workdayStatus) {
			case "active":
				return {
					label: "Active",
					badgeClass:
						"border-[color-mix(in_srgb,var(--vscode-testing-iconPassed)_42%,transparent)] bg-[color-mix(in_srgb,var(--vscode-testing-iconPassed)_18%,transparent)] text-[var(--vscode-testing-iconPassed)]",
				}
			case "paused":
				return {
					label: "Paused",
					badgeClass:
						"border-[color-mix(in_srgb,var(--vscode-testing-iconQueued)_46%,transparent)] bg-[color-mix(in_srgb,var(--vscode-testing-iconQueued)_16%,transparent)] text-[var(--vscode-testing-iconQueued)]",
				}
			default:
				return {
					label: "Idle",
					badgeClass:
						"border-[color-mix(in_srgb,var(--vscode-descriptionForeground)_32%,transparent)] bg-[color-mix(in_srgb,var(--vscode-foreground)_8%,transparent)] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_92%,transparent)]",
				}
		}
	}, [workdayStatus])
	const activeCount = workday?.activeEmployeeIds?.length ?? 0
	const { available: availableCount, flexible: flexibleCount, onCall: onCallCount, suspended: suspendedCount } = availabilityStats
	const autoEligibleCount = autoEligibleEmployeeIds.length
	const workdayRoom: HubRoom | undefined = useMemo(() => {
		if (!hubSnapshot?.rooms || !activeCompany) {
			return undefined
		}
		const expectedTitle = `${activeCompany.name} • Workday Ops`
		const byTitle = hubSnapshot.rooms.find((room) => room.title === expectedTitle)
		if (byTitle) {
			return byTitle
		}
		const employeeIds = new Set(activeCompany.employees.map((employee) => employee.id))
		return hubSnapshot.rooms.find((room) =>
			room.participants.some((participant) => {
				const employeeId = participant.persona?.employeeId
				return Boolean(employeeId && employeeIds.has(employeeId))
			}),
		)
	}, [hubSnapshot?.rooms, activeCompany])
	const workdayMessagesByEmployeeId = useMemo(() => {
		if (!workdayRoom) {
			return new Map<string, HubMessage>()
		}
		const participantById = new Map(workdayRoom.participants.map((participant) => [participant.id, participant]))
		const map = new Map<string, HubMessage>()
		for (const message of workdayRoom.messages) {
			if (!message) {
				continue
			}
			if (message.status === "streaming") {
				continue
			}
			const participant = participantById.get(message.participantId)
			const employeeId = participant?.persona?.employeeId
			if (!employeeId) {
				continue
			}
			const previous = map.get(employeeId)
			if (!previous || message.createdAt > previous.createdAt) {
				map.set(employeeId, message)
			}
		}
		return map
	}, [workdayRoom])
	const activeAssignmentsByEmployeeId = useMemo(() => {
		if (!activeCompany) {
			return new Map<string, WorkplaceActionItem>()
		}
		const nonTerminalStatusIds = new Set(
			sortedStatuses.filter((status) => !status.isTerminal).map((status) => status.id),
		)
		const relevant = activeCompany.actionItems
			.filter((item) => item.ownerEmployeeId && nonTerminalStatusIds.has(item.statusId))
			.sort((a, b) => {
				const aTime = new Date(a.lastStartedAt ?? a.updatedAt ?? a.createdAt).getTime()
				const bTime = new Date(b.lastStartedAt ?? b.updatedAt ?? b.createdAt).getTime()
				return bTime - aTime
			})
		const map = new Map<string, WorkplaceActionItem>()
		for (const item of relevant) {
			const owner = item.ownerEmployeeId
			if (!owner || map.has(owner)) {
				continue
			}
			map.set(owner, item)
		}
		return map
	}, [activeCompany, sortedStatuses])
	const [showCreateForm, setShowCreateForm] = useState(false)
	const defaultStatusId = sortedStatuses[0]?.id ?? ""
	const [newActionDraft, setNewActionDraft] = useState<ActionItemDraft>(() => createInitialDraft(defaultStatusId))
	const [createError, setCreateError] = useState<string | undefined>()
	const [orderedActionIds, setOrderedActionIds] = useState<string[]>([])
	const [draggingId, setDraggingId] = useState<string | null>(null)
	const [dragOverId, setDragOverId] = useState<string | null>(null)
	const previousCompanyIdRef = useRef<string | undefined>()
	const [employeeFilter, setEmployeeFilter] = useState<string>("all")
const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(() => new Set())
const [pendingStartToken, setPendingStartToken] = useState<string | null>(null)
const [workdayOverrides, setWorkdayOverrides] = useState<Set<string>>(() => new Set())
const [workdayNote, setWorkdayNote] = useState("")
const [activeTab, setActiveTab] = useState<"actions" | "schedule">("actions")

	const hasUnassignedActionItems = useMemo(() => {
		if (!activeCompany) return false
		return activeCompany.actionItems.some((item) => !item.ownerEmployeeId)
	}, [activeCompany])

	const employeeFilterOptions = useMemo<SearchableSelectOption[]>(() => {
		const options: SearchableSelectOption[] = [{ value: "all", label: "All employees" }]
		if (hasUnassignedActionItems) {
			options.push({ value: "unassigned", label: "Unassigned tasks" })
		}
		for (const employee of employees) {
			options.push({ value: employee.id, label: employee.name })
		}
		return options
	}, [employees, hasUnassignedActionItems])

	useEffect(() => {
		if (employeeFilter === "all") return
		const validValues = new Set(employeeFilterOptions.map((option) => option.value))
		if (!validValues.has(employeeFilter)) {
			setEmployeeFilter("all")
		}
	}, [employeeFilterOptions, employeeFilter])

	const defaultOrderedIds = useMemo(() => {
		if (!activeCompany) return []
		return [...activeCompany.actionItems]
			.sort((a, b) => {
				const statusDiff = (statusOrder.get(a.statusId) ?? 0) - (statusOrder.get(b.statusId) ?? 0)
				if (statusDiff !== 0) return statusDiff
				return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
			})
			.map((item) => item.id)
	}, [activeCompany, statusOrder])

	useEffect(() => {
		if (!activeCompany) {
			setOrderedActionIds([])
			previousCompanyIdRef.current = undefined
			return
		}

		setOrderedActionIds((prev) => {
			const existingIds = new Set(activeCompany.actionItems.map((item) => item.id))
			const filteredPrev = prev.filter((id) => existingIds.has(id))

			if (!filteredPrev.length || previousCompanyIdRef.current !== activeCompany.id) {
				previousCompanyIdRef.current = activeCompany.id
				return defaultOrderedIds
			}

			const missing = defaultOrderedIds.filter((id) => !filteredPrev.includes(id))
			if (missing.length === 0 && filteredPrev.length === prev.length) {
				return prev
			}

			return [...filteredPrev, ...missing]
		})
	}, [activeCompany, defaultOrderedIds])

	useEffect(() => {
		if (!showCreateForm) {
			setCreateError(undefined)
		}
	}, [showCreateForm])

	useEffect(() => {
		setNewActionDraft((prev) => {
			if (!sortedStatuses.some((status) => status.id === prev.statusId)) {
				return createInitialDraft(defaultStatusId)
			}
			return prev
		})
	}, [defaultStatusId, sortedStatuses])

	const statusOptions = useMemo<SearchableSelectOption[]>(
		() => sortedStatuses.map((status) => ({ value: status.id, label: status.name })),
		[sortedStatuses],
	)

	const employeeOptions = useMemo<SearchableSelectOption[]>(
		() => [
			{ value: "", label: "Unassigned" },
			...employees.map((employee) => ({ value: employee.id, label: employee.name })),
		],
		[employees],
	)

	const actionItemsById = useMemo(() => {
		const map = new Map<string, WorkplaceActionItem>()
		if (!activeCompany) return map
		for (const item of activeCompany.actionItems) {
			map.set(item.id, item)
		}
		return map
	}, [activeCompany])

	const orderedActionItems = useMemo(() => {
		if (!activeCompany) return []
		const ordered: WorkplaceActionItem[] = []
		for (const id of orderedActionIds) {
			const item = actionItemsById.get(id)
			if (item) ordered.push(item)
		}

		if (ordered.length === activeCompany.actionItems.length) return ordered

		const seen = new Set(orderedActionIds)
		for (const item of activeCompany.actionItems) {
			if (!seen.has(item.id)) {
				ordered.push(item)
			}
		}

		return ordered
	}, [activeCompany, actionItemsById, orderedActionIds])

	const visibleActionItems = useMemo(() => {
		if (employeeFilter === "all") {
			return orderedActionItems
		}
		if (employeeFilter === "unassigned") {
			return orderedActionItems.filter((item) => !item.ownerEmployeeId)
		}
		return orderedActionItems.filter((item) => item.ownerEmployeeId === employeeFilter)
	}, [orderedActionItems, employeeFilter])

	const visibleActionIdSet = useMemo(() => new Set(visibleActionItems.map((item) => item.id)), [visibleActionItems])

	const toggleSelectAction = useCallback((actionId: string) => {
		setSelectedActionIds((prev) => {
			const next = new Set(prev)
			if (next.has(actionId)) {
				next.delete(actionId)
			} else {
				next.add(actionId)
			}
			return next
		})
	}, [])

	const toggleSelectAllVisible = useCallback(() => {
		setSelectedActionIds((prev) => {
			if (visibleActionItems.length === 0) {
				return prev
			}
			const everySelected = visibleActionItems.every((item) => prev.has(item.id))
			const next = new Set(prev)
			if (everySelected) {
				visibleActionItems.forEach((item) => next.delete(item.id))
			} else {
				visibleActionItems.forEach((item) => next.add(item.id))
			}
			return next
		})
	}, [visibleActionItems])

	const clearSelection = useCallback(() => setSelectedActionIds(() => new Set()), [])

	const selectedCount = selectedActionIds.size
	const hasSelection = selectedCount > 0
	const allVisibleSelected =
		visibleActionItems.length > 0 && visibleActionItems.every((item) => selectedActionIds.has(item.id))

	useEffect(() => {
		setSelectedActionIds((prev) => {
			if (prev.size === 0) return prev
			const validIds = new Set(orderedActionItems.map((item) => item.id))
			let mutated = false
			const next = new Set<string>()
			prev.forEach((id) => {
				if (validIds.has(id)) {
					next.add(id)
				} else {
					mutated = true
				}
			})
			return mutated ? next : prev
		})
	}, [orderedActionItems])

	useEffect(() => {
		if (employeeFilter === "all") {
			return
		}
		setSelectedActionIds((prev) => {
			if (prev.size === 0) return prev
			let mutated = false
			const next = new Set<string>()
			prev.forEach((id) => {
				if (visibleActionIdSet.has(id)) {
					next.add(id)
				} else {
					mutated = true
				}
			})
			return mutated ? next : prev
		})
	}, [employeeFilter, visibleActionIdSet])

	useEffect(() => {
		setEmployeeFilter("all")
		setSelectedActionIds(() => new Set())
	}, [activeCompanyId])

	useEffect(() => {
		setWorkdayOverrides(new Set())
		setWorkdayNote("")
	}, [activeCompanyId, activeCompany?.workday?.status])

	useEffect(() => {
		if (!pendingStartToken) {
			return
		}
		setPendingStartToken(null)
		setSelectedActionIds(() => new Set())
	}, [workplaceState?.companies, pendingStartToken])

	const isStarting = Boolean(pendingStartToken)

	const handleEmployeeFilterChange = useCallback(
		(value: string) => {
			setEmployeeFilter(value)
			clearSelection()
		},
		[clearSelection],
	)

	const dispatchStart = useCallback(
		(payload: StartActionItemsPayload) => {
			const token =
				typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
					? crypto.randomUUID()
					: `start-${Date.now()}-${Math.random().toString(16).slice(2)}`
			setPendingStartToken(token)
			startActionItems(payload)
		},
		[startActionItems],
	)

	const openChatForAction = useCallback(
		(action: WorkplaceActionItem) => {
			if (!activeCompanyId) return

			const ownerId = action.ownerEmployeeId
			if (ownerId) {
				setActiveEmployee(activeCompanyId, ownerId)
			}

			const ownerName = ownerId ? (employees.find((employee) => employee.id === ownerId)?.name ?? "") : ""

			const lines: string[] = []
			if (ownerName) {
				lines.push(`Hey ${ownerName}, let's kick off "${action.title}".`)
			} else {
				lines.push(`Let's kick off "${action.title}".`)
			}
			lines.push(`Type: ${action.kind}`)
			if (action.description && action.description.trim().length > 0) {
				lines.push(`Details: ${action.description.trim()}`)
			}
			if (action.dueAt) {
				lines.push(`Due: ${action.dueAt}`)
			}

			const chatMessage = lines.join("\n")

			vscode.postMessage({ type: "switchTab", tab: "lobby" })
			vscode.postMessage({ type: "newTask", text: chatMessage })
		},
		[activeCompanyId, employees, setActiveEmployee],
	)

	const handleStartSelected = useCallback(() => {
		if (!activeCompanyId) return
		if (selectedActionIds.size === 0) return
		dispatchStart({
			companyId: activeCompanyId,
			scope: "selection",
			actionItemIds: Array.from(selectedActionIds),
			initiatedBy: "user",
		})
	}, [activeCompanyId, selectedActionIds, dispatchStart])

	const handlePrimaryStart = useCallback(() => {
		if (!activeCompanyId) return
		if (visibleActionItems.length === 0) return
		if (employeeFilter === "all") {
			dispatchStart({ companyId: activeCompanyId, scope: "company", initiatedBy: "user" })
			return
		}
		if (employeeFilter === "unassigned") {
			const ids = visibleActionItems.map((item) => item.id)
			if (ids.length === 0) return
			dispatchStart({ companyId: activeCompanyId, scope: "selection", actionItemIds: ids, initiatedBy: "user" })
			return
		}
		dispatchStart({
			companyId: activeCompanyId,
			scope: "employee",
			employeeId: employeeFilter,
			initiatedBy: "user",
		})
	}, [activeCompanyId, employeeFilter, visibleActionItems, dispatchStart])

	const handleStartSingle = useCallback(
		(action: WorkplaceActionItem) => {
			if (!activeCompanyId) return
			dispatchStart({
				companyId: activeCompanyId,
				scope: "selection",
				actionItemIds: [action.id],
				initiatedBy: "user",
			})
			openChatForAction(action)
		},
		[activeCompanyId, dispatchStart, openChatForAction],
	)

	const handleAvailabilityChange = useCallback(
		(employeeId: string, availability: WorkplaceEmployeeAvailability) => {
			if (!activeCompany) return
			updateEmployeeSchedule({
				companyId: activeCompany.id,
				employeeId,
				availability,
			})
			setWorkdayOverrides((prev) => {
				if (!prev.has(employeeId)) {
					return prev
				}
				if (availability === "available" || availability === "flexible") {
					const next = new Set(prev)
					next.delete(employeeId)
					return next
				}
				return prev
			})
		},
		[activeCompany, updateEmployeeSchedule],
	)

	const toggleOverride = useCallback((employeeId: string) => {
		setWorkdayOverrides((prev) => {
			const next = new Set(prev)
			if (next.has(employeeId)) {
				next.delete(employeeId)
			} else {
				next.add(employeeId)
			}
			return next
		})
	}, [])

	const handleStartWorkday = useCallback(() => {
		if (!activeCompany) return
		const overrides = Array.from(workdayOverrides)
		const defaultIds = autoEligibleEmployeeIds
		const employeeIds = overrides.length > 0 ? Array.from(new Set([...defaultIds, ...overrides])) : undefined
		const reason = workdayNote.trim()
		startWorkday({
			companyId: activeCompany.id,
			employeeIds,
			reason: reason.length > 0 ? reason : undefined,
			initiatedBy: "user",
		})
		setWorkdayOverrides(new Set())
		setWorkdayNote("")
	}, [activeCompany, autoEligibleEmployeeIds, startWorkday, workdayNote, workdayOverrides])

	const handleHaltWorkday = useCallback(() => {
		if (!activeCompany) return
		const reason = workdayNote.trim()
		haltWorkday({
			companyId: activeCompany.id,
			reason: reason.length > 0 ? reason : undefined,
			initiatedBy: "user",
		})
		setWorkdayOverrides(new Set())
		setWorkdayNote("")
	}, [activeCompany, haltWorkday, workdayNote])

	const handleOpenEmployeeActivity = useCallback(
		(employeeId: string) => {
			if (!workdayRoom) {
				return
			}
			setActiveHubRoom(workdayRoom.id)
			vscode.postMessage({ type: "action", action: "switchTab", tab: "hub" })
			window.postMessage({ type: "action", action: "switchTab", tab: "hub" }, "*")
			if (activeCompanyId) {
				setActiveEmployee(activeCompanyId, employeeId)
			}
		},
		[workdayRoom, setActiveHubRoom, activeCompanyId, setActiveEmployee],
	)

	const selectedEmployee = useMemo(
		() => employees.find((employee) => employee.id === employeeFilter),
		[employees, employeeFilter],
	)

	const primaryStartLabel = useMemo(() => {
		if (employeeFilter === "all") return "Start All Employees"
		if (employeeFilter === "unassigned") return "Start Unassigned Tasks"
		return selectedEmployee ? `Start ${selectedEmployee.name}` : "Start Employee"
	}, [employeeFilter, selectedEmployee])

	const startSelectedLabel = hasSelection ? `Start Selected (${selectedCount})` : "Start Selected"
	const primaryStartDisabled = !activeCompanyId || isStarting || visibleActionItems.length === 0
	const startSelectedDisabled = !activeCompanyId || !hasSelection || isStarting
	const shouldShowClearSelection = hasSelection && !isStarting
	const selectionSummary = hasSelection
		? `${selectedCount} ${selectedCount === 1 ? "task selected" : "tasks selected"}`
		: undefined

	const { dueSoonCount, overdueCount } = useMemo(() => {
		const now = new Date()
		const upcoming = new Date(now.getTime())
		upcoming.setDate(upcoming.getDate() + 7)

		let dueSoon = 0
		let overdue = 0

		for (const item of visibleActionItems) {
			if (!item.dueAt) continue
			const dueDate = new Date(item.dueAt)
			if (Number.isNaN(dueDate.getTime())) continue
			if (dueDate < now) {
				overdue += 1
			} else if (dueDate <= upcoming) {
				dueSoon += 1
			}
		}

		return { dueSoonCount: dueSoon, overdueCount: overdue }
	}, [visibleActionItems])

	const summaryTiles = useMemo(
		() => [
			{
				label: "Visible",
				value: `${visibleActionItems.length}`,
				helper: `of ${orderedActionItems.length} total`,
			},
			{
				label: "Assigned teammates",
				value: `${employees.length}`,
				helper: employees.length === 1 ? "teammate" : "teammates",
			},
			{
				label: "Selected",
				value: `${selectedCount}`,
				helper: selectedCount === 1 ? "item ready" : "items ready",
			},
			{
				label: "Due soon",
				value: `${dueSoonCount}`,
				helper: overdueCount > 0 ? `${overdueCount} overdue` : "next 7 days",
			},
		],
		[visibleActionItems.length, orderedActionItems.length, employees.length, selectedCount, dueSoonCount, overdueCount],
	)

	const handleCreateActionItem = () => {
		if (!activeCompany) return
		if (!newActionDraft.title.trim()) {
			setCreateError("A title is required")
			return
		}
		if (!newActionDraft.statusId) {
			setCreateError("Select a status before creating an action item")
			return
		}

		createActionItem({
			companyId: activeCompany.id,
			title: newActionDraft.title.trim(),
			kind: newActionDraft.kind,
			statusId: newActionDraft.statusId,
			description: newActionDraft.description.trim() ? newActionDraft.description.trim() : undefined,
			ownerEmployeeId: newActionDraft.ownerEmployeeId || undefined,
			dueAt: newActionDraft.dueAt || undefined,
		})
		setNewActionDraft(createInitialDraft(defaultStatusId))
		setShowCreateForm(false)
		setCreateError(undefined)
	}

	const handleCreateStatus = useCallback(
		(name: string) => {
			if (!activeCompany) return
			createActionStatus({ companyId: activeCompany.id, name })
		},
		[activeCompany, createActionStatus],
	)

	const handleUpdateAction = useCallback(
		(actionItem: WorkplaceActionItem) => {
			if (!activeCompany) return
			updateActionItem({ companyId: activeCompany.id, actionItem })
		},
		[activeCompany, updateActionItem],
	)

	const handleDeleteAction = useCallback(
		(actionId: string) => {
			if (!activeCompany) return
			setOrderedActionIds((prev) => prev.filter((id) => id !== actionId))
			deleteActionItem({ companyId: activeCompany.id, actionItemId: actionId })
		},
		[activeCompany, deleteActionItem],
	)

	const handleDragStart = useCallback((event: DragEvent<HTMLTableRowElement>, actionId: string) => {
		setDraggingId(actionId)
		event.dataTransfer.setData("text/plain", actionId)
		event.dataTransfer.effectAllowed = "move"
	}, [])

	const handleDragOver = useCallback(
		(event: DragEvent<HTMLTableRowElement>, targetId: string) => {
			if (!draggingId) return
			event.preventDefault()
			event.dataTransfer.dropEffect = "move"
			if (dragOverId !== targetId) {
				setDragOverId(targetId)
			}
		},
		[dragOverId, draggingId],
	)

	const handleDrop = useCallback(
		(event: DragEvent<HTMLTableRowElement>, targetId: string) => {
			if (!draggingId) return
			event.preventDefault()
			event.stopPropagation()
			const draggedId = event.dataTransfer.getData("text/plain") || draggingId
			if (!draggedId || draggedId === targetId) return

			setOrderedActionIds((prev) => {
				if (!prev.includes(draggedId)) return prev
				const withoutDragged = prev.filter((id) => id !== draggedId)
				const targetIndex = withoutDragged.indexOf(targetId)
				if (targetIndex === -1) return prev
				const next = [...withoutDragged]
				next.splice(targetIndex, 0, draggedId)
				return next
			})
			setDragOverId(null)
			setDraggingId(null)
		},
		[draggingId],
	)

	const handleDropToEnd = useCallback(
		(event: DragEvent<HTMLTableSectionElement>) => {
			if (!draggingId) return
			event.preventDefault()
			const draggedId = event.dataTransfer.getData("text/plain") || draggingId
			if (!draggedId) return

			setOrderedActionIds((prev) => {
				if (!prev.includes(draggedId)) return prev
				const withoutDragged = prev.filter((id) => id !== draggedId)
				return [...withoutDragged, draggedId]
			})
			setDragOverId(null)
			setDraggingId(null)
		},
		[draggingId],
	)

	const handleDragEnd = useCallback(() => {
		setDraggingId(null)
		setDragOverId(null)
	}, [])

	return (
		<div className="flex h-full flex-col">
			<header className="flex items-center justify-between border-b border-[var(--vscode-panel-border)] px-6 py-4">
				<div>
					<h1 className="m-0 text-lg font-semibold text-[var(--vscode-foreground)]">Action Workspace</h1>
					<p className="m-0 text-sm text-[var(--vscode-descriptionForeground)]">
						Coordinate goals, projects, and tasks for every company.
					</p>
				</div>
				<div className="flex items-center gap-2">
					{companies.length > 0 && (
						<VSCodeDropdown
							value={activeCompany?.id}
							onChange={(event: any) => selectCompany(event.target.value as string)}
							className="min-w-[200px]">
							{companies.map((company) => (
								<VSCodeOption key={company.id} value={company.id}>
									{company.name}
								</VSCodeOption>
							))}
						</VSCodeDropdown>
					)}
					<VSCodeButton appearance="secondary" onClick={onDone}>
						Back to chat
					</VSCodeButton>
				</div>
			</header>

			<div className="px-6 pt-4">
				<div className="inline-flex rounded-full border border-[color-mix(in_srgb,var(--vscode-panel-border)_60%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)] p-1 shadow-[0_10px_24px_rgba(0,0,0,0.24)]">
					<button
						type="button"
						onClick={() => setActiveTab("actions")}
						className={cn(
							"rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors",
							activeTab === "actions"
								? "bg-[color-mix(in_srgb,var(--vscode-focusBorder)_26%,transparent)] text-[var(--vscode-foreground)]"
								: "text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_82%,transparent)] hover:text-[var(--vscode-foreground)]",
						)}>
						Action Items
					</button>
					<button
						type="button"
						onClick={() => setActiveTab("schedule")}
						className={cn(
							"rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors",
							activeTab === "schedule"
								? "bg-[color-mix(in_srgb,var(--vscode-focusBorder)_26%,transparent)] text-[var(--vscode-foreground)]"
								: "text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_82%,transparent)] hover:text-[var(--vscode-foreground)]",
						)}>
						Schedule
					</button>
				</div>
			</div>

			{activeTab === "schedule" && activeCompany && (
				<section className="border-b border-[color-mix(in_srgb,var(--vscode-panel-border)_68%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)]/85 px-6 py-5 backdrop-blur">
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
							<div className="flex flex-col gap-2">
								<div className="flex items-center gap-3">
									<span
										className={cn(
											"inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
											workdayStatusMeta.badgeClass,
										)}>
										{workdayStatusMeta.label}
									</span>
									<span className="text-[12px] text-[var(--vscode-descriptionForeground)]">
										{activeCount} active · {autoEligibleCount} auto-eligible ({availableCount} scheduled · {flexibleCount} flexible) · {onCallCount} on call · {suspendedCount} suspended
									</span>
								</div>
								{workday?.lastActivationReason ? (
									<p className="m-0 text-[12px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_88%,transparent)]">
										Last note: {workday.lastActivationReason}
									</p>
								) : null}
							</div>
							<div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
								<VSCodeTextField
									className="w-full sm:w-64"
									placeholder="Add a note for this change (optional)"
									value={workdayNote}
									onInput={(event: any) => {
										const target = event.target as HTMLInputElement | null
										setWorkdayNote(target?.value ?? "")
									}}
								/>
								{workdayStatus === "active" ? (
									<VSCodeButton
										appearance="secondary"
										onClick={handleHaltWorkday}
										className="h-8 min-w-[140px] rounded-full text-[11px] font-semibold uppercase tracking-[0.18em]">
											Halt Workday
										</VSCodeButton>
								) : (
									<VSCodeButton
										appearance="primary"
										onClick={handleStartWorkday}
										disabled={employees.length === 0}
										className="h-8 min-w-[140px] rounded-full text-[11px] font-semibold uppercase tracking-[0.18em]">
											Start Workday
										</VSCodeButton>
								)}
							</div>
						</div>
						<div className="grid gap-2">
					{employees.map((employee) => {
						const availability = availabilityMap.get(employee.id) ?? "available"
						const isActive = activeWorkdayEmployeeIds.has(employee.id)
						const overrideSelected = workdayOverrides.has(employee.id)
						const assignment = activeAssignmentsByEmployeeId.get(employee.id)
						const latestMessage = workdayMessagesByEmployeeId.get(employee.id)
						const assignmentStatusName = assignment ? statusById.get(assignment.statusId)?.name : undefined
						const assignmentTime = assignment?.lastStartedAt ?? assignment?.updatedAt ?? assignment?.createdAt
						const lastInteractionLabel = latestMessage
							? formatRelativeTime(latestMessage.createdAt)
							: assignmentTime
								? formatRelativeTime(assignmentTime)
								: workday?.startedAt
									? formatRelativeTime(workday.startedAt)
									: "moments ago"
						const activityMetaParts: string[] = []
						if (assignmentStatusName) {
							activityMetaParts.push(assignmentStatusName)
						}
						if (lastInteractionLabel) {
							activityMetaParts.push(lastInteractionLabel)
						}
						const activityMeta = activityMetaParts.join(" • ")
						const activitySnippet = latestMessage
							? createMessageSnippet(latestMessage.content)
							: createMessageSnippet(assignment?.description)
						const activityPrimaryLabel = assignment
							? `Working on “${assignment.title}”`
							: latestMessage
								? `Collaborating in ${workdayRoom?.title ?? "the hub"}`
								: "Standing by for the next task"
						return (
							<div
								key={employee.id}
								className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_60%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)]/85 px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.24)]">
								<div className="flex min-w-[220px] flex-1 flex-col gap-2">
									<div className="flex flex-col gap-1">
										<span className="text-sm font-semibold text-[var(--vscode-foreground)]">{employee.name}</span>
										<span className="text-[12px] text-[var(--vscode-descriptionForeground)]">{employee.role || "No role set"}</span>
										{availability === "flexible" ? (
											<span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--vscode-focusBorder)_38%,transparent)] bg-[color-mix(in_srgb,var(--vscode-focusBorder)_16%,transparent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--vscode-focusBorder)]">
												Flexible
											</span>
										) : null}
										{isActive ? (
											<span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--vscode-testing-iconPassed)_42%,transparent)] bg-[color-mix(in_srgb,var(--vscode-testing-iconPassed)_14%,transparent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--vscode-testing-iconPassed)]">
												On duty
											</span>
										) : null}
									</div>
									{isActive ? (
										<div className="flex flex-col gap-1">
											<button
												type="button"
												onClick={() => handleOpenEmployeeActivity(employee.id)}
												disabled={!workdayRoom}
												className={cn(
													"group inline-flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px] font-semibold transition-[transform,box-shadow,border-color]",
													workdayRoom
														? "border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] text-[var(--vscode-foreground)] shadow-[0_8px_20px_rgba(0,0,0,0.24)] hover:-translate-y-[1px] hover:border-[color-mix(in_srgb,var(--vscode-foreground)_22%,transparent)] hover:shadow-[0_14px_32px_rgba(0,0,0,0.28)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--vscode-focusBorder)]"
													: "cursor-not-allowed border-[color-mix(in_srgb,var(--vscode-panel-border)_72%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_88%,transparent)] opacity-70",
												)}
											>
												<div className="flex flex-1 flex-col gap-0.5">
													<span>{activityPrimaryLabel}</span>
													{activityMeta ? (
														<span className="text-[11px] font-normal text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_88%,transparent)]">
															{activityMeta}
														</span>
													) : null}
												</div>
												<span
													className="codicon codicon-arrow-right text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_88%,transparent)] transition-transform group-hover:translate-x-[2px]"
													aria-hidden="true"
												/>
											</button>
											{activitySnippet ? (
												<p className="m-0 text-[11px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_86%,transparent)]">
													“{activitySnippet}”
												</p>
											) : null}
										</div>
									) : (
										<p className="m-0 text-[11px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_86%,transparent)]">
											Off duty — will be auto-activated when their next shift begins.
										</p>
									)}
								</div>
								<div className="flex flex-wrap items-center justify-end gap-2">
									<VSCodeDropdown
										value={availability}
										onChange={(event: any) =>
											handleAvailabilityChange(employee.id, event.target.value as WorkplaceEmployeeAvailability)
										}
										className="h-8 min-w-[150px] text-[12px]">
										<VSCodeOption value="available">Scheduled</VSCodeOption>
										<VSCodeOption value="flexible">Flexible</VSCodeOption>
										<VSCodeOption value="on_call">On Call</VSCodeOption>
										<VSCodeOption value="suspended">Suspended</VSCodeOption>
									</VSCodeDropdown>
									{availability !== "available" && availability !== "flexible" && (
										<VSCodeButton
											appearance={overrideSelected ? "primary" : "secondary"}
											onClick={() => toggleOverride(employee.id)}
											className="h-8 whitespace-nowrap rounded-full text-[10px] font-semibold uppercase tracking-[0.2em]">
												{overrideSelected ? "Remove override" : "Include on start"}
											</VSCodeButton>
										)}
								</div>
							</div>
						)
					})}
					</div>
					<WorkdayScheduleBoard
						companyId={activeCompany.id}
						employees={employees}
						shifts={shifts}
						onCreateShift={createShift}
						onUpdateShift={updateShift}
						onDeleteShift={deleteShift}
					/>
				</div>
			</section>
			)}

			{activeTab === "actions" ? (
				!activeCompany ? (
					<div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-[var(--vscode-descriptionForeground)]">
						<p className="m-0 max-w-md">
							Create a company first to start organizing action items. Head to the Workforce Hub and add your
							first team.
						</p>
					</div>
				) : (
					<div className="flex flex-1 flex-col overflow-hidden bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)]">
						<div className="flex flex-1 flex-col gap-4 overflow-hidden px-6 py-6">
							<section className="flex flex-1 flex-col overflow-hidden rounded-xl border border-[var(--vscode-panel-border)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,transparent)] shadow-[0_14px_36px_rgba(0,0,0,0.28)]">
							<div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--vscode-panel-border)] px-6 py-5">
								<div className="max-w-xl">
									<p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--vscode-descriptionForeground)]">
										Action Board
									</p>
									<h2 className="m-0 text-xl font-semibold text-[var(--vscode-foreground)]">Action Items</h2>
									<p className="mt-1 text-xs text-[var(--vscode-descriptionForeground)]">
										Focus your team and launch the next wave of work from a single command center.
									</p>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<VSCodeButton
										appearance={showCreateForm ? "secondary" : "primary"}
										onClick={() => setShowCreateForm((prev) => !prev)}>
										{showCreateForm ? "Cancel" : "New action item"}
									</VSCodeButton>
								</div>
							</div>
							<div className="grid gap-3 border-b border-[color-mix(in_srgb,var(--vscode-panel-border)_60%,transparent)] px-6 pb-5 pt-4 sm:grid-cols-2 lg:grid-cols-4">
								{summaryTiles.map((tile) => (
									<div
										key={tile.label}
										className="rounded-lg border border-[color-mix(in_srgb,var(--vscode-foreground)_10%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] px-3 py-3 shadow-[0_6px_16px_rgba(0,0,0,0.22)]">
										<p className="m-0 text-[11px] font-medium uppercase tracking-wide text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
											{tile.label}
										</p>
										<p className="mt-1 text-lg font-semibold text-[var(--vscode-foreground)]">{tile.value}</p>
										<p className="m-0 text-xs text-[var(--vscode-descriptionForeground)]">{tile.helper}</p>
									</div>
								))}
							</div>
						<div className="px-6 pb-5 pt-2">
							<div className="flex flex-col gap-4 rounded-2xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_68%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)] px-5 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-sm">
								<div className="flex flex-col items-start gap-3 lg:flex-row lg:items-center lg:justify-between">
									<div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
										<div className="flex w-full flex-col gap-1 sm:w-auto">
											<span className="inline-flex h-7 items-center self-start rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_92%,transparent)]">
												Team Filter
											</span>
											<SearchableSelect
												value={employeeFilter}
												onValueChange={handleEmployeeFilterChange}
												options={employeeFilterOptions}
												placeholder="Filter by teammate"
												searchPlaceholder="Search teammates"
												emptyMessage="No teammates found"
												className="w-full sm:w-60"
												triggerClassName="h-8 rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_86%,transparent)] px-3 text-[12px] font-medium text-[var(--vscode-foreground)] shadow-[0_10px_26px_rgba(0,0,0,0.26)] transition-[border-color,box-shadow] hover:border-[color-mix(in_srgb,var(--vscode-foreground)_22%,transparent)] focus-visible:outline-none data-[state=open]:border-[color-mix(in_srgb,var(--vscode-foreground)_32%,transparent)]"
												density="compact"
												inputClassName="mr-3 text-[12px]"
												contentClassName="rounded-xl border border-[color-mix(in_srgb,var(--vscode-foreground)_14%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)] shadow-[0_22px_40px_rgba(0,0,0,0.32)]"
											/>
										</div>
										<div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_90%,transparent)]">
											<span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] px-3 py-1 shadow-[0_8px_22px_rgba(0,0,0,0.24)]">
												<span className="codicon codicon-gripper text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_92%,transparent)]" aria-hidden="true" />
												Drag rows to reorder
											</span>
											{selectionSummary ? (
												<span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_16%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-selectionBackground)_28%,transparent)] px-3 py-1 text-[color-mix(in_srgb,var(--vscode-foreground)_92%,transparent)] shadow-[0_10px_28px_rgba(0,0,0,0.26)]">
													{selectionSummary}
												</span>
											) : null}
										</div>
									</div>
									<div className="flex w-full flex-wrap items-center justify-end gap-2 rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] px-2 py-1 shadow-[0_12px_30px_rgba(0,0,0,0.26)]">
										<VSCodeButton
											appearance="secondary"
											disabled={primaryStartDisabled}
											onClick={handlePrimaryStart}
											className="h-8 min-w-[148px] whitespace-nowrap rounded-full text-[11px] font-semibold uppercase tracking-[0.18em]">
											{primaryStartLabel}
										</VSCodeButton>
										<VSCodeButton
											appearance={hasSelection ? "primary" : "secondary"}
											disabled={startSelectedDisabled}
											onClick={handleStartSelected}
											className="h-8 min-w-[148px] whitespace-nowrap rounded-full text-[11px] font-semibold uppercase tracking-[0.18em]">
											{startSelectedLabel}
										</VSCodeButton>
										{shouldShowClearSelection && (
											<VSCodeButton
												appearance="secondary"
												disabled={isStarting}
												onClick={clearSelection}
												className="h-8 rounded-full text-[11px] font-semibold uppercase tracking-[0.18em]">
													Clear Selection
												</VSCodeButton>
										)}
									</div>
								</div>
							</div>
						</div>
							<div className="flex-1 overflow-hidden">
								<div className="flex-1 overflow-auto px-6 pb-6">
								<table className="min-w-full table-fixed border-separate border-spacing-0 text-sm">
									<thead className="sticky top-0 z-20 border-b border-[color-mix(in_srgb,var(--vscode-panel-border)_70%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)]/95 backdrop-blur-sm shadow-[0_24px_40px_rgba(0,0,0,0.32)]">
										<tr className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_88%,transparent)]">
											<th className="w-10 px-3 py-3 text-left font-semibold text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_92%,transparent)]">
													<input
														type="checkbox"
														className="h-3.5 w-3.5 cursor-pointer"
														disabled={visibleActionItems.length === 0 || isStarting}
														checked={allVisibleSelected && visibleActionItems.length > 0}
														onChange={toggleSelectAllVisible}
														aria-label="Select visible action items"
													/>
												</th>
											<th className="w-12 px-3 py-3 text-left font-semibold text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_92%,transparent)]">
												#
											</th>
											<th className="px-3 py-3 text-left font-semibold text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_92%,transparent)]">
												Title
											</th>
											<th className="w-28 px-3 py-3 text-left font-semibold text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_92%,transparent)]">
												Type
											</th>
											<th className="w-40 px-3 py-3 text-left font-semibold text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_92%,transparent)]">
												Status
											</th>
											<th className="w-40 px-3 py-3 text-left font-semibold text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_92%,transparent)]">
												Assignee
											</th>
											<th className="w-28 px-3 py-3 text-left font-semibold text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_92%,transparent)]">
												Due
											</th>
											<th className="px-3 py-3 text-left font-semibold text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_92%,transparent)]">
												Description
											</th>
											<th className="w-36 px-3 py-3 text-right font-semibold text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_92%,transparent)]">
												Actions
											</th>
											</tr>
										</thead>
										<tbody
											onDragOver={(event) => {
												if (!draggingId) return
												event.preventDefault()
											}}
											onDrop={handleDropToEnd}>
											{showCreateForm && (
												<CreateActionRow
													draft={newActionDraft}
													statusOptions={statusOptions}
													employeeOptions={employeeOptions}
													onDraftChange={setNewActionDraft}
													onCreate={handleCreateActionItem}
													onCancel={() => setShowCreateForm(false)}
													onCreateStatus={handleCreateStatus}
													createError={createError}
												/>
											)}

											{visibleActionItems.length === 0 && !showCreateForm ? (
												<tr>
													<td
														colSpan={9}
														className="border-b border-[var(--vscode-panel-border)] px-6 py-6 text-center text-[var(--vscode-descriptionForeground)]">
														{orderedActionItems.length === 0
															? "No action items yet. Create one to get started."
															: "No action items match the current filter."}
													</td>
												</tr>
											) : (
												visibleActionItems.map((item, index) => {
													const statusMeta = statusById.get(item.statusId)
													return (
														<ActionTableRow
															key={item.id}
															index={index + 1}
															action={item}
															statuses={sortedStatuses}
															employees={employees}
															statusOptions={statusOptions}
															employeeOptions={employeeOptions}
															onUpdate={handleUpdateAction}
															onDelete={handleDeleteAction}
															onCreateStatus={handleCreateStatus}
															isDragging={draggingId === item.id}
															isDragOver={dragOverId === item.id}
															onDragStart={handleDragStart}
															onDragOver={handleDragOver}
															onDrop={handleDrop}
															onDragEnd={handleDragEnd}
															isSelected={selectedActionIds.has(item.id)}
															onToggleSelect={() => toggleSelectAction(item.id)}
															isSelectionDisabled={isStarting}
															onStart={() => handleStartSingle(item)}
															isStartDisabled={isStarting || Boolean(statusMeta?.isTerminal)}
														/>
													)
												})
											)}
										</tbody>
									</table>
								</div>
							</div>
						</section>
					</div>
				</div>
				)
			) : null}
		</div>
	)
}

interface ActionTableRowProps {
	index: number
	action: WorkplaceActionItem
	statuses: WorkplaceActionStatus[]
	employees: WorkplaceEmployee[]
	statusOptions: SearchableSelectOption[]
	employeeOptions: SearchableSelectOption[]
	onUpdate: (actionItem: WorkplaceActionItem) => void
	onDelete: (actionId: string) => void
	onCreateStatus: (name: string) => void
	isDragging: boolean
	isDragOver: boolean
	onDragStart: (event: DragEvent<HTMLTableRowElement>, actionId: string) => void
	onDragOver: (event: DragEvent<HTMLTableRowElement>, actionId: string) => void
	onDrop: (event: DragEvent<HTMLTableRowElement>, actionId: string) => void
	onDragEnd: () => void
	isSelected: boolean
	onToggleSelect: () => void
	isSelectionDisabled: boolean
	onStart: () => void
	isStartDisabled: boolean
}

const ActionTableRow = ({
	index,
	action,
	statuses: _statuses,
	employees,
	statusOptions,
	employeeOptions,
	onUpdate,
	onDelete,
	onCreateStatus,
	isDragging,
	isDragOver,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd,
	isSelected,
	onToggleSelect,
	isSelectionDisabled,
	onStart,
	isStartDisabled,
}: ActionTableRowProps) => {
	const [draft, setDraft] = useState<WorkplaceActionItem>(() => ({ ...action, relationIds: [...action.relationIds] }))
	const [isDirty, setIsDirty] = useState(false)

	useEffect(() => {
		setDraft({ ...action, relationIds: [...action.relationIds] })
		setIsDirty(false)
	}, [action])

	const setDraftField = <K extends keyof WorkplaceActionItem>(key: K, value: WorkplaceActionItem[K]) => {
		setDraft((prev) => ({ ...prev, [key]: value }))
		setIsDirty(true)
	}

	const handleSave = () => {
		const sanitized = sanitizeActionForUpdate(draft, action)
		onUpdate(sanitized)
		setIsDirty(false)
	}

	const handleDelete = () => {
		const confirmed = confirm(`Delete "${action.title}"? This cannot be undone.`)
		if (!confirmed) return
		onDelete(action.id)
	}

	const ownerName = draft.ownerEmployeeId
		? (employees.find((employee) => employee.id === draft.ownerEmployeeId)?.name ?? "Unassigned")
		: "Unassigned"

	const handleSelectChange = (event: ChangeEvent<HTMLInputElement>) => {
		if (isSelectionDisabled) {
			event.preventDefault()
			return
		}
		onToggleSelect()
	}

	return (
		<tr
			draggable
			onDragStart={(event) => onDragStart(event, action.id)}
			onDragOver={(event) => onDragOver(event, action.id)}
			onDrop={(event) => onDrop(event, action.id)}
			onDragEnd={onDragEnd}
			className={cn(
				"group relative isolate align-top text-sm transition-[transform,box-shadow]",
				"before:pointer-events-none before:absolute before:-inset-x-[6px] before:-inset-y-[6px] before:-z-10 before:rounded-2xl before:border before:border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] before:bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] before:content-[''] before:shadow-[0_14px_36px_rgba(0,0,0,0.24)] before:transition-[border-color,box-shadow,transform]",
				"hover:-translate-y-[1px] hover:before:border-[color-mix(in_srgb,var(--vscode-foreground)_26%,transparent)] hover:before:shadow-[0_20px_48px_rgba(0,0,0,0.32)]",
				isDragOver &&
					"before:border-dashed before:border-[color-mix(in_srgb,var(--vscode-foreground)_32%,transparent)] before:bg-[color-mix(in_srgb,var(--vscode-editor-selectionBackground)_28%,transparent)]",
				isDragging && "opacity-70 before:shadow-[0_10px_24px_rgba(0,0,0,0.22)]",
				isSelected &&
					"before:border-[color-mix(in_srgb,var(--vscode-focusBorder,var(--vscode-editor-selectionBackground))_100%,transparent)] before:bg-[color-mix(in_srgb,var(--vscode-editor-selectionBackground)_38%,transparent)]",
			)}
			style={{ cursor: "grab" }}>
			<td className="px-4 py-4 align-top">
				<input
					type="checkbox"
					className="h-4 w-4 cursor-pointer rounded border border-[color-mix(in_srgb,var(--vscode-foreground)_18%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_86%,transparent)] transition-colors hover:border-[color-mix(in_srgb,var(--vscode-foreground)_32%,transparent)]"
					checked={isSelected}
					disabled={isSelectionDisabled}
					onChange={handleSelectChange}
					onClick={(event) => event.stopPropagation()}
					onPointerDown={(event) => event.stopPropagation()}
					aria-label={`Select action ${action.title}`}
				/>
			</td>
			<td className="px-4 py-4 align-top text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_92%,transparent)]">
				<div className="flex items-center gap-3">
					<span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--vscode-foreground)_14%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_86%,transparent)] text-[11px] font-semibold text-[var(--vscode-foreground)] shadow-[0_6px_18px_rgba(0,0,0,0.24)]">
						{index}
					</span>
					<span
						className="codicon codicon-gripper text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]"
						aria-hidden="true"
					/>
				</div>
			</td>
			<td className="px-4 py-4">
				<VSCodeTextField
					value={draft.title}
					onInput={(event: any) => setDraftField("title", event.target.value as string)}
					placeholder="Title"
					className="w-full text-sm"
				/>
			</td>
			<td className="px-4 py-4">
				<VSCodeDropdown
					className="w-full text-sm"
					value={draft.kind}
					onChange={(event: any) => setDraftField("kind", event.target.value as WorkplaceActionItemKind)}>
					<VSCodeOption value="goal">Goal</VSCodeOption>
					<VSCodeOption value="project">Project</VSCodeOption>
					<VSCodeOption value="task">Task</VSCodeOption>
				</VSCodeDropdown>
			</td>
			<td className="px-4 py-4">
					<SearchableSelect
						value={draft.statusId}
						onValueChange={(value) => setDraftField("statusId", value)}
						options={statusOptions}
						placeholder="Select status"
						searchPlaceholder="Search statuses"
						emptyMessage="No statuses found"
						onCreateOption={onCreateStatus}
						createOptionLabel={(value) => `Create status "${value}"`}
						triggerClassName="h-8 min-w-[168px] rounded-lg border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_86%,transparent)] px-3 text-[12px] font-medium text-[var(--vscode-foreground)] shadow-[0_10px_24px_rgba(0,0,0,0.24)] transition-[border-color,box-shadow] hover:border-[color-mix(in_srgb,var(--vscode-foreground)_26%,transparent)] focus-visible:outline-none data-[state=open]:border-[color-mix(in_srgb,var(--vscode-foreground)_34%,transparent)]"
						density="compact"
						inputClassName="mr-3 text-[12px]"
					/>
			</td>
			<td className="px-4 py-4">
					<SearchableSelect
						value={draft.ownerEmployeeId ?? ""}
						onValueChange={(value) => setDraftField("ownerEmployeeId", value || undefined)}
						options={employeeOptions}
						placeholder="Choose assignee"
						searchPlaceholder="Search teammates"
						emptyMessage="No teammates found"
						triggerClassName="h-8 min-w-[168px] rounded-lg border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_86%,transparent)] px-3 text-[12px] font-medium text-[var(--vscode-foreground)] shadow-[0_10px_24px_rgba(0,0,0,0.24)] transition-[border-color,box-shadow] hover:border-[color-mix(in_srgb,var(--vscode-foreground)_26%,transparent)] focus-visible:outline-none data-[state=open]:border-[color-mix(in_srgb,var(--vscode-foreground)_34%,transparent)]"
						density="compact"
						inputClassName="mr-3 text-[12px]"
					/>
				<p className="m-0 mt-2 inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_14%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] px-2 py-[3px] text-[10px] font-medium uppercase tracking-[0.16em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_88%,transparent)]">
					{ownerName}
				</p>
			</td>
			<td className="px-4 py-4">
				<input
					type="date"
					className="w-full rounded-lg border border-[color-mix(in_srgb,var(--vscode-foreground)_14%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_86%,transparent)] px-3 py-2 text-sm text-[var(--vscode-foreground)] shadow-[0_8px_22px_rgba(0,0,0,0.24)] focus:border-[color-mix(in_srgb,var(--vscode-foreground)_26%,transparent)] focus:outline-none"
					value={formatDueDateInput(draft.dueAt)}
					onChange={(event) => setDraftField("dueAt", event.target.value)}
				/>
			</td>
			<td className="px-4 py-4">
					<VSCodeTextArea
						value={draft.description ?? ""}
						onInput={(event: any) => setDraftField("description", event.target.value as string)}
						rows={2}
						placeholder="Description"
						className="w-full rounded-xl border border-[color-mix(in_srgb,var(--vscode-foreground)_14%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_86%,transparent)] px-3 py-2 text-[13px] leading-snug shadow-[0_10px_24px_rgba(0,0,0,0.24)]"
					/>
			</td>
			<td className="px-4 py-4">
				<div className="flex items-center justify-end gap-2 rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_14%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_86%,transparent)] px-3 py-1 shadow-[0_10px_28px_rgba(0,0,0,0.26)]">
					<VSCodeButton
						appearance="icon"
						disabled={isStartDisabled}
						onClick={onStart}
						aria-label="Start action"
						className="text-[var(--vscode-foreground)]">
						<span className="codicon codicon-play" aria-hidden="true" />
					</VSCodeButton>
					<VSCodeButton
						appearance="icon"
						onClick={handleDelete}
						aria-label="Delete action"
						className="text-[var(--vscode-errorForeground)]">
						<span className="codicon codicon-trash" aria-hidden="true" />
					</VSCodeButton>
					<VSCodeButton
						appearance="icon"
						disabled={!isDirty}
						onClick={handleSave}
						aria-label="Save changes"
						className="text-[var(--vscode-foreground)]">
						<span className="codicon codicon-check" aria-hidden="true" />
					</VSCodeButton>
				</div>
			</td>
		</tr>
	)
}

interface CreateActionRowProps {
	draft: ActionItemDraft
	statusOptions: SearchableSelectOption[]
	employeeOptions: SearchableSelectOption[]
	onDraftChange: Dispatch<SetStateAction<ActionItemDraft>>
	onCreate: () => void
	onCancel: () => void
	onCreateStatus: (name: string) => void
	createError?: string
}

const CreateActionRow = ({
	draft,
	statusOptions,
	employeeOptions,
	onDraftChange,
	onCreate,
	onCancel,
	onCreateStatus,
	createError,
}: CreateActionRowProps) => {
	return (
		<>
			<tr className="group relative isolate align-top text-sm before:pointer-events-none before:absolute before:-inset-x-[6px] before:-inset-y-[6px] before:-z-10 before:rounded-2xl before:border before:border-dashed before:border-[color-mix(in_srgb,var(--vscode-foreground)_26%,transparent)] before:bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)] before:content-[''] before:shadow-[0_12px_28px_rgba(0,0,0,0.22)] hover:before:border-[color-mix(in_srgb,var(--vscode-foreground)_36%,transparent)]">
				<td className="px-4 py-4" />
				<td className="px-4 py-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_92%,transparent)]">
					New
				</td>
				<td className="px-4 py-4">
					<VSCodeTextField
						value={draft.title}
						onInput={(event: any) => onDraftChange((prev) => ({ ...prev, title: event.target.value }))}
						placeholder="Title"
						className="w-full text-sm"
					/>
				</td>
				<td className="px-4 py-4">
					<VSCodeDropdown
						className="w-full text-sm"
						value={draft.kind}
						onChange={(event: any) =>
							onDraftChange((prev) => ({ ...prev, kind: event.target.value as WorkplaceActionItemKind }))
						}>
						<VSCodeOption value="goal">Goal</VSCodeOption>
						<VSCodeOption value="project">Project</VSCodeOption>
						<VSCodeOption value="task">Task</VSCodeOption>
					</VSCodeDropdown>
				</td>
				<td className="px-4 py-4">
					<SearchableSelect
						value={draft.statusId}
						onValueChange={(value) => onDraftChange((prev) => ({ ...prev, statusId: value }))}
						options={statusOptions}
						placeholder="Select status"
						searchPlaceholder="Search statuses"
						emptyMessage="No statuses found"
						onCreateOption={onCreateStatus}
						createOptionLabel={(value) => `Create status "${value}"`}
						triggerClassName="h-8 min-w-[168px] rounded-lg border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_86%,transparent)] px-3 text-[12px] font-medium text-[var(--vscode-foreground)] shadow-[0_10px_24px_rgba(0,0,0,0.24)] transition-[border-color,box-shadow] hover:border-[color-mix(in_srgb,var(--vscode-foreground)_26%,transparent)] focus-visible:outline-none data-[state=open]:border-[color-mix(in_srgb,var(--vscode-foreground)_34%,transparent)]"
						density="compact"
						inputClassName="mr-3 text-[12px]"
					/>
				</td>
				<td className="px-4 py-4">
					<SearchableSelect
						value={draft.ownerEmployeeId}
						onValueChange={(value) => onDraftChange((prev) => ({ ...prev, ownerEmployeeId: value }))}
						options={employeeOptions}
						placeholder="Choose assignee"
						searchPlaceholder="Search teammates"
						emptyMessage="No teammates found"
						triggerClassName="h-8 min-w-[168px] rounded-lg border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_86%,transparent)] px-3 text-[12px] font-medium text-[var(--vscode-foreground)] shadow-[0_10px_24px_rgba(0,0,0,0.24)] transition-[border-color,box-shadow] hover:border-[color-mix(in_srgb,var(--vscode-foreground)_26%,transparent)] focus-visible:outline-none data-[state=open]:border-[color-mix(in_srgb,var(--vscode-foreground)_34%,transparent)]"
						density="compact"
						inputClassName="mr-3 text-[12px]"
					/>
				</td>
				<td className="px-4 py-4">
					<input
						type="date"
						className="w-full rounded-lg border border-[color-mix(in_srgb,var(--vscode-foreground)_14%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_86%,transparent)] px-3 py-2 text-sm text-[var(--vscode-foreground)] shadow-[0_8px_22px_rgba(0,0,0,0.24)] focus:border-[color-mix(in_srgb,var(--vscode-foreground)_26%,transparent)] focus:outline-none"
						value={formatDueDateInput(draft.dueAt)}
						onChange={(event) => onDraftChange((prev) => ({ ...prev, dueAt: event.target.value }))}
					/>
				</td>
				<td className="px-4 py-4">
					<VSCodeTextArea
						value={draft.description}
						onInput={(event: any) =>
							onDraftChange((prev) => ({ ...prev, description: event.target.value }))
						}
						rows={2}
						placeholder="Description"
						className="w-full rounded-xl border border-[color-mix(in_srgb,var(--vscode-foreground)_14%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_86%,transparent)] px-3 py-2 text-[13px] leading-snug shadow-[0_10px_24px_rgba(0,0,0,0.24)]"
					/>
				</td>
				<td className="px-4 py-4">
					<div className="flex items-center justify-end gap-2 rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_14%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_86%,transparent)] px-3 py-1 shadow-[0_10px_28px_rgba(0,0,0,0.26)]">
						<VSCodeButton appearance="secondary" onClick={onCancel} className="h-8 rounded-full text-[11px] font-semibold uppercase tracking-[0.18em]">
							Cancel
						</VSCodeButton>
						<VSCodeButton appearance="primary" onClick={onCreate} className="h-8 rounded-full text-[11px] font-semibold uppercase tracking-[0.18em]">
							Create
						</VSCodeButton>
					</div>
				</td>
			</tr>
			{createError && (
				<tr>
					<td colSpan={9} className="px-6 pb-4 text-[12px] text-[var(--vscode-errorForeground)]">
						{createError}
					</td>
				</tr>
			)}
		</>
	)
}

export default ActionWorkspaceView
