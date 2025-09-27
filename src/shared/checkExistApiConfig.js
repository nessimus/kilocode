import { SECRET_STATE_KEYS, GLOBAL_SECRET_KEYS } from "@roo-code/types";
export function checkExistKey(config) {
    if (!config) {
        return false;
    }
    // Special case for human-relay, fake-ai, claude-code, qwen-code, and roo providers which don't need any configuration.
    if (config.apiProvider &&
        ["human-relay", "fake-ai", "claude-code", "qwen-code", "roo", "gemini-cli"].includes(config.apiProvider) // kilocode_change: add gemini-cli
    ) {
        return true;
    }
    // Check all secret keys from the centralized SECRET_STATE_KEYS array.
    // Filter out keys that are not part of ProviderSettings (global secrets are stored separately)
    const providerSecretKeys = SECRET_STATE_KEYS.filter((key) => !GLOBAL_SECRET_KEYS.includes(key));
    const hasSecretKey = providerSecretKeys.some((key) => config[key] !== undefined);
    // Check additional non-secret configuration properties
    const hasOtherConfig = [
        config.awsRegion,
        config.vertexProjectId,
        config.ollamaModelId,
        config.lmStudioModelId,
        config.vsCodeLmModelSelector,
        config.kilocodeModel, // kilocode_change
    ].some((value) => value !== undefined);
    return hasSecretKey || hasOtherConfig;
}
//# sourceMappingURL=checkExistApiConfig.js.map