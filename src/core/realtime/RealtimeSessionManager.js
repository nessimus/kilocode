// RealtimeSessionManager centralises OpenAI realtime session handling.
// TODO: Wire this into the webview message handler once the realtime feature flag is ready.
import { randomUUID } from "crypto";
const DEFAULT_REALTIME_MODEL = "gpt-4o-mini-realtime-preview";
const DEFAULT_SESSION_TTL_MS = 60_000;
export class RealtimeSessionManager {
    currentSession;
    async startSession(_request) {
        const session = {
            ephemeralToken: `debug-${randomUUID()}`,
            sessionId: randomUUID(),
            model: DEFAULT_REALTIME_MODEL,
            expiresAt: Date.now() + DEFAULT_SESSION_TTL_MS,
        };
        this.currentSession = session;
        return session;
    }
    async updateInstructions(_systemPrompt) {
        // Placeholder: real implementation will push session.update over the realtime channel
        return;
    }
    async stopSession() {
        this.currentSession = undefined;
    }
    getActiveSession() {
        return this.currentSession;
    }
}
//# sourceMappingURL=RealtimeSessionManager.js.map