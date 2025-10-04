import { z } from "zod"

export const orchestratorRoutingTierSchema = z.enum(["directed", "topic", "monitor", "rotation"])

export type OrchestratorRoutingTier = z.infer<typeof orchestratorRoutingTierSchema>

export const orchestratorAgentSchema = z.object({
	id: z.string(),
	label: z.string().optional(),
	role: z.string().optional(),
	confidence: z.number().min(0).max(1).optional(),
	tier: orchestratorRoutingTierSchema.optional(),
	reason: z.string().optional(),
})

export type OrchestratorAgent = z.infer<typeof orchestratorAgentSchema>

export const orchestratorSuppressedAgentSchema = z.object({
	id: z.string(),
	label: z.string().optional(),
	reason: z.string(),
	tier: orchestratorRoutingTierSchema.optional(),
})

export type OrchestratorSuppressedAgent = z.infer<typeof orchestratorSuppressedAgentSchema>

export const orchestratorIntentMentionSchema = z.object({
	id: z.string(),
	label: z.string().optional(),
	explicit: z.boolean().optional(),
	text: z.string().optional(),
})

export type OrchestratorIntentMention = z.infer<typeof orchestratorIntentMentionSchema>

export const orchestratorIntentSchema = z.object({
	mentions: z.array(orchestratorIntentMentionSchema).optional(),
	impliedRoles: z.array(z.string()).optional(),
	urgency: z.enum(["low", "normal", "high"]).optional(),
	stopKeywords: z.array(z.string()).optional(),
	topics: z.array(z.string()).optional(),
	exclusiveAgentIds: z.array(z.string()).optional(),
	excludedAgentIds: z.array(z.string()).optional(),
	multiSpeaker: z.boolean().optional(),
	directedAgentIds: z.array(z.string()).optional(),
	respondDirectly: z.boolean().optional(),
	documentCreationBanned: z.boolean().optional(),
})

export type OrchestratorIntent = z.infer<typeof orchestratorIntentSchema>

export const orchestratorHoldModeSchema = z.enum([
	"idle",
	"user_hold",
	"ingest_hold",
	"manual_hold",
	"queued",
	"responding",
])

export type OrchestratorHoldMode = z.infer<typeof orchestratorHoldModeSchema>

export const conversationHoldStateSchema = z.object({
	mode: orchestratorHoldModeSchema,
	initiatedBy: z.enum(["user", "system", "agent"]).optional(),
	reason: z.string().optional(),
	activatedAt: z.number().optional(),
	countdownMs: z.number().optional(),
	resumeEligibleAgentIds: z.array(z.string()).optional(),
})

export type ConversationHoldState = z.infer<typeof conversationHoldStateSchema>

export const orchestratorAnalysisSchema = z.object({
	primarySpeakers: z.array(orchestratorAgentSchema),
	secondaryCandidates: z.array(orchestratorAgentSchema).optional(),
	suppressedAgents: z.array(orchestratorSuppressedAgentSchema).optional(),
	hold: z
		.object({
			mode: orchestratorHoldModeSchema.optional(),
			holdUntil: z.number().optional(),
			reason: z.string().optional(),
			requestedBy: z.enum(["user", "system", "agent"]).optional(),
		})
		.optional(),
	rationale: z.string().optional(),
	intent: orchestratorIntentSchema.optional(),
	loadFactor: z.number().min(0).max(1).optional(),
})

export type OrchestratorAnalysis = z.infer<typeof orchestratorAnalysisSchema>

export const orchestratorTimelineEventSchema = z.object({
	id: z.string(),
	timestamp: z.number(),
	type: z.enum(["analysis", "hold", "resume", "queue_release", "suppressed"]),
	summary: z.string(),
	details: z.string().optional(),
	relatedAgentIds: z.array(z.string()).optional(),
	metadata: z.record(z.unknown()).optional(),
})

export type OrchestratorTimelineEvent = z.infer<typeof orchestratorTimelineEventSchema>

export const conversationAgentSchema = z.object({
	id: z.string(),
	name: z.string(),
	role: z.string().optional(),
	model: z.string().optional(),
	isActive: z.boolean().optional(),
	load: z.number().min(0).max(1).optional(),
})

export type ConversationAgent = z.infer<typeof conversationAgentSchema>

export const orchestratorQueueStateSchema = z.enum(["idle", "queued", "released"])

export type OrchestratorQueueState = z.infer<typeof orchestratorQueueStateSchema>

export const queueReleaseRequestSchema = z.object({
	agentIds: z.array(z.string()).optional(),
	flushAll: z.boolean().optional(),
})

export type QueueReleaseRequest = z.infer<typeof queueReleaseRequestSchema>
