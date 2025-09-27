import OpenAI from "openai";
import { openAiModelInfoSaneDefaults, DEEP_SEEK_DEFAULT_TEMPERATURE } from "@roo-code/types";
import { XmlMatcher } from "../../utils/xml-matcher";
import { convertToOpenAiMessages } from "../transform/openai-format";
import { convertToR1Format } from "../transform/r1-format";
import { BaseProvider } from "./base-provider";
import { getApiRequestTimeout } from "./utils/timeout-config";
import { handleOpenAIError } from "./utils/openai-error-handler";
export class OllamaHandler extends BaseProvider {
    options;
    client;
    providerName = "Ollama";
    constructor(options) {
        super();
        this.options = options;
        // Use the API key if provided (for Ollama cloud or authenticated instances)
        // Otherwise use "ollama" as a placeholder for local instances
        const apiKey = this.options.ollamaApiKey || "ollama";
        const headers = {};
        if (this.options.ollamaApiKey) {
            headers["Authorization"] = `Bearer ${this.options.ollamaApiKey}`;
        }
        this.client = new OpenAI({
            baseURL: (this.options.ollamaBaseUrl || "http://localhost:11434") + "/v1",
            apiKey: apiKey,
            timeout: getApiRequestTimeout(),
            defaultHeaders: headers,
        });
    }
    async *createMessage(systemPrompt, messages, metadata) {
        const modelId = this.getModel().id;
        const useR1Format = modelId.toLowerCase().includes("deepseek-r1");
        const openAiMessages = [
            { role: "system", content: systemPrompt },
            ...(useR1Format ? convertToR1Format(messages) : convertToOpenAiMessages(messages)),
        ];
        let stream;
        try {
            stream = await this.client.chat.completions.create({
                model: this.getModel().id,
                messages: openAiMessages,
                temperature: this.options.modelTemperature ?? 0,
                stream: true,
                stream_options: { include_usage: true },
            });
        }
        catch (error) {
            throw handleOpenAIError(error, this.providerName);
        }
        const matcher = new XmlMatcher("think", (chunk) => ({
            type: chunk.matched ? "reasoning" : "text",
            text: chunk.data,
        }));
        let lastUsage;
        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (delta?.content) {
                for (const matcherChunk of matcher.update(delta.content)) {
                    yield matcherChunk;
                }
            }
            if (chunk.usage) {
                lastUsage = chunk.usage;
            }
        }
        for (const chunk of matcher.final()) {
            yield chunk;
        }
        if (lastUsage) {
            yield {
                type: "usage",
                inputTokens: lastUsage?.prompt_tokens || 0,
                outputTokens: lastUsage?.completion_tokens || 0,
            };
        }
    }
    getModel() {
        return {
            id: this.options.ollamaModelId || "",
            info: openAiModelInfoSaneDefaults,
        };
    }
    async completePrompt(prompt) {
        try {
            const modelId = this.getModel().id;
            const useR1Format = modelId.toLowerCase().includes("deepseek-r1");
            let response;
            try {
                response = await this.client.chat.completions.create({
                    model: this.getModel().id,
                    messages: useR1Format
                        ? convertToR1Format([{ role: "user", content: prompt }])
                        : [{ role: "user", content: prompt }],
                    temperature: this.options.modelTemperature ?? (useR1Format ? DEEP_SEEK_DEFAULT_TEMPERATURE : 0),
                    stream: false,
                });
            }
            catch (error) {
                throw handleOpenAIError(error, this.providerName);
            }
            return response.choices[0]?.message.content || "";
        }
        catch (error) {
            if (error instanceof Error) {
                throw new Error(`Ollama completion error: ${error.message}`);
            }
            throw error;
        }
    }
}
//# sourceMappingURL=ollama.js.map