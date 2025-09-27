import { describe, expect, beforeEach, it } from "vitest"
import request from "supertest"

import { createPoolServer } from "../http/server.js"
import type {
	PoolAnalysisItem,
	PoolAnalysisResponse,
	PoolDigestMetadata,
	PoolDigestPayload,
	PoolFileInput,
	PoolItemsResponse,
	PoolMessageInput,
	PoolSearchResult,
	PoolSessionInput,
	PoolSessionListQuery,
	PoolSessionListResponse,
	PoolSessionMessage,
	PoolSessionMessagesRequest,
	PoolSessionMessagesResponse,
	PoolSessionSummary,
} from "../types.js"

interface FakeSessionRecord {
	id: string
	accountId: string
	userId: string
	companyId?: string
	companyName?: string
	messages: PoolSessionMessage[]
	firstUserMessage?: string
	createdAt: string
	updatedAt: string
}

class FakePoolRepository {
	private messages: Array<PoolMessageInput & { accountId: string; userId: string }> = []
	private files: Array<PoolFileInput & { accountId: string; userId: string; createdAt: string }> = []
	private sessions: Map<string, FakeSessionRecord> = new Map()
	private analysisItems: PoolAnalysisItem[] = []

	async insertMessages(accountId: string, userId: string, messages: PoolMessageInput[]) {
		this.messages.push(...messages.map((message) => ({ ...message, accountId, userId })))
		return []
	}

	async insertFile(accountId: string, userId: string, file: PoolFileInput) {
		this.files.push({ ...file, accountId, userId, createdAt: new Date().toISOString() })
		return { id: file.id ?? "file_id" }
	}

	async createSession(
		accountId: string,
		userId: string,
		input: PoolSessionInput,
	): Promise<PoolSessionMessagesResponse> {
		const sessionId = input.id ?? `sess-${Math.random().toString(36).slice(2)}`
		const now = new Date().toISOString()

		const messages: PoolSessionMessage[] = (input.initialMessages ?? []).map((message) => ({
			id: message.id ?? `msg-${Math.random().toString(36).slice(2)}`,
			sessionId,
			accountId,
			userId,
			role: message.role,
			text: message.text,
			timestamp: message.timestamp,
			createdAt: message.timestamp,
			tokens: message.tokens,
			references: message.references,
		}))

		const firstUserMessage = messages.find((message) => message.role === "user")?.text ?? input.firstUserMessage
		const lastMessage = messages.at(-1)

		this.sessions.set(sessionId, {
			id: sessionId,
			accountId,
			userId,
			companyId: input.companyId,
			companyName: input.companyName,
			messages,
			firstUserMessage: firstUserMessage ?? undefined,
			createdAt: now,
			updatedAt: lastMessage?.timestamp ?? now,
		})

		return {
			session: this.buildSessionSummary(sessionId)!,
			messages,
		}
	}

	async appendSessionMessages(
		accountId: string,
		userId: string,
		sessionId: string,
		request: PoolSessionMessagesRequest,
	): Promise<PoolSessionMessagesResponse> {
		const session = this.sessions.get(sessionId)
		if (!session || session.accountId !== accountId) {
			throw new Error("Session not found")
		}

		if (request.context?.companyId) {
			session.companyId = request.context.companyId
		}
		if (request.context?.companyName) {
			session.companyName = request.context.companyName
		}

		const appended: PoolSessionMessage[] = request.messages.map((message) => ({
			id: message.id ?? `msg-${Math.random().toString(36).slice(2)}`,
			sessionId,
			accountId,
			userId,
			role: message.role,
			text: message.text,
			timestamp: message.timestamp,
			createdAt: message.timestamp,
			tokens: message.tokens,
			references: message.references,
		}))

		session.messages.push(...appended)
		if (!session.firstUserMessage) {
			const firstUser = session.messages.find((message) => message.role === "user")
			if (firstUser) {
				session.firstUserMessage = firstUser.text
			}
		}
		const lastMessage = session.messages.at(-1)
		if (lastMessage) {
			session.updatedAt = lastMessage.timestamp
		}

		return {
			session: this.buildSessionSummary(sessionId)!,
			messages: appended,
		}
	}

	async getSessionMessages(accountId: string, sessionId: string): Promise<PoolSessionMessagesResponse> {
		const session = this.sessions.get(sessionId)
		if (!session || session.accountId !== accountId) {
			throw new Error("Session not found")
		}
		return {
			session: this.buildSessionSummary(sessionId)!,
			messages: [...session.messages],
		}
	}

	async listSessions(accountId: string, query: PoolSessionListQuery = {}): Promise<PoolSessionListResponse> {
		const limit = Math.min(Math.max(query.limit ?? 12, 1), 50)
		const filtered = [...this.sessions.values()].filter((session) => session.accountId === accountId)
		filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

		const startIndex = query.cursor ? filtered.findIndex((session) => session.updatedAt === query.cursor) : -1
		const slice = filtered.slice(startIndex + 1, startIndex + 1 + limit + 1)

		const hasMore = slice.length > limit
		const visible = slice.slice(0, limit)

		return {
			sessions: visible.map((session) => this.buildSessionSummary(session.id)!),
			hasMore,
			nextCursor: hasMore ? slice[limit].updatedAt : undefined,
		}
	}

	private buildSessionSummary(sessionId: string): PoolSessionSummary | undefined {
		const session = this.sessions.get(sessionId)
		if (!session) {
			return undefined
		}

		const lastMessage = session.messages.at(-1)
		const firstUserMessage = session.firstUserMessage?.trim()
		return {
			id: session.id,
			accountId: session.accountId,
			userId: session.userId,
			companyId: session.companyId,
			companyName: session.companyName,
			title: firstUserMessage || "Untitled Chat",
			preview: lastMessage?.text ?? session.firstUserMessage ?? "No messages yet.",
			firstUserMessage: session.firstUserMessage,
			messageCount: session.messages.length,
			createdAt: session.createdAt,
			updatedAt: session.updatedAt,
			lastMessage: lastMessage
				? {
						id: lastMessage.id,
						role: lastMessage.role,
						text: lastMessage.text,
						timestamp: lastMessage.timestamp,
						tokens: lastMessage.tokens,
						references: lastMessage.references,
					}
				: undefined,
		}
	}

	async listItems(accountId: string, _options?: Record<string, unknown>): Promise<PoolItemsResponse> {
		const messageItems = this.messages
			.filter((message) => message.accountId === accountId)
			.map((message) => ({
				kind: "message" as const,
				id: message.id ?? "msg",
				sessionId: message.sessionId,
				accountId: message.accountId,
				userId: message.userId,
				role: message.role,
				text: message.text,
				status: message.status ?? "captured",
				messageTimestamp: message.timestamp,
				createdAt: message.timestamp,
			}))

		const fileItems = this.files
			.filter((file) => file.accountId === accountId)
			.map((file) => ({
				kind: "file" as const,
				id: file.id ?? "file",
				accountId: file.accountId,
				userId: file.userId,
				filename: file.filename,
				mimeType: file.mimeType,
				sizeBytes: file.sizeBytes,
				hash: file.hash,
				source: file.source,
				status: file.status ?? "captured",
				createdAt: file.createdAt,
			}))

		return {
			items: [...messageItems, ...fileItems],
			hasMore: false,
		}
	}

	async search(accountId: string, query: string): Promise<PoolSearchResult[]> {
		const matches: PoolSearchResult[] = []

		for (const message of this.messages) {
			if (message.accountId === accountId && message.text.toLowerCase().includes(query.toLowerCase())) {
				matches.push({
					kind: "message",
					id: message.id ?? "msg",
					sessionId: message.sessionId,
					accountId: message.accountId,
					userId: message.userId,
					role: message.role,
					text: message.text,
					status: message.status ?? "captured",
					messageTimestamp: message.timestamp,
					createdAt: message.timestamp,
					score: 0.9,
					matchedText: message.text,
				})
			}
		}

		for (const file of this.files) {
			if (
				file.accountId === accountId &&
				(file.parsedText?.toLowerCase().includes(query.toLowerCase()) ||
					file.filename.toLowerCase().includes(query.toLowerCase()))
			) {
				matches.push({
					kind: "file",
					id: file.id ?? "file",
					accountId: file.accountId,
					userId: file.userId,
					filename: file.filename,
					mimeType: file.mimeType,
					sizeBytes: file.sizeBytes,
					hash: file.hash,
					source: file.source,
					status: file.status ?? "captured",
					createdAt: file.createdAt,
					score: 0.8,
					matchedText: file.parsedText ?? file.filename,
				})
			}
		}

		return matches
	}

	setAnalysisItems(items: PoolAnalysisItem[]) {
		this.analysisItems = items
	}

	async listAnalysisItems(
		accountId: string,
		options: { limit?: number } = {},
	): Promise<PoolAnalysisResponse> {
		const filtered = this.analysisItems.filter((item) => item.accountId === accountId)
		const limit = options.limit && options.limit > 0 ? options.limit : filtered.length
		return {
			items: filtered.slice(0, limit),
			totalItems: filtered.length,
			embeddingDimension: filtered[0]?.embedding.length ?? 0,
			generatedAt: new Date("2025-09-24T00:00:00Z").toISOString(),
		}
	}
}

class FakeDigestService {
	ensured: Array<{ accountId: string; userId: string; reason?: string }> = []

	async ensureDigest(
		accountId: string,
		userId: string,
		options: { reason?: string } = {},
	): Promise<PoolDigestPayload> {
		this.ensured.push({ accountId, userId, reason: options.reason })
		const now = new Date("2025-09-23T00:00:00Z")
		const metadata: PoolDigestMetadata = {
			generatedAt: now.toISOString(),
			windowStart: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
			windowEnd: now.toISOString(),
			reason: options.reason ?? "manual",
			highlightSampleIds: [],
			highlightCount: 0,
			fileCount: 0,
			recentFileIds: [],
			companyCounts: {},
			entityCounts: {},
		}

		return {
			accountId,
			userId,
			digest: `Digest for ${accountId}/${userId}`,
			tokenCount: 12,
			updatedAt: now.toISOString(),
			metadata,
		}
	}

	async refreshDigest(accountId: string, userId: string, options: { reason?: string }) {
		return this.ensureDigest(accountId, userId, options)
	}

	async getDigest() {
		return null
	}

	async listDigestsOlderThan() {
		return []
	}
}

class FakeDigestScheduler {
	scheduled: Array<{ accountId: string; userId: string; reason: string }> = []

	start() {}
	stop() {}

	schedule(accountId: string, userId: string, reason: string) {
		this.scheduled.push({ accountId, userId, reason })
	}
}

describe("pool routes", () => {
	const repository = new FakePoolRepository()
	const digestService = new FakeDigestService()
	const digestScheduler = new FakeDigestScheduler()
	const server = createPoolServer(null, {
		repository,
		digestService: digestService as unknown as any,
		digestScheduler: digestScheduler as unknown as any,
	})

	beforeEach(() => {
		;(repository as any).messages = []
		;(repository as any).files = []
		;(repository as any).sessions = new Map()
		;(repository as any).analysisItems = []
		digestService.ensured = []
		digestScheduler.scheduled = []
	})

	it("requires tenant headers", async () => {
		await request(server.app).post("/pool/messages").send({ messages: [] }).expect(400)
	})

	it("stores messages and files, listing them for the same tenant", async () => {
		await request(server.app)
			.post("/pool/messages")
			.set("x-account-id", "acct")
			.set("x-user-id", "user")
			.send({
				messages: [
					{
						sessionId: "sess",
						role: "user",
						text: "Plan the investor update",
						timestamp: new Date("2025-09-23T12:00:00Z").toISOString(),
					},
				],
			})
			.expect(201)

		await request(server.app)
			.post("/pool/files")
			.set("x-account-id", "acct")
			.set("x-user-id", "user")
			.send({
				file: {
					filename: "notes.txt",
					mimeType: "text/plain",
					sizeBytes: 1024,
					hash: "hash",
					source: "upload",
					parsedText: "Investor priorities and retreat agenda",
				},
			})
			.expect(201)

		const response = await request(server.app)
			.get("/pool/items")
			.set("x-account-id", "acct")
			.set("x-user-id", "user")
			.expect(200)

		expect(response.body.items).toHaveLength(2)
		expect(digestScheduler.scheduled.filter((call) => call.reason === "ingest")).toHaveLength(2)
	})

	it("returns keyword matches for search requests", async () => {
		await request(server.app)
			.post("/pool/messages")
			.set("x-account-id", "acct")
			.set("x-user-id", "user")
			.send({
				messages: [
					{
						sessionId: "sess",
						role: "assistant",
						text: "Summarize the investor memo for wellness retreats",
						timestamp: new Date("2025-09-23T13:00:00Z").toISOString(),
					},
				],
			})
			.expect(201)

		const response = await request(server.app)
			.post("/pool/search")
			.set("x-account-id", "acct")
			.set("x-user-id", "user")
			.send({ query: "investor memo" })
			.expect(200)

		expect(response.body.results.length).toBeGreaterThan(0)
		expect(response.body.results[0].score).toBeGreaterThan(0)
	})

	it("returns the cached digest summary", async () => {
		const response = await request(server.app)
			.get("/pool/digest")
			.set("x-account-id", "acct")
			.set("x-user-id", "user")
			.expect(200)

		expect(response.body.digest).toBe("Digest for acct/user")
		expect(response.body.tokenCount).toBe(12)
		expect(digestService.ensured[0]).toEqual({ accountId: "acct", userId: "user", reason: "manual" })
		expect(digestScheduler.scheduled.at(-1)).toEqual({ accountId: "acct", userId: "user", reason: "manual" })
	})

	it("returns analysis items for the passion map", async () => {
		repository.setAnalysisItems([
			{
				id: "msg-1",
				kind: "message",
				status: "captured",
				accountId: "acct",
				userId: "user",
				createdAt: new Date("2025-09-23T16:00:00Z").toISOString(),
				embedding: Array.from({ length: 4 }, (_, index) => (index + 1) / 10),
				text: "Passion project around eco retreats",
				sessionId: "sess-1",
			},
			{
				id: "file-1",
				kind: "file",
				status: "ready",
				accountId: "acct",
				userId: "user",
				createdAt: new Date("2025-09-23T14:00:00Z").toISOString(),
				embedding: Array.from({ length: 4 }, (_, index) => (index + 2) / 10),
				text: "Retreat survey results",
				filename: "survey.csv",
				mimeType: "text/csv",
				sizeBytes: 2048,
				source: "upload",
			},
		])

		const response = await request(server.app)
			.get("/pool/analysis/passions")
			.set("x-account-id", "acct")
			.set("x-user-id", "user")
			.expect(200)

		expect(response.body.items).toHaveLength(2)
		expect(response.body.items[0].text).toContain("Passion project")
		expect(response.body.embeddingDimension).toBeGreaterThan(0)
		expect(new Date(response.body.generatedAt).toString()).not.toBe("Invalid Date")
	})

	it("creates sessions and persists messages via session routes", async () => {
		const now = new Date("2025-09-23T15:00:00Z").toISOString()

		const createResponse = await request(server.app)
			.post("/pool/sessions")
			.set("x-account-id", "acct")
			.set("x-user-id", "user")
			.send({
				session: {
					companyId: "comp-1",
					companyName: "Wellness Retreats",
					initialMessages: [
						{
							sessionId: "pending",
							role: "assistant",
							text: "Welcome to Clover.",
							timestamp: now,
							tokens: 12,
							references: ["file-1"],
						},
					],
				},
			})
			.expect(201)

		const sessionId: string = createResponse.body.session.id
		expect(sessionId).toBeTruthy()

		await request(server.app)
			.post(`/pool/sessions/${sessionId}/messages`)
			.set("x-account-id", "acct")
			.set("x-user-id", "user")
			.send({
				messages: [
					{
						role: "user",
						text: "Draft the investor memo follow-up.",
						timestamp: new Date("2025-09-23T15:05:00Z").toISOString(),
					},
				],
			})
			.expect(201)

		const listResponse = await request(server.app)
			.get("/pool/sessions")
			.set("x-account-id", "acct")
			.set("x-user-id", "user")
			.expect(200)

		expect(listResponse.body.sessions).toHaveLength(1)
		expect(listResponse.body.sessions[0].lastMessage.text).toContain("Draft the investor memo")

		const messagesResponse = await request(server.app)
			.get(`/pool/sessions/${sessionId}/messages`)
			.set("x-account-id", "acct")
			.set("x-user-id", "user")
			.expect(200)

		expect(messagesResponse.body.messages).toHaveLength(2)
		expect(messagesResponse.body.messages[0].tokens).toBe(12)
		expect(messagesResponse.body.session.companyName).toBe("Wellness Retreats")
		expect(digestScheduler.scheduled.filter((call) => call.reason === "ingest")).toHaveLength(2)
	})
})
