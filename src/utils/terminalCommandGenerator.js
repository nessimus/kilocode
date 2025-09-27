// kilocode_change - new file
import * as vscode from "vscode";
import { ContextProxy } from "../core/config/ContextProxy";
import { ProviderSettingsManager } from "../core/config/ProviderSettingsManager";
import { supportPrompt } from "../shared/support-prompt";
import { singleCompletionHandler } from "./single-completion-handler";
import { t } from "../i18n";
import { getLatestTerminalOutput } from "../core/mentions";
export async function generateTerminalCommand(options) {
    const { outputChannel, context } = options;
    try {
        const shouldProceed = await showWarningIfNeeded(context);
        if (!shouldProceed) {
            return;
        }
        const userInput = await getUserInput();
        if (!userInput) {
            return;
        }
        const activeTerminal = vscode.window.activeTerminal;
        if (!activeTerminal) {
            vscode.window.showErrorMessage(t("kilocode:terminalCommandGenerator.noActiveTerminal"));
            return;
        }
        await executeCommandGeneration(activeTerminal, userInput, context);
    }
    catch (error) {
        handleError(error, outputChannel, "generateTerminalCommand");
    }
}
async function showWarningIfNeeded(context) {
    const warningAcknowledged = context.globalState.get("terminalCommandWarningAcknowledged") ?? false;
    if (!warningAcknowledged) {
        const warningChoice = await vscode.window.showInformationMessage(t("kilocode:terminalCommandGenerator.warningDialog.title"), { modal: true, detail: t("kilocode:terminalCommandGenerator.warningDialog.message") }, t("kilocode:terminalCommandGenerator.warningDialog.okButton"), t("kilocode:terminalCommandGenerator.warningDialog.cancelButton"));
        if (warningChoice !== t("kilocode:terminalCommandGenerator.warningDialog.okButton")) {
            return false;
        }
        await context.globalState.update("terminalCommandWarningAcknowledged", true);
    }
    return true;
}
async function getUserInput() {
    return await vscode.window.showInputBox({
        prompt: t("kilocode:terminalCommandGenerator.inputPrompt"),
        placeHolder: t("kilocode:terminalCommandGenerator.inputPlaceholder"),
        ignoreFocusOut: true,
    });
}
async function executeCommandGeneration(activeTerminal, userInput, context) {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: t("kilocode:terminalCommandGenerator.generatingProgress"),
        cancellable: false,
    }, async () => {
        const terminalContext = await buildTerminalContext(activeTerminal);
        const apiConfiguration = await getApiConfiguration(context);
        const customSupportPrompts = ContextProxy.instance?.getValue("customSupportPrompts") || {};
        const prompt = supportPrompt.create("TERMINAL_GENERATE", {
            userInput,
            ...terminalContext,
        }, customSupportPrompts);
        const generatedCommand = await singleCompletionHandler(apiConfiguration, prompt);
        const cleanCommand = generatedCommand
            .trim()
            .replace(/^```[\w]*\n?|```$/g, "")
            .trim();
        activeTerminal.sendText(cleanCommand, false);
        activeTerminal.show();
        vscode.window.showInformationMessage(t("kilocode:terminalCommandGenerator.commandGenerated", { command: cleanCommand }));
    });
}
async function buildTerminalContext(activeTerminal) {
    const terminalHistory = await getTerminalHistory();
    return {
        operatingSystem: process.platform,
        currentDirectory: activeTerminal.shellIntegration?.cwd?.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "~",
        shell: process.env.SHELL || (process.platform === "win32" ? "cmd" : "bash"),
        terminalHistory,
    };
}
async function getTerminalHistory() {
    try {
        const fullOutput = await getLatestTerminalOutput();
        if (!fullOutput) {
            return "";
        }
        const lines = fullOutput.split("\n");
        const lastLines = lines.slice(-200);
        return lastLines.join("\n").trim();
    }
    catch (error) {
        console.warn("Failed to retrieve terminal history:", error);
        return "";
    }
}
function handleError(error, outputChannel, context) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    outputChannel.appendLine(`Error in ${context}: ${errorMessage}`);
    if (context === "generateTerminalCommand") {
        vscode.window.showErrorMessage(t("kilocode:terminalCommandGenerator.generationFailed", { error: errorMessage }));
    }
    else {
        vscode.window.showErrorMessage(`Error: ${errorMessage}`);
    }
}
async function getApiConfiguration(context) {
    const contextProxy = ContextProxy.instance;
    if (!contextProxy) {
        throw new Error("ContextProxy not initialized");
    }
    const apiConfiguration = contextProxy.getProviderSettings();
    const terminalCommandApiConfigId = contextProxy.getValue("terminalCommandApiConfigId");
    const listApiConfigMeta = contextProxy.getValue("listApiConfigMeta") || [];
    let configToUse = apiConfiguration;
    if (terminalCommandApiConfigId &&
        listApiConfigMeta.find(({ id }) => id === terminalCommandApiConfigId)) {
        try {
            const providerSettingsManager = new ProviderSettingsManager(context);
            await providerSettingsManager.initialize();
            const { name: _, ...providerSettings } = await providerSettingsManager.getProfile({
                id: terminalCommandApiConfigId,
            });
            if (providerSettings.apiProvider) {
                configToUse = providerSettings;
            }
        }
        catch (error) {
            console.warn(`Failed to load terminal command API config ${terminalCommandApiConfigId}:`, error);
        }
    }
    if (!configToUse || !configToUse.apiProvider) {
        throw new Error("No valid API configuration available");
    }
    return configToUse;
}
//# sourceMappingURL=terminalCommandGenerator.js.map