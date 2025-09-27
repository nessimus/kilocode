import React from "react"

import BrainstormCanvas from "../brainstorm/BrainstormCanvas"

interface EndlessSurfaceCanvasProps {
	surface?: unknown
	onSurfaceChange?: (next: unknown) => void
}

export const EndlessSurfaceCanvas: React.FC<EndlessSurfaceCanvasProps> = ({ surface }) => (
	<BrainstormCanvas
		initialSurfaceId={typeof surface === "object" && surface !== null && "meta" in (surface as Record<string, unknown>) ? (surface as any).meta?.id : undefined}
	/>
)

export default EndlessSurfaceCanvas
