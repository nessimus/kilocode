import { DEEP_SEEK_DEFAULT_TEMPERATURE, chutesDefaultModelId, chutesModels } from "@roo-code/types";
import { XmlMatcher } from "../../utils/xml-matcher";
import { convertToR1Format } from "../transform/r1-format";
import { convertToOpenAiMessages } from "../transform/openai-format";
import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider";
export class ChutesHandler extends BaseOpenAiCompatibleProvider {
    constructor(options) {
        super({
            ...options,
            providerName: "Chutes",
            baseURL: "https://llm.chutes.ai/v1",
            apiKey: options.chutesApiKey,
            defaultProviderModelId: chutesDefaultModelId,
            providerModels: chutesModels,
            defaultTemperature: 0.5,
        });
    }
    getCompletionParams(systemPrompt, messages) {
        const { id: model, info: { maxTokens: max_tokens }, } = this.getModel();
        const temperature = this.options.modelTemperature ?? this.getModel().info.temperature;
        return {
            model,
            max_tokens,
            temperature,
            messages: [{ role: "system", content: systemPrompt }, ...convertToOpenAiMessages(messages)],
            stream: true,
            stream_options: { include_usage: true },
        };
    }
    async *createMessage(systemPrompt, messages) {
        const model = this.getModel();
        if (model.id.includes("DeepSeek-R1")) {
            const stream = await this.client.chat.completions.create({
                ...this.getCompletionParams(systemPrompt, messages),
                messages: convertToR1Format([{ role: "user", content: systemPrompt }, ...messages]),
            });
            const matcher = new XmlMatcher("think", (chunk) => ({
                type: chunk.matched ? "reasoning" : "text",
                text: chunk.data,
            }));
            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta;
                if (delta?.content) {
                    for (const processedChunk of matcher.update(delta.content)) {
                        yield processedChunk;
                    }
                }
                if (chunk.usage) {
                    yield {
                        type: "usage",
                        inputTokens: chunk.usage.prompt_tokens || 0,
                        outputTokens: chunk.usage.completion_tokens || 0,
                    };
                }
            }
            // Process any remaining content
            for (const processedChunk of matcher.final()) {
                yield processedChunk;
            }
        }
        else {
            yield* super.createMessage(systemPrompt, messages);
        }
    }
    getModel() {
        const model = super.getModel();
        const isDeepSeekR1 = model.id.includes("DeepSeek-R1");
        return {
            ...model,
            info: {
                ...model.info,
                temperature: isDeepSeekR1 ? DEEP_SEEK_DEFAULT_TEMPERATURE : this.defaultTemperature,
            },
        };
    }
}
//# sourceMappingURL=chutes.js.map