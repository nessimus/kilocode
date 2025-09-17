import { ClineMessage } from "@roo-code/types"
import { Mention } from "../../chat/Mention"
import { Button } from "@src/components/ui"
import Thumbnails from "../../common/Thumbnails"
import { vscode } from "@src/utils/vscode"
import { useState } from "react"
import { useTranslation } from "react-i18next"

interface KiloChatRowUserFeedbackProps {
	message: ClineMessage
	isStreaming: boolean
	onChatReset?: () => void
}

export const KiloChatRowUserFeedback = ({ message, isStreaming, onChatReset }: KiloChatRowUserFeedbackProps) => {
	const { t } = useTranslation()
	const originalText = message.text ?? ""
	const [isEditing, setIsEditing] = useState(false)
	const [editedText, setEditedText] = useState(originalText)
	const youLabel = t("kilocode:userFeedback:authorYou", { defaultValue: "You" })

	const renderBadge = (
		<span className="kilo-user-message__badge">
			<span className="codicon codicon-account" aria-hidden="true" />
			{youLabel}
		</span>
	)

	const handleCancel = () => {
		setEditedText(originalText)
		setIsEditing(false)
	}

	const handleResend = () => {
		vscode.postMessage({ type: "editMessage", values: { ts: message.ts, text: editedText } })
		setIsEditing(false)
		if (onChatReset) {
			onChatReset()
		}
	}

	const handleRevertAndResend = () => {
		vscode.postMessage({ type: "editMessage", values: { ts: message.ts, text: editedText, revert: true } })
		setIsEditing(false)
		if (onChatReset) {
			onChatReset()
		}
	}

	if (isEditing) {
		return (
			<div className="kilo-user-message kilo-user-message--editing">
				<div className="kilo-user-message__top">{renderBadge}</div>
				<textarea
					className="kilo-user-message__textarea"
					value={editedText}
					onChange={(e) => setEditedText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
							e.preventDefault()
							handleRevertAndResend()
						}
					}}
				/>
				<div className="kilo-user-message__actions kilo-user-message__actions--editing">
					<Button onClick={handleCancel} variant="ghost">
						{t("kilocode:userFeedback:editCancel")}
					</Button>
					<Button variant="secondary" onClick={handleResend} disabled={editedText === originalText}>
						{t("kilocode:userFeedback:send")}
					</Button>
					<Button onClick={handleRevertAndResend} disabled={editedText === originalText}>
						{t("kilocode:userFeedback:restoreAndSend")}
					</Button>
				</div>
			</div>
		)
	}

	return (
		<div className="kilo-user-message">
			<div className="kilo-user-message__top">
				{renderBadge}
				<div className="kilo-user-message__actions">
					<Button
						variant="ghost"
						size="icon"
						className="shrink-0"
						disabled={isStreaming}
						onClick={(e) => {
							e.stopPropagation()
							setIsEditing(true)
						}}>
						<span className="codicon codicon-edit" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="shrink-0"
						disabled={isStreaming}
						onClick={(e) => {
							e.stopPropagation()
							vscode.postMessage({ type: "deleteMessage", value: message.ts })
						}}>
						<span className="codicon codicon-trash" />
					</Button>
				</div>
			</div>
			<div className="kilo-user-message__body">
				<Mention text={originalText} withShadow />
			</div>
			{message.images && message.images.length > 0 && (
				<div className="kilo-user-message__attachments">
					<Thumbnails images={message.images} />
				</div>
			)}
		</div>
	)
}
