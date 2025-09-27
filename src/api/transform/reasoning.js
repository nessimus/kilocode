import { shouldUseReasoningBudget, shouldUseReasoningEffort } from "../../shared/api";
export const getOpenRouterReasoning = ({ model, reasoningBudget, reasoningEffort, settings, }) => shouldUseReasoningBudget({ model, settings })
    ? { max_tokens: reasoningBudget }
    : shouldUseReasoningEffort({ model, settings })
        ? reasoningEffort
            ? { effort: reasoningEffort }
            : undefined
        : undefined;
export const getAnthropicReasoning = ({ model, reasoningBudget, settings, }) => shouldUseReasoningBudget({ model, settings }) ? { type: "enabled", budget_tokens: reasoningBudget } : undefined;
export const getOpenAiReasoning = ({ model, reasoningEffort, settings, }) => {
    if (!shouldUseReasoningEffort({ model, settings })) {
        return undefined;
    }
    // If model has reasoning effort capability, return object even if effort is undefined
    // This preserves the reasoning_effort field in the API call
    if (reasoningEffort === "minimal") {
        return undefined;
    }
    return { reasoning_effort: reasoningEffort };
};
export const getGeminiReasoning = ({ model, reasoningBudget, settings, }) => shouldUseReasoningBudget({ model, settings })
    ? { thinkingBudget: reasoningBudget, includeThoughts: true }
    : undefined;
//# sourceMappingURL=reasoning.js.map