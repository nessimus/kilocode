import { memo, useCallback } from "react"
import type { JSONContent } from "@tiptap/core"
import { Handle, Position, type NodeProps } from "reactflow"
import { Bold, CheckSquare, Italic, Plus, Trash2, Underline } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

import RichTextEditor from "./RichTextEditor"

export interface TaskListItemState {
    id: string
    content?: JSONContent
    completed?: boolean
}

export interface TaskListNodeStateData {
    items: TaskListItemState[]
}

export interface TaskListNodeRenderData extends TaskListNodeStateData {
    onToggleItem?: (itemId: string, completed: boolean) => void
    onContentChange?: (itemId: string, content: JSONContent) => void
    onAddItem?: () => void
    onRemoveItem?: (itemId: string) => void
}

export const createTaskListItem = (): TaskListItemState => ({
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `task-${Math.random().toString(36).slice(2, 9)}`,
    content: undefined,
    completed: false,
})

const ToolbarButton = ({
    icon: Icon,
    onClick,
    isActive,
    disabled,
    label,
}: {
    icon: LucideIcon
    onClick: () => void
    isActive?: boolean
    disabled?: boolean
    label: string
}) => (
    <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
        disabled={disabled}
        className={cn(
            "inline-flex items-center justify-center rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
            isActive
                ? "border-vscode-focusBorder bg-vscode-focusBorder/15 text-vscode-focusBorder"
                : "border-transparent bg-transparent text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700",
            disabled && "pointer-events-none opacity-40",
        )}
        aria-pressed={isActive}
        aria-label={label}
        title={label}
    >
        <Icon className="size-3.5" aria-hidden="true" />
    </button>
)

const TaskListNode = memo(({ data, selected, dragging }: NodeProps<TaskListNodeRenderData>) => {
    const items = data.items?.length ? data.items : [createTaskListItem()]

    const boxShadow = selected
        ? "0 10px 24px rgba(30, 41, 59, 0.18), 0 0 0 2px rgba(14, 116, 144, 0.35)"
        : "0 12px 28px rgba(30, 41, 59, 0.12)"

    const handleToggle = useCallback(
        (itemId: string, completed: boolean) => {
            data.onToggleItem?.(itemId, completed)
        },
        [data],
    )

    const handleContentChange = useCallback(
        (itemId: string, content: JSONContent) => {
            data.onContentChange?.(itemId, content)
        },
        [data],
    )

    const handleRemoveItem = useCallback(
        (itemId: string) => {
            data.onRemoveItem?.(itemId)
        },
        [data],
    )

    return (
        <div
            className={cn(
                "relative flex h-full min-w-[260px] flex-col gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg",
                dragging ? "cursor-grabbing" : "cursor-default",
            )}
            style={{ boxShadow }}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100/80 px-3 py-1 text-xs font-semibold text-slate-600">
                    <CheckSquare className="size-3.5" aria-hidden="true" />
                    <span>Task list</span>
                </div>
                <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => data.onAddItem?.()}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                    <Plus className="size-3" aria-hidden="true" />
                    Add task
                </button>
            </div>
            <div className="flex flex-col gap-2">
                {items.map((item, index) => (
                    <div
                        key={item.id}
                        className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 shadow-sm"
                    >
                        <input
                            type="checkbox"
                            checked={Boolean(item.completed)}
                            onChange={(event) => handleToggle(item.id, event.target.checked)}
                            onPointerDown={(event) => event.stopPropagation()}
                            className="mt-1 size-4 rounded border-slate-300 text-vscode-focusBorder focus:ring-1 focus:ring-vscode-focusBorder"
                            aria-label={`Mark task ${index + 1} as ${item.completed ? "incomplete" : "complete"}`}
                        />
                        <div className="flex-1">
                            <RichTextEditor
                                value={item.content}
                                onChange={(content) => handleContentChange(item.id, content)}
                                placeholder="Describe the task"
                                minHeight={80}
                                appearance="transparent"
                                className="flex-1"
                                renderToolbar={(ctx) => {
                                    const { editor, isFocused } = ctx
                                    if (!editor || !isFocused) {
                                        return null
                                    }

                                    return (
                                        <div className="mb-1 flex items-center gap-1 self-end">
                                            <ToolbarButton
                                                icon={Bold}
                                                onClick={() => editor.chain().focus().toggleBold().run()}
                                                isActive={editor.isActive("bold")}
                                                disabled={!editor.can().chain().focus().toggleBold().run()}
                                                label="Bold"
                                            />
                                            <ToolbarButton
                                                icon={Italic}
                                                onClick={() => editor.chain().focus().toggleItalic().run()}
                                                isActive={editor.isActive("italic")}
                                                disabled={!editor.can().chain().focus().toggleItalic().run()}
                                                label="Italic"
                                            />
                                            <ToolbarButton
                                                icon={Underline}
                                                onClick={() => editor.chain().focus().toggleUnderline().run()}
                                                isActive={editor.isActive("underline")}
                                                disabled={!editor.can().chain().focus().toggleUnderline().run()}
                                                label="Underline"
                                            />
                                        </div>
                                    )
                                }}
                            />
                        </div>
                        {items.length > 1 ? (
                            <button
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={() => handleRemoveItem(item.id)}
                                className="mt-1 inline-flex size-6 items-center justify-center rounded-full border border-transparent text-slate-400 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-600"
                                aria-label="Remove task"
                            >
                                <Trash2 className="size-3.5" aria-hidden="true" />
                            </button>
                        ) : null}
                    </div>
                ))}
            </div>
            <Handle type="target" position={Position.Left} className="!h-3 !w-3" />
            <Handle type="source" position={Position.Right} className="!h-3 !w-3" />
        </div>
    )
})

TaskListNode.displayName = "TaskListNode"

export default TaskListNode
