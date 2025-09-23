import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Dispatch, DragEvent, SetStateAction, ChangeEvent } from "react"
import {
	VSCodeButton,
	VSCodeDropdown,
	VSCodeOption,
	VSCodeTextArea,
	VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react"

import { SelectDropdown } from "@/components/ui"
import { cn } from "@/lib/utils"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { vscode } from "@/utils/vscode"
import type {
	WorkplaceActionItem,
	WorkplaceActionStatus,
	WorkplaceCompany,
	WorkplaceEmployee,
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

const ActionWorkspaceView = ({ onDone }: ActionWorkspaceViewProps) => {
	const {
		workplaceState,
		selectCompany,
		createActionItem,
		updateActionItem,
		deleteActionItem,
		createActionStatus,
		startActionItems,
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

	const employees = activeCompany?.employees ?? []
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

	const hasUnassignedActionItems = useMemo(() => {
		if (!activeCompany) return false
		return activeCompany.actionItems.some((item) => !item.ownerEmployeeId)
	}, [activeCompany])

	const employeeFilterOptions = useMemo(() => {
		const options: { value: string; label: string }[] = [{ value: "all", label: "All employees" }]
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

	const statusOptions = useMemo(
		() => sortedStatuses.map((status) => ({ value: status.id, label: status.name })),
		[sortedStatuses],
	)

	const employeeOptions = useMemo(
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
			if (!activeCompany || !activeCompanyId) return

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

			vscode.postMessage({ type: "invoke", invoke: "setChatBoxMessage", text: chatMessage })
			vscode.postMessage({ type: "switchTab", tab: "lobby" })
		},
		[activeCompany, activeCompanyId, employees, setActiveEmployee],
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

			{!activeCompany ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-[var(--vscode-descriptionForeground)]">
					<p className="m-0 max-w-md">
						Create a company first to start organizing action items. Head to the Workforce Hub and add your
						first team.
					</p>
				</div>
			) : (
				<div className="flex flex-1 flex-col overflow-hidden">
					<div className="flex items-center justify-between border-b border-[var(--vscode-panel-border)] px-6 py-4">
						<div>
							<h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
								Action Items
							</h2>
							<p className="m-0 text-xs text-[var(--vscode-descriptionForeground)]">
								{visibleActionItems.length} visible of {orderedActionItems.length} total ·{" "}
								{employees.length} teammates
							</p>
						</div>
						<VSCodeButton
							appearance={showCreateForm ? "secondary" : "primary"}
							onClick={() => setShowCreateForm((prev) => !prev)}>
							{showCreateForm ? "Cancel" : "New action item"}
						</VSCodeButton>
					</div>

					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--vscode-panel-border)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)] px-6 py-3">
						<div className="flex flex-wrap items-center gap-2">
							<SelectDropdown
								value={employeeFilter}
								options={employeeFilterOptions}
								onChange={handleEmployeeFilterChange}
								triggerClassName="w-52 justify-between"
								placeholder="Filter by employee"
							/>
							<VSCodeButton
								appearance="secondary"
								disabled={primaryStartDisabled}
								onClick={handlePrimaryStart}>
								{primaryStartLabel}
							</VSCodeButton>
							<VSCodeButton
								appearance={hasSelection ? "primary" : "secondary"}
								disabled={startSelectedDisabled}
								onClick={handleStartSelected}>
								{startSelectedLabel}
							</VSCodeButton>
							{shouldShowClearSelection && (
								<VSCodeButton appearance="secondary" disabled={isStarting} onClick={clearSelection}>
									Clear Selection
								</VSCodeButton>
							)}
						</div>
						{selectionSummary ? (
							<span className="text-xs text-[var(--vscode-descriptionForeground)]">
								{selectionSummary}
							</span>
						) : null}
					</div>

					<div className="flex-1 overflow-auto">
						<table className="min-w-full table-fixed border-separate border-spacing-0 text-sm">
							<thead className="sticky top-0 z-10 bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,transparent)]">
								<tr className="text-[11px] uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
									<th className="w-10 border-b border-[var(--vscode-panel-border)] px-3 py-2 text-left font-semibold">
										<input
											type="checkbox"
											className="h-3.5 w-3.5 cursor-pointer"
											disabled={visibleActionItems.length === 0 || isStarting}
											checked={allVisibleSelected && visibleActionItems.length > 0}
											onChange={toggleSelectAllVisible}
											aria-label="Select visible action items"
										/>
									</th>
									<th className="w-12 border-b border-[var(--vscode-panel-border)] px-3 py-2 text-left font-semibold">
										#
									</th>
									<th className="border-b border-[var(--vscode-panel-border)] px-3 py-2 text-left font-semibold">
										Title
									</th>
									<th className="w-28 border-b border-[var(--vscode-panel-border)] px-3 py-2 text-left font-semibold">
										Type
									</th>
									<th className="w-40 border-b border-[var(--vscode-panel-border)] px-3 py-2 text-left font-semibold">
										Status
									</th>
									<th className="w-40 border-b border-[var(--vscode-panel-border)] px-3 py-2 text-left font-semibold">
										Assignee
									</th>
									<th className="w-28 border-b border-[var(--vscode-panel-border)] px-3 py-2 text-left font-semibold">
										Due
									</th>
									<th className="border-b border-[var(--vscode-panel-border)] px-3 py-2 text-left font-semibold">
										Description
									</th>
									<th className="w-36 border-b border-[var(--vscode-panel-border)] px-3 py-2 text-right font-semibold">
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
			)}
		</div>
	)
}

interface ActionTableRowProps {
	index: number
	action: WorkplaceActionItem
	statuses: WorkplaceActionStatus[]
	employees: WorkplaceEmployee[]
	statusOptions: { value: string; label: string }[]
	employeeOptions: { value: string; label: string }[]
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
	statuses,
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

	const currentStatusName = statuses.find((status) => status.id === draft.statusId)?.name

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
				"border-b border-[var(--vscode-panel-border)] align-top transition-colors",
				isDragOver && !isDragging && "bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)]",
				isDragging && "opacity-70",
				isSelected && "bg-[color-mix(in_srgb,var(--vscode-editor-selectionBackground)_40%,transparent)]",
			)}
			style={{ cursor: "grab" }}>
			<td className="px-3 py-3 align-top">
				<input
					type="checkbox"
					className="h-3.5 w-3.5 cursor-pointer"
					checked={isSelected}
					disabled={isSelectionDisabled}
					onChange={handleSelectChange}
					onClick={(event) => event.stopPropagation()}
					onPointerDown={(event) => event.stopPropagation()}
					aria-label={`Select action ${action.title}`}
				/>
			</td>
			<td className="px-3 py-3 text-[var(--vscode-descriptionForeground)]">
				<div className="flex items-center gap-2">
					<span className="text-xs">{index}</span>
					<span
						className="codicon codicon-gripper text-[var(--vscode-descriptionForeground)]"
						aria-hidden="true"
					/>
				</div>
			</td>
			<td className="px-3 py-3">
				<VSCodeTextField
					value={draft.title}
					onInput={(event: any) => setDraftField("title", event.target.value as string)}
					placeholder="Title"
					className="w-full"
				/>
			</td>
			<td className="px-3 py-3">
				<VSCodeDropdown
					value={draft.kind}
					onChange={(event: any) => setDraftField("kind", event.target.value as WorkplaceActionItemKind)}>
					<VSCodeOption value="goal">Goal</VSCodeOption>
					<VSCodeOption value="project">Project</VSCodeOption>
					<VSCodeOption value="task">Task</VSCodeOption>
				</VSCodeDropdown>
			</td>
			<td className="px-3 py-3">
				<SelectDropdown
					value={draft.statusId}
					options={statusOptions}
					onChange={(value) => setDraftField("statusId", value)}
					triggerClassName="w-full justify-between"
					createOptionLabel={(value) => `Create status "${value}"`}
					onCreateOption={onCreateStatus}
					placeholder={currentStatusName ? undefined : "Select status"}
				/>
			</td>
			<td className="px-3 py-3">
				<SelectDropdown
					value={draft.ownerEmployeeId ?? ""}
					options={employeeOptions}
					onChange={(value) => setDraftField("ownerEmployeeId", value || undefined)}
					triggerClassName="w-full justify-between"
					placeholder="Choose assignee"
				/>
				<p className="m-0 mt-1 text-[10px] uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
					{ownerName}
				</p>
			</td>
			<td className="px-3 py-3">
				<input
					type="date"
					className="w-full rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] px-2 py-[6px] text-sm text-[var(--vscode-foreground)]"
					value={formatDueDateInput(draft.dueAt)}
					onChange={(event) => setDraftField("dueAt", event.target.value)}
				/>
			</td>
			<td className="px-3 py-3">
				<VSCodeTextArea
					value={draft.description ?? ""}
					onInput={(event: any) => setDraftField("description", event.target.value as string)}
					rows={3}
					placeholder="Description"
					className="w-full"
				/>
			</td>
			<td className="px-3 py-3">
				<div className="flex items-center justify-end gap-2">
					<VSCodeButton
						appearance="icon"
						disabled={isStartDisabled}
						onClick={onStart}
						aria-label="Start action">
						<span className="codicon codicon-play" aria-hidden="true" />
					</VSCodeButton>
					<VSCodeButton appearance="icon" onClick={handleDelete} aria-label="Delete action">
						<span className="codicon codicon-trash" aria-hidden="true" />
					</VSCodeButton>
					<VSCodeButton appearance="icon" disabled={!isDirty} onClick={handleSave} aria-label="Save changes">
						<span className="codicon codicon-check" aria-hidden="true" />
					</VSCodeButton>
				</div>
			</td>
		</tr>
	)
}

interface CreateActionRowProps {
	draft: ActionItemDraft
	statusOptions: { value: string; label: string }[]
	employeeOptions: { value: string; label: string }[]
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
			<tr className="border-b border-[var(--vscode-panel-border)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] align-top">
				<td className="px-3 py-3" />
				<td className="px-3 py-3 text-[var(--vscode-descriptionForeground)]">New</td>
				<td className="px-3 py-3">
					<VSCodeTextField
						value={draft.title}
						onInput={(event: any) => onDraftChange((prev) => ({ ...prev, title: event.target.value }))}
						placeholder="Title"
						className="w-full"
					/>
				</td>
				<td className="px-3 py-3">
					<VSCodeDropdown
						value={draft.kind}
						onChange={(event: any) =>
							onDraftChange((prev) => ({ ...prev, kind: event.target.value as WorkplaceActionItemKind }))
						}>
						<VSCodeOption value="goal">Goal</VSCodeOption>
						<VSCodeOption value="project">Project</VSCodeOption>
						<VSCodeOption value="task">Task</VSCodeOption>
					</VSCodeDropdown>
				</td>
				<td className="px-3 py-3">
					<SelectDropdown
						value={draft.statusId}
						options={statusOptions}
						onChange={(value) => onDraftChange((prev) => ({ ...prev, statusId: value }))}
						triggerClassName="w-full justify-between"
						placeholder="Select status"
						onCreateOption={onCreateStatus}
						createOptionLabel={(value) => `Create status "${value}"`}
					/>
				</td>
				<td className="px-3 py-3">
					<SelectDropdown
						value={draft.ownerEmployeeId}
						options={employeeOptions}
						onChange={(value) => onDraftChange((prev) => ({ ...prev, ownerEmployeeId: value }))}
						triggerClassName="w-full justify-between"
						placeholder="Choose assignee"
					/>
				</td>
				<td className="px-3 py-3">
					<input
						type="date"
						className="w-full rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] px-2 py-[6px] text-sm text-[var(--vscode-foreground)]"
						value={formatDueDateInput(draft.dueAt)}
						onChange={(event) => onDraftChange((prev) => ({ ...prev, dueAt: event.target.value }))}
					/>
				</td>
				<td className="px-3 py-3">
					<VSCodeTextArea
						value={draft.description}
						onInput={(event: any) =>
							onDraftChange((prev) => ({ ...prev, description: event.target.value }))
						}
						rows={3}
						placeholder="Description"
						className="w-full"
					/>
				</td>
				<td className="px-3 py-3">
					<div className="flex items-center justify-end gap-2">
						<VSCodeButton appearance="secondary" onClick={onCancel}>
							Cancel
						</VSCodeButton>
						<VSCodeButton appearance="primary" onClick={onCreate}>
							Create
						</VSCodeButton>
					</div>
				</td>
			</tr>
			{createError && (
				<tr>
					<td colSpan={9} className="px-3 pb-3 text-xs text-[var(--vscode-errorForeground)]">
						{createError}
					</td>
				</tr>
			)}
		</>
	)
}

export default ActionWorkspaceView
