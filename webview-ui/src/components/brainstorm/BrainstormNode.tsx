import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    type ChangeEvent,
    type KeyboardEvent,
    type PointerEvent,
} from "react"
import { Handle, Position, type NodeProps } from "reactflow"
import type { LucideIcon } from "lucide-react"
import { CheckSquare, HelpCircle, Lightbulb, Signal, StickyNote } from "lucide-react"

import { cn } from "@/lib/utils"

export interface BrainstormNodeData {
    label: string
    variant?: BrainstormNodeVariant
    completed?: boolean
    isEditing?: boolean
    draft?: string
    onDraftChange?: (value: string) => void
    onCommit?: () => void
    onCancel?: () => void
    onToggleComplete?: (completed: boolean) => void
}

export type BrainstormNodeVariant = "idea" | "question" | "task" | "signal"

type VariantConfig = {
    label: string
    placeholder: string
    icon: LucideIcon
    borderClass: string
    backgroundClass: string
    iconClass: string
    labelClass: string
    textClass: string
    emptyTextClass: string
    shadowColor: string
}

const VARIANT_CONFIG: Record<BrainstormNodeVariant | "default", VariantConfig> = {
    idea: {
        label: "Idea",
        placeholder: "Capture an idea...",
        icon: Lightbulb,
        borderClass: "border-amber-200",
        backgroundClass: "bg-amber-50/80",
        iconClass: "text-amber-500",
        labelClass: "text-amber-700",
        textClass: "text-slate-800",
        emptyTextClass: "text-amber-700/70",
        shadowColor: "rgba(251, 191, 36, 0.25)",
    },
    question: {
        label: "Question",
        placeholder: "Ask a question...",
        icon: HelpCircle,
        borderClass: "border-sky-300",
        backgroundClass: "bg-sky-50/80",
        iconClass: "text-sky-500",
        labelClass: "text-sky-700",
        textClass: "text-slate-800",
        emptyTextClass: "text-sky-700/70",
        shadowColor: "rgba(125, 211, 252, 0.25)",
    },
    task: {
        label: "Task",
        placeholder: "Describe the task...",
        icon: CheckSquare,
        borderClass: "border-emerald-300",
        backgroundClass: "bg-white",
        iconClass: "text-emerald-600",
        labelClass: "text-emerald-700",
        textClass: "text-slate-800",
        emptyTextClass: "text-emerald-700/70",
        shadowColor: "rgba(134, 239, 172, 0.25)",
    },
    signal: {
        label: "Signal",
        placeholder: "Log the insight or signal...",
        icon: Signal,
        borderClass: "border-purple-300",
        backgroundClass: "bg-purple-50/80",
        iconClass: "text-purple-500",
        labelClass: "text-purple-700",
        textClass: "text-slate-800",
        emptyTextClass: "text-purple-700/70",
        shadowColor: "rgba(196, 181, 253, 0.25)",
    },
    default: {
        label: "Note",
        placeholder: "Add a note...",
        icon: StickyNote,
        borderClass: "border-slate-300",
        backgroundClass: "bg-white",
        iconClass: "text-slate-500",
        labelClass: "text-slate-600",
        textClass: "text-slate-800",
        emptyTextClass: "text-slate-500",
        shadowColor: "rgba(15, 23, 42, 0.08)",
    },
}

const BrainstormNode = memo(({ data, selected, dragging }: NodeProps<BrainstormNodeData>) => {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null)
    const isEditing = Boolean(data?.isEditing)
    const value = data?.draft ?? data?.label ?? ""
    const variant = data?.variant ?? "idea"
    const config = VARIANT_CONFIG[variant] ?? VARIANT_CONFIG.default
    const completed = Boolean(data?.completed)
    const placeholder = config.placeholder
    const trimmedValue = value.trim()
    const isEmpty = trimmedValue.length === 0
    const displayValue = isEmpty ? placeholder : value

    const boxShadow = useMemo(() => {
        const baseShadow = `0 8px 20px ${config.shadowColor}`
        return selected || isEditing ? `${baseShadow}, 0 0 0 2px var(--vscode-focusBorder)` : baseShadow
    }, [config.shadowColor, isEditing, selected])

    const adjustHeight = useCallback((element: HTMLTextAreaElement | null) => {
        if (!element) {
            return
        }
        element.style.height = "auto"
        element.style.height = `${element.scrollHeight}px`
    }, [])

    useEffect(() => {
        if (!isEditing) {
            return
        }

        const textarea = textareaRef.current
        if (!textarea) {
            return
        }

        const animation = requestAnimationFrame(() => {
            textarea.focus({ preventScroll: true })
            textarea.setSelectionRange(textarea.value.length, textarea.value.length)
            adjustHeight(textarea)
        })

        return () => cancelAnimationFrame(animation)
    }, [adjustHeight, isEditing])

    useEffect(() => {
        if (!isEditing) {
            return
        }

        adjustHeight(textareaRef.current)
    }, [adjustHeight, isEditing, value])

    const handleContainerPointerDown = useCallback(
        (event: PointerEvent<HTMLDivElement>) => {
            if (isEditing) {
                event.stopPropagation()
            }
        },
        [isEditing],
    )

    const handleContainerDoubleClick = useCallback(
        (event: PointerEvent<HTMLDivElement>) => {
            if (isEditing) {
                event.stopPropagation()
            }
        },
        [isEditing],
    )

    const handleChange = useCallback(
        (event: ChangeEvent<HTMLTextAreaElement>) => {
            data?.onDraftChange?.(event.target.value)
            adjustHeight(event.target)
        },
        [adjustHeight, data],
    )

    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLTextAreaElement>) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                data?.onCommit?.()
                return
            }

            if (event.key === "Escape") {
                event.preventDefault()
                data?.onCancel?.()
            }
        },
        [data],
    )

    const handleBlur = useCallback(() => {
        data?.onCommit?.()
    }, [data])

    const handleTextareaPointerDown = useCallback((event: PointerEvent<HTMLTextAreaElement>) => {
        event.stopPropagation()
    }, [])

    const handleCheckboxPointerDown = useCallback((event: PointerEvent<HTMLInputElement>) => {
        event.stopPropagation()
    }, [])

    const handleCheckboxChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            data?.onToggleComplete?.(event.target.checked)
        },
        [data],
    )

    return (
        <div
            onPointerDown={handleContainerPointerDown}
            onDoubleClick={handleContainerDoubleClick}
            className={cn(
                "relative flex h-full min-w-[220px] flex-col gap-3 rounded-lg border px-4 py-3 text-sm transition-[border-color,box-shadow,background-color]",
                selected || isEditing ? "border-vscode-focusBorder" : config.borderClass,
                variant === "task" && completed ? "bg-emerald-50" : config.backgroundClass,
                dragging ? "cursor-grabbing" : isEditing ? "cursor-text" : "cursor-grab",
                !isEditing && "select-none",
            )}
            style={{ boxShadow }}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                    <config.icon className={cn("size-4", config.iconClass)} aria-hidden="true" />
                    <span className={cn("text-[11px] font-semibold uppercase tracking-wide", config.labelClass)}>
                        {config.label}
                    </span>
                </span>
                {variant === "task" && (
                    <span
                        className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                            completed ? "bg-emerald-100 text-emerald-700" : "bg-emerald-50 text-emerald-600",
                        )}
                    >
                        {completed ? "Completed" : "To Do"}
                    </span>
                )}
            </div>
            <div className="flex items-start gap-3">
                {variant === "task" && (
                    <input
                        type="checkbox"
                        className="mt-1 size-4 rounded border border-emerald-300 text-emerald-600 transition-colors focus:ring-2 focus:ring-emerald-500 focus:ring-offset-0"
                        checked={completed}
                        onChange={handleCheckboxChange}
                        onPointerDown={handleCheckboxPointerDown}
                        aria-label={completed ? "Mark task as incomplete" : "Mark task as complete"}
                    />
                )}
                {isEditing ? (
                    <textarea
                        ref={textareaRef}
                        value={value}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        onBlur={handleBlur}
                        onPointerDown={handleTextareaPointerDown}
                        rows={1}
                        spellCheck={false}
                        placeholder={placeholder}
                        className="h-full w-full min-h-[28px] flex-1 resize-none overflow-hidden bg-transparent text-left text-sm font-medium text-slate-800 focus:outline-none"
                    />
                ) : (
                    <span
                        className={cn(
                            "block w-full whitespace-pre-wrap text-left text-sm font-medium",
                            config.textClass,
                            variant === "task" && completed && "line-through text-slate-500",
                            isEmpty && cn("italic", config.emptyTextClass),
                        )}
                    >
                        {displayValue}
                    </span>
                )}
            </div>
            <Handle type="target" position={Position.Left} className="!h-3 !w-3" />
            <Handle type="source" position={Position.Right} className="!h-3 !w-3" />
        </div>
    )
})

BrainstormNode.displayName = "BrainstormNode"

export default BrainstormNode
