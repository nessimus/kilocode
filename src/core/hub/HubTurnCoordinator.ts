import type { HubRoom, HubParticipant } from "../../shared/hub"

function escapeStringRegexp(str: string): string {
	return str.replace(/[|\\{}()[\]^$+*?.-]/g, "\\$&")
}

interface RoomTurnState {
	pending: string[]
	deferred: string[]
	lastSpeakerId?: string
	rotationOrder: string[]
}

export class HubTurnCoordinator {
	private readonly roomStates = new Map<string, RoomTurnState>()

	private getState(roomId: string, participants: HubParticipant[]): RoomTurnState {
		let state = this.roomStates.get(roomId)
		if (!state) {
			state = {
				pending: [],
				deferred: [],
				rotationOrder: participants.filter((p) => p.type === "agent").map((p) => p.id),
			}
			this.roomStates.set(roomId, state)
		}

		// Refresh rotation order to include any new agents or remove departed ones.
		const agentIds = participants.filter((p) => p.type === "agent").map((p) => p.id)
		state.rotationOrder = agentIds

		return state
	}

	public handleUserMessage(room: HubRoom, text: string): void {
		const state = this.getState(room.id, room.participants)
		state.pending = this.targetedAgentIds(room, text)
		state.deferred = []

		if (!state.pending.length) {
			const next = this.pickNextAgent(room, state)
			if (next) {
				state.pending.push(next)
			}
		}
	}

	public handleAgentMessage(room: HubRoom, speakerId: string, content: string): void {
		const state = this.getState(room.id, room.participants)
		state.lastSpeakerId = speakerId
		state.deferred = this.targetedAgentIds(room, content, speakerId)
	}

	public enqueueAgent(room: HubRoom, agentId: string): void {
		const state = this.getState(room.id, room.participants)
		if (!state.pending.includes(agentId)) {
			state.pending.push(agentId)
		}
	}

	public clearPending(room: HubRoom): void {
		const state = this.getState(room.id, room.participants)
		state.pending = []
		state.deferred = []
	}

	public consumeDeferred(room: HubRoom): string[] {
		const state = this.getState(room.id, room.participants)
		const deferred = [...state.deferred]
		state.deferred = []
		return deferred
	}

	public getNextAgent(room: HubRoom): string | undefined {
		const state = this.getState(room.id, room.participants)
		if (state.pending.length > 0) {
			return state.pending.shift()
		}

		return undefined
	}

	private pickNextAgent(room: HubRoom, state: RoomTurnState): string | undefined {
		const agents = state.rotationOrder
		if (!agents.length) {
			return undefined
		}

		if (!state.lastSpeakerId) {
			return agents[0]
		}

		const currentIndex = agents.indexOf(state.lastSpeakerId)
		if (currentIndex === -1) {
			return agents[0]
		}

		for (let offset = 1; offset <= agents.length; offset++) {
			const candidate = agents[(currentIndex + offset) % agents.length]
			if (candidate !== state.lastSpeakerId) {
				return candidate
			}
		}

		return agents[0]
	}

	private targetedAgentIds(room: HubRoom, text: string, excludeId?: string): string[] {
		const lowered = text.toLowerCase()
		const matches: string[] = []

		const agents = room.participants.filter((p) => p.type === "agent" && p.id !== excludeId)
		for (const agent of agents) {
			const name = agent.displayName.trim()
			if (!name) continue

			const aliasSet = new Set<string>()
			aliasSet.add(name)
			const words = name.split(/\s+/).filter(Boolean)
			if (words.length) {
				aliasSet.add(words[0])
				aliasSet.add(words.map((word) => word.replace(/[^\w]/g, "")).join(""))
				aliasSet.add(words.map((word) => word.toLowerCase()).join(""))
			}
			if (agent.persona?.summary) {
				const summaryWords = agent.persona.summary.split(/\s+/).filter(Boolean)
				if (summaryWords.length) {
					aliasSet.add(summaryWords[0])
				}
			}

			for (const alias of aliasSet) {
				const cleanAlias = alias.trim()
				if (!cleanAlias) continue
				const pattern = new RegExp(`(?<![\w@.#])@?${escapeStringRegexp(cleanAlias)}(?![\w-])`, "i")
				if (pattern.test(lowered)) {
					matches.push(agent.id)
					break
				}
			}
		}

		return matches
	}
}
