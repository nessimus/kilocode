import OpenAI from "openai";
import { xaiDefaultModelId, xaiModels } from "@roo-code/types";
import { convertToOpenAiMessages } from "../transform/openai-format";
import { getModelParams } from "../transform/model-params";
import { DEFAULT_HEADERS } from "./constants";
import { BaseProvider } from "./base-provider";
import { verifyFinishReason } from "./kilocode/verifyFinishReason"; // kilocode_change
import { handleOpenAIError } from "./utils/openai-error-handler";
const XAI_DEFAULT_TEMPERATURE = 0;
export class XAIHandler extends BaseProvider {
    options;
    client;
    providerName = "xAI";
    constructor(options) {
        super();
        this.options = options;
        const apiKey = this.options.xaiApiKey ?? "not-provided";
        this.client = new OpenAI({
            baseURL: "https://api.x.ai/v1",
            apiKey: apiKey,
            defaultHeaders: DEFAULT_HEADERS,
        });
    }
    getModel() {
        const id = this.options.apiModelId && this.options.apiModelId in xaiModels
            ? this.options.apiModelId
            : xaiDefaultModelId;
        const info = xaiModels[id];
        const params = getModelParams({ format: "openai", modelId: id, model: info, settings: this.options });
        return { id, info, ...params };
    }
    async *createMessage(systemPrompt, messages, metadata) {
        const { id: modelId, info: modelInfo, reasoning } = this.getModel();
        // Use the OpenAI-compatible API.
        let stream;
        try {
            stream = await this.client.chat.completions.create({
                model: modelId,
                max_tokens: modelInfo.maxTokens,
                temperature: this.options.modelTemperature ?? XAI_DEFAULT_TEMPERATURE,
                messages: [{ role: "system", content: systemPrompt }, ...convertToOpenAiMessages(messages)],
                stream: true,
                stream_options: { include_usage: true },
                ...(reasoning && reasoning),
            });
        }
        catch (error) {
            throw handleOpenAIError(error, this.providerName);
        }
        for await (const chunk of stream) {
            verifyFinishReason(chunk.choices[0]); // kilocode_change
            const delta = chunk.choices[0]?.delta;
            if (delta?.content) {
                yield {
                    type: "text",
                    text: delta.content,
                };
            }
            if (delta && "reasoning_content" in delta && delta.reasoning_content) {
                yield {
                    type: "reasoning",
                    text: delta.reasoning_content,
                };
            }
            if (chunk.usage) {
                // Extract detailed token information if available
                // First check for prompt_tokens_details structure (real API response)
                const promptDetails = "prompt_tokens_details" in chunk.usage ? chunk.usage.prompt_tokens_details : null;
                const cachedTokens = promptDetails && "cached_tokens" in promptDetails ? promptDetails.cached_tokens : 0;
                // Fall back to direct fields in usage (used in test mocks)
                const readTokens = cachedTokens ||
                    ("cache_read_input_tokens" in chunk.usage ? chunk.usage.cache_read_input_tokens : 0);
                const writeTokens = "cache_creation_input_tokens" in chunk.usage ? chunk.usage.cache_creation_input_tokens : 0;
                yield {
                    type: "usage",
                    inputTokens: chunk.usage.prompt_tokens || 0,
                    outputTokens: chunk.usage.completion_tokens || 0,
                    cacheReadTokens: readTokens,
                    cacheWriteTokens: writeTokens,
                };
            }
        }
    }
    async completePrompt(prompt) {
        const { id: modelId, reasoning } = this.getModel();
        try {
            const response = await this.client.chat.completions.create({
                model: modelId,
                messages: [{ role: "user", content: prompt }],
                ...(reasoning && reasoning),
            });
            return response.choices[0]?.message.content || "";
        }
        catch (error) {
            throw handleOpenAIError(error, this.providerName);
        }
    }
}
//# sourceMappingURL=xai.js.map