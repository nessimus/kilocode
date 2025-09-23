// RealtimeSessionManager centralises OpenAI realtime session handling.
// TODO: Wire this into the webview message handler once the realtime feature flag is ready.

import { randomUUID } from "crypto"

export interface RealtimeSessionRequest {
	modeId?: string
	systemPrompt?: string
	enableScreenShare?: boolean
	voice?: string
}

export interface RealtimeSessionCredentials {
	ephemeralToken: string
	sessionId: string
	model: string
	expiresAt: number
}

const DEFAULT_REALTIME_MODEL = "gpt-4o-mini-realtime-preview"
const DEFAULT_SESSION_TTL_MS = 60_000

export class RealtimeSessionManager {
	private currentSession: RealtimeSessionCredentials | undefined

	async startSession(_request: RealtimeSessionRequest): Promise<RealtimeSessionCredentials> {
		const session: RealtimeSessionCredentials = {
			ephemeralToken: `debug-${randomUUID()}`,
			sessionId: randomUUID(),
			model: DEFAULT_REALTIME_MODEL,
			expiresAt: Date.now() + DEFAULT_SESSION_TTL_MS,
		}

		this.currentSession = session
		return session
	}

	async updateInstructions(_systemPrompt: string): Promise<void> {
		// Placeholder: real implementation will push session.update over the realtime channel
		return
	}

	async stopSession(): Promise<void> {
		this.currentSession = undefined
	}

	getActiveSession(): RealtimeSessionCredentials | undefined {
		return this.currentSession
	}
}
