import "server-only"

import { endlessSurfaceRecordSchema, type EndlessSurfaceRecord } from "@roo-code/types"

const DEFAULT_API_BASE = "https://app.roocode.com"
const DEFAULT_ENDPOINT = "/api/surfaces"

const apiBase = process.env.ROO_CODE_API_URL ?? DEFAULT_API_BASE
const surfacesEndpoint = process.env.ROO_CODE_SURFACES_ENDPOINT ?? DEFAULT_ENDPOINT

function buildSurfaceUrl(surfaceId: string) {
	const base = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase
	const endpoint = surfacesEndpoint.startsWith("/") ? surfacesEndpoint : `/${surfacesEndpoint}`
	return `${base}${endpoint}/${encodeURIComponent(surfaceId)}`
}

export async function fetchSurfaceRecord(surfaceId: string): Promise<EndlessSurfaceRecord | null> {
	if (!surfaceId) {
		return null
	}

	const url = buildSurfaceUrl(surfaceId)
	const response = await fetch(url, {
		// Surfaces can change frequently; avoid long-lived caching while still allowing ISR overrides.
		next: { revalidate: 15 },
	})

	if (response.status === 404 || response.status === 403 || response.status === 401) {
		return null
	}

	if (!response.ok) {
		throw new Error(`Failed to load surface ${surfaceId}: HTTP ${response.status}`)
	}

	const payload = await response.json()
	return endlessSurfaceRecordSchema.parse(payload)
}
