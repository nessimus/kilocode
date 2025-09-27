import * as React from "react"
import { Check, ChevronDown, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
	Button,
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui"
import { useEscapeKey } from "@/hooks/useEscapeKey"

export interface SearchableSelectOption {
	value: string
	label: string
	disabled?: boolean
	icon?: React.ReactNode
}

interface SearchableSelectProps {
	value?: string
	onValueChange: (value: string) => void
	options: SearchableSelectOption[]
	placeholder: string
	searchPlaceholder: string
	emptyMessage: string
	className?: string
	disabled?: boolean
	"data-testid"?: string
	onCreateOption?: (value: string) => void | Promise<void>
	createOptionLabel?: (value: string) => string
	triggerClassName?: string
	contentClassName?: string
	inputClassName?: string
	density?: "default" | "compact"
}

export function SearchableSelect({
	value,
	onValueChange,
	options,
	placeholder,
	searchPlaceholder,
	emptyMessage,
	className,
	disabled,
	"data-testid": dataTestId,
	onCreateOption,
	createOptionLabel,
	triggerClassName,
	contentClassName,
	inputClassName,
	density = "default",
}: SearchableSelectProps) {
	const [open, setOpen] = React.useState(false)
	const [searchValue, setSearchValue] = React.useState("")
	const searchInputRef = React.useRef<HTMLInputElement>(null)
	const searchResetTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)
	const isMountedRef = React.useRef(true)
	const [isCreatingOption, setIsCreatingOption] = React.useState(false)
	const isCompact = density === "compact"

	// Find the selected option
	const selectedOption = options.find((option) => option.value === value)

	// Filter options based on search
	const filteredOptions = React.useMemo(() => {
		if (!searchValue) return options
		return options.filter((option) => option.label.toLowerCase().includes(searchValue.toLowerCase()))
	}, [options, searchValue])

	// Cleanup timeout on unmount
	React.useEffect(() => {
		return () => {
			isMountedRef.current = false
			if (searchResetTimeoutRef.current) {
				clearTimeout(searchResetTimeoutRef.current)
			}
		}
	}, [])

	// Reset search when value changes
	React.useEffect(() => {
		const timeoutId = setTimeout(() => {
			if (isMountedRef.current) {
				setSearchValue("")
			}
		}, 100)
		return () => clearTimeout(timeoutId)
	}, [value])

	// Use the shared ESC key handler hook
	useEscapeKey(open, () => setOpen(false))

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen)
		if (!nextOpen) {
			if (searchResetTimeoutRef.current) {
				clearTimeout(searchResetTimeoutRef.current)
			}
			searchResetTimeoutRef.current = setTimeout(() => setSearchValue(""), 100)
			setIsCreatingOption(false)
			return
		}
		requestAnimationFrame(() => {
			searchInputRef.current?.focus()
		})
	}

	const handleSelect = (selectedValue: string) => {
		setOpen(false)
		onValueChange(selectedValue)
	}

	const handleClearSearch = () => {
		setSearchValue("")
		searchInputRef.current?.focus()
	}

	const trimmedSearch = searchValue.trim()
	const canCreateOption = React.useMemo(() => {
		if (!onCreateOption) return false
		if (!trimmedSearch) return false
		return !options.some((option) => option.label.toLowerCase() === trimmedSearch.toLowerCase())
	}, [onCreateOption, options, trimmedSearch])

	const handleCreateOption = React.useCallback(() => {
		if (!onCreateOption) return
		const candidate = trimmedSearch
		if (!candidate) return
		setIsCreatingOption(true)
		Promise.resolve(onCreateOption(candidate))
			.catch(() => {
				// swallow errors, caller can handle via notifications if needed
			})
			.finally(() => {
				if (!isMountedRef.current) return
				setIsCreatingOption(false)
				setOpen(false)
				setSearchValue("")
			})
	}, [onCreateOption, trimmedSearch])

	const createOptionText = React.useMemo(() => {
		if (!canCreateOption) return ""
		return createOptionLabel ? createOptionLabel(trimmedSearch) : `Create "${trimmedSearch}"`
	}, [canCreateOption, createOptionLabel, trimmedSearch])

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled}
					className={cn(
						"w-full justify-between font-normal",
						"border border-vscode-dropdown-border",
						"bg-vscode-dropdown-background hover:bg-transparent",
						"text-vscode-dropdown-foreground",
						"focus-visible:border-vscode-focusBorder",
						"aria-expanded:border-vscode-focusBorder",
						isCompact ? "h-6 px-2 text-xs" : "h-7 px-3 py-2",
						!selectedOption && "text-muted-foreground",
						className,
						triggerClassName,
					)}
					data-testid={dataTestId}>
					<span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
					<ChevronDown className={cn("ml-2 shrink-0 opacity-50", isCompact ? "size-3.5" : "h-4 w-4")} />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className={cn(
					"p-0 w-[var(--radix-popover-trigger-width)]",
					contentClassName,
				)}>
				<Command>
					<div className="relative">
						<CommandInput
							ref={searchInputRef}
							value={searchValue}
							onValueChange={setSearchValue}
							placeholder={searchPlaceholder}
							className={cn(isCompact ? "h-7 px-2 text-xs" : "h-9 mr-4", inputClassName)}
						/>
						{searchValue.length > 0 && (
							<div
								className="absolute right-2 top-0 bottom-0 flex items-center justify-center"
								data-testid="clear-search-button"
								onClick={handleClearSearch}>
								<X className="text-vscode-input-foreground opacity-50 hover:opacity-100 size-4 p-0.5 cursor-pointer" />
							</div>
						)}
					</div>
					<CommandList className={cn(isCompact ? "py-1" : undefined)}>
						<CommandEmpty>
							{searchValue && (
								<div className={cn("py-2 px-1", isCompact ? "text-xs" : "text-sm")}>{emptyMessage}</div>
							)}
						</CommandEmpty>
						<CommandGroup>
							{filteredOptions.map((option) => (
								<CommandItem
									key={option.value}
									value={option.label}
									onSelect={() => handleSelect(option.value)}
									disabled={option.disabled}
									className={cn(
										option.disabled ? "text-vscode-errorForeground" : "",
										isCompact ? "py-1 text-xs" : undefined,
									)}>
									<div className="flex items-center">
										{option.icon}
										{option.label}
									</div>
									<Check
										className={cn(
											"ml-auto h-4 w-4 p-0.5",
											value === option.value ? "opacity-100" : "opacity-0",
										)}
									/>
								</CommandItem>
							))}
							{canCreateOption && (
								<CommandItem
									key="__create-option__"
									value={trimmedSearch}
									onSelect={() => !isCreatingOption && handleCreateOption()}
									disabled={isCreatingOption}
									className={cn("flex items-center gap-2", isCompact ? "py-1 text-xs" : "py-1.5 text-sm")}
								>
									<Plus className={cn(isCompact ? "size-3.5" : "h-4 w-4")} />
									{isCreatingOption ? "Creating…" : createOptionText}
								</CommandItem>
							)}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}
