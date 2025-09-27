import * as vscode from "vscode";
import * as path from "path";
import { TelemetryService } from "@roo-code/telemetry";
import { TelemetryEventName } from "@roo-code/types";
import { t } from "../../i18n";
/**
 * Manages the code indexing workflow, coordinating between different services and managers.
 */
export class CodeIndexOrchestrator {
    configManager;
    stateManager;
    workspacePath;
    cacheManager;
    vectorStore;
    scanner;
    fileWatcher;
    _fileWatcherSubscriptions = [];
    _isProcessing = false;
    constructor(configManager, stateManager, workspacePath, cacheManager, vectorStore, scanner, fileWatcher) {
        this.configManager = configManager;
        this.stateManager = stateManager;
        this.workspacePath = workspacePath;
        this.cacheManager = cacheManager;
        this.vectorStore = vectorStore;
        this.scanner = scanner;
        this.fileWatcher = fileWatcher;
    }
    /**
     * Starts the file watcher if not already running.
     */
    async _startWatcher() {
        if (!this.configManager.isFeatureConfigured) {
            throw new Error("Cannot start watcher: Service not configured.");
        }
        this.stateManager.setSystemState("Indexing", "Initializing file watcher...");
        try {
            await this.fileWatcher.initialize();
            this._fileWatcherSubscriptions = [
                this.fileWatcher.onDidStartBatchProcessing((filePaths) => { }),
                this.fileWatcher.onBatchProgressUpdate(({ processedInBatch, totalInBatch, currentFile }) => {
                    if (totalInBatch > 0 && this.stateManager.state !== "Indexing") {
                        this.stateManager.setSystemState("Indexing", "Processing file changes...");
                    }
                    this.stateManager.reportFileQueueProgress(processedInBatch, totalInBatch, currentFile ? path.basename(currentFile) : undefined);
                    if (processedInBatch === totalInBatch) {
                        // Covers (N/N) and (0/0)
                        if (totalInBatch > 0) {
                            // Batch with items completed
                            this.stateManager.setSystemState("Indexed", "File changes processed. Index up-to-date.");
                        }
                        else {
                            if (this.stateManager.state === "Indexing") {
                                // Only transition if it was "Indexing"
                                this.stateManager.setSystemState("Indexed", "Index up-to-date. File queue empty.");
                            }
                        }
                    }
                }),
                this.fileWatcher.onDidFinishBatchProcessing((summary) => {
                    if (summary.batchError) {
                        console.error(`[CodeIndexOrchestrator] Batch processing failed:`, summary.batchError);
                    }
                    else {
                        const successCount = summary.processedFiles.filter((f) => f.status === "success").length;
                        const errorCount = summary.processedFiles.filter((f) => f.status === "error" || f.status === "local_error").length;
                    }
                }),
            ];
        }
        catch (error) {
            console.error("[CodeIndexOrchestrator] Failed to start file watcher:", error);
            TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                location: "_startWatcher",
            });
            throw error;
        }
    }
    /**
     * Updates the status of a file in the state manager.
     */
    /**
     * Initiates the indexing process (initial scan and starts watcher).
     */
    async startIndexing() {
        // Check if workspace is available first
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            this.stateManager.setSystemState("Error", t("embeddings:orchestrator.indexingRequiresWorkspace"));
            console.warn("[CodeIndexOrchestrator] Start rejected: No workspace folder open.");
            return;
        }
        if (!this.configManager.isFeatureConfigured) {
            this.stateManager.setSystemState("Standby", "Missing configuration. Save your settings to start indexing.");
            console.warn("[CodeIndexOrchestrator] Start rejected: Missing configuration.");
            return;
        }
        if (this._isProcessing ||
            (this.stateManager.state !== "Standby" &&
                this.stateManager.state !== "Error" &&
                this.stateManager.state !== "Indexed")) {
            console.warn(`[CodeIndexOrchestrator] Start rejected: Already processing or in state ${this.stateManager.state}.`);
            return;
        }
        this._isProcessing = true;
        this.stateManager.setSystemState("Indexing", "Initializing services...");
        try {
            const collectionCreated = await this.vectorStore.initialize();
            if (collectionCreated) {
                await this.cacheManager.clearCacheFile();
            }
            this.stateManager.setSystemState("Indexing", "Services ready. Starting workspace scan...");
            let cumulativeBlocksIndexed = 0;
            let cumulativeBlocksFoundSoFar = 0;
            let batchErrors = [];
            const handleFileParsed = (fileBlockCount) => {
                cumulativeBlocksFoundSoFar += fileBlockCount;
                this.stateManager.reportBlockIndexingProgress(cumulativeBlocksIndexed, cumulativeBlocksFoundSoFar);
            };
            const handleBlocksIndexed = (indexedCount) => {
                cumulativeBlocksIndexed += indexedCount;
                this.stateManager.reportBlockIndexingProgress(cumulativeBlocksIndexed, cumulativeBlocksFoundSoFar);
            };
            const result = await this.scanner.scanDirectory(this.workspacePath, (batchError) => {
                console.error(`[CodeIndexOrchestrator] Error during initial scan batch: ${batchError.message}`, batchError);
                batchErrors.push(batchError);
            }, handleBlocksIndexed, handleFileParsed);
            if (!result) {
                throw new Error("Scan failed, is scanner initialized?");
            }
            const { stats } = result;
            // Check if any blocks were actually indexed successfully
            // If no blocks were indexed but blocks were found, it means all batches failed
            if (cumulativeBlocksIndexed === 0 && cumulativeBlocksFoundSoFar > 0) {
                if (batchErrors.length > 0) {
                    // Use the first batch error as it's likely representative of the main issue
                    const firstError = batchErrors[0];
                    throw new Error(`Indexing failed: ${firstError.message}`);
                }
                else {
                    throw new Error(t("embeddings:orchestrator.indexingFailedNoBlocks"));
                }
            }
            // Check for partial failures - if a significant portion of blocks failed
            const failureRate = (cumulativeBlocksFoundSoFar - cumulativeBlocksIndexed) / cumulativeBlocksFoundSoFar;
            if (batchErrors.length > 0 && failureRate > 0.1) {
                // More than 10% of blocks failed to index
                const firstError = batchErrors[0];
                throw new Error(`Indexing partially failed: Only ${cumulativeBlocksIndexed} of ${cumulativeBlocksFoundSoFar} blocks were indexed. ${firstError.message}`);
            }
            // CRITICAL: If there were ANY batch errors and NO blocks were successfully indexed,
            // this is a complete failure regardless of the failure rate calculation
            if (batchErrors.length > 0 && cumulativeBlocksIndexed === 0) {
                const firstError = batchErrors[0];
                throw new Error(`Indexing failed completely: ${firstError.message}`);
            }
            // Final sanity check: If we found blocks but indexed none and somehow no errors were reported,
            // this is still a failure
            if (cumulativeBlocksFoundSoFar > 0 && cumulativeBlocksIndexed === 0) {
                throw new Error(t("embeddings:orchestrator.indexingFailedCritical"));
            }
            await this._startWatcher();
            this.stateManager.setSystemState("Indexed", t("embeddings:orchestrator.fileWatcherStarted"));
        }
        catch (error) {
            console.error("[CodeIndexOrchestrator] Error during indexing:", error);
            TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                location: "startIndexing",
            });
            try {
                await this.vectorStore.clearCollection();
            }
            catch (cleanupError) {
                console.error("[CodeIndexOrchestrator] Failed to clean up after error:", cleanupError);
                TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
                    error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
                    stack: cleanupError instanceof Error ? cleanupError.stack : undefined,
                    location: "startIndexing.cleanup",
                });
            }
            await this.cacheManager.clearCacheFile();
            this.stateManager.setSystemState("Error", t("embeddings:orchestrator.failedDuringInitialScan", {
                errorMessage: error.message || t("embeddings:orchestrator.unknownError"),
            }));
            this.stopWatcher();
        }
        finally {
            this._isProcessing = false;
        }
    }
    /**
     * Stops the file watcher and cleans up resources.
     */
    stopWatcher() {
        this.fileWatcher.dispose();
        this._fileWatcherSubscriptions.forEach((sub) => sub.dispose());
        this._fileWatcherSubscriptions = [];
        if (this.stateManager.state !== "Error") {
            this.stateManager.setSystemState("Standby", t("embeddings:orchestrator.fileWatcherStopped"));
        }
        this._isProcessing = false;
    }
    /**
     * Clears all index data by stopping the watcher, clearing the vector store,
     * and resetting the cache file.
     */
    async clearIndexData() {
        this._isProcessing = true;
        try {
            await this.stopWatcher();
            try {
                if (this.configManager.isFeatureConfigured) {
                    await this.vectorStore.deleteCollection();
                }
                else {
                    console.warn("[CodeIndexOrchestrator] Service not configured, skipping vector collection clear.");
                }
            }
            catch (error) {
                console.error("[CodeIndexOrchestrator] Failed to clear vector collection:", error);
                TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                    location: "clearIndexData",
                });
                this.stateManager.setSystemState("Error", `Failed to clear vector collection: ${error.message}`);
            }
            await this.cacheManager.clearCacheFile();
            if (this.stateManager.state !== "Error") {
                this.stateManager.setSystemState("Standby", "Index data cleared successfully.");
            }
        }
        finally {
            this._isProcessing = false;
        }
    }
    /**
     * Gets the current state of the indexing system.
     */
    get state() {
        return this.stateManager.state;
    }
}
//# sourceMappingURL=orchestrator.js.map