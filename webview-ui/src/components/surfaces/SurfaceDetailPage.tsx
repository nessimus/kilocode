import React, { useEffect } from "react"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"

import { useExtensionState } from "@/context/ExtensionStateContext"

import { BrainstormHubView } from "./BrainstormHubView"

interface SurfaceDetailPageProps {
	surfaceId: string
	onBack: () => void
}

const SurfaceDetailPage: React.FC<SurfaceDetailPageProps> = ({ surfaceId, onBack }) => {
	const { endlessSurface, setActiveSurface } = useExtensionState()
	const activeSurfaceId = endlessSurface?.activeSurfaceId
	const activeSurface = endlessSurface?.activeSurface

	useEffect(() => {
		if (surfaceId && activeSurfaceId !== surfaceId) {
			void setActiveSurface(surfaceId)
		}
	}, [surfaceId, activeSurfaceId, setActiveSurface])

	const isLoading = !activeSurface || activeSurfaceId !== surfaceId

	return (
		<div className="flex h-full flex-1 min-h-0 flex-col bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]">
			<div className="flex items-center gap-3 border-b border-[var(--vscode-panel-border)] px-4 py-2">
				<VSCodeButton appearance="secondary" onClick={onBack}>
					<span className="codicon codicon-chevron-left mr-1" />
					Back to Surfaces
				</VSCodeButton>
			</div>
			<div className="flex-1 min-h-0 overflow-hidden">
				{isLoading ? (
					<div className="flex h-full items-center justify-center text-sm text-[var(--vscode-descriptionForeground)]">
						Loading surface…
					</div>
				) : (
					<BrainstormHubView />
				)}
			</div>
		</div>
	)
}

export default SurfaceDetailPage
