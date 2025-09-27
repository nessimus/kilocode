import {
    Fragment,
    memo,
    useCallback,
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type DragEvent,
    type FocusEvent,
    type KeyboardEvent,
} from "react"
import { Handle, Position, type NodeProps } from "reactflow"
import { ChevronDown, ChevronRight, GripVertical, Image as ImageIcon } from "lucide-react"

import { cn } from "@/lib/utils"

import {
    NoteSheetBlock,
    NoteSheetBlockType,
    NoteSheetBlockImage,
    ensureAtLeastOneBlock,
    flattenBlocks,
    indentBlock,
    insertBlockAfter,
    moveBlock,
    outdentBlock,
    removeBlock,
    setBlockChecked,
    setBlockImage,
    setBlockText,
    setBlockType,
    toggleBlockCollapsed,
    createNoteSheetBlock,
} from "./noteSheetModel"

export interface NoteSheetNodeStateData {
    blocks: NoteSheetBlock[]
    focusedBlockId?: string
}

export interface NoteSheetNodeRenderData extends NoteSheetNodeStateData {
    onBlocksChange: (updater: (blocks: NoteSheetBlock[]) => NoteSheetBlock[]) => void
    onFocusBlock: (blockId: string | undefined) => void
}

type DropPosition = "before" | "after" | "inside"

interface DragState {
    draggedId?: string
    overId?: string
    position?: DropPosition
}

type EditableElement = HTMLTextAreaElement | HTMLInputElement | HTMLDivElement

const BLOCK_PLACEHOLDERS: Record<NoteSheetBlockType, string> = {
    heading: "Add a heading",
    text: "Write anything...",
    checkbox: "To-do",
    toggle: "Toggle heading",
    bullet: "List item",
    numbered: "List item",
    image: "",
}

const DEFAULT_BLOCK_AFTER: Record<NoteSheetBlockType, NoteSheetBlockType> = {
    heading: "text",
    text: "text",
    checkbox: "checkbox",
    toggle: "text",
    bullet: "bullet",
    numbered: "numbered",
    image: "text",
}

const NoteSheetNode = memo(({ data, selected, dragging }: NodeProps<NoteSheetNodeRenderData>) => {
    const { blocks, focusedBlockId } = data
    const [dragState, setDragState] = useState<DragState>({})
    const blockEditorsRef = useRef<Map<string, EditableElement>>(new Map())
    const pendingFocusRef = useRef<string | undefined>()

    useEffect(() => {
        if (!focusedBlockId) {
            return
        }

        const element = blockEditorsRef.current.get(focusedBlockId)
        if (!element) {
            return
        }

        const focusElement = () => {
            if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
                element.focus({ preventScroll: true })
                const length = "value" in element ? element.value.length : 0
                if ("setSelectionRange" in element) {
                    element.setSelectionRange(length, length)
                }
            } else {
                element.focus({ preventScroll: true })
            }
        }

        const animation = requestAnimationFrame(focusElement)
        return () => cancelAnimationFrame(animation)
    }, [focusedBlockId, blocks])

    const registerEditable = useCallback((blockId: string, element: EditableElement | null) => {
        if (element) {
            blockEditorsRef.current.set(blockId, element)
        } else {
            blockEditorsRef.current.delete(blockId)
        }
    }, [])

    const focusBlock = useCallback(
        (blockId: string | undefined) => {
            pendingFocusRef.current = blockId
            data.onFocusBlock(blockId)
        },
        [data],
    )

    useEffect(() => {
        if (pendingFocusRef.current === focusedBlockId) {
            pendingFocusRef.current = undefined
        }
    }, [focusedBlockId])

    const handleBlocksMutation = useCallback(
        (updater: (blocks: NoteSheetBlock[]) => NoteSheetBlock[]) => {
            data.onBlocksChange((current) => ensureAtLeastOneBlock(updater(current)))
        },
        [data],
    )

    const handleTextChange = useCallback(
        (blockId: string, event: ChangeEvent<HTMLTextAreaElement>) => {
            const { value } = event.target
            handleBlocksMutation((current) => {
                let nextBlocks = current
                let nextValue = value
                let targetType: NoteSheetBlockType | undefined

                if (value.startsWith("> ")) {
                    targetType = "toggle"
                    nextValue = value.slice(2)
                } else if (value.startsWith("- ")) {
                    targetType = "bullet"
                    nextValue = value.slice(2)
                } else if (/^\d+\.\s/.test(value)) {
                    targetType = "numbered"
                    nextValue = value.replace(/^\d+\.\s*/, "")
                } else if (!value.trim()) {
                    targetType = "text"
                }

                if (targetType) {
                    nextBlocks = setBlockType(nextBlocks, blockId, targetType)
                }

                return setBlockText(nextBlocks, blockId, nextValue)
            })
        },
        [handleBlocksMutation],
    )

    const handleCheckboxChange = useCallback(
        (blockId: string, event: ChangeEvent<HTMLInputElement>) => {
            const { checked } = event.target
            handleBlocksMutation((current) => setBlockChecked(current, blockId, checked))
        },
        [handleBlocksMutation],
    )

    const handleToggleCollapsed = useCallback(
        (blockId: string) => {
            handleBlocksMutation((current) => toggleBlockCollapsed(current, blockId))
        },
        [handleBlocksMutation],
    )

    const handleImageUpdate = useCallback(
        (blockId: string, image: NoteSheetBlockImage | undefined) => {
            handleBlocksMutation((current) => setBlockImage(current, blockId, image))
        },
        [handleBlocksMutation],
    )

    const handleAddBlockAfter = useCallback(
        (blockId: string | null, type: NoteSheetBlockType) => {
            const newBlock = createNoteSheetBlock(type)
            handleBlocksMutation((current) => insertBlockAfter(current, blockId, newBlock))
            focusBlock(newBlock.id)
        },
        [focusBlock, handleBlocksMutation],
    )

    const handleRemoveBlock = useCallback(
        (blockId: string) => {
            let nextFocusId: string | undefined
            handleBlocksMutation((current) => {
                const flat = flattenBlocks(current)
                const index = flat.findIndex((entry) => entry.block.id === blockId)
                if (index !== -1) {
                    const previous = flat[index - 1]
                    const next = flat[index + 1]
                    nextFocusId = previous?.block.id ?? next?.block.id
                }
                const result = removeBlock(current, blockId)
                if (!result.blocks.length) {
                    const fallback = createNoteSheetBlock("text")
                    nextFocusId = fallback.id
                    return [fallback]
                }
                return result.blocks
            })
            focusBlock(nextFocusId)
        },
        [focusBlock, handleBlocksMutation],
    )

    const handleIndent = useCallback(
        (blockId: string) => {
            handleBlocksMutation((current) => indentBlock(current, blockId))
        },
        [handleBlocksMutation],
    )

    const handleOutdent = useCallback(
        (blockId: string) => {
            handleBlocksMutation((current) => outdentBlock(current, blockId))
        },
        [handleBlocksMutation],
    )

    const handleMove = useCallback(
        (sourceId: string, targetId: string, position: DropPosition) => {
            handleBlocksMutation((current) => moveBlock(current, sourceId, targetId, position))
            focusBlock(sourceId)
        },
        [focusBlock, handleBlocksMutation],
    )

    const handleDragStart = useCallback((blockId: string, event: DragEvent) => {
        event.dataTransfer.effectAllowed = "move"
        event.dataTransfer.setData("text/plain", blockId)
        setDragState({ draggedId: blockId, overId: undefined, position: undefined })
    }, [])

    const handleDragEnd = useCallback(() => {
        setDragState({})
    }, [])

    const handleDragOverZone = useCallback(
        (targetId: string, position: DropPosition, event: DragEvent<HTMLDivElement>) => {
            if (!dragState.draggedId || dragState.draggedId === targetId) {
                return
            }
            event.preventDefault()
            if (dragState.overId !== targetId || dragState.position !== position) {
                setDragState({ draggedId: dragState.draggedId, overId: targetId, position })
            }
        },
        [dragState],
    )

    const handleDropOnZone = useCallback(
        (targetId: string, position: DropPosition, event: DragEvent<HTMLDivElement>) => {
            event.preventDefault()
            const sourceId = dragState.draggedId
            if (!sourceId || sourceId === targetId) {
                setDragState({})
                return
            }
            handleMove(sourceId, targetId, position)
            setDragState({})
        },
        [dragState.draggedId, handleMove],
    )

    const handleDropInside = useCallback(
        (targetId: string, event: DragEvent<HTMLDivElement>) => {
            event.preventDefault()
            const sourceId = dragState.draggedId
            if (!sourceId || sourceId === targetId) {
                setDragState({})
                return
            }
            handleMove(sourceId, targetId, "inside")
            setDragState({})
        },
        [dragState.draggedId, handleMove],
    )

    const handleBlockFocus = useCallback(
        (blockId: string, _event: FocusEvent<EditableElement>) => {
            focusBlock(blockId)
        },
        [focusBlock],
    )

    const handleBlockKeyDown = useCallback(
        (block: NoteSheetBlock, event: KeyboardEvent<HTMLTextAreaElement>) => {
            const { key, shiftKey, currentTarget, altKey, metaKey, ctrlKey } = event
            if (key === "Enter" && !shiftKey) {
                event.preventDefault()
                const nextType = DEFAULT_BLOCK_AFTER[block.type] ?? "text"
                handleAddBlockAfter(block.id, nextType)
                return
            }

            if (key === "End" && !shiftKey && !altKey && !metaKey && !ctrlKey) {
                event.preventDefault()
                const nextType = DEFAULT_BLOCK_AFTER[block.type] ?? "text"
                handleAddBlockAfter(block.id, nextType)
                return
            }

            if (key === "Tab") {
                event.preventDefault()
                if (shiftKey) {
                    handleOutdent(block.id)
                } else {
                    handleIndent(block.id)
                }
                return
            }

            if (key === "Backspace" && !shiftKey && !altKey && !metaKey && !ctrlKey) {
                const textarea = currentTarget
                if (textarea.selectionStart === 0 && textarea.selectionEnd === 0 && !block.text) {
                    event.preventDefault()
                    handleRemoveBlock(block.id)
                }
            }
        },
        [handleAddBlockAfter, handleIndent, handleOutdent, handleRemoveBlock],
    )

    const renderBlock = useCallback(
        (block: NoteSheetBlock, depth: number, index: number, siblings: NoteSheetBlock[]) => {
            const isDragging = dragState.draggedId === block.id
            const indentOffset = depth * 28
            const isDropInside = dragState.overId === block.id && dragState.position === "inside"

            const renderDropZone = (position: DropPosition) => (
                <div
                    key={`${block.id}-${position}`}
                    role="presentation"
                    onDragOver={(event) => handleDragOverZone(block.id, position, event)}
                    onDrop={(event) => handleDropOnZone(block.id, position, event)}
                    className={cn(
                        "h-[2px] w-full rounded-full transition-colors",
                        dragState.draggedId && dragState.draggedId !== block.id ? "bg-transparent" : "",
                        dragState.overId === block.id && dragState.position === position ? "bg-slate-300" : "bg-transparent",
                    )}
                    style={{ marginLeft: indentOffset }}
                />
            )

            const numberedIndex =
                block.type === "numbered"
                    ? siblings.slice(0, index).filter((sibling) => sibling.type === "numbered").length + 1
                    : undefined

            const handleImageAction = () => {
                if (block.type !== "image") {
                    return
                }

                const nextUrl = window.prompt("Add image URL", block.image?.url ?? "") ?? ""
                if (!nextUrl.trim()) {
                    handleImageUpdate(block.id, undefined)
                    return
                }
                handleImageUpdate(block.id, { url: nextUrl.trim(), caption: block.image?.caption ?? "" })
            }

            const handleImageCaptionChange = (event: ChangeEvent<HTMLInputElement>) => {
                if (block.type !== "image") {
                    return
                }
                handleImageUpdate(block.id, {
                    url: block.image?.url ?? "",
                    caption: event.target.value,
                })
            }

            const leadingElement = (() => {
                switch (block.type) {
                    case "checkbox":
                        return (
                            <input
                                type="checkbox"
                                checked={Boolean(block.checked)}
                                onChange={(event) => handleCheckboxChange(block.id, event)}
                                onFocus={(event) => handleBlockFocus(block.id, event)}
                                ref={(element) => registerEditable(block.id, element)}
                                className="mt-1 inline-flex size-4 shrink-0 rounded border border-slate-300 text-vscode-focusBorder focus-visible:outline-none"
                            />
                        )
                    case "toggle":
                        return (
                            <button
                                type="button"
                                onClick={() => handleToggleCollapsed(block.id)}
                                className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded border border-transparent text-slate-500 transition hover:border-slate-300 hover:text-slate-700 focus-visible:outline-none"
                                aria-label={block.collapsed ? "Expand toggle" : "Collapse toggle"}
                            >
                                {block.collapsed ? (
                                    <ChevronRight className="size-4" aria-hidden="true" />
                                ) : (
                                    <ChevronDown className="size-4" aria-hidden="true" />
                                )}
                            </button>
                        )
                    case "bullet":
                        return (
                            <span className="mt-2 text-base leading-none text-slate-400" aria-hidden="true">
                                •
                            </span>
                        )
                    case "numbered":
                        return (
                            <span className="mt-1 text-sm font-medium text-slate-400" aria-hidden="true">
                                {(numberedIndex ?? 1).toString()}.
                            </span>
                        )
                    default:
                        return null
                }
            })()

            const content =
                block.type === "image" ? (
                    <div className="flex w-full flex-col gap-3">
                        {block.image?.url ? (
                            <img
                                src={block.image.url}
                                alt={block.image.caption ?? "Note sheet image"}
                                className="max-h-72 w-full object-cover"
                            />
                        ) : (
                            <div className="flex h-48 items-center justify-center border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-400">
                                No image yet
                            </div>
                        )}
                        <div className="flex flex-col gap-2 text-sm text-slate-500">
                            <button
                                type="button"
                                onClick={handleImageAction}
                                className="inline-flex w-fit items-center gap-2 rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-700 focus-visible:outline-none"
                            >
                                <ImageIcon className="size-4" aria-hidden="true" />
                                {block.image?.url ? "Replace image" : "Add image"}
                            </button>
                            <input
                                type="text"
                                value={block.image?.caption ?? ""}
                                placeholder="Add a caption"
                                onChange={handleImageCaptionChange}
                                onFocus={(event) => handleBlockFocus(block.id, event)}
                                ref={(element) => registerEditable(block.id, element)}
                                className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm text-slate-700 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-0 focus-visible:border-transparent"
                            />
                        </div>
                    </div>
                ) : (
                    <textarea
                        value={block.text}
                        placeholder={BLOCK_PLACEHOLDERS[block.type] ?? ""}
                        onChange={(event) => handleTextChange(block.id, event)}
                        onKeyDown={(event) => handleBlockKeyDown(block, event)}
                        onFocus={(event) => handleBlockFocus(block.id, event)}
                        ref={(element) => registerEditable(block.id, element)}
                        rows={Math.max(1, block.type === "heading" ? 1 : block.text.split("\n").length || 1)}
                        spellCheck={false}
                        className={cn(
                            "w-full resize-none border-none bg-transparent px-0 py-1 text-base leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0 focus:ring-offset-0 focus:border-transparent focus:shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-transparent focus-visible:shadow-none",
                            block.type === "heading" && "text-2xl font-semibold tracking-tight",
                        )}
                        style={{ outline: "none", boxShadow: "none" }}
                    />
                )

            return (
                <Fragment key={block.id}>
                    {renderDropZone("before")}
                    <div
                        className={cn("group relative flex flex-col", isDragging && "opacity-60")}
                        style={{ marginLeft: indentOffset }}
                    >
                        <div
                            onDragOver={(event) => handleDragOverZone(block.id, "inside", event)}
                            onDrop={(event) => handleDropInside(block.id, event)}
                            className={cn(
                                "flex items-start gap-[2px] border border-transparent px-[2px] py-0 transition-colors focus-within:border-transparent focus-within:outline-none focus-within:ring-0 focus-within:ring-offset-0 focus-within:shadow-none",
                                isDropInside ? "bg-slate-100" : "bg-transparent",
                            )}
                        >
                            <button
                                type="button"
                                draggable
                                onDragStart={(event) => handleDragStart(block.id, event)}
                                onDragEnd={handleDragEnd}
                                className={cn(
                                    "mt-1 inline-flex size-6 items-center justify-center text-slate-400 transition-opacity focus-visible:outline-none",
                                    "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                                )}
                                aria-label="Drag block"
                            >
                                <GripVertical className="size-4" aria-hidden="true" />
                            </button>

                            <div className="flex-1">
                                <div className="flex items-start gap-2">
                                    {leadingElement}
                                    <div className="flex-1">{content}</div>
                                </div>
                                {block.type === "toggle" && block.collapsed && block.children.length > 0 && (
                                    <div className="ml-8 mt-2 text-xs text-slate-400">
                                        {block.children.length} item{block.children.length === 1 ? "" : "s"} hidden
                                    </div>
                                )}
                            </div>
                        </div>

                        {!block.collapsed && block.children.length > 0 && (
                            <div className="mt-0 space-y-[2px]">
                                {block.children.map((child, childIndex) => renderBlock(child, depth + 1, childIndex, block.children))}
                            </div>
                        )}
                    </div>
                    {renderDropZone("after")}
                </Fragment>
            )
        },
        [
            dragState.draggedId,
            dragState.overId,
            dragState.position,
            handleBlockFocus,
            handleBlockKeyDown,
            handleCheckboxChange,
            handleDropInside,
            handleDragOverZone,
            handleDropOnZone,
            handleDragEnd,
            handleDragStart,
            handleImageUpdate,
            handleTextChange,
            handleToggleCollapsed,
            registerEditable,
        ],
    )

    return (
        <div
            className={cn(
                "relative flex h-full min-w-[520px] justify-center",
                dragging ? "cursor-grabbing" : "cursor-grab",
            )}
        >
            <div
                className={cn(
                    "relative flex w-full max-w-[720px] flex-col rounded-[20px] border border-slate-200 bg-white px-8 py-10 text-slate-900 shadow-[0_40px_90px_rgba(15,23,42,0.18)]",
                    selected ? "ring-2 ring-vscode-focusBorder" : "ring-0",
                )}
                style={{ minHeight: 880 }}
            >
                <div className="pointer-events-none select-none pb-4 text-xs font-semibold uppercase tracking-[0.35em] text-slate-300">
                    Note Sheet
                </div>
                <div className="flex-1 space-y-[2px]">
                    {blocks.map((block, index) => renderBlock(block, 0, index, blocks))}
                </div>
            </div>

            <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-none !bg-slate-300" />
            <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-none !bg-slate-300" />
        </div>
    )
})

NoteSheetNode.displayName = "NoteSheetNode"

export default NoteSheetNode
