import express from "express"
import type { Server } from "node:http"

import type { PoolDatabaseHandle } from "../db/client.js"
import { PoolDigestScheduler } from "../services/poolDigestScheduler.js"
import { PoolDigestService } from "../services/poolDigestService.js"
import { PoolRepository } from "../services/poolRepository.js"
import { createPoolRouter } from "./routes/pool.js"

export interface PoolServerOptions {
	requestBodyLimit?: string
	port?: number
	host?: string
	repository?: PoolRepository
	digestService?: PoolDigestService
	digestScheduler?: PoolDigestScheduler
}

export interface PoolServer {
	app: express.Express
	repository: PoolRepository
	digestService?: PoolDigestService
	digestScheduler?: PoolDigestScheduler
	listen: () => Promise<Server>
}

export function createPoolServer(handle: PoolDatabaseHandle | null, options: PoolServerOptions = {}): PoolServer {
	const app = express()
	app.disable("x-powered-by")
	app.use(express.json({ limit: options.requestBodyLimit ?? "5mb" }))

	let baseHandle: PoolDatabaseHandle | null = null
	if (!options.repository) {
		baseHandle = assertHandle(handle)
	} else {
		baseHandle = handle
	}

	const repository = options.repository ?? new PoolRepository(baseHandle!.db)

	const digestService = options.digestService ?? (baseHandle ? new PoolDigestService(baseHandle.db) : undefined)
	const digestScheduler =
		options.digestScheduler ?? (digestService ? new PoolDigestScheduler(digestService) : undefined)

	if (digestScheduler) {
		digestScheduler.start()
	}

	app.use("/pool", createPoolRouter(repository, { digestService, digestScheduler }))

	app.get("/health", (_req, res) => {
		res.json({ status: "ok" })
	})

	return {
		app,
		repository,
		digestService,
		digestScheduler,
		listen: () =>
			new Promise((resolve) => {
				const server = app.listen(options.port ?? 3005, options.host ?? "0.0.0.0", () => {
					resolve(server)
				})
			}),
	}
}

function assertHandle(handle: PoolDatabaseHandle | null): PoolDatabaseHandle {
	if (!handle) {
		throw new Error("Pool database handle is required when no repository override is provided")
	}
	return handle
}
