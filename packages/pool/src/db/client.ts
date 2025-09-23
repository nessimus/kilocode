import { Pool } from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { fileURLToPath } from "node:url"
import path from "node:path"

import type { NodePgDatabase } from "drizzle-orm/node-postgres"

import * as schema from "./schema.js"

export interface PoolDatabaseConfig {
	connectionString: string
	maxConnections?: number
}

export type PoolDatabase = NodePgDatabase<typeof schema>

export interface PoolDatabaseHandle {
	db: PoolDatabase
	pool: Pool
}

export function createPoolDatabase(config: PoolDatabaseConfig): PoolDatabaseHandle {
	const pool = new Pool({
		connectionString: config.connectionString,
		max: config.maxConnections ?? 10,
	})

	const db = drizzle(pool, { schema })
	return { db, pool }
}

export async function runMigrations(handle: PoolDatabaseHandle): Promise<void> {
	const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./migrations")

	await migrate(handle.db, { migrationsFolder })
}
