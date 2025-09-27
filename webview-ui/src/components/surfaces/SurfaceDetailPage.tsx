import React from "react"

import BrainstormCanvas from "../brainstorm/BrainstormCanvas"

interface SurfaceDetailPageProps {
	surfaceId: string
	onBack: () => void
}

const SurfaceDetailPage: React.FC<SurfaceDetailPageProps> = ({ surfaceId }) => (
	<div className="fixed inset-0 flex min-h-0 w-full overflow-hidden bg-vscode-editor-background text-vscode-editor-foreground">
		<BrainstormCanvas initialSurfaceId={surfaceId} />
	</div>
)

export default SurfaceDetailPage
