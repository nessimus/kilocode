import axios from "axios";
import { randomUUID } from "crypto";
export const DEFAULT_CLOVER_SESSION_PAGE_SIZE = 12;
const DEFAULT_POOL_BASE_URL = "http://localhost:3005";
const ACCOUNT_STORAGE_KEY = "goldenOuterGate.poolAccountId";
const USER_STORAGE_KEY = "goldenOuterGate.poolUserId";
const ACTIVE_SESSION_STORAGE_KEY = "goldenOuterGate.poolActiveSessionId";
const LOCAL_SESSIONS_STORAGE_KEY = "goldenOuterGate.localSessions";
const TRANSIENT_NETWORK_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "EAI_AGAIN", "ETIMEDOUT", "ENOTFOUND"]);
const CLOVER_INSIGHT_REFERENCE_PREFIX = "clover-insight:";
const VALID_INSIGHT_STAGES = new Set(["captured", "processing", "ready", "assigned"]);
const VALID_INSIGHT_SOURCE_TYPES = new Set(["conversation", "document", "voice", "integration"]);
const SESSION_SUMMARY_PREVIEW_FALLBACK = "No messages yet.";
const SESSION_SUMMARY_TITLE_FALLBACK = "Untitled Chat";
export class CloverSessionService {
    context;
    getWorkplaceService;
    accountId;
    userId;
    client;
    sessions = new Map();
    activeSessionId;
    useLocalFallback = false;
    localSessionsLoaded = false;
    constructor(context, getWorkplaceService) {
        this.context = context;
        this.getWorkplaceService = getWorkplaceService;
        this.accountId = this.ensureIdentifier(ACCOUNT_STORAGE_KEY);
        this.userId = this.ensureIdentifier(USER_STORAGE_KEY);
        this.activeSessionId = this.context.globalState.get(ACTIVE_SESSION_STORAGE_KEY);
        const configuredBase = process.env.POOL_API_URL ?? DEFAULT_POOL_BASE_URL;
        const normalizedBase = configuredBase.replace(/\/$/, "");
        this.client = axios.create({
            baseURL: `${normalizedBase}/pool`,
            timeout: 15_000,
        });
    }
    async ensureDefaultSession(_initialMessages) {
        // Remote persistence does not require a seeded local session.
    }
    getActiveSessionId() {
        return this.activeSessionId;
    }
    async setActiveSessionId(sessionId) {
        this.activeSessionId = sessionId;
        await this.context.globalState.update(ACTIVE_SESSION_STORAGE_KEY, sessionId);
        if (this.useLocalFallback) {
            await this.persistLocalSessions();
        }
    }
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    async createSession(options) {
        if (this.useLocalFallback) {
            return this.createLocalSession(options);
        }
        const payload = {
            session: {
                companyId: options?.companyId,
                companyName: options?.companyName,
                initialMessages: this.mapMessagesToPoolPayload(options?.initialMessages ?? []),
            },
        };
        try {
            const { data } = await this.client.post("/sessions", payload, {
                headers: this.headers,
            });
            const session = this.ingestSessionPayload(data);
            this.activeSessionId = session.id;
            await this.context.globalState.update(ACTIVE_SESSION_STORAGE_KEY, session.id);
            return session;
        }
        catch (error) {
            if (!this.shouldFallback(error)) {
                throw error;
            }
            await this.enableLocalFallback(error);
            return this.createLocalSession(options);
        }
    }
    async appendMessages(sessionId, messages, context) {
        if (this.useLocalFallback) {
            return this.appendMessagesLocally(sessionId, messages, context);
        }
        try {
            const existing = await this.ensureSessionCached(sessionId);
            const payload = {
                messages: this.mapMessagesToPoolPayload(messages),
                context: this.toContextPayload(context),
            };
            const { data } = await this.client.post(`/sessions/${sessionId}/messages`, payload, { headers: this.headers });
            const appended = data.messages.map((message) => this.mapPoolMessageToOuterGate(message));
            existing.messages.push(...appended);
            existing.updatedAtIso = normalizeIso(data.session.updatedAt);
            existing.companyId = data.session.companyId ?? existing.companyId;
            existing.companyName = data.session.companyName ?? existing.companyName;
            existing.firstUserMessage =
                existing.firstUserMessage ?? appended.find((message) => message.speaker === "user")?.text;
            this.sessions.set(existing.id, existing);
            return existing;
        }
        catch (error) {
            if (!this.shouldFallback(error)) {
                throw error;
            }
            await this.enableLocalFallback(error);
            return this.appendMessagesLocally(sessionId, messages, context);
        }
    }
    async fetchAnalysisItems(options = {}) {
        if (this.useLocalFallback) {
            return this.buildEmptyAnalysisResponse();
        }
        const params = {};
        if (typeof options.limit === "number") {
            params.limit = options.limit;
        }
        if (options.status) {
            params.status = options.status;
        }
        if (options.since) {
            params.since = options.since;
        }
        if (typeof options.includeFiles === "boolean") {
            params.includeFiles = String(options.includeFiles);
        }
        if (typeof options.includeMessages === "boolean") {
            params.includeMessages = String(options.includeMessages);
        }
        try {
            const { data } = await this.client.get("/analysis/passions", {
                params,
                headers: this.headers,
            });
            return data;
        }
        catch (error) {
            if (!this.shouldFallback(error)) {
                throw error;
            }
            await this.enableLocalFallback(error);
            return this.buildEmptyAnalysisResponse();
        }
    }
    async fetchSession(sessionId) {
        try {
            return await this.ensureSessionCached(sessionId);
        }
        catch (error) {
            console.warn(`[CloverSessionService] Failed to fetch session ${sessionId}`, error);
            return undefined;
        }
    }
    async listSessions(options) {
        if (this.useLocalFallback) {
            return this.listSessionsFromLocal(options);
        }
        const params = {
            limit: options?.limit ?? DEFAULT_CLOVER_SESSION_PAGE_SIZE,
        };
        if (options?.cursor) {
            params.cursor = options.cursor;
        }
        try {
            const { data } = await this.client.get("/sessions", {
                params,
                headers: this.headers,
            });
            for (const summary of data.sessions) {
                const existing = this.sessions.get(summary.id);
                if (existing) {
                    existing.createdAtIso = normalizeIso(summary.createdAt);
                    existing.updatedAtIso = normalizeIso(summary.updatedAt);
                    existing.companyId = summary.companyId ?? existing.companyId;
                    existing.companyName = summary.companyName ?? existing.companyName;
                    existing.firstUserMessage = summary.firstUserMessage ?? existing.firstUserMessage;
                }
            }
            const sessions = data.sessions.map((summary) => this.toSummary(summary));
            return {
                sessions,
                hasMore: data.hasMore,
                nextCursor: data.nextCursor,
            };
        }
        catch (error) {
            if (!this.shouldFallback(error)) {
                throw error;
            }
            await this.enableLocalFallback(error);
            return this.listSessionsFromLocal(options);
        }
    }
    toSummary(session) {
        if ("messages" in session) {
            return this.buildSummaryFromPersisted(session);
        }
        return this.buildSummaryFromRemote(session);
    }
    buildSummaryFromPersisted(session) {
        const companyName = this.resolveCompanyName(session.companyId) ?? session.companyName;
        const lastMessage = session.messages.at(-1);
        const previewSource = lastMessage?.text ?? session.firstUserMessage ?? SESSION_SUMMARY_PREVIEW_FALLBACK;
        const title = session.firstUserMessage?.trim() || SESSION_SUMMARY_TITLE_FALLBACK;
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
        };
    }
    buildSummaryFromRemote(summary) {
        const companyName = this.resolveCompanyName(summary.companyId) ?? summary.companyName;
        const previewSource = summary.preview ?? summary.firstUserMessage ?? SESSION_SUMMARY_PREVIEW_FALLBACK;
        const lastMessage = summary.lastMessage ? this.mapPoolMessageToOuterGate(summary.lastMessage) : undefined;
        const title = summary.title?.trim() || summary.firstUserMessage?.trim() || SESSION_SUMMARY_TITLE_FALLBACK;
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
        };
    }
    async ensureSessionCached(sessionId) {
        const cached = this.sessions.get(sessionId);
        if (cached) {
            return cached;
        }
        if (this.useLocalFallback) {
            await this.ensureLocalSessionsLoaded();
            const local = this.sessions.get(sessionId);
            if (local) {
                return local;
            }
            throw new Error(`Clover session ${sessionId} is not available in local storage`);
        }
        try {
            const { data } = await this.client.get(`/sessions/${sessionId}/messages`, {
                headers: this.headers,
            });
            return this.ingestSessionPayload(data);
        }
        catch (error) {
            if (this.shouldFallback(error)) {
                await this.enableLocalFallback(error);
                const local = this.sessions.get(sessionId);
                if (local) {
                    return local;
                }
            }
            throw error;
        }
    }
    async createLocalSession(options) {
        await this.ensureLocalSessionsLoaded();
        const id = randomUUID();
        const nowIso = new Date().toISOString();
        const messages = this.normalizeMessages(options?.initialMessages ?? []);
        const session = {
            id,
            createdAtIso: nowIso,
            updatedAtIso: nowIso,
            messages,
            companyId: options?.companyId,
            companyName: options?.companyName,
            firstUserMessage: messages.find((message) => message.speaker === "user")?.text,
        };
        this.sessions.set(id, session);
        this.activeSessionId = id;
        await this.persistLocalSessions();
        await this.context.globalState.update(ACTIVE_SESSION_STORAGE_KEY, id);
        return session;
    }
    async appendMessagesLocally(sessionId, messages, context) {
        await this.ensureLocalSessionsLoaded();
        let existing = this.sessions.get(sessionId);
        if (!existing) {
            const nowIso = new Date().toISOString();
            existing = {
                id: sessionId,
                createdAtIso: nowIso,
                updatedAtIso: nowIso,
                messages: [],
            };
            this.sessions.set(sessionId, existing);
        }
        const normalizedMessages = this.normalizeMessages(messages);
        existing.messages.push(...normalizedMessages);
        existing.updatedAtIso = new Date().toISOString();
        if (context?.companyId) {
            existing.companyId = context.companyId;
        }
        if (context?.companyName) {
            existing.companyName = context.companyName;
        }
        existing.firstUserMessage =
            existing.firstUserMessage ?? normalizedMessages.find((message) => message.speaker === "user")?.text;
        await this.persistLocalSessions();
        return existing;
    }
    async listSessionsFromLocal(options) {
        await this.ensureLocalSessionsLoaded();
        const limit = options?.limit ?? DEFAULT_CLOVER_SESSION_PAGE_SIZE;
        const ordered = Array.from(this.sessions.values()).sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
        const entries = ordered.slice(0, limit);
        return {
            sessions: entries.map((session) => this.toSummary(session)),
            hasMore: ordered.length > entries.length,
            nextCursor: undefined,
        };
    }
    async enableLocalFallback(reason) {
        if (this.useLocalFallback) {
            return;
        }
        this.useLocalFallback = true;
        console.warn("[CloverSessionService] Switching to local fallback for Clover sessions", reason);
        await this.ensureLocalSessionsLoaded();
        await this.persistLocalSessions();
    }
    async ensureLocalSessionsLoaded() {
        if (this.localSessionsLoaded) {
            return;
        }
        this.localSessionsLoaded = true;
        const stored = this.context.globalState.get(LOCAL_SESSIONS_STORAGE_KEY);
        if (!stored) {
            return;
        }
        for (const session of stored.sessions) {
            const normalized = {
                ...session,
                createdAtIso: normalizeIso(session.createdAtIso),
                updatedAtIso: normalizeIso(session.updatedAtIso),
                messages: this.normalizeMessages(session.messages ?? []),
            };
            this.sessions.set(normalized.id, normalized);
        }
        if (!this.activeSessionId && stored.activeSessionId) {
            this.activeSessionId = stored.activeSessionId;
        }
    }
    async persistLocalSessions() {
        const payload = {
            activeSessionId: this.activeSessionId,
            sessions: Array.from(this.sessions.values()).map((session) => ({
                ...session,
                messages: session.messages.map((message) => ({ ...message })),
            })),
        };
        await this.context.globalState.update(LOCAL_SESSIONS_STORAGE_KEY, payload);
    }
    shouldFallback(error) {
        if (!error) {
            return false;
        }
        if (axios.isAxiosError(error)) {
            if (error.code && TRANSIENT_NETWORK_CODES.has(error.code)) {
                return true;
            }
            if (!error.response) {
                return true;
            }
            const status = error.response.status;
            if (status >= 500) {
                return true;
            }
        }
        if (error instanceof AggregateError) {
            return error.errors.some((entry) => this.shouldFallback(entry));
        }
        if (error instanceof Error) {
            const message = error.message ?? "";
            for (const code of TRANSIENT_NETWORK_CODES) {
                if (message.includes(code)) {
                    return true;
                }
            }
        }
        return false;
    }
    normalizeMessages(messages) {
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
        }));
    }
    ingestSessionPayload(payload) {
        const messages = payload.messages.map((message) => this.mapPoolMessageToOuterGate(message));
        const summary = payload.session;
        const session = {
            id: summary.id,
            createdAtIso: normalizeIso(summary.createdAt),
            updatedAtIso: normalizeIso(summary.updatedAt),
            messages,
            companyId: summary.companyId,
            companyName: summary.companyName,
            firstUserMessage: summary.firstUserMessage ?? messages.find((message) => message.speaker === "user")?.text,
        };
        this.sessions.set(session.id, session);
        return session;
    }
    mapMessagesToPoolPayload(messages) {
        return messages.map((message) => {
            const references = [];
            if (message.references && message.references.length > 0) {
                references.push(...message.references);
            }
            if (message.insightEvent) {
                const encoded = this.encodeInsightEventReference(message.insightEvent);
                if (!references.some((entry) => entry === encoded)) {
                    references.push(encoded);
                }
            }
            return {
                id: message.id,
                role: message.speaker === "clover" ? "assistant" : "user",
                text: message.text,
                timestamp: normalizeIso(message.timestamp),
                tokens: message.tokens,
                references: references.length ? references : undefined,
            };
        });
    }
    mapPoolMessageToOuterGate(message) {
        const { event, references } = this.extractInsightEvent(message.references);
        return {
            id: message.id,
            speaker: message.role === "assistant" ? "clover" : "user",
            text: message.text,
            timestamp: normalizeIso(message.timestamp),
            tokens: message.tokens,
            references,
            insightEvent: event,
        };
    }
    encodeInsightEventReference(event) {
        const payload = {
            type: event.type,
            insight: event.insight,
            note: event.note,
            changes: event.changes,
        };
        try {
            const serialized = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
            return `${CLOVER_INSIGHT_REFERENCE_PREFIX}${serialized}`;
        }
        catch {
            return `${CLOVER_INSIGHT_REFERENCE_PREFIX}`;
        }
    }
    extractInsightEvent(references) {
        if (!references || references.length === 0) {
            return { references: undefined };
        }
        const remaining = [];
        let event;
        for (const reference of references) {
            if (!event && reference.startsWith(CLOVER_INSIGHT_REFERENCE_PREFIX)) {
                const decoded = this.decodeInsightEvent(reference.slice(CLOVER_INSIGHT_REFERENCE_PREFIX.length));
                if (decoded) {
                    event = decoded;
                    continue;
                }
            }
            remaining.push(reference);
        }
        return {
            event,
            references: remaining.length ? remaining : undefined,
        };
    }
    decodeInsightEvent(encoded) {
        try {
            if (!encoded) {
                return undefined;
            }
            const json = Buffer.from(encoded, "base64url").toString("utf8");
            const raw = JSON.parse(json);
            if (!raw || typeof raw !== "object") {
                return undefined;
            }
            if (raw.type !== "created" && raw.type !== "updated") {
                return undefined;
            }
            const insight = this.normalizeInsight(raw.insight);
            if (!insight) {
                return undefined;
            }
            const changes = Array.isArray(raw.changes)
                ? raw.changes
                    .map((entry) => this.normalizeInsightChange(entry))
                    .filter((entry) => Boolean(entry))
                : undefined;
            return {
                type: raw.type,
                insight,
                note: typeof raw.note === "string" ? raw.note : undefined,
                changes,
            };
        }
        catch {
            return undefined;
        }
    }
    normalizeInsight(raw) {
        if (!raw || typeof raw !== "object") {
            return undefined;
        }
        const { id, title, stage, sourceType } = raw;
        if (typeof id !== "string" || !id.trim()) {
            return undefined;
        }
        if (typeof title !== "string" || !title.trim()) {
            return undefined;
        }
        if (typeof stage !== "string" || !VALID_INSIGHT_STAGES.has(stage)) {
            return undefined;
        }
        if (typeof sourceType !== "string" || !VALID_INSIGHT_SOURCE_TYPES.has(sourceType)) {
            return undefined;
        }
        const normalized = {
            id: id.trim(),
            title: title.trim(),
            stage: stage,
            sourceType: sourceType,
            summary: typeof raw.summary === "string" ? raw.summary : undefined,
            recommendedWorkspace: typeof raw.recommendedWorkspace === "string" ? raw.recommendedWorkspace : undefined,
            capturedAtIso: typeof raw.capturedAtIso === "string" ? normalizeIso(raw.capturedAtIso) : undefined,
            assignedCompanyId: typeof raw.assignedCompanyId === "string" ? raw.assignedCompanyId : undefined,
        };
        return normalized;
    }
    normalizeInsightChange(raw) {
        if (!raw || typeof raw !== "object") {
            return undefined;
        }
        const record = raw;
        const field = record.field;
        if (typeof field !== "string") {
            return undefined;
        }
        if (field !== "title" &&
            field !== "summary" &&
            field !== "stage" &&
            field !== "recommendedWorkspace" &&
            field !== "assignedCompanyId" &&
            field !== "capturedAtIso" &&
            field !== "sourceType") {
            return undefined;
        }
        const change = {
            field,
            from: typeof record.from === "string" ? record.from : undefined,
            to: typeof record.to === "string" ? record.to : undefined,
        };
        return change;
    }
    toContextPayload(context) {
        if (!context) {
            return undefined;
        }
        const payload = {};
        if (context.companyId) {
            payload.companyId = context.companyId;
        }
        if (context.companyName) {
            payload.companyName = context.companyName;
        }
        return Object.keys(payload).length > 0 ? payload : undefined;
    }
    resolveCompanyName(companyId) {
        if (!companyId) {
            return undefined;
        }
        const workplace = this.getWorkplaceService?.();
        if (!workplace) {
            return undefined;
        }
        const snapshot = workplace.getState();
        const company = snapshot.companies.find((entry) => entry.id === companyId);
        return company?.name;
    }
    buildEmptyAnalysisResponse() {
        return {
            items: [],
            totalItems: 0,
            embeddingDimension: 0,
            generatedAt: new Date().toISOString(),
        };
    }
    ensureIdentifier(key) {
        const existing = this.context.globalState.get(key);
        if (existing && existing.trim().length > 0) {
            return existing;
        }
        const identifier = randomUUID();
        void this.context.globalState.update(key, identifier).then(undefined, (error) => {
            console.warn(`[CloverSessionService] Failed to persist identifier for ${key}`, error);
        });
        return identifier;
    }
    get headers() {
        return {
            "x-account-id": this.accountId,
            "x-user-id": this.userId,
        };
    }
}
function normalizeIso(value) {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
        return new Date().toISOString();
    }
    return new Date(parsed).toISOString();
}
//# sourceMappingURL=CloverSessionService.js.map