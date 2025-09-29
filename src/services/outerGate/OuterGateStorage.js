import fs from "fs/promises";
import * as path from "path";
import { OUTER_GATE_STORAGE_VERSION, } from "./types";
const STORAGE_FILENAME = "outer-gate.json";
const createDefaultStorage = () => ({
    version: OUTER_GATE_STORAGE_VERSION,
    integrations: {},
    insights: {},
});
export class OuterGateStorage {
    storagePath;
    data = createDefaultStorage();
    constructor(storagePath) {
        this.storagePath = storagePath;
    }
    static async create(storageDir) {
        const storagePath = path.join(storageDir, STORAGE_FILENAME);
        const storage = new OuterGateStorage(storagePath);
        await storage.load();
        return storage;
    }
    async load() {
        try {
            const file = await fs.readFile(this.storagePath, "utf8");
            const parsed = JSON.parse(file);
            if (!parsed || typeof parsed !== "object") {
                this.data = createDefaultStorage();
                return;
            }
            this.data = {
                ...createDefaultStorage(),
                ...parsed,
                integrations: { ...(parsed.integrations ?? {}) },
                insights: { ...(parsed.insights ?? {}) },
            };
        }
        catch (error) {
            // Initialize with defaults if file is missing or invalid.
            this.data = createDefaultStorage();
            const err = error;
            if (err && err.code !== "ENOENT") {
                console.warn(`[OuterGateStorage] Failed to load persisted data: ${err.message}. Falling back to defaults.`);
            }
        }
    }
    async persist() {
        await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
        await fs.writeFile(this.storagePath, JSON.stringify(this.data, null, 2), "utf8");
    }
    getIntegrationMeta(id) {
        return this.data.integrations[id];
    }
    getAllIntegrationMeta() {
        return Object.values(this.data.integrations);
    }
    async setIntegrationMeta(meta) {
        if (!meta) {
            return;
        }
        this.data.integrations[meta.id] = { ...meta };
        await this.persist();
    }
    async removeIntegrationMeta(id) {
        if (this.data.integrations[id]) {
            delete this.data.integrations[id];
            await this.persist();
        }
    }
    listInsights() {
        return Object.values(this.data.insights);
    }
    getInsight(id) {
        return this.data.insights[id];
    }
    async upsertInsights(insights) {
        if (!insights.length) {
            return;
        }
        for (const insight of insights) {
            this.data.insights[insight.id] = { ...insight };
        }
        await this.persist();
    }
    async removeInsight(id) {
        if (!this.data.insights[id]) {
            return false;
        }
        delete this.data.insights[id];
        await this.persist();
        return true;
    }
    async removeInsightsByIntegration(integrationId) {
        let didMutate = false;
        for (const [insightId, insight] of Object.entries(this.data.insights)) {
            if (insight.integrationId === integrationId) {
                delete this.data.insights[insightId];
                didMutate = true;
            }
        }
        if (didMutate) {
            await this.persist();
        }
    }
    async reset() {
        this.data = createDefaultStorage();
        await this.persist();
    }
}
//# sourceMappingURL=OuterGateStorage.js.map