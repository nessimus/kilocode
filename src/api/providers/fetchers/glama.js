import axios from "axios";
import { parseApiPrice } from "../../../shared/cost";
export async function getGlamaModels() {
    const models = {};
    try {
        const response = await axios.get("https://glama.ai/api/gateway/v1/models");
        const rawModels = response.data;
        for (const rawModel of rawModels) {
            const modelInfo = {
                maxTokens: rawModel.maxTokensOutput,
                contextWindow: rawModel.maxTokensInput,
                supportsImages: rawModel.capabilities?.includes("input:image"),
                supportsComputerUse: rawModel.capabilities?.includes("computer_use"),
                supportsPromptCache: rawModel.capabilities?.includes("caching"),
                inputPrice: parseApiPrice(rawModel.pricePerToken?.input),
                outputPrice: parseApiPrice(rawModel.pricePerToken?.output),
                description: undefined,
                cacheWritesPrice: parseApiPrice(rawModel.pricePerToken?.cacheWrite),
                cacheReadsPrice: parseApiPrice(rawModel.pricePerToken?.cacheRead),
            };
            switch (rawModel.id) {
                case rawModel.id.startsWith("anthropic/"):
                    modelInfo.maxTokens = 8192;
                    break;
                default:
                    break;
            }
            models[rawModel.id] = modelInfo;
        }
    }
    catch (error) {
        console.error(`Error fetching Glama models: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`);
    }
    return models;
}
//# sourceMappingURL=glama.js.map