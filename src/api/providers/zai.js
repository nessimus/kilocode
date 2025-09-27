import { internationalZAiModels, mainlandZAiModels, internationalZAiDefaultModelId, mainlandZAiDefaultModelId, ZAI_DEFAULT_TEMPERATURE, zaiApiLineConfigs, // kilocode_change
 } from "@roo-code/types";
import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider";
export class ZAiHandler extends BaseOpenAiCompatibleProvider {
    constructor(options) {
        const isChina = zaiApiLineConfigs[options.zaiApiLine ?? "international_coding"].isChina; // kilocode_change
        const models = isChina ? mainlandZAiModels : internationalZAiModels;
        const defaultModelId = isChina ? mainlandZAiDefaultModelId : internationalZAiDefaultModelId;
        super({
            ...options,
            providerName: "Z AI",
            baseURL: zaiApiLineConfigs[options.zaiApiLine ?? "international_coding"].baseUrl, // kilocode_change
            apiKey: options.zaiApiKey ?? "not-provided",
            defaultProviderModelId: defaultModelId,
            providerModels: models,
            defaultTemperature: ZAI_DEFAULT_TEMPERATURE,
        });
    }
}
//# sourceMappingURL=zai.js.map