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

type ActionViewMode = "table" | "board" | "timeline" | "calendar"

type ActionPropertyType = "text" | "number" | "boolean" | "date" | "select" | "multi_select"

interface ActionPropertyColumn {
	id: string
	key: string
	label: string
	type: ActionPropertyType
	options: string[]
	isVisible: boolean
}

const ACTION_VIEW_OPTIONS: { id: ActionViewMode; label: string; icon: string; description: string }[] = [
	{ id: "table", label: "Table", icon: "table", description: "Grid view with inline editing" },
	{ id: "board", label: "Board", icon: "layout", description: "Status-based swimlanes" },
	{ id: "timeline", label: "Timeline", icon: "timeline", description: "Chronological schedule" },
	{ id: "calendar", label: "Calendar", icon: "calendar", description: "Monthly planning" },
]

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

const detectPropertyType = (value: unknown): ActionPropertyType => {
	if (Array.isArray(value)) {
		return "multi_select"
	}
	if (typeof value === "boolean") {
		return "boolean"
	}
	if (typeof value === "number") {
		return "number"
	}
	if (typeof value === "string") {
		const trimmed = value.trim()
		if (!trimmed) {
			return "text"
		}
		const numeric = Number(trimmed)
		if (!Number.isNaN(numeric) && trimmed === `${numeric}`) {
			return "number"
		}
		if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
			return "date"
		}
		return trimmed.length <= 40 ? "select" : "text"
	}
	return "text"
}

const chipPalette = [
	"var(--vscode-charts-blue)",
	"var(--vscode-charts-orange)",
	"var(--vscode-charts-red)",
	"var(--vscode-charts-purple)",
	"var(--vscode-charts-green)",
	"var(--vscode-charts-yellow)",
]

const getChipColor = (key: string) => {
	if (!key) return chipPalette[0]
	let hash = 0
	for (let index = 0; index < key.length; index += 1) {
		hash = (hash * 31 + key.charCodeAt(index)) % 997
	}
	return chipPalette[hash % chipPalette.length]
}

const humanizeKey = (key: string) =>
	key
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\b\w/g, (char) => char.toUpperCase())

const startOfDay = (date: Date) => {
	const next = new Date(date)
	next.setHours(0, 0, 0, 0)
	return next
}

const startOfWeek = (date: Date) => {
	const next = startOfDay(date)
	const day = next.getDay()
	const diff = (day + 6) % 7
	next.setDate(next.getDate() - diff)
	return next
}

const addDays = (date: Date, days: number) => {
	const next = new Date(date)
	next.setDate(next.getDate() + days)
	return next
}

const formatDateLabel = (date: Date) => date.toLocaleDateString(undefined, { month: "short", day: "numeric" })

const addMonths = (date: Date, months: number) => {
	const next = new Date(date)
	next.setMonth(next.getMonth() + months)
	return next
}

const normalizePropertyKey = (input: string) =>
	input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")

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
	const [activeActionView, setActiveActionView] = useState<ActionViewMode>("table")
	const [propertyColumns, setPropertyColumns] = useState<ActionPropertyColumn[]>([])
	const [showPropertyManager, setShowPropertyManager] = useState(false)
	const [collapsedActionIds, setCollapsedActionIds] = useState<Set<string>>(() => new Set())
	const [actionSearch, setActionSearch] = useState("")
	const [calendarReferenceDate, setCalendarReferenceDate] = useState(() => new Date())
	const [timelineSpan, setTimelineSpan] = useState<"week" | "month">("month")

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

	const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees])

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

	const companyRelations = activeCompany?.actionRelations ?? []

	const { parentByChildId, childrenByParentId } = useMemo(() => {
		const parentByChild = new Map<string, string>()
		const childrenByParent = new Map<string, string[]>()
		for (const relation of companyRelations) {
			if (relation.type !== "parentOf") continue
			parentByChild.set(relation.targetActionItemId, relation.sourceActionItemId)
			if (!childrenByParent.has(relation.sourceActionItemId)) {
				childrenByParent.set(relation.sourceActionItemId, [])
			}
			childrenByParent.get(relation.sourceActionItemId)!.push(relation.targetActionItemId)
		}
		return { parentByChildId: parentByChild, childrenByParentId: childrenByParent }
	}, [companyRelations])

	const hierarchicalActionItems = useMemo(() => {
		const orderIndex = new Map<string, number>(orderedActionItems.map((item, index) => [item.id, index]))
		const childrenByParent = new Map<string, WorkplaceActionItem[]>()
		for (const [parentId, childIds] of childrenByParentId.entries()) {
			const sortedChildren = [...childIds]
			sortedChildren.sort((a, b) => (orderIndex.get(a) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b) ?? Number.MAX_SAFE_INTEGER))
			childrenByParent.set(
				parentId,
				sortedChildren
					.map((childId) => actionItemsById.get(childId))
					.filter((item): item is WorkplaceActionItem => Boolean(item)),
			)
		}
		const results: { item: WorkplaceActionItem; depth: number }[] = []
		const visited = new Set<string>()
		const visit = (item: WorkplaceActionItem, depth: number) => {
			if (visited.has(item.id)) return
			visited.add(item.id)
			results.push({ item, depth })
			const children = childrenByParent.get(item.id)
			if (!children) return
			for (const child of children) {
				visit(child, depth + 1)
			}
		}
		for (const item of orderedActionItems) {
			const parentId = parentByChildId.get(item.id)
			const parentExists = parentId && actionItemsById.has(parentId)
			if (!parentExists) {
				visit(item, 0)
			}
		}
		for (const item of orderedActionItems) {
			if (!visited.has(item.id)) {
				const depth = parentByChildId.has(item.id) ? 1 : 0
				visit(item, depth)
			}
		}
		return results
	}, [orderedActionItems, childrenByParentId, parentByChildId, actionItemsById])

	const discoveredPropertyColumns = useMemo(() => {
		const descriptors = new Map<
			string,
			{
				type: ActionPropertyType
				options: Set<string>
			}
		>()
		for (const item of orderedActionItems) {
			const properties = item.customProperties
			if (!properties) continue
			for (const [key, rawValue] of Object.entries(properties)) {
				if (!descriptors.has(key)) {
					descriptors.set(key, { type: detectPropertyType(rawValue), options: new Set<string>() })
				}
				const descriptor = descriptors.get(key)!
				const detected = detectPropertyType(rawValue)
				if (descriptor.type === "text" && detected !== "text") {
					descriptor.type = detected
				} else if (descriptor.type !== detected && detected !== "text") {
					descriptor.type = "text"
				}
				if (Array.isArray(rawValue)) {
					for (const option of rawValue) {
						if (typeof option === "string") {
							descriptor.options.add(option)
						}
					}
				} else if (typeof rawValue === "string") {
					descriptor.options.add(rawValue)
				}
			}
		}
		return Array.from(descriptors.entries()).map<ActionPropertyColumn>(([key, descriptor]) => ({
			id: `custom:${key}`,
			key,
			label: humanizeKey(key) || key,
			type: descriptor.type,
			options: Array.from(descriptor.options),
			isVisible: true,
		}))
	}, [orderedActionItems])

	useEffect(() => {
		setPropertyColumns((prev) => {
			if (discoveredPropertyColumns.length === 0 && prev.length === 0) {
				return prev
			}
			const next = prev.map((column) => ({ ...column, options: [...column.options] }))
			const byKey = new Map(next.map((column) => [column.key, column]))
			let mutated = false
			for (const column of discoveredPropertyColumns) {
				const existing = byKey.get(column.key)
				if (!existing) {
					next.push({ ...column })
					byKey.set(column.key, column)
					mutated = true
					continue
				}
				const updatedOptions = Array.from(new Set([...existing.options, ...column.options]))
				const desiredType = existing.type === "text" && column.type !== "text" ? column.type : existing.type
				if (updatedOptions.length !== existing.options.length || desiredType !== existing.type) {
					const index = next.findIndex((candidate) => candidate.key === column.key)
					if (index >= 0) {
						next[index] = { ...existing, type: desiredType, options: updatedOptions }
						mutated = true
					}
				}
			}
			return mutated ? next : prev
		})
	}, [discoveredPropertyColumns])

	const visiblePropertyColumns = useMemo(
		() => propertyColumns.filter((column) => column.isVisible),
		[propertyColumns],
	)

	const propertyColumnByKey = useMemo(
		() => new Map(propertyColumns.map((column) => [column.key, column])),
		[propertyColumns],
	)

	const visibleActionItems = useMemo(() => {
		let scoped = orderedActionItems
		if (employeeFilter === "unassigned") {
			scoped = scoped.filter((item) => !item.ownerEmployeeId)
		} else if (employeeFilter !== "all") {
			scoped = scoped.filter((item) => item.ownerEmployeeId === employeeFilter)
		}
		const query = actionSearch.trim().toLowerCase()
		if (!query) {
			return scoped
		}
		return scoped.filter((item) => {
			const ownerName = item.ownerEmployeeId ? employeeById.get(item.ownerEmployeeId)?.name ?? "" : "Unassigned"
			const haystack = [item.title, item.description ?? "", ownerName, item.kind, item.dueAt ?? ""]
			if (item.customProperties) {
				haystack.push(...Object.values(item.customProperties).map((value) => (Array.isArray(value) ? value.join(" ") : String(value))))
			}
			return haystack.some((value) => value && value.toString().toLowerCase().includes(query))
		})
	}, [orderedActionItems, employeeFilter, actionSearch, employeeById])

	const visibleActionIdSet = useMemo(() => new Set(visibleActionItems.map((item) => item.id)), [visibleActionItems])

	const contextualVisibleActionIds = useMemo(() => {
		const ids = new Set<string>()
		const toVisit = [...visibleActionIdSet]
		while (toVisit.length > 0) {
			const current = toVisit.pop()
			if (!current || ids.has(current)) continue
			ids.add(current)
			const parentId = parentByChildId.get(current)
			if (parentId && !ids.has(parentId)) {
				toVisit.push(parentId)
			}
		}
		if (visibleActionIdSet.size === 0 && orderedActionItems.length === 0) {
			return ids
		}
		if (visibleActionIdSet.size === 0) {
			// fall back to show at least roots when filters empty result
			for (const { item, depth } of hierarchicalActionItems) {
				if (depth === 0) {
					ids.add(item.id)
				}
			}
		}
		return ids
	}, [visibleActionIdSet, parentByChildId, hierarchicalActionItems, orderedActionItems])

	const tableRows = useMemo(
		() => hierarchicalActionItems.filter(({ item }) => contextualVisibleActionIds.has(item.id)),
		[hierarchicalActionItems, contextualVisibleActionIds],
	)

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
			if (!activeCompanyId) {
				return
			}
			setActiveEmployee(activeCompanyId, employeeId)
			vscode.postMessage({ type: "action", action: "switchTab", tab: "workforce" })
			window.postMessage({ type: "action", action: "switchTab", tab: "workforce" }, "*")
		},
		[activeCompanyId, setActiveEmployee],
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

	const toggleCollapse = useCallback((actionId: string) => {
		setCollapsedActionIds((prev) => {
			const next = new Set(prev)
			if (next.has(actionId)) {
				next.delete(actionId)
			} else {
				next.add(actionId)
			}
			return next
		})
	}, [])

	const handleAddPropertyOption = useCallback((key: string, option: string) => {
		const trimmed = option.trim()
		if (!trimmed) return
		setPropertyColumns((prev) => {
			let mutated = false
			const next = prev.map((column) => {
				if (column.key !== key) return column
				if (column.options.includes(trimmed)) return column
				mutated = true
				return { ...column, options: [...column.options, trimmed] }
			})
			return mutated ? next : prev
		})
	}, [])

	const handleUpdatePropertyColumn = useCallback(
		(key: string, updates: Partial<Omit<ActionPropertyColumn, "key" | "id">>) => {
			setPropertyColumns((prev) =>
				prev.map((column) => (column.key === key ? { ...column, ...updates } : column)),
			)
		},
		[],
	)

	const handleRemovePropertyColumn = useCallback((key: string) => {
		setPropertyColumns((prev) => prev.filter((column) => column.key !== key))
	}, [])

	const handleReorderPropertyColumns = useCallback((sourceIndex: number, targetIndex: number) => {
		setPropertyColumns((prev) => {
			if (sourceIndex === targetIndex) return prev
			const next = [...prev]
			const [moved] = next.splice(sourceIndex, 1)
			next.splice(targetIndex, 0, moved)
			return next
		})
	}, [])

	const handleCreatePropertyColumn = useCallback(
		(column: Omit<ActionPropertyColumn, "id">) => {
			setPropertyColumns((prev) => {
				if (prev.some((existing) => existing.key === column.key)) {
					return prev
				}
				return [...prev, { ...column, id: `custom:${column.key}` }]
			})
		},
		[],
	)

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
						const assignmentStatusName = assignment ? statusById.get(assignment.statusId)?.name : undefined
						const assignmentTime = assignment?.lastStartedAt ?? assignment?.updatedAt ?? assignment?.createdAt
						const lastInteractionLabel = assignmentTime
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
						const activitySnippet = createMessageSnippet(assignment?.description)
						const activityPrimaryLabel = assignment
							? `Working on “${assignment.title}”`
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
												className={cn(
													"group inline-flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px] font-semibold transition-[transform,box-shadow,border-color]",
													"border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] text-[var(--vscode-foreground)] shadow-[0_8px_20px_rgba(0,0,0,0.24)] hover:-translate-y-[1px] hover:border-[color-mix(in_srgb,var(--vscode-foreground)_22%,transparent)] hover:shadow-[0_14px_32px_rgba(0,0,0,0.28)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--vscode-focusBorder)]",
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
					<div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center text-sm text-[var(--vscode-descriptionForeground)]">
						<p className="m-0 max-w-md">
							Create a company first to start organizing action items. Head to the Workforce Hub and add your first team.
						</p>
					</div>
				) : (
					<>
						<div className="flex flex-1 flex-col overflow-hidden bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)]">
							<div className="flex flex-1 flex-col gap-6 overflow-hidden px-8 py-6">
								<section className="flex flex-1 flex-col overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_68%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_99%,transparent)] shadow-[0_18px_44px_rgba(0,0,0,0.32)]">
									<div className="border-b border-[color-mix(in_srgb,var(--vscode-panel-border)_72%,transparent)] px-8 py-6">
										<div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
											<div className="min-w-[260px] flex-1">
												<span className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_14%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_88%,transparent)]">
													<span className="codicon codicon-rocket" aria-hidden="true" />
													Action Command Center
												</span>
												<h2 className="mt-3 text-2xl font-semibold text-[var(--vscode-foreground)]">Action Items</h2>
												<p className="mt-2 max-w-lg text-sm text-[var(--vscode-descriptionForeground)]">
													Coordinate work across goals, projects, and tasks. Switch views to fit the way your team plans handoffs.
												</p>
												<div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
													{summaryTiles.map((tile, index) => (
														<div
															key={tile.label}
															className="group flex flex-col gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)] px-4 py-4 shadow-[0_10px_26px_rgba(0,0,0,0.22)] transition-[transform,box-shadow,border-color] hover:-translate-y-[2px] hover:border-[color-mix(in_srgb,var(--vscode-foreground)_22%,transparent)] hover:shadow-[0_18px_44px_rgba(0,0,0,0.28)]">
															<div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_86%,transparent)]">
																<span>{tile.label}</span>
																<span className={cn("codicon", index % 4 === 0 ? "codicon-target" : index % 4 === 1 ? "codicon-organization" : index % 4 === 2 ? "codicon-calendar" : "codicon-dashboard", "text-[color-mix(in_srgb,var(--vscode-foreground)_80%,transparent)]") } aria-hidden="true" />
															</div>
															<span className="text-2xl font-semibold tracking-tight text-[var(--vscode-foreground)]">{tile.value}</span>
															<p className="m-0 text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_88%,transparent)]">{tile.helper}</p>
														</div>
													))}
												</div>
											</div>
											<div className="w-full max-w-sm flex flex-col gap-4">
												<div className="rounded-2xl border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] px-5 py-5 shadow-[0_14px_32px_rgba(0,0,0,0.24)]">
													<p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
														Workspace Shortcuts
													</p>
													<div className="mt-3 flex flex-col gap-2">
														<VSCodeButton
															appearance={showCreateForm ? "secondary" : "primary"}
															onClick={() => setShowCreateForm((prev) => !prev)}
															className="h-9 rounded-full text-[11px] font-semibold uppercase tracking-[0.2em]">
															{showCreateForm ? "Cancel new action" : "New action item"}
														</VSCodeButton>
														<VSCodeButton
															appearance="secondary"
															onClick={() => setShowPropertyManager(true)}
															className="h-9 rounded-full text-[11px] font-semibold uppercase tracking-[0.2em]">
															Manage columns
														</VSCodeButton>
													</div>
													<p className="mt-3 text-[11px] leading-relaxed text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_85%,transparent)]">
														Tailor the table to your operating model. Add property columns, rename fields, or hide data you do not need.
													</p>
												</div>
												<div className="rounded-2xl border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] px-5 py-5 shadow-[0_14px_32px_rgba(0,0,0,0.24)]">
													<p className="text-sm font-semibold text-[var(--vscode-foreground)]">Live readiness</p>
													<p className="mt-1 text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_88%,transparent)]">
														{primaryStartLabel} • {visibleActionItems.length} visible, {selectedCount} selected
													</p>
												</div>
											</div>
										</div>
									</div>
									<div className="flex flex-1 flex-col gap-5 overflow-hidden px-8 py-6">
										<div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
											<div className="flex flex-wrap items-center gap-3">
												<SearchableSelect
													value={employeeFilter}
													onValueChange={handleEmployeeFilterChange}
													options={employeeFilterOptions}
													placeholder="Filter by teammate"
													searchPlaceholder="Search teammates"
													emptyMessage="No teammates found"
													className="w-full min-w-[220px] sm:w-64"
													triggerClassName="h-9 rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_86%,transparent)] px-3 text-[12px] font-medium text-[var(--vscode-foreground)] shadow-[0_10px_26px_rgba(0,0,0,0.24)] transition-[border-color,box-shadow] hover:border-[color-mix(in_srgb,var(--vscode-foreground)_22%,transparent)] focus-visible:outline-none data-[state=open]:border-[color-mix(in_srgb,var(--vscode-foreground)_32%,transparent)]"
													density="compact"
													inputClassName="mr-3 text-[12px]"
													contentClassName="rounded-xl border border-[color-mix(in_srgb,var(--vscode-foreground)_14%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)] shadow-[0_22px_44px_rgba(0,0,0,0.32)]"
												/>
												<VSCodeTextField
													value={actionSearch}
													onInput={(event: any) => setActionSearch(event.target.value as string)}
													placeholder="Search titles, people, or tags"
													className="min-w-[200px] flex-1 rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] px-4 text-[12px] text-[var(--vscode-foreground)] shadow-[0_10px_24px_rgba(0,0,0,0.22)]"
												/>
												{selectionSummary ? (
													<span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_16%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-selectionBackground)_30%,transparent)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--vscode-foreground)]">
														{selectionSummary}
													</span>
												) : null}
											</div>
											<div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_86%,transparent)]">
												<span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] px-3 py-1">
													<span className="codicon codicon-gripper" aria-hidden="true" />
													Drag rows to reorder
												</span>
												<span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] px-3 py-1">
													<span className="codicon codicon-symbol-number" aria-hidden="true" />
													{tableRows.length} showing
												</span>
											</div>
										</div>
										<div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
											<div className="flex flex-wrap items-center gap-2">
												{ACTION_VIEW_OPTIONS.map((option) => (
													<button
														type="button"
														key={option.id}
														onClick={() => setActiveActionView(option.id)}
														className={cn(
															"inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[12px] font-medium transition-[background-color,border-color,box-shadow]",
															activeActionView === option.id
																? "border-[color-mix(in_srgb,var(--vscode-focusBorder)_60%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-selectionBackground)_36%,transparent)] text-[var(--vscode-foreground)] shadow-[0_10px_26px_rgba(0,0,0,0.24)]"
																: "border-[color-mix(in_srgb,var(--vscode-foreground)_14%,transparent)] bg-transparent text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_86%,transparent)] hover:border-[color-mix(in_srgb,var(--vscode-foreground)_24%,transparent)]",
														)}
														title={option.description}
														aria-pressed={activeActionView === option.id}>
															<span className={cn("codicon", `codicon-${option.icon}`)} aria-hidden="true" />
															{option.label}
														</button>
													))}
											</div>
											<div className="flex flex-wrap items-center gap-2">
												<VSCodeButton
													appearance="secondary"
													disabled={primaryStartDisabled}
													onClick={handlePrimaryStart}
													className="h-9 rounded-full px-5 text-[11px] font-semibold uppercase tracking-[0.2em]">
													{primaryStartLabel}
												</VSCodeButton>
												<VSCodeButton
													appearance={hasSelection ? "primary" : "secondary"}
													disabled={startSelectedDisabled}
													onClick={handleStartSelected}
													className="h-9 rounded-full px-5 text-[11px] font-semibold uppercase tracking-[0.2em]">
													{startSelectedLabel}
												</VSCodeButton>
												{shouldShowClearSelection ? (
													<VSCodeButton
														appearance="secondary"
														disabled={isStarting}
														onClick={clearSelection}
														className="h-9 rounded-full px-4 text-[11px] font-semibold uppercase tracking-[0.2em]">
														Clear selection
													</VSCodeButton>
												) : null}
											</div>
										</div>
										<div className="flex flex-1 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--vscode-foreground)_10%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_93%,transparent)] shadow-[0_18px_42px_rgba(0,0,0,0.28)]">
											{activeActionView === "table" ? (
												<ActionWorkspaceTableView
													rows={tableRows}
													visibleSet={visibleActionIdSet}
													parentByChildId={parentByChildId}
													childrenByParentId={childrenByParentId}
													actionItemsById={actionItemsById}
													collapsedActionIds={collapsedActionIds}
													onToggleCollapse={toggleCollapse}
													selectedActionIds={selectedActionIds}
													onToggleSelect={toggleSelectAction}
													onToggleSelectAll={toggleSelectAllVisible}
													allVisibleSelected={allVisibleSelected}
													visibleCount={visibleActionItems.length}
													isSelectionDisabled={isStarting}
													isStarting={isStarting}
													statusOptions={statusOptions}
													employeeOptions={employeeOptions}
													statusById={statusById}
													employees={employees}
													employeeById={employeeById}
													onUpdate={handleUpdateAction}
													onDelete={handleDeleteAction}
													onCreateStatus={handleCreateStatus}
													onStart={handleStartSingle}
													onOpenChat={openChatForAction}
													dragState={{
														draggingId,
														dragOverId,
														onDragStart: handleDragStart,
														onDragOver: handleDragOver,
														onDrop: handleDrop,
														onDropToEnd: handleDropToEnd,
														onDragEnd: handleDragEnd,
													}}
													showCreateForm={showCreateForm}
													onCancelCreate={() => setShowCreateForm(false)}
													onCreateAction={handleCreateActionItem}
													createDraft={newActionDraft}
													onDraftChange={setNewActionDraft}
													createError={createError}
													visiblePropertyColumns={visiblePropertyColumns}
													onAddPropertyOption={handleAddPropertyOption}
												/>
											) : null}
											{activeActionView === "board" ? (
												<ActionWorkspaceBoardView
													actionItems={visibleActionItems}
													actionItemsById={actionItemsById}
													childrenByParentId={childrenByParentId}
													statusById={statusById}
													statuses={sortedStatuses}
													employeeById={employeeById}
													selectedActionIds={selectedActionIds}
													onToggleSelect={toggleSelectAction}
													onStart={handleStartSingle}
													onOpenChat={openChatForAction}
													isStarting={isStarting}
												/>
											) : null}
											{activeActionView === "timeline" ? (
												<ActionWorkspaceTimelineView
													actionItems={visibleActionItems}
													employeeById={employeeById}
													statusById={statusById}
													timelineSpan={timelineSpan}
													onTimelineSpanChange={setTimelineSpan}
													onStart={handleStartSingle}
													onOpenChat={openChatForAction}
													selectedActionIds={selectedActionIds}
													onToggleSelect={toggleSelectAction}
													isStarting={isStarting}
												/>
											) : null}
											{activeActionView === "calendar" ? (
												<ActionWorkspaceCalendarView
													actionItems={visibleActionItems}
													employeeById={employeeById}
													statusById={statusById}
													referenceDate={calendarReferenceDate}
													onReferenceDateChange={setCalendarReferenceDate}
													onStart={handleStartSingle}
													onOpenChat={openChatForAction}
													selectedActionIds={selectedActionIds}
													onToggleSelect={toggleSelectAction}
													isStarting={isStarting}
												/>
											) : null}
										</div>
									</div>
								</section>
							</div>
						</div>
						{showPropertyManager ? (
							<ActionPropertyManager
								columns={propertyColumns}
								onClose={() => setShowPropertyManager(false)}
								onUpdate={handleUpdatePropertyColumn}
								onRemove={handleRemovePropertyColumn}
								onReorder={handleReorderPropertyColumns}
								onCreate={handleCreatePropertyColumn}
								onAddOption={handleAddPropertyOption}
							/>
						) : null}
					</>
				)
			) : null}
		</div>
	)
}

interface ActionWorkspaceTableViewProps {
	rows: { item: WorkplaceActionItem; depth: number }[]
	visibleSet: Set<string>
	parentByChildId: Map<string, string>
	childrenByParentId: Map<string, string[]>
	actionItemsById: Map<string, WorkplaceActionItem>
	collapsedActionIds: Set<string>
	onToggleCollapse: (id: string) => void
	selectedActionIds: Set<string>
	onToggleSelect: (id: string) => void
	onToggleSelectAll: () => void
	allVisibleSelected: boolean
	visibleCount: number
	isSelectionDisabled: boolean
	isStarting: boolean
	statusOptions: SearchableSelectOption[]
	employeeOptions: SearchableSelectOption[]
	statusById: Map<string, WorkplaceActionStatus>
	employees: WorkplaceEmployee[]
	employeeById: Map<string, WorkplaceEmployee>
	onUpdate: (actionItem: WorkplaceActionItem) => void
	onDelete: (actionId: string) => void
	onCreateStatus: (name: string) => void
	onStart: (action: WorkplaceActionItem) => void
	onOpenChat: (action: WorkplaceActionItem) => void
	dragState: {
		draggingId: string | null
		dragOverId: string | null
		onDragStart: (event: DragEvent<HTMLTableRowElement>, id: string) => void
		onDragOver: (event: DragEvent<HTMLTableRowElement>, id: string) => void
		onDrop: (event: DragEvent<HTMLTableRowElement>, id: string) => void
		onDropToEnd: (event: DragEvent<HTMLTableSectionElement>) => void
		onDragEnd: () => void
	}
	showCreateForm: boolean
	onCancelCreate: () => void
	onCreateAction: () => void
	createDraft: ActionItemDraft
	onDraftChange: Dispatch<SetStateAction<ActionItemDraft>>
	createError?: string
	visiblePropertyColumns: ActionPropertyColumn[]
	onAddPropertyOption: (key: string, option: string) => void
}

const ActionWorkspaceTableView = ({
	rows,
	visibleSet,
	parentByChildId,
	childrenByParentId,
	actionItemsById,
	collapsedActionIds,
	onToggleCollapse,
	selectedActionIds,
	onToggleSelect,
	onToggleSelectAll,
	allVisibleSelected,
	visibleCount,
	isSelectionDisabled,
	isStarting,
	statusOptions,
	employeeOptions,
	statusById,
	employees,
	employeeById,
	onUpdate,
	onDelete,
	onCreateStatus,
	onStart,
	onOpenChat,
	dragState,
	showCreateForm,
	onCancelCreate,
	onCreateAction,
	createDraft,
	onDraftChange,
	createError,
	visiblePropertyColumns,
	onAddPropertyOption,
}: ActionWorkspaceTableViewProps) => {
	const isAncestorCollapsed = useCallback(
		(id: string) => {
			let parentId = parentByChildId.get(id)
			while (parentId) {
				if (collapsedActionIds.has(parentId)) {
					return true
				}
				parentId = parentByChildId.get(parentId)
			}
			return false
		},
		[parentByChildId, collapsedActionIds],
	)

	const displayRows = useMemo(
		() => rows.filter(({ item }) => !isAncestorCollapsed(item.id)),
		[rows, isAncestorCollapsed],
	)

	return (
		<div className="flex-1 overflow-hidden">
			<div className="h-full overflow-auto">
				<table className="min-w-full table-fixed border-collapse text-sm">
					<thead className="sticky top-0 z-10 border-b border-[color-mix(in_srgb,var(--vscode-panel-border)_70%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)]/95 backdrop-blur">
						<tr className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_86%,transparent)]">
							<th className="w-12 px-4 py-3 text-left">
								<input
									type="checkbox"
									className="h-4 w-4 cursor-pointer"
									checked={allVisibleSelected && visibleCount > 0}
									disabled={visibleCount === 0 || isSelectionDisabled}
									onChange={onToggleSelectAll}
									aria-label="Select all visible action items"
								/>
							</th>
							<th className="w-14 px-4 py-3 text-left">Order</th>
							<th className="min-w-[220px] px-4 py-3 text-left">Action</th>
							<th className="w-32 px-4 py-3 text-left">Type</th>
							<th className="w-40 px-4 py-3 text-left">Status</th>
							<th className="w-44 px-4 py-3 text-left">Assignee</th>
							<th className="w-32 px-4 py-3 text-left">Due</th>
							{visiblePropertyColumns.map((column) => (
								<th key={column.key} className="w-40 px-4 py-3 text-left">{column.label}</th>
							))}
							<th className="w-40 px-4 py-3 text-left">Activity</th>
							<th className="w-32 px-4 py-3 text-right">Actions</th>
						</tr>
					</thead>
					<tbody
						onDragOver={(event) => {
							if (!dragState.draggingId) return
							event.preventDefault()
						}}
						onDrop={dragState.onDropToEnd}>
						{showCreateForm ? (
							<ActionWorkspaceCreateRow
								draft={createDraft}
								statusOptions={statusOptions}
								employeeOptions={employeeOptions}
								onDraftChange={onDraftChange}
								onCreate={onCreateAction}
								onCancel={onCancelCreate}
								onCreateStatus={onCreateStatus}
								createError={createError}
							/>
						) : null}
						{displayRows.length === 0 && !showCreateForm ? (
							<tr>
								<td
									colSpan={9 + visiblePropertyColumns.length}
									className="px-6 py-12 text-center text-[var(--vscode-descriptionForeground)]">
										No action items match the current filters.
									</td>
							</tr>
						) : null}
						{displayRows.map(({ item, depth }, index) => {
							const childIds = childrenByParentId.get(item.id) ?? []
							const parentId = parentByChildId.get(item.id)
							const parentTitle = parentId ? actionItemsById.get(parentId)?.title ?? "" : ""
							return (
								<ActionWorkspaceRow
									key={item.id}
									index={index + 1}
									action={item}
									depth={depth}
									hasChildren={childIds.length > 0}
									isCollapsed={collapsedActionIds.has(item.id)}
									onToggleCollapse={() => onToggleCollapse(item.id)}
									isVisibleMatch={visibleSet.has(item.id)}
									parentTitle={parentTitle}
									selected={selectedActionIds.has(item.id)}
									onToggleSelect={() => onToggleSelect(item.id)}
									isSelectionDisabled={isSelectionDisabled}
									statusOptions={statusOptions}
									employeeOptions={employeeOptions}
									statusById={statusById}
									employees={employees}
									employeeById={employeeById}
									onUpdate={onUpdate}
									onDelete={onDelete}
									onCreateStatus={onCreateStatus}
									onStart={() => onStart(item)}
									onOpenChat={() => onOpenChat(item)}
									isStarting={isStarting}
									dragState={dragState}
									visiblePropertyColumns={visiblePropertyColumns}
									onAddPropertyOption={onAddPropertyOption}
								/>
							)
						})}
					</tbody>
				</table>
			</div>
		</div>
	)
}

interface ActionWorkspaceRowProps {
	index: number
	action: WorkplaceActionItem
	depth: number
	hasChildren: boolean
	isCollapsed: boolean
	onToggleCollapse: () => void
	isVisibleMatch: boolean
	parentTitle: string
	selected: boolean
	onToggleSelect: () => void
	isSelectionDisabled: boolean
	statusOptions: SearchableSelectOption[]
	employeeOptions: SearchableSelectOption[]
	statusById: Map<string, WorkplaceActionStatus>
	employees: WorkplaceEmployee[]
	employeeById: Map<string, WorkplaceEmployee>
	onUpdate: (actionItem: WorkplaceActionItem) => void
	onDelete: (actionId: string) => void
	onCreateStatus: (name: string) => void
	onStart: () => void
	onOpenChat: () => void
	isStarting: boolean
	dragState: {
		draggingId: string | null
		dragOverId: string | null
		onDragStart: (event: DragEvent<HTMLTableRowElement>, id: string) => void
		onDragOver: (event: DragEvent<HTMLTableRowElement>, id: string) => void
		onDrop: (event: DragEvent<HTMLTableRowElement>, id: string) => void
		onDragEnd: () => void
	}
	visiblePropertyColumns: ActionPropertyColumn[]
	onAddPropertyOption: (key: string, option: string) => void
}

const ActionWorkspaceRow = ({
	index,
	action,
	depth,
	hasChildren,
	isCollapsed,
	onToggleCollapse,
	isVisibleMatch,
	parentTitle,
	selected,
	onToggleSelect,
	isSelectionDisabled,
	statusOptions,
	employeeOptions,
	statusById,
	employees,
	employeeById,
	onUpdate,
	onDelete,
	onCreateStatus,
	onStart,
	onOpenChat,
	isStarting,
	dragState,
	visiblePropertyColumns,
	onAddPropertyOption,
}: ActionWorkspaceRowProps) => {
	const [draft, setDraft] = useState<WorkplaceActionItem>(() => ({
		...action,
		relationIds: [...action.relationIds],
		customProperties: { ...(action.customProperties ?? {}) },
	}))
	const [isDirty, setIsDirty] = useState(false)
	const [showDescription, setShowDescription] = useState(Boolean(action.description && action.description.trim().length > 0))

	useEffect(() => {
		setDraft({ ...action, relationIds: [...action.relationIds], customProperties: { ...(action.customProperties ?? {}) } })
		setIsDirty(false)
		setShowDescription(Boolean(action.description && action.description.trim().length > 0))
	}, [action])

	const setDraftField = <K extends keyof WorkplaceActionItem>(key: K, value: WorkplaceActionItem[K]) => {
		setDraft((prev) => ({ ...prev, [key]: value }))
		setIsDirty(true)
	}

	const setDraftProperty = (key: string, value: string | number | boolean | string[] | undefined) => {
		setDraft((prev) => {
			const nextProperties = { ...(prev.customProperties ?? {}) }
			if (value === undefined || (Array.isArray(value) && value.length === 0)) {
				delete nextProperties[key]
			} else {
				nextProperties[key] = value
			}
			return { ...prev, customProperties: nextProperties }
		})
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

	const owner = draft.ownerEmployeeId ? employeeById.get(draft.ownerEmployeeId) : undefined
	const ownerName = owner?.name ?? "Unassigned"
	const status = statusById.get(draft.statusId)
	const activityLabel = action.lastStartedAt
		? `Last started ${formatRelativeTime(action.lastStartedAt)}`
		: action.startCount && action.startCount > 0
			? `${action.startCount} ${action.startCount === 1 ? "launch" : "launches"}`
			: "Never started"

	return (
		<tr
			draggable
			onDragStart={(event) => dragState.onDragStart(event, action.id)}
			onDragOver={(event) => dragState.onDragOver(event, action.id)}
			onDrop={(event) => dragState.onDrop(event, action.id)}
			onDragEnd={dragState.onDragEnd}
			className={cn(
				"group align-top transition-colors",
				dragState.dragOverId === action.id && "bg-[color-mix(in_srgb,var(--vscode-editor-selectionBackground)_24%,transparent)]",
				dragState.draggingId === action.id && "opacity-70",
				selected && "bg-[color-mix(in_srgb,var(--vscode-editor-selectionBackground)_18%,transparent)]",
				!isVisibleMatch && "opacity-80",
			)}
			style={{ cursor: "grab" }}>
			<td className="px-4 py-4 align-top">
				<input
					type="checkbox"
					className="h-4 w-4 cursor-pointer"
					checked={selected}
					disabled={isSelectionDisabled}
					onChange={onToggleSelect}
					aria-label={`Select ${action.title}`}
				/>
			</td>
			<td className="px-4 py-4 align-top">
				<div className="flex items-center gap-3 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_88%,transparent)]">
					<span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)] text-[11px] font-semibold text-[var(--vscode-foreground)]">
						{index}
					</span>
					<span className="codicon codicon-gripper" aria-hidden="true" />
				</div>
			</td>
			<td className="px-4 py-4 align-top">
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						{hasChildren ? (
							<button
								type="button"
								onClick={onToggleCollapse}
								title={isCollapsed ? "Expand children" : "Collapse children"}
								className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_16%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] text-[color-mix(in_srgb,var(--vscode-foreground)_80%,transparent)]">
									<span className={cn("codicon", isCollapsed ? "codicon-chevron-right" : "codicon-chevron-down") } aria-hidden="true" />
								</button>
							) : (
								<span className="inline-flex h-6 w-6 items-center justify-center" />
							)}
						<VSCodeTextField
							value={draft.title}
							onInput={(event: any) => setDraftField("title", event.target.value as string)}
							placeholder="Action title"
							className="flex-1 text-[13px]"
						/>
					</div>
					{parentTitle ? (
						<p className="m-0 text-[11px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
							Child of “{parentTitle}”
						</p>
					) : null}
					{showDescription ? (
						<VSCodeTextArea
							value={draft.description ?? ""}
							onInput={(event: any) => {
								setDraftField("description", event.target.value as string)
								setShowDescription(true)
							}}
							rows={2}
							placeholder="Add a description"
							className="rounded-xl border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] px-3 py-2 text-[12px]"
						/>
					) : (
						<button
							type="button"
							onClick={() => setShowDescription(true)}
							className="self-start text-[11px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]" title="Add description">
								Add description
							</button>
					)}
				</div>
			</td>
			<td className="px-4 py-4 align-top">
				<VSCodeDropdown
					value={draft.kind}
					onChange={(event: any) => setDraftField("kind", event.target.value as WorkplaceActionItemKind)}
					className="w-full text-[12px]">
					<VSCodeOption value="goal">Goal</VSCodeOption>
					<VSCodeOption value="project">Project</VSCodeOption>
					<VSCodeOption value="task">Task</VSCodeOption>
				</VSCodeDropdown>
			</td>
			<td className="px-4 py-4 align-top">
				<SearchableSelect
					value={draft.statusId}
					onValueChange={(value) => setDraftField("statusId", value)}
					options={statusOptions}
					placeholder="Select status"
					searchPlaceholder="Search statuses"
					emptyMessage="No statuses"
					onCreateOption={onCreateStatus}
					createOptionLabel={(value) => `Create status "${value}"`}
					triggerClassName="h-8 w-full rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] px-3 text-[12px]"
					density="compact"
					inputClassName="mr-3 text-[12px]"
				/>
				{status ? (
					<span
						className="mt-2 inline-flex items-center rounded-full px-3 py-0.5 text-[11px] font-semibold"
						style={{
							backgroundColor: status.color ? `${status.color}22` : `${getChipColor(status.id)}33`,
							color: status.color ?? getChipColor(status.id),
						}}
					>
						{status.name}
					</span>
				) : null}
			</td>
			<td className="px-4 py-4 align-top">
				<SearchableSelect
					value={draft.ownerEmployeeId ?? ""}
					onValueChange={(value) => setDraftField("ownerEmployeeId", value || undefined)}
					options={employeeOptions}
					placeholder="Assign"
					searchPlaceholder="Search teammates"
					emptyMessage="No teammates"
					triggerClassName="h-8 w-full rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] px-3 text-[12px]"
					density="compact"
					inputClassName="mr-3 text-[12px]"
				/>
				<p className="mt-2 flex items-center gap-2 text-[11px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_82%,transparent)]">
					<span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] text-[11px] font-semibold">
						{owner ? owner.name.slice(0, 2).toUpperCase() : "--"}
					</span>
					{ownerName}
				</p>
			</td>
			<td className="px-4 py-4 align-top">
				<input
					type="date"
					className="w-full rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] px-3 py-1.5 text-[12px]"
					value={formatDueDateInput(draft.dueAt)}
					onChange={(event) => setDraftField("dueAt", event.target.value)}
				/>
			</td>
			{visiblePropertyColumns.map((column) => (
				<td key={column.key} className="px-4 py-4 align-top">
					<PropertyCell
						column={column}
						value={draft.customProperties?.[column.key]}
						onChange={(next) => setDraftProperty(column.key, next)}
						onAddOption={onAddPropertyOption}
					/>
				</td>
			))}
			<td className="px-4 py-4 align-top">
				<p className="m-0 text-[11px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_82%,transparent)]">{activityLabel}</p>
				{action.dueAt ? (
					<p className="m-0 text-[10px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
						Due {new Date(action.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
					</p>
				) : null}
			</td>
			<td className="px-4 py-4 align-top">
				<div className="flex items-center justify-end gap-2">
					<VSCodeButton
						appearance="icon"
						onClick={onStart}
						disabled={isStarting}
						title="Start now"
						className="text-[var(--vscode-foreground)]">
						<span className="codicon codicon-play" aria-hidden="true" />
					</VSCodeButton>
					<VSCodeButton
						appearance="icon"
						onClick={onOpenChat}
						title="Open in chat"
						className="text-[var(--vscode-foreground)]">
						<span className="codicon codicon-comment" aria-hidden="true" />
					</VSCodeButton>
					<VSCodeButton
						appearance="icon"
						onClick={handleSave}
						disabled={!isDirty}
						title="Save changes"
						className="text-[var(--vscode-foreground)]">
						<span className="codicon codicon-check" aria-hidden="true" />
					</VSCodeButton>
					<VSCodeButton
						appearance="icon"
						onClick={handleDelete}
						disabled={isStarting}
						title="Delete action"
						className="text-[var(--vscode-errorForeground)]">
						<span className="codicon codicon-trash" aria-hidden="true" />
					</VSCodeButton>
				</div>
			</td>
		</tr>
	)
}

interface PropertyCellProps {
	column: ActionPropertyColumn
	value: string | number | boolean | string[] | undefined
	onChange: (value: string | number | boolean | string[] | undefined) => void
	onAddOption: (key: string, option: string) => void
}

const PropertyCell = ({ column, value, onChange, onAddOption }: PropertyCellProps) => {
	const [chipInputValue, setChipInputValue] = useState("")

	useEffect(() => {
		if (column.type !== "multi_select") {
			setChipInputValue("")
		}
	}, [column.type])

	switch (column.type) {
		case "boolean":
			return (
				<button
					type="button"
					onClick={() => onChange(!(value as boolean))}
					className={cn(
						"inline-flex h-7 w-full items-center justify-center rounded-full border px-3 text-[11px] font-semibold uppercase tracking-[0.18em]",
						value ? "border-[color-mix(in_srgb,var(--vscode-testing-iconPassed)_50%,transparent)] bg-[color-mix(in_srgb,var(--vscode-testing-iconPassed)_22%,transparent)] text-[var(--vscode-testing-iconPassed)]" : "border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_82%,transparent)]",
					)}>
					{value ? "Yes" : "No"}
				</button>
			)
		case "number":
			return (
				<VSCodeTextField
					value={value !== undefined ? String(value) : ""}
					onInput={(event: any) => {
						const next = event.target.value as string
						onChange(next ? Number(next) : undefined)
					}}
					type="number"
					className="w-full rounded-full text-[12px]"
				/>
			)
		case "date":
			return (
				<input
					type="date"
					value={formatDueDateInput(value as string)}
					onChange={(event) => onChange(event.target.value || undefined)}
					className="w-full rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] px-3 py-1.5 text-[12px]"
				/>
			)
		case "select": {
			const current = typeof value === "string" ? value : ""
			const options = column.options.map((option) => ({ label: option, value: option }))
			return (
				<SearchableSelect
					value={current}
					onValueChange={(next) => onChange(next)}
					options={options}
					placeholder="Choose"
					searchPlaceholder="Search options"
					emptyMessage="No options"
					onCreateOption={(option) => {
						onAddOption(column.key, option)
						onChange(option)
					}}
					createOptionLabel={(option) => `Add "${option}"`}
					triggerClassName="h-8 w-full rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] px-3 text-[12px]"
					density="compact"
					inputClassName="mr-3 text-[12px]"
				/>
			)
		}
		case "multi_select": {
			const values = Array.isArray(value) ? value : []
			const availableOptions = column.options.filter((option) => !values.includes(option))
			return (
				<div className="flex flex-col gap-2">
					<div className="flex flex-wrap gap-1">
						{values.map((chip) => (
							<span
								key={chip}
								className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
								style={{
									backgroundColor: `${getChipColor(`${column.key}-${chip}`)}22`,
									color: getChipColor(`${column.key}-${chip}`),
								}}>
								{chip}
								<button
									type="button"
									onClick={() => onChange(values.filter((candidate) => candidate !== chip))}
									title="Remove"
									className="codicon codicon-close text-[10px]" />
							</span>
						))}
						{availableOptions.length === 0 ? null : (
							<SearchableSelect
								key={`${column.key}-picker`}
								value=""
								onValueChange={(next) => {
									if (!next) return
									onChange([...values, next])
								}}
								options={availableOptions.map((option) => ({ label: option, value: option }))}
								placeholder="Add option"
								searchPlaceholder="Search options"
								emptyMessage="No options"
								onCreateOption={(option) => {
									onAddOption(column.key, option)
									onChange([...values, option])
								}}
								createOptionLabel={(option) => `Add "${option}"`}
								triggerClassName="h-7 rounded-full border border-dashed border-[color-mix(in_srgb,var(--vscode-foreground)_20%,transparent)] bg-transparent px-3 text-[11px]"
								density="compact"
								inputClassName="mr-3 text-[11px]"
							/>
						)}
					</div>
				</div>
			)
		}
		default:
			return (
				<VSCodeTextField
					value={value !== undefined ? String(value) : ""}
					onInput={(event: any) => onChange(event.target.value as string)}
					placeholder="Add value"
					className="w-full rounded-full text-[12px]"
				/>
			)
	}
}

interface ActionWorkspaceCreateRowProps {
	draft: ActionItemDraft
	statusOptions: SearchableSelectOption[]
	employeeOptions: SearchableSelectOption[]
	onDraftChange: Dispatch<SetStateAction<ActionItemDraft>>
	onCreate: () => void
	onCancel: () => void
	onCreateStatus: (name: string) => void
	createError?: string
	propertyColumnCount: number
}

const ActionWorkspaceCreateRow = ({
	draft,
	statusOptions,
	employeeOptions,
	onDraftChange,
	onCreate,
	onCancel,
	onCreateStatus,
	createError,
	propertyColumnCount,
}: ActionWorkspaceCreateRowProps) => {
	return (
		<>
			<tr className="align-top bg-[color-mix(in_srgb,var(--vscode-editor-selectionBackground)_18%,transparent)]">
				<td className="px-4 py-4" />
				<td className="px-4 py-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_86%,transparent)]">
					New
				</td>
				<td className="px-4 py-4">
					<VSCodeTextField
						value={draft.title}
						onInput={(event: any) => onDraftChange((prev) => ({ ...prev, title: event.target.value }))}
						placeholder="Action title"
						className="w-full rounded-full text-[12px]"
					/>
				</td>
				<td className="px-4 py-4">
					<VSCodeDropdown
						value={draft.kind}
						onChange={(event: any) => onDraftChange((prev) => ({ ...prev, kind: event.target.value as WorkplaceActionItemKind }))}
						className="w-full text-[12px]">
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
						emptyMessage="No statuses"
						onCreateOption={onCreateStatus}
						createOptionLabel={(value) => `Create status "${value}"`}
						triggerClassName="h-8 w-full rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] px-3 text-[12px]"
						density="compact"
						inputClassName="mr-3 text-[12px]"
					/>
				</td>
				<td className="px-4 py-4">
					<SearchableSelect
						value={draft.ownerEmployeeId}
						onValueChange={(value) => onDraftChange((prev) => ({ ...prev, ownerEmployeeId: value }))}
						options={employeeOptions}
						placeholder="Assign"
						emptyMessage="No teammates"
						searchPlaceholder="Search teammates"
						triggerClassName="h-8 w-full rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] px-3 text-[12px]"
						density="compact"
						inputClassName="mr-3 text-[12px]"
					/>
				</td>
				<td className="px-4 py-4">
					<input
						type="date"
						value={formatDueDateInput(draft.dueAt)}
						onChange={(event) => onDraftChange((prev) => ({ ...prev, dueAt: event.target.value }))}
						className="w-full rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] px-3 py-1.5 text-[12px]"
					/>
				</td>
				<td className="px-4 py-4" colSpan={propertyColumnCount + 2}>
					<VSCodeTextArea
						value={draft.description}
						onInput={(event: any) => onDraftChange((prev) => ({ ...prev, description: event.target.value }))}
						rows={2}
						placeholder="Add a quick description"
						className="w-full rounded-xl border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] px-3 py-2 text-[12px]"
					/>
					<div className="mt-3 flex items-center justify-end gap-2">
						<VSCodeButton appearance="secondary" onClick={onCancel} className="h-8 rounded-full px-4 text-[11px] font-semibold uppercase tracking-[0.2em]">
							Cancel
						</VSCodeButton>
						<VSCodeButton appearance="primary" onClick={onCreate} className="h-8 rounded-full px-5 text-[11px] font-semibold uppercase tracking-[0.2em]">
							Create
						</VSCodeButton>
					</div>
					{createError ? (
						<p className="mt-2 text-[11px] text-[var(--vscode-errorForeground)]">{createError}</p>
					) : null}
				</td>
			</tr>
		</>
	)
}

interface ActionWorkspaceBoardViewProps {
	actionItems: WorkplaceActionItem[]
	actionItemsById: Map<string, WorkplaceActionItem>
	childrenByParentId: Map<string, string[]>
	statusById: Map<string, WorkplaceActionStatus>
	statuses: WorkplaceActionStatus[]
	employeeById: Map<string, WorkplaceEmployee>
	selectedActionIds: Set<string>
	onToggleSelect: (id: string) => void
	onStart: (action: WorkplaceActionItem) => void
	onOpenChat: (action: WorkplaceActionItem) => void
	isStarting: boolean
}

const ActionWorkspaceBoardView = ({
	actionItems,
	actionItemsById,
	childrenByParentId,
	statusById,
	statuses,
	employeeById,
	selectedActionIds,
	onToggleSelect,
	onStart,
	onOpenChat,
	isStarting,
}: ActionWorkspaceBoardViewProps) => {
	const grouped = useMemo(() => {
		const map = new Map<string, WorkplaceActionItem[]>()
		for (const status of statuses) {
			map.set(status.id, [])
		}
		const backlog: WorkplaceActionItem[] = []
		for (const item of actionItems) {
			const bucket = map.get(item.statusId)
			if (bucket) {
				bucket.push(item)
			} else {
				backlog.push(item)
			}
		}
		return { grouped: map, backlog }
	}, [actionItems, statuses])

	return (
		<div className="flex w-full flex-1 gap-4 overflow-x-auto px-4 py-4">
			{statuses.map((status) => {
				const items = grouped.grouped.get(status.id) ?? []
				return (
					<div key={status.id} className="flex min-w-[260px] flex-1 flex-col gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] px-4 py-4 shadow-[0_12px_30px_rgba(0,0,0,0.24)]">
						<div className="flex items-center justify-between">
							<h3 className="m-0 text-sm font-semibold text-[var(--vscode-foreground)]">{status.name}</h3>
							<span className="text-[11px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">{items.length}</span>
						</div>
						<div className="flex flex-col gap-3">
							{items.map((item) => {
								const children = (childrenByParentId.get(item.id) ?? [])
									.map((id) => actionItemsById.get(id))
									.filter((candidate): candidate is WorkplaceActionItem => Boolean(candidate))
								const ownerName = item.ownerEmployeeId ? employeeById.get(item.ownerEmployeeId)?.name ?? "Unassigned" : "Unassigned"
								const isSelected = selectedActionIds.has(item.id)
								return (
									<div
										key={item.id}
										className={cn(
											"flex flex-col gap-2 rounded-2xl border px-4 py-3 shadow-[0_10px_26px_rgba(0,0,0,0.22)]",
											isSelected
												? "border-[color-mix(in_srgb,var(--vscode-editor-selectionBackground)_80%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-selectionBackground)_32%,transparent)]"
												: "border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)]",
										)}>
										<div className="flex items-start gap-2">
											<input
												type="checkbox"
												checked={isSelected}
												onChange={() => onToggleSelect(item.id)}
												title="Select"
												className="mt-1 h-3.5 w-3.5"
											/>
											<div className="flex flex-1 flex-col gap-1">
												<p className="m-0 text-sm font-semibold text-[var(--vscode-foreground)]">{item.title}</p>
												<p className="m-0 text-[11px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">{ownerName}</p>
												{item.description ? (
													<p className="m-0 text-[11px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)]">{item.description}</p>
												) : null}
												{children.length > 0 ? (
													<ul className="m-0 mt-1 list-disc space-y-1 pl-4 text-[11px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
														{children.map((child) => (
															<li key={child.id}>{child.title}</li>
														))}
													</ul>
												) : null}
											</div>
										</div>
										<div className="flex items-center justify-between text-[11px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
											<span>{item.dueAt ? `Due ${formatDateLabel(new Date(item.dueAt))}` : "No due date"}</span>
											<div className="flex items-center gap-1">
												<button type="button" onClick={() => onStart(item)} disabled={isStarting} title="Start" className="codicon codicon-play text-[var(--vscode-foreground)]" />
												<button type="button" onClick={() => onOpenChat(item)} title="Open chat" className="codicon codicon-comment text-[var(--vscode-foreground)]" />
											</div>
										</div>
									</div>
								)
							})}
							{items.length === 0 ? (
								<p className="m-0 text-[11px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_72%,transparent)]">Nothing here yet.</p>
							) : null}
						</div>
					</div>
				)
			})}
			{grouped.backlog.length > 0 ? (
				<div className="min-w-[240px] flex-1 rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--vscode-foreground)_20%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] px-4 py-4 shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
					<h3 className="m-0 text-sm font-semibold text-[var(--vscode-foreground)]">Unmapped</h3>
					<p className="mt-1 text-[11px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
						Items with statuses that are no longer in this board.
					</p>
					<ul className="m-0 mt-2 space-y-1 text-[12px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_82%,transparent)]">
						{grouped.backlog.map((item) => (
							<li key={item.id}>{item.title}</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	)
}

interface ActionWorkspaceTimelineViewProps {
	actionItems: WorkplaceActionItem[]
	employeeById: Map<string, WorkplaceEmployee>
	statusById: Map<string, WorkplaceActionStatus>
	timelineSpan: "week" | "month"
	onTimelineSpanChange: (span: "week" | "month") => void
	onStart: (action: WorkplaceActionItem) => void
	onOpenChat: (action: WorkplaceActionItem) => void
	selectedActionIds: Set<string>
	onToggleSelect: (id: string) => void
	isStarting: boolean
}

const ActionWorkspaceTimelineView = ({
	actionItems,
	employeeById,
	statusById,
	timelineSpan,
	onTimelineSpanChange,
	onStart,
	onOpenChat,
	selectedActionIds,
	onToggleSelect,
	isStarting,
}: ActionWorkspaceTimelineViewProps) => {
	const now = new Date()
	const rangeStart = timelineSpan === "week" ? startOfWeek(now) : new Date(now.getFullYear(), now.getMonth(), 1)
	const rangeEnd = timelineSpan === "week" ? addDays(rangeStart, 6) : new Date(now.getFullYear(), now.getMonth() + 1, 0)

	const { scheduled, unscheduled } = useMemo(() => {
		const scheduledGroups = new Map<string, WorkplaceActionItem[]>()
		const unscheduledItems: WorkplaceActionItem[] = []
		for (const item of actionItems) {
			if (!item.dueAt) {
				unscheduledItems.push(item)
				continue
			}
			const due = new Date(item.dueAt)
			if (Number.isNaN(due.getTime())) {
				unscheduledItems.push(item)
				continue
			}
			if (due < rangeStart || due > rangeEnd) {
				continue
			}
			const key = due.toISOString().slice(0, 10)
			if (!scheduledGroups.has(key)) {
				scheduledGroups.set(key, [])
			}
			scheduledGroups.get(key)!.push(item)
		}
		return { scheduled: scheduledGroups, unscheduled: unscheduledItems }
	}, [actionItems, rangeStart, rangeEnd])

	const orderedKeys = Array.from(scheduled.keys()).sort()

	return (
		<div className="flex h-full w-full flex-col gap-4 overflow-auto px-4 py-4">
			<div className="flex items-center gap-2">
				<button
					type="button"
					className={cn(
						"inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
						timelineSpan === "week"
							? "border-[color-mix(in_srgb,var(--vscode-focusBorder)_60%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-selectionBackground)_32%,transparent)]"
							: "border-[color-mix(in_srgb,var(--vscode-foreground)_14%,transparent)]"
					)}
					onClick={() => onTimelineSpanChange("week")}
					title="Show current week">
					This week
				</button>
				<button
					type="button"
					className={cn(
						"inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
						timelineSpan === "month"
							? "border-[color-mix(in_srgb,var(--vscode-focusBorder)_60%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-selectionBackground)_32%,transparent)]"
							: "border-[color-mix(in_srgb,var(--vscode-foreground)_14%,transparent)]"
					)}
					onClick={() => onTimelineSpanChange("month")}
					title="Show current month">
					This month
				</button>
			</div>
			<div className="relative flex flex-1 flex-col gap-6">
				<div className="absolute left-3 top-0 bottom-0 w-px bg-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)]" aria-hidden="true" />
				{orderedKeys.length === 0 ? (
					<p className="ml-8 text-[12px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
						No scheduled work for this range. Add due dates to populate the timeline.
					</p>
				) : (
					orderedKeys.map((key) => {
						const date = new Date(key)
						const items = scheduled.get(key) ?? []
						return (
							<div key={key} className="ml-8 flex flex-col gap-3">
								<div className="flex items-center gap-3">
									<span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_16%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] text-[10px] font-semibold text-[var(--vscode-foreground)]">
										{date.getDate()}
									</span>
									<h4 className="m-0 text-sm font-semibold text-[var(--vscode-foreground)]">{formatDateLabel(date)}</h4>
								</div>
								<div className="flex flex-col gap-2">
									{items.map((item) => {
										const ownerName = item.ownerEmployeeId ? employeeById.get(item.ownerEmployeeId)?.name ?? "Unassigned" : "Unassigned"
										const isSelected = selectedActionIds.has(item.id)
										return (
											<div
												key={item.id}
												className={cn(
													"flex items-center justify-between rounded-xl border px-3 py-2",
													isSelected
														? "border-[color-mix(in_srgb,var(--vscode-editor-selectionBackground)_80%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-selectionBackground)_24%,transparent)]"
														: "border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)]",
												)}>
												<div className="flex flex-col">
													<span className="text-sm font-medium text-[var(--vscode-foreground)]">{item.title}</span>
													<span className="text-[11px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)]">{ownerName}</span>
												</div>
												<div className="flex items-center gap-2">
													<input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(item.id)} aria-label={`Select ${item.title}`} />
													<button type="button" onClick={() => onStart(item)} disabled={isStarting} title="Start" className="codicon codicon-play text-[var(--vscode-foreground)]" />
													<button type="button" onClick={() => onOpenChat(item)} title="Open chat" className="codicon codicon-comment text-[var(--vscode-foreground)]" />
												</div>
											</div>
										)
									})}
								</div>
							</div>
						)
					})
				)}
				{scheduled.size === 0 && unscheduled.length > 0 ? (
					<div className="ml-8">
						<h4 className="m-0 text-sm font-semibold text-[var(--vscode-foreground)]">No due dates</h4>
						<ul className="mt-2 space-y-1 text-[12px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_82%,transparent)]">
							{unscheduled.map((item) => (
								<li key={item.id}>{item.title}</li>
							))}
						</ul>
					</div>
				) : null}
			</div>
		</div>
	)
}

interface ActionWorkspaceCalendarViewProps {
	actionItems: WorkplaceActionItem[]
	employeeById: Map<string, WorkplaceEmployee>
	statusById: Map<string, WorkplaceActionStatus>
	referenceDate: Date
	onReferenceDateChange: (date: Date) => void
	onStart: (action: WorkplaceActionItem) => void
	onOpenChat: (action: WorkplaceActionItem) => void
	selectedActionIds: Set<string>
	onToggleSelect: (id: string) => void
	isStarting: boolean
}

const ActionWorkspaceCalendarView = ({
	actionItems,
	employeeById,
	statusById,
	referenceDate,
	onReferenceDateChange,
	onStart,
	onOpenChat,
	selectedActionIds,
	onToggleSelect,
	isStarting,
}: ActionWorkspaceCalendarViewProps) => {
	const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1)
	const monthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0)
	const gridStart = startOfWeek(monthStart)
	const gridEnd = addDays(startOfWeek(addDays(monthEnd, 6)), 6)

	const days: Date[] = []
	for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor = addDays(cursor, 1)) {
		days.push(new Date(cursor))
	}

	const itemsByDate = useMemo(() => {
		const map = new Map<string, WorkplaceActionItem[]>()
		for (const item of actionItems) {
			if (!item.dueAt) continue
			const date = new Date(item.dueAt)
			if (Number.isNaN(date.getTime())) continue
			const key = date.toISOString().slice(0, 10)
			if (!map.has(key)) {
				map.set(key, [])
			}
			map.get(key)!.push(item)
		}
		return map
	}, [actionItems])

	const todayKey = new Date().toISOString().slice(0, 10)

	return (
		<div className="flex h-full w-full flex-col gap-4 overflow-auto px-4 py-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2 text-sm font-semibold text-[var(--vscode-foreground)]">
					<button type="button" onClick={() => onReferenceDateChange(addMonths(referenceDate, -1))} title="Previous month" className="codicon codicon-chevron-left" />
					<span>{referenceDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
					<button type="button" onClick={() => onReferenceDateChange(addMonths(referenceDate, 1))} title="Next month" className="codicon codicon-chevron-right" />
				</div>
				<button type="button" onClick={() => onReferenceDateChange(new Date())} className="rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
					Today
				</button>
			</div>
			<div className="grid flex-1 grid-cols-7 gap-3">
				{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
					<div key={day} className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
						{day}
					</div>
				))}
				{days.map((date) => {
					const key = date.toISOString().slice(0, 10)
					const items = itemsByDate.get(key) ?? []
					const isCurrentMonth = date.getMonth() === referenceDate.getMonth()
					return (
						<div
							key={key}
							className={cn(
								"flex min-h-[120px] flex-col gap-1 rounded-2xl border px-3 py-3 text-[12px]",
								isCurrentMonth
									? "border-[color-mix(in_srgb,var(--vscode-foreground)_10%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_95%,transparent)]"
									: "border-[color-mix(in_srgb,var(--vscode-foreground)_6%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)] opacity-80",
							)}>
							<div className="flex items-center justify-between">
								<span className={cn("text-sm font-semibold", key === todayKey && "text-[var(--vscode-focusBorder)]")}>{date.getDate()}</span>
								{items.length > 0 ? (
									<span className="text-[10px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">{items.length}</span>
								) : null}
							</div>
							<div className="flex flex-1 flex-col gap-1 overflow-y-auto">
								{items.map((item) => {
									const ownerName = item.ownerEmployeeId ? employeeById.get(item.ownerEmployeeId)?.name ?? "Unassigned" : "Unassigned"
									const isSelected = selectedActionIds.has(item.id)
									return (
										<button
											key={item.id}
											type="button"
											onClick={() => onToggleSelect(item.id)}
											className={cn(
												"flex flex-col rounded-xl border px-2 py-1 text-left",
												isSelected
													? "border-[color-mix(in_srgb,var(--vscode-editor-selectionBackground)_80%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-selectionBackground)_24%,transparent)]"
													: "border-[color-mix(in_srgb,var(--vscode-foreground)_10%,transparent)]"
											)}
											title="Toggle selection">
											<span className="text-[11px] font-medium text-[var(--vscode-foreground)]">{item.title}</span>
											<span className="text-[10px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_72%,transparent)]">{ownerName}</span>
											<div className="mt-1 flex items-center gap-1">
												<button type="button" onClick={(event) => { event.stopPropagation(); onStart(item) }} disabled={isStarting} title="Start" className="codicon codicon-play text-[var(--vscode-foreground)]" />
												<button type="button" onClick={(event) => { event.stopPropagation(); onOpenChat(item) }} title="Chat" className="codicon codicon-comment text-[var(--vscode-foreground)]" />
											</div>
										</button>
									)
								})}
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}

interface ActionPropertyManagerProps {
	columns: ActionPropertyColumn[]
	onClose: () => void
	onUpdate: (key: string, updates: Partial<Omit<ActionPropertyColumn, "key" | "id">>) => void
	onRemove: (key: string) => void
	onReorder: (sourceIndex: number, targetIndex: number) => void
	onCreate: (column: Omit<ActionPropertyColumn, "id">) => void
	onAddOption: (key: string, option: string) => void
}

const ActionPropertyManager = ({ columns, onClose, onUpdate, onRemove, onReorder, onCreate, onAddOption }: ActionPropertyManagerProps) => {
	const [newLabel, setNewLabel] = useState("")
	const [newKey, setNewKey] = useState("")
	const [newType, setNewType] = useState<ActionPropertyType>("text")
	const [optionDrafts, setOptionDrafts] = useState<Record<string, string>>(() => ({}))

	const handleSubmitNew = () => {
		const normalizedKey = normalizePropertyKey(newKey || newLabel)
		if (!normalizedKey) return
		onCreate({
			key: normalizedKey,
			label: newLabel || humanizeKey(normalizedKey),
			type: newType,
			options: [],
			isVisible: true,
		})
		setNewLabel("")
		setNewKey("")
		setNewType("text")
	}

	const setOptionDraft = (key: string, value: string) => {
		setOptionDrafts((prev) => ({ ...prev, [key]: value }))
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--vscode-editor-background)_70%,rgba(0,0,0,0.55))] px-4 py-8">
			<div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col gap-5 overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--vscode-foreground)_14%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,transparent)] px-6 py-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
				<header className="flex items-center justify-between">
					<div>
						<h3 className="m-0 text-lg font-semibold text-[var(--vscode-foreground)]">Manage columns</h3>
						<p className="m-0 text-sm text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_82%,transparent)]">
							Reorder, rename, or add new property fields. Changes apply immediately to the workspace.
						</p>
					</div>
					<button type="button" onClick={onClose} className="codicon codicon-close text-[var(--vscode-foreground)]" title="Close" />
				</header>
				<div className="flex-1 overflow-auto pr-2">
					<div className="flex flex-col gap-4">
						{columns.map((column, index) => (
							<div key={column.key} className="rounded-2xl border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] px-4 py-4 shadow-[0_12px_26px_rgba(0,0,0,0.22)]">
								<div className="flex flex-wrap items-center gap-3">
									<button
										type="button"
										onClick={() => onReorder(index, Math.max(0, index - 1))}
										disabled={index === 0}
										title="Move up"
										className="codicon codicon-arrow-up text-[var(--vscode-foreground)]" />
									<button
										type="button"
										onClick={() => onReorder(index, Math.min(columns.length - 1, index + 1))}
										disabled={index === columns.length - 1}
										title="Move down"
										className="codicon codicon-arrow-down text-[var(--vscode-foreground)]" />
									<VSCodeTextField
										value={column.label}
										onInput={(event: any) => onUpdate(column.key, { label: event.target.value as string })}
										className="min-w-[160px] flex-1"
									/>
									<VSCodeDropdown
										value={column.type}
										onChange={(event: any) => onUpdate(column.key, { type: event.target.value as ActionPropertyType })}
										className="w-40 text-[12px]">
										<VSCodeOption value="text">Text</VSCodeOption>
										<VSCodeOption value="number">Number</VSCodeOption>
										<VSCodeOption value="boolean">Yes / No</VSCodeOption>
										<VSCodeOption value="date">Date</VSCodeOption>
										<VSCodeOption value="select">Select</VSCodeOption>
										<VSCodeOption value="multi_select">Multi-select</VSCodeOption>
									</VSCodeDropdown>
									<label className="inline-flex items-center gap-2 text-[12px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_82%,transparent)]">
										<input
											type="checkbox"
											checked={column.isVisible}
											onChange={(event) => onUpdate(column.key, { isVisible: event.target.checked })}
										/>
										Visible
									</label>
									<button
										type="button"
										onClick={() => onRemove(column.key)}
										title="Remove column"
										className="codicon codicon-trash text-[var(--vscode-errorForeground)]" />
								</div>
								{(column.type === "select" || column.type === "multi_select") ? (
									<div className="mt-3 flex flex-wrap items-center gap-2">
										{column.options.map((option) => (
											<span
												key={option}
												className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_16%,transparent)] px-3 py-0.5 text-[11px] text-[var(--vscode-foreground)]">
													{option}
													<button type="button" onClick={() => onUpdate(column.key, { options: column.options.filter((candidate) => candidate !== option) })} title="Remove option" className="codicon codicon-close" />
											</span>
										))}
					<VSCodeTextField
						value={optionDrafts[column.key] ?? ""}
						onInput={(event: any) => setOptionDraft(column.key, event.target.value as string)}
						placeholder="New option"
						className="w-40 text-[12px]"
					/>
					<VSCodeButton
						appearance="secondary"
						onClick={() => {
							const candidate = (optionDrafts[column.key] ?? "").trim()
							if (!candidate) return
							onAddOption(column.key, candidate)
							setOptionDraft(column.key, "")
						}}
											className="h-7 rounded-full px-3 text-[10px] font-semibold uppercase tracking-[0.18em]">
											Add
										</VSCodeButton>
									</div>
								) : null}
							</div>
						))}
					</div>
				</div>
				<div className="flex flex-col gap-2 rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--vscode-foreground)_20%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] px-4 py-4">
					<p className="m-0 text-sm font-semibold text-[var(--vscode-foreground)]">Add property</p>
					<div className="flex flex-wrap items-center gap-3">
						<VSCodeTextField value={newLabel} onInput={(event: any) => setNewLabel(event.target.value as string)} placeholder="Display label" className="flex-1" />
						<VSCodeTextField value={newKey} onInput={(event: any) => setNewKey(event.target.value as string)} placeholder="Key (optional)" className="w-48" />
						<VSCodeDropdown value={newType} onChange={(event: any) => setNewType(event.target.value as ActionPropertyType)} className="w-48 text-[12px]">
							<VSCodeOption value="text">Text</VSCodeOption>
							<VSCodeOption value="number">Number</VSCodeOption>
							<VSCodeOption value="boolean">Yes / No</VSCodeOption>
							<VSCodeOption value="date">Date</VSCodeOption>
							<VSCodeOption value="select">Select</VSCodeOption>
							<VSCodeOption value="multi_select">Multi-select</VSCodeOption>
						</VSCodeDropdown>
						<VSCodeButton appearance="primary" onClick={handleSubmitNew} className="h-8 rounded-full px-5 text-[11px] font-semibold uppercase tracking-[0.2em]">
							Add property
						</VSCodeButton>
					</div>
				</div>
			</div>
		</div>
	)
}

export default ActionWorkspaceView
