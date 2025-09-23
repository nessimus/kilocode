import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { VSCodeButton, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"

import type { HubAgentBlueprint, HubRoom, HubFollowUpSuggestion } from "@roo/hub"
import type { WorkplaceEmployee } from "@roo/golden/workplace"
import type { SuggestionItem } from "@roo-code/types"

import { useExtensionState } from "@/context/ExtensionStateContext"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { cn } from "@/lib/utils"
import { vscode } from "@/utils/vscode"
import { ChatTextArea } from "@/components/chat/ChatTextArea"
import { FollowUpSuggest } from "@/components/chat/FollowUpSuggest"
import { StandardTooltip } from "@/components/ui"
import HubEmployeeManager from "./HubEmployeeManager"
import HubIntegrationsView from "./HubIntegrationsView"

import styles from "./HubView.module.css"

interface HubViewProps {
	isHidden: boolean
	targetSection?: string
}

const MAX_RECENT_MESSAGES = 200
const HUB_COMPOSER_BOTTOM_OFFSET_PX = 56
const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().includes("MAC")

const panelToggleButtonClass =
	"inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-vscode-descriptionForeground hover:text-vscode-foreground hover:border-vscode-panel-border hover:bg-[rgba(255,255,255,0.06)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder"

const floatingToggleButtonClass =
	"absolute z-20 inline-flex h-9 w-9 items-center justify-center rounded-md border border-vscode-panel-border bg-[rgba(21,22,27,0.9)] text-vscode-descriptionForeground hover:text-vscode-foreground hover:bg-[rgba(21,22,27,0.98)] shadow-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder"

export const HubView: React.FC<HubViewProps> = ({ isHidden, targetSection }) => {
	const {
		hubSnapshot,
		createHubRoom,
		setActiveHubRoom,
		sendHubMessage,
		addHubAgent,
		removeHubParticipant,
		updateHubSettings,
		workplaceState,
		mode,
		setMode,
	} = useExtensionState()
	const { t } = useAppTranslation()

	const [composerValue, setComposerValue] = useState("")
	const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>(undefined)
	const [agentDisplayName, setAgentDisplayName] = useState("")
	const [showRoomsSidebar, setShowRoomsSidebar] = useState(true)
	const [showTeamSidebar, setShowTeamSidebar] = useState(true)
	const [selectedImages, setSelectedImages] = useState<string[]>([])

	const messageListRef = useRef<HTMLDivElement | null>(null)
	const selectImages = useCallback(() => vscode.postMessage({ type: "selectImages" }), [])
	const shouldDisableImages = true
	const modeShortcutText = useMemo(
		() =>
			`${isMac ? "⌘" : "Ctrl"} + . ${t("chat:forNextMode")}, ${isMac ? "⌘" : "Ctrl"} + Shift + . ${t("chat:forPreviousMode")}`,
		[t],
	)
	const handleComposerHeightChange = useCallback(() => {
		if (!messageListRef.current) {
			return
		}
		messageListRef.current.scrollTop = messageListRef.current.scrollHeight
	}, [])

	if (targetSection === "integrations") {
		return (
			<div
				data-testid="hub-view"
				className={cn(
					"golden-hub-root fixed inset-0 flex overflow-hidden bg-vscode-editor-background text-vscode-editor-foreground",
					isHidden && "hidden",
				)}>
				<HubIntegrationsView />
			</div>
		)
	}

	const rooms = useMemo(() => hubSnapshot?.rooms ?? [], [hubSnapshot?.rooms])
	const fallbackRoomId = rooms[0]?.id
	const activeRoomId = hubSnapshot?.activeRoomId ?? fallbackRoomId
	const activeRoom = useMemo<HubRoom | undefined>(
		() => rooms.find((room) => room.id === activeRoomId),
		[rooms, activeRoomId],
	)

	useEffect(() => {
		if (!hubSnapshot?.activeRoomId && fallbackRoomId) {
			setActiveHubRoom(fallbackRoomId)
		}
	}, [hubSnapshot?.activeRoomId, fallbackRoomId, setActiveHubRoom])

	const companies = useMemo(() => workplaceState?.companies ?? [], [workplaceState?.companies])
	const activeCompanyId = workplaceState?.activeCompanyId
	const activeCompany = useMemo(() => {
		if (!companies.length) {
			return undefined
		}
		if (activeCompanyId) {
			return companies.find((company) => company.id === activeCompanyId) ?? companies[0]
		}
		return companies[0]
	}, [companies, activeCompanyId])
	const employees = useMemo(() => activeCompany?.employees ?? [], [activeCompany?.employees])
	const availableEmployees = useMemo(() => {
		if (!employees.length) {
			return []
		}
		if (!activeRoom) {
			return employees
		}
		const assignedEmployeeIds = new Set(
			activeRoom.participants
				.filter((participant) => participant.type === "agent")
				.map((participant) => participant.persona?.employeeId)
				.filter((id): id is string => Boolean(id)),
		)
		return employees.filter((employee) => !assignedEmployeeIds.has(employee.id))
	}, [employees, activeRoom])

	useEffect(() => {
		if (!availableEmployees.length) {
			setSelectedEmployeeId(undefined)
			return
		}
		setSelectedEmployeeId((previous) => {
			if (previous && availableEmployees.some((employee) => employee.id === previous)) {
				return previous
			}
			return availableEmployees[0]?.id
		})
	}, [availableEmployees])

	const toBlueprint = (employee: WorkplaceEmployee): HubAgentBlueprint => {
		const personaMode = employee.personaMode
		const summary = personaMode?.summary ?? employee.role ?? "AI Teammate"
		const defaultInstructions = employee.personality
			? `Adopt the following persona traits: ${employee.personality}.`
			: (employee.description ?? undefined)
		const baseModeSlug = personaMode?.baseModeSlug ?? "code"
		return {
			displayName: employee.name,
			mode: baseModeSlug,
			persona: {
				employeeId: employee.id,
				summary,
				instructions: personaMode?.instructions ?? defaultInstructions,
				baseModeSlug,
				role: employee.role,
				personality: employee.personality,
				mbtiType: employee.mbtiType,
				customAttributes: employee.customAttributes,
			},
		}
	}

	const followUps = activeRoom?.followUps ?? []
	const followUpSuggestionItems = useMemo<SuggestionItem[]>(
		() =>
			followUps.map((suggestion) => ({
				answer: `@${suggestion.displayName}, ${t("common:hub.followUpAction", { defaultValue: "could you share your perspective?" })}`,
			})),
		[followUps, t],
	)

	const isRoomStreaming = Boolean(activeRoom?.messages.some((message) => message.status === "streaming"))

	const handleFollowUpClick = useCallback(
		(suggestion: SuggestionItem | HubFollowUpSuggestion) => {
			if (!activeRoom) {
				return
			}

			if ("agentId" in suggestion) {
				vscode.postMessage({ type: "hubTriggerAgent", hubRoomId: activeRoom.id, agentId: suggestion.agentId })
				return
			}

			sendHubMessage(activeRoom.id, suggestion.answer)
		},
		[activeRoom, sendHubMessage],
	)

	const handleSend = () => {
		if (!activeRoom) {
			return
		}
		const trimmed = composerValue.trim()
		if (!trimmed && selectedImages.length === 0) {
			return
		}
		sendHubMessage(activeRoom.id, trimmed)
		setComposerValue("")
		setSelectedImages([])
	}

	const handleCreateRoom = () => {
		const initialEmployees = employees.slice(0, 3)
		const blueprints = initialEmployees.map(toBlueprint)
		const title = activeCompany?.name
		createHubRoom(title ? `${title} Hub` : undefined, {
			autonomous: false,
			participants: blueprints.length ? blueprints : undefined,
		})
	}

	const handleAddAgent = () => {
		if (!activeRoom || !selectedEmployeeId) {
			return
		}

		const employee = employees.find((entry) => entry.id === selectedEmployeeId)
		if (!employee) {
			return
		}

		const agentName = agentDisplayName.trim() || employee.name
		const blueprint: HubAgentBlueprint = {
			...toBlueprint(employee),
			displayName: agentName,
		}

		addHubAgent(activeRoom.id, blueprint)
		setAgentDisplayName("")
	}

	const handleToggleAutonomous = (room: HubRoom) => {
		updateHubSettings(room.id, { autonomous: !room.settings.autonomous })
	}

	const composerSendDisabled = !activeRoom || (!composerValue.trim() && selectedImages.length === 0)

	const composerBottomOffset = useMemo(
		() => `calc(${HUB_COMPOSER_BOTTOM_OFFSET_PX}px + env(safe-area-inset-bottom, 0px))`,
		[],
	)

	const handleStopRoom = useCallback(() => {
		if (!activeRoomId) {
			return
		}

		vscode.postMessage({ type: "hubStop", hubRoomId: activeRoomId })
	}, [activeRoomId])

	const hideRoomsLabel = t("common:hub.hideRooms", { defaultValue: "Hide Rooms" }) as string
	const showRoomsLabel = t("common:hub.showRooms", { defaultValue: "Show Rooms" }) as string
	const hideTeamLabel = t("common:hub.hideTeam", { defaultValue: "Hide Team" }) as string
	const showTeamLabel = t("common:hub.showTeam", { defaultValue: "Show Team" }) as string

	return (
		<div
			data-testid="hub-view"
			className={cn(
				"golden-hub-root fixed inset-0 flex overflow-hidden bg-vscode-editor-background text-vscode-editor-foreground",
				isHidden && "hidden",
			)}>
			{!showRoomsSidebar && (
				<StandardTooltip content={showRoomsLabel}>
					<button
						type="button"
						onClick={() => setShowRoomsSidebar(true)}
						className={cn(floatingToggleButtonClass, "left-4 top-4")}
						aria-label={showRoomsLabel}>
						<span className="codicon codicon-layout-sidebar-left" />
					</button>
				</StandardTooltip>
			)}
			{!showTeamSidebar && (
				<StandardTooltip content={showTeamLabel}>
					<button
						type="button"
						onClick={() => setShowTeamSidebar(true)}
						className={cn(floatingToggleButtonClass, "top-4 right-4")}
						aria-label={showTeamLabel}>
						<span className="codicon codicon-layout-sidebar-right" />
					</button>
				</StandardTooltip>
			)}

			{showRoomsSidebar ? (
				<div className="w-64 border-r border-vscode-panel-border bg-vscode-sideBar overflow-auto leading-5">
					<div className="p-3 flex flex-col gap-3">
						<div className="flex items-center justify-between gap-2">
							<h2 className="text-xs uppercase tracking-wider text-vscode-sideBarTitle-foreground opacity-70">
								{t("common:hub.rooms", { defaultValue: "Agent Rooms" })}
							</h2>
							<StandardTooltip content={hideRoomsLabel}>
								<button
									type="button"
									onClick={() => setShowRoomsSidebar(false)}
									className={panelToggleButtonClass}
									aria-label={hideRoomsLabel}>
									<span className="codicon codicon-chevron-left" />
								</button>
							</StandardTooltip>
						</div>
						<VSCodeButton
							appearance="secondary"
							onClick={handleCreateRoom}
							disabled={employees.length === 0}
							title={
								employees.length === 0
									? t("common:hub.addEmployeesFirst", {
											defaultValue:
												"Add employees to your workspace before starting a hub session.",
										})
									: undefined
							}>
							<span className="codicon codicon-add mr-1" />
							{t("common:hub.newRoom", { defaultValue: "New Session" })}
						</VSCodeButton>
					</div>
					<ul className="px-2 pb-2 flex flex-col gap-1">
						{rooms.map((room) => {
							const isActive = room.id === activeRoomId
							return (
								<li key={room.id}>
									<button
										onClick={() => setActiveHubRoom(room.id)}
										className={cn(
											"w-full text-left px-3 py-2 rounded-sm transition-colors",
											isActive
												? "bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground"
												: "hover:bg-vscode-list-hoverBackground",
										)}>
										<div className="font-semibold text-sm truncate">{room.title}</div>
										<div className="text-xs opacity-70 truncate">
											{room.participants
												.filter((participant) => participant.type === "agent")
												.map((participant) => participant.displayName)
												.join(", ") ||
												(t("common:hub.noAgents", { defaultValue: "No agents yet" }) as string)}
										</div>
									</button>
								</li>
							)
						})}
						{rooms.length === 0 && (
							<li className="px-3 text-xs opacity-70">
								{t("common:hub.empty", {
									defaultValue: "Create a room to begin your collaborative session.",
								})}
							</li>
						)}
					</ul>
				</div>
			) : null}

			<div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-vscode-editor-background">
				{activeRoom ? (
					<>
						<header className="border-b border-vscode-panel-border px-4 py-3 flex items-center justify-between gap-2">
							<div>
								<h1 className="text-base font-semibold">{activeRoom.title}</h1>
								<div className="text-xs opacity-70">
									{t("common:hub.participants", { defaultValue: "Participants" })}:{" "}
									{activeRoom.participants.length}
								</div>
							</div>
							<div className="flex items-center gap-2 flex-wrap">
								<VSCodeButton
									appearance={activeRoom.settings.autonomous ? "primary" : "secondary"}
									onClick={() => handleToggleAutonomous(activeRoom)}>
									<span
										className={cn(
											"codicon",
											activeRoom.settings.autonomous ? "codicon-sparkle" : "codicon-sparkle",
										)}></span>
									{activeRoom.settings.autonomous
										? t("common:hub.autonomousOn", { defaultValue: "Autonomous On" })
										: t("common:hub.autonomousOff", { defaultValue: "Autonomous Off" })}
								</VSCodeButton>
							</div>
						</header>

						<div className="flex flex-1 min-h-0">
							{showTeamSidebar ? (
								<aside className="w-60 border-r border-vscode-panel-border bg-vscode-input-background p-3 overflow-auto">
									<div className="mb-2 flex items-center justify-between gap-2">
										<h3 className="text-xs uppercase tracking-wide opacity-70">
											{t("common:hub.team", { defaultValue: "Team" })}
										</h3>
										<StandardTooltip content={hideTeamLabel}>
											<button
												type="button"
												onClick={() => setShowTeamSidebar(false)}
												className={panelToggleButtonClass}
												aria-label={hideTeamLabel}>
												<span className="codicon codicon-chevron-right" />
											</button>
										</StandardTooltip>
									</div>
									<ul className="flex flex-col gap-2">
										{activeRoom.participants.map((participant) => (
											<li
												key={participant.id}
												className="flex items-center justify-between gap-2">
												<div className="flex items-center gap-2">
													<span
														className={styles.avatar}
														style={{ backgroundColor: participant.color || "#64748B" }}>
														{participant.displayName.slice(0, 2).toUpperCase()}
													</span>
													<div>
														<div className="text-sm font-medium leading-none">
															{participant.displayName}
														</div>
														<div className="text-xs opacity-60">
															{participant.type === "agent"
																? participant.persona?.summary ||
																	participant.mode ||
																	"agent"
																: t("common:hub.human", { defaultValue: "human" })}
														</div>
													</div>
												</div>
												{participant.type === "agent" && (
													<button
														className="codicon codicon-trash text-xs opacity-70 hover:opacity-100"
														onClick={() =>
															removeHubParticipant(activeRoom.id, participant.id)
														}
														aria-label={
															t("common:hub.removeAgent", {
																defaultValue: "Remove agent",
															}) as string
														}
													/>
												)}
											</li>
										))}
									</ul>

									<div className="mt-4 flex flex-col gap-2">
										<h4 className="text-xs uppercase tracking-wide opacity-70">
											{t("common:hub.addAgent", { defaultValue: "Add Agent" })}
										</h4>
										<VSCodeDropdown
											value={selectedEmployeeId}
											onChange={(event: any) => setSelectedEmployeeId(event.target?.value)}
											disabled={!availableEmployees.length}>
											{availableEmployees.map((employee) => (
												<VSCodeOption key={employee.id} value={employee.id}>
													{employee.name}
												</VSCodeOption>
											))}
										</VSCodeDropdown>
										<input
											className="w-full px-2 py-1 text-sm bg-vscode-input-background border border-vscode-input-border focus:outline-none focus:border-vscode-focus-border"
											placeholder={
												t("common:hub.agentNamePlaceholder", {
													defaultValue: "Display name",
												}) ?? "Display name"
											}
											value={agentDisplayName}
											onChange={(event) => setAgentDisplayName(event.target.value)}
										/>
										<VSCodeButton
											appearance="primary"
											onClick={handleAddAgent}
											disabled={!selectedEmployeeId}>
											{t("common:hub.add", { defaultValue: "Add" })}
										</VSCodeButton>
										{!availableEmployees.length && (
											<p className="text-xs opacity-70">
												{employees.length === 0
													? t("common:hub.addEmployeesFirst", {
															defaultValue:
																"Add employees to your workspace before starting a hub session.",
														})
													: t("common:hub.noAvailableEmployees", {
															defaultValue:
																"Everyone from {{company}} is already in this room.",
															company: activeCompany?.name ?? "",
														})}
											</p>
										)}
									</div>
									<div className="mt-6">
										<HubEmployeeManager company={activeCompany} />
									</div>
								</aside>
							) : null}

							<main className="flex-1 flex flex-col min-h-0 min-w-0">
								<div
									ref={messageListRef}
									className="flex-1 overflow-auto px-6 pt-4 space-y-4"
									style={{ paddingBottom: composerBottomOffset }}>
									{activeRoom.messages.slice(-MAX_RECENT_MESSAGES).map((message, index, list) => {
										const participant = activeRoom.participants.find(
											(entry) => entry.id === message.participantId,
										)
										const isLastMessage = index === list.length - 1
										return (
											<div key={message.id} className="flex flex-col gap-1">
												<div className="text-xs uppercase tracking-wide opacity-60">
													{participant?.displayName ||
														t("common:hub.unknown", { defaultValue: "Unknown" })}
												</div>
												<div
													className={cn(
														styles.message,
														message.status === "error" && styles.messageError,
													)}
													style={{ borderLeftColor: participant?.color || "#818cf8" }}>
													{message.content ||
														(message.status === "streaming"
															? t("common:hub.generating", { defaultValue: "…thinking" })
															: "")}
													{message.status === "error" && message.error && (
														<div className="mt-1 text-xs opacity-70">{message.error}</div>
													)}
												</div>
												<div className="text-[10px] uppercase tracking-wider opacity-40">
													{new Date(message.updatedAt).toLocaleTimeString(undefined, {
														hour: "numeric",
														minute: "2-digit",
													})}
												</div>
												{isLastMessage && followUpSuggestionItems.length > 0 && (
													<div className="mt-3 border border-vscode-panel-border/60 rounded-sm bg-vscode-editor-background/80 p-3">
														<p className="text-xs uppercase tracking-wide opacity-70 mb-2">
															{t("common:hub.followUpPrompt", {
																defaultValue: "Suggested follow-ups",
															})}
														</p>
														<FollowUpSuggest
															key={`${message.id}-followups`}
															suggestions={followUpSuggestionItems}
															onSuggestionClick={(item) => handleFollowUpClick(item)}
															ts={message.updatedAt}
															onCancelAutoApproval={() => {}}
															isAnswered={false}
														/>
													</div>
												)}
											</div>
										)
									})}
									{activeRoom.messages.length === 0 && (
										<div className="text-sm opacity-70">
											{t("common:hub.noMessages", {
												defaultValue: "Introduce the topic or invite your agents to begin.",
											})}
										</div>
									)}
								</div>

								{followUps.length > 0 && (
									<div className="border-t border-vscode-panel-border bg-vscode-editor-background/95 px-6 py-3 space-y-2 shadow-inner">
										<p className="text-xs uppercase tracking-wide opacity-70">
											{t("common:hub.followUpPrompt", { defaultValue: "Suggested follow-ups" })}
										</p>
										<div className="flex flex-col gap-2">
											{followUps.map((suggestion) => (
												<VSCodeButton
													key={suggestion.id}
													onClick={() => handleFollowUpClick(suggestion)}
													appearance="secondary">
													{suggestion.prompt}
												</VSCodeButton>
											))}
										</div>
									</div>
								)}

								<footer
									className="border-t border-vscode-panel-border bg-vscode-editor-background/95 px-4 py-3 backdrop-blur-sm sticky bottom-0"
									style={{ bottom: composerBottomOffset }}>
									<ChatTextArea
										inputValue={composerValue}
										setInputValue={setComposerValue}
										sendingDisabled={composerSendDisabled}
										selectApiConfigDisabled
										placeholderText={
											t("common:hub.composePlaceholder", {
												defaultValue: "Share context or a new objective…",
											}) ?? "Share context or a new objective…"
										}
										selectedImages={selectedImages}
										setSelectedImages={setSelectedImages}
										onSend={handleSend}
										sendButtonState={isRoomStreaming ? "stop" : "send"}
										onStop={handleStopRoom}
										onSelectImages={selectImages}
										shouldDisableImages={shouldDisableImages}
										onHeightChange={handleComposerHeightChange}
										mode={mode}
										setMode={setMode}
										modeShortcutText={modeShortcutText}
									/>
								</footer>
							</main>
						</div>
					</>
				) : (
					<div className="flex flex-1 items-center justify-center text-sm opacity-70">
						{t("common:hub.noRoomSelected", {
							defaultValue: "Create or select a room to begin your collaborative session.",
						})}
					</div>
				)}
			</div>
		</div>
	)
}

export default HubView
