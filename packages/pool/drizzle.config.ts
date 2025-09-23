import { defineConfig } from "drizzle-kit"

export default defineConfig({
	out: "./src/db/migrations",
	schema: "./src/db/schema.ts",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.POOL_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/golden_workplace_pool",
	},
	verbose: true,
	strict: true,
})
