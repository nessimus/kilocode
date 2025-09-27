import axios from "axios";
import { ollamaDefaultModelInfo } from "@roo-code/types";
import { z } from "zod";
const OllamaModelDetailsSchema = z.object({
    family: z.string(),
    families: z.array(z.string()).nullable().optional(),
    format: z.string().optional(),
    parameter_size: z.string(),
    parent_model: z.string().optional(),
    quantization_level: z.string().optional(),
});
const OllamaModelSchema = z.object({
    details: OllamaModelDetailsSchema,
    digest: z.string().optional(),
    model: z.string(),
    modified_at: z.string().optional(),
    name: z.string(),
    size: z.number().optional(),
});
const OllamaModelInfoResponseSchema = z.object({
    modelfile: z.string().optional(),
    parameters: z.string().optional(),
    template: z.string().optional(),
    details: OllamaModelDetailsSchema,
    model_info: z.record(z.string(), z.any()),
    capabilities: z.array(z.string()).optional(),
});
const OllamaModelsResponseSchema = z.object({
    models: z.array(OllamaModelSchema),
});
export const parseOllamaModel = (rawModel, baseUrl) => {
    // kilocode_change start
    const contextKey = Object.keys(rawModel.model_info).find((k) => k.includes("context_length"));
    const contextLengthFromModelInfo = contextKey && typeof rawModel.model_info[contextKey] === "number" ? rawModel.model_info[contextKey] : undefined;
    const contextLengthFromModelParameters = typeof rawModel.parameters === "string"
        ? parseInt(rawModel.parameters.match(/^num_ctx\s+(\d+)/m)?.[1] ?? "", 10) || undefined
        : undefined;
    const contextLengthFromEnvironment = parseInt(process.env.OLLAMA_CONTEXT_LENGTH ?? "", 10) || undefined;
    const contextWindow = (baseUrl?.toLowerCase().startsWith("https://ollama.com") ? contextLengthFromModelInfo : undefined) ??
        contextLengthFromEnvironment ??
        (contextLengthFromModelParameters !== 40960 ? contextLengthFromModelParameters : undefined) ?? // Alledgedly Ollama sometimes returns an undefind context as 40960
        4096; // This is usually the default: https://github.com/ollama/ollama/blob/4383a3ab7a075eff78b31f7dc84c747e2fcd22b8/docs/faq.md#how-can-i-specify-the-context-window-size
    // kilocode_change end
    const modelInfo = Object.assign({}, ollamaDefaultModelInfo, {
        description: `Family: ${rawModel.details.family}, Context: ${contextWindow}, Size: ${rawModel.details.parameter_size}`,
        contextWindow: contextWindow || ollamaDefaultModelInfo.contextWindow,
        supportsPromptCache: true,
        supportsImages: rawModel.capabilities?.includes("vision"),
        supportsComputerUse: false,
        maxTokens: contextWindow || ollamaDefaultModelInfo.contextWindow,
    });
    return modelInfo;
};
export async function getOllamaModels(baseUrl = "http://localhost:11434") {
    const models = {};
    // clearing the input can leave an empty string; use the default in that case
    baseUrl = baseUrl === "" ? "http://localhost:11434" : baseUrl;
    try {
        if (!URL.canParse(baseUrl)) {
            return models;
        }
        const response = await axios.get(`${baseUrl}/api/tags`);
        const parsedResponse = OllamaModelsResponseSchema.safeParse(response.data);
        let modelInfoPromises = [];
        if (parsedResponse.success) {
            for (const ollamaModel of parsedResponse.data.models) {
                modelInfoPromises.push(axios
                    .post(`${baseUrl}/api/show`, {
                    model: ollamaModel.model,
                })
                    .then((ollamaModelInfo) => {
                    models[ollamaModel.name] = parseOllamaModel(ollamaModelInfo.data, baseUrl);
                }));
            }
            await Promise.all(modelInfoPromises);
        }
        else {
            console.error(`Error parsing Ollama models response: ${JSON.stringify(parsedResponse.error, null, 2)}`);
        }
    }
    catch (error) {
        if (error.code === "ECONNREFUSED") {
            console.warn(`Failed connecting to Ollama at ${baseUrl}`);
        }
        else {
            console.error(`Error fetching Ollama models: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`);
        }
    }
    return models;
}
//# sourceMappingURL=ollama.js.map