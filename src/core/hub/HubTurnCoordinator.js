function escapeStringRegexp(str) {
	return str.replace(/[|\\{}()[\]^$+*?.-]/g, "\\$&")
}
export class HubTurnCoordinator {
	roomStates = new Map()
	getState(roomId, participants) {
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
	handleUserMessage(room, text) {
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
	handleAgentMessage(room, speakerId, content) {
		const state = this.getState(room.id, room.participants)
		state.lastSpeakerId = speakerId
		state.deferred = this.targetedAgentIds(room, content, speakerId)
	}
	enqueueAgent(room, agentId) {
		const state = this.getState(room.id, room.participants)
		if (!state.pending.includes(agentId)) {
			state.pending.push(agentId)
		}
	}
	clearPending(room) {
		const state = this.getState(room.id, room.participants)
		state.pending = []
		state.deferred = []
	}
	consumeDeferred(room) {
		const state = this.getState(room.id, room.participants)
		const deferred = [...state.deferred]
		state.deferred = []
		return deferred
	}
	getNextAgent(room) {
		const state = this.getState(room.id, room.participants)
		if (state.pending.length > 0) {
			return state.pending.shift()
		}
		return undefined
	}
	pickNextAgent(room, state) {
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
	targetedAgentIds(room, text, excludeId) {
		const lowered = text.toLowerCase()
		const matches = []
		const agents = room.participants.filter((p) => p.type === "agent" && p.id !== excludeId)
		for (const agent of agents) {
			const name = agent.displayName.trim()
			if (!name) continue
			const aliasSet = new Set()
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
//# sourceMappingURL=HubTurnCoordinator.js.map
