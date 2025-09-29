import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { useDeepCompareEffect, useEvent, useMount } from "react-use"
import debounce from "debounce"
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso"
import removeMd from "remove-markdown"
import {
	VSCodeButton,
	VSCodeDropdown,
	VSCodeOption,
	VSCodeTextArea,
} from "@vscode/webview-ui-toolkit/react"
import useSound from "use-sound"
import { LRUCache } from "lru-cache"
import { useTranslation } from "react-i18next"

import { useDebounceEffect } from "@src/utils/useDebounceEffect"
import { appendImages } from "@src/utils/imageUtils"

import type { ClineAsk, ClineMessage, HistoryItem, McpServerUse } from "@roo-code/types"
import { type WorkplaceDepartment, type WorkplaceEmployee, type WorkplaceTeam } from "@roo/golden/workplace"

import { ClineSayBrowserAction, ClineSayTool, ExtensionMessage } from "@roo/ExtensionMessage"
import { McpServer, McpTool } from "@roo/mcp"
import { findLast } from "@roo/array"
import { FollowUpData, SuggestionItem } from "@roo-code/types"
import { combineApiRequests } from "@roo/combineApiRequests"
import { combineCommandSequences } from "@roo/combineCommandSequences"
import { getApiMetrics } from "@roo/getApiMetrics"
import { AudioType } from "@roo/WebviewMessage"
import { getAllModes } from "@roo/modes"
import { ProfileValidator } from "@roo/ProfileValidator"
import { getLatestTodo } from "@roo/todo"

import { vscode } from "@src/utils/vscode"
import {
	getCommandDecision,
	CommandDecision,
	findLongestPrefixMatch,
	parseCommand,
} from "@src/utils/command-validation"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { useSelectedModel } from "@src/components/ui/hooks/useSelectedModel"
// import RooHero from "@src/components/welcome/RooHero" // kilocode_change: unused
// import RooTips from "@src/components/welcome/RooTips" // kilocode_change: unused
// import RooCloudCTA from "@src/components/welcome/RooCloudCTA" // kilocode_change: unused
import { StandardTooltip } from "@src/components/ui"
import { useAutoApprovalState } from "@src/hooks/useAutoApprovalState"
import { useAutoApprovalToggles } from "@src/hooks/useAutoApprovalToggles"

// import VersionIndicator from "../common/VersionIndicator" // kilocode_change: unused
import Announcement from "../chat/Announcement"
import BrowserSessionRow from "../chat/BrowserSessionRow"
import ChatRow from "../chat/ChatRow"
import { ChatTextArea } from "../chat/ChatTextArea"
// import TaskHeader from "./TaskHeader"// kilocode_change
import KiloTaskHeader from "../kilocode/KiloTaskHeader" // kilocode_change
import BottomControls from "../kilocode/BottomControls" // kilocode_change
import SystemPromptWarning from "../chat/SystemPromptWarning"
import { showSystemNotification } from "@/kilocode/helpers" // kilocode_change
// import ProfileViolationWarning from "./ProfileViolationWarning" kilocode_change: unused
import { CheckpointWarning } from "../chat/CheckpointWarning"
import { QueuedMessages } from "../chat/QueuedMessages"
import GroupParticipantsPanel from "./GroupParticipantsPanel"
import TaskItem from "../history/TaskItem"

export interface ChatHubChatViewProps {
	isHidden: boolean
	showAnnouncement: boolean
	hideAnnouncement: () => void
}

export interface ChatHubChatViewRef {
	acceptInput: () => void
	focusInput: () => void // kilocode_change
}

export const MAX_IMAGES_PER_MESSAGE = 20 // This is the Anthropic limit.

const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0

const formatTimestamp = (date: Date) =>
	new Intl.DateTimeFormat(undefined, {
		weekday: "long",
		hour: "numeric",
		minute: "2-digit",
	}).format(date)

const ChatHubChatViewComponent: React.ForwardRefRenderFunction<ChatHubChatViewRef, ChatHubChatViewProps> = (
	{ isHidden, showAnnouncement, hideAnnouncement },
	ref,
) => {
	const isMountedRef = useRef(true)

	const [audioBaseUri] = useState(() => {
		const w = window as any
		return w.AUDIO_BASE_URI || ""
	})

	const { t } = useAppTranslation()
	const { t: tSettings } = useTranslation("settings")
	const modeShortcutText = `${isMac ? "⌘" : "Ctrl"} + . ${t("chat:forNextMode")}, ${isMac ? "⌘" : "Ctrl"} + Shift + . ${t("chat:forPreviousMode")}`

	const {
		clineMessages: messages,
		currentTaskItem,
		currentTaskTodos,
		taskHistory: _taskHistory,
		apiConfiguration,
		organizationAllowList,
		mcpServers,
		alwaysAllowBrowser,
		alwaysAllowReadOnly,
		alwaysAllowReadOnlyOutsideWorkspace,
		alwaysAllowWrite,
		alwaysAllowWriteOutsideWorkspace,
		alwaysAllowWriteProtected,
		alwaysAllowExecute,
		alwaysAllowMcp,
		allowedCommands,
		deniedCommands,
		writeDelayMs,
		followupAutoApproveTimeoutMs,
		mode,
		setMode,
		autoApprovalEnabled,
		alwaysAllowModeSwitch,
		alwaysAllowSubtasks,
		alwaysAllowFollowupQuestions,
		alwaysAllowUpdateTodoList,
		customModes,
		hasSystemPromptOverride,
		soundEnabled,
		soundVolume,
		// cloudIsAuthenticated, // kilocode_change
		messageQueue = [],
		conversationHoldState,
		conversationAgents = [],
		lastOrchestratorAnalysis,
		workplaceState,
		setActiveEmployee,
		selectCompany,
		updateCompany,
	} = useExtensionState()

	const messagesRef = useRef(messages)
	const missionStatusTimeoutRef = useRef<number | undefined>()

	useEffect(() => {
		messagesRef.current = messages
	}, [messages])

	useEffect(() => {
		return () => {
			if (missionStatusTimeoutRef.current) {
				window.clearTimeout(missionStatusTimeoutRef.current)
			}
		}
	}, [])

	const companies = useMemo(() => workplaceState?.companies ?? [], [workplaceState?.companies])
	const activeCompanyId = workplaceState?.activeCompanyId
	const activeCompany = useMemo(() => {
		if (!companies.length) {
			return undefined
		}
		return companies.find((company) => company.id === activeCompanyId) ?? companies[0]
	}, [companies, activeCompanyId])

	const supportingEmployees = useMemo(
		() => (activeCompany?.employees ?? []).filter((employee) => !employee.isExecutiveManager),
		[activeCompany],
	)

	const companyEmployees = useMemo(() => activeCompany?.employees ?? [], [activeCompany?.employees])
	const companyDepartments = useMemo(() => activeCompany?.departments ?? [], [activeCompany?.departments])
	const companyTeams = useMemo(() => activeCompany?.teams ?? [], [activeCompany?.teams])
	const sortedSupportingEmployees = useMemo(
		() =>
			supportingEmployees
				.slice()
				.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
		[supportingEmployees],
	)

	const hierarchyData = useMemo(() => {
		if (!activeCompany) {
			return {
				departments: [] as Array<
					WorkplaceDepartment & { teams: Array<WorkplaceTeam & { employees: WorkplaceEmployee[] }> }
				>,
				independentTeams: [] as Array<WorkplaceTeam & { employees: WorkplaceEmployee[] }>,
				unassignedEmployees: [] as WorkplaceEmployee[],
			}
		}

		const employeesById = new Map(companyEmployees.map((employee) => [employee.id, employee]))
		const teamsWithEmployees = (activeCompany.teams ?? []).map((team) => {
			const members = (team.employeeIds ?? [])
				.map((id) => employeesById.get(id))
				.filter((employee): employee is WorkplaceEmployee => Boolean(employee && !employee.isExecutiveManager))
				.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
			return { ...team, employees: members }
		})

		const assignedEmployeeIds = new Set<string>()
		teamsWithEmployees.forEach((team) => {
			team.employees.forEach((employee) => assignedEmployeeIds.add(employee.id))
		})

		const departmentsWithTeams = (activeCompany.departments ?? [])
			.map((department) => ({
				...department,
				teams: teamsWithEmployees.filter(
					(team) => (department.teamIds ?? []).includes(team.id) && team.employees.length > 0,
				),
			}))
			.filter((department) => department.teams.length > 0)

		const departmentTeamIds = new Set(
			departmentsWithTeams.flatMap((department) => department.teams.map((team) => team.id)),
		)

		const independentTeams = teamsWithEmployees.filter(
			(team) => !departmentTeamIds.has(team.id) && team.employees.length > 0,
		)

		const unassignedEmployees = companyEmployees
			.filter((employee) => !employee.isExecutiveManager && !assignedEmployeeIds.has(employee.id))
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))

		return {
			departments: departmentsWithTeams,
			independentTeams,
			unassignedEmployees,
		}
	}, [activeCompany, companyEmployees])

	const fallbackPersonaId = useMemo(() => {
		if (activeCompany?.activeEmployeeId) {
			return activeCompany.activeEmployeeId
		}
		if (workplaceState?.activeEmployeeId) {
			return workplaceState.activeEmployeeId
		}
		return companyEmployees[0]?.id
	}, [activeCompany?.activeEmployeeId, workplaceState?.activeEmployeeId, companyEmployees])
	const [localPersonaId, setLocalPersonaId] = useState<string | undefined>(fallbackPersonaId)
	useEffect(() => {
		setLocalPersonaId(fallbackPersonaId)
	}, [fallbackPersonaId])
	const displayPersonaId = localPersonaId ?? fallbackPersonaId
	const [groupParticipantIds, setGroupParticipantIds] = useState<string[]>(() =>
		displayPersonaId ? [displayPersonaId] : [],
	)
	const [mutedParticipantIds, setMutedParticipantIds] = useState<string[]>([])
	const [priorityParticipantIds, setPriorityParticipantIds] = useState<string[]>([])

	const activeParticipantIds = useMemo(() => {
		const validIds = new Set(companyEmployees.map((employee) => employee.id))
		const deduped = Array.from(new Set(groupParticipantIds.filter((id) => validIds.has(id))))
		if (displayPersonaId && !deduped.includes(displayPersonaId)) {
			deduped.unshift(displayPersonaId)
		}
		return deduped
	}, [companyEmployees, displayPersonaId, groupParticipantIds])

	const isGroupConversation = activeParticipantIds.length > 1
	const activePersona = useMemo(
		() => companyEmployees.find((employee) => employee.id === displayPersonaId),
		[companyEmployees, displayPersonaId],
	)
	const activeCompanyResolvedId = activeCompany?.id
	const hasCompanies = companies.length > 0
	const selectedCompanyId = activeCompanyResolvedId ?? (hasCompanies ? (companies[0]?.id ?? "") : "")
const hasPersonaOptions = !!(
	activeCompanyResolvedId &&
	companyEmployees.length > 0 &&
	displayPersonaId &&
	!isGroupConversation
)
const [resumeAgentId, setResumeAgentId] = useState<string>("")
const holdMode = conversationHoldState?.mode ?? "idle"
const isManualHoldActive = holdMode === "manual_hold"
const orchestratedPrimaryAgents = useMemo(() => {
	const idToAgent = new Map(conversationAgents.map((agent) => [agent.id, agent]))
	return (lastOrchestratorAnalysis?.primarySpeakers ?? []).map(
		(agent) => idToAgent.get(agent.id)?.name ?? agent.label ?? agent.id,
	)
}, [conversationAgents, lastOrchestratorAnalysis])
const holdBannerCopy = useMemo(() => {
	if (isManualHoldActive) {
		const agentList = orchestratedPrimaryAgents.length
			? orchestratedPrimaryAgents.join(", ")
			: t("chatsHub.hold.waitingParticipants", { defaultValue: "participants" })
		return t("chatsHub.hold.manual", {
			defaultValue: "Conversation paused. Queued responses from {{agents}}.",
			agents: agentList,
		})
	}
	if (holdMode === "ingest_hold") {
		return t("chatsHub.hold.ingest", {
			defaultValue: "Processing your message. Agents will resume shortly.",
		})
	}
	if (holdMode === "responding") {
		return t("chatsHub.hold.responding", {
			defaultValue: "Resuming orchestrated responses…",
		})
	}
	return undefined
}, [isManualHoldActive, orchestratedPrimaryAgents, holdMode, t])
useEffect(() => {
	if (!isManualHoldActive) {
		setResumeAgentId("")
	}
}, [isManualHoldActive])
const handleHoldToggle = useCallback(() => {
	if (isManualHoldActive) {
		vscode.postMessage({
			type: "conversationHold",
			conversationHoldState: { mode: "idle", initiatedBy: "user" },
		})
		vscode.postMessage({
			type: "conversationQueueRelease",
			queueReleaseRequest: { flushAll: true },
		})
		return
	}
	vscode.postMessage({
		type: "conversationHold",
		conversationHoldState: { mode: "manual_hold", initiatedBy: "user" },
	})
}, [isManualHoldActive])
const handleResumeWith = useCallback(() => {
	vscode.postMessage({
		type: "conversationQueueRelease",
		queueReleaseRequest: resumeAgentId ? { agentIds: [resumeAgentId] } : { flushAll: true },
	})
	vscode.postMessage({
		type: "conversationHold",
		conversationHoldState: { mode: "idle", initiatedBy: "user" },
	})
	setResumeAgentId("")
}, [resumeAgentId])
const holdHintCopy = t("chatsHub.composer.hint", {
	defaultValue: "Your message pauses other participants until you finish.",
})
const recentChatHistory = useMemo(() => (_taskHistory ?? []).slice(0, 5) as HistoryItem[], [_taskHistory])

	useEffect(() => {
		const validIds = new Set(companyEmployees.map((employee) => employee.id))
		setGroupParticipantIds((prev) => {
			const deduped = Array.from(new Set(prev.filter((id) => validIds.has(id))))
			if (displayPersonaId && !deduped.includes(displayPersonaId)) {
				return [displayPersonaId, ...deduped]
			}
			if (!deduped.length && displayPersonaId) {
				return [displayPersonaId]
			}
			return deduped
		})
	}, [companyEmployees, displayPersonaId])

	useEffect(() => {
		if (!isGroupConversation) {
			setMutedParticipantIds([])
			setPriorityParticipantIds([])
		}
	}, [isGroupConversation])

	const handlePersonaChange = useCallback(
		(employeeId: string) => {
			if (!activeCompanyResolvedId || !employeeId || employeeId === displayPersonaId) {
				return
			}
			setLocalPersonaId(employeeId)
			setActiveEmployee(activeCompanyResolvedId, employeeId)
		},
		[activeCompanyResolvedId, displayPersonaId, setActiveEmployee],
	)

	const toggleGroupParticipant = useCallback(
		(employeeId: string) => {
			setGroupParticipantIds((prev) => {
				if (employeeId === displayPersonaId) {
					return prev
				}
				if (prev.includes(employeeId)) {
					return prev.filter((id) => id !== employeeId)
				}
				return [...prev, employeeId]
			})
		},
		[displayPersonaId],
	)

	const toggleParticipantMuteState = useCallback(
		(employeeId: string) => {
			setMutedParticipantIds((prev) => {
				if (prev.includes(employeeId)) {
					return prev.filter((id) => id !== employeeId)
				}
				return [...prev, employeeId]
			})
			vscode.postMessage({
				type: "conversationParticipantControl",
				payload: {
					participantId: employeeId,
					action: "toggleMute",
				},
			})
		},
		[],
	)

	const toggleParticipantPriorityState = useCallback(
		(employeeId: string) => {
			setPriorityParticipantIds((prev) => {
				if (prev.includes(employeeId)) {
					return prev.filter((id) => id !== employeeId)
				}
				return [...prev, employeeId]
			})
			vscode.postMessage({
				type: "conversationParticipantControl",
				payload: {
					participantId: employeeId,
					action: "togglePriority",
				},
			})
		},
		[],
	)

	const handleCompanyChange = useCallback(
		(companyId: string) => {
			if (!companyId || companyId === activeCompanyResolvedId) {
				return
			}
			setLocalPersonaId(undefined)
			selectCompany(companyId)
		},
		[activeCompanyResolvedId, selectCompany, setLocalPersonaId],
	)

	const brandMark = useMemo(() => {
		const companyName = activeCompany?.name?.trim()
		if (!companyName) {
			return "GW"
		}
		const parts = companyName
			.split(/\s+/)
			.map((segment) => segment.trim())
			.filter(Boolean)
		if (parts.length === 0) {
			return "GW"
		}
		const initials = parts
			.slice(0, 2)
			.map((segment) => segment[0]?.toUpperCase())
			.join("")
		return initials || "GW"
	}, [activeCompany?.name])

	const ownerProfile = useMemo(
		() => activeCompany?.ownerProfile ?? workplaceState?.ownerProfileDefaults,
		[activeCompany?.ownerProfile, workplaceState?.ownerProfileDefaults],
	)

	const ownerFirstName = useMemo(() => {
		const explicitFirstName = ownerProfile?.firstName?.trim()
		if (explicitFirstName) {
			return explicitFirstName
		}
		const name = ownerProfile?.name?.trim()
		if (!name) {
			return undefined
		}
		const [firstPart] = name
			.split(/\s+/)
			.map((segment) => segment.trim())
			.filter(Boolean)
		return firstPart
	}, [ownerProfile])
	const greetingName = ownerFirstName ?? t("kilocode:chat.welcomeFallbackName", { defaultValue: "friend" })
	const companySummary = activeCompany?.mission ?? activeCompany?.vision ?? t("kilocode:introText1")
	const [isAddMenuOpen, setIsAddMenuOpen] = useState(false)
	const addMenuRef = useRef<HTMLDivElement | null>(null)
	const [isMissionEditing, setIsMissionEditing] = useState(false)
	const [missionDraft, setMissionDraft] = useState(activeCompany?.mission ?? "")
	const [missionStatus, setMissionStatus] = useState<"idle" | "saved">("idle")
	useEffect(() => {
		setMissionDraft(activeCompany?.mission ?? "")
		setIsMissionEditing(false)
	}, [activeCompany?.mission, activeCompany?.id])

	useEffect(() => {
		if (!isAddMenuOpen) {
			return
		}

		const handleClickAway = (event: MouseEvent) => {
			if (!addMenuRef.current) {
				return
			}
			if (event.target instanceof Node && addMenuRef.current.contains(event.target)) {
				return
			}
			setIsAddMenuOpen(false)
		}

		document.addEventListener("mousedown", handleClickAway)
		return () => {
			document.removeEventListener("mousedown", handleClickAway)
		}
	}, [isAddMenuOpen])

	const handleMissionSave = useCallback(() => {
		if (!activeCompany) {
			return
		}

		const trimmedMission = missionDraft.trim()
		updateCompany({
			id: activeCompany.id,
			name: activeCompany.name,
			mission: trimmedMission ? trimmedMission : undefined,
			vision: activeCompany.vision,
			ownerProfile: activeCompany.ownerProfile,
			updateDefaultOwnerProfile: false,
		})
		setIsMissionEditing(false)
		setMissionStatus("saved")
		if (missionStatusTimeoutRef.current) {
			window.clearTimeout(missionStatusTimeoutRef.current)
		}
		missionStatusTimeoutRef.current = window.setTimeout(() => setMissionStatus("idle"), 2400)
	}, [activeCompany, missionDraft, updateCompany])

	const handleMissionCancel = useCallback(() => {
		setMissionDraft(activeCompany?.mission ?? "")
		setIsMissionEditing(false)
		setMissionStatus("idle")
		if (missionStatusTimeoutRef.current) {
			window.clearTimeout(missionStatusTimeoutRef.current)
		}
	}, [activeCompany?.mission])

	// Leaving this less safe version here since if the first message is not a
	// task, then the extension is in a bad state and needs to be debugged (see
	// Cline.abort).
	const task = useMemo(() => messages.at(0), [messages])

	const latestTodos = useMemo(() => {
		// First check if we have initial todos from the state (for new subtasks)
		if (currentTaskTodos && currentTaskTodos.length > 0) {
			// Check if there are any todo updates in messages
			const messageBasedTodos = getLatestTodo(messages)
			// If there are message-based todos, they take precedence (user has updated them)
			if (messageBasedTodos && messageBasedTodos.length > 0) {
				return messageBasedTodos
			}
			// Otherwise use the initial todos from state
			return currentTaskTodos
		}
		// Fall back to extracting from messages
		return getLatestTodo(messages)
	}, [messages, currentTaskTodos])

	const modifiedMessages = useMemo(() => combineApiRequests(combineCommandSequences(messages.slice(1))), [messages])

	// Has to be after api_req_finished are all reduced into api_req_started messages.
	const apiMetrics = useMemo(() => getApiMetrics(modifiedMessages), [modifiedMessages])

	const [inputValue, setInputValue] = useState("")
	const inputValueRef = useRef(inputValue)
	const textAreaRef = useRef<HTMLTextAreaElement>(null)

const handleInsertParticipantMention = useCallback(
	(employeeId: string) => {
		const employee = companyEmployees.find((entry) => entry.id === employeeId)
		if (!employee) {
			return
		}

		setInputValue((previous) => {
			const base = previous ?? ""
			const mention = `@${employee.name ?? "teammate"}`
			const needsLeadingSpace = base.length > 0 && !base.endsWith(" ")
			return `${needsLeadingSpace ? `${base} ` : base}${mention} `
		})
		textAreaRef.current?.focus()
	},
	[companyEmployees],
)

const handleLaunchConversation = useCallback(() => {
	if (groupParticipantIds.length > 0) {
		const [primaryParticipant, ...additionalParticipants] = groupParticipantIds
		if (primaryParticipant && primaryParticipant !== displayPersonaId) {
			handlePersonaChange(primaryParticipant)
		}
		additionalParticipants.forEach((participantId) => {
			if (participantId !== displayPersonaId) {
				handleInsertParticipantMention(participantId)
			}
		})
	}
	textAreaRef.current?.focus()
}, [
	displayPersonaId,
	groupParticipantIds,
	handleInsertParticipantMention,
	handlePersonaChange,
])

	const activeParticipantEntries = useMemo(
		() =>
			groupParticipantIds
				.map((participantId) => companyEmployees.find((employee) => employee.id === participantId))
				.filter((employee): employee is WorkplaceEmployee => Boolean(employee)),
		[groupParticipantIds, companyEmployees],
	)

	const selectableEmployees = useMemo(() => {
		const excludedIds = new Set<string>()
		if (displayPersonaId) {
			excludedIds.add(displayPersonaId)
		}
		groupParticipantIds.forEach((id) => excludedIds.add(id))
		return sortedSupportingEmployees.filter((employee) => !excludedIds.has(employee.id))
	}, [displayPersonaId, groupParticipantIds, sortedSupportingEmployees])

	const suggestedCollaborators = useMemo(() => selectableEmployees.slice(0, 4), [selectableEmployees])

	const prechatStats = useMemo(
		() => ({
			employeeCount: companyEmployees.length,
			teamCount: companyTeams.length,
			departmentCount: companyDepartments.length,
			unassignedCount: hierarchyData.unassignedEmployees.length,
		}),
		[
			companyEmployees.length,
			companyTeams.length,
			companyDepartments.length,
			hierarchyData.unassignedEmployees.length,
		],
	)

	const hasActiveParticipants = activeParticipantEntries.length > 0
	const hasSuggestedCollaborators = suggestedCollaborators.length > 0
	const hasSelectableEmployees = selectableEmployees.length > 0

	useEffect(() => {
		if (!hasSelectableEmployees && isAddMenuOpen) {
			setIsAddMenuOpen(false)
		}
	}, [hasSelectableEmployees, isAddMenuOpen])
	const hasRecentChatHistory = recentChatHistory.length > 0
	const [sendingDisabled, setSendingDisabled] = useState(false)
	const [selectedImages, setSelectedImages] = useState<string[]>([])

	// we need to hold on to the ask because useEffect > lastMessage will always let us know when an ask comes in and handle it, but by the time handleMessage is called, the last message might not be the ask anymore (it could be a say that followed)
	const [clineAsk, setClineAsk] = useState<ClineAsk | undefined>(undefined)
	const [enableButtons, setEnableButtons] = useState<boolean>(false)
	const [primaryButtonText, setPrimaryButtonText] = useState<string | undefined>(undefined)
	const [secondaryButtonText, setSecondaryButtonText] = useState<string | undefined>(undefined)
	const [didClickCancel, setDidClickCancel] = useState(false)
	const virtuosoRef = useRef<VirtuosoHandle>(null)
	const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({})
	const prevExpandedRowsRef = useRef<Record<number, boolean>>()
	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const disableAutoScrollRef = useRef(false)
	const [showScrollToBottom, setShowScrollToBottom] = useState(false)
	const [isAtBottom, setIsAtBottom] = useState(false)
	const lastTtsRef = useRef<string>("")
	const [wasStreaming, setWasStreaming] = useState<boolean>(false)
	const [showCheckpointWarning, setShowCheckpointWarning] = useState<boolean>(false)
	const [isCondensing, setIsCondensing] = useState<boolean>(false)
	const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)
	const [currentTimestamp, setCurrentTimestamp] = useState(() => formatTimestamp(new Date()))
	const everVisibleMessagesTsRef = useRef<LRUCache<number, boolean>>(
		new LRUCache({
			max: 100,
			ttl: 1000 * 60 * 5,
		}),
	)
	const autoApproveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const userRespondedRef = useRef<boolean>(false)
	const [currentFollowUpTs, setCurrentFollowUpTs] = useState<number | null>(null)

	const clineAskRef = useRef(clineAsk)
	useEffect(() => {
		clineAskRef.current = clineAsk
	}, [clineAsk])

	// Keep inputValueRef in sync with inputValue state
	useEffect(() => {
		inputValueRef.current = inputValue
	}, [inputValue])

	useEffect(() => {
		isMountedRef.current = true
		return () => {
			isMountedRef.current = false
		}
	}, [])

	useEffect(() => {
		const tick = () => setCurrentTimestamp(formatTimestamp(new Date()))
		tick()
		const interval = window.setInterval(tick, 30_000)
		return () => window.clearInterval(interval)
	}, [])

	const isProfileDisabled = useMemo(
		() => !!apiConfiguration && !ProfileValidator.isProfileAllowed(apiConfiguration, organizationAllowList),
		[apiConfiguration, organizationAllowList],
	)

	// UI layout depends on the last 2 messages
	// (since it relies on the content of these messages, we are deep comparing. i.e. the button state after hitting button sets enableButtons to false, and this effect otherwise would have to true again even if messages didn't change
	const lastMessage = useMemo(() => messages.at(-1), [messages])
	const secondLastMessage = useMemo(() => messages.at(-2), [messages])

	// Setup sound hooks with use-sound
	const volume = typeof soundVolume === "number" ? soundVolume : 0.5
	const soundConfig = {
		volume,
		// useSound expects 'disabled' property, not 'soundEnabled'
		soundEnabled,
	}

	const getAudioUrl = (path: string) => `${audioBaseUri}/${path}`

	// Use the getAudioUrl helper function
	const [playNotification] = useSound(getAudioUrl("notification.wav"), soundConfig)
	const [playCelebration] = useSound(getAudioUrl("celebration.wav"), soundConfig)
	const [playProgressLoop] = useSound(getAudioUrl("progress_loop.wav"), soundConfig)

	function playSound(audioType: AudioType) {
		// Play the appropriate sound based on type
		// The disabled state is handled by the useSound hook configuration
		switch (audioType) {
			case "notification":
				playNotification()
				break
			case "celebration":
				playCelebration()
				break
			case "progress_loop":
				playProgressLoop()
				break
			default:
				console.warn(`Unknown audio type: ${audioType}`)
		}
	}

	function playTts(text: string) {
		vscode.postMessage({ type: "playTts", text })
	}

	useDeepCompareEffect(() => {
		// if last message is an ask, show user ask UI
		// if user finished a task, then start a new task with a new conversation history since in this moment that the extension is waiting for user response, the user could close the extension and the conversation history would be lost.
		// basically as long as a task is active, the conversation history will be persisted
		if (lastMessage) {
			switch (lastMessage.type) {
				case "ask":
					// Reset user response flag when a new ask arrives to allow auto-approval
					userRespondedRef.current = false
					const isPartial = lastMessage.partial === true
					switch (lastMessage.ask) {
						case "api_req_failed":
							playSound("progress_loop")
							setSendingDisabled(true)
							setClineAsk("api_req_failed")
							setEnableButtons(true)
							setPrimaryButtonText(t("chat:retry.title"))
							setSecondaryButtonText(t("chat:startNewTask.title"))
							break
						case "mistake_limit_reached":
							playSound("progress_loop")
							setSendingDisabled(false)
							setClineAsk("mistake_limit_reached")
							setEnableButtons(true)
							setPrimaryButtonText(t("chat:proceedAnyways.title"))
							setSecondaryButtonText(t("chat:startNewTask.title"))
							break
						case "followup":
							if (!isPartial) {
								playSound("notification")
							}
							setSendingDisabled(isPartial)
							setClineAsk("followup")
							// setting enable buttons to `false` would trigger a focus grab when
							// the text area is enabled which is undesirable.
							// We have no buttons for this tool, so no problem having them "enabled"
							// to workaround this issue.  See #1358.
							setEnableButtons(true)
							setPrimaryButtonText(undefined)
							setSecondaryButtonText(undefined)
							break
						case "tool":
							if (!isAutoApproved(lastMessage) && !isPartial) {
								playSound("notification")
								showSystemNotification(t("kilocode:notifications.toolRequest")) // kilocode_change
							}
							setSendingDisabled(isPartial)
							setClineAsk("tool")
							setEnableButtons(!isPartial)
							const tool = JSON.parse(lastMessage.text || "{}") as ClineSayTool
							switch (tool.tool) {
								case "editedExistingFile":
								case "appliedDiff":
								case "newFileCreated":
								case "insertContent":
								case "generateImage":
									setPrimaryButtonText(t("chat:save.title"))
									setSecondaryButtonText(t("chat:reject.title"))
									break
								case "finishTask":
									setPrimaryButtonText(t("chat:completeSubtaskAndReturn"))
									setSecondaryButtonText(undefined)
									break
								case "readFile":
									if (tool.batchFiles && Array.isArray(tool.batchFiles)) {
										setPrimaryButtonText(t("chat:read-batch.approve.title"))
										setSecondaryButtonText(t("chat:read-batch.deny.title"))
									} else {
										setPrimaryButtonText(t("chat:approve.title"))
										setSecondaryButtonText(t("chat:reject.title"))
									}
									break
								default:
									setPrimaryButtonText(t("chat:approve.title"))
									setSecondaryButtonText(t("chat:reject.title"))
									break
							}
							break
						case "browser_action_launch":
							if (!isAutoApproved(lastMessage) && !isPartial) {
								playSound("notification")
								showSystemNotification(t("kilocode:notifications.browserAction")) // kilocode_change
							}
							setSendingDisabled(isPartial)
							setClineAsk("browser_action_launch")
							setEnableButtons(!isPartial)
							setPrimaryButtonText(t("chat:approve.title"))
							setSecondaryButtonText(t("chat:reject.title"))
							break
						case "command":
							if (!isAutoApproved(lastMessage) && !isPartial) {
								playSound("notification")
								showSystemNotification(t("kilocode:notifications.command")) // kilocode_change
							}
							setSendingDisabled(isPartial)
							setClineAsk("command")
							setEnableButtons(!isPartial)
							setPrimaryButtonText(t("chat:runCommand.title"))
							setSecondaryButtonText(t("chat:reject.title"))
							break
						case "command_output":
							setSendingDisabled(false)
							setClineAsk("command_output")
							setEnableButtons(true)
							setPrimaryButtonText(t("chat:proceedWhileRunning.title"))
							setSecondaryButtonText(t("chat:killCommand.title"))
							break
						case "use_mcp_server":
							if (!isAutoApproved(lastMessage) && !isPartial) {
								playSound("notification")
							}
							setSendingDisabled(isPartial)
							setClineAsk("use_mcp_server")
							setEnableButtons(!isPartial)
							setPrimaryButtonText(t("chat:approve.title"))
							setSecondaryButtonText(t("chat:reject.title"))
							break
						case "completion_result":
							// extension waiting for feedback. but we can just present a new task button
							if (!isPartial) {
								playSound("celebration")
							}
							setSendingDisabled(isPartial)
							setClineAsk("completion_result")
							setEnableButtons(!isPartial)
							setPrimaryButtonText(t("chat:startNewTask.title"))
							setSecondaryButtonText(undefined)
							break
						case "resume_task":
							setSendingDisabled(false)
							setClineAsk("resume_task")
							setEnableButtons(true)
							setPrimaryButtonText(t("chat:resumeTask.title"))
							setSecondaryButtonText(t("chat:terminate.title"))
							setDidClickCancel(false) // special case where we reset the cancel button state
							break
						case "resume_completed_task":
							setSendingDisabled(false)
							setClineAsk("resume_completed_task")
							setEnableButtons(true)
							setPrimaryButtonText(t("chat:startNewTask.title"))
							setSecondaryButtonText(undefined)
							setDidClickCancel(false)
							break
						// kilocode_change begin
						case "report_bug":
							if (!isPartial) {
								playSound("notification")
							}
							setSendingDisabled(isPartial)
							setClineAsk("report_bug")
							setEnableButtons(!isPartial)
							setPrimaryButtonText(t("chat:reportBug.title"))
							break
						case "condense":
							setSendingDisabled(isPartial)
							setClineAsk("condense")
							setEnableButtons(!isPartial)
							setPrimaryButtonText(t("kilocode:chat.condense.condenseConversation"))
							setSecondaryButtonText(undefined)
							break
						// kilocode_change end
					}
					break
				case "say":
					// Don't want to reset since there could be a "say" after
					// an "ask" while ask is waiting for response.
					switch (lastMessage.say) {
						case "api_req_retry_delayed":
							setSendingDisabled(true)
							break
						case "api_req_started":
							if (secondLastMessage?.ask === "command_output") {
								setSendingDisabled(true)
								setSelectedImages([])
								setClineAsk(undefined)
								setEnableButtons(false)
							}
							break
						case "api_req_finished":
						case "error":
						case "text":
						case "browser_action":
						case "browser_action_result":
						case "command_output":
						case "mcp_server_request_started":
						case "mcp_server_response":
						case "completion_result":
							break
					}
					break
			}
		}
	}, [lastMessage, secondLastMessage])

	useEffect(() => {
		if (messages.length === 0) {
			setSendingDisabled(false)
			setClineAsk(undefined)
			setEnableButtons(false)
			setPrimaryButtonText(undefined)
			setSecondaryButtonText(undefined)
		}
	}, [messages.length])

	useEffect(() => {
		// Reset UI states
		setExpandedRows({})
		everVisibleMessagesTsRef.current.clear() // Clear for new task
		setCurrentFollowUpTs(null) // Clear follow-up answered state for new task
		setIsCondensing(false) // Reset condensing state when switching tasks
		// Note: sendingDisabled is not reset here as it's managed by message effects

		// Clear any pending auto-approval timeout from previous task
		if (autoApproveTimeoutRef.current) {
			clearTimeout(autoApproveTimeoutRef.current)
			autoApproveTimeoutRef.current = null
		}
		// Reset user response flag for new task
		userRespondedRef.current = false
	}, [task?.ts])

	useEffect(() => {
		if (isHidden) {
			everVisibleMessagesTsRef.current.clear()
		}
	}, [isHidden])

	useEffect(() => {
		const cache = everVisibleMessagesTsRef.current
		return () => {
			cache.clear()
		}
	}, [])

	useEffect(() => {
		const prev = prevExpandedRowsRef.current
		let wasAnyRowExpandedByUser = false
		if (prev) {
			// Check if any row transitioned from false/undefined to true
			for (const [tsKey, isExpanded] of Object.entries(expandedRows)) {
				const ts = Number(tsKey)
				if (isExpanded && !(prev[ts] ?? false)) {
					wasAnyRowExpandedByUser = true
					break
				}
			}
		}

		if (wasAnyRowExpandedByUser) {
			disableAutoScrollRef.current = true
		}
		prevExpandedRowsRef.current = expandedRows // Store current state for next comparison
	}, [expandedRows])

	const isStreaming = useMemo(() => {
		// Checking clineAsk isn't enough since messages effect may be called
		// again for a tool for example, set clineAsk to its value, and if the
		// next message is not an ask then it doesn't reset. This is likely due
		// to how much more often we're updating messages as compared to before,
		// and should be resolved with optimizations as it's likely a rendering
		// bug. But as a final guard for now, the cancel button will show if the
		// last message is not an ask.
		const isLastAsk = !!modifiedMessages.at(-1)?.ask

		const isToolCurrentlyAsking =
			isLastAsk && clineAsk !== undefined && enableButtons && primaryButtonText !== undefined

		if (isToolCurrentlyAsking) {
			return false
		}

		const isLastMessagePartial = modifiedMessages.at(-1)?.partial === true

		if (isLastMessagePartial) {
			return true
		} else {
			const lastApiReqStarted = findLast(
				modifiedMessages,
				(message: ClineMessage) => message.say === "api_req_started",
			)

			if (
				lastApiReqStarted &&
				lastApiReqStarted.text !== null &&
				lastApiReqStarted.text !== undefined &&
				lastApiReqStarted.say === "api_req_started"
			) {
				const cost = JSON.parse(lastApiReqStarted.text).cost

				if (cost === undefined) {
					return true // API request has not finished yet.
				}
			}
		}

		return false
	}, [modifiedMessages, clineAsk, enableButtons, primaryButtonText])

	const markFollowUpAsAnswered = useCallback(() => {
		const lastFollowUpMessage = messagesRef.current.findLast((msg: ClineMessage) => msg.ask === "followup")
		if (lastFollowUpMessage) {
			setCurrentFollowUpTs(lastFollowUpMessage.ts)
		}
	}, [])

	const handleChatReset = useCallback(() => {
		// Clear any pending auto-approval timeout
		if (autoApproveTimeoutRef.current) {
			clearTimeout(autoApproveTimeoutRef.current)
			autoApproveTimeoutRef.current = null
		}
		// Reset user response flag for new message
		userRespondedRef.current = false

		// Only reset message-specific state, preserving mode.
		setInputValue("")
		setSendingDisabled(true)
		setSelectedImages([])
		setClineAsk(undefined)
		setEnableButtons(false)
		// Do not reset mode here as it should persist.
		// setPrimaryButtonText(undefined)
		// setSecondaryButtonText(undefined)
		disableAutoScrollRef.current = false
	}, [])

	/**
	 * Handles sending messages to the extension
	 * @param text - The message text to send
	 * @param images - Array of image data URLs to send with the message
	 */
	const handleSendMessage = useCallback(
		(text: string, images: string[]) => {
			text = text.trim()

			if (text || images.length > 0) {
				if (sendingDisabled) {
					try {
						console.log("queueMessage", text, images)
						vscode.postMessage({ type: "queueMessage", text, images })
						setInputValue("")
						setSelectedImages([])
					} catch (error) {
						console.error(
							`Failed to queue message: ${error instanceof Error ? error.message : String(error)}`,
						)
					}

					return
				}

				// Mark that user has responded - this prevents any pending auto-approvals.
				userRespondedRef.current = true

				if (messagesRef.current.length === 0) {
					vscode.postMessage({ type: "newTask", text, images })
				} else if (clineAskRef.current) {
					if (clineAskRef.current === "followup") {
						markFollowUpAsAnswered()
					}

					// Use clineAskRef.current
					switch (
						clineAskRef.current // Use clineAskRef.current
					) {
						case "followup":
						case "tool":
						case "browser_action_launch":
						case "command": // User can provide feedback to a tool or command use.
						case "command_output": // User can send input to command stdin.
						case "use_mcp_server":
						case "completion_result": // If this happens then the user has feedback for the completion result.
						case "resume_task":
						case "resume_completed_task":
						case "mistake_limit_reached":
							vscode.postMessage({
								type: "askResponse",
								askResponse: "messageResponse",
								text,
								images,
							})
							break
						// There is no other case that a textfield should be enabled.
					}
				} else {
					// This is a new message in an ongoing task.
					vscode.postMessage({ type: "askResponse", askResponse: "messageResponse", text, images })
				}

				handleChatReset()
			}
		},
		[handleChatReset, markFollowUpAsAnswered, sendingDisabled], // messagesRef and clineAskRef are stable
	)

	const handleSetChatBoxMessage = useCallback(
		(text: string, images: string[]) => {
			// Avoid nested template literals by breaking down the logic
			let newValue = text

			if (inputValue !== "") {
				newValue = inputValue + " " + text
			}

			setInputValue(newValue)
			setSelectedImages([...selectedImages, ...images])
		},
		[inputValue, selectedImages],
	)

	const startNewTask = useCallback(() => vscode.postMessage({ type: "clearTask" }), [])

	// This logic depends on the useEffect[messages] above to set clineAsk,
	// after which buttons are shown and we then send an askResponse to the
	// extension.
	const handlePrimaryButtonClick = useCallback(
		(text?: string, images?: string[]) => {
			// Mark that user has responded
			userRespondedRef.current = true

			const trimmedInput = text?.trim()

			switch (clineAsk) {
				case "api_req_failed":
				case "command":
				case "tool":
				case "browser_action_launch":
				case "use_mcp_server":
				case "resume_task":
				case "mistake_limit_reached":
				case "report_bug":
					// Only send text/images if they exist
					if (trimmedInput || (images && images.length > 0)) {
						vscode.postMessage({
							type: "askResponse",
							askResponse: "yesButtonClicked",
							text: trimmedInput,
							images: images,
						})
						// Clear input state after sending
						setInputValue("")
						setSelectedImages([])
					} else {
						vscode.postMessage({ type: "askResponse", askResponse: "yesButtonClicked" })
					}
					break
				case "completion_result":
				case "resume_completed_task":
					// Waiting for feedback, but we can just present a new task button
					startNewTask()
					break
				case "command_output":
					vscode.postMessage({ type: "terminalOperation", terminalOperation: "continue" })
					break
				// kilocode_change start
				case "condense":
					vscode.postMessage({
						type: "condense",
						text: lastMessage?.text,
					})
					break
				// kilocode_change end
			}

			setSendingDisabled(true)
			setClineAsk(undefined)
			setEnableButtons(false)
		},
		[clineAsk, startNewTask, lastMessage?.text], // kilocode_change: add lastMessage?.text
	)

	const handleSecondaryButtonClick = useCallback(
		(text?: string, images?: string[]) => {
			// Mark that user has responded
			userRespondedRef.current = true

			const trimmedInput = text?.trim()

			if (isStreaming) {
				vscode.postMessage({ type: "cancelTask" })
				setDidClickCancel(true)
				return
			}

			switch (clineAsk) {
				case "api_req_failed":
				case "mistake_limit_reached":
				case "resume_task":
					startNewTask()
					break
				case "command":
				case "tool":
				case "browser_action_launch":
				case "use_mcp_server":
					// Only send text/images if they exist
					if (trimmedInput || (images && images.length > 0)) {
						vscode.postMessage({
							type: "askResponse",
							askResponse: "noButtonClicked",
							text: trimmedInput,
							images: images,
						})
						// Clear input state after sending
						setInputValue("")
						setSelectedImages([])
					} else {
						// Responds to the API with a "This operation failed" and lets it try again
						vscode.postMessage({ type: "askResponse", askResponse: "noButtonClicked" })
					}
					break
				case "command_output":
					vscode.postMessage({ type: "terminalOperation", terminalOperation: "abort" })
					break
			}
			setSendingDisabled(true)
			setClineAsk(undefined)
			setEnableButtons(false)
		},
		[clineAsk, startNewTask, isStreaming],
	)

	const handleTaskCloseButtonClick = useCallback(() => startNewTask(), [startNewTask]) // kilocode_change

	const { info: model } = useSelectedModel(apiConfiguration)

	const selectImages = useCallback(() => vscode.postMessage({ type: "selectImages" }), [])

	const shouldDisableImages = !model?.supportsImages || selectedImages.length >= MAX_IMAGES_PER_MESSAGE

	const handleMessage = useCallback(
		(e: MessageEvent) => {
			const message: ExtensionMessage = e.data

			switch (message.type) {
				case "action":
					switch (message.action!) {
						case "didBecomeVisible":
							if (!isHidden && !sendingDisabled && !enableButtons) {
								textAreaRef.current?.focus()
							}
							break
						case "focusInput":
							textAreaRef.current?.focus()
							break
					}
					break
				case "selectedImages":
					// Only handle selectedImages if it's not for editing context
					// When context is "edit", ChatRow will handle the images
					if (message.context !== "edit") {
						setSelectedImages((prevImages: string[]) =>
							appendImages(prevImages, message.images, MAX_IMAGES_PER_MESSAGE),
						)
					}
					break
				case "invoke":
					switch (message.invoke!) {
						case "newChat":
							handleChatReset()
							break
						case "sendMessage":
							handleSendMessage(message.text ?? "", message.images ?? [])
							break
						case "setChatBoxMessage":
							handleSetChatBoxMessage(message.text ?? "", message.images ?? [])
							break
						case "primaryButtonClick":
							handlePrimaryButtonClick(message.text ?? "", message.images ?? [])
							break
						case "secondaryButtonClick":
							handleSecondaryButtonClick(message.text ?? "", message.images ?? [])
							break
					}
					break
				case "condenseTaskContextResponse":
					if (message.text && message.text === currentTaskItem?.id) {
						if (isCondensing && sendingDisabled) {
							setSendingDisabled(false)
						}
						setIsCondensing(false)
					}
					break
			}
			// textAreaRef.current is not explicitly required here since React
			// guarantees that ref will be stable across re-renders, and we're
			// not using its value but its reference.
		},
		[
			isCondensing,
			isHidden,
			sendingDisabled,
			enableButtons,
			currentTaskItem,
			handleChatReset,
			handleSendMessage,
			handleSetChatBoxMessage,
			handlePrimaryButtonClick,
			handleSecondaryButtonClick,
		],
	)

	useEvent("message", handleMessage)

	// NOTE: the VSCode window needs to be focused for this to work.
	useMount(() => textAreaRef.current?.focus())

	const visibleMessages = useMemo(() => {
		// Pre-compute checkpoint hashes that have associated user messages for O(1) lookup
		const userMessageCheckpointHashes = new Set<string>()
		modifiedMessages.forEach((msg) => {
			if (
				msg.say === "user_feedback" &&
				msg.checkpoint &&
				(msg.checkpoint as any).type === "user_message" &&
				(msg.checkpoint as any).hash
			) {
				userMessageCheckpointHashes.add((msg.checkpoint as any).hash)
			}
		})

		// Remove the 500-message limit to prevent array index shifting
		// Virtuoso is designed to efficiently handle large lists through virtualization
		const newVisibleMessages = modifiedMessages.filter((message) => {
			// Filter out checkpoint_saved messages that should be suppressed
			if (message.say === "checkpoint_saved") {
				// Check if this checkpoint has the suppressMessage flag set
				if (
					message.checkpoint &&
					typeof message.checkpoint === "object" &&
					"suppressMessage" in message.checkpoint &&
					message.checkpoint.suppressMessage
				) {
					return false
				}
				// Also filter out checkpoint messages associated with user messages (legacy behavior)
				if (message.text && userMessageCheckpointHashes.has(message.text)) {
					return false
				}
			}

			if (everVisibleMessagesTsRef.current.has(message.ts)) {
				const alwaysHiddenOnceProcessedAsk: ClineAsk[] = [
					"api_req_failed",
					"resume_task",
					"resume_completed_task",
				]
				const alwaysHiddenOnceProcessedSay = [
					"api_req_finished",
					"api_req_retried",
					"api_req_deleted",
					"mcp_server_request_started",
				]
				if (message.ask && alwaysHiddenOnceProcessedAsk.includes(message.ask)) return false
				if (message.say && alwaysHiddenOnceProcessedSay.includes(message.say)) return false
				if (message.say === "text" && (message.text ?? "") === "" && (message.images?.length ?? 0) === 0) {
					return false
				}
				return true
			}

			switch (message.ask) {
				case "completion_result":
					if (message.text === "") return false
					break
				case "api_req_failed":
				case "resume_task":
				case "resume_completed_task":
					return false
			}
			switch (message.say) {
				case "api_req_finished":
				case "api_req_retried":
				case "api_req_deleted":
					return false
				case "api_req_retry_delayed":
					const last1 = modifiedMessages.at(-1)
					const last2 = modifiedMessages.at(-2)
					if (last1?.ask === "resume_task" && last2 === message) {
						return true
					} else if (message !== last1) {
						return false
					}
					break
				case "text":
					if ((message.text ?? "") === "" && (message.images?.length ?? 0) === 0) return false
					break
				case "mcp_server_request_started":
					return false
			}
			return true
		})

		const viewportStart = Math.max(0, newVisibleMessages.length - 100)
		newVisibleMessages
			.slice(viewportStart)
			.forEach((msg: ClineMessage) => everVisibleMessagesTsRef.current.set(msg.ts, true))

		return newVisibleMessages
	}, [modifiedMessages])

	useEffect(() => {
		const cleanupInterval = setInterval(() => {
			const cache = everVisibleMessagesTsRef.current
			const currentMessageIds = new Set(modifiedMessages.map((m: ClineMessage) => m.ts))
			const viewportMessages = visibleMessages.slice(Math.max(0, visibleMessages.length - 100))
			const viewportMessageIds = new Set(viewportMessages.map((m: ClineMessage) => m.ts))

			cache.forEach((_value: boolean, key: number) => {
				if (!currentMessageIds.has(key) && !viewportMessageIds.has(key)) {
					cache.delete(key)
				}
			})
		}, 60000)

		return () => clearInterval(cleanupInterval)
	}, [modifiedMessages, visibleMessages])

	useDebounceEffect(
		() => {
			if (!isHidden && !sendingDisabled && !enableButtons) {
				textAreaRef.current?.focus()
			}
		},
		50,
		[isHidden, sendingDisabled, enableButtons],
	)

	const isReadOnlyToolAction = useCallback((message: ClineMessage | undefined) => {
		if (message?.type === "ask") {
			if (!message.text) {
				return true
			}

			const tool = JSON.parse(message.text)

			return [
				"readFile",
				"listFiles",
				"listFilesTopLevel",
				"listFilesRecursive",
				"listCodeDefinitionNames",
				"searchFiles",
				"codebaseSearch",
				"runSlashCommand",
			].includes(tool.tool)
		}

		return false
	}, [])

	const isWriteToolAction = useCallback((message: ClineMessage | undefined) => {
		if (message?.type === "ask") {
			if (!message.text) {
				return true
			}

			const tool = JSON.parse(message.text)

			return [
				"editedExistingFile",
				"appliedDiff",
				"newFileCreated",
				"searchAndReplace",
				"insertContent",
				"generateImage",
			].includes(tool.tool)
		}

		return false
	}, [])

	const isMcpToolAlwaysAllowed = useCallback(
		(message: ClineMessage | undefined) => {
			if (message?.type === "ask" && message.ask === "use_mcp_server") {
				if (!message.text) {
					return true
				}

				const mcpServerUse = JSON.parse(message.text) as McpServerUse

				if (mcpServerUse.type === "use_mcp_tool" && mcpServerUse.toolName) {
					const server = mcpServers?.find((s: McpServer) => s.name === mcpServerUse.serverName)
					const tool = server?.tools?.find((t: McpTool) => t.name === mcpServerUse.toolName)
					return tool?.alwaysAllow || false
				}
			}

			return false
		},
		[mcpServers],
	)

	// Get the command decision using unified validation logic
	const getCommandDecisionForMessage = useCallback(
		(message: ClineMessage | undefined): CommandDecision => {
			if (message?.type !== "ask") return "ask_user"
			return getCommandDecision(message.text || "", allowedCommands || [], deniedCommands || [])
		},
		[allowedCommands, deniedCommands],
	)

	// Check if a command message should be auto-approved.
	const isAllowedCommand = useCallback(
		(message: ClineMessage | undefined): boolean => {
			// kilocode_change start wrap in try/catch
			if (message?.type !== "ask") return false
			try {
				return getCommandDecisionForMessage(message) === "auto_approve"
			} catch (e) {
				// shell-quote sometimes throws a "Bad substitution" error
				console.error("Cannot validate command, auto-approve denied.", e)
				return false
			}
			// kilocode_change end
		},
		[getCommandDecisionForMessage],
	)

	// Check if a command message should be auto-denied.
	const isDeniedCommand = useCallback(
		(message: ClineMessage | undefined): boolean => {
			return getCommandDecisionForMessage(message) === "auto_deny"
		},
		[getCommandDecisionForMessage],
	)

	// Helper function to get the denied prefix for a command
	const getDeniedPrefix = useCallback(
		(command: string): string | null => {
			if (!command || !deniedCommands?.length) return null

			// Parse the command into sub-commands and check each one
			const subCommands = parseCommand(command)
			for (const cmd of subCommands) {
				const deniedMatch = findLongestPrefixMatch(cmd, deniedCommands)
				if (deniedMatch) {
					return deniedMatch
				}
			}
			return null
		},
		[deniedCommands],
	)

	// Create toggles object for useAutoApprovalState hook
	const autoApprovalToggles = useAutoApprovalToggles()

	const { hasEnabledOptions } = useAutoApprovalState(autoApprovalToggles, autoApprovalEnabled)

	const isAutoApproved = useCallback(
		(message: ClineMessage | undefined) => {
			// First check if auto-approval is enabled AND we have at least one permission
			if (!autoApprovalEnabled || !message || message.type !== "ask") {
				return false
			}

			// Use the hook's result instead of duplicating the logic
			if (!hasEnabledOptions) {
				return false
			}

			if (message.ask === "followup") {
				return alwaysAllowFollowupQuestions
			}

			if (message.ask === "browser_action_launch") {
				return alwaysAllowBrowser
			}

			if (message.ask === "use_mcp_server") {
				// Check if it's a tool or resource access
				if (!message.text) {
					return false
				}

				try {
					const mcpServerUse = JSON.parse(message.text) as McpServerUse

					if (mcpServerUse.type === "use_mcp_tool") {
						// For tools, check if the specific tool is always allowed
						return alwaysAllowMcp && isMcpToolAlwaysAllowed(message)
					} else if (mcpServerUse.type === "access_mcp_resource") {
						// For resources, auto-approve if MCP is always allowed
						// Resources don't have individual alwaysAllow settings like tools do
						return alwaysAllowMcp
					}
				} catch (error) {
					console.error("Failed to parse MCP server use message:", error)
					return false
				}
				return false
			}

			if (message.ask === "command") {
				return alwaysAllowExecute && isAllowedCommand(message)
			}

			// For read/write operations, check if it's outside workspace and if
			// we have permission for that.
			if (message.ask === "tool") {
				let tool: any = {}

				try {
					tool = JSON.parse(message.text || "{}")
				} catch (error) {
					console.error("Failed to parse tool:", error)
				}

				if (!tool) {
					return false
				}

				if (tool?.tool === "updateTodoList") {
					return alwaysAllowUpdateTodoList
				}

				if (tool?.tool === "fetchInstructions") {
					if (tool.content === "create_mode") {
						return alwaysAllowModeSwitch
					}

					if (tool.content === "create_mcp_server") {
						return alwaysAllowMcp
					}
				}

				if (tool?.tool === "switchMode") {
					return alwaysAllowModeSwitch
				}

				if (["newTask", "finishTask"].includes(tool?.tool)) {
					return alwaysAllowSubtasks
				}

				const isOutsideWorkspace = !!tool.isOutsideWorkspace
				const isProtected = message.isProtected

				if (isReadOnlyToolAction(message)) {
					return alwaysAllowReadOnly && (!isOutsideWorkspace || alwaysAllowReadOnlyOutsideWorkspace)
				}

				if (isWriteToolAction(message)) {
					return (
						alwaysAllowWrite &&
						(!isOutsideWorkspace || alwaysAllowWriteOutsideWorkspace) &&
						(!isProtected || alwaysAllowWriteProtected)
					)
				}
			}

			return false
		},
		[
			autoApprovalEnabled,
			hasEnabledOptions,
			alwaysAllowBrowser,
			alwaysAllowReadOnly,
			alwaysAllowReadOnlyOutsideWorkspace,
			isReadOnlyToolAction,
			alwaysAllowWrite,
			alwaysAllowWriteOutsideWorkspace,
			alwaysAllowWriteProtected,
			isWriteToolAction,
			alwaysAllowExecute,
			isAllowedCommand,
			alwaysAllowMcp,
			isMcpToolAlwaysAllowed,
			alwaysAllowModeSwitch,
			alwaysAllowFollowupQuestions,
			alwaysAllowSubtasks,
			alwaysAllowUpdateTodoList,
		],
	)

	useEffect(() => {
		// This ensures the first message is not read, future user messages are
		// labeled as `user_feedback`.
		if (lastMessage && messages.length > 1) {
			if (
				lastMessage.text && // has text
				(lastMessage.say === "text" || lastMessage.say === "completion_result") && // is a text message
				!lastMessage.partial && // not a partial message
				!lastMessage.text.startsWith("{") // not a json object
			) {
				let text = lastMessage?.text || ""
				const mermaidRegex = /```mermaid[\s\S]*?```/g
				// remove mermaid diagrams from text
				text = text.replace(mermaidRegex, "")
				// remove markdown from text
				text = removeMd(text)

				// ensure message is not a duplicate of last read message
				if (text !== lastTtsRef.current) {
					try {
						playTts(text)
						lastTtsRef.current = text
					} catch (error) {
						console.error("Failed to execute text-to-speech:", error)
					}
				}
			}
		}

		// Update previous value.
		setWasStreaming(isStreaming)
	}, [isStreaming, lastMessage, wasStreaming, isAutoApproved, messages.length])

	const isBrowserSessionMessage = (message: ClineMessage): boolean => {
		// Which of visible messages are browser session messages, see above.
		if (message.type === "ask") {
			return ["browser_action_launch"].includes(message.ask!)
		}

		if (message.type === "say") {
			return ["api_req_started", "text", "browser_action", "browser_action_result"].includes(message.say!)
		}

		return false
	}

	const groupedMessages = useMemo(() => {
		const result: (ClineMessage | ClineMessage[])[] = []
		let currentGroup: ClineMessage[] = []
		let isInBrowserSession = false

		const endBrowserSession = () => {
			if (currentGroup.length > 0) {
				result.push([...currentGroup])
				currentGroup = []
				isInBrowserSession = false
			}
		}

		visibleMessages.forEach((message: ClineMessage) => {
			// kilocode_change start: upstream pr https://github.com/RooCodeInc/Roo-Code/pull/5452
			// Special handling for browser_action_result - ensure it's always in a browser session
			if (message.say === "browser_action_result" && !isInBrowserSession) {
				isInBrowserSession = true
				currentGroup = []
			}

			// Special handling for browser_action - ensure it's always in a browser session
			if (message.say === "browser_action" && !isInBrowserSession) {
				isInBrowserSession = true
				currentGroup = []
			}
			// kilocode_change end

			if (message.ask === "browser_action_launch") {
				// Complete existing browser session if any.
				endBrowserSession()
				// Start new.
				isInBrowserSession = true
				currentGroup.push(message)
			} else if (isInBrowserSession) {
				// End session if `api_req_started` is cancelled.

				if (message.say === "api_req_started") {
					// Get last `api_req_started` in currentGroup to check if
					// it's cancelled. If it is then this api req is not part
					// of the current browser session.
					const lastApiReqStarted = [...currentGroup].reverse().find((m) => m.say === "api_req_started")

					if (lastApiReqStarted?.text !== null && lastApiReqStarted?.text !== undefined) {
						const info = JSON.parse(lastApiReqStarted.text)
						const isCancelled = info.cancelReason !== null && info.cancelReason !== undefined

						if (isCancelled) {
							endBrowserSession()
							result.push(message)
							return
						}
					}
				}

				if (isBrowserSessionMessage(message)) {
					currentGroup.push(message)

					// kilocode_change start: upstream pr https://github.com/RooCodeInc/Roo-Code/pull/5452
					if (message.say === "browser_action_result") {
						// Check if the previous browser_action was a close action
						const lastBrowserAction = [...currentGroup].reverse().find((m) => m.say === "browser_action")
						if (lastBrowserAction) {
							const browserAction = JSON.parse(lastBrowserAction.text || "{}") as ClineSayBrowserAction
							if (browserAction.action === "close") {
								endBrowserSession()
							}
						}
					}
					// kilocode_change end
				} else {
					// complete existing browser session if any
					endBrowserSession()
					result.push(message)
				}
			} else {
				result.push(message)
			}
		})

		// Handle case where browser session is the last group
		if (currentGroup.length > 0) {
			result.push([...currentGroup])
		}

		if (isCondensing) {
			// Show indicator after clicking condense button
			result.push({
				type: "say",
				say: "condense_context",
				ts: Date.now(),
				partial: true,
			})
		}

		return result
	}, [isCondensing, visibleMessages])

	// scrolling

	const scrollToBottomSmooth = useMemo(
		() =>
			debounce(() => virtuosoRef.current?.scrollTo({ top: Number.MAX_SAFE_INTEGER, behavior: "smooth" }), 10, {
				immediate: true,
			}),
		[],
	)

	useEffect(() => {
		return () => {
			if (scrollToBottomSmooth && typeof (scrollToBottomSmooth as any).cancel === "function") {
				;(scrollToBottomSmooth as any).cancel()
			}
		}
	}, [scrollToBottomSmooth])

	const scrollToBottomAuto = useCallback(() => {
		virtuosoRef.current?.scrollTo({
			top: Number.MAX_SAFE_INTEGER,
			behavior: "auto", // Instant causes crash.
		})
	}, [])

	// kilocode_change start
	// Animated "blink" to highlight a specific message. Used by the TaskTimeline
	const highlightClearTimerRef = useRef<NodeJS.Timeout | undefined>()
	const [highlightedMessageIndex, setHighlightedMessageIndex] = useState<number | null>(null)
	const handleMessageClick = useCallback((index: number) => {
		setHighlightedMessageIndex(index)
		virtuosoRef.current?.scrollToIndex({ index, align: "end", behavior: "smooth" })

		// Clear existing timer if present
		if (highlightClearTimerRef.current) {
			clearTimeout(highlightClearTimerRef.current)
		}
		highlightClearTimerRef.current = setTimeout(() => {
			setHighlightedMessageIndex(null)
			highlightClearTimerRef.current = undefined
		}, 1000)
	}, [])

	// Cleanup highlight timer on unmount
	useEffect(() => {
		return () => {
			if (highlightClearTimerRef.current) {
				clearTimeout(highlightClearTimerRef.current)
			}
		}
	}, [])
	// kilocode_change end

	const handleSetExpandedRow = useCallback(
		(ts: number, expand?: boolean) => {
			setExpandedRows((prev: Record<number, boolean>) => ({
				...prev,
				[ts]: expand === undefined ? !prev[ts] : expand,
			}))
		},
		[setExpandedRows], // setExpandedRows is stable
	)

	// Scroll when user toggles certain rows.
	const toggleRowExpansion = useCallback(
		(ts: number) => {
			handleSetExpandedRow(ts)
			// The logic to set disableAutoScrollRef.current = true on expansion
			// is now handled by the useEffect hook that observes expandedRows.
		},
		[handleSetExpandedRow],
	)

	const handleRowHeightChange = useCallback(
		(isTaller: boolean) => {
			if (!disableAutoScrollRef.current) {
				if (isTaller) {
					scrollToBottomSmooth()
				} else {
					setTimeout(() => scrollToBottomAuto(), 0)
				}
			}
		},
		[scrollToBottomSmooth, scrollToBottomAuto],
	)

	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined
		if (!disableAutoScrollRef.current) {
			timer = setTimeout(() => scrollToBottomSmooth(), 50)
		}
		return () => {
			if (timer) {
				clearTimeout(timer)
			}
		}
	}, [groupedMessages.length, scrollToBottomSmooth])

	const handleWheel = useCallback((event: Event) => {
		const wheelEvent = event as WheelEvent

		if (wheelEvent.deltaY && wheelEvent.deltaY < 0) {
			if (scrollContainerRef.current?.contains(wheelEvent.target as Node)) {
				// User scrolled up
				disableAutoScrollRef.current = true
			}
		}
	}, [])
	//kilocode_change

	// Effect to handle showing the checkpoint warning after a delay
	useEffect(() => {
		// Only show the warning when there's a task but no visible messages yet
		if (task && modifiedMessages.length === 0 && !isStreaming && !isHidden) {
			const timer = setTimeout(() => {
				setShowCheckpointWarning(true)
			}, 5000) // 5 seconds

			return () => clearTimeout(timer)
		} else {
			setShowCheckpointWarning(false)
		}
	}, [task, modifiedMessages.length, isStreaming, isHidden])

	// Effect to hide the checkpoint warning when messages appear
	useEffect(() => {
		if (modifiedMessages.length > 0 || isStreaming || isHidden) {
			setShowCheckpointWarning(false)
		}
	}, [modifiedMessages.length, isStreaming, isHidden])

const basePlaceholder = task ? t("chat:typeMessage") : t("chat:typeTask")
const placeholderText = `${basePlaceholder} — ${holdHintCopy}`

	const switchToMode = useCallback(
		(modeSlug: string): void => {
			// Update local state and notify extension to sync mode change.
			setMode(modeSlug)

			// Send the mode switch message.
			vscode.postMessage({ type: "mode", text: modeSlug })
		},
		[setMode],
	)

	const handleSuggestionClickInRow = useCallback(
		(suggestion: SuggestionItem, event?: React.MouseEvent) => {
			// Mark that user has responded if this is a manual click (not auto-approval)
			if (event) {
				userRespondedRef.current = true
			}

			// Mark the current follow-up question as answered when a suggestion is clicked
			if (clineAsk === "followup" && !event?.shiftKey) {
				markFollowUpAsAnswered()
			}

			// Check if we need to switch modes
			if (suggestion.mode) {
				// Only switch modes if it's a manual click (event exists) or auto-approval is allowed
				const isManualClick = !!event
				if (isManualClick || alwaysAllowModeSwitch) {
					// Switch mode without waiting
					switchToMode(suggestion.mode)
				}
			}

			if (event?.shiftKey) {
				// Always append to existing text, don't overwrite
				setInputValue((currentValue: string) => {
					return currentValue !== "" ? `${currentValue} \n${suggestion.answer}` : suggestion.answer
				})
			} else {
				// Don't clear the input value when sending a follow-up choice
				// The message should be sent but the text area should preserve what the user typed
				const preservedInput = inputValueRef.current
				handleSendMessage(suggestion.answer, [])
				// Restore the input value after sending
				setInputValue(preservedInput)
			}
		},
		[handleSendMessage, setInputValue, switchToMode, alwaysAllowModeSwitch, clineAsk, markFollowUpAsAnswered],
	)

	const handleBatchFileResponse = useCallback((response: { [key: string]: boolean }) => {
		// Handle batch file response, e.g., for file uploads
		vscode.postMessage({ type: "askResponse", askResponse: "objectResponse", text: JSON.stringify(response) })
	}, [])

	// Handler for when FollowUpSuggest component unmounts
	const handleFollowUpUnmount = useCallback(() => {
		// Mark that user has responded
		userRespondedRef.current = true
	}, [])

	const itemContent = useCallback(
		(index: number, messageOrGroup: ClineMessage | ClineMessage[]) => {
			// browser session group
			if (Array.isArray(messageOrGroup)) {
				return (
					<BrowserSessionRow
						messages={messageOrGroup}
						isLast={index === groupedMessages.length - 1}
						lastModifiedMessage={modifiedMessages.at(-1)}
						onHeightChange={handleRowHeightChange}
						isStreaming={isStreaming}
						isExpanded={(messageTs: number) => expandedRows[messageTs] ?? false}
						onToggleExpand={(messageTs: number) => {
							setExpandedRows((prev: Record<number, boolean>) => ({
								...prev,
								[messageTs]: !prev[messageTs],
							}))
						}}
					/>
				)
			}

			// regular message
			return (
				<ChatRow
					key={messageOrGroup.ts}
					message={messageOrGroup}
					isExpanded={expandedRows[messageOrGroup.ts] || false}
					onToggleExpand={toggleRowExpansion} // This was already stabilized
					lastModifiedMessage={modifiedMessages.at(-1)} // Original direct access
					isLast={index === groupedMessages.length - 1} // Original direct access
					onHeightChange={handleRowHeightChange}
					isStreaming={isStreaming}
					onSuggestionClick={handleSuggestionClickInRow} // This was already stabilized
					onBatchFileResponse={handleBatchFileResponse}
					highlighted={highlightedMessageIndex === index} // kilocode_change: add highlight prop
					onFollowUpUnmount={handleFollowUpUnmount}
					isFollowUpAnswered={messageOrGroup.isAnswered === true || messageOrGroup.ts === currentFollowUpTs}
					editable={
						messageOrGroup.type === "ask" &&
						messageOrGroup.ask === "tool" &&
						(() => {
							let tool: any = {}
							try {
								tool = JSON.parse(messageOrGroup.text || "{}")
							} catch (_) {
								if (messageOrGroup.text?.includes("updateTodoList")) {
									tool = { tool: "updateTodoList" }
								}
							}
							if (tool.tool === "updateTodoList" && alwaysAllowUpdateTodoList) {
								return false
							}
							return tool.tool === "updateTodoList" && enableButtons && !!primaryButtonText
						})()
					}
				/>
			)
		},
		[
			expandedRows,
			toggleRowExpansion,
			modifiedMessages,
			groupedMessages.length,
			handleRowHeightChange,
			isStreaming,
			handleSuggestionClickInRow,
			handleBatchFileResponse,
			highlightedMessageIndex, // kilocode_change: add highlightedMessageIndex
			handleFollowUpUnmount,
			currentFollowUpTs,
			alwaysAllowUpdateTodoList,
			enableButtons,
			primaryButtonText,
		],
	)

	useEffect(() => {
		if (autoApproveTimeoutRef.current) {
			clearTimeout(autoApproveTimeoutRef.current)
			autoApproveTimeoutRef.current = null
		}

		if (!clineAsk || !enableButtons) {
			return
		}

		// Exit early if user has already responded
		if (userRespondedRef.current) {
			return
		}

		const autoApproveOrReject = async () => {
			// Check for auto-reject first (commands that should be denied)
			if (lastMessage?.ask === "command" && isDeniedCommand(lastMessage)) {
				// Get the denied prefix for the localized message
				const deniedPrefix = getDeniedPrefix(lastMessage.text || "")
				if (deniedPrefix) {
					// Create the localized auto-deny message and send it with the rejection
					const autoDenyMessage = tSettings("autoApprove.execute.autoDenied", { prefix: deniedPrefix })

					vscode.postMessage({
						type: "askResponse",
						askResponse: "noButtonClicked",
						text: autoDenyMessage,
					})
				} else {
					// Auto-reject denied commands immediately if no prefix found
					vscode.postMessage({ type: "askResponse", askResponse: "noButtonClicked" })
				}

				setSendingDisabled(true)
				setClineAsk(undefined)
				setEnableButtons(false)
				return
			}

			// Then check for auto-approve
			if (lastMessage?.ask && isAutoApproved(lastMessage)) {
				// Special handling for follow-up questions
				if (lastMessage.ask === "followup") {
					// Handle invalid JSON
					let followUpData: FollowUpData = {}
					try {
						followUpData = JSON.parse(lastMessage.text || "{}") as FollowUpData
					} catch (error) {
						console.error("Failed to parse follow-up data:", error)
						return
					}

					if (followUpData && followUpData.suggest && followUpData.suggest.length > 0) {
						// Wait for the configured timeout before auto-selecting the first suggestion
						await new Promise<void>((resolve) => {
							// kilocode_change start
							if (!isMountedRef.current) {
								resolve()
								return
							}
							autoApproveTimeoutRef.current = setTimeout(() => {
								if (!isMountedRef.current) {
									resolve()
									return
								}
								autoApproveTimeoutRef.current = null
								resolve()
							}, followupAutoApproveTimeoutMs)
							// kilocode_change end
						})

						// Check if user responded manually
						if (userRespondedRef.current) {
							return
						}

						// Get the first suggestion
						const firstSuggestion = followUpData.suggest[0]

						// Handle the suggestion click
						handleSuggestionClickInRow(firstSuggestion)
						return
					}
				} else if (lastMessage.ask === "tool" && isWriteToolAction(lastMessage)) {
					// kilocode_change start
					await new Promise<void>((resolve) => {
						if (!isMountedRef.current) {
							resolve()
							return
						}
						autoApproveTimeoutRef.current = setTimeout(() => {
							if (!isMountedRef.current) {
								resolve()
								return
							}
							autoApproveTimeoutRef.current = null
							resolve()
						}, writeDelayMs)
					})
					// kilocode_change end
				}

				vscode.postMessage({ type: "askResponse", askResponse: "yesButtonClicked" })

				setSendingDisabled(true)
				setClineAsk(undefined)
				setEnableButtons(false)
			}
		}
		autoApproveOrReject()

		return () => {
			if (autoApproveTimeoutRef.current) {
				clearTimeout(autoApproveTimeoutRef.current)
				autoApproveTimeoutRef.current = null
			}
		}
	}, [
		clineAsk,
		enableButtons,
		handlePrimaryButtonClick,
		alwaysAllowBrowser,
		alwaysAllowReadOnly,
		alwaysAllowReadOnlyOutsideWorkspace,
		alwaysAllowWrite,
		alwaysAllowWriteOutsideWorkspace,
		alwaysAllowExecute,
		followupAutoApproveTimeoutMs,
		alwaysAllowMcp,
		messages,
		allowedCommands,
		deniedCommands,
		mcpServers,
		isAutoApproved,
		lastMessage,
		writeDelayMs,
		isWriteToolAction,
		alwaysAllowFollowupQuestions,
		handleSuggestionClickInRow,
		isAllowedCommand,
		isDeniedCommand,
		getDeniedPrefix,
		tSettings,
	])

	// Function to handle mode switching
	const switchToNextMode = useCallback(() => {
		const allModes = getAllModes(customModes)
		const currentModeIndex = allModes.findIndex((m) => m.slug === mode)
		const nextModeIndex = (currentModeIndex + 1) % allModes.length
		// Update local state and notify extension to sync mode change
		switchToMode(allModes[nextModeIndex].slug)
	}, [mode, customModes, switchToMode])

	// Function to handle switching to previous mode
	const switchToPreviousMode = useCallback(() => {
		const allModes = getAllModes(customModes)
		const currentModeIndex = allModes.findIndex((m) => m.slug === mode)
		const previousModeIndex = (currentModeIndex - 1 + allModes.length) % allModes.length
		// Update local state and notify extension to sync mode change
		switchToMode(allModes[previousModeIndex].slug)
	}, [mode, customModes, switchToMode])

	// Add keyboard event handler
	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			// Check for Command/Ctrl + Period (with or without Shift)
			// Using event.key to respect keyboard layouts (e.g., Dvorak)
			if ((event.metaKey || event.ctrlKey) && event.key === ".") {
				event.preventDefault() // Prevent default browser behavior

				if (event.shiftKey) {
					// Shift + Period = Previous mode
					switchToPreviousMode()
				} else {
					// Just Period = Next mode
					switchToNextMode()
				}
			}
		},
		[switchToNextMode, switchToPreviousMode],
	)

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown)
		window.addEventListener("wheel", handleWheel, { passive: true }) // kilocode_change
		return () => {
			window.removeEventListener("keydown", handleKeyDown)
			window.removeEventListener("wheel", handleWheel) // kilocode_change
		}
	}, [handleKeyDown, handleWheel]) // kilocode_change

	useImperativeHandle(ref, () => ({
		acceptInput: () => {
			if (enableButtons && primaryButtonText) {
				handlePrimaryButtonClick(inputValue, selectedImages)
			} else if (!sendingDisabled && !isProfileDisabled && (inputValue.trim() || selectedImages.length > 0)) {
				handleSendMessage(inputValue, selectedImages)
			}
		},
		// kilocode_change start
		focusInput: () => {
			if (textAreaRef.current) {
				textAreaRef.current.focus()
			}
		},
		// kilocode_change end
	}))

	const handleCondenseContext = (taskId: string) => {
		if (isCondensing || sendingDisabled) {
			return
		}
		setIsCondensing(true)
		setSendingDisabled(true)
		vscode.postMessage({ type: "condenseTaskContextRequest", text: taskId })
	}

	const areButtonsVisible = showScrollToBottom || primaryButtonText || secondaryButtonText || isStreaming
	const primaryButtonIsStartNewTask = primaryButtonText === t("chat:startNewTask.title")
	const secondaryButtonIsStartNewTask = secondaryButtonText === t("chat:startNewTask.title")
	const primaryButtonClassName = primaryButtonIsStartNewTask
		? `flex-[2]${secondaryButtonText ? " mr-[6px]" : ""}`
		: secondaryButtonText
			? "flex-1 mr-[6px]"
			: "flex-[2]"
	const secondaryButtonClassName = secondaryButtonIsStartNewTask
		? `flex-[2]${primaryButtonText && !isStreaming ? " ml-[6px]" : ""}`
		: isStreaming
			? "flex-[2] ml-0"
			: "flex-1 ml-[6px]"

	const prechatContent = (
		<div className="prechat flex-1 min-h-0">
			<div className="prechat__scroll scrollbar-fade">
				<section className="prechat__hero">
					<div className="prechat__hero-body">
						<div className="prechat__hero-columns">
							<div className="prechat__hero-column prechat__hero-column--primary">
								<div className="prechat__badge" aria-hidden="true">
									<span>{brandMark}</span>
								</div>
								<p className="prechat__timestamp" aria-live="polite">
									{currentTimestamp}
								</p>
								<span className="prechat__greeting">
									{t("chatsHub.prechat.greeting", {
										defaultValue: "Welcome back, {{name}}.",
										name: greetingName,
									})}
								</span>
								<h1 className="prechat__headline">
									{t("chatsHub.hero.title", { defaultValue: "Start your next chat" })}
								</h1>
								<p className="prechat__lede">
									{t("chatsHub.hero.subtitle", {
										defaultValue:
											"Bring the right people into the conversation and share what matters most.",
									})}
								</p>
								{hasCompanies && (
									<div className="prechat__company">
										<label htmlFor="prechat-company" className="prechat__label">
											{t("kilocode:workplace.activeCompany", { defaultValue: "Active company" })}
										</label>
										<VSCodeDropdown
											id="prechat-company"
											value={selectedCompanyId}
											onChange={(event: any) => {
												const nextId =
													typeof event?.target?.value === "string"
														? event.target.value
														: undefined
												if (nextId) {
													handleCompanyChange(nextId)
												}
											}}
											className="prechat__dropdown">
											{companies.map((company) => (
												<VSCodeOption key={company.id} value={company.id}>
													{company.name}
												</VSCodeOption>
											))}
										</VSCodeDropdown>
									</div>
								)}
								<div className="prechat__mission-block">
									<div className="prechat__mission-header">
										<span className="prechat__label">
											{t("chatsHub.prechat.missionTitle", { defaultValue: "Company mission" })}
										</span>
										{activeCompany && !isMissionEditing && (
											<VSCodeButton
												appearance="secondary"
												onClick={() => {
													setIsMissionEditing(true)
													setMissionStatus("idle")
												}}
											>
												{t("kilocode:workplace.editMission", { defaultValue: "Edit" })}
											</VSCodeButton>
										)}
									</div>
									{isMissionEditing ? (
										<>
											<VSCodeTextArea
												value={missionDraft}
												rows={3}
												onInput={(event: any) =>
													setMissionDraft(
														typeof event?.target?.value === "string" ? event.target.value : "",
													)
												}
												placeholder={t("kilocode:workplace.missionPlaceholder", {
													defaultValue:
														"Outline the purpose or focus for this conversation.",
												})}
											/>
											<div className="prechat__button-row prechat__mission-actions">
												<VSCodeButton appearance="primary" onClick={handleMissionSave}>
													{t("kilocode:workplace.saveMission", { defaultValue: "Save" })}
												</VSCodeButton>
												<VSCodeButton appearance="secondary" onClick={handleMissionCancel}>
													{t("kilocode:workplace.cancelEdit", { defaultValue: "Cancel" })}
												</VSCodeButton>
											</div>
										</>
									) : (
										<>
											<p className="prechat__mission-copy">
												{companySummary ||
													t("chatsHub.prechat.missionEmpty", {
														defaultValue:
															"Add a short note so everyone knows what success looks like.",
													})}
											</p>
											{missionStatus === "saved" && (
												<span className="prechat__status-pill">
													{t("kilocode:workplace.missionSaved", { defaultValue: "Mission updated" })}
												</span>
											)}
										</>
									)}
								</div>
							</div>
							<div className="prechat__hero-column prechat__hero-column--secondary">
								<div className="prechat__lead">
									<span className="prechat__label">
										{t("chatsHub.prechat.leadLabel", { defaultValue: "Lead voice" })}
									</span>
									<VSCodeDropdown
										value={displayPersonaId ?? ""}
										onChange={(event: any) => {
											const nextId =
												typeof event?.target?.value === "string"
													? event.target.value
													: undefined
											if (nextId) {
												handlePersonaChange(nextId)
											}
										}}
										className="prechat__lead-select"
										disabled={!companyEmployees.length}>
										{companyEmployees.map((employee) => (
											<VSCodeOption key={employee.id} value={employee.id}>
												{employee.name}
											</VSCodeOption>
										))}
									</VSCodeDropdown>
								</div>
								<div className="prechat__participants">
									<span className="prechat__label">
										{t("chatsHub.prechat.participantsLabel", { defaultValue: "People in the space" })}
									</span>
									<div className="prechat__chip-row">
										{hasActiveParticipants ? (
											activeParticipantEntries.map((participant) => (
												<div key={participant.id} className="prechat__chip">
													<span className="prechat__chip-avatar">
														{participant.name?.[0]?.toUpperCase() ?? "?"}
													</span>
													<span className="prechat__chip-text">
														<span className="prechat__chip-name">{participant.name}</span>
														{participant.role && (
															<span className="prechat__chip-role">{participant.role}</span>
														)}
													</span>
													{participant.id !== displayPersonaId && (
														<button
															type="button"
															className="prechat__chip-remove"
															onClick={() => toggleGroupParticipant(participant.id)}
															aria-label={t("chatsHub.prechat.removeParticipant", {
																defaultValue: "Remove participant",
															})}>
															<span className="codicon codicon-close" aria-hidden="true" />
														</button>
													)}
												</div>
											))
										) : (
											<span className="prechat__empty-copy">
												{t("chatsHub.participants.placeholder", { defaultValue: "No participants selected yet." })}
											</span>
										)}
										<div className="prechat__add-wrapper" ref={addMenuRef}>
											<button
												type="button"
												className="prechat__chip prechat__chip--add"
												disabled={!hasSelectableEmployees}
												onClick={() => setIsAddMenuOpen((open) => !open)}>
												<span className="codicon codicon-person-add" aria-hidden="true"></span>
												<span>{t("chatsHub.prechat.addParticipant", { defaultValue: "Add" })}</span>
											</button>
											{isAddMenuOpen && hasSelectableEmployees && (
												<div className="prechat__add-menu">
													<ul className="prechat__add-list">
														{selectableEmployees.map((employee) => (
															<li key={employee.id}>
																<button
																	type="button"
																	className="prechat__add-option"
																	onClick={() => {
																		toggleGroupParticipant(employee.id)
																		setIsAddMenuOpen(false)
																	}}
																>
																	<span className="prechat__add-avatar">{employee.name?.[0]?.toUpperCase() ?? "?"}</span>
																	<span className="prechat__add-text">
																		<span className="prechat__add-name">{employee.name}</span>
																		{employee.role && <span className="prechat__add-role">{employee.role}</span>}
																	</span>
																</button>
															</li>
														))}
													</ul>
												</div>
											)}
										</div>
									</div>
								</div>
								<div className="prechat__stats-row">
									<ul className="prechat__stats">
										<li>
											<span className="prechat__stat-value">{prechatStats.employeeCount}</span>
											<span className="prechat__stat-label">
												{t("chatsHub.prechat.statPeople", { defaultValue: "people ready" })}
											</span>
										</li>
										<li>
											<span className="prechat__stat-value">{prechatStats.teamCount}</span>
											<span className="prechat__stat-label">
												{t("chatsHub.prechat.statTeams", { defaultValue: "teams active" })}
											</span>
										</li>
										<li>
											<span className="prechat__stat-value">{prechatStats.departmentCount}</span>
											<span className="prechat__stat-label">
												{t("chatsHub.prechat.statDepartments", { defaultValue: "departments" })}
											</span>
										</li>
									</ul>
								</div>
								{orchestratedPrimaryAgents.length > 0 && (
									<div className="prechat__meta prechat__meta--recommended">
										<span className="prechat__label">
											{t("chatsHub.prechat.recommended", { defaultValue: "Recommended voices" })}
										</span>
										<span className="prechat__meta-value">{orchestratedPrimaryAgents.join(", ")}</span>
									</div>
								)}
								{hasSuggestedCollaborators && (
									<div className="prechat__suggestions prechat__suggestions--inline">
										<span className="prechat__label">
											{t("chatsHub.prechat.suggestedTitle", { defaultValue: "Suggested collaborators" })}
										</span>
										<div className="prechat__suggestion-row">
											{suggestedCollaborators.map((employee) => (
												<button
													key={employee.id}
													type="button"
													className="prechat__suggestion-chip"
													onClick={() => toggleGroupParticipant(employee.id)}>
													<span className="prechat__suggestion-avatar">{employee.name?.[0]?.toUpperCase() ?? "?"}</span>
													<span className="prechat__suggestion-meta">
														<span className="prechat__person-name">{employee.name}</span>
														{employee.role && (
															<span className="prechat__person-role">{employee.role}</span>
														)}
													</span>
												</button>
											))}
										</div>
									</div>
								)}
							</div>
						</div>
						<div className="prechat__hero-actions">
							<VSCodeButton appearance="primary" onClick={handleLaunchConversation}>
								{t("chatsHub.hero.primaryCta", { defaultValue: "Start chat" })}
							</VSCodeButton>
						</div>
					</div>
				</section>
				<section className="prechat__grid prechat__grid--secondary">
					<article className="prechat__card prechat__card--recents">
						<header className="prechat__card-header prechat__card-header--inline">
							<div>
								<span className="prechat__eyebrow">
									{t("chatsHub.recent.title", { defaultValue: "Recent chats" })}
								</span>
								<h2 className="prechat__card-title">
									{t("chatsHub.prechat.recentsTitle", {
										defaultValue: "Pick up where you left off",
									})}
								</h2>
							</div>
							<VSCodeButton
								appearance="secondary"
								onClick={() => vscode.postMessage({ type: "switchTab", tab: "history" })}>
								{t("chatsHub.recent.openHistory", { defaultValue: "View history" })}
							</VSCodeButton>
						</header>
						<div className="prechat__card-body prechat__card-body--stack">
							{hasRecentChatHistory ? (
								recentChatHistory.map((historyItem) => (
									<TaskItem
										key={historyItem.id}
										item={historyItem}
										variant="compact"
										className="prechat__recent-task"
									/>
								))
							) : (
								<p className="prechat__empty-copy">
									{t("chatsHub.recent.empty", {
										defaultValue:
											"No conversations yet. Your next briefing will show up here.",
									})}
								</p>
							)}
						</div>
					</article>
				</section>
			</div>
		</div>
	);

	return (
		<div
			data-testid="chat-view"
			className={
				isHidden
					? "hidden"
					: "golden-chat-root fixed top-0 left-0 right-0 bottom-0 flex flex-col overflow-hidden"
			}>
			{(showAnnouncement || showAnnouncementModal) && (
				<Announcement
					hideAnnouncement={() => {
						if (showAnnouncementModal) {
							setShowAnnouncementModal(false)
						}
						if (showAnnouncement) {
							hideAnnouncement()
						}
					}}
				/>
			)}
			<div className="flex flex-1 min-h-0 flex-col overflow-hidden">
				{task ? (
					<div className="flex flex-1 min-h-0 flex-col gap-3 px-3 pb-3 lg:flex-row lg:gap-4">
						<div className="flex flex-1 min-h-0 flex-col gap-3 overflow-hidden">
							<KiloTaskHeader
								task={task}
								tokensIn={apiMetrics.totalTokensIn}
								tokensOut={apiMetrics.totalTokensOut}
								cacheWrites={apiMetrics.totalCacheWrites}
								cacheReads={apiMetrics.totalCacheReads}
								totalCost={apiMetrics.totalCost}
								contextTokens={apiMetrics.contextTokens}
								buttonsDisabled={sendingDisabled}
								handleCondenseContext={handleCondenseContext}
								onClose={handleTaskCloseButtonClick}
								groupedMessages={groupedMessages}
								onMessageClick={handleMessageClick}
								isTaskActive={sendingDisabled}
								todos={latestTodos}
							/>
							{hasPersonaOptions && (
								<div className="rounded-xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_35%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] px-3 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.22)] lg:px-4 lg:py-4">
									<div className="flex flex-col gap-3">
										<span className="text-xs font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
											{t("kilocode:chat.personaPicker.label", { defaultValue: "Speaking with" })}
										</span>
										<div className="flex flex-wrap items-center gap-2">
											<VSCodeDropdown
												value={displayPersonaId ?? ""}
												onChange={(event: any) => {
													const nextId =
													typeof event?.target?.value === "string"
														? event.target.value
														: undefined
												if (nextId) {
													handlePersonaChange(nextId)
												}
											}}
											className="min-w-[180px]">
											{companyEmployees.map((employee) => (
												<VSCodeOption key={employee.id} value={employee.id}>
													{employee.name}
												</VSCodeOption>
											))}
											</VSCodeDropdown>
											{activePersona && (
												<StandardTooltip
													content={
														activePersona.description ||
														activePersona.personality ||
														t("kilocode:chat.personaPicker.noPersonaDetails", {
															defaultValue: "No persona details provided.",
														})
												}>
													<span className="text-[10px] uppercase tracking-wide text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_85%,transparent)] border border-[color-mix(in_srgb,var(--vscode-descriptionForeground)_35%,transparent)] rounded px-1 py-[2px] truncate max-w-[220px]">
														{activePersona.role ||
															t("kilocode:chat.personaPicker.noRole", {
															defaultValue: "No role set",
														})}
													</span>
												</StandardTooltip>
											)}
										</div>
									</div>
								</div>
							)}
							<div className="lg:hidden">
								<GroupParticipantsPanel
									employees={companyEmployees}
									selectedIds={activeParticipantIds}
									activeSpeakerId={displayPersonaId}
									onToggleParticipant={toggleGroupParticipant}
									mutedIds={mutedParticipantIds}
									priorityIds={priorityParticipantIds}
									onToggleMute={toggleParticipantMuteState}
									onTogglePriority={toggleParticipantPriorityState}
								/>
							</div>

							{hasSystemPromptOverride && (
								<div className="rounded-xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_32%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] px-4 py-3">
									<SystemPromptWarning />
								</div>
							)}

							{showCheckpointWarning && (
								<div className="rounded-xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_32%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,transparent)] px-4 py-3">
									<CheckpointWarning />
								</div>
							)}
							<div className="grow flex golden-chat-stream-container" ref={scrollContainerRef}>
								<Virtuoso
									ref={virtuosoRef}
									key={task.ts}
									className="golden-chat-stream scrollable scrollbar-fade grow overflow-y-scroll"
									increaseViewportBy={{ top: 400, bottom: 400 }}
									data={groupedMessages}
									itemContent={itemContent}
									atBottomStateChange={(isAtBottom: boolean) => {
										setIsAtBottom(isAtBottom)
										if (isAtBottom) {
											disableAutoScrollRef.current = false
										}
										setShowScrollToBottom(disableAutoScrollRef.current && !isAtBottom)
									}}
									atBottomThreshold={10}
									initialTopMostItemIndex={groupedMessages.length - 1}
								/>
							</div>
							{areButtonsVisible && (
								<div
									className={`flex h-9 items-center px-[15px] ${
										showScrollToBottom
											? "opacity-100"
											: enableButtons || (isStreaming && !didClickCancel)
												? "opacity-100"
												: "opacity-50"
										}`}>
									{showScrollToBottom ? (
										<StandardTooltip content={t("chat:scrollToBottom")}>
											<VSCodeButton
												appearance="secondary"
												className="flex-[2]"
												onClick={() => {
													scrollToBottomSmooth()
													disableAutoScrollRef.current = false
												}}>
												<span className="codicon codicon-chevron-down"></span>
											</VSCodeButton>
										</StandardTooltip>
									) : (
										<>
											{primaryButtonText && !isStreaming && (
												<StandardTooltip
													content={
														primaryButtonText === t("chat:retry.title")
															? t("chat:retry.tooltip")
														: primaryButtonText === t("chat:save.title")
															? t("chat:save.tooltip")
															: primaryButtonText === t("chat:approve.title")
																? t("chat:approve.tooltip")
																: primaryButtonText === t("chat:runCommand.title")
																	? t("chat:runCommand.tooltip")
																: primaryButtonText === t("chat:startNewTask.title")
																		? t("chat:startNewTask.tooltip")
																		: primaryButtonText === t("chat:resumeTask.title")
																			? t("chat:resumeTask.tooltip")
																			: primaryButtonText === t("chat:proceedAnyways.title")
																				? t("chat:proceedAnyways.tooltip")
																				: primaryButtonText === t("chat:proceedWhileRunning.title")
																					? t("chat:proceedWhileRunning.tooltip")
																					: undefined
													}>
												<VSCodeButton
													appearance={primaryButtonIsStartNewTask ? "secondary" : "primary"}
													disabled={!enableButtons}
													className={primaryButtonClassName}
													onClick={() => handlePrimaryButtonClick(inputValue, selectedImages)}>
													{primaryButtonText}
												</VSCodeButton>
											</StandardTooltip>
											)}
											{(secondaryButtonText || isStreaming) && (
												<StandardTooltip
													content={
														isStreaming
															? t("chat:cancel.tooltip")
														: secondaryButtonText === t("chat:startNewTask.title")
															? t("chat:startNewTask.tooltip")
															: secondaryButtonText === t("chat:reject.title")
																? t("chat:reject.tooltip")
																: secondaryButtonText === t("chat:terminate.title")
																	? t("chat:terminate.tooltip")
																	: undefined
													}>
												<VSCodeButton
													appearance="secondary"
													disabled={!enableButtons && !(isStreaming && !didClickCancel)}
													className={secondaryButtonClassName}
													onClick={() => handleSecondaryButtonClick(inputValue, selectedImages)}>
													{isStreaming ? t("chat:cancel.title") : secondaryButtonText}
												</VSCodeButton>
											</StandardTooltip>
											)}
										</>
									)}
								</div>
							)}
						</div>
						<aside className="hidden flex-shrink-0 lg:flex lg:w-72 xl:w-80">
							<div className="flex w-full flex-col gap-3">
								<GroupParticipantsPanel
									employees={companyEmployees}
									selectedIds={activeParticipantIds}
									activeSpeakerId={displayPersonaId}
									onToggleParticipant={toggleGroupParticipant}
									mutedIds={mutedParticipantIds}
									priorityIds={priorityParticipantIds}
									onToggleMute={toggleParticipantMuteState}
									onTogglePriority={toggleParticipantPriorityState}
								/>
							</div>
						</aside>
					</div>
				) : (
					prechatContent
				)}
			</div>

			<footer className="flex flex-col gap-3 border-t border-[color-mix(in_srgb,var(--vscode-panel-border)_25%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] px-3 pb-4 pt-3">
				<QueuedMessages
					queue={messageQueue}
					onRemove={(index: number) => {
						if (messageQueue[index]) {
							vscode.postMessage({ type: "removeQueuedMessage", text: messageQueue[index].id })
						}
					}}
					onUpdate={(index: number, newText: string) => {
						if (messageQueue[index]) {
							vscode.postMessage({
								type: "editQueuedMessage",
								payload: { id: messageQueue[index].id, text: newText, images: messageQueue[index].images },
							})
						}
					}}
				/>
				<div className="flex flex-col gap-2 rounded-lg border border-[color-mix(in_srgb,var(--vscode-panel-border)_28%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] px-3 py-2 text-[11px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_90%,transparent)]">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<span>{holdHintCopy}</span>
						<VSCodeButton appearance={isManualHoldActive ? "primary" : "secondary"} onClick={handleHoldToggle}>
							{isManualHoldActive
								? t("chatsHub.hold.resumeAll", { defaultValue: "Resume All" })
								: t("chatsHub.hold.holdAll", { defaultValue: "Hold All" })}
						</VSCodeButton>
					</div>
					{holdMode !== "idle" && holdBannerCopy && (
						<div className="flex flex-col gap-2 rounded-md border border-[color-mix(in_srgb,var(--vscode-panel-border)_40%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,transparent)] px-3 py-2">
							<span>{holdBannerCopy}</span>
							{isManualHoldActive && (
								<div className="flex flex-wrap items-center gap-2">
									<VSCodeDropdown
										value={resumeAgentId}
										onChange={(event: any) => {
											const nextValue = typeof event?.target?.value === "string" ? event.target.value : ""
											setResumeAgentId(nextValue)
										}}
										className="min-w-[160px]">
										<VSCodeOption value="">
											{t("chatsHub.hold.resumeAllOption", { defaultValue: "All participants" })}
										</VSCodeOption>
										{conversationAgents.map((agent) => (
											<VSCodeOption key={agent.id} value={agent.id}>
												{agent.name}
											</VSCodeOption>
										))}
									</VSCodeDropdown>
									<VSCodeButton appearance="secondary" onClick={handleResumeWith}>
										{resumeAgentId
											? t("chatsHub.hold.resumeWith", { defaultValue: "Resume With" })
											: t("chatsHub.hold.resume", { defaultValue: "Resume" })}
									</VSCodeButton>
								</div>
							)}
						</div>
					)}
				</div>
				<ChatTextArea
					ref={textAreaRef}
					inputValue={inputValue}
					setInputValue={setInputValue}
					sendingDisabled={sendingDisabled || isProfileDisabled}
					selectApiConfigDisabled={sendingDisabled && clineAsk !== "api_req_failed"}
					placeholderText={placeholderText}
					selectedImages={selectedImages}
					setSelectedImages={setSelectedImages}
					onSend={() => handleSendMessage(inputValue, selectedImages)}
					onSelectImages={selectImages}
					shouldDisableImages={shouldDisableImages}
					onHeightChange={() => {
						if (isAtBottom) {
							scrollToBottomAuto()
						}
					}}
					mode={mode}
					setMode={setMode}
					modeShortcutText={modeShortcutText}
				/>
				<BottomControls showApiConfig />
			</footer>

			{/* kilocode_change: disable {isProfileDisabled && (
				<div className="px-3">
					<ProfileViolationWarning />
				</div>
			)} */}

			<div id="roo-portal" />
		</div>
	)
}

const ChatHubChatView = forwardRef(ChatHubChatViewComponent)

export default ChatHubChatView
