import fs from "fs/promises"
import * as path from "path"

import {
	OUTER_GATE_STORAGE_VERSION,
	type OuterGateIntegrationId,
	type OuterGateStorageData,
	type StoredInsight,
	type StoredIntegrationMeta,
} from "./types"

const STORAGE_FILENAME = "outer-gate.json"

const createDefaultStorage = (): OuterGateStorageData => ({
	version: OUTER_GATE_STORAGE_VERSION,
	integrations: {},
	insights: {},
})

export class OuterGateStorage {
	private data: OuterGateStorageData = createDefaultStorage()

	private constructor(private readonly storagePath: string) {}

	public static async create(storageDir: string): Promise<OuterGateStorage> {
		const storagePath = path.join(storageDir, STORAGE_FILENAME)
		const storage = new OuterGateStorage(storagePath)
		await storage.load()
		return storage
	}

	private async load() {
		try {
			const file = await fs.readFile(this.storagePath, "utf8")
			const parsed = JSON.parse(file) as Partial<OuterGateStorageData>
			if (!parsed || typeof parsed !== "object") {
				this.data = createDefaultStorage()
				return
			}

			this.data = {
				...createDefaultStorage(),
				...parsed,
				integrations: { ...(parsed.integrations ?? {}) },
				insights: { ...(parsed.insights ?? {}) },
			}
		} catch (error) {
			// Initialize with defaults if file is missing or invalid.
			this.data = createDefaultStorage()
			const err = error as NodeJS.ErrnoException
			if (err && err.code !== "ENOENT") {
				console.warn(
					`[OuterGateStorage] Failed to load persisted data: ${err.message}. Falling back to defaults.`,
				)
			}
		}
	}

	private async persist() {
		await fs.mkdir(path.dirname(this.storagePath), { recursive: true })
		await fs.writeFile(this.storagePath, JSON.stringify(this.data, null, 2), "utf8")
	}

	public getIntegrationMeta(id: OuterGateIntegrationId): StoredIntegrationMeta | undefined {
		return this.data.integrations[id]
	}

	public getAllIntegrationMeta(): StoredIntegrationMeta[] {
		return Object.values(this.data.integrations)
	}

	public async setIntegrationMeta(meta: StoredIntegrationMeta | undefined) {
		if (!meta) {
			return
		}

		this.data.integrations[meta.id] = { ...meta }
		await this.persist()
	}

	public async removeIntegrationMeta(id: OuterGateIntegrationId) {
		if (this.data.integrations[id]) {
			delete this.data.integrations[id]
			await this.persist()
		}
	}

	public listInsights(): StoredInsight[] {
		return Object.values(this.data.insights)
	}

	public getInsight(id: string): StoredInsight | undefined {
		return this.data.insights[id]
	}

	public async upsertInsights(insights: StoredInsight[]) {
		if (!insights.length) {
			return
		}

		for (const insight of insights) {
			this.data.insights[insight.id] = { ...insight }
		}

		await this.persist()
	}

	public async removeInsightsByIntegration(integrationId: OuterGateIntegrationId) {
		let didMutate = false
		for (const [insightId, insight] of Object.entries(this.data.insights)) {
			if (insight.integrationId === integrationId) {
				delete this.data.insights[insightId]
				didMutate = true
			}
		}

		if (didMutate) {
			await this.persist()
		}
	}

	public async reset() {
		this.data = createDefaultStorage()
		await this.persist()
	}
}
