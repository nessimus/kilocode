import React from "react"
import { SendHorizontal, StopCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import { StandardTooltip } from "@/components/ui"

interface ChatSendButtonProps {
	disabled?: boolean
	onClick?: () => void
	tooltip?: string
	ariaLabel?: string
	className?: string
	variant?: "send" | "stop"
}

export const ChatSendButton: React.FC<ChatSendButtonProps> = ({
	disabled = false,
	onClick,
	tooltip,
	ariaLabel,
	className,
	variant = "send",
}) => {
	const defaultLabel = variant === "stop" ? "Stop" : "Send Message"
	const label = ariaLabel ?? tooltip ?? defaultLabel
	const baseClasses =
		"relative inline-flex items-center justify-center border border-transparent bg-transparent p-1.5 rounded-md min-w-[28px] min-h-[28px] transition-all duration-150 focus:outline-none focus-visible:ring-1"
	const enabledVariantClasses =
		variant === "stop"
			? "opacity-100 text-[var(--vscode-errorForeground)] hover:bg-[rgba(255,86,86,0.16)] hover:text-[var(--vscode-errorForeground)] focus-visible:ring-[var(--vscode-errorForeground)] active:bg-[rgba(255,86,86,0.24)] border-[rgba(255,86,86,0.4)] hover:border-[rgba(255,86,86,0.55)]"
			: "opacity-60 hover:opacity-100 text-vscode-descriptionForeground hover:text-vscode-foreground hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.15)] focus-visible:ring-vscode-focusBorder active:bg-[rgba(255,255,255,0.1)]"
	const disabledClasses =
		"opacity-40 cursor-not-allowed grayscale-[30%] hover:bg-transparent hover:border-[rgba(255,255,255,0.08)] active:bg-transparent"

	const buttonClasses = cn(baseClasses, disabled ? disabledClasses : enabledVariantClasses, className)

	const icon =
		variant === "stop" ? (
			<StopCircle className="w-4 h-4 animate-pulse" />
		) : (
			<SendHorizontal className="w-4 h-4 rtl:-scale-x-100" />
		)

	return (
		<StandardTooltip content={tooltip ?? label}>
			<button
				type="button"
				aria-label={label}
				disabled={disabled}
				onClick={disabled ? undefined : onClick}
				className={buttonClasses}>
				{icon}
			</button>
		</StandardTooltip>
	)
}

export default ChatSendButton
