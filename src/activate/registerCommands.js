import * as vscode from "vscode";
import delay from "delay";
import { TelemetryService } from "@roo-code/telemetry";
import { getCommand } from "../utils/commands";
import { ClineProvider } from "../core/webview/ClineProvider";
import { exportSettings } from "../core/config/importExport"; // kilocode_change
import { ContextProxy } from "../core/config/ContextProxy";
import { focusPanel } from "../utils/focusPanel";
import { registerHumanRelayCallback, unregisterHumanRelayCallback, handleHumanRelayResponse } from "./humanRelay";
import { handleNewTask } from "./handleTask";
import { CodeIndexManager } from "../services/code-index/manager";
import { importSettingsWithFeedback } from "../core/config/importExport";
import { MdmService } from "../services/mdm/MdmService";
import { generateTerminalCommand } from "../utils/terminalCommandGenerator"; // kilocode_change
/**
 * Helper to get the visible ClineProvider instance or log if not found.
 */
export function getVisibleProviderOrLog(outputChannel) {
    const visibleProvider = ClineProvider.getVisibleInstance();
    if (!visibleProvider) {
        outputChannel.appendLine("Cannot find any visible Kilo Code instances.");
        return undefined;
    }
    return visibleProvider;
}
// Store panel references in both modes
let sidebarPanel = undefined;
let tabPanel = undefined;
/**
 * Get the currently active panel
 * @returns WebviewPanel或WebviewView
 */
export function getPanel() {
    return tabPanel || sidebarPanel;
}
/**
 * Set panel references
 */
export function setPanel(newPanel, type) {
    if (type === "sidebar") {
        sidebarPanel = newPanel;
        tabPanel = undefined;
    }
    else {
        tabPanel = newPanel;
        sidebarPanel = undefined;
    }
}
export const registerCommands = (options) => {
    const { context } = options;
    for (const [id, callback] of Object.entries(getCommandsMap(options))) {
        const command = getCommand(id);
        context.subscriptions.push(vscode.commands.registerCommand(command, callback));
    }
};
const getCommandsMap = ({ context, outputChannel, workplaceService, endlessSurfaceService, cloverSessionService, }) => ({
    activationCompleted: () => { },
    cloudButtonClicked: () => {
        const visibleProvider = getVisibleProviderOrLog(outputChannel);
        if (!visibleProvider) {
            return;
        }
        TelemetryService.instance.captureTitleButtonClicked("cloud");
        visibleProvider.postMessageToWebview({ type: "action", action: "cloudButtonClicked" });
    },
    plusButtonClicked: async () => {
        const visibleProvider = getVisibleProviderOrLog(outputChannel);
        if (!visibleProvider) {
            return;
        }
        TelemetryService.instance.captureTitleButtonClicked("plus");
        await visibleProvider.removeClineFromStack();
        await visibleProvider.refreshWorkspace();
        await visibleProvider.postMessageToWebview({ type: "action", action: "chatButtonClicked" });
        // Send focusInput action immediately after chatButtonClicked
        // This ensures the focus happens after the view has switched
        await visibleProvider.postMessageToWebview({ type: "action", action: "focusInput" });
    },
    mcpButtonClicked: () => {
        const visibleProvider = getVisibleProviderOrLog(outputChannel);
        if (!visibleProvider) {
            return;
        }
        TelemetryService.instance.captureTitleButtonClicked("mcp");
        visibleProvider.postMessageToWebview({ type: "action", action: "mcpButtonClicked" });
    },
    promptsButtonClicked: () => {
        const visibleProvider = getVisibleProviderOrLog(outputChannel);
        if (!visibleProvider) {
            return;
        }
        TelemetryService.instance.captureTitleButtonClicked("prompts");
        visibleProvider.postMessageToWebview({ type: "action", action: "promptsButtonClicked" });
    },
    popoutButtonClicked: () => {
        TelemetryService.instance.captureTitleButtonClicked("popout");
        return openClineInNewTab({
            context,
            outputChannel,
            workplaceService,
            endlessSurfaceService,
            cloverSessionService,
        });
    },
    openInNewTab: () => openClineInNewTab({
        context,
        outputChannel,
        workplaceService,
        endlessSurfaceService,
        cloverSessionService,
    }),
    settingsButtonClicked: () => {
        const visibleProvider = getVisibleProviderOrLog(outputChannel);
        if (!visibleProvider) {
            return;
        }
        TelemetryService.instance.captureTitleButtonClicked("settings");
        visibleProvider.postMessageToWebview({ type: "action", action: "settingsButtonClicked" });
        // Also explicitly post the visibility message to trigger scroll reliably
        visibleProvider.postMessageToWebview({ type: "action", action: "didBecomeVisible" });
    },
    historyButtonClicked: () => {
        const visibleProvider = getVisibleProviderOrLog(outputChannel);
        if (!visibleProvider) {
            return;
        }
        TelemetryService.instance.captureTitleButtonClicked("history");
        visibleProvider.postMessageToWebview({ type: "action", action: "historyButtonClicked" });
    },
    // kilocode_change begin
    profileButtonClicked: () => {
        const visibleProvider = getVisibleProviderOrLog(outputChannel);
        if (!visibleProvider) {
            return;
        }
        visibleProvider.postMessageToWebview({ type: "action", action: "profileButtonClicked" });
    },
    helpButtonClicked: () => {
        vscode.env.openExternal(vscode.Uri.parse("https://kilocode.ai"));
    },
    // kilocode_change end
    marketplaceButtonClicked: () => {
        const visibleProvider = getVisibleProviderOrLog(outputChannel);
        if (!visibleProvider)
            return;
        visibleProvider.postMessageToWebview({ type: "action", action: "marketplaceButtonClicked" });
    },
    showHumanRelayDialog: (params) => {
        const panel = getPanel();
        if (panel) {
            panel?.webview.postMessage({
                type: "showHumanRelayDialog",
                requestId: params.requestId,
                promptText: params.promptText,
            });
        }
    },
    registerHumanRelayCallback: registerHumanRelayCallback,
    unregisterHumanRelayCallback: unregisterHumanRelayCallback,
    handleHumanRelayResponse: handleHumanRelayResponse,
    newTask: handleNewTask,
    setCustomStoragePath: async () => {
        const { promptForCustomStoragePath } = await import("../utils/storage");
        await promptForCustomStoragePath();
    },
    importSettings: async (filePath) => {
        const visibleProvider = getVisibleProviderOrLog(outputChannel);
        if (!visibleProvider) {
            return;
        }
        await importSettingsWithFeedback({
            providerSettingsManager: visibleProvider.providerSettingsManager,
            contextProxy: visibleProvider.contextProxy,
            customModesManager: visibleProvider.customModesManager,
            provider: visibleProvider,
        }, filePath);
    },
    focusPanel: async () => {
        try {
            await focusPanel(tabPanel, sidebarPanel);
        }
        catch (error) {
            outputChannel.appendLine(`Error focusing panel: ${error}`);
        }
    },
    acceptInput: () => {
        const visibleProvider = getVisibleProviderOrLog(outputChannel);
        if (!visibleProvider) {
            return;
        }
        visibleProvider.postMessageToWebview({ type: "acceptInput" });
    }, // kilocode_change begin
    focusChatInput: async () => {
        try {
            await vscode.commands.executeCommand("kilo-code.SidebarProvider.focus");
            await delay(100);
            let visibleProvider = getVisibleProviderOrLog(outputChannel);
            if (!visibleProvider) {
                // If still no visible provider, try opening in a new tab
                const tabProvider = await openClineInNewTab({
                    context,
                    outputChannel,
                    workplaceService,
                    endlessSurfaceService,
                    cloverSessionService,
                });
                await delay(100);
                visibleProvider = tabProvider;
            }
            visibleProvider?.postMessageToWebview({
                type: "action",
                action: "focusChatInput",
            });
        }
        catch (error) {
            outputChannel.appendLine(`Error in focusChatInput: ${error}`);
        }
    },
    generateTerminalCommand: async () => await generateTerminalCommand({ outputChannel, context }), // kilocode_change
    exportSettings: async () => {
        const visibleProvider = getVisibleProviderOrLog(outputChannel);
        if (!visibleProvider)
            return;
        await exportSettings({
            providerSettingsManager: visibleProvider.providerSettingsManager,
            contextProxy: visibleProvider.contextProxy,
        });
    },
    // Handle external URI - used by JetBrains plugin to forward auth tokens
    handleExternalUri: async (uriString) => {
        const visibleProvider = getVisibleProviderOrLog(outputChannel);
        if (!visibleProvider) {
            return;
        }
        try {
            // Parse the URI string and create a VSCode URI object
            const uri = vscode.Uri.parse(uriString);
            // Import and use the existing handleUri function
            const { handleUri } = await import("./handleUri");
            await handleUri(uri);
            outputChannel.appendLine(`Successfully handled external URI: ${uriString}`);
        }
        catch (error) {
            outputChannel.appendLine(`Error handling external URI: ${uriString}, error: ${error}`);
        }
    },
    // kilocode_change end
});
export const openClineInNewTab = async ({ context, outputChannel, workplaceService, endlessSurfaceService, cloverSessionService, }) => {
    // (This example uses webviewProvider activation event which is necessary to
    // deserialize cached webview, but since we use retainContextWhenHidden, we
    // don't need to use that event).
    // https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
    const contextProxy = await ContextProxy.getInstance(context);
    const codeIndexManager = CodeIndexManager.getInstance(context);
    // Get the existing MDM service instance to ensure consistent policy enforcement
    let mdmService;
    try {
        mdmService = MdmService.getInstance();
    }
    catch (error) {
        // MDM service not initialized, which is fine - extension can work without it
        mdmService = undefined;
    }
    const tabProvider = new ClineProvider(context, outputChannel, "editor", contextProxy, mdmService);
    if (workplaceService) {
        tabProvider.attachWorkplaceService(workplaceService);
    }
    if (endlessSurfaceService) {
        tabProvider.attachEndlessSurfaceService(endlessSurfaceService);
    }
    if (cloverSessionService) {
        tabProvider.attachCloverSessionService(cloverSessionService);
    }
    const lastCol = Math.max(...vscode.window.visibleTextEditors.map((editor) => editor.viewColumn || 0));
    // Check if there are any visible text editors, otherwise open a new group
    // to the right.
    const hasVisibleEditors = vscode.window.visibleTextEditors.length > 0;
    if (!hasVisibleEditors) {
        await vscode.commands.executeCommand("workbench.action.newGroupRight");
    }
    const targetCol = hasVisibleEditors ? Math.max(lastCol + 1, 1) : vscode.ViewColumn.Two;
    const newPanel = vscode.window.createWebviewPanel(ClineProvider.tabPanelId, "Kilo Code", targetCol, {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
    });
    // Save as tab type panel.
    setPanel(newPanel, "tab");
    newPanel.iconPath = {
        light: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "kilo.png"),
        dark: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "kilo-dark.png"),
    };
    await tabProvider.resolveWebviewView(newPanel);
    // Add listener for visibility changes to notify webview
    newPanel.onDidChangeViewState((e) => {
        const panel = e.webviewPanel;
        if (panel.visible) {
            panel.webview.postMessage({ type: "action", action: "didBecomeVisible" }); // Use the same message type as in SettingsView.tsx
        }
    }, null, // First null is for `thisArgs`
    context.subscriptions);
    // Handle panel closing events.
    newPanel.onDidDispose(() => {
        setPanel(undefined, "tab");
    }, null, context.subscriptions);
    // Lock the editor group so clicking on files doesn't open them over the panel.
    await delay(100);
    await vscode.commands.executeCommand("workbench.action.lockEditorGroup");
    return tabProvider;
};
//# sourceMappingURL=registerCommands.js.map