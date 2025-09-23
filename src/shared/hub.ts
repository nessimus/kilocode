import { z } from "zod"

export const hubParticipantKinds = ["user", "agent"] as const

export type HubParticipantKind = (typeof hubParticipantKinds)[number]

const HubPersonaSchema = z.object({
	employeeId: z.string().optional(),
	summary: z.string().optional(),
	instructions: z.string().optional(),
	baseModeSlug: z.string().optional(),
	role: z.string().optional(),
	personality: z.string().optional(),
	mbtiType: z.string().optional(),
	customAttributes: z.record(z.string()).optional(),
})

export type HubPersona = z.infer<typeof HubPersonaSchema>

export const HubFollowUpSuggestionSchema = z.object({
	id: z.string(),
	agentId: z.string(),
	displayName: z.string(),
	prompt: z.string(),
})

export type HubFollowUpSuggestion = z.infer<typeof HubFollowUpSuggestionSchema>

export const HubParticipantSchema = z.object({
	id: z.string(),
	displayName: z.string(),
	type: z.enum(hubParticipantKinds),
	mode: z.string().optional(),
	color: z.string().optional(),
	icon: z.string().optional(),
	persona: HubPersonaSchema.optional(),
})

export type HubParticipant = z.infer<typeof HubParticipantSchema>

export const HubMessageSchema = z.object({
	id: z.string(),
	participantId: z.string(),
	content: z.string(),
	createdAt: z.number(),
	updatedAt: z.number(),
	status: z.enum(["streaming", "final", "error"]),
	error: z.string().optional(),
})

export type HubMessage = z.infer<typeof HubMessageSchema>

export const HubRoomSettingsSchema = z.object({
	autonomous: z.boolean().default(false),
	roundRobin: z.boolean().default(true),
	maxSequentialTurns: z.number().int().min(1).max(12).default(3),
})

export type HubRoomSettings = z.infer<typeof HubRoomSettingsSchema>

export const HubRoomSchema = z.object({
	id: z.string(),
	title: z.string(),
	description: z.string().optional(),
	createdAt: z.number(),
	updatedAt: z.number(),
	messages: HubMessageSchema.array(),
	participants: HubParticipantSchema.array(),
	settings: HubRoomSettingsSchema,
	active: z.boolean().default(false),
	lastSpeakerId: z.string().optional(),
	followUps: HubFollowUpSuggestionSchema.array().optional(),
})

export type HubRoom = z.infer<typeof HubRoomSchema>

export const HubSnapshotSchema = z.object({
	rooms: HubRoomSchema.array(),
	activeRoomId: z.string().optional(),
})

export type HubSnapshot = z.infer<typeof HubSnapshotSchema>

export type HubSettingsUpdate = Partial<HubRoomSettings>

export interface HubCreateRoomOptions {
	title?: string
	description?: string
	participants?: Array<Pick<HubParticipant, "displayName" | "mode">>
	autonomous?: boolean
}

export interface HubAgentBlueprint {
	displayName: string
	mode?: string
	persona?: HubPersona
}

export interface HubSendMessagePayload {
	roomId: string
	text: string
}

export interface HubAddAgentPayload {
	roomId: string
	agent: HubAgentBlueprint
}

export interface HubRemoveParticipantPayload {
	roomId: string
	participantId: string
}

export interface HubUpdateSettingsPayload {
	roomId: string
	settings: HubSettingsUpdate
}
