import { and, desc, eq, gt, lt } from "drizzle-orm"

import type { PoolDatabase } from "../db/client.js"
import { poolDigests, poolFiles, poolMessages, poolSessions } from "../db/schema.js"
import type { PoolDigestMetadata, PoolDigestPayload } from "../types.js"

export type DigestUpdateReason = "ingest" | "scheduled" | "manual"

export interface PoolDigestServiceOptions {
	lookbackDays?: number
	tokenLimit?: number
	highlightLimit?: number
	uploadLimit?: number
	companyLimit?: number
	entityLimit?: number
	messageSampleLimit?: number
	fileSampleLimit?: number
	scheduledMaxAgeMinutes?: number
}

const DEFAULT_LOOKBACK_DAYS = 7
const DEFAULT_TOKEN_LIMIT = 1_200
const DEFAULT_HIGHLIGHT_LIMIT = 6
const DEFAULT_UPLOAD_LIMIT = 5
const DEFAULT_COMPANY_LIMIT = 5
const DEFAULT_ENTITY_LIMIT = 5
const DEFAULT_MESSAGE_SAMPLE_LIMIT = 240
const DEFAULT_FILE_SAMPLE_LIMIT = 80
const DEFAULT_MAX_AGE_MINUTES = 30

interface DigestBuildContext {
	accountId: string
	userId: string
	reason: DigestUpdateReason
}

interface FormattedSection {
	title: string
	lines: string[]
}

interface DigestSections {
	highlights: {
		section: FormattedSection
		count: number
		sampleIds: string[]
	}
	uploads: {
		section: FormattedSection
	}
	companies: {
		section: FormattedSection
		counts: Array<[string, number]>
	}
	entities: {
		section: FormattedSection
		counts: Array<[string, number]>
	}
}

interface MessageRow {
	id: string
	role: string
	content: string
	createdAt: Date
	sessionId: string
	tokens: number | null
	references: string[] | null
}

interface FileRow {
	id: string
	filename: string
	source: string | null
	sizeBytes: number | null
	createdAt: Date
}

interface SessionRow {
	id: string
	companyId: string | null
	companyName: string | null
	updatedAt: Date
}

export class PoolDigestService {
	private readonly lookbackDays: number
	private readonly tokenLimit: number
	private readonly highlightLimit: number
	private readonly uploadLimit: number
	private readonly companyLimit: number
	private readonly entityLimit: number
	private readonly messageSampleLimit: number
	private readonly fileSampleLimit: number
	private readonly scheduledMaxAgeMinutes: number

	constructor(
		private readonly db: PoolDatabase,
		options: PoolDigestServiceOptions = {},
	) {
		this.lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS
		this.tokenLimit = options.tokenLimit ?? DEFAULT_TOKEN_LIMIT
		this.highlightLimit = options.highlightLimit ?? DEFAULT_HIGHLIGHT_LIMIT
		this.uploadLimit = options.uploadLimit ?? DEFAULT_UPLOAD_LIMIT
		this.companyLimit = options.companyLimit ?? DEFAULT_COMPANY_LIMIT
		this.entityLimit = options.entityLimit ?? DEFAULT_ENTITY_LIMIT
		this.messageSampleLimit = options.messageSampleLimit ?? DEFAULT_MESSAGE_SAMPLE_LIMIT
		this.fileSampleLimit = options.fileSampleLimit ?? DEFAULT_FILE_SAMPLE_LIMIT
		this.scheduledMaxAgeMinutes = options.scheduledMaxAgeMinutes ?? DEFAULT_MAX_AGE_MINUTES
	}

	async getDigest(accountId: string, userId: string): Promise<PoolDigestPayload | null> {
		const [row] = await this.db
			.select()
			.from(poolDigests)
			.where(and(eq(poolDigests.accountId, accountId), eq(poolDigests.userId, userId)))
			.limit(1)

		if (!row) {
			return null
		}

		return toPayload(row)
	}

	async ensureDigest(
		accountId: string,
		userId: string,
		options: { reason?: DigestUpdateReason; force?: boolean; maxAgeMs?: number } = {},
	): Promise<PoolDigestPayload> {
		const reason = options.reason ?? "manual"
		const existing = await this.getDigest(accountId, userId)
		if (!existing || options.force) {
			return this.refreshDigest(accountId, userId, { reason })
		}

		const maxAge = options.maxAgeMs ? options.maxAgeMs / 1000 / 60 : this.scheduledMaxAgeMinutes
		const ageMinutes = differenceInMinutes(new Date(), new Date(existing.updatedAt))

		if (ageMinutes >= maxAge) {
			return this.refreshDigest(accountId, userId, { reason })
		}

		return existing
	}

	async refreshDigest(
		accountId: string,
		userId: string,
		options: { reason?: DigestUpdateReason } = {},
	): Promise<PoolDigestPayload> {
		const reason = options.reason ?? "manual"

		const context: DigestBuildContext = { accountId, userId, reason }

		const now = new Date()
		const windowStart = new Date(now.getTime() - this.lookbackDays * 24 * 60 * 60 * 1000)

		const [messages, files, sessions] = await Promise.all([
			this.fetchRecentMessages(accountId, userId, windowStart),
			this.fetchRecentFiles(accountId, userId, windowStart),
			this.fetchRecentSessions(accountId, userId, windowStart),
		])

		const sections = this.buildSections(messages, files, sessions, windowStart, now)
		const rendered = renderSections(sections)
		const limited = this.enforceTokenLimit(rendered)

		const metadata: PoolDigestMetadata = {
			generatedAt: now.toISOString(),
			windowStart: windowStart.toISOString(),
			windowEnd: now.toISOString(),
			reason,
			highlightSampleIds: sections.highlights.sampleIds,
			highlightCount: sections.highlights.count,
			fileCount: files.length,
			recentFileIds: files.slice(0, this.uploadLimit).map((file) => file.id),
			companyCounts: Object.fromEntries(sections.companies.counts),
			entityCounts: Object.fromEntries(sections.entities.counts),
		}

		const lastActivityAt = mostRecentDate([
			...messages.map((message) => message.createdAt),
			...files.map((file) => file.createdAt),
		])

		const payload: PoolDigestPayload = {
			accountId,
			userId,
			digest: limited.text,
			tokenCount: limited.tokens,
			updatedAt: now.toISOString(),
			lastActivityAt: lastActivityAt ? lastActivityAt.toISOString() : undefined,
			metadata,
		}

		await this.db
			.insert(poolDigests)
			.values({
				accountId,
				userId,
				digest: payload.digest,
				tokenCount: payload.tokenCount,
				updatedAt: new Date(payload.updatedAt),
				lastActivityAt,
				metadata,
			})
			.onConflictDoUpdate({
				target: [poolDigests.accountId, poolDigests.userId],
				set: {
					digest: payload.digest,
					tokenCount: payload.tokenCount,
					updatedAt: new Date(payload.updatedAt),
					lastActivityAt,
					metadata,
				},
			})

		return payload
	}

	async listDigestsOlderThan(threshold: Date): Promise<Array<{ accountId: string; userId: string }>> {
		const rows = await this.db
			.select({ accountId: poolDigests.accountId, userId: poolDigests.userId })
			.from(poolDigests)
			.where(lt(poolDigests.updatedAt, threshold))

		return rows
	}

	private async fetchRecentMessages(accountId: string, userId: string, windowStart: Date) {
		return this.db
			.select({
				id: poolMessages.id,
				role: poolMessages.role,
				content: poolMessages.content,
				createdAt: poolMessages.createdAt,
				sessionId: poolMessages.sessionId,
				tokens: poolMessages.tokenCount,
				references: poolMessages.itemReferences,
			})
			.from(poolMessages)
			.where(
				and(
					eq(poolMessages.accountId, accountId),
					eq(poolMessages.userId, userId),
					gt(poolMessages.createdAt, windowStart),
				),
			)
			.orderBy(desc(poolMessages.createdAt))
			.limit(this.messageSampleLimit)
	}

	private async fetchRecentFiles(accountId: string, userId: string, windowStart: Date) {
		return this.db
			.select({
				id: poolFiles.id,
				filename: poolFiles.filename,
				source: poolFiles.source,
				sizeBytes: poolFiles.sizeBytes,
				createdAt: poolFiles.createdAt,
			})
			.from(poolFiles)
			.where(
				and(
					eq(poolFiles.accountId, accountId),
					eq(poolFiles.userId, userId),
					gt(poolFiles.createdAt, windowStart),
				),
			)
			.orderBy(desc(poolFiles.createdAt))
			.limit(this.fileSampleLimit)
	}

	private async fetchRecentSessions(accountId: string, userId: string, windowStart: Date) {
		return this.db
			.select({
				id: poolSessions.id,
				companyId: poolSessions.companyId,
				companyName: poolSessions.companyName,
				updatedAt: poolSessions.updatedAt,
			})
			.from(poolSessions)
			.where(
				and(
					eq(poolSessions.accountId, accountId),
					eq(poolSessions.userId, userId),
					gt(poolSessions.updatedAt, windowStart),
				),
			)
			.orderBy(desc(poolSessions.updatedAt))
	}

	private buildSections(
		messages: MessageRow[],
		files: FileRow[],
		sessions: SessionRow[],
		windowStart: Date,
		windowEnd: Date,
	): DigestSections {
		const highlightCandidates = messages.slice(0, this.highlightLimit)

		const highlights: FormattedSection = {
			title: `Highlights (${formatDate(windowStart)} – ${formatDate(windowEnd)})`,
			lines: highlightCandidates.length
				? highlightCandidates.map(
						(message) =>
							`- [${formatRelativeDate(message.createdAt)}] ${capitalize(message.role)} · ${truncate(message.content, 160)}`,
					)
				: ["- No recent conversation highlights."],
		}

		const uploads: FormattedSection = {
			title: "Newest Uploads",
			lines: files.length
				? files
						.slice(0, this.uploadLimit)
						.map(
							(file) =>
								`- [${formatRelativeDate(file.createdAt)}] ${file.filename}${
									file.source ? ` (${file.source})` : ""
								}${file.sizeBytes ? ` · ${formatSize(file.sizeBytes)}` : ""}`,
						)
				: ["- No new uploads in the last 7 days."],
		}

		const companyCounts = buildCompanyCounts(messages, sessions)
		const topCompanies = [...companyCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, this.companyLimit)
		const companies: FormattedSection = {
			title: "Active Companies",
			lines: topCompanies.length
				? topCompanies.map(([company, count]) => `- ${company} — ${count} touch${count === 1 ? "" : "es"}`)
				: ["- No company-specific activity yet."],
		}

		const entityCounts = buildEntityCounts(messages)
		const topEntities = [...entityCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, this.entityLimit)
		const entities: FormattedSection = {
			title: "Top Entities",
			lines: topEntities.length
				? topEntities.map(([entity, count]) => `- ${entity} — ${count} mention${count === 1 ? "" : "s"}`)
				: ["- No entities referenced recently."],
		}

		return {
			highlights: {
				section: highlights,
				count: highlightCandidates.length,
				sampleIds: highlightCandidates.map((message) => message.id),
			},
			uploads: {
				section: uploads,
			},
			companies: {
				section: companies,
				counts: topCompanies,
			},
			entities: {
				section: entities,
				counts: topEntities,
			},
		}
	}

	private enforceTokenLimit(rendered: FormattedSection[]): { text: string; tokens: number } {
		const sections = rendered.map((section) => ({ title: section.title, lines: [...section.lines] }))
		let text = toText(sections)
		let tokens = approximateTokens(text)

		if (tokens <= this.tokenLimit) {
			return { text, tokens }
		}

		for (let i = sections.length - 1; i >= 0 && tokens > this.tokenLimit; i--) {
			const section = sections[i]
			while (section.lines.length > 1 && tokens > this.tokenLimit) {
				section.lines.pop()
				text = toText(sections)
				tokens = approximateTokens(text)
			}
		}

		if (tokens > this.tokenLimit) {
			const truncated = truncateByCharacters(text, this.tokenLimit * 4)
			return { text: truncated, tokens: Math.min(this.tokenLimit, approximateTokens(truncated)) }
		}

		return { text, tokens }
	}
}

function toPayload(row: typeof poolDigests.$inferSelect): PoolDigestPayload {
	const metadata = normalizeMetadata(row.metadata)
	return {
		accountId: row.accountId,
		userId: row.userId,
		digest: row.digest,
		tokenCount: row.tokenCount,
		updatedAt: asIso(row.updatedAt),
		lastActivityAt: row.lastActivityAt ? asIso(row.lastActivityAt) : undefined,
		metadata,
	}
}

function normalizeMetadata(input: Record<string, unknown> | null | undefined): PoolDigestMetadata {
	if (!input || typeof input !== "object") {
		return {
			generatedAt: new Date().toISOString(),
			windowStart: new Date().toISOString(),
			windowEnd: new Date().toISOString(),
			reason: "manual",
			highlightSampleIds: [],
			highlightCount: 0,
			fileCount: 0,
			recentFileIds: [],
			companyCounts: {},
			entityCounts: {},
		}
	}

	const metadata = input as Partial<PoolDigestMetadata>
	return {
		generatedAt: metadata.generatedAt ?? new Date().toISOString(),
		windowStart: metadata.windowStart ?? new Date().toISOString(),
		windowEnd: metadata.windowEnd ?? new Date().toISOString(),
		reason: metadata.reason ?? "manual",
		highlightSampleIds: Array.isArray(metadata.highlightSampleIds) ? metadata.highlightSampleIds : [],
		highlightCount: metadata.highlightCount ?? 0,
		fileCount: metadata.fileCount ?? 0,
		recentFileIds: Array.isArray(metadata.recentFileIds) ? metadata.recentFileIds : [],
		companyCounts: metadata.companyCounts ?? {},
		entityCounts: metadata.entityCounts ?? {},
	}
}

function renderSections(summary: DigestSections): FormattedSection[] {
	return [summary.highlights.section, summary.uploads.section, summary.companies.section, summary.entities.section]
}

function toText(sections: FormattedSection[]): string {
	return sections.map((section) => [section.title, ...section.lines].join("\n")).join("\n\n")
}

function approximateTokens(text: string): number {
	if (!text.trim()) {
		return 0
	}
	return Math.ceil(text.trim().length / 4)
}

function truncate(message: string, limit: number): string {
	if (message.length <= limit) {
		return message
	}
	return `${message.slice(0, limit - 1)}…`
}

function formatDate(date: Date): string {
	return date.toISOString().split("T")[0]
}

function formatRelativeDate(date: Date): string {
	return date
		.toISOString()
		.replace("T", " ")
		.replace(/:..\..Z$/, "Z")
}

function capitalize(value: string): string {
	if (!value) {
		return value
	}
	return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatSize(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) {
		return "0 B"
	}
	const units = ["B", "KB", "MB", "GB", "TB"]
	const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
	const value = bytes / Math.pow(1024, index)
	return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

function mostRecentDate(dates: Date[]): Date | null {
	return dates.reduce<Date | null>((latest, current) => {
		if (!current) {
			return latest
		}
		if (!latest || current > latest) {
			return current
		}
		return latest
	}, null)
}

function buildCompanyCounts(messages: MessageRow[], sessions: SessionRow[]): Map<string, number> {
	const counts = new Map<string, number>()
	const sessionCompanies = new Map<string, string>()

	for (const session of sessions) {
		if (session.companyId) {
			sessionCompanies.set(session.companyId, session.companyName ?? session.companyId)
			increment(counts, session.companyName ?? session.companyId)
		} else if (session.companyName) {
			increment(counts, session.companyName)
		}
	}

	for (const message of messages) {
		const refs = message.references ?? []
		for (const ref of refs) {
			const parsed = parseReference(ref)
			if (parsed?.type === "company") {
				const label = parsed.name ?? sessionCompanies.get(parsed.id ?? "") ?? parsed.id ?? "Company"
				increment(counts, label)
			}
		}
	}

	return counts
}

function buildEntityCounts(messages: MessageRow[]): Map<string, number> {
	const counts = new Map<string, number>()
	for (const message of messages) {
		const refs = message.references ?? []
		for (const ref of refs) {
			const parsed = parseReference(ref)
			if (!parsed) {
				continue
			}
			if (parsed.type === "entity" || parsed.type === "raw") {
				const label = parsed.name ?? parsed.id ?? "Entity"
				increment(counts, label)
			}
		}
	}
	return counts
}

function parseReference(
	raw: string | null | undefined,
): { type: "company" | "entity" | "raw"; id?: string; name?: string } | null {
	if (!raw) {
		return null
	}
	const value = raw.trim()
	if (!value) {
		return null
	}

	const regex = /^(company|entity)[:/#](.+)$/i
	const match = value.match(regex)
	if (match) {
		const [, typeRaw, rest] = match
		const [idPart, labelPart] = rest.split("|", 2)
		const id = idPart?.trim() ?? undefined
		const name = labelPart?.trim() || id
		return {
			type: typeRaw.toLowerCase() as "company" | "entity",
			id,
			name,
		}
	}

	const colonIndex = value.indexOf(":")
	if (colonIndex > 0) {
		const prefix = value.slice(0, colonIndex).toLowerCase()
		const rest = value.slice(colonIndex + 1).trim()
		if (prefix === "company" || prefix === "entity") {
			const [idPart, labelPart] = rest.split("|", 2)
			const id = idPart?.trim() ?? undefined
			const name = labelPart?.trim() || id
			return {
				type: prefix as "company" | "entity",
				id,
				name,
			}
		}
	}

	return { type: "raw", name: value }
}

function increment(map: Map<string, number>, key: string | undefined | null) {
	if (!key) {
		return
	}
	map.set(key, (map.get(key) ?? 0) + 1)
}

function asIso(value: Date | string): string {
	if (value instanceof Date) {
		return value.toISOString()
	}
	return new Date(value).toISOString()
}

function truncateByCharacters(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text
	}
	return text.slice(0, Math.max(0, maxChars - 1)) + "…"
}

function differenceInMinutes(a: Date, b: Date) {
	return Math.abs(a.getTime() - b.getTime()) / (60 * 1000)
}
