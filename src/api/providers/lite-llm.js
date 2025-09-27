import { litellmDefaultModelId, litellmDefaultModelInfo } from "@roo-code/types";
import { calculateApiCostOpenAI } from "../../shared/cost";
import { convertToOpenAiMessages } from "../transform/openai-format";
import { RouterProvider } from "./router-provider";
/**
 * LiteLLM provider handler
 *
 * This handler uses the LiteLLM API to proxy requests to various LLM providers.
 * It follows the OpenAI API format for compatibility.
 */
export class LiteLLMHandler extends RouterProvider {
    constructor(options) {
        super({
            options,
            name: "litellm",
            baseURL: `${options.litellmBaseUrl || "http://localhost:4000"}`,
            apiKey: options.litellmApiKey || "dummy-key",
            modelId: options.litellmModelId,
            defaultModelId: litellmDefaultModelId,
            defaultModelInfo: litellmDefaultModelInfo,
        });
    }
    async *createMessage(systemPrompt, messages, metadata) {
        const { id: modelId, info } = await this.fetchModel();
        const openAiMessages = convertToOpenAiMessages(messages);
        // Prepare messages with cache control if enabled and supported
        let systemMessage;
        let enhancedMessages;
        if (this.options.litellmUsePromptCache && info.supportsPromptCache) {
            // Create system message with cache control in the proper format
            systemMessage = {
                role: "system",
                content: [
                    {
                        type: "text",
                        text: systemPrompt,
                        cache_control: { type: "ephemeral" },
                    },
                ],
            };
            // Find the last two user messages to apply caching
            const userMsgIndices = openAiMessages.reduce((acc, msg, index) => (msg.role === "user" ? [...acc, index] : acc), []);
            const lastUserMsgIndex = userMsgIndices[userMsgIndices.length - 1] ?? -1;
            const secondLastUserMsgIndex = userMsgIndices[userMsgIndices.length - 2] ?? -1;
            // Apply cache_control to the last two user messages
            enhancedMessages = openAiMessages.map((message, index) => {
                if ((index === lastUserMsgIndex || index === secondLastUserMsgIndex) && message.role === "user") {
                    // Handle both string and array content types
                    if (typeof message.content === "string") {
                        return {
                            ...message,
                            content: [
                                {
                                    type: "text",
                                    text: message.content,
                                    cache_control: { type: "ephemeral" },
                                },
                            ],
                        };
                    }
                    else if (Array.isArray(message.content)) {
                        // Apply cache control to the last content item in the array
                        return {
                            ...message,
                            content: message.content.map((content, contentIndex) => contentIndex === message.content.length - 1
                                ? {
                                    ...content,
                                    cache_control: { type: "ephemeral" },
                                }
                                : content),
                        };
                    }
                }
                return message;
            });
        }
        else {
            // No cache control - use simple format
            systemMessage = { role: "system", content: systemPrompt };
            enhancedMessages = openAiMessages;
        }
        // Required by some providers; others default to max tokens allowed
        let maxTokens = info.maxTokens ?? undefined;
        const requestOptions = {
            model: modelId,
            max_completion_tokens: maxTokens, // kilocode_change
            messages: [systemMessage, ...enhancedMessages],
            stream: true,
            stream_options: {
                include_usage: true,
            },
        };
        if (this.supportsTemperature(modelId)) {
            requestOptions.temperature = this.options.modelTemperature ?? 0;
        }
        try {
            const { data: completion } = await this.client.chat.completions.create(requestOptions).withResponse();
            let lastUsage;
            for await (const chunk of completion) {
                const delta = chunk.choices[0]?.delta;
                const usage = chunk.usage;
                if (delta?.content) {
                    yield { type: "text", text: delta.content };
                }
                if (usage) {
                    lastUsage = usage;
                }
            }
            if (lastUsage) {
                // Extract cache-related information if available
                // LiteLLM may use different field names for cache tokens
                const cacheWriteTokens = lastUsage.cache_creation_input_tokens || lastUsage.prompt_cache_miss_tokens || 0;
                const cacheReadTokens = lastUsage.prompt_tokens_details?.cached_tokens ||
                    lastUsage.cache_read_input_tokens ||
                    lastUsage.prompt_cache_hit_tokens ||
                    0;
                const usageData = {
                    type: "usage",
                    inputTokens: lastUsage.prompt_tokens || 0,
                    outputTokens: lastUsage.completion_tokens || 0,
                    cacheWriteTokens: cacheWriteTokens > 0 ? cacheWriteTokens : undefined,
                    cacheReadTokens: cacheReadTokens > 0 ? cacheReadTokens : undefined,
                };
                usageData.totalCost = calculateApiCostOpenAI(info, usageData.inputTokens, usageData.outputTokens, usageData.cacheWriteTokens || 0, usageData.cacheReadTokens || 0);
                yield usageData;
            }
        }
        catch (error) {
            if (error instanceof Error) {
                throw new Error(`LiteLLM streaming error: ${error.message}`);
            }
            throw error;
        }
    }
    async completePrompt(prompt) {
        const { id: modelId, info } = await this.fetchModel();
        try {
            const requestOptions = {
                model: modelId,
                messages: [{ role: "user", content: prompt }],
            };
            if (this.supportsTemperature(modelId)) {
                requestOptions.temperature = this.options.modelTemperature ?? 0;
            }
            requestOptions.max_completion_tokens = info.maxTokens; // kilocode_change
            const response = await this.client.chat.completions.create(requestOptions);
            return response.choices[0]?.message.content || "";
        }
        catch (error) {
            if (error instanceof Error) {
                throw new Error(`LiteLLM completion error: ${error.message}`);
            }
            throw error;
        }
    }
}
//# sourceMappingURL=lite-llm.js.map