import { useCallback, useMemo, useState } from "react"
import {
	VSCodeButton,
	VSCodeTextArea,
	VSCodeTextField,
	VSCodeDropdown,
	VSCodeOption,
} from "@vscode/webview-ui-toolkit/react"
import {
	addDays,
	addWeeks,
	addMonths,
	addHours,
	endOfDay,
	endOfWeek,
	endOfMonth,
	format,
	isSameDay,
	isSameMonth,
	isToday,
	startOfDay,
	startOfWeek,
	startOfMonth,
	differenceInCalendarWeeks,
} from "date-fns"

import { SearchableSelect, type SearchableSelectOption } from "@/components/ui"
import type {
	CreateShiftPayload,
	DeleteShiftPayload,
	UpdateShiftPayload,
	WorkplaceDayOfWeek,
	WorkplaceEmployee,
	WorkplaceShift,
	WorkplaceShiftRecurrence,
} from "@roo/golden/workplace"

const HORIZON_DAYS = 10
const MS_PER_HOUR = 60 * 60 * 1000

interface WorkdayScheduleBoardProps {
	companyId: string
	employees: WorkplaceEmployee[]
	shifts: WorkplaceShift[]
	onCreateShift: (payload: CreateShiftPayload) => void
	onUpdateShift: (payload: UpdateShiftPayload) => void
	onDeleteShift: (payload: DeleteShiftPayload) => void
}

interface ShiftOccurrence {
	id: string
	shiftId: string
	start: Date
	end: Date
	shift: WorkplaceShift
}

interface ComposerState {
	id?: string
	employeeId: string
	title: string
	description: string
	startLocal: string
	endLocal: string
	recurrenceType: WorkplaceShiftRecurrence["type"]
	recurrenceInterval: number
	recurrenceWeekdays: WorkplaceDayOfWeek[]
	recurrenceUntil?: string
	timezone: string
}

const WEEKDAY_LABELS: Array<{ value: WorkplaceDayOfWeek; label: string }> = [
	{ value: "sunday", label: "Sun" },
	{ value: "monday", label: "Mon" },
	{ value: "tuesday", label: "Tue" },
	{ value: "wednesday", label: "Wed" },
	{ value: "thursday", label: "Thu" },
	{ value: "friday", label: "Fri" },
	{ value: "saturday", label: "Sat" },
]

const toLocalInput = (iso?: string) => {
	if (!iso) return ""
	const date = new Date(iso)
	if (Number.isNaN(date.getTime())) return ""
	const offset = date.getTimezoneOffset()
	const local = new Date(date.getTime() - offset * 60_000)
	return local.toISOString().slice(0, 16)
}

const fromLocalInput = (value: string) => {
	if (!value) return undefined
	const parsed = new Date(value)
	if (Number.isNaN(parsed.getTime())) return undefined
	return parsed.toISOString()
}

const ensureInterval = (interval?: number) => {
	if (typeof interval !== "number" || !Number.isFinite(interval) || interval < 1) {
		return 1
	}
	return Math.min(12, Math.trunc(interval))
}

const recurrenceWeekdaysToNumbers = (weekdays: WorkplaceDayOfWeek[]): number[] => {
	const map: Record<WorkplaceDayOfWeek, number> = {
		sunday: 0,
		monday: 1,
		tuesday: 2,
		wednesday: 3,
		thursday: 4,
		friday: 5,
		saturday: 6,
	}
	return weekdays.map((day) => map[day])
}

type ViewMode = "timeline" | "week" | "day" | "month"

const VIEW_MODE_OPTIONS: Array<{ value: ViewMode; label: string }> = [
	{ value: "timeline", label: "10-Day" },
	{ value: "week", label: "Weekly" },
	{ value: "day", label: "Daily" },
	{ value: "month", label: "Monthly" },
]

const getDateKey = (date: Date) => format(date, "yyyy-MM-dd")

const groupOccurrencesByDate = (occurrences: ShiftOccurrence[]): Map<string, ShiftOccurrence[]> => {
	const map = new Map<string, ShiftOccurrence[]>()
	for (const occurrence of occurrences) {
		const key = getDateKey(occurrence.start)
		const existing = map.get(key)
		if (existing) {
			existing.push(occurrence)
		} else {
			map.set(key, [occurrence])
		}
	}
	return map
}

const expandOccurrences = (
	shift: WorkplaceShift,
	rangeStart: Date,
	rangeEnd: Date,
): ShiftOccurrence[] => {
	const start = new Date(shift.start)
	const end = new Date(shift.end)
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		return []
	}
	const duration = end.getTime() - start.getTime()
	if (duration <= 0) {
		return []
	}

	const occurrences: ShiftOccurrence[] = []

	const pushOccurrence = (occurrenceStart: Date) => {
		const occurrenceEnd = new Date(occurrenceStart.getTime() + duration)
		if (occurrenceStart > rangeEnd || occurrenceEnd < rangeStart) {
			return
		}
		occurrences.push({
			id: `${shift.id}-${occurrenceStart.toISOString()}`,
			shiftId: shift.id,
			start: occurrenceStart,
			end: occurrenceEnd,
			shift,
		})
	}

	const recurrence = shift.recurrence ?? { type: "none" as const }
	if (recurrence.type === "weekly") {
		const interval = ensureInterval(recurrence.interval)
		const weekdays = recurrenceWeekdaysToNumbers(recurrence.weekdays ?? [])
		if (weekdays.length === 0) {
			return occurrences
		}
		const until = recurrence.until ? new Date(recurrence.until) : undefined
		const baseWeekStart = startOfWeek(start, { weekStartsOn: 0 })
		let cursor = startOfWeek(rangeStart, { weekStartsOn: 0 })
		while (cursor <= rangeEnd) {
			const diff = differenceInCalendarWeeks(cursor, baseWeekStart, { weekStartsOn: 0 })
			if (diff >= 0 && diff % interval === 0) {
				for (const weekday of weekdays) {
					const candidate = addDays(cursor, weekday)
					const occurrenceStart = new Date(
						startOfDay(candidate).getTime() + (start.getTime() - startOfDay(start).getTime()),
					)
					if (occurrenceStart < start) continue
					if (until && occurrenceStart > until) continue
					pushOccurrence(occurrenceStart)
				}
			}
			cursor = addWeeks(cursor, 1)
		}
		return occurrences
	}

	pushOccurrence(start)
	return occurrences
}

const collectOccurrencesInRange = (
	shifts: WorkplaceShift[],
	rangeStart: Date,
	rangeEnd: Date,
): ShiftOccurrence[] => {
	const results: ShiftOccurrence[] = []
	for (const shift of shifts) {
		results.push(...expandOccurrences(shift, rangeStart, rangeEnd))
	}
	return results.sort((a, b) => a.start.getTime() - b.start.getTime())
}

const toDateInputValue = (date: Date) => format(date, "yyyy-MM-dd")

const parseDateInputValue = (value: string): Date | undefined => {
	const [yearStr, monthStr, dayStr] = value.split("-")
	const year = Number(yearStr)
	const month = Number(monthStr)
	const day = Number(dayStr)
	if (!year || !month || !day) {
		return undefined
	}
	const parsed = new Date(year, month - 1, day)
	if (Number.isNaN(parsed.getTime())) {
		return undefined
	}
	return parsed
}

const defaultComposerState = (employees: WorkplaceEmployee[]): ComposerState => ({
	employeeId: employees[0]?.id ?? "",
	title: "",
	description: "",
	startLocal: "",
	endLocal: "",
	recurrenceType: "none",
	recurrenceInterval: 1,
	recurrenceWeekdays: [],
	recurrenceUntil: undefined,
	timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
})

const composerFromShift = (shift: WorkplaceShift): ComposerState => ({
	id: shift.id,
	employeeId: shift.employeeId,
	title: shift.name ?? "",
	description: shift.description ?? "",
	startLocal: toLocalInput(shift.start),
	endLocal: toLocalInput(shift.end),
	recurrenceType: shift.recurrence?.type ?? "none",
	recurrenceInterval:
		shift.recurrence?.type === "weekly" ? ensureInterval(shift.recurrence.interval) : 1,
	recurrenceWeekdays:
		shift.recurrence?.type === "weekly" ? shift.recurrence.weekdays ?? [] : [],
	recurrenceUntil:
		shift.recurrence?.type === "weekly" && shift.recurrence.until
			? toLocalInput(shift.recurrence.until)
			: undefined,
	timezone: shift.timezone ?? "",
})

const WorkdayScheduleBoard = ({
	companyId,
	employees,
	shifts,
	onCreateShift,
	onUpdateShift,
	onDeleteShift,
}: WorkdayScheduleBoardProps) => {
	const [isComposerOpen, setIsComposerOpen] = useState(false)
	const [isEditing, setIsEditing] = useState(false)
	const [composerState, setComposerState] = useState<ComposerState>(() => defaultComposerState(employees))
	const [viewMode, setViewMode] = useState<ViewMode>("timeline")
	const [weekCursor, setWeekCursor] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }))
	const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
	const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))

	const employeeOptions = useMemo<SearchableSelectOption[]>(
		() => employees.map((employee) => ({ value: employee.id, label: employee.name })),
		[employees],
	)

	const employeeLookup = useMemo(() => {
		const lookup = new Map<string, WorkplaceEmployee>()
		for (const employee of employees) {
			lookup.set(employee.id, employee)
		}
		return lookup
	}, [employees])

	const now = new Date()
	const timelineStart = startOfDay(now)
	const timelineEnd = endOfDay(addDays(timelineStart, HORIZON_DAYS - 1))

	const timelineOccurrences = useMemo(
		() => collectOccurrencesInRange(shifts, timelineStart, timelineEnd),
		[shifts, timelineStart, timelineEnd],
	)

	const timelineOccurrencesByDate = useMemo(
		() => groupOccurrencesByDate(timelineOccurrences),
		[timelineOccurrences],
	)

	const timelineDays = useMemo(() => {
		return Array.from({ length: HORIZON_DAYS }).map((_, index) => {
			const date = addDays(timelineStart, index)
			const key = getDateKey(date)
			const dayOccurrences = timelineOccurrencesByDate.get(key) ?? []
			return {
				date,
				title: format(date, "EEEE"),
				subtitle: format(date, "MMM d"),
				occurrences: dayOccurrences,
			}
		})
	}, [timelineStart, timelineOccurrencesByDate])

	const scheduledEmployees = useMemo(() => {
		const set = new Set<string>()
		for (const occurrence of timelineOccurrences) {
			set.add(occurrence.shift.employeeId)
		}
		return set
	}, [timelineOccurrences])

	const weekStartDate = useMemo(
		() => startOfWeek(weekCursor, { weekStartsOn: 0 }),
		[weekCursor],
	)
	const weekEndDate = useMemo(
		() => endOfWeek(weekStartDate, { weekStartsOn: 0 }),
		[weekStartDate],
	)
	const weekOccurrences = useMemo(
		() => collectOccurrencesInRange(shifts, weekStartDate, weekEndDate),
		[shifts, weekStartDate, weekEndDate],
	)
	const weekOccurrencesByDate = useMemo(
		() => groupOccurrencesByDate(weekOccurrences),
		[weekOccurrences],
	)
	const weekDays = useMemo(() => {
		return Array.from({ length: 7 }).map((_, index) => {
			const date = addDays(weekStartDate, index)
			const key = getDateKey(date)
			return {
				date,
				occurrences: weekOccurrencesByDate.get(key) ?? [],
			}
		})
	}, [weekStartDate, weekOccurrencesByDate])

	const weekRangeLabel = `${format(weekStartDate, "MMM d")} – ${format(weekEndDate, "MMM d, yyyy")}`

	const dailyStart = selectedDate
	const dailyEnd = useMemo(() => endOfDay(selectedDate), [selectedDate])
	const dailyOccurrences = useMemo(
		() => collectOccurrencesInRange(shifts, dailyStart, dailyEnd),
		[shifts, dailyStart, dailyEnd],
	)
	const dailyHours = useMemo(() => {
		const dayStartMs = dailyStart.getTime()
		return Array.from({ length: 24 }).map((_, hour) => {
			const hourStart = addHours(dailyStart, hour)
			const hourEnd = addHours(hourStart, 1)
			const overlapping = dailyOccurrences.filter(
				(occurrence) => occurrence.start < hourEnd && occurrence.end > hourStart,
			)
			const starting = overlapping.filter((occurrence) => {
				const clampedStart = Math.max(occurrence.start.getTime(), dayStartMs)
				const occurrenceStartHour = Math.floor((clampedStart - dayStartMs) / MS_PER_HOUR)
				return occurrenceStartHour === hour
			})
			const continuing = overlapping.length - starting.length
			return {
				hour,
				label: format(hourStart, "h a"),
				starting,
				continuing,
			}
		})
	}, [dailyOccurrences, dailyStart])

	const monthStart = useMemo(() => startOfMonth(monthCursor), [monthCursor])
	const monthEnd = useMemo(() => endOfMonth(monthStart), [monthStart])
	const monthRangeStart = useMemo(
		() => startOfWeek(monthStart, { weekStartsOn: 0 }),
		[monthStart],
	)
	const monthRangeEnd = useMemo(
		() => endOfWeek(monthEnd, { weekStartsOn: 0 }),
		[monthEnd],
	)
	const monthOccurrences = useMemo(
		() => collectOccurrencesInRange(shifts, monthRangeStart, monthRangeEnd),
		[shifts, monthRangeStart, monthRangeEnd],
	)
	const monthOccurrencesByDate = useMemo(
		() => groupOccurrencesByDate(monthOccurrences),
		[monthOccurrences],
	)
	const monthWeeks = useMemo(() => {
		const weeks: Array<
			Array<{
				date: Date
				inMonth: boolean
				isToday: boolean
				occurrences: ShiftOccurrence[]
			}>
		> = []
		let cursor = monthRangeStart
		while (cursor <= monthRangeEnd) {
			const week: Array<{
				date: Date
				inMonth: boolean
				isToday: boolean
				occurrences: ShiftOccurrence[]
			}> = []
			for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
				const date = addDays(cursor, dayIndex)
				const key = getDateKey(date)
				week.push({
					date,
					inMonth: isSameMonth(date, monthStart),
					isToday: isToday(date),
					occurrences: monthOccurrencesByDate.get(key) ?? [],
				})
			}
			weeks.push(week)
			cursor = addWeeks(cursor, 1)
		}
		return weeks
	}, [monthRangeStart, monthRangeEnd, monthOccurrencesByDate, monthStart])

	const openComposerForCreate = useCallback(() => {
		setIsEditing(false)
		setComposerState(defaultComposerState(employees))
		setIsComposerOpen(true)
	}, [employees])

	const openComposerForShift = useCallback((shift: WorkplaceShift) => {
		setIsEditing(true)
		setComposerState(composerFromShift(shift))
		setIsComposerOpen(true)
	}, [])

	const closeComposer = useCallback(() => {
		setIsComposerOpen(false)
	}, [])

	const handleComposerSubmit = useCallback(() => {
		const startIso = fromLocalInput(composerState.startLocal)
		const endIso = fromLocalInput(composerState.endLocal)
		if (!startIso || !endIso) {
			return
		}
		const startDate = new Date(startIso)
		const endDate = new Date(endIso)
		if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
			return
		}
		if (endDate.getTime() <= startDate.getTime()) {
			return
		}

		const recurrence: WorkplaceShiftRecurrence =
			composerState.recurrenceType === "weekly"
				? {
						type: "weekly",
						interval: ensureInterval(composerState.recurrenceInterval),
						weekdays: composerState.recurrenceWeekdays,
						until: composerState.recurrenceUntil
							? fromLocalInput(composerState.recurrenceUntil)
							: undefined,
				  }
				: { type: "none" }

		const payload = {
			id: composerState.id,
			companyId,
			shift: {
				id: composerState.id,
				employeeId: composerState.employeeId,
				name: composerState.title.trim() || undefined,
				description: composerState.description.trim() || undefined,
				start: startIso,
				end: endIso,
				recurrence,
				timezone: composerState.timezone.trim() || undefined,
			},
		}

		if (isEditing && composerState.id) {
			onUpdateShift({
				companyId,
				shift: payload.shift as WorkplaceShift,
			})
		} else {
			onCreateShift(payload)
		}

		setIsComposerOpen(false)
	}, [composerState, companyId, isEditing, onCreateShift, onUpdateShift])

	const handleDeleteShift = useCallback(() => {
		if (!isEditing || !composerState.id) {
			return
		}
		onDeleteShift({ companyId, shiftId: composerState.id })
		setIsComposerOpen(false)
	}, [companyId, composerState.id, isEditing, onDeleteShift])

	const handleToggleWeekday = useCallback((weekday: WorkplaceDayOfWeek) => {
		setComposerState((prev) => {
			const next = new Set(prev.recurrenceWeekdays)
			if (next.has(weekday)) {
				next.delete(weekday)
			} else {
				next.add(weekday)
			}
			return { ...prev, recurrenceWeekdays: Array.from(next) }
		})
	}, [])

	const handleShiftWeek = useCallback((delta: number) => {
		setWeekCursor((prev) => startOfWeek(addWeeks(prev, delta), { weekStartsOn: 0 }))
	}, [])

	const handleResetWeek = useCallback(() => {
		setWeekCursor(startOfWeek(new Date(), { weekStartsOn: 0 }))
	}, [])

	const handleDailyDateInput = useCallback((value: string) => {
		const parsed = parseDateInputValue(value)
		if (!parsed) {
			return
		}
		setSelectedDate(startOfDay(parsed))
	}, [])

	const handleResetDailyDate = useCallback(() => {
		setSelectedDate(startOfDay(new Date()))
	}, [])

	const handleShiftMonth = useCallback((delta: number) => {
		setMonthCursor((prev) => startOfMonth(addMonths(prev, delta)))
	}, [])

	const handleResetMonth = useCallback(() => {
		setMonthCursor(startOfMonth(new Date()))
	}, [])

	const monthTitle = format(monthStart, "MMMM yyyy")

	const totalShiftsInRange = timelineOccurrences.length
	const uniqueDaysWithCoverage = timelineDays.filter((day) => day.occurrences.length > 0).length
	const hasEmployees = employees.length > 0

	return (
		<div className="mt-6">
			<div className="rounded-3xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_46%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)]/80 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.32)] backdrop-blur">
				<div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
					<div className="space-y-2">
						<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
							Rhythm & Coverage
						</p>
						<h2 className="text-2xl font-semibold text-[var(--vscode-foreground)]">
							Workday Navigator
						</h2>
						<p className="max-w-2xl text-sm text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_88%,transparent)]">
							Preview the next {HORIZON_DAYS} days of coverage, balance workloads, and keep every role energized.
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<VSCodeButton
							appearance="secondary"
							onClick={openComposerForCreate}
							className="h-9 rounded-full px-5 text-[12px] font-semibold uppercase tracking-[0.18em]"
						>
							Plan Shift
						</VSCodeButton>
						<VSCodeButton
							appearance="primary"
							onClick={openComposerForCreate}
							disabled={!hasEmployees}
							className="h-9 rounded-full px-5 text-[12px] font-semibold uppercase tracking-[0.18em]"
						>
							Add Coverage
						</VSCodeButton>
					</div>
				</div>

				<div className="mt-6 flex flex-wrap items-center gap-2">
					{VIEW_MODE_OPTIONS.map((option) => {
						const isActive = option.value === viewMode
						return (
							<button
								key={option.value}
								type="button"
								onClick={() => setViewMode(option.value)}
								className={`inline-flex h-8 items-center rounded-full border px-4 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${
									isActive
										? "border-[color-mix(in_srgb,var(--vscode-focusBorder)_54%,transparent)] bg-[color-mix(in_srgb,var(--vscode-focusBorder)_18%,transparent)] text-[var(--vscode-focusBorder)]"
										: "border-[color-mix(in_srgb,var(--vscode-panel-border)_42%,transparent)] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)] hover:border-[color-mix(in_srgb,var(--vscode-panel-border)_58%,transparent)]"
								}`}
							>
								{option.label}
							</button>
						)
					})}
				</div>

				<div className="mt-6 grid gap-3 sm:grid-cols-3">
					<div className="rounded-2xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_42%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] p-4 shadow-[0_12px_28px_rgba(0,0,0,0.24)]">
						<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
							Total Shifts
						</p>
						<p className="mt-1 text-2xl font-semibold text-[var(--vscode-foreground)]">{totalShiftsInRange}</p>
						<p className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_86%,transparent)]">
							Across the next {HORIZON_DAYS} days.
						</p>
					</div>
					<div className="rounded-2xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_42%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] p-4 shadow-[0_12px_28px_rgba(0,0,0,0.24)]">
						<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
							Team On Deck
						</p>
						<p className="mt-1 text-2xl font-semibold text-[var(--vscode-foreground)]">{scheduledEmployees.size}</p>
						<p className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_86%,transparent)]">
							Unique teammates with shifts scheduled.
						</p>
					</div>
					<div className="rounded-2xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_42%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] p-4 shadow-[0_12px_28px_rgba(0,0,0,0.24)]">
						<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
							Days Covered
						</p>
						<p className="mt-1 text-2xl font-semibold text-[var(--vscode-foreground)]">{uniqueDaysWithCoverage}</p>
						<p className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_86%,transparent)]">
							Out of the upcoming {HORIZON_DAYS}-day window.
						</p>
					</div>
				</div>

				{!hasEmployees ? (
					<div className="mt-6 rounded-2xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_48%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] p-6 text-sm text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_90%,transparent)]">
						Invite teammates to this company to begin choreographing the workday.
					</div>
				) : (
					<>
						{viewMode === "timeline" && (
							<div className="mt-6 overflow-x-auto">
								<div className="min-w-[720px] rounded-3xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_32%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)]/60 p-4 shadow-[0_18px_42px_rgba(0,0,0,0.28)]">
									<div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${HORIZON_DAYS}, minmax(0, 1fr))` }}>
										{timelineDays.map((day) => (
											<div
												key={day.date.toISOString()}
												className="flex flex-col gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_24%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,transparent)]/90 p-3 shadow-[0_12px_26px_rgba(0,0,0,0.18)]"
											>
												<div className="flex flex-col gap-1">
													<span className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_72%,transparent)]">
														{day.title}
													</span>
													<span className="text-sm font-medium text-[var(--vscode-foreground)]">{day.subtitle}</span>
												</div>
												<div className="flex flex-col gap-2">
													{day.occurrences.length === 0 ? (
														<div className="rounded-xl border border-dashed border-[color-mix(in_srgb,var(--vscode-panel-border)_32%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)]/60 px-2 py-6 text-center text-[11px] uppercase tracking-[0.22em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
															Open
														</div>
													) : (
														day.occurrences.map((occurrence) => {
															const shift = occurrence.shift
															const employee = employeeLookup.get(shift.employeeId)
															const gradientSeed = (employee?.name ?? shift.employeeId).charCodeAt(0) % 360
															return (
																<button
																	key={occurrence.id}
																	onClick={() => openComposerForShift(shift)}
																	className="group flex flex-col gap-1 rounded-xl border border-transparent bg-[color-mix(in_srgb,transparent_70%,var(--vscode-tab-activeBackground)_30%)] p-3 text-left shadow-[0_10px_22px_rgba(0,0,0,0.18)] transition-[transform,box-shadow] hover:-translate-y-[1px] hover:shadow-[0_18px_36px_rgba(0,0,0,0.28)]"
																	style={{
																		backgroundImage: `linear-gradient(135deg, hsla(${gradientSeed}, 82%, 60%, 0.18), transparent)`
																	}}>
																	<span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_74%,transparent)]">
																		{employee?.name ?? "Unassigned"}
																	</span>
																	<span className="text-sm font-semibold text-[var(--vscode-foreground)]">
																		{shift.name ?? "Scheduled shift"}
																	</span>
																	<span className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_84%,transparent)]">
																		{`${format(occurrence.start, "h:mm a")} – ${format(occurrence.end, "h:mm a")}`}
																	</span>
																	{shift.recurrence?.type === "weekly" ? (
																		<span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_72%,transparent)]">
																			Repeats weekly
																		</span>
																	) : null}
															</button>
														)
														})
													)}
												</div>
										</div>
									))}
								</div>
							</div>
						</div>
						)}

						{viewMode === "week" && (
							<div className="mt-6 rounded-3xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_34%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)]/80 p-5 shadow-[0_18px_48px_rgba(0,0,0,0.28)]">
								<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
									<div className="space-y-1">
										<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
											Weekly cadence
										</p>
										<p className="text-lg font-semibold text-[var(--vscode-foreground)]">{weekRangeLabel}</p>
									</div>
									<div className="flex flex-wrap items-center gap-2">
										<VSCodeButton appearance="secondary" onClick={() => handleShiftWeek(-1)}>
											Prev week
										</VSCodeButton>
										<VSCodeButton appearance="secondary" onClick={handleResetWeek}>
											This week
										</VSCodeButton>
										<VSCodeButton appearance="secondary" onClick={() => handleShiftWeek(1)}>
											Next week
										</VSCodeButton>
									</div>
								</div>

								<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
									{weekDays.map((day) => {
										const label = format(day.date, "EEE MMM d")
										return (
											<div
												key={day.date.toISOString()}
												className="flex flex-col gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_30%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,transparent)]/85 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.2)]"
											>
												<div className="flex flex-col gap-1">
													<span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_74%,transparent)]">
														{format(day.date, "EEEE")}
													</span>
													<span className="text-sm font-medium text-[var(--vscode-foreground)]">{label}</span>
												</div>
												<div className="flex flex-col gap-2">
													{day.occurrences.length === 0 ? (
														<div className="rounded-xl border border-dashed border-[color-mix(in_srgb,var(--vscode-panel-border)_32%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)]/60 px-3 py-6 text-center text-[11px] uppercase tracking-[0.22em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
															Open day
														</div>
													) : (
														day.occurrences.map((occurrence) => {
															const shift = occurrence.shift
															const employee = employeeLookup.get(shift.employeeId)
															const gradientSeed = (employee?.name ?? shift.employeeId).charCodeAt(0) % 360
															return (
																<button
																	key={occurrence.id}
																	onClick={() => openComposerForShift(shift)}
																	className="group flex flex-col gap-1 rounded-xl border border-transparent bg-[color-mix(in_srgb,transparent_70%,var(--vscode-badge-background)_30%)] p-3 text-left shadow-[0_10px_24px_rgba(0,0,0,0.2)] transition-[transform,box-shadow] hover:-translate-y-[1px] hover:shadow-[0_18px_38px_rgba(0,0,0,0.28)]"
																	style={{
																		backgroundImage: `linear-gradient(135deg, hsla(${gradientSeed}, 72%, 58%, 0.16), transparent)`
																	}}>
																	<span className="text-xs font-semibold uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_74%,transparent)]">
																		{employee?.name ?? "Unassigned"}
																	</span>
																	<span className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_82%,transparent)]">
																		{format(occurrence.start, "h:mm a")} – {format(occurrence.end, "h:mm a")}
																	</span>
																	<span className="text-sm font-semibold text-[var(--vscode-foreground)]">
																		{shift.name ?? "Scheduled shift"}
																	</span>
																</button>
														)
														})
												)}
											</div>
										</div>
									)
								})}
								</div>
							</div>
						)}

						{viewMode === "day" && (
							<div className="mt-6 rounded-3xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_34%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_95%,transparent)]/80 p-5 shadow-[0_18px_48px_rgba(0,0,0,0.28)]">
								<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
									<div className="space-y-1">
										<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
											Hourly coverage
										</p>
										<p className="text-lg font-semibold text-[var(--vscode-foreground)]">
											{format(selectedDate, "EEEE, MMM d, yyyy")}
										</p>
									</div>
									<div className="flex flex-wrap items-center gap-2">
										<input
											type="date"
											value={toDateInputValue(selectedDate)}
											onChange={(event) => handleDailyDateInput(event.target.value)}
											className="h-9 rounded-full border border-[color-mix(in_srgb,var(--vscode-panel-border)_38%,transparent)] bg-transparent px-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--vscode-foreground)]"
										/>
										<VSCodeButton appearance="secondary" onClick={handleResetDailyDate}>
											Today
										</VSCodeButton>
									</div>
								</div>

								<div className="mt-4 space-y-2 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_32%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)]/70 p-4">
									{dailyHours.map((slot) => (
										<div key={slot.hour} className="grid grid-cols-[72px,1fr] items-start gap-3">
											<span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_74%,transparent)]">
												{slot.label}
											</span>
											<div className="flex flex-col gap-2">
												{slot.starting.length === 0 && slot.continuing === 0 ? (
													<div className="rounded-xl border border-dashed border-[color-mix(in_srgb,var(--vscode-panel-border)_30%,transparent)] bg-transparent px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_74%,transparent)]">
														Open hour
													</div>
												) : (
													slot.starting.map((occurrence) => {
														const shift = occurrence.shift
														const employee = employeeLookup.get(shift.employeeId)
														const gradientSeed = (employee?.name ?? shift.employeeId).charCodeAt(0) % 360
														return (
															<button
																key={`${occurrence.id}-${slot.hour}`}
																onClick={() => openComposerForShift(shift)}
																className="group flex flex-col gap-1 rounded-lg border border-transparent bg-[color-mix(in_srgb,transparent_70%,var(--vscode-editor-selectionBackground)_30%)] p-3 text-left shadow-[0_8px_20px_rgba(0,0,0,0.18)] transition-[transform,box-shadow] hover:-translate-y-[1px] hover:shadow-[0_16px_34px_rgba(0,0,0,0.26)]"
																style={{
																	backgroundImage: `linear-gradient(135deg, hsla(${gradientSeed}, 78%, 62%, 0.16), transparent)`
																}}>
																<span className="text-xs font-semibold uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_74%,transparent)]">
																	{employee?.name ?? "Unassigned"}
																</span>
																<span className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_84%,transparent)]">
																	{format(occurrence.start, "h:mm a")} – {format(occurrence.end, "h:mm a")}
																</span>
																<span className="text-sm font-semibold text-[var(--vscode-foreground)]">
																	{shift.name ?? "Scheduled shift"}
																</span>
															</button>
														)
													})
												)}
												{slot.continuing > 0 ? (
													<div className="rounded-lg border border-[color-mix(in_srgb,var(--vscode-panel-border)_26%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,transparent)]/60 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_76%,transparent)]">
														Coverage continues ×{slot.continuing}
													</div>
												) : null}
											</div>
										</div>
									))}
								</div>
							</div>
						)}

						{viewMode === "month" && (
							<div className="mt-6 rounded-3xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_34%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_95%,transparent)]/75 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
								<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
									<div className="space-y-1">
										<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
											Monthly calendar
										</p>
										<p className="text-lg font-semibold text-[var(--vscode-foreground)]">{monthTitle}</p>
									</div>
									<div className="flex flex-wrap items-center gap-2">
										<VSCodeButton appearance="secondary" onClick={() => handleShiftMonth(-1)}>
											Prev month
										</VSCodeButton>
										<VSCodeButton appearance="secondary" onClick={handleResetMonth}>
											This month
										</VSCodeButton>
										<VSCodeButton appearance="secondary" onClick={() => handleShiftMonth(1)}>
											Next month
										</VSCodeButton>
									</div>
								</div>

								<div className="mt-4 grid grid-cols-7 gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_74%,transparent)]">
									{WEEKDAY_LABELS.map((weekday) => (
										<div key={`weekday-${weekday.value}`} className="text-center">
											{weekday.label}
										</div>
									))}
								</div>

								<div className="mt-2 grid gap-2">
									{monthWeeks.map((week, weekIndex) => (
										<div key={`week-${weekIndex}`} className="grid grid-cols-7 gap-2">
											{week.map((day) => {
												const key = day.date.toISOString()
												return (
													<div
														key={key}
														className={`flex min-h-[120px] flex-col gap-1 rounded-xl border p-2 shadow-[0_8px_22px_rgba(0,0,0,0.18)] transition-[border-color,box-shadow] ${
															day.inMonth
																? "border-[color-mix(in_srgb,var(--vscode-panel-border)_32%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,transparent)]/85"
																: "border-[color-mix(in_srgb,var(--vscode-panel-border)_20%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)]/60 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]"
														}`}
														style={day.isToday ? { boxShadow: "0 0 0 1px var(--vscode-focusBorder) inset" } : undefined}
													>
														<span className="text-xs font-semibold uppercase tracking-[0.2em]">{format(day.date, "d")}</span>
														<div className="flex flex-col gap-1">
															{day.occurrences.slice(0, 2).map((occurrence) => {
																const shift = occurrence.shift
																const employee = employeeLookup.get(shift.employeeId)
																const gradientSeed = (employee?.name ?? shift.employeeId).charCodeAt(0) % 360
																return (
																	<button
																		key={occurrence.id}
																		onClick={() => openComposerForShift(shift)}
																		className="group flex flex-col gap-0.5 rounded-lg border border-transparent bg-[color-mix(in_srgb,transparent_74%,var(--vscode-terminal-ansiBrightBlue)_26%)] px-2 py-1 text-left text-[11px] shadow-[0_6px_16px_rgba(0,0,0,0.18)] transition-[transform,box-shadow] hover:-translate-y-[1px] hover:shadow-[0_12px_28px_rgba(0,0,0,0.24)]"
																		style={{
																			backgroundImage: `linear-gradient(135deg, hsla(${gradientSeed}, 76%, 64%, 0.2), transparent)`
																	}}
																	>
																		<span className="font-semibold text-[var(--vscode-foreground)]">
																			{shift.name ?? employee?.name ?? "Shift"}
																		</span>
																		<span className="text-[10px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
																			{format(occurrence.start, "h:mm a")}
																		</span>
																	</button>
																)
															})}
															{day.occurrences.length > 2 ? (
																<span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
																	+{day.occurrences.length - 2} more
																</span>
															) : null}
														</div>
													</div>
												)
											})}
										</div>
									))}
								</div>
							</div>
						)}
					</>
				)}
			</div>

			{isComposerOpen && (
				<div className="fixed inset-0 z-40 flex items-center justify-center bg-[color-mix(in_srgb,black_62%,transparent)]/70 p-4">
					<div className="w-full max-w-xl rounded-2xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_46%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,transparent)] p-6 shadow-[0_28px_70px_rgba(0,0,0,0.45)]">
						<div className="flex items-start justify-between gap-4">
							<div>
								<h3 className="text-lg font-semibold text-[var(--vscode-foreground)]">
									{isEditing ? "Adjust coverage" : "Design a shift"}
								</h3>
								<p className="mt-1 text-sm text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_86%,transparent)]">
									Align teammates, hours, and recurrence in a few keystrokes.
								</p>
							</div>
							<VSCodeButton appearance="secondary" onClick={closeComposer}>
								Cancel
							</VSCodeButton>
						</div>

						<div className="mt-6 grid gap-4">
							<div>
								<span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
									Teammate
								</span>
								<SearchableSelect
									value={composerState.employeeId}
									onValueChange={(value) =>
										setComposerState((prev) => ({ ...prev, employeeId: value }))
									}
									options={employeeOptions}
									placeholder="Assign teammate"
									searchPlaceholder="Search teammates"
									emptyMessage="No teammates found"
								/>
							</div>

							<VSCodeTextField
								value={composerState.title}
								onInput={(event: any) =>
									setComposerState((prev) => ({ ...prev, title: event.target.value as string }))
								}
								placeholder="Shift label (optional)"
							/>

							<VSCodeTextArea
								value={composerState.description}
								onInput={(event: any) =>
									setComposerState((prev) => ({ ...prev, description: event.target.value as string }))
								}
								rows={3}
								placeholder="Responsibilities, handoff notes, links"
							/>

							<VSCodeTextField
								value={composerState.timezone}
								onInput={(event: any) =>
									setComposerState((prev) => ({ ...prev, timezone: event.target.value as string }))
								}
								placeholder="Timezone"
							/>

							<div className="grid gap-4 sm:grid-cols-2">
								<label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
									<span>Begins</span>
									<input
										type="datetime-local"
										value={composerState.startLocal}
										onChange={(event) =>
											setComposerState((prev) => ({ ...prev, startLocal: event.target.value }))
										}
										required
									/>
								</label>
								<label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
									<span>Ends</span>
									<input
										type="datetime-local"
										value={composerState.endLocal}
										onChange={(event) =>
											setComposerState((prev) => ({ ...prev, endLocal: event.target.value }))
										}
										required
									/>
								</label>
							</div>

							<div className="grid gap-3 rounded-xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_36%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)]/80 p-4">
								<label className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
									<span>Recurrence</span>
									<VSCodeDropdown
										value={composerState.recurrenceType}
										onChange={(event: any) => {
											const type = event.target.value as WorkplaceShiftRecurrence["type"]
											setComposerState((prev) => ({
												...prev,
												recurrenceType: type,
												recurrenceWeekdays: type === "weekly" ? prev.recurrenceWeekdays : [],
											}))
										}}>
										<VSCodeOption value="none">One-time</VSCodeOption>
										<VSCodeOption value="weekly">Weekly</VSCodeOption>
									</VSCodeDropdown>
								</label>

								{composerState.recurrenceType === "weekly" && (
									<div className="grid gap-3">
										<label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
											<span>Every</span>
											<VSCodeTextField
												value={String(composerState.recurrenceInterval)}
												onInput={(event: any) =>
													setComposerState((prev) => ({
														...prev,
														recurrenceInterval: Number(event.target.value) || 1,
													}))
												}
												className="w-20"
											/>
											<span>week(s)</span>
										</label>

										<div className="flex flex-wrap gap-2">
											{WEEKDAY_LABELS.map((weekday) => {
												const selected = composerState.recurrenceWeekdays.includes(weekday.value)
												return (
													<button
														key={weekday.value}
														type="button"
														onClick={() => handleToggleWeekday(weekday.value)}
														className={`inline-flex min-w-[48px] items-center justify-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${selected ? "border-[color-mix(in_srgb,var(--vscode-focusBorder)_70%,transparent)] bg-[color-mix(in_srgb,var(--vscode-focusBorder)_22%,transparent)] text-[var(--vscode-focusBorder)]" : "border-[color-mix(in_srgb,var(--vscode-panel-border)_36%,transparent)] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_82%,transparent)] hover:border-[color-mix(in_srgb,var(--vscode-panel-border)_54%,transparent)]"}`}
												>
														{weekday.label}
													</button>
												)
											})}
										</div>

										<label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
											<span>Repeat until (optional)</span>
											<input
												type="date"
												value={composerState.recurrenceUntil ?? ""}
												onChange={(event) =>
													setComposerState((prev) => ({ ...prev, recurrenceUntil: event.target.value }))
												}
											/>
										</label>
									</div>
								)}
							</div>
						</div>

						<div className="mt-6 flex flex-wrap items-center justify-between gap-3">
							{isEditing ? (
								<VSCodeButton appearance="secondary" onClick={handleDeleteShift}>
									Delete shift
								</VSCodeButton>
							) : <div />}
							<VSCodeButton appearance="primary" onClick={handleComposerSubmit}>
								{isEditing ? "Save changes" : "Schedule shift"}
							</VSCodeButton>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

export default WorkdayScheduleBoard
