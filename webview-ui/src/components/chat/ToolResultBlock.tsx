import { useMemo, useState, type CSSProperties } from "react"
import { ChevronDown } from "lucide-react"

import type { ToolResultMessagePayload } from "@roo-code/types"

import { cn } from "@/lib/utils"
import { ToolUseBlock, ToolUseBlockHeader } from "../common/ToolUseBlock"
import CodeBlock from "../kilocode/common/CodeBlock" // kilocode_change
import ImageBlock from "../common/ImageBlock"

interface ToolResultBlockProps {
	payload: ToolResultMessagePayload
}

const SECTION_TITLE_CLASS = "text-xs font-semibold uppercase tracking-wide text-vscode-descriptionForeground"

const HEADER_ICON_STYLE: CSSProperties = {
	marginBottom: "-1.5px",
}

export const ToolResultBlock = ({ payload }: ToolResultBlockProps) => {
	const [expanded, setExpanded] = useState(true)

	const hasParams = useMemo(() => (payload.params?.length ?? 0) > 0, [payload.params])
	const hasImages = useMemo(() => (payload.resultImages?.length ?? 0) > 0, [payload.resultImages])
	const hasResultText = Boolean(payload.resultText && payload.resultText.trim().length > 0)
	const hasDescription = Boolean(payload.description)

	const hasBodyContent = hasDescription || hasParams || hasResultText || hasImages

	return (
		<ToolUseBlock>
			<ToolUseBlockHeader
				onClick={hasBodyContent ? () => setExpanded((prev) => !prev) : undefined}
				className={cn("justify-between items-center", hasBodyContent && "cursor-pointer")}> 
				<div className="flex items-center gap-2 overflow-hidden">
					<span className="codicon codicon-tools" style={HEADER_ICON_STYLE}></span>
					<div className="flex flex-col overflow-hidden">
						<span className="font-medium text-vscode-foreground truncate">
							{payload.displayName || payload.toolName}
						</span>
						<span className="text-xs text-vscode-descriptionForeground truncate">{payload.toolName}</span>
					</div>
				</div>
				{hasBodyContent && (
					<ChevronDown
						className={cn("size-4 transition-transform duration-200 text-vscode-descriptionForeground", {
							"rotate-180": expanded,
						})}
					/>
				)}
			</ToolUseBlockHeader>
			{hasBodyContent && expanded && (
				<div className="border-t border-vscode-border bg-vscode-editor-background px-3 py-3 flex flex-col gap-3">
					{hasDescription && (
						<div className="text-xs text-vscode-descriptionForeground whitespace-pre-wrap break-words">
							{payload.description}
						</div>
					)}
					{hasParams && payload.params && (
						<div className="flex flex-col gap-1">
							<div className={SECTION_TITLE_CLASS}>Parameters</div>
							<div className="flex flex-col gap-1">
								{payload.params.map((param) => (
									<div key={param.key} className="text-xs font-mono whitespace-pre-wrap break-words">
										<span className="text-vscode-descriptionForeground">{param.label}: </span>
										<span>{param.value}</span>
									</div>
								))}
							</div>
						</div>
					)}
					{hasResultText && payload.resultText && (
						<div className="flex flex-col gap-1">
							<div className={SECTION_TITLE_CLASS}>Result</div>
							<CodeBlock source={payload.resultText} language="markdown" />
							{payload.resultTruncated && (
								<div className="text-xs italic text-vscode-descriptionForeground">
									Result truncated for display.
								</div>
							)}
						</div>
					)}
					{hasImages && payload.resultImages && (
						<div className="flex flex-col gap-1">
							<div className={SECTION_TITLE_CLASS}>Images</div>
							<div className="flex flex-wrap gap-2">
								{payload.resultImages.map((image, index) => (
									<ImageBlock key={index} imageData={image} />
								))}
							</div>
						</div>
					)}
				</div>
			)}
		</ToolUseBlock>
	)
}

export default ToolResultBlock
