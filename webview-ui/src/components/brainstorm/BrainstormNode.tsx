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

import { cn } from "@/lib/utils"

export interface BrainstormNodeData {
    label: string
    isEditing?: boolean
    draft?: string
    onDraftChange?: (value: string) => void
    onCommit?: () => void
    onCancel?: () => void
}

const BrainstormNode = memo(({ data, selected, dragging }: NodeProps<BrainstormNodeData>) => {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null)
    const isEditing = Boolean(data?.isEditing)
    const value = data?.draft ?? data?.label ?? ""

    const boxShadow = useMemo(() => {
        const baseShadow = "0 8px 20px rgba(15, 23, 42, 0.08)"
        return selected || isEditing ? `${baseShadow}, 0 0 0 2px var(--vscode-focusBorder)` : baseShadow
    }, [isEditing, selected])

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

    return (
        <div
            onPointerDown={handleContainerPointerDown}
            onDoubleClick={handleContainerDoubleClick}
            className={cn(
                "relative flex h-full min-w-[200px] items-stretch justify-center rounded-lg border bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-[border-color,box-shadow]",
                selected || isEditing ? "border-vscode-focusBorder" : "border-slate-300",
                dragging ? "cursor-grabbing" : isEditing ? "cursor-text" : "cursor-grab",
                !isEditing && "select-none",
            )}
            style={{ boxShadow }}
        >
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
                    className="w-full resize-none overflow-hidden bg-transparent text-center text-sm font-medium text-slate-700 focus:outline-none"
                />
            ) : (
                <span className="block w-full whitespace-pre-wrap text-center">{data?.label}</span>
            )}
            <Handle type="target" position={Position.Left} className="!h-3 !w-3" />
            <Handle type="source" position={Position.Right} className="!h-3 !w-3" />
        </div>
    )
})

BrainstormNode.displayName = "BrainstormNode"

export default BrainstormNode
