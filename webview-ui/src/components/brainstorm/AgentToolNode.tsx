import {
	memo,
	useCallback,
	useEffect,
	useMemo,
	useState,
	type ChangeEvent,
	type KeyboardEvent,
	type PointerEvent,
} from "react"
import type { NodeProps } from "reactflow"

import { useAppTranslation } from "@/i18n/TranslationContext"
import { cn } from "@/lib/utils"

export interface AgentToolInput {
	id: string
	key: string
	value: string
}

export type AgentToolStatus = "idle" | "running" | "success" | "error"

export interface AgentToolNodeData {
	toolId: string
	label: string
	description?: string
	status: AgentToolStatus
	lastRunAt?: number
	lastResult?: string
	lastError?: string
	inputs: AgentToolInput[]
}

export interface AgentToolNodeRenderData extends AgentToolNodeData {
	onLabelChange?: (value: string) => void
	onInputChange?: (inputId: string, field: "key" | "value", value: string) => void
	onAddInput?: () => void
	onRemoveInput?: (inputId: string) => void
}

const STATUS_STYLES: Record<AgentToolStatus, string> = {
	idle: "bg-slate-300",
	running: "bg-amber-500",
	success: "bg-emerald-500",
	error: "bg-rose-500",
}

const STATUS_LABELS: Record<AgentToolStatus, string> = {
	idle: "Idle",
	running: "Running",
	success: "Success",
	error: "Error",
}

const AgentToolNode = memo(({ data, selected, dragging }: NodeProps<AgentToolNodeRenderData>) => {
	const { t } = useAppTranslation()
	const [labelDraft, setLabelDraft] = useState(data.label)

	useEffect(() => {
		setLabelDraft(data.label)
	}, [data.label])

	const statusBadge = useMemo(() => {
		const defaultLabel = STATUS_LABELS[data.status] ?? STATUS_LABELS.idle
		const color = STATUS_STYLES[data.status] ?? STATUS_STYLES.idle
		const label = t(`common:brainstorm.agentToolStatus.${data.status}`, { defaultValue: defaultLabel })
		return { label, color }
	}, [data.status, t])

	const handleLabelCommit = useCallback(() => {
		const trimmed = labelDraft.trim()
		const nextLabel = trimmed.length > 0 ? trimmed : data.label
		if (nextLabel !== data.label) {
			data.onLabelChange?.(nextLabel)
		}
		setLabelDraft(nextLabel)
	}, [data, labelDraft])

	const handleLabelKeyDown = useCallback(
		(event: KeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Enter") {
				event.preventDefault()
				handleLabelCommit()
				return
			}

			if (event.key === "Escape") {
				event.preventDefault()
				setLabelDraft(data.label)
			}
		},
		[data.label, handleLabelCommit],
	)

	const handleContainerPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
		const target = event.target as HTMLElement | null
		if (target && (target.tagName === "INPUT" || target.tagName === "BUTTON")) {
			event.stopPropagation()
		}
	}, [])

	const handleInputPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
		event.stopPropagation()
	}, [])

	const handleParameterChange = useCallback(
		(inputId: string, field: "key" | "value") =>
			(event: ChangeEvent<HTMLInputElement>) => {
				data.onInputChange?.(inputId, field, event.target.value)
			},
		[data],
	)

	const labelPlaceholder = t("common:brainstorm.agentToolLabelPlaceholder", { defaultValue: "Custom name" })
	const paramKeyPlaceholder = t("common:brainstorm.agentToolInputKeyPlaceholder", { defaultValue: "Input name" })
	const paramValuePlaceholder = t("common:brainstorm.agentToolInputValuePlaceholder", { defaultValue: "Value" })
	const addInputLabel = t("common:brainstorm.agentToolAddInput", { defaultValue: "Add input" })
	const removeInputLabel = t("common:brainstorm.agentToolRemoveInput", { defaultValue: "Remove" })
	const toolIdLabel = t("common:brainstorm.agentToolIdLabel", { defaultValue: "Tool" })

	return (
		<div
			onPointerDown={handleContainerPointerDown}
			className={cn(
				"flex w-64 flex-col gap-3 rounded-lg border bg-white p-3 text-slate-700 shadow-sm transition-[border-color,box-shadow]",
				selected ? "border-vscode-focusBorder shadow-md" : "border-slate-300",
				dragging ? "cursor-grabbing" : "cursor-grab",
			)}
		>
			<div className="flex items-start justify-between gap-2">
				<div className="flex-1">
					<input
						type="text"
						value={labelDraft}
						onChange={(event) => setLabelDraft(event.target.value)}
						onBlur={handleLabelCommit}
						onKeyDown={handleLabelKeyDown}
						onPointerDown={handleInputPointerDown}
						placeholder={labelPlaceholder}
						className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-800 outline-none focus:border-vscode-focusBorder"
					/>
					<div className="mt-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-tight text-slate-500">
						<span>{toolIdLabel}:</span>
						<span>{data.toolId}</span>
					</div>
				</div>
				<span
					className={cn(
						"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white",
						statusBadge.color,
					)}>
					<span className="block size-2 rounded-full bg-white/70" />
					<span>{statusBadge.label}</span>
				</span>
			</div>

			{data.description && (
				<p className="text-xs text-slate-500">{data.description}</p>
			)}

			<div className="flex flex-col gap-2">
				{data.inputs.map((input) => (
					<div key={input.id} className="flex items-center gap-2">
						<input
							type="text"
							value={input.key}
							onChange={handleParameterChange(input.id, "key")}
							onPointerDown={handleInputPointerDown}
							placeholder={paramKeyPlaceholder}
							className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-vscode-focusBorder"
						/>
						<input
							type="text"
							value={input.value}
							onChange={handleParameterChange(input.id, "value")}
							onPointerDown={handleInputPointerDown}
							placeholder={paramValuePlaceholder}
							className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-vscode-focusBorder"
						/>
						<button
							type="button"
							onClick={() => data.onRemoveInput?.(input.id)}
							onPointerDown={handleInputPointerDown}
							title={removeInputLabel}
							className="inline-flex items-center justify-center rounded border border-transparent px-2 py-1 text-xs text-slate-500 transition-colors hover:border-rose-200 hover:text-rose-600">
							<span className="codicon codicon-trash" aria-hidden="true" />
							<span className="sr-only">{removeInputLabel}</span>
						</button>
					</div>
				))}
				<button
					type="button"
					onClick={() => data.onAddInput?.()}
					onPointerDown={handleInputPointerDown}
					disabled={!data.onAddInput}
					className="inline-flex w-fit items-center gap-1 rounded border border-dashed border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-vscode-focusBorder hover:text-vscode-focusBorder disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300">
					<span className="codicon codicon-add" aria-hidden="true" />
					<span>{addInputLabel}</span>
				</button>
			</div>
		</div>
	)
})

AgentToolNode.displayName = "AgentToolNode"

export default AgentToolNode
