import React from "react"
import { vscode } from "../../utils/vscode"
import { useAppTranslation } from "@/i18n/TranslationContext"
import KiloRulesToggleModal from "./rules/KiloRulesToggleModal"
import BottomButton from "./BottomButton"
import { BottomApiConfig } from "./BottomApiConfig" // kilocode_change

interface BottomControlsProps {
	showApiConfig?: boolean
}

const BottomControls: React.FC<BottomControlsProps> = ({ showApiConfig = false }) => {
	const { t } = useAppTranslation()

	const showFeedbackOptions = () => {
		vscode.postMessage({ type: "showFeedbackOptions" })
	}

	const openOuterGate = () => {
		vscode.postMessage({ type: "selectCompany", workplaceCompanyId: undefined })
		vscode.postMessage({ type: "action", action: "switchTab", tab: "outerGate" })
		if (typeof window !== "undefined") {
			window.postMessage({ type: "action", action: "switchTab", tab: "outerGate" }, "*")
		}
	}

	const openHub = () => {
		vscode.postMessage({ type: "action", action: "switchTab", tab: "hub" })
		if (typeof window !== "undefined") {
			window.postMessage({ type: "action", action: "switchTab", tab: "hub" }, "*")
		}
	}

	const openChatsHub = () => {
		vscode.postMessage({ type: "action", action: "switchTab", tab: "chatsHub" })
		if (typeof window !== "undefined") {
			window.postMessage({ type: "action", action: "switchTab", tab: "chatsHub" }, "*")
		}
	}

	const openBrainstorm = () => {
		vscode.postMessage({ type: "action", action: "switchTab", tab: "brainstorm" })
		if (typeof window !== "undefined") {
			window.postMessage({ type: "action", action: "switchTab", tab: "brainstorm" }, "*")
		}
	}

	const openActionHub = () => {
		vscode.postMessage({ type: "action", action: "switchTab", tab: "workspace" })
		if (typeof window !== "undefined") {
			window.postMessage({ type: "action", action: "switchTab", tab: "workspace" }, "*")
		}
	}

	const outerGateLabel = t("common:outerGate.title", { defaultValue: "Outer Gates" }) as string
	const agentHubLabel = t("common:hub.title", { defaultValue: "Agent Hub" }) as string
	const chatsHubLabel = t("common:chatsHub.title", { defaultValue: "Chats Hub" }) as string
	const brainstormHubLabel = t("common:brainstorm.title", { defaultValue: "Brainstorm Hub" }) as string
	const actionHubLabel = t("common:actionHub.title", { defaultValue: "Action Items Hub" }) as string

	return (
		<div className="flex flex-row w-auto items-center justify-between h-[30px] mx-3.5 mt-2.5 mb-1 gap-1">
			<div className="flex flex-item flex-row justify-start gap-1 grow overflow-hidden">
				{showApiConfig && <BottomApiConfig />}
				<BottomButton
					iconClass="codicon-home"
					title={outerGateLabel}
					ariaLabel={outerGateLabel}
					onClick={openOuterGate}
				/>
				<BottomButton
					iconClass="codicon-organization"
					title={agentHubLabel}
					ariaLabel={agentHubLabel}
					onClick={openHub}
				/>
				<BottomButton
					iconClass="codicon-comment-discussion"
					title={chatsHubLabel}
					ariaLabel={chatsHubLabel}
					onClick={openChatsHub}
				/>
				<BottomButton
					iconClass="codicon-lightbulb"
					title={brainstormHubLabel}
					ariaLabel={brainstormHubLabel}
					onClick={openBrainstorm}
				/>
				<BottomButton
					iconClass="codicon-checklist"
					title={actionHubLabel}
					ariaLabel={actionHubLabel}
					onClick={openActionHub}
				/>
			</div>
			<div className="flex flex-row justify-end w-auto">
				<div className="flex items-center gap-1">
					<KiloRulesToggleModal />
					<BottomButton
						iconClass="codicon-feedback"
						title={t("common:feedback.title")}
						onClick={showFeedbackOptions}
					/>
				</div>
			</div>
		</div>
	)
}

export default BottomControls
