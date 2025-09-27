import { randomUUID } from "node:crypto"

import { and, asc, desc, eq, gt, ilike, lt, or, sql } from "drizzle-orm"

import type { PoolDatabase } from "../db/client.js"
import { poolFiles, poolMessages, poolSessions } from "../db/schema.js"
import {
	type PoolAnalysisItem,
	type PoolAnalysisResponse,
	type PoolFileItem,
	type PoolFileInput,
	type PoolItem,
	type PoolItemsResponse,
	type PoolMessageInput,
	type PoolSessionContext,
	type PoolSessionInput,
	type PoolSessionListQuery,
	type PoolSessionListResponse,
	type PoolSessionMessage,
	type PoolSessionMessagesRequest,
	type PoolSessionMessagesResponse,
	type PoolSessionSummary,
	type PoolSearchResult,
	poolItemStatusValues,
} from "../types.js"
import { cosineSimilarity, generateDeterministicEmbedding } from "./embedding.js"

const DEFAULT_QUERY_LIMIT = 50
const SEARCH_LIMIT = 20
const EMBEDDING_DIMENSION = 64
const SESSION_LIST_DEFAULT_LIMIT = 12
const SESSION_LIST_MAX_LIMIT = 100
const SESSION_TITLE_LIMIT = 80
const SESSION_PREVIEW_LIMIT = 180
const ANALYSIS_QUERY_MAX = 500

export class PoolRepository {
	constructor(private readonly db: PoolDatabase) {}

	async insertMessages(accountId: string, userId: string, inputs: PoolMessageInput[]) {
		if (!inputs.length) {
			return []
		}

		const records = inputs.map((message) => {
			const embeddingVector = generateDeterministicEmbedding(message.text, {
				dimension: EMBEDDING_DIMENSION,
			})

			return {
				id: message.id ?? randomUUID(),
				accountId,
				userId,
				sessionId: message.sessionId,
				role: message.role,
				content: message.text,
				messageTimestamp: message.timestamp,
				itemStatus: message.status ?? "captured",
				embedding: JSON.stringify(embeddingVector),
				tokenCount: message.tokens ?? null,
				itemReferences: message.references ?? null,
			}
		})

		const inserted = await this.db.insert(poolMessages).values(records).returning()
		return inserted
	}

	async insertFile(accountId: string, userId: string, input: PoolFileInput) {
		const embedding = input.parsedText
			? JSON.stringify(generateDeterministicEmbedding(input.parsedText, { dimension: EMBEDDING_DIMENSION }))
			: null

		const record = {
			id: input.id ?? randomUUID(),
			accountId,
			userId,
			filename: input.filename,
			mimeType: input.mimeType,
			sizeBytes: input.sizeBytes,
			hash: input.hash,
			source: input.source,
			parsedText: input.parsedText ?? null,
			itemStatus: input.status ?? "captured",
			embedding,
		}

		await this.db
			.insert(poolFiles)
			.values(record)
			.onConflictDoNothing({
				target: [poolFiles.accountId, poolFiles.hash],
			})

		return record
	}

	async createSession(
		accountId: string,
		userId: string,
		input: PoolSessionInput,
	): Promise<PoolSessionMessagesResponse> {
		const sessionId = input.id ?? randomUUID()

		await this.db.insert(poolSessions).values({
			id: sessionId,
			accountId,
			userId,
			companyId: input.companyId ?? null,
			companyName: input.companyName ?? null,
			firstUserMessage: input.firstUserMessage ?? null,
			title: buildSessionTitle(input.firstUserMessage, input.companyName),
			preview: buildSessionPreview(undefined, input.firstUserMessage),
			lastMessageText: null,
			messageCount: 0,
		})

		const initialMessages: PoolMessageInput[] = (input.initialMessages ?? []).map((message) => ({
			...message,
			id: message.id ?? randomUUID(),
			sessionId: message.sessionId ?? sessionId,
		}))

		let insertedRows: (typeof poolMessages.$inferSelect)[] = []
		if (initialMessages.length) {
			insertedRows = await this.insertMessages(accountId, userId, initialMessages)
		}

		const summary = await this.refreshSessionMetadata(accountId, sessionId, {
			companyId: input.companyId,
			companyName: input.companyName,
		})

		const messages = insertedRows.length
			? insertedRows.map(mapMessageRowToSessionMessage)
			: await this.fetchSessionMessages(accountId, sessionId)

		return { session: summary, messages }
	}

	async appendSessionMessages(
		accountId: string,
		userId: string,
		sessionId: string,
		request: PoolSessionMessagesRequest,
	): Promise<PoolSessionMessagesResponse> {
		await this.getSessionRow(accountId, sessionId)

		const normalizedMessages: PoolMessageInput[] = request.messages.map((message) => ({
			...message,
			id: message.id ?? randomUUID(),
			sessionId: message.sessionId ?? sessionId,
		}))

		const insertedRows = await this.insertMessages(accountId, userId, normalizedMessages)

		const summary = await this.refreshSessionMetadata(accountId, sessionId, request.context)

		return {
			session: summary,
			messages: insertedRows.map(mapMessageRowToSessionMessage),
		}
	}

	async getSessionMessages(accountId: string, sessionId: string): Promise<PoolSessionMessagesResponse> {
		const sessionRow = await this.getSessionRow(accountId, sessionId)
		const messages = await this.fetchSessionMessages(accountId, sessionId)
		return { session: toSessionSummary(sessionRow), messages }
	}

	async listSessions(accountId: string, query: PoolSessionListQuery = {}): Promise<PoolSessionListResponse> {
		const rawLimit = query.limit ?? SESSION_LIST_DEFAULT_LIMIT
		const limit = Math.min(Math.max(rawLimit, 1), SESSION_LIST_MAX_LIMIT)
		const cursor = query.cursor ? decodeSessionCursor(query.cursor) : undefined

		const conditions = [eq(poolSessions.accountId, accountId)]
		if (cursor) {
			const referenceDate = new Date(cursor.updatedAt)
			conditions.push(
				or(
					lt(poolSessions.updatedAt, referenceDate),
					and(eq(poolSessions.updatedAt, referenceDate), lt(poolSessions.id, cursor.id)),
				),
			)
		}

		const rows = await this.db
			.select()
			.from(poolSessions)
			.where(and(...conditions))
			.orderBy(desc(poolSessions.updatedAt), desc(poolSessions.id))
			.limit(limit + 1)

		const hasMore = rows.length > limit
		const visible = rows.slice(0, limit)

		const sessions = visible.map(toSessionSummary)
		const nextCursor = hasMore ? encodeSessionCursor(rows[limit]) : undefined

		return { sessions, hasMore, nextCursor }
	}

	private async getSessionRow(accountId: string, sessionId: string) {
		const [row] = await this.db
			.select()
			.from(poolSessions)
			.where(and(eq(poolSessions.accountId, accountId), eq(poolSessions.id, sessionId)))
			.limit(1)

		if (!row) {
			throw new Error(`Session with id ${sessionId} not found for account ${accountId}`)
		}

		return row
	}

	private async refreshSessionMetadata(
		accountId: string,
		sessionId: string,
		context?: PoolSessionContext,
	): Promise<PoolSessionSummary> {
		const sessionRow = await this.getSessionRow(accountId, sessionId)

		const [{ value: rawCount }] = await this.db
			.select({ value: sql<number>`count(*)` })
			.from(poolMessages)
			.where(and(eq(poolMessages.accountId, accountId), eq(poolMessages.sessionId, sessionId)))

		const messageCount = Number(rawCount ?? 0)

		const [firstUserRow] = await this.db
			.select({
				content: poolMessages.content,
			})
			.from(poolMessages)
			.where(
				and(
					eq(poolMessages.accountId, accountId),
					eq(poolMessages.sessionId, sessionId),
					eq(poolMessages.role, "user"),
				),
			)
			.orderBy(asc(poolMessages.messageTimestamp), asc(poolMessages.createdAt))
			.limit(1)

		const [lastMessageRow] = await this.db
			.select({
				id: poolMessages.id,
				role: poolMessages.role,
				content: poolMessages.content,
				messageTimestamp: poolMessages.messageTimestamp,
				tokenCount: poolMessages.tokenCount,
				itemReferences: poolMessages.itemReferences,
			})
			.from(poolMessages)
			.where(and(eq(poolMessages.accountId, accountId), eq(poolMessages.sessionId, sessionId)))
			.orderBy(desc(poolMessages.messageTimestamp), desc(poolMessages.createdAt))
			.limit(1)

		const companyId = context?.companyId ?? sessionRow.companyId ?? null
		const companyName = context?.companyName ?? sessionRow.companyName ?? null
		const firstUserMessage = firstUserRow?.content ?? sessionRow.firstUserMessage ?? null
		const lastMessageText = lastMessageRow?.content ?? null
		const updatedAt = lastMessageRow?.messageTimestamp
			? new Date(lastMessageRow.messageTimestamp)
			: sessionRow.updatedAt

		const [updatedRow] = await this.db
			.update(poolSessions)
			.set({
				companyId,
				companyName,
				firstUserMessage: firstUserMessage ?? null,
				title: buildSessionTitle(firstUserMessage, companyName) ?? null,
				preview: buildSessionPreview(lastMessageText, firstUserMessage) ?? null,
				lastMessageText: lastMessageText ?? null,
				lastMessageId: lastMessageRow?.id ?? null,
				lastMessageRole: lastMessageRow?.role ?? null,
				lastMessageTimestamp: lastMessageRow?.messageTimestamp ?? null,
				lastMessageTokens: lastMessageRow?.tokenCount ?? null,
				lastMessageReferences: lastMessageRow?.itemReferences ?? null,
				messageCount,
				updatedAt: updatedAt ? new Date(updatedAt) : sessionRow.updatedAt,
			})
			.where(and(eq(poolSessions.accountId, accountId), eq(poolSessions.id, sessionId)))
			.returning()

		if (!updatedRow) {
			throw new Error(`Failed to refresh session ${sessionId}`)
		}

		return toSessionSummary(updatedRow)
	}

	private async fetchSessionMessages(accountId: string, sessionId: string): Promise<PoolSessionMessage[]> {
		const rows = await this.db
			.select()
			.from(poolMessages)
			.where(and(eq(poolMessages.accountId, accountId), eq(poolMessages.sessionId, sessionId)))
			.orderBy(asc(poolMessages.messageTimestamp), asc(poolMessages.createdAt))

		return rows.map(mapMessageRowToSessionMessage)
	}

	async listItems(
		accountId: string,
		options: {
			status?: (typeof poolItemStatusValues)[number]
			q?: string
			limit?: number
			cursor?: string
		} = {},
	): Promise<PoolItemsResponse> {
		const limit = options.limit ?? DEFAULT_QUERY_LIMIT
		const cursorDate = options.cursor ? new Date(options.cursor) : undefined

		const messageConditions = [eq(poolMessages.accountId, accountId)]
		if (options.status) {
			messageConditions.push(eq(poolMessages.itemStatus, options.status))
		}
		if (options.q) {
			messageConditions.push(ilike(poolMessages.content, `%${options.q}%`))
		}
		if (cursorDate) {
			messageConditions.push(lt(poolMessages.createdAt, cursorDate))
		}

		const fileConditions = [eq(poolFiles.accountId, accountId)]
		if (options.status) {
			fileConditions.push(eq(poolFiles.itemStatus, options.status))
		}
		if (options.q) {
			fileConditions.push(
				or(ilike(poolFiles.filename, `%${options.q}%`), ilike(poolFiles.parsedText, `%${options.q}%`)),
			)
		}
		if (cursorDate) {
			fileConditions.push(lt(poolFiles.createdAt, cursorDate))
		}

		const pageSize = limit + 1

		const [messageRows, fileRows] = await Promise.all([
			this.db
				.select()
				.from(poolMessages)
				.where(and(...messageConditions))
				.orderBy(desc(poolMessages.createdAt))
				.limit(pageSize),
			this.db
				.select()
				.from(poolFiles)
				.where(and(...fileConditions))
				.orderBy(desc(poolFiles.createdAt))
				.limit(pageSize),
		])

		const combined: PoolItem[] = [
			...messageRows.map((row) => ({
				kind: "message" as const,
				id: row.id,
				sessionId: row.sessionId,
				accountId: row.accountId,
				userId: row.userId,
				role: row.role,
				text: row.content,
				status: row.itemStatus,
				messageTimestamp: asIso(row.messageTimestamp),
				createdAt: asIso(row.createdAt),
				tokens: row.tokenCount ?? undefined,
				references: row.itemReferences ?? undefined,
			})),
			...fileRows.map(mapFileRowToItem),
		]

		combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

		const items = combined.slice(0, limit)
		const hasMore = combined.length > limit
		const nextCursor = hasMore ? items.at(-1)?.createdAt : undefined

		return { items, hasMore, nextCursor }
	}

	async search(accountId: string, query: string, options: { limit?: number } = {}): Promise<PoolSearchResult[]> {
		const limit = options.limit ?? SEARCH_LIMIT
		const embedding = generateDeterministicEmbedding(query, { dimension: EMBEDDING_DIMENSION })

		const [messageRows, fileRows] = await Promise.all([
			this.db.select().from(poolMessages).where(eq(poolMessages.accountId, accountId)),
			this.db.select().from(poolFiles).where(eq(poolFiles.accountId, accountId)),
		])

		const scoredMessages: PoolSearchResult[] = messageRows.map((row) => ({
			kind: "message" as const,
			id: row.id,
			sessionId: row.sessionId,
			accountId: row.accountId,
			userId: row.userId,
			role: row.role,
			text: row.content,
			status: row.itemStatus,
			messageTimestamp: asIso(row.messageTimestamp),
			createdAt: asIso(row.createdAt),
			tokens: row.tokenCount ?? undefined,
			references: row.itemReferences ?? undefined,
			score: row.embedding ? cosineSimilarity(embedding, parseEmbedding(row.embedding)) : 0,
			matchedText: row.content,
		}))

		const scoredFiles: PoolSearchResult[] = fileRows.map((row) => ({
			...mapFileRowToItem(row),
			score: row.embedding ? cosineSimilarity(embedding, parseEmbedding(row.embedding)) : 0,
			matchedText: row.parsedText ?? row.filename,
		}))

		const combined = [...scoredMessages, ...scoredFiles]
			.filter((item) => item.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, limit)

		return combined
	}

	async listAnalysisItems(
		accountId: string,
		options: {
			limit?: number
			status?: (typeof poolItemStatusValues)[number]
			since?: Date
			includeFiles?: boolean
			includeMessages?: boolean
		} = {},
	): Promise<PoolAnalysisResponse> {
		const limit = Math.min(Math.max(options.limit ?? 200, 1), ANALYSIS_QUERY_MAX)
		const includeMessages = options.includeMessages !== false
		const includeFiles = options.includeFiles !== false

		const sinceDate = options.since ? new Date(options.since) : undefined

		const [messageRows, fileRows] = await Promise.all([
			includeMessages
				? this.db
						.select()
						.from(poolMessages)
						.where(
							and(
								eq(poolMessages.accountId, accountId),
								...(options.status ? [eq(poolMessages.itemStatus, options.status)] : []),
								...(sinceDate ? [gt(poolMessages.createdAt, sinceDate)] : []),
							),
						)
						.orderBy(desc(poolMessages.createdAt))
						.limit(limit * 2)
				: [],
			includeFiles
				? this.db
						.select()
						.from(poolFiles)
						.where(
							and(
								eq(poolFiles.accountId, accountId),
								...(options.status ? [eq(poolFiles.itemStatus, options.status)] : []),
								...(sinceDate ? [gt(poolFiles.createdAt, sinceDate)] : []),
							),
						)
						.orderBy(desc(poolFiles.createdAt))
						.limit(limit * 2)
				: [],
		])

		const mappedMessages: PoolAnalysisItem[] = messageRows
			.map((row) => {
				const embedding = parseEmbedding(row.embedding)
				if (!embedding.length) {
					return undefined
				}
				return {
					id: row.id,
					kind: "message" as const,
					status: row.itemStatus,
					accountId: row.accountId,
					userId: row.userId,
					createdAt: asIso(row.createdAt),
					embedding,
					text: row.content,
					sessionId: row.sessionId ?? undefined,
					messageTimestamp: asIso(row.messageTimestamp),
					tokens: row.tokenCount ?? undefined,
					references: row.itemReferences ?? undefined,
				}
			})
			.filter((item): item is PoolAnalysisItem => Boolean(item))

		const mappedFiles: PoolAnalysisItem[] = fileRows
			.map((row) => {
				const embedding = parseEmbedding(row.embedding)
				if (!embedding.length) {
					return undefined
				}
				const textContent = row.parsedText?.trim()
				return {
					id: row.id,
					kind: "file" as const,
					status: row.itemStatus,
					accountId: row.accountId,
					userId: row.userId,
					createdAt: asIso(row.createdAt),
					embedding,
					text: textContent && textContent.length > 0 ? textContent : row.filename ?? "",
					filename: row.filename,
					mimeType: row.mimeType ?? undefined,
					sizeBytes: row.sizeBytes ?? undefined,
					source: row.source ?? undefined,
				}
			})
			.filter((item): item is PoolAnalysisItem => Boolean(item))

		const combined = [...mappedMessages, ...mappedFiles]
		combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

		const items = combined.slice(0, limit)

		return {
			items,
			totalItems: combined.length,
			embeddingDimension: EMBEDDING_DIMENSION,
			generatedAt: new Date().toISOString(),
		}
	}
}

function mapMessageRowToSessionMessage(row: typeof poolMessages.$inferSelect): PoolSessionMessage {
	return {
		id: row.id,
		sessionId: row.sessionId,
		accountId: row.accountId,
		userId: row.userId,
		role: row.role,
		text: row.content,
		timestamp: asIso(row.messageTimestamp),
		createdAt: asIso(row.createdAt),
		tokens: row.tokenCount ?? undefined,
		references: row.itemReferences ?? undefined,
	}
}

function toSessionSummary(row: typeof poolSessions.$inferSelect): PoolSessionSummary {
	const lastMessage = row.lastMessageId
		? {
				id: row.lastMessageId,
				role: row.lastMessageRole ?? "assistant",
				text: row.lastMessageText ?? row.preview ?? "",
				timestamp: asIso(row.lastMessageTimestamp ?? row.updatedAt),
				tokens: row.lastMessageTokens ?? undefined,
				references: row.lastMessageReferences ?? undefined,
			}
		: undefined

	return {
		id: row.id,
		accountId: row.accountId,
		userId: row.userId,
		companyId: row.companyId ?? undefined,
		companyName: row.companyName ?? undefined,
		title: row.title ?? undefined,
		preview: row.preview ?? undefined,
		firstUserMessage: row.firstUserMessage ?? undefined,
		messageCount: row.messageCount ?? 0,
		createdAt: asIso(row.createdAt),
		updatedAt: asIso(row.updatedAt),
		lastMessage,
	}
}

function buildSessionTitle(firstUserMessage?: string | null, companyName?: string | null) {
	const primary = sanitizeText(firstUserMessage)
	if (primary) {
		return truncateText(primary, SESSION_TITLE_LIMIT)
	}
	const fallback = sanitizeText(companyName)
	return fallback ? truncateText(fallback, SESSION_TITLE_LIMIT) : undefined
}

function buildSessionPreview(lastMessageText?: string | null, firstUserMessage?: string | null) {
	const primary = sanitizeText(lastMessageText) ?? sanitizeText(firstUserMessage)
	return primary ? truncateText(primary, SESSION_PREVIEW_LIMIT) : undefined
}

function sanitizeText(value?: string | null) {
	if (!value) {
		return undefined
	}
	const trimmed = value.trim()
	return trimmed.length > 0 ? trimmed : undefined
}

function truncateText(value: string, limit: number) {
	if (value.length <= limit) {
		return value
	}
	return `${value.slice(0, limit - 1)}…`
}

function decodeSessionCursor(cursor: string) {
	const [iso, id] = cursor.split("::", 2)
	if (!iso || !id) {
		return undefined
	}
	if (Number.isNaN(Date.parse(iso))) {
		return undefined
	}
	return { updatedAt: iso, id }
}

function encodeSessionCursor(row: typeof poolSessions.$inferSelect) {
	return `${asIso(row.updatedAt)}::${row.id}`
}

function mapFileRowToItem(row: typeof poolFiles.$inferSelect): PoolFileItem {
	return {
		kind: "file",
		id: row.id,
		accountId: row.accountId,
		userId: row.userId,
		filename: row.filename,
		mimeType: row.mimeType,
		sizeBytes: row.sizeBytes,
		hash: row.hash,
		source: row.source ?? "unknown",
		status: row.itemStatus,
		createdAt: asIso(row.createdAt),
	}
}

function parseEmbedding(raw: string | null): number[] {
	if (!raw) {
		return []
	}

	try {
		const parsed = JSON.parse(raw)
		if (Array.isArray(parsed)) {
			return parsed.map((value) => (typeof value === "number" ? value : Number(value)))
		}
	} catch (error) {
		console.warn("[PoolRepository] Failed to parse embedding", error)
	}

	return []
}

function asIso(value: Date | string | null): string {
	if (!value) {
		return new Date().toISOString()
	}
	if (typeof (value as any).toISOString === "function") {
		try {
			return (value as any).toISOString()
		} catch (error) {
			console.warn("[PoolRepository] toISOString failed", value, error)
		}
	}
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) {
			console.warn("[PoolRepository] Received invalid Date", value)
			return new Date().toISOString()
		}
		return value.toISOString()
	}
	const parsed = Date.parse(value)
	if (!Number.isNaN(parsed)) {
		return new Date(parsed).toISOString()
	}
	const fallback = new Date(value)
	if (Number.isNaN(fallback.getTime())) {
		console.warn("[PoolRepository] Unexpected timestamp value", value)
		return new Date().toISOString()
	}
	return fallback.toISOString()
}
