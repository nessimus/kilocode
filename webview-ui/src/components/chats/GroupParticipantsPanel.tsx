import React, { useCallback, useEffect, useMemo, useState } from "react"

import { VSCodeButton, VSCodeDropdown, VSCodeOption, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import type { WorkplaceEmployee } from "@roo/golden/workplace"

import { cn } from "@/lib/utils"
import { StandardTooltip } from "@/components/ui"

interface GroupParticipantsPanelProps {
	employees: WorkplaceEmployee[]
	selectedIds: string[]
	activeSpeakerId?: string
	onToggleParticipant: (employeeId: string) => void
	onAddParticipant?: (employeeId: string, alias?: string) => void
	onRemoveParticipant?: (employeeId: string) => void
	onAliasChange?: (employeeId: string, alias: string) => void
	aliasById?: Record<string, string>
	mutedIds?: string[]
	priorityIds?: string[]
	onToggleMute?: (employeeId: string) => void
	onTogglePriority?: (employeeId: string) => void
}

const PARTICIPANTS_MAX_HEIGHT = 320

export const GroupParticipantsPanel: React.FC<GroupParticipantsPanelProps> = ({
	employees,
	selectedIds,
	activeSpeakerId,
	onToggleParticipant,
	onAddParticipant,
	onRemoveParticipant,
	onAliasChange,
	aliasById,
	mutedIds = [],
	priorityIds = [],
	onToggleMute,
	onTogglePriority,
}) => {
	const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
	const mutedSet = useMemo(() => new Set(mutedIds), [mutedIds])
	const prioritySet = useMemo(() => new Set(priorityIds), [priorityIds])

	const selectedEmployees = useMemo(
		() =>
			selectedIds
				.map((id) => employees.find((employee) => employee.id === id))
				.filter((employee): employee is WorkplaceEmployee => Boolean(employee)),
		[employees, selectedIds],
	)

	const availableEmployees = useMemo(
		() => employees.filter((employee) => !selectedSet.has(employee.id)),
		[employees, selectedSet],
	)

	const [pendingAgentId, setPendingAgentId] = useState<string>(() => availableEmployees[0]?.id ?? "")
	const [pendingAlias, setPendingAlias] = useState<string>("")

	useEffect(() => {
		if (!pendingAgentId || !availableEmployees.some((employee) => employee.id === pendingAgentId)) {
			setPendingAgentId(availableEmployees[0]?.id ?? "")
		}
	}, [availableEmployees, pendingAgentId])

	const resetPendingAgent = useCallback(() => {
		const [firstAvailable] = availableEmployees.filter((employee) => employee.id !== pendingAgentId)
		setPendingAgentId(firstAvailable?.id ?? "")
		setPendingAlias("")
	}, [availableEmployees, pendingAgentId])

	const handleAddParticipant = useCallback(() => {
		if (!pendingAgentId) {
			return
		}

		const alias = pendingAlias.trim()

		if (typeof onAddParticipant === "function") {
			onAddParticipant(pendingAgentId, alias || undefined)
		} else {
			onToggleParticipant(pendingAgentId)
		}

		if (alias && typeof onAliasChange === "function") {
			onAliasChange(pendingAgentId, alias)
		}

		resetPendingAgent()
	}, [pendingAgentId, pendingAlias, onAddParticipant, onToggleParticipant, onAliasChange, resetPendingAgent])

	const handleRemoveParticipant = useCallback(
		(employeeId: string) => {
			if (typeof onRemoveParticipant === "function") {
				onRemoveParticipant(employeeId)
			} else {
				onToggleParticipant(employeeId)
			}
		},
		[onRemoveParticipant, onToggleParticipant],
	)

	const orderedEmployees = useMemo(() => {
		return selectedEmployees.slice().sort((a, b) => {
			const aPriority = prioritySet.has(a.id) ? 1 : 0
			const bPriority = prioritySet.has(b.id) ? 1 : 0
			if (aPriority !== bPriority) {
				return bPriority - aPriority
			}
			return a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
		})
	}, [prioritySet, selectedEmployees])

	const rosterIsEmpty = orderedEmployees.length === 0

	return (
		<div className="group-participants-panel flex flex-col gap-4 rounded-xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_42%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] p-4">
			<header className="flex items-center justify-between gap-2">
				<div className="flex flex-col">
					<span className="text-[11px] font-semibold uppercase tracking-wide text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_86%,transparent)]">
						Roster
					</span>
					<span className="text-xs text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
						Select who participates in the thread.
					</span>
				</div>
				<span className="inline-flex min-w-[32px] justify-center rounded-full bg-[color-mix(in_srgb,var(--vscode-focusBorder)_20%,transparent)] px-3 py-[3px] text-[11px] font-semibold text-vscode-foreground">
					{selectedIds.length}
				</span>
			</header>

			<section className="flex flex-col gap-3">
				<div
					className="flex max-h-[320px] flex-col gap-2 overflow-y-auto pr-1"
					style={{ maxHeight: `${PARTICIPANTS_MAX_HEIGHT}px` }}>
					{rosterIsEmpty ? (
						<div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--vscode-panel-border)_45%,transparent)] py-8 text-center text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_70%,transparent)]">
							<span className="text-sm font-medium">No participants yet</span>
							<span className="text-xs">
								Add at least one teammate so the orchestrator has voices to call on.
							</span>
						</div>
					) : (
						orderedEmployees.map((employee) => {
							const displayName = aliasById?.[employee.id] ?? employee.name
							const isSpeaker = activeSpeakerId === employee.id
							const isMuted = mutedSet.has(employee.id)
							const isPriority = prioritySet.has(employee.id)

							return (
								<div
									key={employee.id}
									className={cn(
										"group flex items-start justify-between gap-3 rounded-lg border px-3 py-3 transition",
										isSpeaker
											? "border-[color-mix(in_srgb,var(--vscode-focusBorder)_70%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,transparent)] shadow-[0_8px_18px_rgba(0,0,0,0.24)]"
											: "border-[color-mix(in_srgb,var(--vscode-panel-border)_55%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] hover:border-[color-mix(in_srgb,var(--vscode-panel-border)_65%,transparent)] hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_97%,transparent)]",
									)}>
									<div className="flex items-center gap-3">
										<span className="flex h-10 w-10 items-center justify-center rounded-md border border-[color-mix(in_srgb,var(--vscode-panel-border)_45%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] text-base font-semibold uppercase text-vscode-foreground">
											{employee.name?.[0]?.toUpperCase() ?? "?"}
										</span>
										<div className="flex flex-col">
											<span className="text-sm font-semibold text-vscode-foreground">
												{displayName}
											</span>
											<div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)]">
												{employee.role ? <span>{employee.role}</span> : null}
												{isSpeaker ? (
													<StandardTooltip content="Active speaker">
														<span className="rounded-sm bg-[color-mix(in_srgb,var(--vscode-focusBorder)_28%,transparent)] px-1 py-[2px] text-[9px] font-semibold text-vscode-foreground">
															Responding
														</span>
													</StandardTooltip>
												) : null}
												{isMuted ? (
													<span className="rounded-sm border border-[color-mix(in_srgb,var(--vscode-panel-border)_55%,transparent)] px-1 py-[2px] text-[9px] font-semibold">
														Muted
													</span>
												) : null}
												{isPriority ? (
													<span className="rounded-sm border border-[color-mix(in_srgb,var(--vscode-panel-border)_55%,transparent)] px-1 py-[2px] text-[9px] font-semibold">
														Priority
													</span>
												) : null}
											</div>
										</div>
									</div>
									<div className="inline-flex items-center gap-1">
										{typeof onToggleMute === "function" ? (
											<StandardTooltip content={mutedSet.has(employee.id) ? "Unmute" : "Mute"}>
												<button
													type="button"
													className={cn(
														"rounded-md border border-transparent p-1 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_82%,transparent)] transition",
														mutedSet.has(employee.id)
															? "bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] text-[color-mix(in_srgb,var(--vscode-focusBorder)_80%,transparent)]"
															: "hover:border-[color-mix(in_srgb,var(--vscode-panel-border)_55%,transparent)] hover:text-vscode-foreground",
													)}
													onClick={(event) => {
														event.stopPropagation()
														onToggleMute(employee.id)
													}}>
													<span
														className={`codicon ${mutedSet.has(employee.id) ? "codicon-mic-off" : "codicon-mic"}`}
														aria-hidden="true"
													/>
												</button>
											</StandardTooltip>
										) : null}
										{typeof onTogglePriority === "function" ? (
											<StandardTooltip
												content={
													prioritySet.has(employee.id) ? "Lower priority" : "Boost priority"
												}>
												<button
													type="button"
													className={cn(
														"rounded-md border border-transparent p-1 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_82%,transparent)] transition",
														prioritySet.has(employee.id)
															? "bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] text-[color-mix(in_srgb,var(--vscode-focusBorder)_80%,transparent)]"
															: "hover:border-[color-mix(in_srgb,var(--vscode-panel-border)_55%,transparent)] hover:text-vscode-foreground",
													)}
													onClick={(event) => {
														event.stopPropagation()
														onTogglePriority(employee.id)
													}}>
													<span
														className={`codicon ${prioritySet.has(employee.id) ? "codicon-flame" : "codicon-rocket"}`}
														aria-hidden="true"
													/>
												</button>
											</StandardTooltip>
										) : null}
										<button
											type="button"
											className="rounded-md border border-transparent p-1 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_82%,transparent)] transition hover:border-[color-mix(in_srgb,var(--vscode-panel-border)_55%,transparent)] hover:text-vscode-foreground"
											onClick={(event) => {
												event.stopPropagation()
												handleRemoveParticipant(employee.id)
											}}>
											<span className="codicon codicon-close" aria-hidden="true" />
										</button>
									</div>
								</div>
							)
						})
					)}
				</div>

				<div className="flex flex-col gap-2 rounded-lg border border-[color-mix(in_srgb,var(--vscode-panel-border)_55%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] p-3">
					<span className="text-[11px] font-semibold uppercase tracking-wide text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_78%,transparent)]">
						Add participant
					</span>
					<div className="flex flex-col gap-2">
						<VSCodeDropdown
							value={pendingAgentId}
							disabled={!availableEmployees.length}
							onChange={(event: any) => {
								const nextValue = typeof event?.target?.value === "string" ? event.target.value : ""
								setPendingAgentId(nextValue)
							}}>
							{availableEmployees.length === 0 ? (
								<VSCodeOption value="" disabled>
									Everyone is already in this chat
								</VSCodeOption>
							) : (
								availableEmployees.map((employee) => (
									<VSCodeOption key={employee.id} value={employee.id}>
										{employee.name}
									</VSCodeOption>
								))
							)}
						</VSCodeDropdown>
						<VSCodeTextField
							placeholder="Alias (optional)"
							value={pendingAlias}
							onInput={(event: any) => {
								setPendingAlias(event?.target?.value ?? "")
							}}
						/>
						<VSCodeButton
							type="button"
							appearance="primary"
							disabled={!pendingAgentId}
							onClick={handleAddParticipant}>
							<span className="codicon codicon-add" aria-hidden="true" />
							<span className="ml-1">Add to roster</span>
						</VSCodeButton>
					</div>
				</div>
			</section>
		</div>
	)
}

export default GroupParticipantsPanel
