import { z } from "zod"

export const poolItemStatusValues = ["captured", "processing", "ready", "archived"] as const

export const poolSpeakerValues = ["user", "assistant"] as const

export const poolMessageInputSchema = z.object({
	id: z.string().uuid().optional(),
	sessionId: z.string().min(1),
	role: z.enum(poolSpeakerValues),
	text: z.string().min(1),
	timestamp: z.string().datetime(),
	status: z.enum(poolItemStatusValues).optional(),
	tokens: z.number().int().nonnegative().optional(),
	references: z.array(z.string().min(1)).max(50).optional(),
})

export type PoolMessageInput = z.infer<typeof poolMessageInputSchema>

export const poolMessagesRequestSchema = z.object({
	messages: z.array(poolMessageInputSchema).min(1),
})

export const poolFileInputSchema = z.object({
	id: z.string().uuid().optional(),
	filename: z.string().min(1),
	mimeType: z.string().min(1),
	sizeBytes: z.number().int().nonnegative(),
	hash: z.string().min(1),
	source: z.string().min(1),
	parsedText: z.string().optional(),
	status: z.enum(poolItemStatusValues).optional(),
})

export type PoolFileInput = z.infer<typeof poolFileInputSchema>

export const poolFileRequestSchema = z.object({
	file: poolFileInputSchema,
})

export const poolItemsQuerySchema = z.object({
	status: z.enum(poolItemStatusValues).optional(),
	q: z.string().optional(),
	limit: z.number().int().positive().max(200).optional(),
	cursor: z.string().optional(),
})

export const poolSearchRequestSchema = z.object({
	query: z.string().min(1),
	limit: z.number().int().positive().max(50).optional(),
})

export type PoolSearchRequest = z.infer<typeof poolSearchRequestSchema>

export type PoolItemStatus = (typeof poolItemStatusValues)[number]
export type PoolSpeaker = (typeof poolSpeakerValues)[number]

export type PoolItemKind = "message" | "file"

export interface PoolMessageItem {
	kind: "message"
	id: string
	sessionId: string
	accountId: string
	userId: string
	role: PoolSpeaker
	text: string
	status: PoolItemStatus
	messageTimestamp: string
	createdAt: string
	tokens?: number
	references?: string[]
}

export interface PoolFileItem {
	kind: "file"
	id: string
	accountId: string
	userId: string
	filename: string
	mimeType: string
	sizeBytes: number
	hash: string
	source: string
	status: PoolItemStatus
	createdAt: string
}

export type PoolItem = PoolMessageItem | PoolFileItem

export interface PoolSearchResult extends PoolItem {
	score: number
	matchedText?: string
}

export interface PoolItemsResponse {
	items: PoolItem[]
	hasMore: boolean
	nextCursor?: string
}

export const poolSessionContextSchema = z.object({
	companyId: z.string().min(1).optional(),
	companyName: z.string().min(1).optional(),
})

export type PoolSessionContext = z.infer<typeof poolSessionContextSchema>

export const poolSessionCreateSchema = z.object({
	id: z.string().uuid().optional(),
	companyId: z.string().min(1).optional(),
	companyName: z.string().min(1).optional(),
	firstUserMessage: z.string().optional(),
	initialMessages: z.array(poolMessageInputSchema.partial({ sessionId: true })).optional(),
})

export type PoolSessionInput = z.infer<typeof poolSessionCreateSchema>

export const poolSessionCreateRequestSchema = z.object({
	session: poolSessionCreateSchema,
})

export type PoolSessionCreateRequest = z.infer<typeof poolSessionCreateRequestSchema>

export const poolSessionListQuerySchema = z.object({
	cursor: z.string().optional(),
	limit: z.number().int().positive().max(100).optional(),
})

export type PoolSessionListQuery = z.infer<typeof poolSessionListQuerySchema>

export const poolSessionMessagesRequestSchema = z.object({
	messages: z.array(poolMessageInputSchema.partial({ sessionId: true })).min(1),
	context: poolSessionContextSchema.optional(),
})

export type PoolSessionMessagesRequest = z.infer<typeof poolSessionMessagesRequestSchema>

export interface PoolSessionMessage {
	id: string
	sessionId: string
	accountId: string
	userId: string
	role: PoolSpeaker
	text: string
	timestamp: string
	createdAt: string
	tokens?: number
	references?: string[]
}

export interface PoolSessionSummary {
	id: string
	accountId: string
	userId: string
	companyId?: string
	companyName?: string
	title?: string
	preview?: string
	firstUserMessage?: string
	messageCount: number
	createdAt: string
	updatedAt: string
	lastMessage?: {
		id: string
		role: PoolSpeaker
		text: string
		timestamp: string
		tokens?: number
		references?: string[]
	}
}

export interface PoolSessionListResponse {
	sessions: PoolSessionSummary[]
	hasMore: boolean
	nextCursor?: string
}

export interface PoolSessionMessagesResponse {
	session: PoolSessionSummary
	messages: PoolSessionMessage[]
}

export interface PoolDigestMetadata {
	generatedAt: string
	windowStart: string
	windowEnd: string
	reason: string
	highlightSampleIds: string[]
	highlightCount: number
	fileCount: number
	recentFileIds: string[]
	companyCounts: Record<string, number>
	entityCounts: Record<string, number>
}

export interface PoolDigestPayload {
	accountId: string
	userId: string
	digest: string
	tokenCount: number
	updatedAt: string
	lastActivityAt?: string
	metadata: PoolDigestMetadata
}
