import * as vscode from "vscode";
import { OpenAiEmbedder } from "./embedders/openai";
import { CodeIndexOllamaEmbedder } from "./embedders/ollama";
import { OpenAICompatibleEmbedder } from "./embedders/openai-compatible";
import { GeminiEmbedder } from "./embedders/gemini";
import { MistralEmbedder } from "./embedders/mistral";
import { VercelAiGatewayEmbedder } from "./embedders/vercel-ai-gateway";
import { getDefaultModelId, getModelDimension } from "../../shared/embeddingModels";
import { QdrantVectorStore } from "./vector-store/qdrant-client";
import { codeParser, DirectoryScanner, FileWatcher } from "./processors";
import { t } from "../../i18n";
import { TelemetryService } from "@roo-code/telemetry";
import { TelemetryEventName } from "@roo-code/types";
import { Package } from "../../shared/package";
import { BATCH_SEGMENT_THRESHOLD } from "./constants";
/**
 * Factory class responsible for creating and configuring code indexing service dependencies.
 */
export class CodeIndexServiceFactory {
    configManager;
    workspacePath;
    cacheManager;
    constructor(configManager, workspacePath, cacheManager) {
        this.configManager = configManager;
        this.workspacePath = workspacePath;
        this.cacheManager = cacheManager;
    }
    /**
     * Creates an embedder instance based on the current configuration.
     */
    createEmbedder() {
        const config = this.configManager.getConfig();
        const provider = config.embedderProvider;
        if (provider === "openai") {
            const apiKey = config.openAiOptions?.openAiNativeApiKey;
            if (!apiKey) {
                throw new Error(t("embeddings:serviceFactory.openAiConfigMissing"));
            }
            return new OpenAiEmbedder({
                ...config.openAiOptions,
                openAiEmbeddingModelId: config.modelId,
            });
        }
        else if (provider === "ollama") {
            if (!config.ollamaOptions?.ollamaBaseUrl) {
                throw new Error(t("embeddings:serviceFactory.ollamaConfigMissing"));
            }
            return new CodeIndexOllamaEmbedder({
                ...config.ollamaOptions,
                ollamaModelId: config.modelId,
            });
        }
        else if (provider === "openai-compatible") {
            if (!config.openAiCompatibleOptions?.baseUrl || !config.openAiCompatibleOptions?.apiKey) {
                throw new Error(t("embeddings:serviceFactory.openAiCompatibleConfigMissing"));
            }
            return new OpenAICompatibleEmbedder(config.openAiCompatibleOptions.baseUrl, config.openAiCompatibleOptions.apiKey, config.modelId);
        }
        else if (provider === "gemini") {
            if (!config.geminiOptions?.apiKey) {
                throw new Error(t("embeddings:serviceFactory.geminiConfigMissing"));
            }
            return new GeminiEmbedder(config.geminiOptions.apiKey, config.modelId);
        }
        else if (provider === "mistral") {
            if (!config.mistralOptions?.apiKey) {
                throw new Error(t("embeddings:serviceFactory.mistralConfigMissing"));
            }
            return new MistralEmbedder(config.mistralOptions.apiKey, config.modelId);
        }
        else if (provider === "vercel-ai-gateway") {
            if (!config.vercelAiGatewayOptions?.apiKey) {
                throw new Error(t("embeddings:serviceFactory.vercelAiGatewayConfigMissing"));
            }
            return new VercelAiGatewayEmbedder(config.vercelAiGatewayOptions.apiKey, config.modelId);
        }
        throw new Error(t("embeddings:serviceFactory.invalidEmbedderType", { embedderProvider: config.embedderProvider }));
    }
    /**
     * Validates an embedder instance to ensure it's properly configured.
     * @param embedder The embedder instance to validate
     * @returns Promise resolving to validation result
     */
    async validateEmbedder(embedder) {
        try {
            return await embedder.validateConfiguration();
        }
        catch (error) {
            // Capture telemetry for the error
            TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                location: "validateEmbedder",
            });
            // If validation throws an exception, preserve the original error message
            return {
                valid: false,
                error: error instanceof Error ? error.message : "embeddings:validation.configurationError",
            };
        }
    }
    /**
     * Creates a vector store instance using the current configuration.
     */
    createVectorStore() {
        const config = this.configManager.getConfig();
        const provider = config.embedderProvider;
        const defaultModel = getDefaultModelId(provider);
        // Use the embedding model ID from config, not the chat model IDs
        const modelId = config.modelId ?? defaultModel;
        let vectorSize;
        // First try to get the model-specific dimension from profiles
        vectorSize = getModelDimension(provider, modelId);
        // Only use manual dimension if model doesn't have a built-in dimension
        if (!vectorSize && config.modelDimension && config.modelDimension > 0) {
            vectorSize = config.modelDimension;
        }
        if (vectorSize === undefined || vectorSize <= 0) {
            if (provider === "openai-compatible") {
                throw new Error(t("embeddings:serviceFactory.vectorDimensionNotDeterminedOpenAiCompatible", { modelId, provider }));
            }
            else {
                throw new Error(t("embeddings:serviceFactory.vectorDimensionNotDetermined", { modelId, provider }));
            }
        }
        if (!config.qdrantUrl) {
            throw new Error(t("embeddings:serviceFactory.qdrantUrlMissing"));
        }
        // Assuming constructor is updated: new QdrantVectorStore(workspacePath, url, vectorSize, apiKey?)
        return new QdrantVectorStore(this.workspacePath, config.qdrantUrl, vectorSize, config.qdrantApiKey);
    }
    /**
     * Creates a directory scanner instance with its required dependencies.
     */
    createDirectoryScanner(embedder, vectorStore, parser, ignoreInstance) {
        // Get the configurable batch size from VSCode settings
        let batchSize;
        try {
            batchSize = vscode.workspace
                .getConfiguration(Package.name)
                .get("codeIndex.embeddingBatchSize", BATCH_SEGMENT_THRESHOLD);
        }
        catch {
            // In test environment, vscode.workspace might not be available
            batchSize = BATCH_SEGMENT_THRESHOLD;
        }
        return new DirectoryScanner(embedder, vectorStore, parser, this.cacheManager, ignoreInstance, batchSize);
    }
    /**
     * Creates a file watcher instance with its required dependencies.
     */
    createFileWatcher(context, embedder, vectorStore, cacheManager, ignoreInstance, rooIgnoreController) {
        // Get the configurable batch size from VSCode settings
        let batchSize;
        try {
            batchSize = vscode.workspace
                .getConfiguration(Package.name)
                .get("codeIndex.embeddingBatchSize", BATCH_SEGMENT_THRESHOLD);
        }
        catch {
            // In test environment, vscode.workspace might not be available
            batchSize = BATCH_SEGMENT_THRESHOLD;
        }
        return new FileWatcher(this.workspacePath, context, cacheManager, embedder, vectorStore, ignoreInstance, rooIgnoreController, batchSize);
    }
    /**
     * Creates all required service dependencies if the service is properly configured.
     * @throws Error if the service is not properly configured
     */
    createServices(context, cacheManager, ignoreInstance, rooIgnoreController) {
        if (!this.configManager.isFeatureConfigured) {
            throw new Error(t("embeddings:serviceFactory.codeIndexingNotConfigured"));
        }
        const embedder = this.createEmbedder();
        const vectorStore = this.createVectorStore();
        const parser = codeParser;
        const scanner = this.createDirectoryScanner(embedder, vectorStore, parser, ignoreInstance);
        const fileWatcher = this.createFileWatcher(context, embedder, vectorStore, cacheManager, ignoreInstance, rooIgnoreController);
        return {
            embedder,
            vectorStore,
            parser,
            scanner,
            fileWatcher,
        };
    }
}
//# sourceMappingURL=service-factory.js.map