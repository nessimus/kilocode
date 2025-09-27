import { OuterGateStorage } from "./OuterGateStorage";
const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2025-09-03";
const DEFAULT_NOTION_PAGE_SIZE = 50;
const MIRO_API_BASE = "https://api.miro.com/v2";
const DEFAULT_MIRO_PAGE_SIZE = 50;
const ZIP_SUPPORTED_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".html", ".htm", ".rtf"]);
const MAX_IMPORTED_ITEMS = 100;
const toIso = (value) => {
    if (!value) {
        return new Date().toISOString();
    }
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? new Date().toISOString() : new Date(timestamp).toISOString();
};
const truncate = (text, limit = 280) => {
    if (text.length <= limit) {
        return text;
    }
    return `${text.slice(0, limit - 1).trim()}…`;
};
const stripHtml = (raw) => raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const sanitizeLabel = (value) => {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};
export class OuterGateIntegrationManager {
    contextProxy;
    storage;
    getActiveWorkspaceName;
    constructor(contextProxy, storage, getActiveWorkspaceName) {
        this.contextProxy = contextProxy;
        this.storage = storage;
        this.getActiveWorkspaceName = getActiveWorkspaceName;
    }
    static async initialize(contextProxy, getActiveWorkspaceName) {
        const storageDir = contextProxy.globalStorageUri.fsPath;
        const storage = await OuterGateStorage.create(storageDir);
        return new OuterGateIntegrationManager(contextProxy, storage, getActiveWorkspaceName);
    }
    applyToState(base) {
        const metaById = new Map(this.storage.getAllIntegrationMeta().map((meta) => [meta.id, meta]));
        const enriched = {
            ...base,
            integrations: base.integrations.map((integration) => {
                const meta = metaById.get(integration.id);
                if (!meta) {
                    if (integration.id === "life-hq") {
                        return {
                            ...integration,
                            description: "LifeHQ API integration is coming soon. We’ll enable this stream the moment their endpoints open up.",
                        };
                    }
                    if (integration.id === "drive") {
                        return {
                            ...integration,
                            description: "Google Drive import is on the roadmap. Connect Notion, Miro, or ZIP archives in the meantime.",
                        };
                    }
                    return { ...integration };
                }
                const description = this.buildIntegrationDescription(meta);
                return {
                    ...integration,
                    status: this.resolveIntegrationStatus(integration, meta),
                    description,
                };
            }),
        };
        const storedInsights = this.storage.listInsights().sort((a, b) => {
            const aTime = Date.parse(a.capturedAtIso ?? a.upsertedAtIso);
            const bTime = Date.parse(b.capturedAtIso ?? b.upsertedAtIso);
            return bTime - aTime;
        });
        if (storedInsights.length) {
            const existingIds = new Set(enriched.recentInsights.map((insight) => insight.id));
            for (const insight of storedInsights) {
                if (!existingIds.has(insight.id)) {
                    enriched.recentInsights.unshift({ ...insight });
                    existingIds.add(insight.id);
                }
            }
            const readyCount = storedInsights.filter((entry) => entry.stage === "ready").length;
            const processingCount = storedInsights.filter((entry) => entry.stage === "processing").length;
            const capturedCount = storedInsights.length;
            enriched.analysisPool = {
                ...enriched.analysisPool,
                totalCaptured: enriched.analysisPool.totalCaptured + capturedCount,
                ready: enriched.analysisPool.ready + readyCount,
                processing: enriched.analysisPool.processing + processingCount,
                lastUpdatedIso: storedInsights[0].capturedAtIso ?? storedInsights[0].upsertedAtIso,
            };
        }
        // Ensure LifeHQ placeholder exists even without stored metadata.
        const hasLifeHq = enriched.integrations.some((integration) => integration.id === "life-hq");
        if (!hasLifeHq) {
            enriched.integrations.push({
                id: "life-hq",
                name: "Life HQ",
                status: "coming_soon",
                providerIcon: "codicon-organization",
                description: "LifeHQ integration will appear here once their API launches later this quarter.",
            });
        }
        return enriched;
    }
    getStoredMeta(id) {
        return this.storage.getIntegrationMeta(id);
    }
    async disconnectIntegration(id) {
        await this.storage.removeIntegrationMeta(id);
        await this.storage.removeInsightsByIntegration(id);
        if (id === "notion") {
            await this.contextProxy.storeSecret("outerGateNotionToken", undefined);
        }
        if (id === "miro") {
            await this.contextProxy.storeSecret("outerGateMiroToken", undefined);
        }
    }
    getStoredInsightById(id) {
        return this.storage.getInsight(id);
    }
    listStoredInsights() {
        const toTimestamp = (entry) => {
            const reference = entry.capturedAtIso ?? entry.upsertedAtIso;
            if (!reference) {
                return 0;
            }
            const parsed = Date.parse(reference);
            return Number.isNaN(parsed) ? 0 : parsed;
        };
        return this.storage
            .listInsights()
            .slice()
            .sort((a, b) => toTimestamp(b) - toTimestamp(a))
            .map((insight) => ({ ...insight }));
    }
    async upsertInsights(insights) {
        await this.storage.upsertInsights(insights);
    }
    async importNotion(options) {
        const existingMeta = this.storage.getIntegrationMeta("notion");
        const secretToken = options.token?.trim() || this.contextProxy.getSecret("outerGateNotionToken");
        if (!secretToken) {
            throw new Error("Enter a Notion integration token to connect.");
        }
        const databaseId = options.databaseId?.trim() || sanitizeLabel(existingMeta?.extra?.databaseId);
        if (!databaseId) {
            throw new Error("Database ID is required to sync Notion content.");
        }
        const maxPages = options.maxPages && options.maxPages > 0 ? options.maxPages : MAX_IMPORTED_ITEMS;
        const pageSize = options.pageSize && options.pageSize > 0
            ? Math.min(options.pageSize, MAX_IMPORTED_ITEMS)
            : DEFAULT_NOTION_PAGE_SIZE;
        let dataSourceId = options.dataSourceId?.trim() || sanitizeLabel(existingMeta?.extra?.dataSourceId);
        const queryResult = await this.queryNotionDatabase({
            token: secretToken,
            databaseId,
            dataSourceId,
            pageSize,
            maxPages,
        });
        if (!dataSourceId && queryResult.dataSourceId) {
            dataSourceId = queryResult.dataSourceId;
        }
        const databaseTitle = await this.fetchNotionDatabaseTitle(secretToken, databaseId);
        const insights = queryResult.pages.map((page) => this.transformNotionPage(page, databaseTitle ?? databaseId));
        await this.contextProxy.storeSecret("outerGateNotionToken", secretToken);
        await this.storage.removeInsightsByIntegration("notion");
        await this.storage.upsertInsights(insights);
        const meta = {
            id: "notion",
            status: "connected",
            lastSyncedAtIso: new Date().toISOString(),
            recordCount: insights.length,
            targetLabel: databaseTitle ?? databaseId,
            extra: {
                databaseId,
                dataSourceId,
            },
        };
        await this.storage.setIntegrationMeta(meta);
        return {
            meta,
            insights,
        };
    }
    async recordIntegrationError(id, message, extra) {
        const existing = this.storage.getIntegrationMeta(id);
        const mergedExtra = {
            ...(existing?.extra ?? {}),
            ...(extra?.extra ?? {}),
        };
        const candidateLabel = sanitizeLabel(extra?.targetLabel) ??
            sanitizeLabel(existing?.targetLabel) ??
            sanitizeLabel(mergedExtra.databaseId) ??
            sanitizeLabel(mergedExtra.boardId);
        const meta = {
            id,
            status: "error",
            errorMessage: truncate(message, 320),
            lastSyncedAtIso: new Date().toISOString(),
            recordCount: existing?.recordCount,
            targetLabel: candidateLabel,
            extra: mergedExtra,
        };
        await this.storage.setIntegrationMeta(meta);
    }
    async importMiro(options) {
        const existingMeta = this.storage.getIntegrationMeta("miro");
        const token = options.token?.trim() || this.contextProxy.getSecret("outerGateMiroToken");
        if (!token) {
            throw new Error("Enter a Miro access token to connect.");
        }
        const boardId = options.boardId?.trim() || sanitizeLabel(existingMeta?.extra?.boardId);
        if (!boardId) {
            throw new Error("Board ID is required to sync Miro content.");
        }
        const itemTypes = options.itemTypes?.length ? options.itemTypes : ["sticky_note", "text"];
        const maxItems = options.maxItems && options.maxItems > 0
            ? Math.min(options.maxItems, MAX_IMPORTED_ITEMS)
            : MAX_IMPORTED_ITEMS;
        const { items } = await this.queryMiroBoard({ token, boardId, itemTypes, maxItems });
        const boardName = await this.fetchMiroBoardName(token, boardId);
        const insights = items.map((item) => this.transformMiroItem(item, boardName ?? boardId));
        await this.contextProxy.storeSecret("outerGateMiroToken", token);
        await this.storage.removeInsightsByIntegration("miro");
        await this.storage.upsertInsights(insights);
        const meta = {
            id: "miro",
            status: "connected",
            lastSyncedAtIso: new Date().toISOString(),
            recordCount: insights.length,
            targetLabel: boardName ?? boardId,
            extra: {
                boardId,
                itemTypes: itemTypes.join(","),
            },
        };
        await this.storage.setIntegrationMeta(meta);
        return {
            meta,
            insights,
        };
    }
    async importZipArchive(zipPath) {
        const result = await this.processZipArchive(zipPath);
        await this.storage.removeInsightsByIntegration("zip-file");
        await this.storage.upsertInsights(result.insights);
        await this.storage.setIntegrationMeta(result.meta);
        return result;
    }
    resolveIntegrationStatus(integration, meta) {
        if (meta.status === "connected") {
            return "connected";
        }
        if (integration.status === "coming_soon") {
            return "coming_soon";
        }
        return "not_connected";
    }
    buildIntegrationDescription(meta) {
        if (meta.status === "error" && meta.errorMessage) {
            return meta.errorMessage;
        }
        if (meta.status === "pending") {
            return meta.description;
        }
        const label = meta.targetLabel ?? meta.extra?.databaseId ?? meta.extra?.boardId ?? meta.id;
        const count = meta.recordCount ?? 0;
        const synced = meta.lastSyncedAtIso
            ? new Date(meta.lastSyncedAtIso).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
            })
            : "recently";
        return `${count} items synced from ${label} • Updated ${synced}`;
    }
    async queryNotionDatabase(options) {
        const pages = [];
        let hasMore = true;
        let startCursor;
        let effectiveDataSourceId = options.dataSourceId;
        while (hasMore && pages.length < (options.maxPages ?? MAX_IMPORTED_ITEMS)) {
            const body = {
                page_size: Math.min(options.pageSize ?? DEFAULT_NOTION_PAGE_SIZE, (options.maxPages ?? MAX_IMPORTED_ITEMS) - pages.length),
                start_cursor: startCursor,
            };
            const endpoint = effectiveDataSourceId
                ? `${NOTION_API_BASE}/data_sources/${effectiveDataSourceId}/query`
                : `${NOTION_API_BASE}/databases/${options.databaseId}/query`;
            const response = await fetch(endpoint, {
                method: "POST",
                headers: this.getNotionHeaders(options.token),
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                const error = await this.parseNotionError(response);
                if (!effectiveDataSourceId && error?.code === "multiple_data_sources_for_database") {
                    const childIds = error.additional_data?.child_data_source_ids ?? [];
                    if (childIds.length > 0) {
                        effectiveDataSourceId = childIds[0];
                        // Retry immediately with the first child data source id.
                        continue;
                    }
                }
                throw new Error(error?.message || `Notion query failed with status ${response.status}`);
            }
            const json = (await response.json());
            pages.push(...json.results);
            hasMore = Boolean(json.has_more);
            startCursor = json.next_cursor ?? undefined;
            if (!json.next_cursor) {
                break;
            }
        }
        return { pages, dataSourceId: effectiveDataSourceId };
    }
    async parseNotionError(response) {
        try {
            return (await response.json());
        }
        catch (error) {
            return {
                status: response.status,
                message: `Notion API returned status ${response.status}`,
            };
        }
    }
    getNotionHeaders(token) {
        return {
            Authorization: `Bearer ${token}`,
            "Notion-Version": NOTION_API_VERSION,
            "Content-Type": "application/json",
        };
    }
    transformNotionPage(page, sourceLabel) {
        const title = this.extractNotionTitle(page);
        const summary = this.extractNotionSummary(page);
        const capturedAtIso = toIso(page.last_edited_time ?? page.created_time);
        const recommendedWorkspace = this.getActiveWorkspaceName();
        const base = {
            id: `notion:${page.id}`,
            title: title || `${sourceLabel} page`,
            sourceType: "integration",
            summary: summary,
            stage: "ready",
            recommendedWorkspace,
            capturedAtIso,
            assignedCompanyId: recommendedWorkspace,
        };
        return {
            ...base,
            integrationId: "notion",
            upsertedAtIso: new Date().toISOString(),
        };
    }
    extractNotionTitle(page) {
        if (!page.properties) {
            return "Untitled";
        }
        for (const property of Object.values(page.properties)) {
            if (property.type === "title" && property.title?.length) {
                const text = property.title
                    .map((node) => node.plain_text ?? "")
                    .join(" ")
                    .trim();
                if (text) {
                    return text;
                }
            }
        }
        return "Untitled";
    }
    extractNotionSummary(page) {
        if (!page.properties) {
            return page.url ? truncate(page.url, 240) : undefined;
        }
        const segments = [];
        for (const [key, property] of Object.entries(page.properties)) {
            if (property.type === "rich_text" && property.rich_text?.length) {
                const text = property.rich_text
                    .map((node) => node.plain_text ?? "")
                    .join(" ")
                    .trim();
                if (text) {
                    segments.push(`${key}: ${text}`);
                }
            }
            if (property.type === "title" && property.title?.length) {
                const text = property.title
                    .map((node) => node.plain_text ?? "")
                    .join(" ")
                    .trim();
                if (text) {
                    segments.push(`${key}: ${text}`);
                }
            }
            if (property.type === "multi_select" && property.multi_select?.length) {
                const labels = property.multi_select.map((item) => item.name).filter(Boolean);
                if (labels.length) {
                    segments.push(`${key}: ${labels.join(", ")}`);
                }
            }
            if (property.type === "select" && property.select?.name) {
                segments.push(`${key}: ${property.select.name}`);
            }
            if (property.type === "status" && property.status?.name) {
                segments.push(`${key}: ${property.status.name}`);
            }
        }
        const url = page.url ? `Source: ${page.url}` : undefined;
        const joined = segments.slice(0, 4).join(" · ");
        const summary = truncate(joined || url || "Imported from Notion", 340);
        return summary;
    }
    async fetchNotionDatabaseTitle(token, databaseId) {
        try {
            const response = await fetch(`${NOTION_API_BASE}/databases/${databaseId}`, {
                headers: this.getNotionHeaders(token),
            });
            if (!response.ok) {
                return undefined;
            }
            const json = (await response.json());
            const title = json.title
                ?.map((node) => node.plain_text ?? "")
                .join(" ")
                .trim();
            return title || undefined;
        }
        catch (error) {
            return undefined;
        }
    }
    async queryMiroBoard(options) {
        const items = [];
        let nextUrl = `${MIRO_API_BASE}/boards/${options.boardId}/items?limit=${Math.min(DEFAULT_MIRO_PAGE_SIZE, options.maxItems ?? MAX_IMPORTED_ITEMS)}${options.itemTypes?.length ? `&type=${options.itemTypes.join(",")}` : ""}`;
        while (nextUrl && items.length < (options.maxItems ?? MAX_IMPORTED_ITEMS)) {
            const response = await fetch(nextUrl, {
                headers: {
                    Authorization: `Bearer ${options.token}`,
                    Accept: "application/json",
                },
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Miro API error (${response.status}): ${text}`);
            }
            const json = (await response.json());
            items.push(...json.data);
            nextUrl = json._links?.next;
            if (!json._links?.next) {
                break;
            }
        }
        return { items };
    }
    transformMiroItem(item, boardLabel) {
        const rawContent = item.data?.content || item.data?.title || "";
        const textContent = rawContent ? stripHtml(rawContent) : "";
        const title = truncate(textContent || `${boardLabel} item`, 120);
        const summary = textContent ? truncate(textContent, 340) : `${boardLabel} item synced from Miro`;
        const timestamp = toIso(item.modifiedAt ?? item.createdAt);
        const recommendedWorkspace = this.getActiveWorkspaceName();
        const base = {
            id: `miro:${item.id}`,
            title,
            summary,
            sourceType: "integration",
            stage: "captured",
            recommendedWorkspace,
            capturedAtIso: timestamp,
            assignedCompanyId: recommendedWorkspace,
        };
        return {
            ...base,
            integrationId: "miro",
            upsertedAtIso: new Date().toISOString(),
        };
    }
    async fetchMiroBoardName(token, boardId) {
        try {
            const response = await fetch(`${MIRO_API_BASE}/boards/${boardId}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json",
                },
            });
            if (!response.ok) {
                return undefined;
            }
            const json = (await response.json());
            return json.name ?? undefined;
        }
        catch (error) {
            return undefined;
        }
    }
    async processZipArchive(zipPath) {
        const { default: JSZip } = await import("jszip");
        const fs = await import("fs/promises");
        const path = await import("path");
        const buffer = await fs.readFile(zipPath);
        const archive = await JSZip.loadAsync(buffer);
        const insights = [];
        const now = new Date().toISOString();
        const recommendedWorkspace = this.getActiveWorkspaceName();
        const archiveLabel = path.basename(zipPath);
        let processed = 0;
        for (const entryName of Object.keys(archive.files)) {
            if (processed >= MAX_IMPORTED_ITEMS) {
                break;
            }
            const entry = archive.files[entryName];
            if (!entry || entry.dir) {
                continue;
            }
            const ext = path.extname(entry.name).toLowerCase();
            if (!ZIP_SUPPORTED_EXTENSIONS.has(ext)) {
                continue;
            }
            const content = await entry.async("string");
            const text = content.replace(/\s+/g, " ").trim();
            if (!text) {
                continue;
            }
            const title = truncate(`${archiveLabel}: ${entry.name}`, 120);
            const summary = truncate(text, 340);
            enhanceInsights(insights, {
                id: `zip:${entry.name}`,
                title,
                summary,
                sourceType: "document",
                stage: "ready",
                recommendedWorkspace,
                capturedAtIso: now,
                assignedCompanyId: recommendedWorkspace,
            }, "zip-file", now);
            processed += 1;
        }
        const meta = {
            id: "zip-file",
            status: "connected",
            lastSyncedAtIso: now,
            recordCount: insights.length,
            targetLabel: archiveLabel,
            extra: {
                archivePath: zipPath,
            },
        };
        return { insights, meta };
    }
}
function enhanceInsights(collector, base, integrationId, uploadedAtIso) {
    collector.push({
        ...base,
        integrationId,
        upsertedAtIso: uploadedAtIso,
    });
}
//# sourceMappingURL=OuterGateIntegrationManager.js.map