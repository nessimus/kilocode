import { ANTHROPIC_DEFAULT_MAX_TOKENS, CLAUDE_CODE_DEFAULT_MAX_OUTPUT_TOKENS, } from "@roo-code/types";
// RouterName
const routerNames = [
    "openrouter",
    "requesty",
    "glama",
    "unbound",
    "litellm",
    "kilocode-openrouter",
    "ollama",
    "lmstudio",
    "io-intelligence",
    "deepinfra",
    "vercel-ai-gateway",
];
export const isRouterName = (value) => routerNames.includes(value);
export function toRouterName(value) {
    if (value && isRouterName(value)) {
        return value;
    }
    throw new Error(`Invalid router name: ${value}`);
}
// Reasoning
export const shouldUseReasoningBudget = ({ model, settings, }) => !!model.requiredReasoningBudget || (!!model.supportsReasoningBudget && !!settings?.enableReasoningEffort);
export const shouldUseReasoningEffort = ({ model, settings, }) => {
    // If enableReasoningEffort is explicitly set to false, reasoning should be disabled
    if (settings?.enableReasoningEffort === false) {
        return false;
    }
    // Otherwise, use reasoning if:
    // 1. Model supports reasoning effort AND settings provide reasoning effort, OR
    // 2. Model itself has a reasoningEffort property
    return (!!model.supportsReasoningEffort && !!settings?.reasoningEffort) || !!model.reasoningEffort;
};
export const DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS = 16_384;
export const DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS = 8_192;
export const GEMINI_25_PRO_MIN_THINKING_TOKENS = 128;
// Max Tokens
export const getModelMaxOutputTokens = ({ modelId, model, settings, format, }) => {
    // Check for Claude Code specific max output tokens setting
    if (settings?.apiProvider === "claude-code") {
        return settings.claudeCodeMaxOutputTokens || CLAUDE_CODE_DEFAULT_MAX_OUTPUT_TOKENS;
    }
    if (shouldUseReasoningBudget({ model, settings })) {
        return settings?.modelMaxTokens || DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS;
    }
    const isAnthropicContext = modelId.includes("claude") ||
        format === "anthropic" ||
        (format === "openrouter" && modelId.startsWith("anthropic/"));
    // For "Hybrid" reasoning models, discard the model's actual maxTokens for Anthropic contexts
    /* kilocode_change: don't limit Anthropic model output, no idea why this was done before
    if (model.supportsReasoningBudget && isAnthropicContext) {
        return ANTHROPIC_DEFAULT_MAX_TOKENS
    }*/
    // For Anthropic contexts, always ensure a maxTokens value is set
    if (isAnthropicContext && (!model.maxTokens || model.maxTokens === 0)) {
        return ANTHROPIC_DEFAULT_MAX_TOKENS;
    }
    // If model has explicit maxTokens, clamp it to 20% of the context window
    // Exception: GPT-5 models should use their exact configured max output tokens
    if (model.maxTokens) {
        // Check if this is a GPT-5 model (case-insensitive)
        const isGpt5Model = modelId.toLowerCase().includes("gpt-5");
        // GPT-5 models bypass the 20% cap and use their full configured max tokens
        if (isGpt5Model) {
            return model.maxTokens;
        }
        // All other models are clamped to 20% of context window
        return Math.min(model.maxTokens, Math.ceil(model.contextWindow * 0.2));
    }
    // For non-Anthropic formats without explicit maxTokens, return undefined
    if (format) {
        return undefined;
    }
    // Default fallback
    return ANTHROPIC_DEFAULT_MAX_TOKENS;
};
//# sourceMappingURL=api.js.map