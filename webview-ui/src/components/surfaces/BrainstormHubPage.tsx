import React from "react"

import BrainstormCanvas from "../brainstorm/BrainstormCanvas"
import type { BrainstormSurfaceSummary } from "./types"

interface BrainstormHubPageProps {
	surfaces: BrainstormSurfaceSummary[]
	searchTerm: string
	onSearchChange: (term: string) => void
	onCreateSurface: () => void
	onOpenSurface: (surfaceId: string) => void
}

const BrainstormHubPage: React.FC<BrainstormHubPageProps> = () => (
	<div className="fixed inset-0 flex min-h-0 w-full overflow-hidden bg-vscode-editor-background text-vscode-editor-foreground">
		<BrainstormCanvas />
	</div>
)

export default BrainstormHubPage
