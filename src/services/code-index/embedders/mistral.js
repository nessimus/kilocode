import { OpenAICompatibleEmbedder } from "./openai-compatible";
import { MAX_ITEM_TOKENS } from "../constants";
import { t } from "../../../i18n";
import { TelemetryEventName } from "@roo-code/types";
import { TelemetryService } from "@roo-code/telemetry";
/**
 * Mistral embedder implementation that wraps the OpenAI Compatible embedder
 * with configuration for Mistral's embedding API.
 *
 * Supported models:
 * - codestral-embed-2505 (dimension: 1536)
 */
export class MistralEmbedder {
    openAICompatibleEmbedder;
    static MISTRAL_BASE_URL = "https://api.mistral.ai/v1";
    static DEFAULT_MODEL = "codestral-embed-2505";
    modelId;
    /**
     * Creates a new Mistral embedder
     * @param apiKey The Mistral API key for authentication
     * @param modelId The model ID to use (defaults to codestral-embed-2505)
     */
    constructor(apiKey, modelId) {
        if (!apiKey) {
            throw new Error(t("embeddings:validation.apiKeyRequired"));
        }
        // Use provided model or default
        this.modelId = modelId || MistralEmbedder.DEFAULT_MODEL;
        // Create an OpenAI Compatible embedder with Mistral's configuration
        this.openAICompatibleEmbedder = new OpenAICompatibleEmbedder(MistralEmbedder.MISTRAL_BASE_URL, apiKey, this.modelId, MAX_ITEM_TOKENS);
    }
    /**
     * Creates embeddings for the given texts using Mistral's embedding API
     * @param texts Array of text strings to embed
     * @param model Optional model identifier (uses constructor model if not provided)
     * @returns Promise resolving to embedding response
     */
    async createEmbeddings(texts, model) {
        try {
            // Use the provided model or fall back to the instance's model
            const modelToUse = model || this.modelId;
            return await this.openAICompatibleEmbedder.createEmbeddings(texts, modelToUse);
        }
        catch (error) {
            TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                location: "MistralEmbedder:createEmbeddings",
            });
            throw error;
        }
    }
    /**
     * Validates the Mistral embedder configuration by delegating to the underlying OpenAI-compatible embedder
     * @returns Promise resolving to validation result with success status and optional error message
     */
    async validateConfiguration() {
        try {
            // Delegate validation to the OpenAI-compatible embedder
            // The error messages will be specific to Mistral since we're using Mistral's base URL
            return await this.openAICompatibleEmbedder.validateConfiguration();
        }
        catch (error) {
            TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                location: "MistralEmbedder:validateConfiguration",
            });
            throw error;
        }
    }
    /**
     * Returns information about this embedder
     */
    get embedderInfo() {
        return {
            name: "mistral",
        };
    }
}
//# sourceMappingURL=mistral.js.map