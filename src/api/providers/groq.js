import { groqDefaultModelId, groqModels } from "@roo-code/types";
import { calculateApiCostOpenAI } from "../../shared/cost";
import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider";
export class GroqHandler extends BaseOpenAiCompatibleProvider {
    constructor(options) {
        super({
            ...options,
            providerName: "Groq",
            baseURL: "https://api.groq.com/openai/v1",
            apiKey: options.groqApiKey,
            defaultProviderModelId: groqDefaultModelId,
            providerModels: groqModels,
            defaultTemperature: 0.5,
        });
    }
    async *createMessage(systemPrompt, messages, metadata) {
        const stream = await this.createStream(systemPrompt, messages, metadata);
        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (delta?.content) {
                yield {
                    type: "text",
                    text: delta.content,
                };
            }
            if (chunk.usage) {
                yield* this.yieldUsage(chunk.usage);
            }
        }
    }
    async *yieldUsage(usage) {
        const { info } = this.getModel();
        const inputTokens = usage?.prompt_tokens || 0;
        const outputTokens = usage?.completion_tokens || 0;
        const cacheReadTokens = usage?.prompt_tokens_details?.cached_tokens || 0;
        // Groq does not track cache writes
        const cacheWriteTokens = 0;
        // Calculate cost using OpenAI-compatible cost calculation
        const totalCost = calculateApiCostOpenAI(info, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens);
        // Calculate non-cached input tokens for proper reporting
        const nonCachedInputTokens = Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);
        console.log("usage", {
            inputTokens: nonCachedInputTokens,
            outputTokens,
            cacheWriteTokens,
            cacheReadTokens,
            totalCost,
        });
        yield {
            type: "usage",
            inputTokens: nonCachedInputTokens,
            outputTokens,
            cacheWriteTokens,
            cacheReadTokens,
            totalCost,
        };
    }
}
//# sourceMappingURL=groq.js.map