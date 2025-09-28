import { memo, useCallback, useMemo } from "react"
import type { JSONContent } from "@tiptap/core"
import { Handle, Position, type NodeProps } from "reactflow"
import { Paintbrush } from "lucide-react"

import { cn } from "@/lib/utils"

import RichTextEditor from "./RichTextEditor"

export type StickyNoteColorId = "sunny" | "blossom" | "mint" | "sky"

interface StickyNotePalette {
    background: string
    border: string
    accent: string
    text: string
    label: string
}

const STICKY_NOTE_COLORS: Record<StickyNoteColorId, StickyNotePalette> = {
    sunny: {
        background: "#FEF3C7",
        border: "#FDE68A",
        accent: "#F59E0B",
        text: "#7C2D12",
        label: "Sunny yellow",
    },
    blossom: {
        background: "#FDE2E4",
        border: "#FECDD3",
        accent: "#F43F5E",
        text: "#831843",
        label: "Blossom pink",
    },
    mint: {
        background: "#DCFCE7",
        border: "#BBF7D0",
        accent: "#22C55E",
        text: "#14532D",
        label: "Fresh mint",
    },
    sky: {
        background: "#E0F2FE",
        border: "#BAE6FD",
        accent: "#0EA5E9",
        text: "#0C4A6E",
        label: "Sky blue",
    },
}

export interface StickyNoteNodeStateData {
    content?: JSONContent
    color?: StickyNoteColorId
}

export interface StickyNoteNodeRenderData extends StickyNoteNodeStateData {
    onContentChange?: (content: JSONContent) => void
    onColorChange?: (color: StickyNoteColorId) => void
}

const StickyNoteNode = memo(({ data, selected, dragging }: NodeProps<StickyNoteNodeRenderData>) => {
    const colorId: StickyNoteColorId = data.color ?? "sunny"
    const palette = STICKY_NOTE_COLORS[colorId]

    const handleColorChange = useCallback(
        (nextColor: StickyNoteColorId) => {
            if (nextColor === colorId) {
                return
            }
            data.onColorChange?.(nextColor)
        },
        [colorId, data],
    )

    const noteClassName = useMemo(
        () =>
            cn(
                "relative flex h-full min-w-[220px] flex-col gap-3 rounded-xl border p-3 shadow-lg transition-[transform,box-shadow]",
                dragging ? "cursor-grabbing" : "cursor-text",
            ),
        [dragging],
    )

    const boxShadow = selected
        ? "0 10px 24px rgba(30, 41, 59, 0.18), 0 0 0 2px rgba(14, 116, 144, 0.35)"
        : "0 12px 32px rgba(30, 41, 59, 0.12)"

    return (
        <div
            className={noteClassName}
            style={{
                backgroundColor: palette.background,
                borderColor: palette.border,
                color: palette.text,
                boxShadow,
            }}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 rounded-full bg-white/60 px-2 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                    <Paintbrush className="size-3.5" aria-hidden="true" />
                    <span>Sticky note</span>
                </div>
                <div className="flex items-center gap-1.5" role="group" aria-label="Sticky note color">
                    {(Object.keys(STICKY_NOTE_COLORS) as StickyNoteColorId[]).map((id) => {
                        const option = STICKY_NOTE_COLORS[id]
                        const isActive = id === colorId
                        return (
                            <button
                                key={id}
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={() => handleColorChange(id)}
                                className={cn(
                                    "relative size-5 rounded-full border transition-transform",
                                    isActive ? "scale-105" : "hover:scale-105",
                                )}
                                style={{
                                    backgroundColor: option.background,
                                    borderColor: option.accent,
                                }}
                                aria-label={option.label}
                                aria-pressed={isActive}
                            >
                                {isActive ? (
                                    <span
                                        className="absolute inset-0 rounded-full border-2 border-white"
                                        aria-hidden="true"
                                    />
                                ) : null}
                            </button>
                        )
                    })}
                </div>
            </div>
            <RichTextEditor
                value={data.content}
                onChange={(content) => data.onContentChange?.(content)}
                placeholder="Capture a thought..."
                appearance="transparent"
                className="flex-1"
                minHeight={160}
            />
            <Handle type="target" position={Position.Left} className="!h-3 !w-3" />
            <Handle type="source" position={Position.Right} className="!h-3 !w-3" />
        </div>
    )
})

StickyNoteNode.displayName = "StickyNoteNode"

export { STICKY_NOTE_COLORS }
export default StickyNoteNode
