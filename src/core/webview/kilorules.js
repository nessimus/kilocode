import os from "os";
import * as path from "path";
import fs from "fs/promises";
import * as vscode from "vscode";
import { fileExistsAtPath } from "../../utils/fs";
import { openFile } from "../../integrations/misc/open-file";
import { getWorkspacePath } from "../../utils/path";
import { t } from "../../i18n";
import { GlobalFileNames } from "../../shared/globalFileNames";
import { allowedExtensions } from "../../shared/kilocode/rules";
export async function getEnabledRules(workspacePath, contextProxy, context) {
    const homedir = os.homedir();
    return {
        globalRules: await getEnabledRulesFromDirectory(path.join(homedir, GlobalFileNames.kiloRules), (await contextProxy.getGlobalState("globalRulesToggles")) || {}),
        localRules: await getEnabledRulesFromDirectory(path.join(workspacePath, GlobalFileNames.kiloRules), (await contextProxy.getWorkspaceState(context, "localRulesToggles")) || {}),
        globalWorkflows: await getEnabledRulesFromDirectory(path.join(os.homedir(), GlobalFileNames.workflows), (await contextProxy.getGlobalState("globalWorkflowToggles")) || {}),
        localWorkflows: await getEnabledRulesFromDirectory(path.join(workspacePath, GlobalFileNames.workflows), (await contextProxy.getWorkspaceState(context, "localWorkflowToggles")) || {}),
    };
}
async function getEnabledRulesFromDirectory(dirPath, toggleState = {}) {
    const exists = await fileExistsAtPath(dirPath);
    if (!exists) {
        return {};
    }
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    const rules = {};
    for (const file of files) {
        if (file.isFile() && allowedExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))) {
            const filePath = path.join(dirPath, file.name);
            rules[filePath] = toggleState[filePath] ?? true;
        }
    }
    return rules;
}
export async function toggleWorkflow(workflowPath, enabled, isGlobal, contextProxy, context) {
    if (isGlobal) {
        const toggles = (await contextProxy.getGlobalState("globalWorkflowToggles")) || {};
        toggles[workflowPath] = enabled;
        await contextProxy.updateGlobalState("globalWorkflowToggles", toggles);
    }
    else {
        const toggles = (await contextProxy.getWorkspaceState(context, "localWorkflowToggles")) || {};
        toggles[workflowPath] = enabled;
        await contextProxy.updateWorkspaceState(context, "localWorkflowToggles", toggles);
    }
}
export async function toggleRule(rulePath, enabled, isGlobal, contextProxy, context) {
    if (isGlobal) {
        const toggles = (await contextProxy.getGlobalState("globalRulesToggles")) || {};
        toggles[rulePath] = enabled;
        await contextProxy.updateGlobalState("globalRulesToggles", toggles);
    }
    else {
        const toggles = (await contextProxy.getWorkspaceState(context, "localRulesToggles")) || {};
        toggles[rulePath] = enabled;
        await contextProxy.updateWorkspaceState(context, "localRulesToggles", toggles);
    }
}
function getRuleDirectoryPath(baseDir, ruleType) {
    return ruleType === "workflow"
        ? path.join(baseDir, GlobalFileNames.workflows)
        : path.join(baseDir, GlobalFileNames.kiloRules);
}
export async function createRuleFile(filename, isGlobal, ruleType) {
    const workspacePath = getWorkspacePath();
    if (!workspacePath && !isGlobal) {
        vscode.window.showErrorMessage(t("kilocode:rules.errors.noWorkspaceFound"));
        return;
    }
    const rulesDir = isGlobal
        ? getRuleDirectoryPath(os.homedir(), ruleType)
        : getRuleDirectoryPath(workspacePath, ruleType);
    await fs.mkdir(rulesDir, { recursive: true });
    const filePath = path.join(rulesDir, filename);
    if (await fileExistsAtPath(filePath)) {
        vscode.window.showErrorMessage(t("kilocode:rules.errors.fileAlreadyExists", { filename }));
        return;
    }
    const baseFileName = path.basename(filename);
    const content = ruleType === "workflow" ? workflowTemplate(baseFileName) : ruleTemplate(baseFileName);
    await fs.writeFile(filePath, content, "utf8");
    await openFile(filePath);
}
function workflowTemplate(baseFileName) {
    return `# ${baseFileName}

${t("kilocode:rules.templates.workflow.description")}

${t("kilocode:rules.templates.workflow.stepsHeader")}

1. ${t("kilocode:rules.templates.workflow.step1")}
2. ${t("kilocode:rules.templates.workflow.step2")}
`;
}
function ruleTemplate(baseFileName) {
    return `# ${baseFileName}

${t("kilocode:rules.templates.rule.description")}

${t("kilocode:rules.templates.rule.guidelinesHeader")}

- ${t("kilocode:rules.templates.rule.guideline1")}
- ${t("kilocode:rules.templates.rule.guideline2")}
`;
}
export async function deleteRuleFile(rulePath) {
    const deleteAction = t("kilocode:rules.actions.delete");
    const filename = path.basename(rulePath);
    const result = await vscode.window.showWarningMessage(t("kilocode:rules.actions.confirmDelete", { filename }), { modal: true }, deleteAction);
    if (result === deleteAction) {
        await fs.unlink(rulePath);
        vscode.window.showInformationMessage(t("kilocode:rules.actions.deleted", { filename }));
    }
}
//# sourceMappingURL=kilorules.js.map