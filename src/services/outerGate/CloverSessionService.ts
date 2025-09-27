import axios, { type AxiosError, AxiosInstance } from "axios"
import { randomUUID } from "crypto"
import * as vscode from "vscode"

import {
	OuterGateCloverMessage,
	OuterGateCloverSessionSummary,
	OuterGateInsight,
	OuterGateInsightEvent,
	OuterGateInsightEventChange,
	OuterGateInsightStage,
} from "../../shared/golden/outerGate"

import type { WorkplaceService } from "../workplace/WorkplaceService"

export interface ListSessionsOptions {
	cursor?: string
	limit?: number
}

export interface ListSessionsResult {
	sessions: OuterGateCloverSessionSummary[]
	hasMore: boolean
	nextCursor?: string
}

interface PersistedCloverSession {
	id: string
	createdAtIso: string
	updatedAtIso: string
	messages: OuterGateCloverMessage[]
	companyId?: string
	companyName?: string
	firstUserMessage?: string
}

interface StoredLocalSessions {
	sessions: PersistedCloverSession[]
	activeSessionId?: string
}

interface PoolSessionSummaryResponse {
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
		role: "user" | "assistant"
		text: string
		timestamp: string
		tokens?: number
		references?: string[]
	}
}

interface PoolSessionMessageResponse {
	id: string
	sessionId: string
	accountId: string
	userId: string
	role: "user" | "assistant"
	text: string
	timestamp: string
	createdAt: string
	tokens?: number
	references?: string[]
}

type PoolSessionMessageLike = Pick<
	PoolSessionMessageResponse,
	"id" | "role" | "text" | "timestamp" | "tokens" | "references"
>

interface PoolSessionListResponse {
	sessions: PoolSessionSummaryResponse[]
	hasMore: boolean
	nextCursor?: string
}

interface PoolSessionMessagesResponse {
	session: PoolSessionSummaryResponse
	messages: PoolSessionMessageResponse[]
}

interface PoolSessionMessagePayload {
	id?: string
	sessionId?: string
	role: "user" | "assistant"
	text: string
	timestamp: string
	tokens?: number
	references?: string[]
}

interface PoolSessionContextPayload {
	companyId?: string
	companyName?: string
}

interface PoolAnalysisItemResponse {
	id: string
	kind: "message" | "file"
	status: "captured" | "processing" | "ready" | "archived"
	accountId: string
	userId: string
	createdAt: string
	embedding: number[]
	text: string
	sessionId?: string
	messageTimestamp?: string
	tokens?: number
	references?: string[]
	filename?: string
	mimeType?: string
	sizeBytes?: number
	source?: string
}

interface PoolAnalysisResponsePayload {
	items: PoolAnalysisItemResponse[]
	totalItems: number
	embeddingDimension: number
	generatedAt: string
}

export const DEFAULT_CLOVER_SESSION_PAGE_SIZE = 12

const DEFAULT_POOL_BASE_URL = "http://localhost:3005"
const ACCOUNT_STORAGE_KEY = "goldenOuterGate.poolAccountId"
const USER_STORAGE_KEY = "goldenOuterGate.poolUserId"
const ACTIVE_SESSION_STORAGE_KEY = "goldenOuterGate.poolActiveSessionId"
const LOCAL_SESSIONS_STORAGE_KEY = "goldenOuterGate.localSessions"

const TRANSIENT_NETWORK_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "EAI_AGAIN", "ETIMEDOUT", "ENOTFOUND"])

const CLOVER_INSIGHT_REFERENCE_PREFIX = "clover-insight:"
const VALID_INSIGHT_STAGES = new Set<OuterGateInsightStage>(["captured", "processing", "ready", "assigned"])
const VALID_INSIGHT_SOURCE_TYPES = new Set<OuterGateInsight["sourceType"]>(["conversation", "document", "voice", "integration"])

const SESSION_SUMMARY_PREVIEW_FALLBACK = "No messages yet."
const SESSION_SUMMARY_TITLE_FALLBACK = "Untitled Chat"

export class CloverSessionService {
	private readonly accountId: string
	private readonly userId: string
	private readonly client: AxiosInstance
	private sessions = new Map<string, PersistedCloverSession>()
	private activeSessionId?: string
	private useLocalFallback = false
	private localSessionsLoaded = false

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly getWorkplaceService?: () => WorkplaceService | undefined,
	) {
		this.accountId = this.ensureIdentifier(ACCOUNT_STORAGE_KEY)
		this.userId = this.ensureIdentifier(USER_STORAGE_KEY)
		this.activeSessionId = this.context.globalState.get<string>(ACTIVE_SESSION_STORAGE_KEY)

		const configuredBase = process.env.POOL_API_URL ?? DEFAULT_POOL_BASE_URL
		const normalizedBase = configuredBase.replace(/\/$/, "")
		this.client = axios.create({
			baseURL: `${normalizedBase}/pool`,
			timeout: 15_000,
		})
	}

	public async ensureDefaultSession(_initialMessages?: OuterGateCloverMessage[]): Promise<void> {
		// Remote persistence does not require a seeded local session.
	}

	public getActiveSessionId(): string | undefined {
		return this.activeSessionId
	}

	public async setActiveSessionId(sessionId?: string): Promise<void> {
		this.activeSessionId = sessionId
		await this.context.globalState.update(ACTIVE_SESSION_STORAGE_KEY, sessionId)
		if (this.useLocalFallback) {
			await this.persistLocalSessions()
		}
	}

	public getSession(sessionId: string): PersistedCloverSession | undefined {
		return this.sessions.get(sessionId)
	}

	public async createSession(options?: {
		companyId?: string
		companyName?: string
		initialMessages?: OuterGateCloverMessage[]
	}): Promise<PersistedCloverSession> {
		if (this.useLocalFallback) {
			return this.createLocalSession(options)
		}

		const payload = {
			session: {
				companyId: options?.companyId,
				companyName: options?.companyName,
				initialMessages: this.mapMessagesToPoolPayload(options?.initialMessages ?? []),
			},
		}

		try {
			const { data } = await this.client.post<PoolSessionMessagesResponse>("/sessions", payload, {
				headers: this.headers,
			})

			const session = this.ingestSessionPayload(data)
			this.activeSessionId = session.id
			await this.context.globalState.update(ACTIVE_SESSION_STORAGE_KEY, session.id)
			return session
		} catch (error) {
			if (!this.shouldFallback(error)) {
				throw error
			}
			await this.enableLocalFallback(error)
			return this.createLocalSession(options)
		}
	}

	public async appendMessages(
		sessionId: string,
		messages: OuterGateCloverMessage[],
		context?: { companyId?: string; companyName?: string },
	): Promise<PersistedCloverSession> {
		if (this.useLocalFallback) {
			return this.appendMessagesLocally(sessionId, messages, context)
		}

		try {
			const existing = await this.ensureSessionCached(sessionId)

			const payload = {
				messages: this.mapMessagesToPoolPayload(messages),
				context: this.toContextPayload(context),
			}

			const { data } = await this.client.post<PoolSessionMessagesResponse>(
				`/sessions/${sessionId}/messages`,
				payload,
				{ headers: this.headers },
			)

			const appended = data.messages.map((message) => this.mapPoolMessageToOuterGate(message))
			existing.messages.push(...appended)
			existing.updatedAtIso = normalizeIso(data.session.updatedAt)
			existing.companyId = data.session.companyId ?? existing.companyId
			existing.companyName = data.session.companyName ?? existing.companyName
			existing.firstUserMessage =
				existing.firstUserMessage ?? appended.find((message) => message.speaker === "user")?.text

			this.sessions.set(existing.id, existing)
			return existing
		} catch (error) {
			if (!this.shouldFallback(error)) {
				throw error
			}
			await this.enableLocalFallback(error)
			return this.appendMessagesLocally(sessionId, messages, context)
		}
	}

	public async fetchAnalysisItems(options: {
		limit?: number
		status?: PoolAnalysisItemResponse["status"]
		since?: string
		includeFiles?: boolean
		includeMessages?: boolean
	} = {}): Promise<PoolAnalysisResponsePayload> {
		if (this.useLocalFallback) {
			return this.buildEmptyAnalysisResponse()
		}

		const params: Record<string, unknown> = {}
		if (typeof options.limit === "number") {
			params.limit = options.limit
		}
		if (options.status) {
			params.status = options.status
		}
		if (options.since) {
			params.since = options.since
		}
		if (typeof options.includeFiles === "boolean") {
			params.includeFiles = String(options.includeFiles)
		}
		if (typeof options.includeMessages === "boolean") {
			params.includeMessages = String(options.includeMessages)
		}

		try {
			const { data } = await this.client.get<PoolAnalysisResponsePayload>("/analysis/passions", {
				params,
				headers: this.headers,
			})
			return data
		} catch (error) {
			if (!this.shouldFallback(error)) {
				throw error
			}
			await this.enableLocalFallback(error)
			return this.buildEmptyAnalysisResponse()
		}
	}

	public async fetchSession(sessionId: string): Promise<PersistedCloverSession | undefined> {
		try {
			return await this.ensureSessionCached(sessionId)
		} catch (error) {
			console.warn(`[CloverSessionService] Failed to fetch session ${sessionId}`, error)
			return undefined
		}
	}

	public async listSessions(options?: ListSessionsOptions): Promise<ListSessionsResult> {
		if (this.useLocalFallback) {
			return this.listSessionsFromLocal(options)
		}

		const params: Record<string, string | number> = {
			limit: options?.limit ?? DEFAULT_CLOVER_SESSION_PAGE_SIZE,
		}
		if (options?.cursor) {
			params.cursor = options.cursor
		}

		try {
			const { data } = await this.client.get<PoolSessionListResponse>("/sessions", {
				params,
				headers: this.headers,
			})

			for (const summary of data.sessions) {
				const existing = this.sessions.get(summary.id)
				if (existing) {
					existing.createdAtIso = normalizeIso(summary.createdAt)
					existing.updatedAtIso = normalizeIso(summary.updatedAt)
					existing.companyId = summary.companyId ?? existing.companyId
					existing.companyName = summary.companyName ?? existing.companyName
					existing.firstUserMessage = summary.firstUserMessage ?? existing.firstUserMessage
				}
			}

			const sessions = data.sessions.map((summary) => this.toSummary(summary))
			return {
				sessions,
				hasMore: data.hasMore,
				nextCursor: data.nextCursor,
			}
		} catch (error) {
			if (!this.shouldFallback(error)) {
				throw error
			}
			await this.enableLocalFallback(error)
			return this.listSessionsFromLocal(options)
		}
	}

	public toSummary(session: PersistedCloverSession): OuterGateCloverSessionSummary
	public toSummary(session: PoolSessionSummaryResponse): OuterGateCloverSessionSummary
	public toSummary(session: PersistedCloverSession | PoolSessionSummaryResponse): OuterGateCloverSessionSummary {
		if ("messages" in session) {
			return this.buildSummaryFromPersisted(session)
		}
		return this.buildSummaryFromRemote(session)
	}

	private buildSummaryFromPersisted(session: PersistedCloverSession): OuterGateCloverSessionSummary {
		const companyName = this.resolveCompanyName(session.companyId) ?? session.companyName
		const lastMessage = session.messages.at(-1)
		const previewSource = lastMessage?.text ?? session.firstUserMessage ?? SESSION_SUMMARY_PREVIEW_FALLBACK

		const title = session.firstUserMessage?.trim() || SESSION_SUMMARY_TITLE_FALLBACK

		return {
			id: session.id,
			createdAtIso: session.createdAtIso,
			updatedAtIso: session.updatedAtIso,
			companyId: session.companyId,
			companyName: companyName,
			title,
			preview: previewSource,
			messageCount: session.messages.length,
			lastMessage: lastMessage,
		}
	}

	private buildSummaryFromRemote(summary: PoolSessionSummaryResponse): OuterGateCloverSessionSummary {
		const companyName = this.resolveCompanyName(summary.companyId) ?? summary.companyName
		const previewSource = summary.preview ?? summary.firstUserMessage ?? SESSION_SUMMARY_PREVIEW_FALLBACK
		const lastMessage = summary.lastMessage ? this.mapPoolMessageToOuterGate(summary.lastMessage) : undefined
		const title = summary.title?.trim() || summary.firstUserMessage?.trim() || SESSION_SUMMARY_TITLE_FALLBACK

		return {
			id: summary.id,
			createdAtIso: normalizeIso(summary.createdAt),
			updatedAtIso: normalizeIso(summary.updatedAt),
			companyId: summary.companyId,
			companyName,
			title,
			preview: previewSource,
			messageCount: summary.messageCount,
			lastMessage,
		}
	}

	private async ensureSessionCached(sessionId: string): Promise<PersistedCloverSession> {
		const cached = this.sessions.get(sessionId)
		if (cached) {
			return cached
		}
		if (this.useLocalFallback) {
			await this.ensureLocalSessionsLoaded()
			const local = this.sessions.get(sessionId)
			if (local) {
				return local
			}
			throw new Error(`Clover session ${sessionId} is not available in local storage`)
		}
		try {
			const { data } = await this.client.get<PoolSessionMessagesResponse>(`/sessions/${sessionId}/messages`, {
				headers: this.headers,
			})
			return this.ingestSessionPayload(data)
		} catch (error) {
			if (this.shouldFallback(error)) {
				await this.enableLocalFallback(error)
				const local = this.sessions.get(sessionId)
				if (local) {
					return local
				}
			}
			throw error
		}
	}

	private async createLocalSession(options?: {
		companyId?: string
		companyName?: string
		initialMessages?: OuterGateCloverMessage[]
	}): Promise<PersistedCloverSession> {
		await this.ensureLocalSessionsLoaded()
		const id = randomUUID()
		const nowIso = new Date().toISOString()
		const messages = this.normalizeMessages(options?.initialMessages ?? [])
		const session: PersistedCloverSession = {
			id,
			createdAtIso: nowIso,
			updatedAtIso: nowIso,
			messages,
			companyId: options?.companyId,
			companyName: options?.companyName,
			firstUserMessage: messages.find((message) => message.speaker === "user")?.text,
		}
		this.sessions.set(id, session)
		this.activeSessionId = id
		await this.persistLocalSessions()
		await this.context.globalState.update(ACTIVE_SESSION_STORAGE_KEY, id)
		return session
	}

	private async appendMessagesLocally(
		sessionId: string,
		messages: OuterGateCloverMessage[],
		context?: { companyId?: string; companyName?: string },
	): Promise<PersistedCloverSession> {
		await this.ensureLocalSessionsLoaded()
		let existing = this.sessions.get(sessionId)
		if (!existing) {
			const nowIso = new Date().toISOString()
			existing = {
				id: sessionId,
				createdAtIso: nowIso,
				updatedAtIso: nowIso,
				messages: [],
			}
			this.sessions.set(sessionId, existing)
		}
		const normalizedMessages = this.normalizeMessages(messages)
		existing.messages.push(...normalizedMessages)
		existing.updatedAtIso = new Date().toISOString()
		if (context?.companyId) {
			existing.companyId = context.companyId
		}
		if (context?.companyName) {
			existing.companyName = context.companyName
		}
		existing.firstUserMessage =
			existing.firstUserMessage ?? normalizedMessages.find((message) => message.speaker === "user")?.text
		await this.persistLocalSessions()
		return existing
	}

	private async listSessionsFromLocal(options?: ListSessionsOptions): Promise<ListSessionsResult> {
		await this.ensureLocalSessionsLoaded()
		const limit = options?.limit ?? DEFAULT_CLOVER_SESSION_PAGE_SIZE
		const ordered = Array.from(this.sessions.values()).sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso))
		const entries = ordered.slice(0, limit)
		return {
			sessions: entries.map((session) => this.toSummary(session)),
			hasMore: ordered.length > entries.length,
			nextCursor: undefined,
		}
	}

	private async enableLocalFallback(reason?: unknown): Promise<void> {
		if (this.useLocalFallback) {
			return
		}
		this.useLocalFallback = true
		console.warn("[CloverSessionService] Switching to local fallback for Clover sessions", reason)
		await this.ensureLocalSessionsLoaded()
		await this.persistLocalSessions()
	}

	private async ensureLocalSessionsLoaded(): Promise<void> {
		if (this.localSessionsLoaded) {
			return
		}
		this.localSessionsLoaded = true
		const stored = this.context.globalState.get<StoredLocalSessions>(LOCAL_SESSIONS_STORAGE_KEY)
		if (!stored) {
			return
		}
		for (const session of stored.sessions) {
			const normalized: PersistedCloverSession = {
				...session,
				createdAtIso: normalizeIso(session.createdAtIso),
				updatedAtIso: normalizeIso(session.updatedAtIso),
				messages: this.normalizeMessages(session.messages ?? []),
			}
			this.sessions.set(normalized.id, normalized)
		}
		if (!this.activeSessionId && stored.activeSessionId) {
			this.activeSessionId = stored.activeSessionId
		}
	}

	private async persistLocalSessions(): Promise<void> {
		const payload: StoredLocalSessions = {
			activeSessionId: this.activeSessionId,
			sessions: Array.from(this.sessions.values()).map((session) => ({
				...session,
				messages: session.messages.map((message) => ({ ...message })),
			})),
		}
		await this.context.globalState.update(LOCAL_SESSIONS_STORAGE_KEY, payload)
	}

	private shouldFallback(error: unknown): boolean {
		if (!error) {
			return false
		}
		if (axios.isAxiosError(error)) {
			if (error.code && TRANSIENT_NETWORK_CODES.has(error.code)) {
				return true
			}
			if (!error.response) {
				return true
			}
			const status = error.response.status
			if (status >= 500) {
				return true
			}
		}
		if (error instanceof AggregateError) {
			return error.errors.some((entry) => this.shouldFallback(entry))
		}
		if (error instanceof Error) {
			const message = error.message ?? ""
			for (const code of TRANSIENT_NETWORK_CODES) {
				if (message.includes(code)) {
					return true
				}
			}
		}
		return false
	}

	private normalizeMessages(messages: OuterGateCloverMessage[]): OuterGateCloverMessage[] {
		return messages.map((message) => ({
			...message,
			timestamp: normalizeIso(message.timestamp),
			insightEvent: message.insightEvent
				? {
					...message.insightEvent,
					insight: { ...message.insightEvent.insight },
					changes: message.insightEvent.changes?.map((change) => ({ ...change })),
				}
				: undefined,
			automationCall: message.automationCall
				? {
					...message.automationCall,
					inputs: message.automationCall.inputs?.map((entry) => ({ ...entry })),
					outputLines: message.automationCall.outputLines
						? [...message.automationCall.outputLines]
						: undefined,
				}
				: undefined,
		}))
	}

	private ingestSessionPayload(payload: PoolSessionMessagesResponse): PersistedCloverSession {
		const messages = payload.messages.map((message) => this.mapPoolMessageToOuterGate(message))
		const summary = payload.session

		const session: PersistedCloverSession = {
			id: summary.id,
			createdAtIso: normalizeIso(summary.createdAt),
			updatedAtIso: normalizeIso(summary.updatedAt),
			messages,
			companyId: summary.companyId,
			companyName: summary.companyName,
			firstUserMessage: summary.firstUserMessage ?? messages.find((message) => message.speaker === "user")?.text,
		}

		this.sessions.set(session.id, session)
		return session
	}

	private mapMessagesToPoolPayload(messages: OuterGateCloverMessage[]): PoolSessionMessagePayload[] {
		return messages.map((message) => {
			const references: string[] = []
			if (message.references && message.references.length > 0) {
				references.push(...message.references)
			}
			if (message.insightEvent) {
				const encoded = this.encodeInsightEventReference(message.insightEvent)
				if (!references.some((entry) => entry === encoded)) {
					references.push(encoded)
				}
			}
			return {
				id: message.id,
				role: message.speaker === "clover" ? "assistant" : "user",
				text: message.text,
				timestamp: normalizeIso(message.timestamp),
				tokens: message.tokens,
				references: references.length ? references : undefined,
			}
		})
	}

	private mapPoolMessageToOuterGate(message: PoolSessionMessageLike): OuterGateCloverMessage {
		const { event, references } = this.extractInsightEvent(message.references)
		return {
			id: message.id,
			speaker: message.role === "assistant" ? "clover" : "user",
			text: message.text,
			timestamp: normalizeIso(message.timestamp),
			tokens: message.tokens,
			references,
			insightEvent: event,
		}
	}

	private encodeInsightEventReference(event: OuterGateInsightEvent): string {
		const payload = {
			type: event.type,
			insight: event.insight,
			note: event.note,
			changes: event.changes,
		}
		try {
			const serialized = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
			return `${CLOVER_INSIGHT_REFERENCE_PREFIX}${serialized}`
		} catch {
			return `${CLOVER_INSIGHT_REFERENCE_PREFIX}`
		}
	}

	private extractInsightEvent(references?: string[]): {
		event?: OuterGateInsightEvent
		references?: string[]
	} {
		if (!references || references.length === 0) {
			return { references: undefined }
		}
		const remaining: string[] = []
		let event: OuterGateInsightEvent | undefined
		for (const reference of references) {
			if (!event && reference.startsWith(CLOVER_INSIGHT_REFERENCE_PREFIX)) {
				const decoded = this.decodeInsightEvent(reference.slice(CLOVER_INSIGHT_REFERENCE_PREFIX.length))
				if (decoded) {
					event = decoded
					continue
				}
			}
			remaining.push(reference)
		}
		return {
			event,
			references: remaining.length ? remaining : undefined,
		}
	}

	private decodeInsightEvent(encoded: string): OuterGateInsightEvent | undefined {
		try {
			if (!encoded) {
				return undefined
			}
			const json = Buffer.from(encoded, "base64url").toString("utf8")
			const raw = JSON.parse(json) as Partial<OuterGateInsightEvent> & { insight?: Partial<OuterGateInsight> }
			if (!raw || typeof raw !== "object") {
				return undefined
			}
			if (raw.type !== "created" && raw.type !== "updated") {
				return undefined
			}
			const insight = this.normalizeInsight(raw.insight)
			if (!insight) {
				return undefined
			}
			const changes = Array.isArray(raw.changes)
				? raw.changes
					.map((entry) => this.normalizeInsightChange(entry))
					.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
				: undefined
			return {
				type: raw.type,
				insight,
				note: typeof raw.note === "string" ? raw.note : undefined,
				changes,
			}
		} catch {
			return undefined
		}
	}

	private normalizeInsight(raw: Partial<OuterGateInsight> | undefined): OuterGateInsight | undefined {
		if (!raw || typeof raw !== "object") {
			return undefined
		}
		const { id, title, stage, sourceType } = raw
		if (typeof id !== "string" || !id.trim()) {
			return undefined
		}
		if (typeof title !== "string" || !title.trim()) {
			return undefined
		}
		if (typeof stage !== "string" || !VALID_INSIGHT_STAGES.has(stage as OuterGateInsightStage)) {
			return undefined
		}
		if (typeof sourceType !== "string" || !VALID_INSIGHT_SOURCE_TYPES.has(sourceType as OuterGateInsight["sourceType"])) {
			return undefined
		}
		const normalized: OuterGateInsight = {
			id: id.trim(),
			title: title.trim(),
			stage: stage as OuterGateInsightStage,
			sourceType: sourceType as OuterGateInsight["sourceType"],
			summary: typeof raw.summary === "string" ? raw.summary : undefined,
			recommendedWorkspace:
				typeof raw.recommendedWorkspace === "string" ? raw.recommendedWorkspace : undefined,
			capturedAtIso: typeof raw.capturedAtIso === "string" ? normalizeIso(raw.capturedAtIso) : undefined,
			assignedCompanyId:
				typeof raw.assignedCompanyId === "string" ? raw.assignedCompanyId : undefined,
		}
		return normalized
	}

	private normalizeInsightChange(raw: unknown) {
		if (!raw || typeof raw !== "object") {
			return undefined
		}
		const record = raw as Record<string, unknown>
		const field = record.field
		if (typeof field !== "string") {
			return undefined
		}
		if (
		field !== "title" &&
		field !== "summary" &&
		field !== "stage" &&
		field !== "recommendedWorkspace" &&
		field !== "assignedCompanyId" &&
		field !== "capturedAtIso" &&
		field !== "sourceType"
	) {
			return undefined
		}
		const change: OuterGateInsightEventChange = {
			field,
			from: typeof record.from === "string" ? record.from : undefined,
			to: typeof record.to === "string" ? record.to : undefined,
		}
		return change
	}

	private toContextPayload(context?: {
		companyId?: string
		companyName?: string
	}): PoolSessionContextPayload | undefined {
		if (!context) {
			return undefined
		}
		const payload: PoolSessionContextPayload = {}
		if (context.companyId) {
			payload.companyId = context.companyId
		}
		if (context.companyName) {
			payload.companyName = context.companyName
		}
		return Object.keys(payload).length > 0 ? payload : undefined
	}

	private resolveCompanyName(companyId?: string): string | undefined {
		if (!companyId) {
			return undefined
		}
		const workplace = this.getWorkplaceService?.()
		if (!workplace) {
			return undefined
		}
		const snapshot = workplace.getState()
		const company = snapshot.companies.find((entry) => entry.id === companyId)
		return company?.name
	}

	private buildEmptyAnalysisResponse(): PoolAnalysisResponsePayload {
		return {
			items: [],
			totalItems: 0,
			embeddingDimension: 0,
			generatedAt: new Date().toISOString(),
		}
	}

	private ensureIdentifier(key: string): string {
		const existing = this.context.globalState.get<string>(key)
		if (existing && existing.trim().length > 0) {
			return existing
		}
		const identifier = randomUUID()
		void this.context.globalState.update(key, identifier).then(undefined, (error: unknown) => {
			console.warn(`[CloverSessionService] Failed to persist identifier for ${key}`, error)
		})
		return identifier
	}

	private get headers() {
		return {
			"x-account-id": this.accountId,
			"x-user-id": this.userId,
		}
	}
}

function normalizeIso(value: string): string {
	const parsed = Date.parse(value)
	if (Number.isNaN(parsed)) {
		return new Date().toISOString()
	}
	return new Date(parsed).toISOString()
}
