import React from "react"

import type { WorkplaceEmployee } from "@roo/golden/workplace"

import { cn } from "@/lib/utils"

interface GroupParticipantsPanelProps {
	employees: WorkplaceEmployee[]
	selectedIds: string[]
	activeSpeakerId?: string
	onToggleParticipant: (employeeId: string) => void
	onSetSpeaker: (employeeId: string) => void
	onInsertMention: (employeeId: string) => void
}

export const GroupParticipantsPanel: React.FC<GroupParticipantsPanelProps> = ({
	employees,
	selectedIds,
	activeSpeakerId,
	onToggleParticipant,
	onSetSpeaker,
	onInsertMention,
}) => {
	if (!employees.length) {
		return null
	}

	const selectedSet = new Set(selectedIds)

	return (
		<div className="flex flex-col gap-3 rounded-md border border-vscode-panel-border bg-vscode-panel-background/60 p-3">
			<div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-vscode-descriptionForeground">
				<span>Group Participants</span>
				<span>{selectedIds.length}</span>
			</div>
			<ul className="flex flex-col gap-2">
				{employees.map((employee) => {
					const isSelected = selectedSet.has(employee.id)
					const isSpeaker = activeSpeakerId === employee.id

					return (
						<li key={employee.id} className="flex items-center justify-between gap-2">
							<button
								onClick={() => onToggleParticipant(employee.id)}
								className={cn(
									"flex flex-1 items-center gap-2 rounded border px-2 py-1 text-left text-sm transition",
									isSelected
										? "border-vscode-focusBorder/70 bg-vscode-editor-background text-vscode-foreground"
										: "border-transparent bg-transparent text-vscode-descriptionForeground hover:border-vscode-panel-border hover:bg-vscode-editor-background/40 hover:text-vscode-foreground",
								)}>
								<span className="inline-flex h-5 w-5 items-center justify-center rounded-sm border border-vscode-panel-border bg-vscode-editor-background text-[10px] font-semibold">
									{employee.name?.[0]?.toUpperCase() ?? "?"}
								</span>
								<span className="flex flex-1 flex-col leading-tight">
									<span className="text-sm font-medium text-vscode-foreground">{employee.name}</span>
									{employee.role && (
										<span className="text-[11px] text-vscode-descriptionForeground">{employee.role}</span>
									)}
								</span>
							</button>
							<div className="flex items-center gap-1">
								<button
									onClick={() => onInsertMention(employee.id)}
									className="rounded border border-vscode-panel-border px-2 py-1 text-[11px] text-vscode-descriptionForeground transition hover:border-vscode-focusBorder hover:text-vscode-foreground">
									Mention
								</button>
								<button
									onClick={() => onSetSpeaker(employee.id)}
									className={cn(
										"rounded border px-2 py-1 text-[11px] transition",
										isSpeaker
											? "border-vscode-focusBorder bg-vscode-button-background text-vscode-button-foreground"
											: "border-vscode-panel-border text-vscode-descriptionForeground hover:border-vscode-focusBorder hover:text-vscode-foreground",
									)}>
									{isSpeaker ? "Speaker" : "Set speaker"}
								</button>
							</div>
						</li>
					)
				})}
			</ul>
		</div>
	)
}

export default GroupParticipantsPanel
