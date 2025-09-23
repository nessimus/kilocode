import express from "express"
import { ZodError } from "zod"

import { PoolDigestScheduler } from "../../services/poolDigestScheduler.js"
import { PoolDigestService } from "../../services/poolDigestService.js"
import { PoolRepository } from "../../services/poolRepository.js"
import {
	poolFileRequestSchema,
	poolItemsQuerySchema,
	poolMessagesRequestSchema,
	poolSessionCreateRequestSchema,
	poolSessionListQuerySchema,
	poolSessionMessagesRequestSchema,
	poolSearchRequestSchema,
} from "../../types.js"
import { requireTenant } from "../middleware/auth.js"

export function createPoolRouter(
	repository: PoolRepository,
	options: { digestService?: PoolDigestService; digestScheduler?: PoolDigestScheduler } = {},
) {
	const router = express.Router()

	router.use(requireTenant)

	router.post("/sessions", async (req, res) => {
		try {
			const { session } = poolSessionCreateRequestSchema.parse(req.body)
			const accountId = req.accountId!
			const userId = req.userId!

			const result = await repository.createSession(accountId, userId, session)
			options.digestScheduler?.schedule(accountId, userId, "ingest")
			res.status(201).json(result)
		} catch (error) {
			handleError(res, error)
		}
	})

	router.get("/sessions", async (req, res) => {
		try {
			const cursorParam = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor
			const limitParam = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit

			const parsed = poolSessionListQuerySchema.parse({
				cursor: cursorParam,
				limit: limitParam ? Number(limitParam) : undefined,
			})

			const result = await repository.listSessions(req.accountId!, parsed)
			res.json(result)
		} catch (error) {
			handleError(res, error)
		}
	})

	router.get("/sessions/:sessionId/messages", async (req, res) => {
		try {
			const sessionId = req.params.sessionId
			if (!sessionId) {
				res.status(400).json({ error: "invalid_session", message: "Session id is required" })
				return
			}

			const result = await repository.getSessionMessages(req.accountId!, sessionId)
			res.json(result)
		} catch (error) {
			handleError(res, error)
		}
	})

	router.post("/sessions/:sessionId/messages", async (req, res) => {
		try {
			const sessionId = req.params.sessionId
			if (!sessionId) {
				res.status(400).json({ error: "invalid_session", message: "Session id is required" })
				return
			}

			const payload = poolSessionMessagesRequestSchema.parse(req.body)
			const accountId = req.accountId!
			const userId = req.userId!

			const result = await repository.appendSessionMessages(accountId, userId, sessionId, payload)
			options.digestScheduler?.schedule(accountId, userId, "ingest")
			res.status(201).json(result)
		} catch (error) {
			handleError(res, error)
		}
	})

	router.post("/messages", async (req, res) => {
		try {
			const { messages } = poolMessagesRequestSchema.parse(req.body)
			const accountId = req.accountId!
			const userId = req.userId!

			const stored = await repository.insertMessages(
				accountId,
				userId,
				messages.map((message) => ({ ...message })),
			)

			res.status(201).json({
				inserted: stored.length,
				messageIds: stored.map((message) => message.id),
			})
			options.digestScheduler?.schedule(accountId, userId, "ingest")
		} catch (error) {
			handleError(res, error)
		}
	})

	router.post("/files", async (req, res) => {
		try {
			const { file } = poolFileRequestSchema.parse(req.body)
			const accountId = req.accountId!
			const userId = req.userId!

			const stored = await repository.insertFile(accountId, userId, file)
			res.status(201).json({ fileId: stored.id })
			options.digestScheduler?.schedule(accountId, userId, "ingest")
		} catch (error) {
			handleError(res, error)
		}
	})

	router.get("/items", async (req, res) => {
		try {
			const statusParam = Array.isArray(req.query.status) ? req.query.status[0] : req.query.status
			const queryParam = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q
			const limitParam = Array.isArray(req.query.limit) ? Number(req.query.limit[0]) : req.query.limit
			const cursorParam = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor

			const parsedQuery = poolItemsQuerySchema.parse({
				status: statusParam,
				q: queryParam,
				limit: limitParam ? Number(limitParam) : undefined,
				cursor: cursorParam,
			})

			const result = await repository.listItems(req.accountId!, {
				status: parsedQuery.status,
				q: parsedQuery.q,
				limit: parsedQuery.limit,
				cursor: parsedQuery.cursor,
			})

			res.json(result)
		} catch (error) {
			handleError(res, error)
		}
	})

	router.post("/search", async (req, res) => {
		try {
			const { query, limit } = poolSearchRequestSchema.parse(req.body)
			const results = await repository.search(req.accountId!, query, { limit })
			res.json({ results })
		} catch (error) {
			handleError(res, error)
		}
	})

	router.get("/digest", async (req, res) => {
		if (!options.digestService) {
			res.status(503).json({
				error: "digest_unavailable",
				message: "Digest service is not configured for this deployment.",
			})
			return
		}

		try {
			const accountId = req.accountId!
			const userId = req.userId!

			const digest = await options.digestService.ensureDigest(accountId, userId, {
				reason: "manual",
			})

			options.digestScheduler?.schedule(accountId, userId, "manual")

			res.json({
				digest: digest.digest,
				tokenCount: digest.tokenCount,
				updatedAt: digest.updatedAt,
				lastActivityAt: digest.lastActivityAt,
				metadata: digest.metadata,
			})
		} catch (error) {
			handleError(res, error)
		}
	})

	return router
}

function handleError(res: express.Response, error: unknown) {
	if (error instanceof ZodError) {
		res.status(400).json({ error: "invalid_payload", issues: error.issues })
		return
	}

	if (error instanceof Error) {
		res.status(500).json({ error: "internal_error", message: error.message })
		return
	}

	res.status(500).json({ error: "internal_error", message: "Unknown error" })
}
