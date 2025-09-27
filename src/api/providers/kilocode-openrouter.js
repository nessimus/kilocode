import { OpenRouterHandler } from "./openrouter";
import { getModelParams } from "../transform/model-params";
import { getModels } from "./fetchers/modelCache";
import { DEEP_SEEK_DEFAULT_TEMPERATURE, openRouterDefaultModelId, openRouterDefaultModelInfo } from "@roo-code/types";
import { getKiloBaseUriFromToken } from "../../shared/kilocode/token";
import { getModelEndpoints } from "./fetchers/modelEndpointCache";
import { getKilocodeDefaultModel } from "./kilocode/getKilocodeDefaultModel";
import { X_KILOCODE_ORGANIZATIONID, X_KILOCODE_TASKID } from "../../shared/kilocode/headers";
/**
 * A custom OpenRouter handler that overrides the getModel function
 * to provide custom model information and fetches models from the KiloCode OpenRouter endpoint.
 */
export class KilocodeOpenrouterHandler extends OpenRouterHandler {
    models = {};
    defaultModel = openRouterDefaultModelId;
    get providerName() {
        return "KiloCode";
    }
    constructor(options) {
        const baseUri = getKiloBaseUriFromToken(options.kilocodeToken ?? "");
        options = {
            ...options,
            openRouterBaseUrl: `${baseUri}/api/openrouter/`,
            openRouterApiKey: options.kilocodeToken,
        };
        super(options);
    }
    customRequestOptions(metadata) {
        const headers = {};
        if (metadata?.taskId) {
            headers[X_KILOCODE_TASKID] = metadata.taskId;
        }
        const kilocodeOptions = this.options;
        if (kilocodeOptions.kilocodeOrganizationId) {
            headers[X_KILOCODE_ORGANIZATIONID] = kilocodeOptions.kilocodeOrganizationId;
        }
        return Object.keys(headers).length > 0 ? { headers } : undefined;
    }
    getTotalCost(lastUsage) {
        const model = this.getModel().info;
        if (!model.inputPrice && !model.outputPrice) {
            return 0;
        }
        // https://github.com/Kilo-Org/kilocode-backend/blob/eb3d382df1e933a089eea95b9c4387db0c676e35/src/lib/processUsage.ts#L281
        if (lastUsage.is_byok) {
            return lastUsage.cost_details?.upstream_inference_cost || 0;
        }
        return lastUsage.cost || 0;
    }
    getModel() {
        let id = this.options.kilocodeModel ?? this.defaultModel;
        let info = this.models[id] ?? openRouterDefaultModelInfo;
        // If a specific provider is requested, use the endpoint for that provider.
        if (this.options.openRouterSpecificProvider && this.endpoints[this.options.openRouterSpecificProvider]) {
            info = this.endpoints[this.options.openRouterSpecificProvider];
        }
        const isDeepSeekR1 = id.startsWith("deepseek/deepseek-r1") || id === "perplexity/sonar-reasoning";
        const params = getModelParams({
            format: "openrouter",
            modelId: id,
            model: info,
            settings: this.options,
            defaultTemperature: isDeepSeekR1 ? DEEP_SEEK_DEFAULT_TEMPERATURE : 0,
        });
        return { id, info, topP: isDeepSeekR1 ? 0.95 : undefined, ...params };
    }
    async fetchModel() {
        if (!this.options.kilocodeToken || !this.options.openRouterBaseUrl) {
            throw new Error("KiloCode token + baseUrl is required to fetch models");
        }
        const [models, endpoints, defaultModel] = await Promise.all([
            getModels({
                provider: "kilocode-openrouter",
                kilocodeToken: this.options.kilocodeToken,
                kilocodeOrganizationId: this.options.kilocodeOrganizationId,
            }),
            getModelEndpoints({
                router: "openrouter",
                modelId: this.options.kilocodeModel,
                endpoint: this.options.openRouterSpecificProvider,
            }),
            getKilocodeDefaultModel(this.options.kilocodeToken, this.options.kilocodeOrganizationId),
        ]);
        this.models = models;
        this.endpoints = endpoints;
        this.defaultModel = defaultModel;
        return this.getModel();
    }
}
//# sourceMappingURL=kilocode-openrouter.js.map