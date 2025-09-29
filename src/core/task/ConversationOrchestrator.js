const MENTION_REGEX = /@([\p{L}\p{N}_\-\.]+)/gu;
const NAME_TOKEN_REGEX = /([\p{L}\p{N}_][\p{L}\p{N}_\-]*)/gu;
const URGENCY_KEYWORDS = ["urgent", "asap", "rush", "immediately", "now"];
const STOP_KEYWORDS = ["stop", "hold", "pause", "halt", "freeze"];
const normalize = (value) => value?.trim().toLowerCase() ?? "";
const buildAgentLookup = (agents) => {
    const byId = new Map();
    const byName = new Map();
    const tokens = new Map();
    agents.forEach((agent) => {
        byId.set(agent.id, agent);
        const normalizedName = normalize(agent.name);
        if (normalizedName) {
            byName.set(normalizedName, agent);
            tokens.set(normalizedName.split(" ")[0] ?? normalizedName, agent);
        }
        const normalizedRole = normalize(agent.role);
        if (normalizedRole) {
            normalizedRole.split(/[,/]/).forEach((segment) => {
                const trimmed = normalize(segment);
                if (trimmed) {
                    tokens.set(trimmed, agent);
                }
            });
        }
    });
    return { byId, byName, tokens };
};
const detectExplicitMentions = (text, agentLookup) => {
    const matches = text.matchAll(MENTION_REGEX);
    const found = [];
    for (const match of matches) {
        const raw = match[1];
        const normalized = normalize(raw);
        if (!normalized) {
            continue;
        }
        const candidate = agentLookup.byName.get(normalized) ?? agentLookup.tokens.get(normalized) ?? undefined;
        if (candidate) {
            found.push({
                id: candidate.id,
                label: candidate.name,
                role: candidate.role,
                confidence: 0.95,
                tier: "directed",
                reason: `Explicit mention of @${candidate.name}`,
            });
        }
    }
    return found;
};
const detectRoleMatches = (text, agents, alreadySelected) => {
    const lowerText = text.toLowerCase();
    const matches = [];
    agents.forEach((agent) => {
        if (alreadySelected.has(agent.id)) {
            return;
        }
        const roleTokens = (agent.role ?? "")
            .split(/[\s,/]+/)
            .map((token) => token.trim().toLowerCase())
            .filter(Boolean);
        if (!roleTokens.length) {
            return;
        }
        const hasMatch = roleTokens.some((token) => lowerText.includes(token));
        if (hasMatch) {
            matches.push({
                id: agent.id,
                label: agent.name,
                role: agent.role,
                confidence: 0.7,
                tier: "topic",
                reason: `Role keyword match (${roleTokens.find((token) => lowerText.includes(token))})`,
            });
        }
    });
    return matches;
};
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
    }));
};
const detectRotationFallback = (agents, selected) => {
    const remaining = agents.filter((agent) => !selected.has(agent.id));
    if (!remaining.length) {
        return undefined;
    }
    const sorted = [...remaining].sort((a, b) => (a.load ?? 0) - (b.load ?? 0));
    const candidate = sorted[0];
    return {
        id: candidate.id,
        label: candidate.name,
        role: candidate.role,
        confidence: 0.45,
        tier: "rotation",
        reason: "Rotation fallback to avoid starvation",
    };
};
const parseIntent = (text, agents, agentLookup) => {
    const lowerText = text.toLowerCase();
    const mentions = [];
    detectExplicitMentions(text, agentLookup).forEach((agent) => {
        mentions?.push({
            id: agent.id,
            label: agent.label,
            explicit: true,
            text: agent.label,
        });
    });
    const impliedRoles = [];
    agents.forEach((agent) => {
        const tokens = (agent.role ?? "")
            .split(/[\s,/]+/)
            .map((token) => token.trim().toLowerCase())
            .filter(Boolean);
        if (tokens.some((token) => lowerText.includes(token))) {
            impliedRoles.push(agent.role ?? agent.name);
        }
    });
    const urgency = URGENCY_KEYWORDS.some((keyword) => lowerText.includes(keyword))
        ? "high"
        : undefined;
    const stopKeywords = STOP_KEYWORDS.filter((keyword) => lowerText.includes(keyword));
    const topics = Array.from(new Set((text.match(NAME_TOKEN_REGEX) ?? []).map((token) => token.toLowerCase()))).slice(0, 5);
    return {
        mentions: mentions?.length ? mentions : undefined,
        impliedRoles: impliedRoles.length ? impliedRoles : undefined,
        urgency,
        stopKeywords: stopKeywords.length ? stopKeywords : undefined,
        topics: topics.length ? topics : undefined,
    };
};
const HOLD_BUFFER_MS = 1800;
const buildSuppressedAgents = (agents, selectedIds) => {
    return agents
        .filter((agent) => !selectedIds.has(agent.id))
        .map((agent) => ({
        id: agent.id,
        label: agent.name,
        reason: "Suppressed to limit overlap",
        tier: undefined,
    }));
};
export class ConversationOrchestrator {
    fairnessCounters = new Map();
    rotationCursor = 0;
    reset() {
        this.fairnessCounters.clear();
        this.rotationCursor = 0;
    }
    registerResponse(agentIds) {
        agentIds.forEach((id) => {
            const current = this.fairnessCounters.get(id) ?? 0;
            this.fairnessCounters.set(id, current + 1);
        });
    }
    analyze({ text, agents, activeAgentId, holdState, timestamp }) {
        const now = timestamp ?? Date.now();
        const agentLookup = buildAgentLookup(agents);
        const intent = parseIntent(text, agents, agentLookup);
        const explicitMentions = detectExplicitMentions(text, agentLookup);
        const selectedIds = new Set(explicitMentions.map((agent) => agent.id));
        const roleMatches = detectRoleMatches(text, agents, selectedIds);
        roleMatches.forEach((agent) => selectedIds.add(agent.id));
        const routedAgents = [...explicitMentions, ...roleMatches];
        if (!routedAgents.length && activeAgentId) {
            const activeAgent = agentLookup.byId.get(activeAgentId);
            if (activeAgent) {
                routedAgents.push({
                    id: activeAgent.id,
                    label: activeAgent.name,
                    role: activeAgent.role,
                    confidence: 0.5,
                    tier: "topic",
                    reason: "Default to active speaker",
                });
                selectedIds.add(activeAgent.id);
            }
        }
        if (!routedAgents.length) {
            const fallback = detectRotationFallback(agents, selectedIds);
            if (fallback) {
                routedAgents.push(fallback);
                selectedIds.add(fallback.id);
            }
        }
        const secondaryCandidates = detectBackgroundMonitors(agents, selectedIds);
        const suppressedAgents = buildSuppressedAgents(agents, selectedIds);
        const loadFactor = Math.min(1, routedAgents.length / Math.max(agents.length, 1) + (secondaryCandidates.length ? 0.15 : 0));
        const shouldHoldForStop = intent.stopKeywords && intent.stopKeywords.length > 0;
        const holdMode = shouldHoldForStop
            ? "manual_hold"
            : holdState?.mode === "manual_hold"
                ? "manual_hold"
                : "ingest_hold";
        const hold = {
            mode: holdMode,
            holdUntil: holdMode === "manual_hold" ? undefined : now + HOLD_BUFFER_MS,
            reason: shouldHoldForStop
                ? `Hold requested via keyword: ${intent.stopKeywords?.[0]}`
                : "Pausing responders while message ingests",
            requestedBy: shouldHoldForStop ? "user" : "system",
        };
        const rationaleSegments = [];
        if (explicitMentions.length) {
            rationaleSegments.push(`Directed mention${explicitMentions.length > 1 ? "s" : ""}: ${explicitMentions
                .map((agent) => agent.label ?? agent.id)
                .join(", ")}`);
        }
        if (roleMatches.length) {
            rationaleSegments.push(`Topic match: ${roleMatches.map((agent) => agent.label ?? agent.id).join(", ")}`);
        }
        if (!explicitMentions.length && !roleMatches.length && routedAgents.length) {
            rationaleSegments.push(`Fallback to ${routedAgents[0]?.label ?? routedAgents[0]?.id}`);
        }
        if (shouldHoldForStop) {
            rationaleSegments.push(`Hold enforced due to "${intent.stopKeywords?.[0]}" keyword`);
        }
        return {
            primarySpeakers: routedAgents,
            secondaryCandidates: secondaryCandidates.length ? secondaryCandidates : undefined,
            suppressedAgents: suppressedAgents.length ? suppressedAgents : undefined,
            hold,
            rationale: rationaleSegments.join(" · "),
            intent,
            loadFactor,
        };
    }
}
export const defaultConversationOrchestrator = new ConversationOrchestrator();
export const createManualHoldState = (initiatedBy = "user") => ({
    mode: "manual_hold",
    initiatedBy,
    reason: initiatedBy === "user" ? "Manual Hold All" : undefined,
    activatedAt: Date.now(),
});
export const createIngestHoldState = () => ({
    mode: "ingest_hold",
    initiatedBy: "system",
    reason: "User message in progress",
    activatedAt: Date.now(),
    countdownMs: HOLD_BUFFER_MS,
});
//# sourceMappingURL=ConversationOrchestrator.js.map