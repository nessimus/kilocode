import { z } from "zod";
/**
 * ReasoningEffort
 */
export const reasoningEfforts = ["low", "medium", "high"];
export const reasoningEffortsSchema = z.enum(reasoningEfforts);
/**
 * ReasoningEffortWithMinimal
 */
export const reasoningEffortWithMinimalSchema = z.union([reasoningEffortsSchema, z.literal("minimal")]);
/**
 * Verbosity
 */
export const verbosityLevels = ["low", "medium", "high"];
export const verbosityLevelsSchema = z.enum(verbosityLevels);
/**
 * Service tiers (OpenAI Responses API)
 */
export const serviceTiers = ["default", "flex", "priority"];
export const serviceTierSchema = z.enum(serviceTiers);
/**
 * ModelParameter
 */
export const modelParameters = ["max_tokens", "temperature", "reasoning", "include_reasoning"];
export const modelParametersSchema = z.enum(modelParameters);
export const isModelParameter = (value) => modelParameters.includes(value);
/**
 * ModelInfo
 */
export const modelInfoSchema = z.object({
    maxTokens: z.number().nullish(),
    maxThinkingTokens: z.number().nullish(),
    contextWindow: z.number(),
    supportsImages: z.boolean().optional(),
    supportsComputerUse: z.boolean().optional(),
    supportsPromptCache: z.boolean(),
    // Capability flag to indicate whether the model supports an output verbosity parameter
    supportsVerbosity: z.boolean().optional(),
    supportsReasoningBudget: z.boolean().optional(),
    // Capability flag to indicate whether the model supports temperature parameter
    supportsTemperature: z.boolean().optional(),
    requiredReasoningBudget: z.boolean().optional(),
    supportsReasoningEffort: z.boolean().optional(),
    supportedParameters: z.array(modelParametersSchema).optional(),
    inputPrice: z.number().optional(),
    outputPrice: z.number().optional(),
    cacheWritesPrice: z.number().optional(),
    cacheReadsPrice: z.number().optional(),
    description: z.string().optional(),
    reasoningEffort: reasoningEffortsSchema.optional(),
    minTokensPerCachePoint: z.number().optional(),
    maxCachePoints: z.number().optional(),
    cachableFields: z.array(z.string()).optional(),
    // kilocode_change start
    displayName: z.string().nullish(),
    preferredIndex: z.number().nullish(),
    // kilocode_change end
    /**
     * Service tiers with pricing information.
     * Each tier can have a name (for OpenAI service tiers) and pricing overrides.
     * The top-level input/output/cache* fields represent the default/standard tier.
     */
    tiers: z
        .array(z.object({
        name: serviceTierSchema.optional(), // Service tier name (flex, priority, etc.)
        contextWindow: z.number(),
        inputPrice: z.number().optional(),
        outputPrice: z.number().optional(),
        cacheWritesPrice: z.number().optional(),
        cacheReadsPrice: z.number().optional(),
    }))
        .optional(),
});
//# sourceMappingURL=model.js.map