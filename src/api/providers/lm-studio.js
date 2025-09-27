import OpenAI from "openai";
import axios from "axios";
import { openAiModelInfoSaneDefaults, LMSTUDIO_DEFAULT_TEMPERATURE } from "@roo-code/types";
import { XmlMatcher } from "../../utils/xml-matcher";
import { convertToOpenAiMessages } from "../transform/openai-format";
import { BaseProvider } from "./base-provider";
import { fetchWithTimeout } from "./kilocode/fetchWithTimeout";
const LMSTUDIO_TIMEOUT_MS = 3_600_000; // kilocode_change
import { getModelsFromCache } from "./fetchers/modelCache";
import { handleOpenAIError } from "./utils/openai-error-handler";
export class LmStudioHandler extends BaseProvider {
    options;
    client;
    providerName = "LM Studio";
    constructor(options) {
        super();
        this.options = options;
        this.client = new OpenAI({
            baseURL: (this.options.lmStudioBaseUrl || "http://localhost:1234") + "/v1",
            apiKey: "noop",
            timeout: LMSTUDIO_TIMEOUT_MS, // kilocode_change
            fetch: fetchWithTimeout(LMSTUDIO_TIMEOUT_MS), // kilocode_change
        });
    }
    async *createMessage(systemPrompt, messages, metadata) {
        const openAiMessages = [
            { role: "system", content: systemPrompt },
            ...convertToOpenAiMessages(messages),
        ];
        // -------------------------
        // Track token usage
        // -------------------------
        const toContentBlocks = (blocks) => {
            if (typeof blocks === "string") {
                return [{ type: "text", text: blocks }];
            }
            const result = [];
            for (const msg of blocks) {
                if (typeof msg.content === "string") {
                    result.push({ type: "text", text: msg.content });
                }
                else if (Array.isArray(msg.content)) {
                    for (const part of msg.content) {
                        if (part.type === "text") {
                            result.push({ type: "text", text: part.text });
                        }
                    }
                }
            }
            return result;
        };
        let inputTokens = 0;
        try {
            inputTokens = await this.countTokens([{ type: "text", text: systemPrompt }, ...toContentBlocks(messages)]);
        }
        catch (err) {
            console.error("[LmStudio] Failed to count input tokens:", err);
            inputTokens = 0;
        }
        let assistantText = "";
        try {
            const params = {
                model: this.getModel().id,
                messages: openAiMessages,
                temperature: this.options.modelTemperature ?? LMSTUDIO_DEFAULT_TEMPERATURE,
                stream: true,
            };
            if (this.options.lmStudioSpeculativeDecodingEnabled && this.options.lmStudioDraftModelId) {
                params.draft_model = this.options.lmStudioDraftModelId;
            }
            let results;
            try {
                results = await this.client.chat.completions.create(params);
            }
            catch (error) {
                throw handleOpenAIError(error, this.providerName);
            }
            const matcher = new XmlMatcher("think", (chunk) => ({
                type: chunk.matched ? "reasoning" : "text",
                text: chunk.data,
            }));
            for await (const chunk of results) {
                const delta = chunk.choices[0]?.delta;
                if (delta?.content) {
                    assistantText += delta.content;
                    for (const processedChunk of matcher.update(delta.content)) {
                        yield processedChunk;
                    }
                }
            }
            for (const processedChunk of matcher.final()) {
                yield processedChunk;
            }
            let outputTokens = 0;
            try {
                outputTokens = await this.countTokens([{ type: "text", text: assistantText }]);
            }
            catch (err) {
                console.error("[LmStudio] Failed to count output tokens:", err);
                outputTokens = 0;
            }
            yield {
                type: "usage",
                inputTokens,
                outputTokens,
            };
        }
        catch (error) {
            throw new Error("Please check the LM Studio developer logs to debug what went wrong. You may need to load the model with a larger context length to work with Kilo Code's prompts.");
        }
    }
    getModel() {
        const models = getModelsFromCache("lmstudio");
        if (models && this.options.lmStudioModelId && models[this.options.lmStudioModelId]) {
            return {
                id: this.options.lmStudioModelId,
                info: models[this.options.lmStudioModelId],
            };
        }
        else {
            return {
                id: this.options.lmStudioModelId || "",
                info: openAiModelInfoSaneDefaults,
            };
        }
    }
    async completePrompt(prompt) {
        try {
            // Create params object with optional draft model
            const params = {
                model: this.getModel().id,
                messages: [{ role: "user", content: prompt }],
                temperature: this.options.modelTemperature ?? LMSTUDIO_DEFAULT_TEMPERATURE,
                stream: false,
            };
            // Add draft model if speculative decoding is enabled and a draft model is specified
            if (this.options.lmStudioSpeculativeDecodingEnabled && this.options.lmStudioDraftModelId) {
                params.draft_model = this.options.lmStudioDraftModelId;
            }
            let response;
            try {
                response = await this.client.chat.completions.create(params);
            }
            catch (error) {
                throw handleOpenAIError(error, this.providerName);
            }
            return response.choices[0]?.message.content || "";
        }
        catch (error) {
            throw new Error("Please check the LM Studio developer logs to debug what went wrong. You may need to load the model with a larger context length to work with Kilo Code's prompts.");
        }
    }
}
export async function getLmStudioModels(baseUrl = "http://localhost:1234") {
    try {
        if (!URL.canParse(baseUrl)) {
            return [];
        }
        const response = await axios.get(`${baseUrl}/v1/models`);
        const modelsArray = response.data?.data?.map((model) => model.id) || [];
        return [...new Set(modelsArray)];
    }
    catch (error) {
        return [];
    }
}
//# sourceMappingURL=lm-studio.js.map