export const EXPERIMENT_IDS = {
    MORPH_FAST_APPLY: "morphFastApply", // kilocode_change
    MULTI_FILE_APPLY_DIFF: "multiFileApplyDiff",
    POWER_STEERING: "powerSteering",
    PREVENT_FOCUS_DISRUPTION: "preventFocusDisruption",
    IMAGE_GENERATION: "imageGeneration",
    RUN_SLASH_COMMAND: "runSlashCommand",
};
export const experimentConfigsMap = {
    MORPH_FAST_APPLY: { enabled: false }, // kilocode_change
    MULTI_FILE_APPLY_DIFF: { enabled: false },
    POWER_STEERING: { enabled: false },
    PREVENT_FOCUS_DISRUPTION: { enabled: false },
    IMAGE_GENERATION: { enabled: false },
    RUN_SLASH_COMMAND: { enabled: false },
};
export const experimentDefault = Object.fromEntries(Object.entries(experimentConfigsMap).map(([_, config]) => [
    EXPERIMENT_IDS[_],
    config.enabled,
]));
export const experiments = {
    get: (id) => experimentConfigsMap[id],
    isEnabled: (experimentsConfig, id) => experimentsConfig[id] ?? experimentDefault[id],
};
//# sourceMappingURL=experiments.js.map