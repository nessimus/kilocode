import { vertexDefaultModelId, vertexModels } from "@roo-code/types";
import { getModelParams } from "../transform/model-params";
import { GeminiHandler } from "./gemini";
export class VertexHandler extends GeminiHandler {
    constructor(options) {
        super({ ...options, isVertex: true });
    }
    getModel() {
        const modelId = this.options.apiModelId;
        let id = modelId && modelId in vertexModels ? modelId : vertexDefaultModelId;
        const info = vertexModels[id];
        const params = getModelParams({ format: "gemini", modelId: id, model: info, settings: this.options });
        // The `:thinking` suffix indicates that the model is a "Hybrid"
        // reasoning model and that reasoning is required to be enabled.
        // The actual model ID honored by Gemini's API does not have this
        // suffix.
        return { id: id.endsWith(":thinking") ? id.replace(":thinking", "") : id, info, ...params };
    }
}
//# sourceMappingURL=vertex.js.map