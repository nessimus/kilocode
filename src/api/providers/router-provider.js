import OpenAI from "openai";
import { BaseProvider } from "./base-provider";
import { getModels } from "./fetchers/modelCache";
import { DEFAULT_HEADERS } from "./constants";
const TEMPERATURE_UNSUPPORTED_PREFIXES = ["openai/o3", "openai/gpt5", "gpt-5"]; // kilocode_change
export class RouterProvider extends BaseProvider {
    options;
    name;
    models = {};
    modelId;
    defaultModelId;
    defaultModelInfo;
    client;
    constructor({ options, name, baseURL, apiKey = "not-provided", modelId, defaultModelId, defaultModelInfo, }) {
        super();
        this.options = options;
        this.name = name;
        this.modelId = modelId;
        this.defaultModelId = defaultModelId;
        this.defaultModelInfo = defaultModelInfo;
        this.client = new OpenAI({
            baseURL,
            apiKey,
            defaultHeaders: {
                ...DEFAULT_HEADERS,
                ...(options.openAiHeaders || {}),
            },
        });
    }
    async fetchModel() {
        this.models = await getModels({ provider: this.name, apiKey: this.client.apiKey, baseUrl: this.client.baseURL });
        return this.getModel();
    }
    getModel() {
        const id = this.modelId ?? this.defaultModelId;
        return this.models[id]
            ? { id, info: this.models[id] }
            : { id: this.defaultModelId, info: this.defaultModelInfo };
    }
    supportsTemperature(modelId) {
        return !TEMPERATURE_UNSUPPORTED_PREFIXES.some((prefix) => modelId.startsWith(prefix)); // kilocode_change
    }
}
//# sourceMappingURL=router-provider.js.map