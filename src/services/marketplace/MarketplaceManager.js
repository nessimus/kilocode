import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import * as yaml from "yaml";
import { TelemetryService } from "@roo-code/telemetry";
import { CloudService } from "@roo-code/cloud";
import { GlobalFileNames } from "../../shared/globalFileNames";
import { ensureSettingsDirectoryExists } from "../../utils/globalContext";
import { t } from "../../i18n";
import { RemoteConfigLoader } from "./RemoteConfigLoader";
import { SimpleInstaller } from "./SimpleInstaller";
export class MarketplaceManager {
    context;
    customModesManager;
    configLoader;
    installer;
    constructor(context, customModesManager) {
        this.context = context;
        this.customModesManager = customModesManager;
        this.configLoader = new RemoteConfigLoader();
        this.installer = new SimpleInstaller(context, customModesManager);
    }
    async getMarketplaceItems() {
        try {
            const errors = [];
            let orgSettings;
            try {
                if (CloudService.hasInstance() && CloudService.instance.isAuthenticated()) {
                    orgSettings = CloudService.instance.getOrganizationSettings();
                }
            }
            catch (orgError) {
                console.warn("Failed to load organization settings:", orgError);
                const orgErrorMessage = orgError instanceof Error ? orgError.message : String(orgError);
                errors.push(`Organization settings: ${orgErrorMessage}`);
            }
            const allMarketplaceItems = await this.configLoader.loadAllItems(orgSettings?.hideMarketplaceMcps);
            let organizationMcps = [];
            let marketplaceItems = allMarketplaceItems;
            if (orgSettings) {
                if (orgSettings.mcps && orgSettings.mcps.length > 0) {
                    organizationMcps = orgSettings.mcps.map((mcp) => ({
                        ...mcp,
                        type: "mcp",
                    }));
                }
                if (orgSettings.hiddenMcps && orgSettings.hiddenMcps.length > 0) {
                    const hiddenMcpIds = new Set(orgSettings.hiddenMcps);
                    marketplaceItems = allMarketplaceItems.filter((item) => item.type !== "mcp" || !hiddenMcpIds.has(item.id));
                }
            }
            return {
                organizationMcps,
                marketplaceItems,
                errors: errors.length > 0 ? errors : undefined,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("Failed to load marketplace items:", error);
            return {
                organizationMcps: [],
                marketplaceItems: [],
                errors: [errorMessage],
            };
        }
    }
    async getCurrentItems() {
        const result = await this.getMarketplaceItems();
        return [...result.organizationMcps, ...result.marketplaceItems];
    }
    filterItems(items, filters) {
        return items.filter((item) => {
            // Type filter
            if (filters.type && item.type !== filters.type) {
                return false;
            }
            // Search filter
            if (filters.search) {
                const searchTerm = filters.search.toLowerCase();
                const searchableText = `${item.name} ${item.description}`.toLowerCase();
                if (!searchableText.includes(searchTerm)) {
                    return false;
                }
            }
            // Tags filter
            if (filters.tags?.length) {
                if (!item.tags?.some((tag) => filters.tags.includes(tag))) {
                    return false;
                }
            }
            return true;
        });
    }
    async updateWithFilteredItems(filters) {
        const allItems = await this.getCurrentItems();
        if (!filters.type && !filters.search && (!filters.tags || filters.tags.length === 0)) {
            return allItems;
        }
        return this.filterItems(allItems, filters);
    }
    async installMarketplaceItem(item, options) {
        const { target = "project", parameters } = options || {};
        vscode.window.showInformationMessage(t("marketplace:installation.installing", { itemName: item.name }));
        try {
            const result = await this.installer.installItem(item, { target, parameters });
            vscode.window.showInformationMessage(t("marketplace:installation.installSuccess", { itemName: item.name }));
            // Capture telemetry for successful installation
            const telemetryProperties = {};
            if (parameters && Object.keys(parameters).length > 0) {
                telemetryProperties.hasParameters = true;
                // For MCP items with multiple installation methods, track which one was used
                if (item.type === "mcp" && parameters._selectedIndex !== undefined && Array.isArray(item.content)) {
                    const selectedMethod = item.content[parameters._selectedIndex];
                    if (selectedMethod && selectedMethod.name) {
                        telemetryProperties.installationMethodName = selectedMethod.name;
                    }
                }
            }
            TelemetryService.instance.captureMarketplaceItemInstalled(item.id, item.type, item.name, target, telemetryProperties);
            // Open the config file that was modified, optionally at the specific line
            const document = await vscode.workspace.openTextDocument(result.filePath);
            const options = {};
            if (result.line !== undefined) {
                // Position cursor at the line where content was added
                options.selection = new vscode.Range(result.line - 1, 0, result.line - 1, 0);
            }
            await vscode.window.showTextDocument(document, options);
            return result.filePath;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(t("marketplace:installation.installError", { itemName: item.name, errorMessage }));
            throw error;
        }
    }
    async removeInstalledMarketplaceItem(item, options) {
        const { target = "project" } = options || {};
        vscode.window.showInformationMessage(t("marketplace:installation.removing", { itemName: item.name }));
        try {
            await this.installer.removeItem(item, { target });
            vscode.window.showInformationMessage(t("marketplace:installation.removeSuccess", { itemName: item.name }));
            // Capture telemetry for successful removal
            TelemetryService.instance.captureMarketplaceItemRemoved(item.id, item.type, item.name, target);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(t("marketplace:installation.removeError", { itemName: item.name, errorMessage }));
            throw error;
        }
    }
    async cleanup() {
        // Clear API cache if needed
        this.configLoader.clearCache();
    }
    /**
     * Get installation metadata by checking config files for installed items
     */
    async getInstallationMetadata() {
        const metadata = {
            project: {},
            global: {},
        };
        // Check project-level installations
        await this.checkProjectInstallations(metadata.project);
        // Check global-level installations
        await this.checkGlobalInstallations(metadata.global);
        return metadata;
    }
    /**
     * Check for project-level installed items
     */
    async checkProjectInstallations(metadata) {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return; // No workspace, no project installations
            }
            // Check modes in .roomodes
            const projectModesPath = path.join(workspaceFolder.uri.fsPath, ".kilocodemodes");
            try {
                const content = await fs.readFile(projectModesPath, "utf-8");
                const data = yaml.parse(content);
                if (data?.customModes && Array.isArray(data.customModes)) {
                    for (const mode of data.customModes) {
                        if (mode.slug) {
                            metadata[mode.slug] = {
                                type: "mode",
                            };
                        }
                    }
                }
            }
            catch (error) {
                // File doesn't exist or can't be read, skip
            }
            // Check MCPs in .roo/mcp.json
            const projectMcpPath = path.join(workspaceFolder.uri.fsPath, ".kilocode", "mcp.json");
            try {
                const content = await fs.readFile(projectMcpPath, "utf-8");
                const data = JSON.parse(content);
                if (data?.mcpServers && typeof data.mcpServers === "object") {
                    for (const serverName of Object.keys(data.mcpServers)) {
                        metadata[serverName] = {
                            type: "mcp",
                        };
                    }
                }
            }
            catch (error) {
                // File doesn't exist or can't be read, skip
            }
        }
        catch (error) {
            console.error("Error checking project installations:", error);
        }
    }
    /**
     * Check for global-level installed items
     */
    async checkGlobalInstallations(metadata) {
        try {
            const globalSettingsPath = await ensureSettingsDirectoryExists(this.context);
            // Check global modes
            const globalModesPath = path.join(globalSettingsPath, GlobalFileNames.customModes);
            try {
                const content = await fs.readFile(globalModesPath, "utf-8");
                const data = yaml.parse(content);
                if (data?.customModes && Array.isArray(data.customModes)) {
                    for (const mode of data.customModes) {
                        if (mode.slug) {
                            metadata[mode.slug] = {
                                type: "mode",
                            };
                        }
                    }
                }
            }
            catch (error) {
                // File doesn't exist or can't be read, skip
            }
            // Check global MCPs
            const globalMcpPath = path.join(globalSettingsPath, GlobalFileNames.mcpSettings);
            try {
                const content = await fs.readFile(globalMcpPath, "utf-8");
                const data = JSON.parse(content);
                if (data?.mcpServers && typeof data.mcpServers === "object") {
                    for (const serverName of Object.keys(data.mcpServers)) {
                        metadata[serverName] = {
                            type: "mcp",
                        };
                    }
                }
            }
            catch (error) {
                // File doesn't exist or can't be read, skip
            }
        }
        catch (error) {
            console.error("Error checking global installations:", error);
        }
    }
}
//# sourceMappingURL=MarketplaceManager.js.map