import React, { useMemo } from "react"

import type { WorkplaceEmployee } from "@roo/golden/workplace"

import { cn } from "@/lib/utils"
import { StandardTooltip } from "@/components/ui"

interface GroupParticipantsPanelProps {
	employees: WorkplaceEmployee[]
	selectedIds: string[]
	activeSpeakerId?: string
	onToggleParticipant: (employeeId: string) => void
	mutedIds?: string[]
	priorityIds?: string[]
	onToggleMute?: (employeeId: string) => void
	onTogglePriority?: (employeeId: string) => void
}

export const GroupParticipantsPanel: React.FC<GroupParticipantsPanelProps> = ({
	employees,
	selectedIds,
	activeSpeakerId,
	onToggleParticipant,
	mutedIds = [],
	priorityIds = [],
	onToggleMute,
	onTogglePriority,
}) => {
	if (!employees.length) {
		return null
	}

	const selectedSet = new Set(selectedIds)
	const mutedSet = useMemo(() => new Set(mutedIds), [mutedIds])
	const prioritySet = useMemo(() => new Set(priorityIds), [priorityIds])

	const orderedEmployees = useMemo(() => {
		return employees
			.slice()
			.sort((a, b) => {
				const aPriority = prioritySet.has(a.id) ? 1 : 0
				const bPriority = prioritySet.has(b.id) ? 1 : 0
				if (aPriority !== bPriority) {
					return bPriority - aPriority
				}
				const aSelected = selectedSet.has(a.id) ? 1 : 0
				const bSelected = selectedSet.has(b.id) ? 1 : 0
				if (aSelected !== bSelected) {
					return bSelected - aSelected
				}
				return a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
			})
	}, [employees, prioritySet, selectedSet])

	return (
		<div className="flex flex-col gap-3 rounded-xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_32%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] p-3">
			<div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-vscode-descriptionForeground">
				<span>Participants</span>
				<span className="rounded-full bg-[color-mix(in_srgb,var(--vscode-focusBorder)_20%,transparent)] px-2 py-[1px] text-[10px] font-medium text-vscode-foreground">
					{selectedIds.length}
				</span>
			</div>
			<ul className="flex flex-col gap-2 overflow-y-auto pr-1" style={{ maxHeight: "260px" }}>
				{orderedEmployees.map((employee) => {
					const isSelected = selectedSet.has(employee.id)
					const isSpeaker = activeSpeakerId === employee.id
					const isMuted = mutedSet.has(employee.id)
					const isPriority = prioritySet.has(employee.id)

					return (
						<li key={employee.id}>
							<button
								className={cn(
									"group flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left text-sm transition",
									isSelected
										? "border-vscode-focusBorder/70 bg-vscode-editor-background/80 text-vscode-foreground shadow-[0_8px_18px_rgba(0,0,0,0.18)]"
										: "border-transparent bg-transparent text-vscode-descriptionForeground hover:border-vscode-panel-border hover:bg-vscode-editor-background/40 hover:text-vscode-foreground",
								)}
									onClick={() => onToggleParticipant(employee.id)}
									type="button"
									aria-pressed={isSelected}
									aria-label={isSelected ? `Remove ${employee.name} from chat` : `Add ${employee.name} to chat`}>
								<span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color-mix(in_srgb,var(--vscode-panel-border)_45%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)] text-[11px] font-semibold uppercase">
									{employee.name?.[0]?.toUpperCase() ?? "?"}
								</span>
								<span className="flex flex-1 flex-col leading-tight text-left">
									<span className="text-sm font-medium text-vscode-foreground">
										{employee.name}
									</span>
									<div className="flex flex-wrap items-center gap-1 text-[10px] uppercase tracking-wide text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_85%,transparent)]">
										{employee.role && <span>{employee.role}</span>}
										{isSpeaker && (
											<StandardTooltip content="Currently responding">
												<span className="rounded-sm bg-[color-mix(in_srgb,var(--vscode-focusBorder)_28%,transparent)] px-1 py-[1px] text-[9px] font-semibold text-vscode-foreground">
													Responding
												</span>
											</StandardTooltip>
										)}
										{isMuted && <span className="rounded-sm border border-[color-mix(in_srgb,var(--vscode-panel-border)_55%,transparent)] px-1 py-[1px] text-[9px] font-semibold">Muted</span>}
										{isPriority && <span className="rounded-sm border border-[color-mix(in_srgb,var(--vscode-panel-border)_55%,transparent)] px-1 py-[1px] text-[9px] font-semibold">Priority</span>}
									</div>
								</span>
								<div className="flex items-center gap-1">
									{typeof onToggleMute === "function" && (
										<StandardTooltip content={isMuted ? "Unmute" : "Mute"}>
											<button
												type="button"
												className={cn(
													"rounded-md border border-transparent p-1 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)] transition",
													isMuted ? "bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] text-[color-mix(in_srgb,var(--vscode-focusBorder)_75%,transparent)]" : "hover:border-[color-mix(in_srgb,var(--vscode-panel-border)_55%,transparent)]"
												)}
												onClick={(event) => {
													event.stopPropagation()
													onToggleMute(employee.id)
												}}>
												<span className={`codicon ${isMuted ? "codicon-mic-off" : "codicon-mic"}`} aria-hidden="true" />
											</button>
										</StandardTooltip>
									)}
									{typeof onTogglePriority === "function" && (
										<StandardTooltip content={isPriority ? "Lower priority" : "Boost priority"}>
											<button
												type="button"
												className={cn(
													"rounded-md border border-transparent p-1 text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent)] transition",
													isPriority ? "bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] text-[color-mix(in_srgb,var(--vscode-focusBorder)_75%,transparent)]" : "hover:border-[color-mix(in_srgb,var(--vscode-panel-border)_55%,transparent)]"
												)}
												onClick={(event) => {
													event.stopPropagation()
													onTogglePriority(employee.id)
												}}>
												<span className={`codicon ${isPriority ? "codicon-flame" : "codicon-rocket"}`} aria-hidden="true" />
											</button>
										</StandardTooltip>
									)}
									{isSelected && (
										<span
											className="codicon codicon-check text-[color-mix(in_srgb,var(--vscode-focusBorder)_75%,transparent)]"
											aria-hidden="true"></span>
									)}
								</div>
							</button>
						</li>
					)
				})}
			</ul>
		</div>
	)
}

export default GroupParticipantsPanel
