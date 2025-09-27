import fs from "fs/promises";
import path from "path";
import os from "os";
import { GlobalFileNames } from "../../../shared/globalFileNames";
/**
 * Get rule files content with toggle state filtering (matches Cline's getRuleFilesTotalContent)
 */
async function getRuleFilesTotalContent(rulesFilePaths, basePath, toggles) {
    const ruleFilesTotalContent = await Promise.all(rulesFilePaths.map(async (filePath) => {
        const ruleFilePath = path.resolve(basePath, filePath);
        const ruleFilePathRelative = path.relative(basePath, ruleFilePath);
        // Check if this rule is disabled in toggles
        if (ruleFilePath in toggles && toggles[ruleFilePath] === false) {
            return null;
        }
        return `${ruleFilePathRelative}\n` + (await fs.readFile(ruleFilePath, "utf8")).trim();
    })).then((contents) => contents.filter(Boolean).join("\n\n"));
    return ruleFilesTotalContent;
}
async function loadEnabledRulesFromDirectory(rulesDir, toggleState, label, directoryExists, readTextFilesFromDirectory) {
    if (!(await directoryExists(rulesDir))) {
        return null;
    }
    const files = await readTextFilesFromDirectory(rulesDir);
    if (files.length === 0) {
        return null;
    }
    const rulesContent = await getRuleFilesTotalContent(files.map((f) => f.filename), rulesDir, toggleState);
    return rulesContent ? `# ${label} from ${rulesDir}:\n${rulesContent}` : null;
}
export async function loadEnabledRules(cwd, localRulesToggleState, globalRulesToggleState, directoryExists, readTextFilesFromDirectory) {
    const globalRulesContent = await loadEnabledRulesFromDirectory(path.join(os.homedir(), GlobalFileNames.kiloRules), globalRulesToggleState, "Global Rules", directoryExists, readTextFilesFromDirectory);
    const localRulesContent = await loadEnabledRulesFromDirectory(path.join(cwd, GlobalFileNames.kiloRules), localRulesToggleState, "Local Rules", directoryExists, readTextFilesFromDirectory);
    return [globalRulesContent, localRulesContent].filter(Boolean).join("\n\n");
}
export function hasAnyToggles(toggles) {
    return Object.keys(toggles ?? {}).length > 0;
}
//# sourceMappingURL=kilo.js.map