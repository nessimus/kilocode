import {
	type ChangeEvent,
	type ComponentPropsWithoutRef,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { emojiGroups, emojiMap, type EmojiEntry } from "@/lib/emoji"

const RECENT_STORAGE_KEY = "gw:emoji-picker:recent:v1"
const MAX_RECENT = 24

const tokenizeSearch = (value: string): string[] =>
	value
		.toLowerCase()
		.replace(/[:_]/g, " ")
		.split(/\s+/)
		.filter(Boolean)

const matchesQuery = (emoji: EmojiEntry, tokens: string[]): boolean => {
	if (tokens.length === 0) {
		return true
	}

	return tokens.every((token) => {
		if (emoji.searchValue.includes(token)) {
			return true
		}
		return emoji.keywords.some((keyword) => keyword.includes(token))
	})
}

const loadStoredRecents = (): string[] => {
	if (typeof window === "undefined") {
		return []
	}

	try {
		const raw = window.localStorage.getItem(RECENT_STORAGE_KEY)
		if (!raw) {
			return []
		}
		const parsed: unknown = JSON.parse(raw)
		if (Array.isArray(parsed)) {
			return parsed.filter((entry): entry is string => typeof entry === "string")
		}
	} catch {
		// ignore storage errors
	}

	return []
}

interface EmojiSectionProps {
	title: string
	slug: string
	emojis: EmojiEntry[]
	selectedEmoji?: string
	onPick: (emoji: EmojiEntry) => void
	registerRef: (slug: string, node: HTMLElement | null) => void
}

const EmojiSection = ({ title, slug, emojis, onPick, registerRef, selectedEmoji }: EmojiSectionProps) => {
	if (emojis.length === 0) {
		return null
	}

	return (
		<section ref={(node) => registerRef(slug, node)} className="space-y-2">
			<header className="sticky top-0 z-10 -mx-1 px-1 py-1 backdrop-blur">
				<p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_88%,transparent_12%)]">
					{title}
				</p>
			</header>
			<div className="grid grid-cols-8 gap-1.5">
				{emojis.map((emoji) => {
					const isActive = emoji.emoji === selectedEmoji
					return (
					<button
						key={`${slug}-${emoji.slug}`}
						type="button"
						onClick={() => onPick(emoji)}
						className={cn(
							"flex h-9 w-9 items-center justify-center rounded-lg text-2xl transition-transform duration-75 hover:-translate-y-[1px] hover:scale-[1.05] hover:bg-[color-mix(in_srgb,var(--vscode-list-hoverBackground)_70%,transparent_30%)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--vscode-focusBorder)_85%,transparent_15%)]",
							isActive && "border border-[color-mix(in_srgb,var(--vscode-focusBorder)_70%,transparent_30%)]",
						)}
						aria-label={emoji.name}>
						{emoji.emoji}
					</button>
					)
				})}
			</div>
		</section>
	)
}

interface EmojiPickerProps {
	selectedEmoji?: string
	onSelect: (emoji: string) => void
	onRequestClose?: () => void
}

const EmojiPicker = ({ selectedEmoji, onSelect, onRequestClose }: EmojiPickerProps) => {
	const [search, setSearch] = useState("")
	const [recent, setRecent] = useState<string[]>([])

	const tokens = useMemo(() => tokenizeSearch(search), [search])
	const isSearching = tokens.length > 0

	const filteredGroups = useMemo(() => {
		if (!isSearching) {
			return emojiGroups.map((group) => ({ ...group, emojis: group.emojis }))
		}

		return emojiGroups
			.map((group) => ({
				name: group.name,
				slug: group.slug,
				emojis: group.emojis.filter((emoji) => matchesQuery(emoji, tokens)),
			}))
			.filter((group) => group.emojis.length > 0)
	}, [isSearching, tokens])

	const recentEntries = useMemo(() => {
		if (recent.length === 0) {
			return []
		}

		const seen = new Set<string>()
		const entries: EmojiEntry[] = []

		for (const emoji of recent) {
			if (seen.has(emoji)) {
				continue
			}
			const entry = emojiMap[emoji]
			if (entry) {
				entries.push(entry)
				seen.add(entry.emoji)
			}
		}

		return entries
	}, [recent])

	const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
	const scrollRef = useRef<HTMLDivElement | null>(null)

	const registerSectionRef = useCallback((slug: string, node: HTMLElement | null) => {
		sectionRefs.current[slug] = node
	}, [])

	const navigateToSection = useCallback(
		(slug: string) => {
			const container = scrollRef.current
			const section = sectionRefs.current[slug]
			if (!container || !section) {
				return
			}

			const offset = section.offsetTop - container.offsetTop
			container.scrollTo({ top: offset, behavior: "smooth" })
		},
		[],
	)

	const recordRecent = useCallback((emoji: string) => {
		if (!emoji) {
			return
		}
		setRecent((prev) => {
			const next = [emoji, ...prev.filter((entry) => entry !== emoji)]
			return next.slice(0, MAX_RECENT)
		})
	}, [])

	const handlePick = useCallback(
		(emoji: EmojiEntry) => {
			recordRecent(emoji.emoji)
			onSelect(emoji.emoji)
			onRequestClose?.()
		},
		[onRequestClose, onSelect, recordRecent],
	)

	useEffect(() => {
		setRecent(loadStoredRecents())
	}, [])

	useEffect(() => {
		if (typeof window === "undefined") {
			return
		}

		try {
			window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recent))
		} catch {
			// ignore storage write failures
		}
	}, [recent])

	const categoryNavItems = useMemo(
		() =>
			emojiGroups.map((group) => ({
				slug: group.slug,
				title: group.name,
				icon: group.emojis[0]?.emoji ?? "❔",
			})),
		[],
	)

	const hasResults = recentEntries.length > 0 || filteredGroups.length > 0

	return (
		<div className="flex flex-col gap-3">
			<div className="space-y-1">
				<label htmlFor="emoji-picker-search" className="sr-only">
					Search emoji
				</label>
				<div className="relative">
					<span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_82%,transparent_18%)]">
						<span className="codicon codicon-search" aria-hidden />
					</span>
					<Input
						id="emoji-picker-search"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Search"
						className="pl-9"
						autoComplete="off"
					/>
					{search && (
						<button
							type="button"
							onClick={() => setSearch("")}
							className="absolute inset-y-0 right-3 flex items-center text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_82%,transparent_18%)] hover:text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_95%,transparent_5%)]"
							aria-label="Clear search">
							<span className="codicon codicon-close" aria-hidden />
						</button>
					)}
				</div>
			</div>

			<div
				ref={scrollRef}
				className="max-h-72 overflow-y-auto pr-1"
				role="listbox"
				aria-label="Emoji results">
				{!hasResults && (
					<p className="py-8 text-center text-sm text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_85%,transparent_15%)]">
						No emoji found. Try another search.
					</p>
				)}

				{!isSearching && recentEntries.length > 0 && (
					<div className="pb-3">
						<EmojiSection
							title="Frequently Used"
							slug="recent"
							emojis={recentEntries}
							selectedEmoji={selectedEmoji}
							onPick={handlePick}
							registerRef={registerSectionRef}
						/>
					</div>
				)}

				{filteredGroups.map((group) => (
					<div key={group.slug} className="pb-3">
						<EmojiSection
							title={group.name}
							slug={group.slug}
							emojis={group.emojis}
							selectedEmoji={selectedEmoji}
							onPick={handlePick}
							registerRef={registerSectionRef}
						/>
					</div>
				))}
			</div>

			<nav className="flex items-center justify-between gap-1 overflow-x-auto rounded-md border border-[color-mix(in_srgb,var(--vscode-focusBorder)_28%,transparent_72%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_82%,rgba(255,255,255,0.08)_18%)] px-2 py-1">
				{categoryNavItems.map((item) => (
					<button
						key={item.slug}
						type="button"
						onClick={() => {
							if (isSearching) {
								setSearch("")
								setTimeout(() => navigateToSection(item.slug), 0)
							} else {
								navigateToSection(item.slug)
							}
						}}
						className="flex h-8 w-8 items-center justify-center rounded-full text-xl transition hover:bg-[color-mix(in_srgb,var(--vscode-list-hoverBackground)_75%,transparent_25%)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--vscode-focusBorder)_85%,transparent_15%)]"
						aria-label={item.title}>
						{item.icon}
					</button>
				))}
			</nav>
		</div>
	)
}

interface EmojiPickerFieldProps extends ComponentPropsWithoutRef<typeof Input> {
	onEmojiSelect?: (emoji: string) => void
	wrapperClassName?: string
}

export const EmojiPickerField = ({
	onEmojiSelect,
	wrapperClassName,
	className,
	disabled,
	value,
	...inputProps
}: EmojiPickerFieldProps) => {
	const [open, setOpen] = useState(false)
	const stringValue = typeof value === "string" ? value : value ? String(value) : ""

	const handleSelect = useCallback(
		(emoji: string) => {
			if (onEmojiSelect) {
				onEmojiSelect(emoji)
			} else if (inputProps.onChange) {
				const syntheticEvent = {
					target: { value: emoji } as HTMLInputElement,
					currentTarget: { value: emoji } as HTMLInputElement,
				} as ChangeEvent<HTMLInputElement>
				inputProps.onChange(syntheticEvent)
			}

			setOpen(false)
		},
		[inputProps, onEmojiSelect],
	)

	const handleClear = useCallback(() => {
		handleSelect("")
	}, [handleSelect])

	return (
		<div className={cn("flex items-center gap-2", wrapperClassName)}>
			<Input
				value={stringValue}
				className={className}
				disabled={disabled}
				{...inputProps}
			/>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						variant="outline"
						size="icon"
						disabled={disabled}
						aria-label={stringValue ? `Selected emoji ${stringValue}, click to change` : "Open emoji picker"}>
						<span className="text-xl leading-none" aria-hidden>
							{stringValue || "🙂"}
						</span>
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-[360px] max-w-[80vw] p-0" sideOffset={6}>
					<div className="border-b border-[color-mix(in_srgb,var(--vscode-focusBorder)_60%,transparent_40%)] px-4 py-2">
						<p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_84%,transparent_16%)]">
							Choose an emoji
						</p>
					</div>
					<div className="p-3">
						<EmojiPicker
							onSelect={handleSelect}
							onRequestClose={() => setOpen(false)}
							selectedEmoji={stringValue}
						/>
					</div>
					{stringValue && (
						<div className="border-t border-[color-mix(in_srgb,var(--vscode-focusBorder)_28%,transparent_72%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_84%,rgba(255,255,255,0.06)_16%)] px-3 py-2">
							<Button type="button" variant="ghost" size="sm" onClick={handleClear} className="w-full">
								Clear selection
							</Button>
						</div>
					)}
				</PopoverContent>
			</Popover>
		</div>
	)
}

export default EmojiPickerField
