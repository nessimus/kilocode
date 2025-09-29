import React, { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useEvent } from "react-use"
import DynamicTextArea from "react-textarea-autosize"

import { mentionRegex, mentionRegexGlobal, unescapeSpaces } from "@roo/context-mentions"
import { WebviewMessage } from "@roo/WebviewMessage"
import { Mode, getAllModes } from "@roo/modes"
import { ExtensionMessage } from "@roo/ExtensionMessage"

import { vscode } from "@/utils/vscode"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useAppTranslation } from "@/i18n/TranslationContext"
import {
	ContextMenuOptionType,
	getContextMenuOptions,
	insertMention,
	removeMention,
	shouldShowContextMenu,
	SearchResult,
} from "@src/utils/context-mentions"
import { convertToMentionPath } from "@/utils/path-mentions"
import { DropdownOptionType, Button, StandardTooltip } from "@/components/ui" // kilocode_change

import Thumbnails from "../common/Thumbnails"
import { ModeSelector } from "./ModeSelector"
import KiloModeSelector from "../kilocode/KiloModeSelector"
import { KiloProfileSelector } from "../kilocode/chat/KiloProfileSelector" // kilocode_change
import { MAX_IMAGES_PER_MESSAGE } from "./ChatView"
import ContextMenu from "./ContextMenu"
import { ImageWarningBanner } from "./ImageWarningBanner" // kilocode_change
import {
	VolumeX,
	Pin,
	Check,
	// Image, // kilocode_change
	WandSparkles,
	Paperclip, // kilocode_change
	Mic,
	MicOff,
	Phone,
	PhoneOff,
	Loader2,
} from "lucide-react"
import { IndexingStatusBadge } from "./IndexingStatusBadge"
import { cn } from "@/lib/utils"
import { usePromptHistory } from "./hooks/usePromptHistory"
import { EditModeControls } from "./EditModeControls"
import { ChatSendButton } from "./ChatSendButton"
import { showSystemNotification } from "@/kilocode/helpers"

// Minimal subset of the Web Speech API we rely on for voice drafting support.
interface WebSpeechRecognition {
	lang: string
	continuous: boolean
	interimResults: boolean
	start: () => void
	stop: () => void
	abort?: () => void
	onresult: ((event: any) => void) | null
	onerror: ((event: any) => void) | null
	onend: (() => void) | null
}

type WebSpeechRecognitionConstructor = new () => WebSpeechRecognition

type CursorMediaTrackConstraints = MediaTrackConstraints & {
	cursor?: "always" | "motion" | "never"
}

// kilocode_change start: pull slash commands from Cline
import SlashCommandMenu from "@/components/chat/SlashCommandMenu"
import {
	SlashCommand,
	shouldShowSlashCommandsMenu,
	getMatchingSlashCommands,
	insertSlashCommand,
	validateSlashCommand,
} from "@/utils/slash-commands"
// kilocode_change end

type RealtimeStatus = "idle" | "requesting" | "connecting" | "active"

interface ChatTextAreaProps {
	inputValue: string
	setInputValue: (value: string) => void
	sendingDisabled: boolean
	selectApiConfigDisabled: boolean
	placeholderText: string
	selectedImages: string[]
	setSelectedImages: React.Dispatch<React.SetStateAction<string[]>>
	onSend: () => void
	sendButtonState?: "send" | "stop"
	onStop?: () => void
	onSelectImages: () => void
	shouldDisableImages: boolean
	onHeightChange?: (height: number) => void
	mode: Mode
	setMode: (value: Mode) => void
	modeShortcutText: string
	// Edit mode props
	isEditMode?: boolean
	onCancel?: () => void
}

export const ChatTextArea = forwardRef<HTMLTextAreaElement, ChatTextAreaProps>(
	(
		{
			inputValue,
			setInputValue,
			sendingDisabled,
			selectApiConfigDisabled,
			placeholderText,
			selectedImages,
			setSelectedImages,
			onSend,
			sendButtonState = "send",
			onStop,
			onSelectImages,
			shouldDisableImages,
			onHeightChange,
			mode,
			setMode,
			modeShortcutText,
			isEditMode = false,
			onCancel,
		},
		ref,
	) => {
		const { t } = useAppTranslation()
		const {
			filePaths,
			openedTabs,
			currentApiConfigName,
			listApiConfigMeta,
			customModes,
			customModePrompts,
			cwd,
			pinnedApiConfigs,
			togglePinnedApiConfig,
			localWorkflows, // kilocode_change
			globalWorkflows, // kilocode_change
			taskHistory,
			clineMessages,
		} = useExtensionState()

		// Find the ID and display text for the currently selected API configuration
		const { currentConfigId, displayName } = useMemo(() => {
			const currentConfig = listApiConfigMeta?.find((config) => config.name === currentApiConfigName)
			return {
				currentConfigId: currentConfig?.id || "",
				displayName: currentApiConfigName || "", // Use the name directly for display
			}
		}, [listApiConfigMeta, currentApiConfigName])

		const sendMessageLabel = (t("chat:sendMessage") ?? "Send Message") as string
		const stopMessageLabel = t("common:stop", { defaultValue: "Stop" }) as string
		const isStopState = sendButtonState === "stop"
		const sendButtonLabel = isStopState ? stopMessageLabel : sendMessageLabel
		const sendButtonDisabled = isStopState ? false : sendingDisabled
		const sendButtonHandler = isStopState ? (onStop ?? onSend) : onSend

		const [gitCommits, setGitCommits] = useState<any[]>([])
		const [showDropdown, setShowDropdown] = useState(false)
		const [fileSearchResults, setFileSearchResults] = useState<SearchResult[]>([])

		// kilocode_change begin: remove button from chat when it gets to small
		const [containerWidth, setContainerWidth] = useState<number>(300) // Default to a value larger than our threshold

		const containerRef = useRef<HTMLDivElement>(null)

		useEffect(() => {
			if (!containerRef.current) return

			// Check if ResizeObserver is available (it won't be in test environment)
			if (typeof ResizeObserver === "undefined") return

			const resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					const width = entry.contentRect.width
					setContainerWidth(width)
				}
			})

			resizeObserver.observe(containerRef.current)

			return () => {
				resizeObserver.disconnect()
			}
		}, [])
		// kilocode_change end

		const [searchLoading, setSearchLoading] = useState(false)
		const [searchRequestId, setSearchRequestId] = useState<string>("")

		const speechRecognitionConstructor = useMemo<WebSpeechRecognitionConstructor | null>(() => {
			const w = window as unknown as {
				SpeechRecognition?: WebSpeechRecognitionConstructor
				webkitSpeechRecognition?: WebSpeechRecognitionConstructor
			}
			return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
		}, [])
		const isSpeechSupported = speechRecognitionConstructor !== null
		const [isListening, setIsListening] = useState(false)
		const [speechError, setSpeechError] = useState<string | null>(null)
		const recognitionRef = useRef<WebSpeechRecognition | null>(null)
		const speechAccumulatedValueRef = useRef<string>("")
		const inputValueLiveRef = useRef(inputValue)

		const realtimeStreamsRef = useRef<{ mic?: MediaStream; screen?: MediaStream }>({})
		const realtimeSessionIdRef = useRef<string | null>(null)
		const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("idle")
		const logRealtime = (...args: any[]) => {
			console.info("[Realtime][UI]", ...args)
		}

		const supportsAudioCapture =
			typeof navigator !== "undefined" &&
			navigator.mediaDevices !== undefined &&
			typeof navigator.mediaDevices.getUserMedia === "function"

		const supportsScreenCapture =
			typeof navigator !== "undefined" &&
			navigator.mediaDevices !== undefined &&
			typeof navigator.mediaDevices.getDisplayMedia === "function"

		const isRealtimeSupported = supportsAudioCapture

		const modeSlug = useMemo(() => {
			if (mode && typeof mode === "object" && mode !== null && "slug" in mode) {
				const { slug } = mode as { slug?: string }
				return slug ?? undefined
			}
			return undefined
		}, [mode])

		const cleanupRealtime = useCallback(
			(options?: { notifyExtension?: boolean; suppressStateReset?: boolean }) => {
				const { notifyExtension = false, suppressStateReset = false } = options ?? {}
				const { mic, screen } = realtimeStreamsRef.current

				logRealtime("cleanup:start", {
					notifyExtension,
					suppressStateReset,
					hasMic: Boolean(mic),
					hasScreen: Boolean(screen),
				})

				if (mic) {
					mic.getTracks().forEach((track) => track.stop())
					logRealtime("cleanup:stopped-mic-tracks")
				}

				if (screen) {
					screen.getTracks().forEach((track) => track.stop())
					logRealtime("cleanup:stopped-screen-tracks")
				}

				realtimeStreamsRef.current = {}
				realtimeSessionIdRef.current = null

				if (!suppressStateReset) {
					setRealtimeStatus("idle")
				}

				if (notifyExtension) {
					logRealtime("cleanup:notify-extension")
					vscode.postMessage({ type: "stopRealtimeSession" })
				}
			},
			[logRealtime],
		)

		// Close dropdown when clicking outside.
		useEffect(() => {
			const handleClickOutside = () => {
				if (showDropdown) {
					setShowDropdown(false)
				}
			}

			document.addEventListener("mousedown", handleClickOutside)
			return () => document.removeEventListener("mousedown", handleClickOutside)
		}, [showDropdown])

		// Handle enhanced prompt response and search results.
		useEffect(() => {
			const messageHandler = (event: MessageEvent) => {
				const message = event.data

				if (message.type === "enhancedPrompt") {
					if (message.text && textAreaRef.current) {
						try {
							// Use execCommand to replace text while preserving undo history
							if (document.execCommand) {
								// Use native browser methods to preserve undo stack
								const textarea = textAreaRef.current

								// Focus the textarea to ensure it's the active element
								textarea.focus()

								// Select all text first
								textarea.select()
								document.execCommand("insertText", false, message.text)
							} else {
								setInputValue(message.text)
							}
						} catch {
							setInputValue(message.text)
						}
					}

					setIsEnhancingPrompt(false)
				} else if (message.type === "commitSearchResults") {
					const commits = message.commits.map((commit: any) => ({
						type: ContextMenuOptionType.Git,
						value: commit.hash,
						label: commit.subject,
						description: `${commit.shortHash} by ${commit.author} on ${commit.date}`,
						icon: "$(git-commit)",
					}))

					setGitCommits(commits)
				} else if (message.type === "fileSearchResults") {
					setSearchLoading(false)
					if (message.requestId === searchRequestId) {
						setFileSearchResults(message.results || [])
					}
					// kilocode_change start
				} else if (message.type === "insertTextToChatArea") {
					if (message.text) {
						setInputValue(message.text)
						setTimeout(() => {
							if (textAreaRef.current) {
								textAreaRef.current.focus()
							}
						}, 0)
					}
				} else if (message.type === "realtimeSessionCredentials") {
					const values = (message.values ?? {}) as { sessionId?: string }
					realtimeSessionIdRef.current = typeof values.sessionId === "string" ? values.sessionId : null
					logRealtime("message:credentials", values)
					setRealtimeStatus("active")
				} else if (message.type === "realtimeSessionEnded") {
					logRealtime("message:ended")
					realtimeSessionIdRef.current = null
					cleanupRealtime()
				} else if (message.type === "realtimeSessionError") {
					realtimeSessionIdRef.current = null
					logRealtime("message:error", message.text)
					cleanupRealtime()
					const errorMessage =
						typeof message.text === "string" && message.text.trim().length > 0
							? message.text
							: t("chat:realtimeSessionError")
					showSystemNotification(errorMessage)
				}
				// kilocode_change end
			}

			window.addEventListener("message", messageHandler)
			return () => window.removeEventListener("message", messageHandler)
		}, [cleanupRealtime, logRealtime, searchRequestId, setInputValue, t])

		const requestRealtimeSession = useCallback(async () => {
			if (!isRealtimeSupported || typeof navigator === "undefined" || !navigator.mediaDevices) {
				showSystemNotification(t("chat:realtimeUnsupported"))
				return
			}

			logRealtime("request:start")

			setRealtimeStatus("requesting")

			let micStream: MediaStream | undefined
			try {
				const getUserMedia = navigator.mediaDevices.getUserMedia?.bind(navigator.mediaDevices)
				if (!getUserMedia) {
					throw new Error("getUserMedia not available")
				}
				micStream = await getUserMedia({ audio: true, video: false })
				logRealtime("request:microphone-granted", {
					trackCount: micStream.getTracks().length,
				})
			} catch (error) {
				setRealtimeStatus("idle")
				const errorMessage =
					error instanceof DOMException &&
					(error.name === "NotAllowedError" || error.name === "SecurityError")
						? t("chat:realtimePermissionDenied")
						: t("chat:realtimeSessionError")
				logRealtime("request:microphone-denied", { error })
				showSystemNotification(errorMessage)
				return
			}

			if (!supportsScreenCapture || !navigator.mediaDevices) {
				micStream.getTracks().forEach((track) => track.stop())
				setRealtimeStatus("idle")
				showSystemNotification(t("chat:realtimeScreenUnsupported"))
				return
			}

			let screenStream: MediaStream | undefined
			try {
				const getDisplayMedia = navigator.mediaDevices.getDisplayMedia?.bind(navigator.mediaDevices)
				if (!getDisplayMedia) {
					throw new Error("getDisplayMedia not available")
				}
					screenStream = await getDisplayMedia({
						video: {
							frameRate: { ideal: 15, max: 30 },
							cursor: "always",
						} as CursorMediaTrackConstraints,
						audio: false,
					})
				logRealtime("request:screen-granted", {
					trackCount: screenStream.getTracks().length,
				})
			} catch (error) {
				micStream.getTracks().forEach((track) => track.stop())
				setRealtimeStatus("idle")
				const errorMessage =
					error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError")
						? t("chat:realtimeScreenPermissionDenied")
						: t("chat:realtimeSessionError")
				logRealtime("request:screen-denied", { error })
				showSystemNotification(errorMessage)
				return
			}

			realtimeStreamsRef.current = { mic: micStream, screen: screenStream }
			setRealtimeStatus("connecting")
			logRealtime("request:streams-ready", {
				hasMic: Boolean(micStream),
				hasScreen: Boolean(screenStream),
			})

			const sessionValues: Record<string, any> = {
				enableScreenShare: Boolean(screenStream),
			}
			if (modeSlug) {
				sessionValues.modeSlug = modeSlug
			}

			logRealtime("request:postMessage", sessionValues)
			vscode.postMessage({ type: "startRealtimeSession", values: sessionValues })
		}, [isRealtimeSupported, logRealtime, modeSlug, supportsScreenCapture, t])

		const handleRealtimeButtonClick = useCallback(() => {
			if (realtimeStatus === "active" || realtimeStatus === "connecting") {
				logRealtime("button:stop", { currentStatus: realtimeStatus, sessionId: realtimeSessionIdRef.current })
				cleanupRealtime({ notifyExtension: true })
				return
			}
			if (realtimeStatus !== "idle") {
				logRealtime("button:ignored", { currentStatus: realtimeStatus })
				return
			}
			if (!isRealtimeSupported) {
				logRealtime("button:unsupported")
				showSystemNotification(t("chat:realtimeUnsupported"))
				return
			}
			logRealtime("button:start")
			void requestRealtimeSession()
		}, [cleanupRealtime, isRealtimeSupported, logRealtime, realtimeStatus, requestRealtimeSession, t])

		const realtimeTooltip = useMemo(() => {
			if (!isRealtimeSupported) {
				return t("chat:realtimeUnsupported")
			}
			switch (realtimeStatus) {
				case "idle":
					return t("chat:startRealtimeSession")
				case "requesting":
					return t("chat:realtimeSessionStarting")
				case "connecting":
				case "active":
					return t("chat:stopRealtimeSession")
				default:
					return t("chat:startRealtimeSession")
			}
		}, [isRealtimeSupported, realtimeStatus, t])

		const isRealtimeActive = realtimeStatus === "active"
		const isRealtimeConnecting = realtimeStatus === "connecting"
		const isRealtimeRequesting = realtimeStatus === "requesting"
		const isRealtimePending = isRealtimeRequesting || isRealtimeConnecting

		useEffect(() => {
			return () => {
				if (realtimeStatus !== "idle") {
					logRealtime("component:unmount-cleanup", { status: realtimeStatus })
					cleanupRealtime({ notifyExtension: true, suppressStateReset: true })
				}
			}
		}, [cleanupRealtime, logRealtime, realtimeStatus])

		const [isDraggingOver, setIsDraggingOver] = useState(false)
		// kilocode_change start: pull slash commands from Cline
		const [showSlashCommandsMenu, setShowSlashCommandsMenu] = useState(false)
		const [selectedSlashCommandsIndex, setSelectedSlashCommandsIndex] = useState(0)
		const [slashCommandsQuery, setSlashCommandsQuery] = useState("")
		const slashCommandsMenuContainerRef = useRef<HTMLDivElement>(null)
		// kilocode_end
		const [textAreaBaseHeight, setTextAreaBaseHeight] = useState<number | undefined>(undefined)
		const [showContextMenu, setShowContextMenu] = useState(false)
		const [cursorPosition, setCursorPosition] = useState(0)
		const [searchQuery, setSearchQuery] = useState("")
		const textAreaRef = useRef<HTMLTextAreaElement | null>(null)
		const [isMouseDownOnMenu, setIsMouseDownOnMenu] = useState(false)
		const highlightLayerRef = useRef<HTMLDivElement>(null)
		const [selectedMenuIndex, setSelectedMenuIndex] = useState(-1)
		const [selectedType, setSelectedType] = useState<ContextMenuOptionType | null>(null)
		const [justDeletedSpaceAfterMention, setJustDeletedSpaceAfterMention] = useState(false)
		const [intendedCursorPosition, setIntendedCursorPosition] = useState<number | null>(null)
		const contextMenuContainerRef = useRef<HTMLDivElement>(null)
		const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false)
		const [isFocused, setIsFocused] = useState(false)
		const [imageWarning, setImageWarning] = useState<string | null>(null) // kilocode_change

		// Use custom hook for prompt history navigation
		const { handleHistoryNavigation, resetHistoryNavigation, resetOnInputChange } = usePromptHistory({
			clineMessages,
			taskHistory,
			cwd,
			inputValue,
			setInputValue,
		})

		// Fetch git commits when Git is selected or when typing a hash.
		useEffect(() => {
			if (selectedType === ContextMenuOptionType.Git || /^[a-f0-9]+$/i.test(searchQuery)) {
				const message: WebviewMessage = {
					type: "searchCommits",
					query: searchQuery || "",
				} as const
				vscode.postMessage(message)
			}
		}, [selectedType, searchQuery])

		const handleEnhancePrompt = useCallback(() => {
			const trimmedInput = inputValue.trim()

			if (trimmedInput) {
				setIsEnhancingPrompt(true)
				vscode.postMessage({ type: "enhancePrompt" as const, text: trimmedInput })
			} else {
				setInputValue(t("chat:enhancePromptDescription"))
			}
		}, [inputValue, setInputValue, t])

		// kilocode_change start: Image warning handlers
		const showImageWarning = useCallback((messageKey: string) => {
			setImageWarning(messageKey)
		}, [])

		const dismissImageWarning = useCallback(() => {
			setImageWarning(null)
		}, [])
		// kilocode_change end: Image warning handlers

		// kilocode_change start: Clear images if unsupported
		// Track previous shouldDisableImages state to detect when model image support changes
		const prevShouldDisableImages = useRef<boolean>(shouldDisableImages)
		useEffect(() => {
			if (!prevShouldDisableImages.current && shouldDisableImages && selectedImages.length > 0) {
				setSelectedImages([])
				showImageWarning("kilocode:imageWarnings.imagesRemovedNoSupport")
			}
			prevShouldDisableImages.current = shouldDisableImages
		}, [shouldDisableImages, selectedImages.length, setSelectedImages, showImageWarning])
		// kilocode_change end: Clear images if unsupported

		const allModes = useMemo(() => getAllModes(customModes), [customModes])

		const queryItems = useMemo(() => {
			return [
				{ type: ContextMenuOptionType.Problems, value: "problems" },
				{ type: ContextMenuOptionType.Terminal, value: "terminal" },
				...gitCommits,
				...openedTabs
					.filter((tab) => tab.path)
					.map((tab) => ({
						type: ContextMenuOptionType.OpenedFile,
						value: "/" + tab.path,
					})),
				...filePaths
					.map((file) => "/" + file)
					.filter((path) => !openedTabs.some((tab) => tab.path && "/" + tab.path === path)) // Filter out paths that are already in openedTabs
					.map((path) => ({
						type: path.endsWith("/") ? ContextMenuOptionType.Folder : ContextMenuOptionType.File,
						value: path,
					})),
			]
		}, [filePaths, gitCommits, openedTabs])

		useEffect(() => {
			const handleClickOutside = (event: MouseEvent) => {
				if (
					contextMenuContainerRef.current &&
					!contextMenuContainerRef.current.contains(event.target as Node)
				) {
					setShowContextMenu(false)
				}
			}

			if (showContextMenu) {
				document.addEventListener("mousedown", handleClickOutside)
			}

			return () => {
				document.removeEventListener("mousedown", handleClickOutside)
			}
		}, [showContextMenu, setShowContextMenu])

		const handleMentionSelect = useCallback(
			(type: ContextMenuOptionType, value?: string) => {
				// kilocode_change start
				if (type === ContextMenuOptionType.Image) {
					// Close the context menu and remove the @character in this case
					setShowContextMenu(false)
					setSelectedType(null)

					if (textAreaRef.current) {
						const beforeCursor = textAreaRef.current.value.slice(0, cursorPosition)
						const afterCursor = textAreaRef.current.value.slice(cursorPosition)
						const lastAtIndex = beforeCursor.lastIndexOf("@")

						if (lastAtIndex !== -1) {
							const newValue = beforeCursor.slice(0, lastAtIndex) + afterCursor
							setInputValue(newValue)
						}
					}

					// Call the image selection function
					onSelectImages()
					return
				}
				// kilocode_change end

				if (type === ContextMenuOptionType.NoResults) {
					return
				}

				if (type === ContextMenuOptionType.Mode && value) {
					// Handle mode selection.
					setMode(value)
					setInputValue("")
					setShowContextMenu(false)
					vscode.postMessage({ type: "mode", text: value })
					return
				}

				if (
					type === ContextMenuOptionType.File ||
					type === ContextMenuOptionType.Folder ||
					type === ContextMenuOptionType.Git
				) {
					if (!value) {
						setSelectedType(type)
						setSearchQuery("")
						setSelectedMenuIndex(0)
						return
					}
				}

				setShowContextMenu(false)
				setSelectedType(null)

				if (textAreaRef.current) {
					let insertValue = value || ""

					if (type === ContextMenuOptionType.URL) {
						insertValue = value || ""
					} else if (type === ContextMenuOptionType.File || type === ContextMenuOptionType.Folder) {
						insertValue = value || ""
					} else if (type === ContextMenuOptionType.Problems) {
						insertValue = "problems"
					} else if (type === ContextMenuOptionType.Terminal) {
						insertValue = "terminal"
					} else if (type === ContextMenuOptionType.Git) {
						insertValue = value || ""
					}

					const { newValue, mentionIndex } = insertMention(
						textAreaRef.current.value,
						cursorPosition,
						insertValue,
					)

					setInputValue(newValue)
					const newCursorPosition = newValue.indexOf(" ", mentionIndex + insertValue.length) + 1
					setCursorPosition(newCursorPosition)
					setIntendedCursorPosition(newCursorPosition)

					// Scroll to cursor.
					setTimeout(() => {
						if (textAreaRef.current) {
							textAreaRef.current.blur()
							textAreaRef.current.focus()
						}
					}, 0)
				}
			},
			// eslint-disable-next-line react-hooks/exhaustive-deps
			[setInputValue, cursorPosition],
		)

		// kilocode_change start: pull slash commands from Cline
		const handleSlashCommandsSelect = useCallback(
			(command: SlashCommand) => {
				setShowSlashCommandsMenu(false)

				// Handle mode switching commands
				const modeSwitchCommands = getAllModes(customModes).map((mode) => mode.slug)
				if (modeSwitchCommands.includes(command.name)) {
					// Switch to the selected mode
					setMode(command.name as Mode)
					setInputValue("")
					vscode.postMessage({ type: "mode", text: command.name })
					return
				}

				// Handle other slash commands (like newtask)
				if (textAreaRef.current) {
					const { newValue, commandIndex } = insertSlashCommand(textAreaRef.current.value, command.name)
					const newCursorPosition = newValue.indexOf(" ", commandIndex + 1 + command.name.length) + 1

					setInputValue(newValue)
					setCursorPosition(newCursorPosition)
					setIntendedCursorPosition(newCursorPosition)

					setTimeout(() => {
						if (textAreaRef.current) {
							textAreaRef.current.blur()
							textAreaRef.current.focus()
						}
					}, 0)
				}
			},
			[setInputValue, setMode, customModes],
		)
		// kilocode_change end

		const handleKeyDown = useCallback(
			(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
				// kilocode_change start: pull slash commands from Cline
				if (showSlashCommandsMenu) {
					if (event.key === "Escape") {
						setShowSlashCommandsMenu(false)
						return
					}

					if (event.key === "ArrowUp" || event.key === "ArrowDown") {
						event.preventDefault()
						setSelectedSlashCommandsIndex((prevIndex) => {
							const direction = event.key === "ArrowUp" ? -1 : 1
							const commands = getMatchingSlashCommands(
								slashCommandsQuery,
								customModes,
								localWorkflows,
								globalWorkflows,
							) // kilocode_change

							if (commands.length === 0) {
								return prevIndex
							}

							const newIndex = (prevIndex + direction + commands.length) % commands.length
							return newIndex
						})
						return
					}

					if ((event.key === "Enter" || event.key === "Tab") && selectedSlashCommandsIndex !== -1) {
						event.preventDefault()
						const commands = getMatchingSlashCommands(
							slashCommandsQuery,
							customModes,
							localWorkflows,
							globalWorkflows,
						) // kilocode_change
						if (commands.length > 0) {
							handleSlashCommandsSelect(commands[selectedSlashCommandsIndex])
						}
						return
					}
				}
				// kilocode_change end
				if (showContextMenu) {
					if (event.key === "Escape") {
						setSelectedType(null)
						setSelectedMenuIndex(3) // File by default
						return
					}

					if (event.key === "ArrowUp" || event.key === "ArrowDown") {
						event.preventDefault()
						setSelectedMenuIndex((prevIndex) => {
							const direction = event.key === "ArrowUp" ? -1 : 1
							const options = getContextMenuOptions(
								searchQuery,
								selectedType,
								queryItems,
								fileSearchResults,
								allModes,
							)
							const optionsLength = options.length

							if (optionsLength === 0) return prevIndex

							// Find selectable options (non-URL types)
							const selectableOptions = options.filter(
								(option) =>
									option.type !== ContextMenuOptionType.URL &&
									option.type !== ContextMenuOptionType.NoResults,
							)

							if (selectableOptions.length === 0) return -1 // No selectable options

							// Find the index of the next selectable option
							const currentSelectableIndex = selectableOptions.findIndex(
								(option) => option === options[prevIndex],
							)

							const newSelectableIndex =
								(currentSelectableIndex + direction + selectableOptions.length) %
								selectableOptions.length

							// Find the index of the selected option in the original options array
							return options.findIndex((option) => option === selectableOptions[newSelectableIndex])
						})
						return
					}
					if ((event.key === "Enter" || event.key === "Tab") && selectedMenuIndex !== -1) {
						event.preventDefault()
						const selectedOption = getContextMenuOptions(
							searchQuery,
							selectedType,
							queryItems,
							fileSearchResults,
							allModes,
						)[selectedMenuIndex]
						if (
							selectedOption &&
							selectedOption.type !== ContextMenuOptionType.URL &&
							selectedOption.type !== ContextMenuOptionType.NoResults
						) {
							handleMentionSelect(selectedOption.type, selectedOption.value)
						}
						return
					}
				}

				const isComposing = event.nativeEvent?.isComposing ?? false

				// Handle prompt history navigation using custom hook
				if (handleHistoryNavigation(event, showContextMenu, isComposing)) {
					return
				}

				if (event.key === "Enter" && !event.shiftKey && !isComposing) {
					event.preventDefault()

					resetHistoryNavigation()
					onSend()
				}

				if (event.key === "Backspace" && !isComposing) {
					const charBeforeCursor = inputValue[cursorPosition - 1]
					const charAfterCursor = inputValue[cursorPosition + 1]

					const charBeforeIsWhitespace =
						charBeforeCursor === " " || charBeforeCursor === "\n" || charBeforeCursor === "\r\n"

					const charAfterIsWhitespace =
						charAfterCursor === " " || charAfterCursor === "\n" || charAfterCursor === "\r\n"

					// Checks if char before cusor is whitespace after a mention.
					if (
						charBeforeIsWhitespace &&
						// "$" is added to ensure the match occurs at the end of the string.
						inputValue.slice(0, cursorPosition - 1).match(new RegExp(mentionRegex.source + "$"))
					) {
						const newCursorPosition = cursorPosition - 1
						// If mention is followed by another word, then instead
						// of deleting the space separating them we just move
						// the cursor to the end of the mention.
						if (!charAfterIsWhitespace) {
							event.preventDefault()
							textAreaRef.current?.setSelectionRange(newCursorPosition, newCursorPosition)
							setCursorPosition(newCursorPosition)
						}

						setCursorPosition(newCursorPosition)
						setJustDeletedSpaceAfterMention(true)
					} else if (justDeletedSpaceAfterMention) {
						const { newText, newPosition } = removeMention(inputValue, cursorPosition)

						if (newText !== inputValue) {
							event.preventDefault()
							setInputValue(newText)
							setIntendedCursorPosition(newPosition) // Store the new cursor position in state
						}

						setJustDeletedSpaceAfterMention(false)
						setShowContextMenu(false)
					} else {
						setJustDeletedSpaceAfterMention(false)
					}
				}
			},
			[
				// kilocode_change start
				showSlashCommandsMenu,
				localWorkflows,
				globalWorkflows,
				customModes,
				handleSlashCommandsSelect,
				selectedSlashCommandsIndex,
				slashCommandsQuery,
				// kilocode_change end
				onSend,
				showContextMenu,
				searchQuery,
				selectedMenuIndex,
				handleMentionSelect,
				selectedType,
				inputValue,
				cursorPosition,
				setInputValue,
				justDeletedSpaceAfterMention,
				queryItems,
				allModes,
				fileSearchResults,
				handleHistoryNavigation,
				resetHistoryNavigation,
			],
		)

		useLayoutEffect(() => {
			if (intendedCursorPosition !== null && textAreaRef.current) {
				textAreaRef.current.setSelectionRange(intendedCursorPosition, intendedCursorPosition)
				setIntendedCursorPosition(null) // Reset the state.
			}
		}, [inputValue, intendedCursorPosition])

		// Ref to store the search timeout.
		const searchTimeoutRef = useRef<number | null>(null)

		const applyInputValue = useCallback(
			(newValue: string, selectionPosition?: number) => {
				setInputValue(newValue)
				resetOnInputChange()

				const nextCursorPosition =
					typeof selectionPosition === "number" && selectionPosition >= 0
						? selectionPosition
						: newValue.length
				setCursorPosition(nextCursorPosition)

				let showMenu = shouldShowContextMenu(newValue, nextCursorPosition)
				const slashCommandsVisible = shouldShowSlashCommandsMenu(newValue, nextCursorPosition)

				if (slashCommandsVisible) {
					showMenu = false
				}

				setShowSlashCommandsMenu(slashCommandsVisible)
				if (slashCommandsVisible) {
					const slashIndex = newValue.indexOf("/")
					const query = newValue.slice(slashIndex + 1, nextCursorPosition)
					setSlashCommandsQuery(query)
					setSelectedSlashCommandsIndex(0)
				} else {
					setSlashCommandsQuery("")
					setSelectedSlashCommandsIndex(0)
				}

				setShowContextMenu(showMenu)

				if (showMenu) {
					const lastAtIndex = newValue.lastIndexOf("@", nextCursorPosition - 1)

					if (newValue.startsWith("/") && lastAtIndex === -1) {
						setSearchQuery(newValue)
						setSelectedMenuIndex(0)
					} else {
						const query = newValue.slice(lastAtIndex + 1, nextCursorPosition)
						setSearchQuery(query)

						if (query.length > 0) {
							setSelectedMenuIndex(0)

							if (searchTimeoutRef.current) {
								clearTimeout(searchTimeoutRef.current)
							}

							searchTimeoutRef.current = window.setTimeout(() => {
								const reqId = Math.random().toString(36).substring(2, 9)
								setSearchRequestId(reqId)
								setSearchLoading(true)

								vscode.postMessage({
									type: "searchFiles",
									query: unescapeSpaces(query),
									requestId: reqId,
								})
							}, 200)
						} else {
							setSelectedMenuIndex(3)
						}
					}
				} else {
					setSearchQuery("")
					setSelectedMenuIndex(-1)
					setFileSearchResults([])
				}

				if (textAreaRef.current) {
					const boundedCursor = Math.min(nextCursorPosition, newValue.length)
					setIntendedCursorPosition(boundedCursor)
				}
			},
			[
				resetOnInputChange,
				setFileSearchResults,
				setInputValue,
				setSearchLoading,
				setSearchQuery,
				setSearchRequestId,
				setSelectedMenuIndex,
				setShowContextMenu,
				setShowSlashCommandsMenu,
				setSlashCommandsQuery,
				setSelectedSlashCommandsIndex,
				setCursorPosition,
				setIntendedCursorPosition,
			],
		)

		const handleInputChange = useCallback(
			(e: React.ChangeEvent<HTMLTextAreaElement>) => {
				applyInputValue(e.target.value, e.target.selectionStart ?? undefined)
			},
			[applyInputValue],
		)

		useEffect(() => {
			inputValueLiveRef.current = inputValue
		}, [inputValue])

		useEffect(() => {
			if (!showContextMenu) {
				setSelectedType(null)
			}
		}, [showContextMenu])

		const handleBlur = useCallback(() => {
			// Only hide the context menu if the user didn't click on it.
			if (!isMouseDownOnMenu) {
				setShowContextMenu(false)
				setShowSlashCommandsMenu(false) // kilocode_change: pull slash commands from Cline
			}

			setIsFocused(false)
		}, [isMouseDownOnMenu])

		const handlePaste = useCallback(
			async (e: React.ClipboardEvent) => {
				const items = e.clipboardData.items

				const pastedText = e.clipboardData.getData("text")
				// Check if the pasted content is a URL, add space after so user
				// can easily delete if they don't want it.
				const urlRegex = /^\S+:\/\/\S+$/
				if (urlRegex.test(pastedText.trim())) {
					e.preventDefault()
					const trimmedUrl = pastedText.trim()
					const newValue =
						inputValue.slice(0, cursorPosition) + trimmedUrl + " " + inputValue.slice(cursorPosition)
					setInputValue(newValue)
					const newCursorPosition = cursorPosition + trimmedUrl.length + 1
					setCursorPosition(newCursorPosition)
					setIntendedCursorPosition(newCursorPosition)
					setShowContextMenu(false)

					// Scroll to new cursor position.
					setTimeout(() => {
						if (textAreaRef.current) {
							textAreaRef.current.blur()
							textAreaRef.current.focus()
						}
					}, 0)

					return
				}

				const acceptedTypes = ["png", "jpeg", "webp"]

				const imageItems = Array.from(items).filter((item) => {
					const [type, subtype] = item.type.split("/")
					return type === "image" && acceptedTypes.includes(subtype)
				})

				// kilocode_change start: Image validation with warning messages
				if (imageItems.length > 0) {
					e.preventDefault()

					if (shouldDisableImages) {
						showImageWarning(`kilocode:imageWarnings.modelNoImageSupport`)
						return
					}
					if (selectedImages.length >= MAX_IMAGES_PER_MESSAGE) {
						showImageWarning(`kilocode:imageWarnings.maxImagesReached`)
						return
					}
					// kilocode_change end: Image validation with warning messages

					const imagePromises = imageItems.map((item) => {
						return new Promise<string | null>((resolve) => {
							const blob = item.getAsFile()

							if (!blob) {
								resolve(null)
								return
							}

							const reader = new FileReader()

							reader.onloadend = () => {
								if (reader.error) {
									console.error(t("chat:errorReadingFile"), reader.error)
									resolve(null)
								} else {
									const result = reader.result
									resolve(typeof result === "string" ? result : null)
								}
							}

							reader.readAsDataURL(blob)
						})
					})

					const imageDataArray = await Promise.all(imagePromises)
					const dataUrls = imageDataArray.filter((dataUrl): dataUrl is string => dataUrl !== null)

					if (dataUrls.length > 0) {
						setSelectedImages((prevImages) => [...prevImages, ...dataUrls].slice(0, MAX_IMAGES_PER_MESSAGE))
					} else {
						console.warn(t("chat:noValidImages"))
					}
				}
			},
			[
				shouldDisableImages,
				setSelectedImages,
				cursorPosition,
				setInputValue,
				inputValue,
				t,
				selectedImages.length, // kilocode_change - added selectedImages.length
				showImageWarning, // kilocode_change - added showImageWarning
			],
		)

		const handleMenuMouseDown = useCallback(() => {
			setIsMouseDownOnMenu(true)
		}, [])

		const updateHighlights = useCallback(() => {
			if (!textAreaRef.current || !highlightLayerRef.current) return

			// kilocode_change start: pull slash commands from Cline
			let processedText = textAreaRef.current.value

			processedText = processedText
				.replace(/\n$/, "\n\n")
				.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] || c)
				.replace(mentionRegexGlobal, '<mark class="mention-context-textarea-highlight">$&</mark>')

			// check for highlighting /slash-commands
			if (/^\s*\//.test(processedText)) {
				const slashIndex = processedText.indexOf("/")

				// end of command is end of text or first whitespace
				const spaceIndex = processedText.indexOf(" ", slashIndex)
				const endIndex = spaceIndex > -1 ? spaceIndex : processedText.length

				// extract and validate the exact command text
				const commandText = processedText.substring(slashIndex + 1, endIndex)
				const isValidCommand = validateSlashCommand(commandText, customModes)

				if (isValidCommand) {
					const fullCommand = processedText.substring(slashIndex, endIndex) // includes slash

					const highlighted = `<mark class="slash-command-match-textarea-highlight">${fullCommand}</mark>`
					processedText =
						processedText.substring(0, slashIndex) + highlighted + processedText.substring(endIndex)
				}
			}
			// kilocode_change end

			highlightLayerRef.current.innerHTML = processedText
			highlightLayerRef.current.scrollTop = textAreaRef.current.scrollTop
			highlightLayerRef.current.scrollLeft = textAreaRef.current.scrollLeft
		}, [customModes])

		useLayoutEffect(() => {
			updateHighlights()
		}, [inputValue, updateHighlights])

		const updateCursorPosition = useCallback(() => {
			if (textAreaRef.current) {
				setCursorPosition(textAreaRef.current.selectionStart)
			}
		}, [])

		const appendTranscript = useCallback((base: string, addition: string) => {
			const trimmedAddition = addition.trim()
			if (!trimmedAddition) {
				return base
			}

			const needsSpace = base.length > 0 && !/\s$/.test(base) && !/^[',.!?)/\]]/.test(trimmedAddition)

			return `${base}${needsSpace ? " " : ""}${trimmedAddition}`
		}, [])

		const handleSpeechRecognitionError = useCallback(
			(event: any) => {
				const error = event?.error as string | undefined
				let message = t("chat:voiceInputError")

				switch (error) {
					case "not-allowed":
					case "service-not-allowed":
						message = t("chat:voiceInputPermissionDenied")
						break
					case "no-speech":
						message = t("chat:voiceInputNoSpeech")
						break
					default:
						if (typeof error === "string" && error.length > 0) {
							message = `${t("chat:voiceInputError")}: ${error}`
						}
				}

				setSpeechError(message)
				setIsListening(false)
			},
			[t],
		)

		const stopSpeechRecognition = useCallback(() => {
			if (!recognitionRef.current) {
				return
			}

			try {
				recognitionRef.current.stop()
			} catch {
				recognitionRef.current.abort?.()
			}

			setIsListening(false)
		}, [])

		const processSpeechResult = useCallback(
			(event: any) => {
				let interimTranscript = ""
				let finalTranscript = ""

				for (let i = event.resultIndex; i < event.results.length; i += 1) {
					const result = event.results[i]
					const transcriptSegment = result?.[0]?.transcript ?? ""

					if (!transcriptSegment) {
						continue
					}

					if (result.isFinal) {
						finalTranscript += transcriptSegment
					} else {
						interimTranscript += transcriptSegment
					}
				}

				if (finalTranscript) {
					speechAccumulatedValueRef.current = appendTranscript(
						speechAccumulatedValueRef.current,
						finalTranscript,
					)
				}

				const nextValue = interimTranscript
					? appendTranscript(speechAccumulatedValueRef.current, interimTranscript)
					: speechAccumulatedValueRef.current

				applyInputValue(nextValue, nextValue.length)
				requestAnimationFrame(() => updateHighlights())
			},
			[appendTranscript, applyInputValue, updateHighlights],
		)

		const startSpeechRecognition = useCallback(() => {
			if (!speechRecognitionConstructor || isListening) {
				return
			}

			setSpeechError(null)

			if (!recognitionRef.current) {
				const recognition = new speechRecognitionConstructor()
				recognition.continuous = true
				recognition.interimResults = true
				recognition.lang = navigator.language || "en-US"
				recognition.onresult = processSpeechResult
				recognition.onerror = handleSpeechRecognitionError
				recognition.onend = () => {
					setIsListening(false)
				}
				recognitionRef.current = recognition
			}

			speechAccumulatedValueRef.current = inputValueLiveRef.current.trimEnd()

			try {
				recognitionRef.current.start()
				setIsListening(true)
			} catch (error) {
				console.error("Speech recognition start failed", error)
				setSpeechError(t("chat:voiceInputError"))
			}
		}, [
			handleSpeechRecognitionError,
			inputValueLiveRef,
			isListening,
			processSpeechResult,
			speechRecognitionConstructor,
			t,
		])

		useEffect(() => {
			return () => {
				if (!recognitionRef.current) {
					return
				}

				const recognition = recognitionRef.current
				try {
					recognition.onresult = null
					recognition.onerror = null
					recognition.onend = null
					recognition.stop()
				} catch {
					recognition.abort?.()
				}
				recognitionRef.current = null
			}
		}, [])

		useEffect(() => {
			if (!isListening || !sendingDisabled) {
				return
			}

			stopSpeechRecognition()
		}, [isListening, sendingDisabled, stopSpeechRecognition])

		useEffect(() => {
			if (!speechError) {
				return
			}

			const timeout = window.setTimeout(() => setSpeechError(null), 5000)
			return () => window.clearTimeout(timeout)
		}, [speechError])

		const toggleSpeechRecognition = useCallback(() => {
			if (!isSpeechSupported) {
				return
			}

			if (isListening) {
				stopSpeechRecognition()
			} else {
				startSpeechRecognition()
			}
		}, [isSpeechSupported, isListening, startSpeechRecognition, stopSpeechRecognition])

		const voiceInputTooltip = useMemo(() => {
			if (speechError) {
				return speechError
			}

			if (!isSpeechSupported) {
				return t("chat:voiceInputUnsupported")
			}

			return isListening ? t("chat:stopVoiceInput") : t("chat:startVoiceInput")
		}, [isListening, isSpeechSupported, speechError, t])

		const handleKeyUp = useCallback(
			(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
				if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
					updateCursorPosition()
				}
			},
			[updateCursorPosition],
		)

		const handleDrop = useCallback(
			async (e: React.DragEvent<HTMLDivElement>) => {
				e.preventDefault()
				setIsDraggingOver(false)

				const textFieldList = e.dataTransfer.getData("text")
				const textUriList = e.dataTransfer.getData("application/vnd.code.uri-list")
				// When textFieldList is empty, it may attempt to use textUriList obtained from drag-and-drop tabs; if not empty, it will use textFieldList.
				const text = textFieldList || textUriList
				if (text) {
					// Split text on newlines to handle multiple files
					const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "")

					if (lines.length > 0) {
						// Process each line as a separate file path
						let newValue = inputValue.slice(0, cursorPosition)
						let totalLength = 0

						// Using a standard for loop instead of forEach for potential performance gains.
						for (let i = 0; i < lines.length; i++) {
							const line = lines[i]
							// Convert each path to a mention-friendly format
							const mentionText = convertToMentionPath(line, cwd)
							newValue += mentionText
							totalLength += mentionText.length

							// Add space after each mention except the last one
							if (i < lines.length - 1) {
								newValue += " "
								totalLength += 1
							}
						}

						// Add space after the last mention and append the rest of the input
						newValue += " " + inputValue.slice(cursorPosition)
						totalLength += 1

						setInputValue(newValue)
						const newCursorPosition = cursorPosition + totalLength
						setCursorPosition(newCursorPosition)
						setIntendedCursorPosition(newCursorPosition)
					}

					return
				}

				const files = Array.from(e.dataTransfer.files)

				if (files.length > 0) {
					const acceptedTypes = ["png", "jpeg", "webp"]

					const imageFiles = files.filter((file) => {
						const [type, subtype] = file.type.split("/")
						return type === "image" && acceptedTypes.includes(subtype)
					})

					// kilocode_change start: Image validation with warning messages for drag and drop
					if (imageFiles.length > 0) {
						if (shouldDisableImages) {
							showImageWarning("kilocode:imageWarnings.modelNoImageSupport")
							return
						}
						if (selectedImages.length >= MAX_IMAGES_PER_MESSAGE) {
							showImageWarning("kilocode:imageWarnings.maxImagesReached")
							return
						}
						// kilocode_change end: Image validation with warning messages for drag and drop

						const imagePromises = imageFiles.map((file) => {
							return new Promise<string | null>((resolve) => {
								const reader = new FileReader()

								reader.onloadend = () => {
									if (reader.error) {
										console.error(t("chat:errorReadingFile"), reader.error)
										resolve(null)
									} else {
										const result = reader.result
										resolve(typeof result === "string" ? result : null)
									}
								}

								reader.readAsDataURL(file)
							})
						})

						const imageDataArray = await Promise.all(imagePromises)
						const dataUrls = imageDataArray.filter((dataUrl): dataUrl is string => dataUrl !== null)

						if (dataUrls.length > 0) {
							setSelectedImages((prevImages) =>
								[...prevImages, ...dataUrls].slice(0, MAX_IMAGES_PER_MESSAGE),
							)

							if (typeof vscode !== "undefined") {
								vscode.postMessage({ type: "draggedImages", dataUrls: dataUrls })
							}
						} else {
							console.warn(t("chat:noValidImages"))
						}
					}
				}
			},
			[
				cursorPosition,
				cwd,
				inputValue,
				setInputValue,
				setCursorPosition,
				setIntendedCursorPosition,
				shouldDisableImages,
				setSelectedImages,
				t,
				selectedImages.length, // kilocode_change - added selectedImages.length
				showImageWarning, // kilocode_change - added showImageWarning
			],
		)

		const [isTtsPlaying, setIsTtsPlaying] = useState(false)

		useEvent("message", (event: MessageEvent) => {
			const message: ExtensionMessage = event.data

			if (message.type === "ttsStart") {
				setIsTtsPlaying(true)
			} else if (message.type === "ttsStop") {
				setIsTtsPlaying(false)
			}
		})

		const placeholderBottomText = `\n(${t("chat:addContext")}${shouldDisableImages ? `, ${t("chat:dragFiles")}` : `, ${t("chat:dragFilesImages")}`})`

		// Common mode selector handler
		const handleModeChange = useCallback(
			(value: Mode) => {
				setMode(value)
				vscode.postMessage({ type: "mode", text: value })
			},
			[setMode],
		)

		// Helper function to render mode
		// kilocode_change: unused
		const _renderModeSelector = () => (
			<ModeSelector
				value={mode}
				title={t("chat:selectMode")}
				onChange={handleModeChange}
				triggerClassName="w-full"
				modeShortcutText={modeShortcutText}
				customModes={customModes}
				customModePrompts={customModePrompts}
			/>
		)

		// Helper function to get API config dropdown options
		// kilocode_change: unused
		const _getApiConfigOptions = useMemo(() => {
			const pinnedConfigs = (listApiConfigMeta || [])
				.filter((config) => pinnedApiConfigs && pinnedApiConfigs[config.id])
				.map((config) => ({
					value: config.id,
					label: config.name,
					name: config.name,
					type: DropdownOptionType.ITEM,
					pinned: true,
				}))
				.sort((a, b) => a.label.localeCompare(b.label))

			const unpinnedConfigs = (listApiConfigMeta || [])
				.filter((config) => !pinnedApiConfigs || !pinnedApiConfigs[config.id])
				.map((config) => ({
					value: config.id,
					label: config.name,
					name: config.name,
					type: DropdownOptionType.ITEM,
					pinned: false,
				}))
				.sort((a, b) => a.label.localeCompare(b.label))

			const hasPinnedAndUnpinned = pinnedConfigs.length > 0 && unpinnedConfigs.length > 0

			return [
				...pinnedConfigs,
				...(hasPinnedAndUnpinned
					? [
							{
								value: "sep-pinned",
								label: t("chat:separator"),
								type: DropdownOptionType.SEPARATOR,
							},
						]
					: []),
				...unpinnedConfigs,
				{
					value: "sep-2",
					label: t("chat:separator"),
					type: DropdownOptionType.SEPARATOR,
				},
				{
					value: "settingsButtonClicked",
					label: t("chat:edit"),
					type: DropdownOptionType.ACTION,
				},
			]
		}, [listApiConfigMeta, pinnedApiConfigs, t])

		// Helper function to handle API config change
		// kilocode_change: unused
		const _handleApiConfigChange = useCallback((value: string) => {
			if (value === "settingsButtonClicked") {
				vscode.postMessage({
					type: "loadApiConfiguration",
					text: value,
					values: { section: "providers" },
				})
			} else {
				vscode.postMessage({ type: "loadApiConfigurationById", text: value })
			}
		}, [])

		// Helper function to render API config item
		// kilocode_change: unused
		const _renderApiConfigItem = useCallback(
			({ type, value, label, pinned }: any) => {
				if (type !== DropdownOptionType.ITEM) {
					return label
				}

				const config = listApiConfigMeta?.find((c) => c.id === value)
				const isCurrentConfig = config?.name === currentApiConfigName

				return (
					<div className="flex justify-between gap-2 w-full h-5">
						<div
							className={cn("truncate min-w-0 overflow-hidden", {
								"font-medium": isCurrentConfig,
							})}>
							{label}
						</div>
						<div className="flex justify-end w-10 flex-shrink-0">
							<div
								className={cn("size-5 p-1", {
									"block group-hover:hidden": !pinned,
									hidden: !isCurrentConfig,
								})}>
								<Check className="size-3" />
							</div>
							<StandardTooltip content={pinned ? t("chat:unpin") : t("chat:pin")}>
								<Button
									variant="ghost"
									size="icon"
									onClick={(e) => {
										e.stopPropagation()
										togglePinnedApiConfig(value)
										vscode.postMessage({
											type: "toggleApiConfigPin",
											text: value,
										})
									}}
									className={cn("size-5", {
										"hidden group-hover:flex": !pinned,
										"bg-accent": pinned,
									})}>
									<Pin className="size-3 p-0.5 opacity-50" />
								</Button>
							</StandardTooltip>
						</div>
					</div>
				)
			},
			[listApiConfigMeta, currentApiConfigName, t, togglePinnedApiConfig],
		)

		// Helper function to render non-edit mode controls
		const renderNonEditModeControls = () => {
			if (isEditMode) {
				return null
			}

			const baseButtonClasses = [
				"relative inline-flex items-center justify-center",
				"bg-transparent border-none p-1.5",
				"rounded-md min-w-[28px] min-h-[28px]",
				"opacity-60 hover:opacity-100 text-vscode-descriptionForeground hover:text-vscode-foreground",
				"transition-all duration-150",
				"hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.15)]",
				"focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder",
				"active:bg-[rgba(255,255,255,0.1)]",
			]

			return (
				<div className={cn("flex", "items-center", "justify-between", "px-2", "w-full")} style={{ gap: "8px" }}>
					<div className={cn("flex", "items-center", "gap-1", "min-w-0")} style={{ flexWrap: "nowrap" }}>
						<div className="shrink-0">
							<KiloModeSelector
								value={mode}
								onChange={setMode}
								modeShortcutText={modeShortcutText}
								customModes={customModes}
							/>
						</div>
						<KiloProfileSelector
							currentConfigId={currentConfigId}
							currentApiConfigName={currentApiConfigName}
							displayName={displayName}
							listApiConfigMeta={listApiConfigMeta}
							pinnedApiConfigs={pinnedApiConfigs}
							togglePinnedApiConfig={togglePinnedApiConfig}
							selectApiConfigDisabled={selectApiConfigDisabled}
						/>
					</div>
					<div className="flex items-center gap-1 shrink-0">
						{isTtsPlaying && (
							<StandardTooltip content={t("chat:stopTts")}>
								<button
									aria-label={t("chat:stopTts")}
									onClick={() => vscode.postMessage({ type: "stopTts" })}
									className={cn(baseButtonClasses, "cursor-pointer")}>
									<VolumeX className="w-4 h-4" />
								</button>
							</StandardTooltip>
						)}
						<IndexingStatusBadge className={cn({ hidden: containerWidth < 235 })} />
						<StandardTooltip content={t("chat:enhancePrompt")}>
							<button
								aria-label={t("chat:enhancePrompt")}
								onClick={handleEnhancePrompt}
								className={cn(baseButtonClasses, "cursor-pointer")}>
								<WandSparkles className={cn("w-4 h-4", isEnhancingPrompt && "animate-spin")} />
							</button>
						</StandardTooltip>
						<StandardTooltip content={voiceInputTooltip}>
							<button
								aria-label={voiceInputTooltip}
								disabled={!isSpeechSupported || sendingDisabled}
								onClick={!isSpeechSupported || sendingDisabled ? undefined : toggleSpeechRecognition}
								className={cn(
									baseButtonClasses,
									isSpeechSupported && !sendingDisabled && "cursor-pointer",
									(!isSpeechSupported || sendingDisabled) &&
										"opacity-40 cursor-not-allowed grayscale-[30%] hover:bg-transparent hover:border-[rgba(255,255,255,0.08)] active:bg-transparent",
									isListening &&
										"text-[var(--vscode-focusBorder)] opacity-100 bg-[color-mix(in_srgb,var(--vscode-focusBorder)_18%,transparent)]",
								)}>
								{isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
							</button>
						</StandardTooltip>
						<StandardTooltip content="Add Context (@)">
							<button
								aria-label="Add Context (@)"
								disabled={showContextMenu}
								onClick={() => {
									if (showContextMenu || !textAreaRef.current) return

									textAreaRef.current.focus()

									setInputValue(`${inputValue} @`)
									setShowContextMenu(true)
									setSearchQuery("")
									setSelectedMenuIndex(4)
								}}
								className={cn(
									baseButtonClasses,
									!showContextMenu && "cursor-pointer",
									showContextMenu &&
										"opacity-40 cursor-not-allowed grayscale-[30%] hover:bg-transparent hover:border-[rgba(255,255,255,0.08)] active:bg-transparent",
								)}>
								<Paperclip className={cn("w-4", "h-4", { hidden: containerWidth < 235 })} />
							</button>
						</StandardTooltip>
						<StandardTooltip content={realtimeTooltip}>
							<button
								type="button"
								aria-label={realtimeTooltip}
								onClick={handleRealtimeButtonClick}
								disabled={!isRealtimeSupported || isRealtimeRequesting}
								className={cn(
									baseButtonClasses,
									isRealtimeActive &&
										"text-[var(--vscode-focusBorder)] opacity-100 bg-[color-mix(in_srgb,var(--vscode-focusBorder)_18%,transparent)]",
									isRealtimeConnecting && "cursor-pointer",
									isRealtimeRequesting && "cursor-progress",
									!isRealtimeSupported &&
										"opacity-40 cursor-not-allowed grayscale-[30%] hover:bg-transparent hover:border-[rgba(255,255,255,0.08)] active:bg-transparent",
								)}>
								{isRealtimePending ? (
									<Loader2 className="w-4 h-4 animate-spin" />
								) : isRealtimeActive ? (
									<PhoneOff className="w-4 h-4" />
								) : (
									<Phone className="w-4 h-4" />
								)}
							</button>
						</StandardTooltip>
						<ChatSendButton
							disabled={sendButtonDisabled}
							onClick={sendButtonHandler}
							tooltip={sendButtonLabel}
							ariaLabel={sendButtonLabel}
							variant={isStopState ? "stop" : "send"}
						/>
					</div>
				</div>
			)
		}

		// Helper function to render the text area section
		const renderTextAreaSection = () => (
			<div
				className={cn(
					"relative",
					"flex-1",
					"flex",
					"flex-col-reverse",
					"min-h-0",
					"overflow-hidden",
					"rounded",
				)}>
				<div
					ref={highlightLayerRef}
					className={cn(
						"absolute",
						"inset-0",
						"pointer-events-none",
						"whitespace-pre-wrap",
						"break-words",
						"text-transparent",
						"overflow-hidden",
						"font-vscode-font-family",
						"text-vscode-editor-font-size",
						"leading-vscode-editor-line-height",
						isFocused
							? "border border-vscode-focusBorder outline outline-vscode-focusBorder"
							: isDraggingOver
								? "border-2 border-dashed border-vscode-focusBorder"
								: "border border-transparent",
						isEditMode ? "pt-1.5 pb-10 px-2" : "py-1.5 px-2",
						"px-[8px]",
						"pr-9",
						"z-10",
						"forced-color-adjust-none",
					)}
					style={{
						color: "transparent",
					}}
				/>
				<DynamicTextArea
					ref={(el) => {
						if (typeof ref === "function") {
							ref(el)
						} else if (ref) {
							ref.current = el
						}
						textAreaRef.current = el
					}}
					value={inputValue}
					onChange={(e) => {
						handleInputChange(e)
						updateHighlights()
					}}
					onFocus={() => setIsFocused(true)}
					onKeyDown={handleKeyDown}
					onKeyUp={handleKeyUp}
					onBlur={handleBlur}
					onPaste={handlePaste}
					onSelect={updateCursorPosition}
					onMouseUp={updateCursorPosition}
					onHeightChange={(height) => {
						if (textAreaBaseHeight === undefined || height < textAreaBaseHeight) {
							setTextAreaBaseHeight(height)
						}

						onHeightChange?.(height)
					}}
					// kilocode_change: combine placeholderText and placeholderBottomText here
					placeholder={`${placeholderText}\n${placeholderBottomText}`}
					minRows={3}
					maxRows={15}
					autoFocus={true}
					className={cn(
						"w-full",
						"text-vscode-input-foreground",
						"font-vscode-font-family",
						"text-vscode-editor-font-size",
						"leading-vscode-editor-line-height",
						"cursor-text",
						isEditMode ? "pt-1.5 pb-10 px-2" : "py-1.5 px-2",
						isFocused
							? "border border-vscode-focusBorder outline outline-vscode-focusBorder"
							: isDraggingOver
								? "border-2 border-dashed border-vscode-focusBorder"
								: "border border-transparent",
						isDraggingOver
							? "bg-[color-mix(in_srgb,var(--vscode-input-background)_95%,var(--vscode-focusBorder))]"
							: "bg-vscode-input-background",
						"transition-background-color duration-150 ease-in-out",
						"will-change-background-color",
						"min-h-[90px]",
						"box-border",
						"rounded",
						"resize-none",
						"overflow-x-hidden",
						"overflow-y-auto",
						"pr-9",
						"flex-none flex-grow",
						"z-[2]",
						"scrollbar-none",
						"scrollbar-hide",
						"pb-6", // kilocode_change: provide breathing room at bottom of textarea
					)}
					onScroll={() => updateHighlights()}
				/>
				{/* kilocode_change {Transparent overlay at bottom of textArea to avoid text overlap } */}
				<div
					className="absolute bottom-[1px] left-2 right-2 h-8 bg-gradient-to-t from-[var(--vscode-input-background)] via-[var(--vscode-input-background)] to-transparent pointer-events-none z-[2]"
					aria-hidden="true"
				/>

				{!inputValue && (
					<div
						className="absolute left-2 z-30 pr-9 flex items-center h-8"
						style={{
							bottom: "0.25rem",
							color: "var(--vscode-tab-inactiveForeground)",
							userSelect: "none",
							pointerEvents: "none",
						}}>
						{/* kilocode_change {placeholderBottomText} */}
					</div>
				)}
			</div>
		)

		return (
			<div
				ref={containerRef}
				className={cn(
					"relative",
					"flex",
					"flex-col",
					"gap-1",
					"bg-editor-background",
					isEditMode ? "px-0" : "px-1.5",
					"pb-1",
					"outline-none",
					"border",
					"border-none",
					isEditMode ? "w-full" : "w-[calc(100%-16px)]",
					"ml-auto",
					"mr-auto",
					"box-border",
				)}>
				<div className="relative">
					<div
						className={cn("chat-text-area", "relative", "flex", "flex-col", "outline-none")}
						onDrop={handleDrop}
						onDragOver={(e) => {
							// Only allowed to drop images/files on shift key pressed.
							if (!e.shiftKey) {
								setIsDraggingOver(false)
								return
							}

							e.preventDefault()
							setIsDraggingOver(true)
							e.dataTransfer.dropEffect = "copy"
						}}
						onDragLeave={(e) => {
							e.preventDefault()
							const rect = e.currentTarget.getBoundingClientRect()

							if (
								e.clientX <= rect.left ||
								e.clientX >= rect.right ||
								e.clientY <= rect.top ||
								e.clientY >= rect.bottom
							) {
								setIsDraggingOver(false)
							}
						}}>
						{/* kilocode_change start: ImageWarningBanner integration */}
						<ImageWarningBanner
							messageKey={imageWarning ?? ""}
							onDismiss={dismissImageWarning}
							isVisible={!!imageWarning}
						/>
						{/* kilocode_change end: ImageWarningBanner integration */}
						{/* kilocode_change start: pull slash commands from Cline */}
						{showSlashCommandsMenu && (
							<div ref={slashCommandsMenuContainerRef}>
								<SlashCommandMenu
									onSelect={handleSlashCommandsSelect}
									selectedIndex={selectedSlashCommandsIndex}
									setSelectedIndex={setSelectedSlashCommandsIndex}
									onMouseDown={handleMenuMouseDown}
									query={slashCommandsQuery}
									customModes={customModes}
								/>
							</div>
						)}
						{/* kilocode_change end: pull slash commands from Cline */}
						{showContextMenu && (
							<div
								ref={contextMenuContainerRef}
								className={cn(
									"absolute",
									"bottom-full",
									"left-0",
									"right-0",
									"z-[1000]",
									"mb-2",
									"filter",
									"drop-shadow-md",
								)}>
								<ContextMenu
									onSelect={handleMentionSelect}
									searchQuery={searchQuery}
									inputValue={inputValue}
									onMouseDown={handleMenuMouseDown}
									selectedIndex={selectedMenuIndex}
									setSelectedIndex={setSelectedMenuIndex}
									selectedType={selectedType}
									queryItems={queryItems}
									modes={allModes}
									loading={searchLoading}
									dynamicSearchResults={fileSearchResults}
								/>
							</div>
						)}

						{renderTextAreaSection()}
						{renderNonEditModeControls()}
					</div>

					{isEditMode && (
						<EditModeControls
							mode={mode}
							onModeChange={handleModeChange}
							modeShortcutText={modeShortcutText}
							customModes={customModes}
							customModePrompts={customModePrompts}
							onCancel={onCancel}
							onSend={onSend}
							onSelectImages={onSelectImages}
							sendingDisabled={sendingDisabled}
							shouldDisableImages={shouldDisableImages}
						/>
					)}
				</div>

				{selectedImages.length > 0 && (
					<Thumbnails
						images={selectedImages}
						setImages={setSelectedImages}
						style={{
							left: "16px",
							zIndex: 2,
							marginTop: "14px", // kilocode_change
							marginBottom: 0,
						}}
					/>
				)}

				{/* kilocode_change: renderNonEditModeControls moved */}
			</div>
		)
	},
)
