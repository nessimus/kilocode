import { randomUUID } from "crypto";
import EventEmitter from "events";
import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";
import { endlessSurfaceAgentAccessSchema, endlessSurfaceDataSchema, endlessSurfaceMetadataSchema, endlessSurfaceNodeSchema, endlessSurfaceEdgeSchema, endlessSurfaceMutationRequestSchema, endlessSurfaceMutationSchema, endlessSurfaceMutationResultSchema, endlessSurfaceRecordSchema, endlessSurfaceSnapshotSchema, endlessSurfaceStateSchema, endlessSurfaceSummarySchema, } from "@roo-code/types";
const INDEX_FILE_VERSION = 1;
const indexFileSchema = endlessSurfaceStateSchema.extend({
    version: z.number().int().nonnegative().optional(),
});
export class EndlessSurfaceService extends EventEmitter {
    context;
    log;
    rootDir;
    indexFilePath;
    surfaceCache = new Map();
    summaryMap = new Map();
    state = endlessSurfaceStateSchema.parse({ enabled: false, surfaces: [] });
    loadingPromise = null;
    constructor(context, log = () => { }) {
        super();
        this.context = context;
        this.log = log;
        const storagePath = context.globalStorageUri.fsPath;
        this.rootDir = path.join(storagePath, "surfaces");
        this.indexFilePath = path.join(this.rootDir, "index.json");
    }
    async initialize() {
        if (!this.loadingPromise) {
            this.loadingPromise = this.loadIndex();
        }
        await this.loadingPromise;
    }
    getState() {
        return {
            ...this.state,
            surfaces: this.getSortedSummaries(),
        };
    }
    setEnabled(enabled) {
        if (this.state.enabled === enabled) {
            return;
        }
        this.state = { ...this.state, enabled };
        void this.saveIndex();
        this.emitState();
    }
    async listSummaries() {
        await this.initialize();
        return this.getSortedSummaries();
    }
    async getSurface(surfaceId) {
        await this.initialize();
        if (this.surfaceCache.has(surfaceId)) {
            return this.surfaceCache.get(surfaceId);
        }
        const recordPath = this.getSurfaceRecordPath(surfaceId);
        try {
            const raw = await fs.readFile(recordPath, "utf8");
            const parsed = endlessSurfaceRecordSchema.parse(JSON.parse(raw));
            this.surfaceCache.set(surfaceId, parsed);
            return parsed;
        }
        catch (error) {
            if (error?.code === "ENOENT") {
                return undefined;
            }
            this.log(`[EndlessSurfaceService] Failed to load surface ${surfaceId}: ${String(error)}`);
            throw error;
        }
    }
    async createSurface(title) {
        await this.initialize();
        const id = randomUUID();
        const now = Date.now();
        const metadata = endlessSurfaceMetadataSchema.parse({
            id,
            title: title?.trim() || "Untitled Surface",
            createdAt: now,
            updatedAt: now,
            agentAccess: this.state.defaultAgentAccess ?? endlessSurfaceAgentAccessSchema.parse("none"),
        });
        const record = endlessSurfaceRecordSchema.parse({
            meta: metadata,
            data: endlessSurfaceDataSchema.parse({
                nodes: [],
                edges: [],
                viewport: { x: 0, y: 0, zoom: 1 },
                settings: {
                    grid: "dots",
                    gridSize: 16,
                    snapToGrid: true,
                    autoLayout: "manual",
                    showGrid: true,
                    showMinimap: true,
                    showControls: true,
                    defaultNodeDensity: "comfortable",
                },
                theme: "light",
                background: "dots",
            }),
            assets: [],
        });
        await this.persistSurface(record);
        this.summaryMap.set(id, this.buildSummary(record));
        this.surfaceCache.set(id, record);
        this.state = {
            ...this.state,
            surfaces: this.getSortedSummaries(),
            activeSurfaceId: id,
        };
        await this.saveIndex();
        this.emitState();
        this.emit("surfaceUpdated", record);
        return record;
    }
    async updateSurface(record) {
        await this.initialize();
        const parsed = endlessSurfaceRecordSchema.parse(record);
        await this.persistSurface(parsed);
        this.surfaceCache.set(parsed.meta.id, parsed);
        this.summaryMap.set(parsed.meta.id, this.buildSummary(parsed));
        await this.saveIndex();
        this.emitState();
        this.emit("surfaceUpdated", parsed);
    }
    async deleteSurface(surfaceId) {
        await this.initialize();
        const exists = this.summaryMap.has(surfaceId) || this.surfaceCache.has(surfaceId);
        if (!exists) {
            return false;
        }
        this.surfaceCache.delete(surfaceId);
        this.summaryMap.delete(surfaceId);
        const surfaceDir = path.join(this.rootDir, surfaceId);
        try {
            await fs.rm(surfaceDir, { recursive: true, force: true });
        }
        catch (error) {
            this.log(`[EndlessSurfaceService] Failed to delete surface ${surfaceId}: ${String(error)}`);
            throw error;
        }
        const wasActive = this.state.activeSurfaceId === surfaceId;
        this.state = {
            ...this.state,
            activeSurfaceId: wasActive ? undefined : this.state.activeSurfaceId,
            surfaces: this.getSortedSummaries(),
        };
        await this.saveIndex();
        this.emitState();
        this.emit("surfaceDeleted", surfaceId);
        return true;
    }
    async getSurfaceData(surfaceId) {
        const record = await this.getSurface(surfaceId);
        if (!record) {
            return undefined;
        }
        return this.cloneRecord(record);
    }
    async createNode(surfaceId, node) {
        const parsed = endlessSurfaceNodeSchema.parse(node);
        return this.mutateSurfaceRecord(surfaceId, (draft) => {
            if (draft.data.nodes.some((existing) => existing.id === parsed.id)) {
                throw new Error(`Node with id ${parsed.id} already exists`);
            }
            draft.data.nodes.push(parsed);
        });
    }
    async updateNode(surfaceId, node) {
        const parsed = endlessSurfaceNodeSchema.parse(node);
        return this.mutateSurfaceRecord(surfaceId, (draft) => {
            const index = draft.data.nodes.findIndex((existing) => existing.id === parsed.id);
            if (index === -1) {
                throw new Error(`Node with id ${parsed.id} not found`);
            }
            draft.data.nodes[index] = parsed;
        });
    }
    async deleteNode(surfaceId, nodeId) {
        return this.mutateSurfaceRecord(surfaceId, (draft) => {
            const index = draft.data.nodes.findIndex((existing) => existing.id === nodeId);
            if (index === -1) {
                throw new Error(`Node with id ${nodeId} not found`);
            }
            draft.data.nodes.splice(index, 1);
        });
    }
    async createEdge(surfaceId, edge) {
        const parsed = endlessSurfaceEdgeSchema.parse(edge);
        return this.mutateSurfaceRecord(surfaceId, (draft) => {
            if (draft.data.edges.some((existing) => existing.id === parsed.id)) {
                throw new Error(`Edge with id ${parsed.id} already exists`);
            }
            draft.data.edges.push(parsed);
        });
    }
    async updateEdge(surfaceId, edge) {
        const parsed = endlessSurfaceEdgeSchema.parse(edge);
        return this.mutateSurfaceRecord(surfaceId, (draft) => {
            const index = draft.data.edges.findIndex((existing) => existing.id === parsed.id);
            if (index === -1) {
                throw new Error(`Edge with id ${parsed.id} not found`);
            }
            draft.data.edges[index] = parsed;
        });
    }
    async deleteEdge(surfaceId, edgeId) {
        return this.mutateSurfaceRecord(surfaceId, (draft) => {
            const index = draft.data.edges.findIndex((existing) => existing.id === edgeId);
            if (index === -1) {
                throw new Error(`Edge with id ${edgeId} not found`);
            }
            draft.data.edges.splice(index, 1);
        });
    }
    async mutateSurfaceRecord(surfaceId, mutate) {
        const source = await this.getSurface(surfaceId);
        if (!source) {
            throw new Error(`Surface not found: ${surfaceId}`);
        }
        const draft = this.cloneRecord(source);
        mutate(draft);
        draft.meta = endlessSurfaceMetadataSchema.parse({
            ...draft.meta,
            updatedAt: Date.now(),
        });
        await this.updateSurface(draft);
        return this.surfaceCache.get(surfaceId) ?? draft;
    }
    cloneRecord(record) {
        return JSON.parse(JSON.stringify(record));
    }
    async setActiveSurface(surfaceId) {
        await this.initialize();
        if (this.state.activeSurfaceId === surfaceId) {
            return;
        }
        this.state = { ...this.state, activeSurfaceId: surfaceId ?? undefined };
        await this.saveIndex();
        this.emitState();
    }
    async applyMutations(request) {
        await this.initialize();
        const parsed = endlessSurfaceMutationRequestSchema.parse(request);
        const record = await this.getSurface(parsed.surfaceId);
        if (!record) {
            return endlessSurfaceMutationResultSchema.parse({
                surfaceId: parsed.surfaceId,
                success: false,
                error: "Surface not found",
                requestId: parsed.requestId,
            });
        }
        let updated = this.cloneRecord(record);
        for (const mutation of parsed.mutations) {
            updated = this.applyMutation(updated, mutation);
        }
        updated.meta = endlessSurfaceMetadataSchema.parse({
            ...updated.meta,
            updatedAt: Date.now(),
        });
        await this.updateSurface(updated);
        return endlessSurfaceMutationResultSchema.parse({
            surfaceId: parsed.surfaceId,
            success: true,
            requestId: parsed.requestId,
        });
    }
    async registerSnapshot(snapshot) {
        await this.initialize();
        const parsed = endlessSurfaceSnapshotSchema.parse(snapshot);
        this.emit("snapshotGenerated", parsed);
    }
    async updateDefaultAgentAccess(access) {
        await this.initialize();
        const parsed = endlessSurfaceAgentAccessSchema.parse(access);
        if (this.state.defaultAgentAccess === parsed) {
            return;
        }
        this.state = { ...this.state, defaultAgentAccess: parsed };
        await this.saveIndex();
        this.emitState();
    }
    async loadIndex() {
        await fs.mkdir(this.rootDir, { recursive: true });
        try {
            const raw = await fs.readFile(this.indexFilePath, "utf8");
            const parsed = JSON.parse(raw);
            if (typeof parsed.version !== "number") {
                this.log(`[EndlessSurfaceService] Invalid version in index file: ${JSON.stringify(parsed.version)}. Resetting to ${INDEX_FILE_VERSION}.`);
                delete parsed.version;
            }
            const result = indexFileSchema.safeParse({ ...parsed, version: INDEX_FILE_VERSION });
            if (!result.success) {
                this.log("[EndlessSurfaceService] Failed to parse index file, resetting state:", result.error.flatten().fieldErrors);
                this.state = endlessSurfaceStateSchema.parse({ enabled: false, surfaces: [] });
                return;
            }
            const index = result.data;
            this.state = {
                ...index,
                enabled: index.enabled ?? false,
                defaultAgentAccess: index.defaultAgentAccess ?? "none",
            };
            for (const summary of index.surfaces ?? []) {
                const safeSummary = endlessSurfaceSummarySchema.parse(summary);
                this.summaryMap.set(safeSummary.id, safeSummary);
            }
        }
        catch (error) {
            if (error?.code === "ENOENT") {
                this.state = endlessSurfaceStateSchema.parse({ enabled: false, surfaces: [] });
                return;
            }
            this.log(`[EndlessSurfaceService] Failed to load index: ${String(error)}`);
            throw error;
        }
    }
    async saveIndex() {
        const payload = indexFileSchema.parse({
            ...this.state,
            version: INDEX_FILE_VERSION,
            surfaces: this.getSortedSummaries(),
        });
        await fs.mkdir(this.rootDir, { recursive: true });
        await fs.writeFile(this.indexFilePath, JSON.stringify(payload, null, 2), "utf8");
    }
    getSurfaceRecordPath(surfaceId) {
        return path.join(this.rootDir, surfaceId, "record.json");
    }
    async persistSurface(record) {
        const surfaceDir = path.join(this.rootDir, record.meta.id);
        await fs.mkdir(surfaceDir, { recursive: true });
        await fs.writeFile(this.getSurfaceRecordPath(record.meta.id), JSON.stringify(record, null, 2), "utf8");
    }
    buildSummary(record) {
        return endlessSurfaceSummarySchema.parse({
            id: record.meta.id,
            title: record.meta.title,
            description: record.meta.description,
            createdAt: record.meta.createdAt,
            updatedAt: record.meta.updatedAt,
            lastOpenedAt: record.meta.lastOpenedAt,
            agentAccess: record.meta.agentAccess,
            tags: record.meta.tags,
            favorite: record.meta.favorite,
        });
    }
    getSortedSummaries() {
        return Array.from(this.summaryMap.values()).sort((a, b) => {
            if (a.updatedAt === b.updatedAt) {
                return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
            }
            return b.updatedAt - a.updatedAt;
        });
    }
    applyMutation(record, mutation) {
        const parsed = endlessSurfaceMutationSchema.parse(mutation);
        const clone = record;
        const { path: pointer, value, op } = parsed;
        if (pointer.length === 0) {
            throw new Error("Mutation path cannot be empty");
        }
        const parentPath = pointer.slice(0, -1);
        const key = pointer[pointer.length - 1];
        const parent = this.resolvePointer(clone, parentPath, op === "insert" || op === "merge");
        if (op === "delete") {
            if (Array.isArray(parent) && typeof key === "number") {
                parent.splice(key, 1);
            }
            else if (parent && typeof parent === "object") {
                delete parent[key];
            }
            return clone;
        }
        if (op === "insert") {
            if (!Array.isArray(parent)) {
                throw new Error("Insert operations require array parent");
            }
            typeof key === "number" ? parent.splice(key, 0, value) : parent.push(value);
            return clone;
        }
        if (op === "merge") {
            const target = this.resolvePointer(clone, pointer, true);
            if (target && typeof target === "object" && !Array.isArray(target) && value && typeof value === "object") {
                Object.assign(target, value);
                return clone;
            }
        }
        const targetParent = this.resolvePointer(clone, parentPath, true);
        if (Array.isArray(targetParent) && typeof key === "number") {
            targetParent[key] = value;
        }
        else if (targetParent && typeof targetParent === "object") {
            targetParent[key] = value;
        }
        return clone;
    }
    resolvePointer(root, pointer, createMissing) {
        let current = root;
        for (const segment of pointer) {
            if (Array.isArray(current)) {
                const index = typeof segment === "number" ? segment : parseInt(String(segment), 10);
                if (!Number.isFinite(index)) {
                    throw new Error(`Invalid array index: ${segment}`);
                }
                if (!current[index]) {
                    if (!createMissing) {
                        throw new Error(`Missing array entry at ${segment}`);
                    }
                    current[index] = {};
                }
                current = current[index];
                continue;
            }
            if (current == null || typeof current !== "object") {
                if (!createMissing) {
                    throw new Error("Cannot traverse non-object value");
                }
                current = {};
            }
            if (!(segment in current)) {
                if (!createMissing) {
                    throw new Error(`Missing key ${String(segment)}`);
                }
                ;
                current[segment] = {};
            }
            current = current[segment];
        }
        return current;
    }
    emitState() {
        this.emit("stateChanged", this.getState());
    }
}
//# sourceMappingURL=EndlessSurfaceService.js.map