import { describe, it, expect, beforeEach } from "vitest"

import { ConversationOrchestrator } from "../ConversationOrchestrator"
import type { ConversationAgent, ConversationHoldState } from "@roo-code/types"

const buildAgents = (): ConversationAgent[] => [
	{ id: "alex", name: "Alex", role: "Solutions Architect" },
	{ id: "bianca", name: "Bianca", role: "Finance Analyst" },
	{ id: "cory", name: "Cory", role: "Support Lead" },
]

describe("ConversationOrchestrator", () => {
	let orchestrator: ConversationOrchestrator
	let agents: ConversationAgent[]

	beforeEach(() => {
		orchestrator = new ConversationOrchestrator()
		agents = buildAgents()
	})

	it("prioritizes explicitly mentioned agents", () => {
		const analysis = orchestrator.analyze({
			text: "@Alex could you review the integration plan?",
			agents,
		})

		expect(analysis.primarySpeakers?.[0]?.id).toBe("alex")
		expect(analysis.primarySpeakers?.[0]?.tier).toBe("directed")
		expect(analysis.hold?.mode).toBe("ingest_hold")
	})

	it("falls back to role matching when there are no explicit mentions", () => {
		const analysis = orchestrator.analyze({
			text: "Need a financial forecast update before Monday",
			agents,
		})

		expect(analysis.primarySpeakers?.some((agent) => agent.id === "bianca")).toBe(true)
		expect(analysis.intent?.multiSpeaker).toBe(true)
	})

	it("detects stop keywords and enforces manual hold", () => {
		const holdState: ConversationHoldState | undefined = undefined
		const analysis = orchestrator.analyze({
			text: "Hold all responses until I say go",
			agents,
			holdState,
		})

		expect(analysis.hold?.mode).toBe("manual_hold")
		expect(analysis.hold?.reason).toContain("Hold requested")
	})

	it("broadcasts to every agent when requested", () => {
		const analysis = orchestrator.analyze({
			text: "Everyone please respond with a quick update",
			agents,
		})

		expect(new Set(analysis.primarySpeakers?.map((agent) => agent.id))).toEqual(new Set(["alex", "bianca", "cory"]))
		expect(analysis.intent?.multiSpeaker).toBe(true)
		expect(analysis.hold?.mode).toBe("ingest_hold")
	})

	it("prioritizes explicitly named employees while keeping the group", () => {
		const analysis = orchestrator.analyze({
			text: "Alex and Bianca, please give me a quick update.",
			agents,
		})

		expect(new Set(analysis.primarySpeakers?.map((agent) => agent.id))).toEqual(new Set(["alex", "bianca", "cory"]))
		expect(analysis.primarySpeakers?.slice(0, 2).map((agent) => agent.id)).toEqual(["alex", "bianca"])
		expect(analysis.intent?.multiSpeaker).toBe(true)
		expect(new Set(analysis.intent?.directedAgentIds)).toEqual(new Set(["alex", "bianca"]))
		expect(analysis.rationale).toContain("Mentions acknowledged: Alex, Bianca")
	})

	it("honors document blocking directives without suppressing other speakers", () => {
		const analysis = orchestrator.analyze({
			text: "Please, no one write any documents to do the introduction just speak directly in chat.",
			agents,
			activeAgentId: "alex",
		})

		expect(new Set(analysis.primarySpeakers?.map((agent) => agent.id))).toEqual(new Set(["alex", "bianca", "cory"]))
		expect(analysis.primarySpeakers?.[0]?.id).toBe("alex")
		expect(analysis.intent?.multiSpeaker).toBe(true)
		expect(analysis.intent?.documentCreationBanned).toBe(true)
		expect(analysis.intent?.respondDirectly).toBe(true)
		expect(analysis.rationale).toContain("Document-writing blocked per user directive")
	})

	it("still routes all named participants even when document creation is banned", () => {
		const analysis = orchestrator.analyze({
			text: "Please, no one write any documents to do the introduction just speak directly in chat. Alex introduce yourself first, then Bianca then Cory.",
			agents,
		})

		expect(new Set(analysis.primarySpeakers?.map((agent) => agent.id))).toEqual(new Set(["alex", "bianca", "cory"]))
		expect(analysis.intent?.multiSpeaker).toBe(true)
		expect(analysis.intent?.documentCreationBanned).toBe(true)
		expect(analysis.intent?.respondDirectly).toBe(true)
		expect(new Set(analysis.intent?.directedAgentIds)).toEqual(new Set(["alex", "bianca", "cory"]))
	})

	it("still routes every participant when asked to respond directly", () => {
		const analysis = orchestrator.analyze({
			text: "Just speak directly to me about this, please.",
			agents,
		})

		expect(new Set(analysis.primarySpeakers?.map((agent) => agent.id))).toEqual(new Set(["alex", "bianca", "cory"]))
		expect(analysis.intent?.multiSpeaker).toBe(true)
		expect(analysis.intent?.respondDirectly).toBe(true)
		expect(analysis.rationale).toContain("User requested direct single-speaker response")
	})

	it("can still honor explicit single-speaker directives", () => {
		const analysis = orchestrator.analyze({
			text: "Only Alex should respond to this update.",
			agents,
		})

		expect(analysis.primarySpeakers?.map((agent) => agent.id)).toEqual(["alex"])
		expect(analysis.intent?.multiSpeaker).toBe(false)
		expect(analysis.intent?.exclusiveAgentIds).toEqual(["alex"])
		expect(analysis.rationale).toContain("Exclusive request: Alex")
	})
})
