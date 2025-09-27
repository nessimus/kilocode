import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import clsx from "clsx"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cloverAutomationFunctions } from "@roo/golden/cloverAutomation"
import { Badge } from "@/components/ui/badge"
import { OuterGateInsightEvent, OuterGateInsightEventChange, OuterGateInsightStage } from "@roo/golden/outerGate"

export type CloverSpeaker = "user" | "clover"

export interface CloverAutomationCall {
	name: string
	title?: string
	status: "succeeded" | "failed"
	summary?: string
	inputs?: Array<{ label: string; value: string }>
	outputLines?: string[]
	error?: string
}

export interface CloverMessage {
	id: string
	speaker: CloverSpeaker
	text: string
	timestamp: string | number | Date
	highlight?: boolean
	attachments?: Array<{ id: string; name: string }>
	systemPromptPreview?: string
	insightEvent?: OuterGateInsightEvent
	automationCall?: CloverAutomationCall
}

export interface OuterGateCloverConsoleProps {
	title?: string
	subtitle?: string
	status?: string
	messages: CloverMessage[]
	suggestions?: string[]
	isProcessing?: boolean
	onSend: (content: string) => void
	onSuggestionSelected?: (content: string) => void
	onOpenSettings?: () => void
}

const CLOVER_PROFILE_DESCRIPTION =
	"Clover is your concierge for momentum—turning raw ideas, context, and signals into coordinated action across your workspace."

const SPEAKER_LABEL: Record<CloverSpeaker, string> = {
	user: "You",
	clover: "Clover AI",
}

const INSIGHT_STAGE_LABEL: Record<OuterGateInsightStage, string> = {
	captured: "Captured",
	processing: "Processing",
	ready: "Ready",
	assigned: "Assigned",
}

const INSIGHT_STAGE_THEME: Record<OuterGateInsightStage, string> = {
	captured:
		"bg-[color-mix(in_srgb,var(--primary)_22%,rgba(255,255,255,0.65)_78%)] text-[color-mix(in_srgb,var(--primary-foreground,#221602)_88%,rgba(255,255,255,0.1)_12%)]",
	processing:
		"bg-[color-mix(in_srgb,var(--vscode-editor-foreground)_12%,rgba(255,255,255,0.12)_88%)] text-[color-mix(in_srgb,var(--primary)_60%,rgba(255,255,255,0.24)_40%)]",
	ready: "bg-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.7)_82%)] text-[color-mix(in_srgb,var(--primary-foreground,#1d1405)_92%,rgba(255,255,255,0.05)_8%)]",
	assigned:
		"bg-[color-mix(in_srgb,rgba(24,18,8,0.85)_80%,rgba(212,175,55,0.3)_20%)] text-[color-mix(in_srgb,var(--primary)_68%,rgba(255,255,255,0.38)_32%)]",
}

const INSIGHT_FIELD_LABEL: Record<OuterGateInsightEventChange["field"], string> = {
	title: "Title",
	summary: "Summary",
	stage: "Stage",
	recommendedWorkspace: "Recommended Workspace",
	assignedCompanyId: "Assigned Company",
	capturedAtIso: "Captured On",
	sourceType: "Source",
}

const formatAbsoluteTime = (iso?: string): string | undefined => {
	if (!iso) {
		return undefined
	}
	try {
		const date = new Date(iso)
		if (Number.isNaN(date.getTime())) {
			return undefined
		}
		return new Intl.DateTimeFormat(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
		}).format(date)
	} catch {
		return undefined
	}
}

const formatChangeValue = (
	field: OuterGateInsightEventChange["field"],
	value?: string,
): string | undefined => {
	if (!value) {
		return undefined
	}
	switch (field) {
		case "stage":
			return INSIGHT_STAGE_LABEL[value as OuterGateInsightStage] ?? value
		case "capturedAtIso":
			return formatAbsoluteTime(value)
		case "sourceType":
			return value.charAt(0).toUpperCase() + value.slice(1)
		default:
			return value
	}
}

const bubbleBaseClasses =
	"rounded-2xl border px-3.5 py-3 text-sm leading-relaxed shadow-sm backdrop-blur-sm transition-colors"

const formatRelativeTime = (value: CloverMessage["timestamp"]): string => {
	const date = value instanceof Date ? value : new Date(value)
	const now = Date.now()
	const diffMs = date.getTime() - now
	const diffMinutes = Math.round(diffMs / 60000)
	if (Math.abs(diffMinutes) < 1) {
		return "moments ago"
	}

	const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
	if (Math.abs(diffMinutes) < 60) {
		return rtf.format(diffMinutes, "minute")
	}
	const diffHours = Math.round(diffMinutes / 60)
	if (Math.abs(diffHours) < 24) {
		return rtf.format(diffHours, "hour")
	}
	const diffDays = Math.round(diffHours / 24)
	return rtf.format(diffDays, "day")
}

const CloverMessageBubble: React.FC<{ message: CloverMessage }> = ({ message }) => {
	const isClover = message.speaker === "clover"
	const formattedTime = useMemo(() => formatRelativeTime(message.timestamp), [message.timestamp])
	const [isPromptOpen, setPromptOpen] = useState(false)
	const [copiedPrompt, setCopiedPrompt] = useState(false)
	const promptPreview = message.systemPromptPreview?.trim()
	const insightEvent = message.insightEvent
	const insight = insightEvent?.insight
	const automationCall = message.automationCall
	const metadataRows: Array<{ icon: string; label: string; value: string }> = []
	if (insight?.recommendedWorkspace) {
		metadataRows.push({
			icon: "codicon-map",
			label: "Recommended workspace",
			value: insight.recommendedWorkspace,
		})
	}
	if (insight?.assignedCompanyId) {
		metadataRows.push({
			icon: "codicon-organization",
			label: "Assigned company",
			value: insight.assignedCompanyId,
		})
	}
	const capturedDisplay = insight ? formatAbsoluteTime(insight.capturedAtIso) : undefined
	if (capturedDisplay) {
		metadataRows.push({ icon: "codicon-clock", label: "Captured on", value: capturedDisplay })
	}
	const changes = insightEvent?.changes ?? []

	useEffect(() => {
		if (!copiedPrompt) {
			return
		}
		const timer = setTimeout(() => setCopiedPrompt(false), 1600)
		return () => clearTimeout(timer)
	}, [copiedPrompt])

	useEffect(() => {
		if (!isPromptOpen) {
			setCopiedPrompt(false)
		}
	}, [isPromptOpen])

	const handleCopyPrompt = useCallback(() => {
		if (!promptPreview) {
			return
		}
		try {
			const clipboard = navigator.clipboard
			if (!clipboard?.writeText) {
				setCopiedPrompt(false)
				return
			}
			void clipboard
				.writeText(promptPreview)
				.then(() => setCopiedPrompt(true))
				.catch(() => setCopiedPrompt(false))
		} catch {
			setCopiedPrompt(false)
		}
	}, [promptPreview])

	return (
		<>
			<div
				className={clsx("flex w-full gap-3", {
					"flex-row": isClover,
					"flex-row-reverse": !isClover,
				})}>
				<div
					className={clsx(
						bubbleBaseClasses,
						"max-w-[74%] border-transparent",
						isClover
							? "bg-[color-mix(in_srgb,var(--vscode-editor-background)_78%,rgba(255,247,226,0.65)_22%)] text-[color-mix(in_srgb,var(--vscode-foreground)_90%,#fdf6da_10%)]"
							: "bg-[color-mix(in_srgb,var(--vscode-editor-background)_70%,rgba(34,24,12,0.65)_30%)] text-[color-mix(in_srgb,var(--vscode-foreground)_88%,#fff3d7_12%)]",
						{
							"ring-1 ring-[color-mix(in_srgb,var(--primary)_60%,rgba(255,255,255,0.32)_40%)]":
								message.highlight,
						},
					)}>

					<div className="flex items-baseline justify-between gap-2">
						<span className="text-xs font-semibold uppercase tracking-wide text-[color-mix(in_srgb,var(--primary)_65%,rgba(255,255,255,0.4)_35%)]">
							{SPEAKER_LABEL[message.speaker]}
						</span>
						<span className="text-[11px] text-[color-mix(in_srgb,var(--vscode-foreground)_62%,rgba(255,255,255,0.42)_38%)]">
							{formattedTime}
						</span>
					</div>
					{automationCall ? (
						<AutomationCallCard call={automationCall} fallbackText={message.text} />
					) : insightEvent ? (
						<div className="mt-2 space-y-3">
							<div className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--primary)_26%,rgba(255,255,255,0.28)_74%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_58%,rgba(255,255,255,0.18)_42%)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[color-mix(in_srgb,var(--primary)_68%,rgba(255,255,255,0.3)_32%)] shadow-[0_8px_16px_rgba(0,0,0,0.22)]">
								<span className="codicon codicon-sparkle" />
								{insightEvent.type === "created" ? "Insight Captured" : "Insight Updated"}
							</div>
							{!insightEvent.note && message.text && (
								<p className="text-[0.92rem] leading-6 text-[color-mix(in_srgb,var(--vscode-foreground)_90%,rgba(255,255,255,0.12)_10%)]">
									{message.text}
								</p>
							)}
							{insightEvent.note && (
								<p className="text-[0.92rem] leading-6 text-[color-mix(in_srgb,var(--vscode-foreground)_92%,rgba(255,255,255,0.08)_8%)]">
									{insightEvent.note}
								</p>
							)}
							{insight && (
								<div className="space-y-3 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.28)_82%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_76%,rgba(255,255,255,0.14)_24%)] px-4 py-4 shadow-[0_18px_36px_rgba(12,8,2,0.28)]">
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0 space-y-1">
											<p className="text-sm font-semibold text-[color-mix(in_srgb,var(--vscode-foreground)_90%,rgba(255,255,255,0.1)_10%)]">
												{insight.title}
											</p>
											{insight.summary && (
												<p className="text-sm leading-6 text-[color-mix(in_srgb,var(--vscode-foreground)_82%,rgba(255,255,255,0.18)_18%)]">
													{insight.summary}
												</p>
											)}
										</div>
										<Badge
											className={clsx(
												"rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.24em] shadow-sm",
												INSIGHT_STAGE_THEME[insight.stage],
											)}>
											{INSIGHT_STAGE_LABEL[insight.stage]}
										</Badge>
									</div>
									{metadataRows.length > 0 && (
										<div className="mt-3 space-y-2 text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_74%,rgba(255,255,255,0.24)_26%)]">
											{metadataRows.map((row) => (
												<div key={row.label} className="flex items-center gap-2">
													<span className={clsx("codicon text-[color-mix(in_srgb,var(--primary)_60%,rgba(255,255,255,0.32)_40%)]", row.icon)} />
													<span>
														<span className="font-medium text-[color-mix(in_srgb,var(--vscode-foreground)_86%,rgba(255,255,255,0.16)_14%)]">
															{row.label}
														</span>{" "}
														<span>{row.value}</span>
													</span>
												</div>
											))}
										</div>
									)}
									{changes.length > 0 && (
										<div className="mt-4 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.26)_82%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_82%,rgba(255,255,255,0.08)_18%)] px-3 py-2 text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_76%,rgba(255,255,255,0.26)_24%)]">
											<p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[color-mix(in_srgb,var(--primary)_62%,rgba(255,255,255,0.3)_38%)]">
												Refinements
											</p>
											<ul className="space-y-1">
												{changes.map((change, idx) => {
													const fieldLabel = INSIGHT_FIELD_LABEL[change.field] ?? change.field
													const fromValue = formatChangeValue(change.field, change.from) ?? "—"
													const toValue = formatChangeValue(change.field, change.to) ?? "—"
													return (
														<li key={`${change.field}-${idx}`} className="flex items-start gap-2">
															<span className="codicon codicon-edit text-[color-mix(in_srgb,var(--primary)_60%,rgba(255,255,255,0.28)_40%)] mt-[2px]" />
															<span className="text-[color-mix(in_srgb,var(--vscode-foreground)_80%,rgba(255,255,255,0.2)_20%)]">
																<span className="font-medium text-[color-mix(in_srgb,var(--vscode-foreground)_90%,rgba(255,255,255,0.14)_10%)]">{fieldLabel}</span>{" "}
																<span>
																	{fromValue}
																	<span className="mx-1 text-[color-mix(in_srgb,var(--primary)_64%,rgba(255,255,255,0.26)_36%)]">→</span>
																	{toValue}
																</span>
															</span>
														</li>
													)
												})}
											</ul>
										</div>
									)}
								</div>
							)}
						</div>
					) : (
						<p className="mt-1 whitespace-pre-wrap text-[0.92rem] leading-6 text-[color-mix(in_srgb,var(--vscode-foreground)_92%,rgba(255,255,255,0.08)_8%)]">
							{message.text}
						</p>
					)}
					{message.attachments && message.attachments.length > 0 && (
						<ul className="mt-3 flex flex-wrap gap-2 text-xs">
							{message.attachments.map((attachment) => (
								<li
									key={attachment.id}
									className="flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,rgba(255,255,255,0.32)_88%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_84%,rgba(255,255,255,0.08)_16%)] px-2.5 py-1">
									<span className="codicon codicon-paperclip text-[color-mix(in_srgb,var(--vscode-foreground)_48%,rgba(255,255,255,0.6)_52%)]" />
									<span className="truncate text-[11px] font-medium text-[color-mix(in_srgb,var(--vscode-foreground)_82%,rgba(255,255,255,0.16)_18%)]">
										{attachment.name}
									</span>
								</li>
							))}
						</ul>
					)}
					{promptPreview && (
						<button
							type="button"
							onClick={() => setPromptOpen(true)}
							className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.24em] text-[color-mix(in_srgb,var(--primary)_62%,rgba(255,255,255,0.28)_38%)] transition-colors hover:text-[color-mix(in_srgb,var(--primary)_72%,rgba(255,255,255,0.22)_28%)]">
							<span className="codicon codicon-eye" /> Preview system prompt
						</button>
					)}
				</div>
			</div>
			{promptPreview && (
				<Dialog open={isPromptOpen} onOpenChange={setPromptOpen}>
					<DialogContent className="sm:max-w-3xl">
						<DialogHeader>
							<DialogTitle>Clover System Prompt</DialogTitle>
							<DialogDescription>
								This is the instruction block sent with Clover’s response.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-4">
							<Textarea
								value={promptPreview}
								readOnly
								spellCheck={false}
								className="min-h-[280px] resize-vertical border-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.22)_82%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,rgba(255,255,255,0.06)_10%)] text-[0.9rem] leading-6 text-[color-mix(in_srgb,var(--vscode-foreground)_90%,rgba(255,255,255,0.1)_10%)]"
							/>
						</div>
						<DialogFooter className="flex w-full items-center justify-end gap-2">
							<Button
								variant="secondary"
								size="sm"
								onClick={handleCopyPrompt}
								className="inline-flex items-center gap-1">
								<span className="codicon codicon-clippy" />
								{copiedPrompt ? "Copied" : "Copy"}
							</Button>
							<Button
								variant="default"
								size="sm"
								onClick={() => setPromptOpen(false)}
								className="inline-flex items-center gap-1">
								Close
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</>
	)
}

export const OuterGateCloverConsole: React.FC<OuterGateCloverConsoleProps> = ({
	title = "Clover AI Concierge",
	subtitle = "Tell me what’s lighting you up right now and I’ll turn it into momentum.",
	status = "Ready",
	messages,
	suggestions = [],
	isProcessing = false,
	onSend,
	onSuggestionSelected,
	onOpenSettings,
}) => {
	const [draft, setDraft] = useState("")
	const scrollRef = useRef<HTMLDivElement>(null)
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const [isFocused, setIsFocused] = useState(false)
	const [isProfileOpen, setProfileOpen] = useState(false)

	useEffect(() => {
		if (!scrollRef.current) {
			return
		}
		scrollRef.current.scrollTop = scrollRef.current.scrollHeight
	}, [messages])

	useEffect(() => {
		const handler = (event: MessageEvent) => {
			if (event.data?.type !== "outerGatePrefillDraft") {
				return
			}
			const payload = event.data as { text?: string; append?: boolean; replace?: boolean; focus?: boolean }
			const { text = "", append, replace, focus } = payload
			setDraft((prev) => {
				if (append && !replace) {
					return prev ? `${prev.trimEnd()} ${text}` : text
				}
				if (append && replace) {
					return text
				}
				if (!append && replace === false) {
					return `${prev}${text}`
				}
				return text
			})
			if (focus) {
				setIsFocused(true)
				setTimeout(() => {
					const area = textareaRef.current
					if (!area) {
						return
					}
					area.focus()
					const cursor = area.value.length
					area.setSelectionRange(cursor, cursor)
				}, 0)
			}
		}
		window.addEventListener("message", handler)
		return () => window.removeEventListener("message", handler)
	}, [])

	const handleSubmit = useCallback(
		(event?: React.FormEvent) => {
			if (event) {
				event.preventDefault()
			}

			const trimmed = draft.trim()
			if (!trimmed || isProcessing) {
				return
			}

			onSend(trimmed)
			setDraft("")
		},
		[draft, isProcessing, onSend],
	)

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
				handleSubmit()
			}
		},
		[handleSubmit],
	)

	return (
		<div className="relative flex h-full min-h-[480px] w-full flex-col overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--primary)_16%,rgba(255,255,255,0.24)_84%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_78%,rgba(255,248,220,0.18)_22%)] shadow-[0_30px_80px_rgba(16,9,1,0.38)]">
			<Dialog open={isProfileOpen} onOpenChange={setProfileOpen}>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>Clover AI Profile</DialogTitle>
						<DialogDescription>{CLOVER_PROFILE_DESCRIPTION}</DialogDescription>
					</DialogHeader>
					<div className="mt-4 grid gap-3 sm:grid-cols-2">
						{cloverAutomationFunctions.map((fn) => (
							<div
								key={fn.name}
								className="flex h-full flex-col gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.22)_82%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_85%,rgba(255,255,255,0.08)_15%)] px-4 py-4 text-sm shadow-[0_18px_34px_rgba(0,0,0,0.18)]">
								<span className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--primary)_65%,rgba(255,255,255,0.3)_35%)]">
									{fn.title}
								</span>
								<p className="leading-relaxed text-[color-mix(in_srgb,var(--vscode-foreground)_78%,rgba(255,255,255,0.18)_22%)]">
									{fn.description}
								</p>
								<span className="text-[10px] uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--vscode-foreground)_48%,rgba(255,255,255,0.28)_52%)]">
									{fn.name}
								</span>
							</div>
						))}
					</div>
					<DialogFooter className="mt-4 flex w-full justify-end">
						<Button variant="secondary" onClick={() => setProfileOpen(false)}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<div className="absolute inset-0 -z-[1] bg-[radial-gradient(circle_at_top,rgba(255,238,205,0.18),transparent_65%)] opacity-70" />
			<header className="flex items-start justify-between gap-4 px-6 pt-5">
				<div>
					<button
						type="button"
						onClick={() => setProfileOpen(true)}
						aria-haspopup="dialog"
						aria-expanded={isProfileOpen}
						aria-label={`View ${title} profile`}
						className="group inline-flex items-center gap-2 rounded-full px-1 py-1 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_65%,rgba(255,255,255,0.08)_35%)] focus-visible:outline-none">
						<span className="inline-flex h-2 w-2 rounded-full bg-[color-mix(in_srgb,var(--primary)_65%,rgba(255,255,255,0.35)_35%)] shadow-[0_0_12px_rgba(212,175,55,0.6)]" />
						<h2 className="text-base font-semibold tracking-wide text-[color-mix(in_srgb,var(--vscode-foreground)_88%,rgba(255,255,255,0.12)_12%)]">
							{title}
						</h2>
						<span className="codicon codicon-account text-[color-mix(in_srgb,var(--vscode-foreground)_52%,rgba(255,255,255,0.32)_48%)] transition-colors group-hover:text-[color-mix(in_srgb,var(--primary)_68%,rgba(255,255,255,0.2)_32%)]" />
					</button>
					<p className="mt-2 max-w-xl text-sm text-[color-mix(in_srgb,var(--vscode-foreground)_74%,rgba(255,255,255,0.18)_26%)]">
						{subtitle}
					</p>
				</div>
				<div className="flex flex-col items-end gap-2">
					<div className="flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--primary)_22%,rgba(255,255,255,0.35)_78%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_65%,rgba(255,255,255,0.08)_35%)] px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-[color-mix(in_srgb,var(--primary)_58%,rgba(255,255,255,0.32)_42%)]">
						<span className="codicon codicon-sparkle" />
						{status}
					</div>
					{onOpenSettings && (
						<button
							type="button"
							onClick={onOpenSettings}
							className="inline-flex items-center gap-1 text-[11px] font-medium text-[color-mix(in_srgb,var(--vscode-foreground)_70%,rgba(255,255,255,0.3)_30%)] transition-colors hover:text-[color-mix(in_srgb,var(--primary)_62%,rgba(255,255,255,0.18)_38%)]">
							<span className="codicon codicon-settings-gear" /> Adjust tools
						</button>
					)}
				</div>
			</header>
			<Separator className="mt-4 bg-[color-mix(in_srgb,var(--vscode-foreground)_6%,rgba(255,255,255,0.24)_94%)]" />
			<div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
				{messages.length === 0 ? (
					<div className="h-full min-h-[260px] w-full rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--vscode-foreground)_10%,rgba(255,255,255,0.18)_90%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_82%,rgba(255,255,255,0.08)_18%)] p-6 text-sm text-[color-mix(in_srgb,var(--vscode-foreground)_70%,rgba(255,255,255,0.28)_30%)]">
						<p className="font-medium">Tell Clover what passion you want to explore.</p>
						<ul className="mt-3 space-y-2 text-[0.88rem] leading-relaxed">
							<li className="flex items-start gap-2">
								<span className="codicon codicon-sparkle mt-[3px] text-[color-mix(in_srgb,var(--primary)_65%,rgba(255,255,255,0.34)_35%)]" />
								<span>
									Drop in a voice note or a random brain dump—Clover will classify it and propose the
									right workspace.
								</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="codicon codicon-globe mt-[3px] text-[color-mix(in_srgb,var(--primary)_65%,rgba(255,255,255,0.34)_35%)]" />
								<span>
									Reference Notion pages, ChatGPT exports, or any context you want Clover to fold in.
								</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="codicon codicon-rocket mt-[3px] text-[color-mix(in_srgb,var(--primary)_65%,rgba(255,255,255,0.34)_35%)]" />
								<span>
									Clover maps what matters, spins up AI teammates, and stages the workspace when
									you’re ready.
								</span>
							</li>
						</ul>
					</div>
				) : (
					messages.map((message) => <CloverMessageBubble key={message.id} message={message} />)
				)}
			</div>
			{suggestions.length > 0 && (
				<div className="flex flex-wrap gap-2 px-6 pb-3">
					{suggestions.map((suggestion, index) => (
						<Button
							key={`${suggestion}-${index}`}
							variant="secondary"
							size="sm"
							className="border border-[color-mix(in_srgb,var(--primary)_14%,rgba(255,255,255,0.24)_86%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_78%,rgba(212,175,55,0.18)_22%)] text-[color-mix(in_srgb,var(--vscode-foreground)_80%,rgba(255,255,255,0.16)_20%)] shadow-[0_12px_24px_rgba(0,0,0,0.22)] hover:border-[color-mix(in_srgb,var(--primary)_32%,rgba(255,255,255,0.3)_68%)] hover:text-[color-mix(in_srgb,var(--primary)_58%,rgba(255,255,255,0.2)_42%)]"
							onClick={() => {
								if (onSuggestionSelected) {
									onSuggestionSelected(suggestion)
								}
								setDraft((prev) => (prev ? `${prev} ${suggestion}` : suggestion))
							}}>
							{suggestion}
						</Button>
					))}
				</div>
			)}
			<form onSubmit={handleSubmit} className="space-y-3 px-6 pb-6">
				<div
					className={clsx(
						"rounded-2xl border border-[color-mix(in_srgb,var(--primary)_16%,rgba(255,255,255,0.18)_84%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_80%,rgba(255,255,255,0.12)_20%)] p-0 shadow-[0_18px_40px_rgba(0,0,0,0.32)] transition-colors",
						{
							"border-[color-mix(in_srgb,var(--primary)_32%,rgba(255,255,255,0.35)_68%)]": isFocused,
						},
					)}>
					<Textarea
						autoFocus
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						onFocus={() => setIsFocused(true)}
						onBlur={() => setIsFocused(false)}
						onKeyDown={handleKeyDown}
						placeholder="Capture a spark, link a resource, or ask for directions."
						data-outer-gate-composer
						ref={textareaRef}
						className="min-h-[110px] resize-none border-none bg-transparent px-4 py-4 text-[0.95rem] leading-6 text-[color-mix(in_srgb,var(--vscode-foreground)_90%,rgba(255,255,255,0.1)_10%)] placeholder:text-[color-mix(in_srgb,var(--vscode-foreground)_52%,rgba(255,255,255,0.35)_48%)]"
					/>
					<div className="flex items-center justify-between border-t border-[color-mix(in_srgb,var(--vscode-foreground)_7%,rgba(255,255,255,0.18)_93%)] px-4 py-3 text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_66%,rgba(255,255,255,0.24)_34%)]">
						<div className="flex items-center gap-3">
							<span className="inline-flex items-center gap-1">
								<span className="codicon codicon-device-camera" />
								Attach
							</span>
							<span className="inline-flex items-center gap-1">
								<span className="codicon codicon-unfold" />
								Drop files, voice, or links
							</span>
						</div>
						<span className="text-[10px] uppercase tracking-[0.24em] text-[color-mix(in_srgb,var(--primary)_55%,rgba(255,255,255,0.28)_45%)]">
							Press ⌘⏎ to send
						</span>
					</div>
				</div>
				<Button
					type="submit"
					className="w-full items-center justify-center gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_45%,rgba(255,255,255,0.22)_55%)] bg-[color-mix(in_srgb,var(--primary)_82%,rgba(255,255,255,0.08)_18%)] py-3 text-base font-semibold text-[color-mix(in_srgb,var(--primary-foreground, #211703)_88%,rgba(255,255,255,0.08)_12%)] shadow-[0_18px_36px_rgba(212,175,55,0.35)] transition-transform hover:-translate-y-[1px] hover:bg-[color-mix(in_srgb,var(--primary)_88%,rgba(255,255,255,0.1)_12%)] disabled:cursor-not-allowed disabled:border-[color-mix(in_srgb,var(--vscode-foreground)_12%,rgba(255,255,255,0.12)_88%)] disabled:bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,rgba(255,255,255,0.08)_12%)] disabled:text-[color-mix(in_srgb,var(--vscode-foreground)_56%,rgba(255,255,255,0.22)_44%)]"
					disabled={!draft.trim() || isProcessing}>
					{isProcessing ? (
						<>
							<span className="codicon codicon-loading codicon-modifier-spin" />
							Thinking
						</>
					) : (
						<>
							Send to Clover
							<span className="codicon codicon-rocket" />
						</>
					)}
				</Button>
			</form>
		</div>
	)
}

export default OuterGateCloverConsole

const humanizeAutomationLabel = (value: string): string =>
	value
		.split(/[_\s-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ") || "Automation Call"

const AutomationCallCard: React.FC<{ call: CloverAutomationCall; fallbackText: string }> = ({ call, fallbackText }) => {
	const statusLabel = call.status === "succeeded" ? "Completed" : "Failed"
	const badgeClass = call.status === "succeeded"
		? "bg-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.72)_82%)] text-[color-mix(in_srgb,var(--primary-foreground,#1d1405)_92%,rgba(255,255,255,0.08)_8%)]"
		: "bg-[color-mix(in_srgb,rgba(220,72,72,0.72)_68%,rgba(48,12,12,0.42)_32%)] text-[color-mix(in_srgb,rgba(255,255,255,0.9)_82%,rgba(220,72,72,0.4)_18%)]"
	const title = call.title ?? humanizeAutomationLabel(call.name)
	const summaryText = call.summary ?? fallbackText
	const inputs = call.inputs ?? []
	const outputs = call.outputLines ?? []

	return (
		<div className="mt-1 space-y-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 space-y-1">
					<p className="text-sm font-semibold text-[color-mix(in_srgb,var(--vscode-foreground)_88%,rgba(255,255,255,0.12)_12%)]">
						{title}
					</p>
					{summaryText && (
						<p className="text-[0.92rem] leading-6 text-[color-mix(in_srgb,var(--vscode-foreground)_90%,rgba(255,255,255,0.08)_10%)]">
							{summaryText}
						</p>
					)}
				</div>
				<Badge
					className={clsx(
						"rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.24em] shadow-sm",
						badgeClass,
					)}>
					{statusLabel}
				</Badge>
			</div>
			{inputs.length > 0 && (
				<div className="space-y-2 rounded-xl border border-[color-mix(in_srgb,var(--primary)_18%,rgba(255,255,255,0.28)_82%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_82%,rgba(255,255,255,0.12)_18%)] px-4 py-3 shadow-[0_10px_20px_rgba(0,0,0,0.18)]">
					<p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[color-mix(in_srgb,var(--primary)_62%,rgba(255,255,255,0.32)_38%)]">
						Inputs
					</p>
					<dl className="space-y-2 text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_80%,rgba(255,255,255,0.2)_20%)]">
						{inputs.map((input) => (
							<div key={`${input.label}-${input.value}`} className="flex gap-2">
								<dt className="shrink-0 font-medium text-[color-mix(in_srgb,var(--vscode-foreground)_88%,rgba(255,255,255,0.16)_12%)]">
									{input.label}
								</dt>
								<dd className="text-[color-mix(in_srgb,var(--vscode-foreground)_76%,rgba(255,255,255,0.26)_24%)]">
									{input.value}
								</dd>
							</div>
						))}
					</dl>
				</div>
			)}
			{outputs.length > 0 && (
				<div className="space-y-2 rounded-xl border border-[color-mix(in_srgb,var(--primary)_12%,rgba(255,255,255,0.24)_88%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_86%,rgba(255,255,255,0.1)_14%)] px-4 py-3 text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_78%,rgba(255,255,255,0.22)_22%)] shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
					<p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[color-mix(in_srgb,var(--primary)_58%,rgba(255,255,255,0.32)_42%)]">
						Highlights
					</p>
					<ul className="mt-1 space-y-1 list-disc pl-5">
						{outputs.map((line, index) => (
							<li key={`${line}-${index}`} className="leading-relaxed">
								{line}
							</li>
						))}
					</ul>
				</div>
			)}
			{call.error && (
				<div className="flex gap-2 rounded-xl border border-[color-mix(in_srgb,rgba(220,72,72,0.8)_56%,rgba(0,0,0,0.4)_44%)] bg-[color-mix(in_srgb,rgba(220,72,72,0.12)_68%,rgba(0,0,0,0.52)_32%)] px-3 py-2 text-xs text-[color-mix(in_srgb,rgba(255,255,255,0.92)_80%,rgba(220,72,72,0.4)_20%)]">
					<span className="codicon codicon-alert" />
					<span>{call.error}</span>
				</div>
			)}
		</div>
	)
}
