import * as React from "react"
import { CaretDownIcon } from "@radix-ui/react-icons"
import type { IconProps } from "@radix-ui/react-icons/dist/types"
import { Check, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { useRooPortal } from "./hooks/useRooPortal"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui"
import { StandardTooltip } from "@/components/ui"

export enum DropdownOptionType {
	ITEM = "item",
	SEPARATOR = "separator",
	SHORTCUT = "shortcut",
	ACTION = "action",
}

export interface DropdownOption {
	value: string
	label: string
	codicon?: string
	description?: string
	disabled?: boolean
	type?: DropdownOptionType
	pinned?: boolean
}

export interface SelectDropdownProps {
	value: string
	options: DropdownOption[]
	onChange: (value: string) => void
	disabled?: boolean
	initiallyOpen?: boolean
	title?: string
	triggerClassName?: string
	contentClassName?: string
	itemClassName?: string
	sideOffset?: number
	align?: "start" | "center" | "end"
	placeholder?: string
	shortcutText?: string
	renderItem?: (option: DropdownOption) => React.ReactNode
	disableSearch?: boolean
	triggerIcon?:
		| React.ForwardRefExoticComponent<IconProps & React.RefAttributes<SVGSVGElement>>
		| boolean
		| undefined
	onCreateOption?: (value: string) => void | Promise<void>
	createOptionLabel?: (value: string) => string
}

const isInteractiveOption = (option: DropdownOption) => {
	return option.type !== DropdownOptionType.SEPARATOR && option.type !== DropdownOptionType.SHORTCUT
}

const getTriggerIcon = (
	icon:
		| React.ForwardRefExoticComponent<IconProps & React.RefAttributes<SVGSVGElement>>
		| boolean
		| undefined,
) => {
	if (icon === false) return null
	if (icon === true || icon === undefined) return CaretDownIcon
	return icon
}

export const SelectDropdown = React.memo(
	React.forwardRef<React.ElementRef<typeof PopoverTrigger>, SelectDropdownProps>(
		(
			{
				value,
				options,
				onChange,
				disabled = false,
				initiallyOpen = false,
				title = "",
				triggerClassName = "",
				contentClassName = "",
				itemClassName = "",
				sideOffset = 4,
				align = "start",
				placeholder = "",
				shortcutText = "",
				renderItem,
				disableSearch = false,
				triggerIcon,
				onCreateOption,
				createOptionLabel,
			},
			ref,
		) => {
			const { t } = useTranslation()
			const [open, setOpen] = React.useState(initiallyOpen)
			const [searchValue, setSearchValue] = React.useState("")
			const searchInputRef = React.useRef<HTMLInputElement>(null)
			const portalContainer = useRooPortal("roo-portal")

			const TriggerIcon = React.useMemo(() => getTriggerIcon(triggerIcon), [triggerIcon])

			const normalizedOptions = React.useMemo(() => {
				return options.map((option) => ({
					...option,
					type: option.type ?? DropdownOptionType.ITEM,
				}))
			}, [options])

			const selectedOption = React.useMemo(
				() => normalizedOptions.find((option) => option.value === value && isInteractiveOption(option)),
				[normalizedOptions, value],
			)

			const displayText = React.useMemo(() => {
				if (selectedOption) return selectedOption.label
				if (placeholder) return placeholder
				return ""
			}, [placeholder, selectedOption])

			const filteredOptions = React.useMemo(() => {
				if (disableSearch) return normalizedOptions

				const term = searchValue.trim().toLowerCase()
				if (!term) return normalizedOptions

				return normalizedOptions.filter((option) => {
					if (!isInteractiveOption(option)) {
						return true
					}

					const haystack = `${option.label ?? ""} ${option.value ?? ""}`.toLowerCase()
					return haystack.includes(term)
				})
			}, [disableSearch, normalizedOptions, searchValue])

			const groupedOptions = React.useMemo(() => {
				const result: DropdownOption[] = []
				let lastWasSeparator = false

				for (const option of filteredOptions) {
					if (option.type === DropdownOptionType.SEPARATOR) {
						if (!lastWasSeparator && result.length > 0) {
							result.push(option)
							lastWasSeparator = true
						}
						continue
					}

					result.push(option)
					lastWasSeparator = false
				}

				if (result.length > 0 && result[result.length - 1].type === DropdownOptionType.SEPARATOR) {
					result.pop()
				}

				return result
			}, [filteredOptions])

			const interactiveOptions = React.useMemo(
				() => groupedOptions.filter((option) => isInteractiveOption(option)),
				[groupedOptions],
			)

			const onOpenChange = React.useCallback(
				(nextOpen: boolean) => {
					setOpen(nextOpen)
					if (!nextOpen) {
						setSearchValue("")
					} else if (!disableSearch) {
						requestAnimationFrame(() => searchInputRef.current?.focus())
					}
				},
				[disableSearch],
			)

			const onClearSearch = React.useCallback(() => {
				setSearchValue("")
				searchInputRef.current?.focus()
			}, [])

			const handleSelect = React.useCallback(
				(option: DropdownOption) => {
					if (option.type === DropdownOptionType.ACTION) {
						if (typeof window !== "undefined") {
							window.postMessage({ type: "action", action: option.value })
						}
						setOpen(false)
						setSearchValue("")
						return
					}

					if (option.disabled) return

					if (option.value !== value) {
						onChange(option.value)
					}

					setOpen(false)
					setSearchValue("")
				},
				[onChange, value],
			)

			const handleCreateOption = React.useCallback(() => {
				if (!onCreateOption) return

				const trimmed = searchValue.trim()
				if (!trimmed) return

				Promise.resolve(onCreateOption(trimmed)).finally(() => {
					setOpen(false)
					setSearchValue("")
				})
			}, [onCreateOption, searchValue])

			const canCreateOption = React.useMemo(() => {
				if (!onCreateOption) return false
				const trimmed = searchValue.trim()
				if (!trimmed) return false

				return !normalizedOptions.some((option) => option.label.toLowerCase() === trimmed.toLowerCase())
			}, [normalizedOptions, onCreateOption, searchValue])

			const trigger = (
				<PopoverTrigger
					ref={ref}
					disabled={disabled}
					data-testid="dropdown-trigger"
					className={cn(
						"inline-flex min-w-0 max-w-full items-center gap-1.5 whitespace-nowrap rounded-sm border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)]",
						"px-2 py-1 text-xs text-vscode-foreground transition-colors",
						"focus-visible:outline focus-visible:outline-1 focus-visible:outline-vscode-focusBorder",
						disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)]",
						triggerClassName,
					)}
					aria-haspopup="listbox"
					aria-expanded={open}>
					{TriggerIcon ? <TriggerIcon className="size-3 opacity-70" aria-hidden="true" /> : null}
					{selectedOption?.codicon ? (
						<span className={cn("codicon text-[12px] opacity-80", selectedOption.codicon)} aria-hidden="true" />
					) : null}
					<span className="truncate" title={displayText || undefined}>
						{displayText}
					</span>
				</PopoverTrigger>
			)

			return (
				<Popover open={open} onOpenChange={onOpenChange} data-testid="dropdown-root">
					{title ? <StandardTooltip content={title}>{trigger}</StandardTooltip> : trigger}
					<PopoverContent
						align={align}
						sideOffset={sideOffset}
						container={portalContainer}
						className={cn(
							"w-[max(260px,calc(var(--radix-popover-trigger-width,240px)))] rounded-md border border-[color-mix(in_srgb,var(--vscode-foreground)_14%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_97%,transparent)] p-0 shadow-[0_8px_20px_rgba(0,0,0,0.35)]",
							contentClassName,
						)}>
						<div className="flex max-h-80 flex-col">
							{!disableSearch && (
								<div className="relative border-b border-[color-mix(in_srgb,var(--vscode-foreground)_10%,transparent)] p-2">
									<input
										ref={searchInputRef}
										value={searchValue}
										onChange={(event) => setSearchValue(event.target.value)}
										placeholder={t("common:ui.search_placeholder")}
										className="h-8 w-full rounded-sm border border-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)] bg-[var(--vscode-input-background)] px-2 text-xs text-[var(--vscode-input-foreground)] focus:outline focus:outline-1 focus:outline-vscode-focusBorder"
										aria-label={t("common:ui.search_placeholder")}
									/>
									{searchValue.length > 0 && (
										<button
											type="button"
											onClick={onClearSearch}
											className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--vscode-input-foreground)] opacity-70 hover:opacity-100">
											<X className="size-3.5" aria-hidden="true" />
										</button>
									)}
								</div>
							)}

							<div className="flex-1 overflow-y-auto py-1" role="listbox">
								{groupedOptions.map((option, index) => {
									if (option.type === DropdownOptionType.SEPARATOR) {
										return (
											<div
												key={`separator-${index}`}
												className="my-1 h-px bg-[color-mix(in_srgb,var(--vscode-foreground)_12%,transparent)]"
												data-testid="dropdown-separator"
											/>
										)
									}

									if (option.type === DropdownOptionType.SHORTCUT) {
										return (
											<div
												key={`shortcut-${index}`}
												className="px-3 py-1 text-[11px] uppercase tracking-wide text-[color-mix(in_srgb,var(--vscode-foreground)_60%,transparent)]"
											>
												{option.label || shortcutText}
											</div>
										)
									}

									const isSelected = option.value === value

									return (
										<button
											key={option.value || `option-${index}`}
											type="button"
											role="option"
											aria-selected={isSelected}
											disabled={option.disabled}
											onClick={() => handleSelect(option)}
											className={cn(
												"flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
												option.disabled
													? "cursor-not-allowed opacity-50"
													: "hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_85%,transparent)]",
												isSelected && option.type !== DropdownOptionType.ACTION
													? "bg-[color-mix(in_srgb,var(--vscode-editor-selectionBackground)_65%,transparent)] text-vscode-list-activeSelectionForeground"
													: "text-vscode-foreground",
												itemClassName,
											)}
											data-testid="dropdown-item">
											{renderItem ? (
												renderItem(option)
											) : (
												<>
													{option.codicon ? (
														<span className={cn("codicon text-[14px] opacity-80", option.codicon)} aria-hidden="true" />
													) : null}
													<div className="flex min-w-0 flex-1 flex-col">
														<span className="truncate">{option.label}</span>
														{option.description ? (
															<span className="mt-0.5 text-[11px] text-[color-mix(in_srgb,var(--vscode-foreground)_60%,transparent)]">
																{option.description}
															</span>
														) : null}
													</div>
													{isSelected && option.type !== DropdownOptionType.ACTION ? (
														<Check className="ml-auto size-4" aria-hidden="true" />
													) : null}
												</>
											)}
										</button>
									)
								})}

				{interactiveOptions.length === 0 && !canCreateOption && (
					<div className="px-3 py-4 text-center text-xs text-[color-mix(in_srgb,var(--vscode-foreground)_60%,transparent)]">
						{t("common:ui.no_results")}
					</div>
				)}

				{canCreateOption && (
					<button
						type="button"
						onClick={handleCreateOption}
						className="mx-2 mb-1 mt-2 w-[calc(100%-1rem)] rounded-sm border border-dashed border-[color-mix(in_srgb,var(--vscode-foreground)_18%,transparent)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)] px-3 py-2 text-left text-xs text-vscode-foreground hover:border-vscode-focusBorder hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)]">
						{createOptionLabel?.(searchValue.trim()) ?? `Create "${searchValue.trim()}"`}
					</button>
				)}
							</div>
						</div>
					</PopoverContent>
				</Popover>
			)
		},
	),
)

SelectDropdown.displayName = "SelectDropdown"
