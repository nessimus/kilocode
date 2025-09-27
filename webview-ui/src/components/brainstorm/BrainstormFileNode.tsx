import {
    memo,
    useCallback,
    useMemo,
    useRef,
    type ChangeEvent,
    type PointerEvent,
} from "react"
import { Handle, Position, type NodeProps } from "reactflow"
import {
    AudioLines,
    File as FileIcon,
    FileText,
    Image as ImageIcon,
    Loader2,
    Upload,
    Video,
} from "lucide-react"

import { cn } from "@/lib/utils"

export type BrainstormFilePreviewKind = "image" | "audio" | "video" | "pdf" | "text" | "other"

export interface BrainstormFileNodeData {
    fileName?: string
    mimeType?: string
    size?: number
    dataUrl?: string
    previewKind?: BrainstormFilePreviewKind
    textPreview?: string
    isUploading?: boolean
    onSelectFile?: (file: File) => void
    onClearFile?: () => void
}

const formatFileSize = (size?: number) => {
    if (!size && size !== 0) {
        return undefined
    }
    const units = ["B", "KB", "MB", "GB", "TB"]
    let value = size
    let index = 0
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024
        index += 1
    }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`
}

const BrainstormFileNode = memo(({ data, selected, dragging }: NodeProps<BrainstormFileNodeData>) => {
    const inputRef = useRef<HTMLInputElement | null>(null)

    const handleInputChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0]
            if (file) {
                data?.onSelectFile?.(file)
            }
            // Reset value so selecting the same file twice still triggers change
            event.target.value = ""
        },
        [data],
    )

    const handleTriggerUpload = useCallback(() => {
        inputRef.current?.click()
    }, [])

    const handlePreventDrag = useCallback((event: PointerEvent<HTMLElement>) => {
        event.stopPropagation()
    }, [])

    const formattedSize = useMemo(() => formatFileSize(data?.size), [data?.size])

    const iconColor = selected ? "text-slate-600" : "text-slate-500"

    const renderPreview = () => {
        if (data?.isUploading) {
            return (
                <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 py-12">
                    <Loader2 className="size-6 animate-spin text-slate-500" aria-hidden="true" />
                    <p className="text-sm font-medium text-slate-600">Preparing preview...</p>
                </div>
            )
        }

        if (!data?.dataUrl || !data?.previewKind) {
            return (
                <div
                    onPointerDown={handlePreventDrag}
                    className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center"
                >
                    <Upload className="size-6 text-slate-500" aria-hidden="true" />
                    <div>
                        <p className="text-sm font-semibold text-slate-700">Add a file</p>
                        <p className="mt-1 text-xs text-slate-500">Images, audio, video, PDFs, or any document.</p>
                    </div>
                    <button
                        type="button"
                        onPointerDown={handlePreventDrag}
                        onClick={handleTriggerUpload}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
                    >
                        <Upload className="size-4" aria-hidden="true" />
                        Upload file
                    </button>
                </div>
            )
        }

        const commonPreviewClass = "rounded-md border border-slate-200 bg-slate-100"

        switch (data.previewKind) {
            case "image":
                return (
                    <div className="relative" onPointerDown={handlePreventDrag}>
                        <img
                            src={data.dataUrl}
                            alt={data.fileName ?? "Uploaded image"}
                            className={cn(commonPreviewClass, "max-h-[560px] w-full object-contain")}
                        />
                    </div>
                )
            case "audio":
                return (
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-4" onPointerDown={handlePreventDrag}>
                        <audio controls className="w-full" src={data.dataUrl}>
                            Your browser does not support the audio element.
                        </audio>
                    </div>
                )
            case "video":
                return (
                    <div className="relative" onPointerDown={handlePreventDrag}>
                        <video
                            controls
                            src={data.dataUrl}
                            className={cn(commonPreviewClass, "max-h-[420px] w-full bg-black object-contain")}
                        >
                            Your browser does not support embedded videos.
                        </video>
                    </div>
                )
            case "pdf":
                return (
                    <div className="relative" onPointerDown={handlePreventDrag}>
                        <iframe
                            title={data.fileName ?? "PDF preview"}
                            src={data.dataUrl}
                            className={cn(commonPreviewClass, "h-[420px] w-full")}
                        />
                    </div>
                )
            case "text":
                return (
                    <div
                        onPointerDown={handlePreventDrag}
                        className="rounded-md border border-slate-200 bg-slate-50 p-4 text-left text-sm text-slate-700"
                    >
                        <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">
                            {data.textPreview ?? "Preview unavailable."}
                        </pre>
                    </div>
                )
            default:
                return (
                    <div
                        onPointerDown={handlePreventDrag}
                        className="flex flex-col items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center"
                    >
                        <FileIcon className="size-6 text-slate-500" aria-hidden="true" />
                        <p className="text-sm text-slate-600">This file type can be downloaded for viewing.</p>
                        <a
                            href={data.dataUrl}
                            download={data.fileName ?? "file"}
                            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
                            onPointerDown={handlePreventDrag}
                        >
                            Download file
                        </a>
                    </div>
                )
        }
    }

    const renderTypeIcon = () => {
        switch (data?.previewKind) {
            case "image":
                return <ImageIcon className={cn("size-4", iconColor)} aria-hidden="true" />
            case "audio":
                return <AudioLines className={cn("size-4", iconColor)} aria-hidden="true" />
            case "video":
                return <Video className={cn("size-4", iconColor)} aria-hidden="true" />
            case "pdf":
                return <FileText className={cn("size-4", iconColor)} aria-hidden="true" />
            case "text":
                return <FileText className={cn("size-4", iconColor)} aria-hidden="true" />
            default:
                return <FileIcon className={cn("size-4", iconColor)} aria-hidden="true" />
        }
    }

    return (
        <div
            className={cn(
                "relative flex min-w-[280px] max-w-[400px] flex-col gap-4 rounded-lg border bg-white p-4 shadow-sm transition-[border-color,box-shadow]",
                selected ? "border-vscode-focusBorder" : "border-slate-200",
                dragging ? "cursor-grabbing" : "cursor-grab",
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    {renderTypeIcon()}
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-700">
                            {data?.fileName ?? "Untitled file"}
                        </p>
                        {(data?.mimeType || formattedSize) && (
                            <p className="text-xs text-slate-500">
                                {data?.mimeType}
                                {data?.mimeType && formattedSize ? " · " : ""}
                                {formattedSize}
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex shrink-0 gap-2">
                    <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
                        onClick={handleTriggerUpload}
                        onPointerDown={handlePreventDrag}
                    >
                        <Upload className="size-3.5" aria-hidden="true" />
                        {data?.dataUrl ? "Replace" : "Upload"}
                    </button>
                    {data?.dataUrl && (
                        <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md border border-transparent bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
                            onClick={() => data?.onClearFile?.()}
                            onPointerDown={handlePreventDrag}
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>
            {renderPreview()}
            <input
                ref={inputRef}
                type="file"
                className="hidden"
                onChange={handleInputChange}
                onClick={(event) => event.stopPropagation()}
            />
            <Handle type="target" position={Position.Left} className="!h-3 !w-3" />
            <Handle type="source" position={Position.Right} className="!h-3 !w-3" />
        </div>
    )
})

BrainstormFileNode.displayName = "BrainstormFileNode"

export default BrainstormFileNode
