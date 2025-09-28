import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { Editor } from "@tiptap/core"
import type { JSONContent } from "@tiptap/core"
import { EditorContent, useEditor } from "@tiptap/react"
import Placeholder from "@tiptap/extension-placeholder"
import Underline from "@tiptap/extension-underline"
import StarterKit from "@tiptap/starter-kit"
import deepEqual from "fast-deep-equal"
import { Bold, Italic, List, Underline as UnderlineIcon } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const EMPTY_CONTENT: JSONContent = {
    type: "doc",
    content: [
        {
            type: "paragraph",
        },
    ],
}

export interface RichTextEditorContext {
    editor: Editor | null
    isFocused: boolean
}

interface RichTextEditorProps {
    value?: JSONContent
    onChange: (content: JSONContent) => void
    placeholder?: string
    className?: string
    minHeight?: number
    autoFocus?: boolean
    appearance?: "card" | "transparent"
    renderToolbar?: (context: RichTextEditorContext) => ReactNode
}

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
            "inline-flex items-center justify-center rounded-md border px-2 py-1 text-xs font-medium transition-colors",
            isActive
                ? "border-vscode-focusBorder bg-vscode-focusBorder/10 text-vscode-focusBorder"
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

const RichTextEditor = ({
    value,
    onChange,
    placeholder,
    className,
    minHeight = 120,
    autoFocus = false,
    appearance = "card",
    renderToolbar,
}: RichTextEditorProps) => {
    const lastValueRef = useRef<JSONContent>(value ?? EMPTY_CONTENT)
    const [isFocused, setIsFocused] = useState(false)

    const extensions = useMemo(
        () => [
            StarterKit.configure({
                heading: false,
                codeBlock: false,
                blockquote: false,
            }),
            Underline,
            Placeholder.configure({
                placeholder: placeholder ?? "Start typing...",
            }),
        ],
        [placeholder],
    )

    const editor = useEditor({
        extensions,
        content: value ?? EMPTY_CONTENT,
        autofocus: autoFocus ? "end" : undefined,
        editorProps: {
            attributes: {
                class: cn(
                    "brainstorm-prosemirror prose prose-sm max-w-none focus:outline-none",
                    appearance === "card" && "min-h-[--editor-min-height]",
                    appearance === "transparent" && "min-h-[--editor-min-height] bg-transparent",
                ),
                style: `--editor-min-height: ${minHeight}px;`,
            },
            handleDOMEvents: {
                focus: () => {
                    setIsFocused(true)
                    return false
                },
                blur: () => {
                    setIsFocused(false)
                    return false
                },
            },
        },
        onUpdate: ({ editor: instance }) => {
            const json = instance.getJSON()
            if (deepEqual(json, lastValueRef.current)) {
                return
            }
            lastValueRef.current = json
            onChange(json)
        },
    })

    useEffect(() => {
        if (!editor) {
            return
        }

        const next = value ?? EMPTY_CONTENT
        if (deepEqual(next, lastValueRef.current)) {
            return
        }

        lastValueRef.current = next
        editor.commands.setContent(next, false)
    }, [editor, value])

    const toolbar = useMemo(() => {
        if (!editor) {
            return null
        }

        if (renderToolbar) {
            return renderToolbar({ editor, isFocused })
        }

        return (
            <div className="flex items-center gap-1">
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
                    icon={UnderlineIcon}
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    isActive={editor.isActive("underline")}
                    disabled={!editor.can().chain().focus().toggleUnderline().run()}
                    label="Underline"
                />
                <ToolbarButton
                    icon={List}
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    isActive={editor.isActive("bulletList")}
                    disabled={!editor.can().chain().focus().toggleBulletList().run()}
                    label="Bulleted list"
                />
            </div>
        )
    }, [editor, isFocused, renderToolbar])

    return (
        <div className={cn("flex flex-col gap-2", className)}>
            {toolbar}
            <div
                className={cn(
                    "relative rounded-md transition-colors",
                    appearance === "card"
                        ? cn(
                                "border bg-white/95 shadow-sm",
                                isFocused ? "border-vscode-focusBorder" : "border-slate-200",
                          )
                        : "border-transparent bg-transparent", 
                )}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <EditorContent editor={editor} />
            </div>
        </div>
    )
}

export default RichTextEditor
