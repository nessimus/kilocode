"use strict"
var __defProp = Object.defineProperty
var __getOwnPropDesc = Object.getOwnPropertyDescriptor
var __getOwnPropNames = Object.getOwnPropertyNames
var __hasOwnProp = Object.prototype.hasOwnProperty
var __export = (target, all) => {
	for (var name in all) __defProp(target, name, { get: all[name], enumerable: true })
}
var __copyProps = (to, from, except, desc) => {
	if ((from && typeof from === "object") || typeof from === "function") {
		for (let key of __getOwnPropNames(from))
			if (!__hasOwnProp.call(to, key) && key !== except)
				__defProp(to, key, {
					get: () => from[key],
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
				})
	}
	return to
}
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod)
var ConversationOrchestrator_exports = {}
__export(ConversationOrchestrator_exports, {
	ConversationOrchestrator: () => ConversationOrchestrator,
	createIngestHoldState: () => createIngestHoldState,
	createManualHoldState: () => createManualHoldState,
	defaultConversationOrchestrator: () => defaultConversationOrchestrator,
})
module.exports = __toCommonJS(ConversationOrchestrator_exports)
const CHAT_HUB_LOG_PREFIX = "[ChatHubInvestigate]"
const isChatHubDebugEnabled = process.env.CHAT_HUB_DEBUG === "true"
const debugLog = (...args) => {
	if (isChatHubDebugEnabled) {
		console.log(...args)
	}
}
const MENTION_REGEX = /@([\p{L}\p{N}_\-\.]+)/gu
const NAME_TOKEN_REGEX = /([\p{L}\p{N}_][\p{L}\p{N}_\-]*)/gu
const URGENCY_KEYWORDS = ["urgent", "asap", "rush", "immediately", "now"]
const STOP_KEYWORDS = ["stop", "hold", "pause", "halt", "freeze"]
const BROADCAST_KEYWORDS = ["everyone", "everybody", "all of you", "all of y'all", "all team", "whole team"]
const DOCUMENT_RESTRICTION_KEYWORDS = [
	"document",
	"documents",
	"doc",
	"docs",
	"write-up",
	"writeups",
	"writeup",
	"memo",
	"report",
	"presentation",
	"deck",
	"outline",
	"introduction",
]
const SINGLE_SPEAKER_NEGATION_PATTERNS = [
	/\b(?:please\s+)?no\s+one\b/,
	/\b(?:please\s+)?nobody\b/,
	/\bnone\s+of\s+you\b/,
	/\b(?:don't|do\s+not)\s+(?:anyone|anybody|you\s+all|y'all|ya'll|all\s+of\s+you)\b/,
]
const SINGLE_SPEAKER_CREATION_VERBS = /\b(?:write|create|draft|prepare|produce|generate|compose|craft|make)\b/
const SINGLE_SPEAKER_DIRECT_SPEECH_PATTERNS = [
	/\bjust\s+(?:speak|talk|respond)\s+directly\b/,
	/\bspeak\s+directly\s+(?:with|to)\s+(?:me|us|the\s+user)\b/,
	/\brespond\s+directly\b/,
]
const detectSingleSpeakerDirective = (lowerText) => {
	const referencesDocument = DOCUMENT_RESTRICTION_KEYWORDS.some((keyword) => lowerText.includes(keyword))
	if (referencesDocument) {
		const hasNegation = SINGLE_SPEAKER_NEGATION_PATTERNS.some((pattern) => pattern.test(lowerText))
		if (hasNegation && SINGLE_SPEAKER_CREATION_VERBS.test(lowerText)) {
			return "document_block"
		}
	}
	if (SINGLE_SPEAKER_DIRECT_SPEECH_PATTERNS.some((pattern) => pattern.test(lowerText))) {
		return "direct_speech"
	}
	return void 0
}
const EXCLUSIVE_LEADING_KEYWORDS = ["only", "just", "solely", "exclusively", "alone"]
const EXCLUSIVE_TRAILING_KEYWORDS = ["only", "alone", "exclusively"]
const EXCLUSIVE_DIRECTIVE_KEYWORDS = ["let", "have", "allow", "need", "needs", "should", "ask", "want"]
const EXCLUSION_KEYWORDS = [
	"except",
	"excluding",
	"without",
	"but not",
	"besides",
	"aside from",
	"skip",
	"omit",
	"leave out",
]
const NEGATION_KEYWORDS = [
	"shouldn't",
	"should not",
	"don't",
	"do not",
	"can't",
	"cannot",
	"won't",
	"isn't",
	"is not",
	"aren't",
	"are not",
]
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const normalizeWhitespacePattern = (value) => escapeRegex(value).replace(/\s+/g, "\\s+")
const buildAgentAliases = (agent) => {
	const aliases = /* @__PURE__ */ new Set()
	const normalizedName = normalize(agent.name)
	if (normalizedName) {
		aliases.add(normalizedName)
		normalizedName.split(" ").forEach((token) => {
			if (token) {
				aliases.add(token)
			}
		})
	}
	const normalizedRole = normalize(agent.role)
	if (normalizedRole) {
		aliases.add(normalizedRole)
		normalizedRole
			.split(/[\s,/]+/)
			.map((token) => token.trim())
			.filter(Boolean)
			.forEach((token) => aliases.add(token))
	}
	return Array.from(aliases)
}
const buildAgentNameAliases = (agent) => {
	const aliases = /* @__PURE__ */ new Set()
	const normalizedName = normalize(agent.name)
	if (!normalizedName) {
		return []
	}
	aliases.add(agent.name.trim())
	aliases.add(normalizedName)
	normalizedName.split(" ").forEach((token) => {
		if (token.length) {
			aliases.add(token)
		}
	})
	return Array.from(aliases)
}
const matchesExclusiveCue = (text, alias) => {
	if (!alias) {
		return false
	}
	const pattern = normalizeWhitespacePattern(alias)
	const leading = new RegExp(`\\b(?:${EXCLUSIVE_LEADING_KEYWORDS.join("|")})\\s+(?:the\\s+)?${pattern}\\b`)
	const trailing = new RegExp(`\\b(?:the\\s+)?${pattern}\\s+(?:${EXCLUSIVE_TRAILING_KEYWORDS.join("|")})\\b`)
	const directive = new RegExp(
		`\\b(?:${EXCLUSIVE_DIRECTIVE_KEYWORDS.join("|")})\\s+(?:the\\s+)?${pattern}(?:\\s+(?:respond|answer|speak|handle|take\\s+this|weigh\\s+in))?\\b`,
	)
	return leading.test(text) || trailing.test(text) || directive.test(text)
}
const matchesExclusionCue = (text, alias) => {
	if (!alias) {
		return false
	}
	const pattern = normalizeWhitespacePattern(alias)
	const leading = new RegExp(`\\b(?:${EXCLUSION_KEYWORDS.join("|")})\\s+(?:for\\s+)?(?:the\\s+)?${pattern}\\b`)
	const trailing = new RegExp(`\\b(?:the\\s+)?${pattern}\\s+(?:${NEGATION_KEYWORDS.join("|")})\\b`)
	const negativeDirective = new RegExp(`\\b(?:keep|leave)\\s+(?:the\\s+)?${pattern}\\s+out\\b`)
	return leading.test(text) || trailing.test(text) || negativeDirective.test(text)
}
const normalize = (value) => value?.trim().toLowerCase() ?? ""
const buildAgentLookup = (agents) => {
	const byId = /* @__PURE__ */ new Map()
	const byName = /* @__PURE__ */ new Map()
	const tokens = /* @__PURE__ */ new Map()
	agents.forEach((agent) => {
		byId.set(agent.id, agent)
		const normalizedName = normalize(agent.name)
		if (normalizedName) {
			byName.set(normalizedName, agent)
			tokens.set(normalizedName.split(" ")[0] ?? normalizedName, agent)
		}
		const normalizedRole = normalize(agent.role)
		if (normalizedRole) {
			normalizedRole.split(/[,/]/).forEach((segment) => {
				const trimmed = normalize(segment)
				if (trimmed) {
					tokens.set(trimmed, agent)
				}
			})
		}
	})
	return { byId, byName, tokens }
}
const detectExplicitMentions = (text, agentLookup) => {
	const matches = text.matchAll(MENTION_REGEX)
	const found = []
	for (const match of matches) {
		const raw = match[1]
		const normalized = normalize(raw)
		if (!normalized) {
			continue
		}
		const candidate = agentLookup.byName.get(normalized) ?? agentLookup.tokens.get(normalized) ?? void 0
		if (candidate) {
			found.push({
				id: candidate.id,
				label: candidate.name,
				role: candidate.role,
				confidence: 0.95,
				tier: "directed",
				reason: `Explicit mention of @${candidate.name}`,
			})
		}
	}
	return found
}
const detectDirectNameMentions = (text, agents, excludedIds) => {
	const results = []
	agents.forEach((agent) => {
		if (excludedIds.has(agent.id)) {
			return
		}
		const aliases = buildAgentNameAliases(agent)
		const matched = aliases.find((alias) => {
			if (!alias || alias.length < 2) {
				return false
			}
			const pattern = new RegExp(`\\b${normalizeWhitespacePattern(alias.toLowerCase())}\\b`, "i")
			return pattern.test(text)
		})
		if (matched) {
			excludedIds.add(agent.id)
			results.push({
				id: agent.id,
				label: agent.name,
				role: agent.role,
				confidence: 0.88,
				tier: "directed",
				reason: `Name mentioned (${agent.name ?? agent.id})`,
			})
		}
	})
	return results
}
const detectRoleMatches = (text, agents, alreadySelected) => {
	const lowerText = text.toLowerCase()
	const matches = []
	agents.forEach((agent) => {
		if (alreadySelected.has(agent.id)) {
			return
		}
		const roleTokens = (agent.role ?? "")
			.split(/[\s,/]+/)
			.map((token) => token.trim().toLowerCase())
			.filter(Boolean)
		if (!roleTokens.length) {
			return
		}
		const hasMatch = roleTokens.some((token) => lowerText.includes(token))
		if (hasMatch) {
			matches.push({
				id: agent.id,
				label: agent.name,
				role: agent.role,
				confidence: 0.7,
				tier: "topic",
				reason: `Role keyword match (${roleTokens.find((token) => lowerText.includes(token))})`,
			})
		}
	})
	return matches
}
const detectBackgroundMonitors = (agents, selected) => {
	return agents
		.filter((agent) => !selected.has(agent.id))
		.map((agent) => ({
			id: agent.id,
			label: agent.name,
			role: agent.role,
			confidence: Math.min(0.35, (agent.load ?? 0) * 0.5 + 0.25),
			tier: "monitor",
			reason: "Background monitor available",
		}))
}
const parseIntent = (text, agents, agentLookup) => {
	const lowerText = text.toLowerCase()
	const mentions = []
	detectExplicitMentions(text, agentLookup).forEach((agent) => {
		mentions?.push({
			id: agent.id,
			label: agent.label,
			explicit: true,
			text: agent.label,
		})
	})
	const impliedRoles = []
	const exclusiveAgentIds = /* @__PURE__ */ new Set()
	const excludedAgentIds = /* @__PURE__ */ new Set()
	const aliasEntries = agents.map((agent) => ({
		agentId: agent.id,
		tokens: buildAgentAliases(agent),
		role: agent.role,
	}))
	aliasEntries.forEach(({ agentId, tokens }) => {
		tokens.forEach((token) => {
			if (!token) {
				return
			}
			if (matchesExclusiveCue(lowerText, token)) {
				exclusiveAgentIds.add(agentId)
			}
			if (matchesExclusionCue(lowerText, token)) {
				excludedAgentIds.add(agentId)
			}
		})
	})
	agents.forEach((agent) => {
		const tokens = (agent.role ?? "")
			.split(/[\s,/]+/)
			.map((token) => token.trim().toLowerCase())
			.filter(Boolean)
		if (tokens.some((token) => lowerText.includes(token))) {
			impliedRoles.push(agent.role ?? agent.name)
		}
	})
	const urgency = URGENCY_KEYWORDS.some((keyword) => lowerText.includes(keyword)) ? "high" : void 0
	const stopKeywords = STOP_KEYWORDS.filter((keyword) => lowerText.includes(keyword))
	const topics = Array.from(new Set((text.match(NAME_TOKEN_REGEX) ?? []).map((token) => token.toLowerCase()))).slice(
		0,
		5,
	)
	exclusiveAgentIds.forEach((id) => {
		if (excludedAgentIds.has(id)) {
			excludedAgentIds.delete(id)
		}
	})
	const exclusiveList = Array.from(exclusiveAgentIds)
	const excludedList = Array.from(excludedAgentIds)
	const multiSpeaker = exclusiveList.length === 0 || exclusiveList.length > 1
	return {
		mentions: mentions?.length ? mentions : void 0,
		impliedRoles: impliedRoles.length ? impliedRoles : void 0,
		urgency,
		stopKeywords: stopKeywords.length ? stopKeywords : void 0,
		topics: topics.length ? topics : void 0,
		exclusiveAgentIds: exclusiveList.length ? exclusiveList : void 0,
		excludedAgentIds: excludedList.length ? excludedList : void 0,
		multiSpeaker,
	}
}
const HOLD_BUFFER_MS = 1800
const buildSuppressedAgents = (agents, selectedIds) => {
	return agents
		.filter((agent) => !selectedIds.has(agent.id))
		.map((agent) => ({
			id: agent.id,
			label: agent.name,
			reason: "Suppressed to limit overlap",
			tier: void 0,
		}))
}
class ConversationOrchestrator {
	fairnessCounters = /* @__PURE__ */ new Map()
	rotationCursor = 0
	reset() {
		this.fairnessCounters.clear()
		this.rotationCursor = 0
	}
	registerResponse(agentIds) {
		agentIds.forEach((id) => {
			const current = this.fairnessCounters.get(id) ?? 0
			this.fairnessCounters.set(id, current + 1)
		})
		debugLog(CHAT_HUB_LOG_PREFIX, "conversationOrchestrator.registerResponse", {
			agentIds,
			fairnessCounters: Array.from(this.fairnessCounters.entries()),
		})
	}
	analyze({ text, agents, activeAgentId, holdState, timestamp }) {
		const now = timestamp ?? Date.now()
		const agentLookup = buildAgentLookup(agents)
		const lowerText = text.toLowerCase()
		const intent = parseIntent(text, agents, agentLookup)
		const explicitMentions = detectExplicitMentions(text, agentLookup)
		const directedIdSeed = new Set(explicitMentions.map((agent) => agent.id))
		const nameMentions = detectDirectNameMentions(text, agents, directedIdSeed)
		const directedMentions = [...explicitMentions, ...nameMentions]
		const directedIds = new Set(directedMentions.map((agent) => agent.id))
		const roleMatches = detectRoleMatches(text, agents, new Set(directedIds))
		const roleMatchIds = new Set(roleMatches.map((agent) => agent.id))
		const isBroadcastRequested = BROADCAST_KEYWORDS.some((keyword) => lowerText.includes(keyword))
		const singleSpeakerDirective = detectSingleSpeakerDirective(lowerText)
		const documentCreationBanned = singleSpeakerDirective === "document_block"
		const respondDirectly = Boolean(singleSpeakerDirective)
		const exclusiveIntentIds = new Set(intent.exclusiveAgentIds ?? [])
		const excludedIntentIds = new Set(intent.excludedAgentIds ?? [])
		if (!exclusiveIntentIds.size && roleMatches.length === 1 && !isBroadcastRequested) {
			exclusiveIntentIds.add(roleMatches[0].id)
		}
		let selectedIds
		if (exclusiveIntentIds.size) {
			selectedIds = new Set(agents.filter((agent) => exclusiveIntentIds.has(agent.id)).map((agent) => agent.id))
		} else {
			selectedIds = new Set(agents.map((agent) => agent.id))
		}
		excludedIntentIds.forEach((id) => selectedIds.delete(id))
		if (!selectedIds.size) {
			agents.forEach((agent) => {
				if (!excludedIntentIds.has(agent.id)) {
					selectedIds.add(agent.id)
				}
			})
		}
		if (!selectedIds.size && agents.length) {
			selectedIds.add(agents[0].id)
		}
		const selectedExclusiveIds = Array.from(selectedIds).filter((id) => exclusiveIntentIds.has(id))
		const exclusiveOrder = new Map(selectedExclusiveIds.map((id, index) => [id, index]))
		const prioritizedAgents = agents
			.map((agent, index) => ({
				agent,
				index,
				isSelected: selectedIds.has(agent.id),
				isExclusive: exclusiveIntentIds.has(agent.id),
				isDirected: directedIds.has(agent.id),
				isRoleMatch: roleMatchIds.has(agent.id),
				isActive: agent.id === activeAgentId,
				fairness: this.fairnessCounters.get(agent.id) ?? 0,
				load: agent.load ?? 1,
			}))
			.filter((entry) => entry.isSelected)
		prioritizedAgents.sort((a, b) => {
			const aExclusiveRank = exclusiveOrder.has(a.agent.id) ? exclusiveOrder.get(a.agent.id) : Infinity
			const bExclusiveRank = exclusiveOrder.has(b.agent.id) ? exclusiveOrder.get(b.agent.id) : Infinity
			if (aExclusiveRank !== bExclusiveRank) {
				return aExclusiveRank - bExclusiveRank
			}
			if (a.isExclusive !== b.isExclusive) {
				return a.isExclusive ? -1 : 1
			}
			if (a.isDirected !== b.isDirected) {
				return a.isDirected ? -1 : 1
			}
			if (a.isRoleMatch !== b.isRoleMatch) {
				return a.isRoleMatch ? -1 : 1
			}
			if (a.fairness !== b.fairness) {
				return a.fairness - b.fairness
			}
			if (a.load !== b.load) {
				return a.load - b.load
			}
			return a.index - b.index
		})
		const routedAgents = prioritizedAgents.map(({ agent, isExclusive, isDirected, isRoleMatch, isActive }) => {
			const reasonSegments = []
			if (isExclusive) {
				reasonSegments.push("Exclusive request")
			}
			if (isDirected) {
				reasonSegments.push("Mentioned by user")
			}
			if (isRoleMatch) {
				reasonSegments.push("Role relevance")
			}
			if (!isExclusive && !isDirected && !isRoleMatch) {
				reasonSegments.push("Included as default participant")
			}
			if (isActive && !isExclusive && !isDirected) {
				reasonSegments.push("Previously active")
			}
			const confidence = isExclusive ? 0.98 : isDirected ? 0.9 : isRoleMatch ? 0.75 : 0.55
			const tier = isExclusive || isDirected ? "directed" : isRoleMatch ? "topic" : "rotation"
			return {
				id: agent.id,
				label: agent.name,
				role: agent.role,
				confidence,
				tier,
				reason: reasonSegments.join(" \xB7 "),
			}
		})
		if (!routedAgents.length && agents.length) {
			const fallbackAgent = agents[0]
			routedAgents.push({
				id: fallbackAgent.id,
				label: fallbackAgent.name,
				role: fallbackAgent.role,
				confidence: 0.5,
				tier: "rotation",
				reason: "Fallback to first available participant",
			})
			selectedIds.add(fallbackAgent.id)
		}
		const secondaryCandidates = detectBackgroundMonitors(agents, selectedIds)
		const suppressedAgents = buildSuppressedAgents(agents, selectedIds)
		const resolvedExclusiveIds = routedAgents.map((agent) => agent.id).filter((id) => exclusiveIntentIds.has(id))
		const resolvedExcludedIds = agents
			.map((agent) => agent.id)
			.filter((id) => excludedIntentIds.has(id) && !selectedIds.has(id))
		const multiSpeaker = selectedIds.size > 1
		const directedAgentIds = directedMentions.map((agent) => agent.id)
		const resolvedIntent = {
			...intent,
			exclusiveAgentIds: resolvedExclusiveIds.length ? resolvedExclusiveIds : void 0,
			excludedAgentIds: resolvedExcludedIds.length ? resolvedExcludedIds : void 0,
			multiSpeaker,
			directedAgentIds: directedAgentIds.length ? directedAgentIds : void 0,
			respondDirectly: respondDirectly || void 0,
			documentCreationBanned: documentCreationBanned || void 0,
		}
		const loadFactor = Math.min(
			1,
			routedAgents.length / Math.max(agents.length, 1) + (secondaryCandidates.length ? 0.15 : 0),
		)
		const shouldHoldForStop = resolvedIntent.stopKeywords && resolvedIntent.stopKeywords.length > 0
		const holdMode = shouldHoldForStop
			? "manual_hold"
			: holdState?.mode === "manual_hold"
				? "manual_hold"
				: "ingest_hold"
		const hold = {
			mode: holdMode,
			holdUntil: holdMode === "manual_hold" ? void 0 : now + HOLD_BUFFER_MS,
			reason: shouldHoldForStop
				? `Hold requested via keyword: ${resolvedIntent.stopKeywords?.[0]}`
				: "Pausing responders while message ingests",
			requestedBy: shouldHoldForStop ? "user" : "system",
		}
		const rationaleSegments = []
		if (resolvedExclusiveIds.length) {
			const exclusiveLabels = prioritizedAgents
				.filter((entry) => resolvedExclusiveIds.includes(entry.agent.id))
				.map((entry) => entry.agent.name ?? entry.agent.id)
			rationaleSegments.push(`Exclusive request: ${exclusiveLabels.join(", ")}`)
		} else {
			const participantLabels = prioritizedAgents.map((entry) => entry.agent.name ?? entry.agent.id)
			if (participantLabels.length <= 1) {
				rationaleSegments.push(`Single-speaker routing for: ${participantLabels[0] ?? "unknown participant"}`)
			} else {
				rationaleSegments.push(`Multi-speaker routing for: ${participantLabels.join(", ")}`)
			}
		}
		if (resolvedExcludedIds.length) {
			const excludedLabels = agents
				.filter((agent) => resolvedExcludedIds.includes(agent.id))
				.map((agent) => agent.name ?? agent.id)
			rationaleSegments.push(`Excluded: ${excludedLabels.join(", ")}`)
		}
		if (directedMentions.length && !resolvedExclusiveIds.length) {
			rationaleSegments.push(
				`Mentions acknowledged: ${directedMentions.map((agent) => agent.label ?? agent.id).join(", ")}`,
			)
		}
		if (roleMatches.length) {
			rationaleSegments.push(`Role relevance: ${roleMatches.map((agent) => agent.label ?? agent.id).join(", ")}`)
		}
		if (singleSpeakerDirective) {
			const directiveDescription =
				singleSpeakerDirective === "document_block"
					? "Document-writing blocked per user directive"
					: "User requested direct single-speaker response"
			rationaleSegments.push(directiveDescription)
		}
		if (shouldHoldForStop) {
			rationaleSegments.push(`Hold enforced due to "${resolvedIntent.stopKeywords?.[0]}" keyword`)
		}
		const result = {
			primarySpeakers: routedAgents,
			secondaryCandidates: secondaryCandidates.length ? secondaryCandidates : void 0,
			suppressedAgents: suppressedAgents.length ? suppressedAgents : void 0,
			hold,
			rationale: rationaleSegments.join(" \xB7 "),
			intent: resolvedIntent,
			loadFactor,
		}
		debugLog(CHAT_HUB_LOG_PREFIX, "conversationOrchestrator.analyze result", {
			textPreview: text.slice(0, 80),
			primarySpeakerIds: result.primarySpeakers.map((agent) => agent.id),
			secondaryCandidateIds: result.secondaryCandidates?.map((agent) => agent.id),
			suppressedIds: result.suppressedAgents?.map((agent) => agent.id),
			hold: result.hold,
			rationale: result.rationale,
		})
		return result
	}
}
const defaultConversationOrchestrator = new ConversationOrchestrator()
const createManualHoldState = (initiatedBy = "user") => ({
	mode: "manual_hold",
	initiatedBy,
	reason: initiatedBy === "user" ? "Manual Hold All" : void 0,
	activatedAt: Date.now(),
})
const createIngestHoldState = () => ({
	mode: "ingest_hold",
	initiatedBy: "system",
	reason: "User message in progress",
	activatedAt: Date.now(),
	countdownMs: HOLD_BUFFER_MS,
})
