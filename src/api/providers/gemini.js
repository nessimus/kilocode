import { GoogleGenAI, FinishReason, // kilocode_change
 } from "@google/genai";
import { geminiDefaultModelId, geminiModels } from "@roo-code/types";
import { safeJsonParse } from "../../shared/safeJsonParse";
import { convertAnthropicContentToGemini, convertAnthropicMessageToGemini } from "../transform/gemini-format";
import { t } from "i18next";
import { getModelParams } from "../transform/model-params";
import { BaseProvider } from "./base-provider";
import { throwMaxCompletionTokensReachedError } from "./kilocode/verifyFinishReason";
export class GeminiHandler extends BaseProvider {
    options;
    client;
    constructor({ isVertex, ...options }) {
        super();
        this.options = options;
        const project = this.options.vertexProjectId ?? "not-provided";
        const location = this.options.vertexRegion ?? "not-provided";
        const apiKey = this.options.geminiApiKey ?? "not-provided";
        this.client = this.options.vertexJsonCredentials
            ? new GoogleGenAI({
                vertexai: true,
                project,
                location,
                googleAuthOptions: {
                    credentials: safeJsonParse(this.options.vertexJsonCredentials, undefined),
                },
            })
            : this.options.vertexKeyFile
                ? new GoogleGenAI({
                    vertexai: true,
                    project,
                    location,
                    googleAuthOptions: { keyFile: this.options.vertexKeyFile },
                })
                : isVertex
                    ? new GoogleGenAI({ vertexai: true, project, location })
                    : new GoogleGenAI({ apiKey });
    }
    async *createMessage(systemInstruction, messages, metadata) {
        const { id: model, info, reasoning: thinkingConfig, maxTokens } = this.getModel();
        const contents = messages.map(convertAnthropicMessageToGemini);
        const tools = [];
        if (this.options.enableUrlContext) {
            tools.push({ urlContext: {} });
        }
        if (this.options.enableGrounding) {
            tools.push({ googleSearch: {} });
        }
        const config = {
            systemInstruction,
            httpOptions: this.options.googleGeminiBaseUrl ? { baseUrl: this.options.googleGeminiBaseUrl } : undefined,
            thinkingConfig,
            maxOutputTokens: this.options.modelMaxTokens ?? maxTokens ?? undefined,
            temperature: this.options.modelTemperature ?? 0,
            ...(tools.length > 0 ? { tools } : {}),
        };
        const params = { model, contents, config };
        try {
            const result = await this.client.models.generateContentStream(params);
            let lastUsageMetadata;
            let pendingGroundingMetadata;
            for await (const chunk of result) {
                // Process candidates and their parts to separate thoughts from content
                if (chunk.candidates && chunk.candidates.length > 0) {
                    const candidate = chunk.candidates[0];
                    // kilocode_change start
                    if (candidate.finishReason === FinishReason.MAX_TOKENS) {
                        throwMaxCompletionTokensReachedError();
                    }
                    // kilocode_change end
                    if (candidate.groundingMetadata) {
                        pendingGroundingMetadata = candidate.groundingMetadata;
                    }
                    if (candidate.content && candidate.content.parts) {
                        for (const part of candidate.content.parts) {
                            if (part.thought) {
                                // This is a thinking/reasoning part
                                if (part.text) {
                                    yield { type: "reasoning", text: part.text };
                                }
                            }
                            else {
                                // This is regular content
                                if (part.text) {
                                    yield { type: "text", text: part.text };
                                }
                            }
                        }
                    }
                }
                // Fallback to the original text property if no candidates structure
                else if (chunk.text) {
                    yield { type: "text", text: chunk.text };
                }
                if (chunk.usageMetadata) {
                    lastUsageMetadata = chunk.usageMetadata;
                }
            }
            if (pendingGroundingMetadata) {
                const sources = this.extractGroundingSources(pendingGroundingMetadata);
                if (sources.length > 0) {
                    yield { type: "grounding", sources };
                }
            }
            if (lastUsageMetadata) {
                const inputTokens = lastUsageMetadata.promptTokenCount ?? 0;
                const outputTokens = lastUsageMetadata.candidatesTokenCount ?? 0;
                const cacheReadTokens = lastUsageMetadata.cachedContentTokenCount;
                const reasoningTokens = lastUsageMetadata.thoughtsTokenCount;
                yield {
                    type: "usage",
                    inputTokens,
                    outputTokens,
                    cacheReadTokens,
                    reasoningTokens,
                    totalCost: this.calculateCost({ info, inputTokens, outputTokens, cacheReadTokens }),
                };
            }
        }
        catch (error) {
            if (error instanceof Error) {
                throw new Error(t("common:errors.gemini.generate_stream", { error: error.message }));
            }
            throw error;
        }
    }
    getModel() {
        const modelId = this.options.apiModelId;
        let id = modelId && modelId in geminiModels ? modelId : geminiDefaultModelId;
        let info = geminiModels[id];
        const params = getModelParams({ format: "gemini", modelId: id, model: info, settings: this.options });
        // The `:thinking` suffix indicates that the model is a "Hybrid"
        // reasoning model and that reasoning is required to be enabled.
        // The actual model ID honored by Gemini's API does not have this
        // suffix.
        return { id: id.endsWith(":thinking") ? id.replace(":thinking", "") : id, info, ...params };
    }
    extractGroundingSources(groundingMetadata) {
        const chunks = groundingMetadata?.groundingChunks;
        if (!chunks) {
            return [];
        }
        return chunks
            .map((chunk) => {
            const uri = chunk.web?.uri;
            const title = chunk.web?.title || uri || "Unknown Source";
            if (uri) {
                return {
                    title,
                    url: uri,
                };
            }
            return null;
        })
            .filter((source) => source !== null);
    }
    extractCitationsOnly(groundingMetadata) {
        const sources = this.extractGroundingSources(groundingMetadata);
        if (sources.length === 0) {
            return null;
        }
        const citationLinks = sources.map((source, i) => `[${i + 1}](${source.url})`);
        return citationLinks.join(", ");
    }
    async completePrompt(prompt) {
        try {
            const { id: model } = this.getModel();
            const tools = [];
            if (this.options.enableUrlContext) {
                tools.push({ urlContext: {} });
            }
            if (this.options.enableGrounding) {
                tools.push({ googleSearch: {} });
            }
            const promptConfig = {
                httpOptions: this.options.googleGeminiBaseUrl
                    ? { baseUrl: this.options.googleGeminiBaseUrl }
                    : undefined,
                temperature: this.options.modelTemperature ?? 0,
                ...(tools.length > 0 ? { tools } : {}),
            };
            const result = await this.client.models.generateContent({
                model,
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                config: promptConfig,
            });
            let text = result.text ?? "";
            const candidate = result.candidates?.[0];
            if (candidate?.groundingMetadata) {
                const citations = this.extractCitationsOnly(candidate.groundingMetadata);
                if (citations) {
                    text += `\n\n${t("common:errors.gemini.sources")} ${citations}`;
                }
            }
            return text;
        }
        catch (error) {
            if (error instanceof Error) {
                throw new Error(t("common:errors.gemini.generate_complete_prompt", { error: error.message }));
            }
            throw error;
        }
    }
    async countTokens(content) {
        try {
            const { id: model } = this.getModel();
            const response = await this.client.models.countTokens({
                model,
                contents: convertAnthropicContentToGemini(content),
            });
            if (response.totalTokens === undefined) {
                console.warn("Gemini token counting returned undefined, using fallback");
                return super.countTokens(content);
            }
            return response.totalTokens;
        }
        catch (error) {
            console.warn("Gemini token counting failed, using fallback", error);
            return super.countTokens(content);
        }
    }
    calculateCost({ info, inputTokens, outputTokens, cacheReadTokens = 0, }) {
        if (!info.inputPrice || !info.outputPrice || !info.cacheReadsPrice) {
            return undefined;
        }
        let inputPrice = info.inputPrice;
        let outputPrice = info.outputPrice;
        let cacheReadsPrice = info.cacheReadsPrice;
        // If there's tiered pricing then adjust the input and output token prices
        // based on the input tokens used.
        if (info.tiers) {
            const tier = info.tiers.find((tier) => inputTokens <= tier.contextWindow);
            if (tier) {
                inputPrice = tier.inputPrice ?? inputPrice;
                outputPrice = tier.outputPrice ?? outputPrice;
                cacheReadsPrice = tier.cacheReadsPrice ?? cacheReadsPrice;
            }
        }
        // Subtract the cached input tokens from the total input tokens.
        const uncachedInputTokens = inputTokens - cacheReadTokens;
        let cacheReadCost = cacheReadTokens > 0 ? cacheReadsPrice * (cacheReadTokens / 1_000_000) : 0;
        const inputTokensCost = inputPrice * (uncachedInputTokens / 1_000_000);
        const outputTokensCost = outputPrice * (outputTokens / 1_000_000);
        const totalCost = inputTokensCost + outputTokensCost + cacheReadCost;
        const trace = {
            input: { price: inputPrice, tokens: uncachedInputTokens, cost: inputTokensCost },
            output: { price: outputPrice, tokens: outputTokens, cost: outputTokensCost },
        };
        if (cacheReadTokens > 0) {
            trace.cacheRead = { price: cacheReadsPrice, tokens: cacheReadTokens, cost: cacheReadCost };
        }
        // console.log(`[GeminiHandler] calculateCost -> ${totalCost}`, trace)
        return totalCost;
    }
}
//# sourceMappingURL=gemini.js.map