import OpenAI from "openai";
import { requestyDefaultModelId, requestyDefaultModelInfo } from "@roo-code/types";
import { calculateApiCostOpenAI } from "../../shared/cost";
import { convertToOpenAiMessages } from "../transform/openai-format";
import { getModelParams } from "../transform/model-params";
import { DEFAULT_HEADERS } from "./constants";
import { getModels } from "./fetchers/modelCache";
import { BaseProvider } from "./base-provider";
import { toRequestyServiceUrl } from "../../shared/utils/requesty";
import { handleOpenAIError } from "./utils/openai-error-handler";
export class RequestyHandler extends BaseProvider {
    options;
    models = {};
    client;
    baseURL;
    providerName = "Requesty";
    constructor(options) {
        super();
        this.options = options;
        this.baseURL = toRequestyServiceUrl(options.requestyBaseUrl);
        const apiKey = this.options.requestyApiKey ?? "not-provided";
        this.client = new OpenAI({
            baseURL: this.baseURL,
            apiKey: apiKey,
            defaultHeaders: DEFAULT_HEADERS,
        });
    }
    async fetchModel() {
        this.models = await getModels({ provider: "requesty", baseUrl: this.baseURL });
        return this.getModel();
    }
    getModel() {
        const id = this.options.requestyModelId ?? requestyDefaultModelId;
        const info = this.models[id] ?? requestyDefaultModelInfo;
        const params = getModelParams({
            format: "anthropic",
            modelId: id,
            model: info,
            settings: this.options,
        });
        return { id, info, ...params };
    }
    processUsageMetrics(usage, modelInfo) {
        const requestyUsage = usage;
        const inputTokens = requestyUsage?.prompt_tokens || 0;
        const outputTokens = requestyUsage?.completion_tokens || 0;
        const cacheWriteTokens = requestyUsage?.prompt_tokens_details?.caching_tokens || 0;
        const cacheReadTokens = requestyUsage?.prompt_tokens_details?.cached_tokens || 0;
        const totalCost = modelInfo
            ? calculateApiCostOpenAI(modelInfo, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens)
            : 0;
        return {
            type: "usage",
            inputTokens: inputTokens,
            outputTokens: outputTokens,
            cacheWriteTokens: cacheWriteTokens,
            cacheReadTokens: cacheReadTokens,
            totalCost: totalCost,
        };
    }
    async *createMessage(systemPrompt, messages, metadata) {
        const { id: model, info, maxTokens: max_tokens, temperature, reasoningEffort: reasoning_effort, reasoning: thinking, } = await this.fetchModel();
        const openAiMessages = [
            { role: "system", content: systemPrompt },
            ...convertToOpenAiMessages(messages),
        ];
        const completionParams = {
            messages: openAiMessages,
            model,
            max_tokens,
            temperature,
            ...(reasoning_effort && reasoning_effort !== "minimal" && { reasoning_effort }),
            ...(thinking && { thinking }),
            stream: true,
            stream_options: { include_usage: true },
            requesty: { trace_id: metadata?.taskId, extra: { mode: metadata?.mode } },
        };
        let stream;
        try {
            stream = await this.client.chat.completions.create(completionParams);
        }
        catch (error) {
            throw handleOpenAIError(error, this.providerName);
        }
        let lastUsage = undefined;
        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (delta?.content) {
                yield { type: "text", text: delta.content };
            }
            if (delta && "reasoning_content" in delta && delta.reasoning_content) {
                yield { type: "reasoning", text: delta.reasoning_content || "" };
            }
            if (chunk.usage) {
                lastUsage = chunk.usage;
            }
        }
        if (lastUsage) {
            yield this.processUsageMetrics(lastUsage, info);
        }
    }
    async completePrompt(prompt) {
        const { id: model, maxTokens: max_tokens, temperature } = await this.fetchModel();
        let openAiMessages = [{ role: "system", content: prompt }];
        const completionParams = {
            model,
            max_tokens,
            messages: openAiMessages,
            temperature: temperature,
        };
        let response;
        try {
            response = await this.client.chat.completions.create(completionParams);
        }
        catch (error) {
            throw handleOpenAIError(error, this.providerName);
        }
        return response.choices[0]?.message.content || "";
    }
}
//# sourceMappingURL=requesty.js.map