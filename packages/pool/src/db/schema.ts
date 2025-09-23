import { index, pgEnum, pgTable, text, timestamp, jsonb, integer, uniqueIndex, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const poolItemStatusEnum = pgEnum("pool_item_status", ["captured", "processing", "ready", "archived"])

export const poolSpeakerEnum = pgEnum("pool_speaker", ["user", "assistant"])

export const poolMessages = pgTable(
	"pool_messages",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		userId: text("user_id").notNull(),
		sessionId: text("session_id").notNull(),
		role: poolSpeakerEnum("role").notNull(),
		content: text("content").notNull(),
		embedding: text("embedding").default(null),
		itemStatus: poolItemStatusEnum("status").notNull().default("captured"),
		messageTimestamp: timestamp("message_timestamp", { withTimezone: true }).notNull(),
		tokenCount: integer("tokens"),
		itemReferences: jsonb("item_references").$type<string[] | null>().default(null),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		accountCreatedIdx: index("pool_messages_account_created_idx").on(table.accountId, table.createdAt.desc()),
		accountSessionIdx: index("pool_messages_account_session_idx").on(table.accountId, table.sessionId),
	}),
)

export const poolSessions = pgTable(
	"pool_sessions",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		userId: text("user_id").notNull(),
		companyId: text("company_id"),
		companyName: text("company_name"),
		title: text("title"),
		preview: text("preview"),
		lastMessageText: text("last_message_text"),
		firstUserMessage: text("first_user_message"),
		messageCount: integer("message_count").notNull().default(0),
		lastMessageId: text("last_message_id"),
		lastMessageRole: poolSpeakerEnum("last_message_role"),
		lastMessageTimestamp: timestamp("last_message_timestamp", { withTimezone: true }),
		lastMessageTokens: integer("last_message_tokens"),
		lastMessageReferences: jsonb("last_message_references").$type<string[] | null>().default(null),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		accountUpdatedIdx: index("pool_sessions_account_updated_idx").on(
			table.accountId,
			table.updatedAt.desc(),
			table.id.desc(),
		),
	}),
)

export const poolFiles = pgTable(
	"pool_files",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		userId: text("user_id").notNull(),
		filename: text("filename").notNull(),
		mimeType: text("mime_type").notNull(),
		sizeBytes: integer("size_bytes").notNull(),
		hash: text("hash").notNull(),
		source: text("source"),
		parsedText: text("parsed_text"),
		embedding: text("embedding").default(null),
		itemStatus: poolItemStatusEnum("status").notNull().default("captured"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		accountCreatedIdx: index("pool_files_account_created_idx").on(table.accountId, table.createdAt.desc()),
		accountHashUnique: uniqueIndex("pool_files_account_hash_unique").on(table.accountId, table.hash),
	}),
)

export const poolDigests = pgTable(
	"pool_digests",
	{
		accountId: text("account_id").notNull(),
		userId: text("user_id").notNull(),
		digest: text("digest").notNull(),
		tokenCount: integer("token_count").notNull().default(0),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
		lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default(sql`'{}'::jsonb`),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.accountId, table.userId], name: "pool_digests_account_id_user_id" }),
		updatedIdx: index("pool_digests_updated_idx").on(table.updatedAt.desc()),
	}),
)

export type PoolMessage = typeof poolMessages.$inferSelect
export type NewPoolMessage = typeof poolMessages.$inferInsert

export type PoolFile = typeof poolFiles.$inferSelect
export type NewPoolFile = typeof poolFiles.$inferInsert

export type PoolSession = typeof poolSessions.$inferSelect
export type NewPoolSession = typeof poolSessions.$inferInsert

export type PoolDigest = typeof poolDigests.$inferSelect
export type NewPoolDigest = typeof poolDigests.$inferInsert
