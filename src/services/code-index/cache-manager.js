import * as vscode from "vscode";
import { createHash } from "crypto";
import debounce from "lodash.debounce";
import { safeWriteJson } from "../../utils/safeWriteJson";
import { TelemetryService } from "@roo-code/telemetry";
import { TelemetryEventName } from "@roo-code/types";
/**
 * Manages the cache for code indexing
 */
export class CacheManager {
    context;
    workspacePath;
    cachePath;
    fileHashes = {};
    _debouncedSaveCache;
    /**
     * Creates a new cache manager
     * @param context VS Code extension context
     * @param workspacePath Path to the workspace
     */
    constructor(context, workspacePath) {
        this.context = context;
        this.workspacePath = workspacePath;
        this.cachePath = vscode.Uri.joinPath(context.globalStorageUri, `roo-index-cache-${createHash("sha256").update(workspacePath).digest("hex")}.json`);
        this._debouncedSaveCache = debounce(async () => {
            await this._performSave();
        }, 1500);
    }
    /**
     * Initializes the cache manager by loading the cache file
     */
    async initialize() {
        try {
            const cacheData = await vscode.workspace.fs.readFile(this.cachePath);
            this.fileHashes = JSON.parse(cacheData.toString());
        }
        catch (error) {
            this.fileHashes = {};
            TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                location: "initialize",
            });
        }
    }
    /**
     * Saves the cache to disk
     */
    async _performSave() {
        try {
            await safeWriteJson(this.cachePath.fsPath, this.fileHashes);
        }
        catch (error) {
            console.error("Failed to save cache:", error);
            TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                location: "_performSave",
            });
        }
    }
    /**
     * Clears the cache file by writing an empty object to it
     */
    async clearCacheFile() {
        try {
            await safeWriteJson(this.cachePath.fsPath, {});
            this.fileHashes = {};
        }
        catch (error) {
            console.error("Failed to clear cache file:", error, this.cachePath);
            TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                location: "clearCacheFile",
            });
        }
    }
    /**
     * Gets the hash for a file path
     * @param filePath Path to the file
     * @returns The hash for the file or undefined if not found
     */
    getHash(filePath) {
        return this.fileHashes[filePath];
    }
    /**
     * Updates the hash for a file path
     * @param filePath Path to the file
     * @param hash New hash value
     */
    updateHash(filePath, hash) {
        this.fileHashes[filePath] = hash;
        this._debouncedSaveCache();
    }
    /**
     * Deletes the hash for a file path
     * @param filePath Path to the file
     */
    deleteHash(filePath) {
        delete this.fileHashes[filePath];
        this._debouncedSaveCache();
    }
    /**
     * Gets a copy of all file hashes
     * @returns A copy of the file hashes record
     */
    getAllHashes() {
        return { ...this.fileHashes };
    }
}
//# sourceMappingURL=cache-manager.js.map