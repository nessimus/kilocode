import React from "react"

import BrainstormCanvas from "../brainstorm/BrainstormCanvas"

interface HubViewProps {
	isHidden: boolean
	targetSection?: string
}

export const HubView: React.FC<HubViewProps> = ({ isHidden }) => (
	<div
		data-testid="hub-view"
		className={isHidden ? "hidden" : "golden-hub-root fixed inset-0 flex overflow-hidden bg-vscode-editor-background text-vscode-editor-foreground"}
	>
		<BrainstormCanvas />
	</div>
)

export default HubView
