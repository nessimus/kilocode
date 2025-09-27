import { DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS, GEMINI_25_PRO_MIN_THINKING_TOKENS, shouldUseReasoningBudget, shouldUseReasoningEffort, getModelMaxOutputTokens, } from "../../shared/api";
import { getAnthropicReasoning, getOpenAiReasoning, getGeminiReasoning, getOpenRouterReasoning, } from "./reasoning";
export function getModelParams({ format, modelId, model, settings, defaultTemperature = 0, }) {
    const { modelMaxTokens: customMaxTokens, modelMaxThinkingTokens: customMaxThinkingTokens, modelTemperature: customTemperature, reasoningEffort: customReasoningEffort, verbosity: customVerbosity, } = settings;
    // Use the centralized logic for computing maxTokens
    const maxTokens = getModelMaxOutputTokens({
        modelId,
        model,
        settings,
        format,
    });
    let temperature = customTemperature ?? defaultTemperature;
    let reasoningBudget = undefined;
    let reasoningEffort = undefined;
    let verbosity = customVerbosity;
    if (shouldUseReasoningBudget({ model, settings })) {
        // Check if this is a Gemini 2.5 Pro model
        const isGemini25Pro = modelId.includes("gemini-2.5-pro");
        // If `customMaxThinkingTokens` is not specified use the default.
        // For Gemini 2.5 Pro, default to 128 instead of 8192
        const defaultThinkingTokens = isGemini25Pro
            ? GEMINI_25_PRO_MIN_THINKING_TOKENS
            : DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS;
        reasoningBudget = customMaxThinkingTokens ?? defaultThinkingTokens;
        // Reasoning cannot exceed 80% of the `maxTokens` value.
        // maxTokens should always be defined for reasoning budget models, but add a guard just in case
        if (maxTokens && reasoningBudget > Math.floor(maxTokens * 0.8)) {
            reasoningBudget = Math.floor(maxTokens * 0.8);
        }
        // Reasoning cannot be less than minimum tokens.
        // For Gemini 2.5 Pro models, the minimum is 128 tokens
        // For other models, the minimum is 1024 tokens
        const minThinkingTokens = isGemini25Pro ? GEMINI_25_PRO_MIN_THINKING_TOKENS : 1024;
        if (reasoningBudget < minThinkingTokens) {
            reasoningBudget = minThinkingTokens;
        }
        // Let's assume that "Hybrid" reasoning models require a temperature of
        // 1.0 since Anthropic does.
        temperature = 1.0;
    }
    else if (shouldUseReasoningEffort({ model, settings })) {
        // "Traditional" reasoning models use the `reasoningEffort` parameter.
        const effort = customReasoningEffort ?? model.reasoningEffort;
        reasoningEffort = effort;
    }
    const params = { maxTokens, temperature, reasoningEffort, reasoningBudget, verbosity };
    if (format === "anthropic") {
        return {
            format,
            ...params,
            reasoning: getAnthropicReasoning({ model, reasoningBudget, reasoningEffort, settings }),
        };
    }
    else if (format === "openai") {
        // Special case for o1 and o3-mini, which don't support temperature.
        // TODO: Add a `supportsTemperature` field to the model info.
        if (modelId.startsWith("o1") || modelId.startsWith("o3-mini")) {
            params.temperature = undefined;
        }
        return {
            format,
            ...params,
            reasoning: getOpenAiReasoning({ model, reasoningBudget, reasoningEffort, settings }),
        };
    }
    else if (format === "gemini") {
        return {
            format,
            ...params,
            reasoning: getGeminiReasoning({ model, reasoningBudget, reasoningEffort, settings }),
        };
    }
    else {
        // Special case for o1-pro, which doesn't support temperature.
        // Note that OpenRouter's `supported_parameters` field includes
        // `temperature`, which is probably a bug.
        // TODO: Add a `supportsTemperature` field to the model info and populate
        // it appropriately in the OpenRouter fetcher.
        if (modelId === "openai/o1-pro") {
            params.temperature = undefined;
        }
        return {
            format,
            ...params,
            reasoning: getOpenRouterReasoning({ model, reasoningBudget, reasoningEffort, settings }),
        };
    }
}
//# sourceMappingURL=model-params.js.map