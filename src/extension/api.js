import { EventEmitter } from "events";
import fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";
import { RooCodeEventName, TaskCommandName, isSecretStateKey, IpcOrigin, IpcMessageType, } from "@roo-code/types";
import { IpcServer } from "@roo-code/ipc";
import { Package } from "../shared/package";
import { openClineInNewTab } from "../activate/registerCommands";
export class API extends EventEmitter {
    outputChannel;
    sidebarProvider;
    context;
    endlessSurfaceService;
    ipc;
    taskMap = new Map();
    log;
    logfile;
    getEndlessSurfaceServiceInstance() {
        return this.endlessSurfaceService ?? this.sidebarProvider.getEndlessSurfaceService();
    }
    getCloverSessionServiceInstance() {
        return this.sidebarProvider.getCloverSessionService();
    }
    ensureEndlessSurfaceService() {
        const service = this.getEndlessSurfaceServiceInstance();
        if (!service) {
            throw new Error("Endless surface service is not initialized");
        }
        return service;
    }
    constructor(outputChannel, provider, endlessSurfaceService, socketPath, enableLogging = false) {
        super();
        this.outputChannel = outputChannel;
        this.sidebarProvider = provider;
        this.context = provider.context;
        this.endlessSurfaceService = endlessSurfaceService;
        if (endlessSurfaceService) {
            provider.attachEndlessSurfaceService(endlessSurfaceService);
        }
        if (enableLogging) {
            this.log = (...args) => {
                this.outputChannelLog(...args);
                console.log(args);
            };
            this.logfile = path.join(os.tmpdir(), "kilo-code-messages.log");
        }
        else {
            this.log = () => { };
        }
        this.registerListeners(this.sidebarProvider);
        if (socketPath) {
            const ipc = (this.ipc = new IpcServer(socketPath, this.log));
            ipc.listen();
            this.log(`[API] ipc server started: socketPath=${socketPath}, pid=${process.pid}, ppid=${process.ppid}`);
            ipc.on(IpcMessageType.TaskCommand, async (_clientId, { commandName, data }) => {
                switch (commandName) {
                    case TaskCommandName.StartNewTask:
                        this.log(`[API] StartNewTask -> ${data.text}, ${JSON.stringify(data.configuration)}`);
                        await this.startNewTask(data);
                        break;
                    case TaskCommandName.CancelTask:
                        this.log(`[API] CancelTask -> ${data}`);
                        await this.cancelTask(data);
                        break;
                    case TaskCommandName.CloseTask:
                        this.log(`[API] CloseTask -> ${data}`);
                        await vscode.commands.executeCommand("workbench.action.files.saveFiles");
                        await vscode.commands.executeCommand("workbench.action.closeWindow");
                        break;
                    case TaskCommandName.ResumeTask:
                        this.log(`[API] ResumeTask -> ${data}`);
                        try {
                            await this.resumeTask(data);
                        }
                        catch (error) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            this.log(`[API] ResumeTask failed for taskId ${data}: ${errorMessage}`);
                            // Don't rethrow - we want to prevent IPC server crashes
                            // The error is logged for debugging purposes
                        }
                        break;
                }
            });
        }
    }
    emit(eventName, ...args) {
        const data = { eventName: eventName, payload: args };
        this.ipc?.broadcast({ type: IpcMessageType.TaskEvent, origin: IpcOrigin.Server, data });
        return super.emit(eventName, ...args);
    }
    async startNewTask({ configuration, text, images, newTab, }) {
        let provider;
        if (newTab) {
            await vscode.commands.executeCommand("workbench.action.files.revert");
            await vscode.commands.executeCommand("workbench.action.closeAllEditors");
            provider = await openClineInNewTab({
                context: this.context,
                outputChannel: this.outputChannel,
                workplaceService: this.sidebarProvider.getWorkplaceService(),
                endlessSurfaceService: this.getEndlessSurfaceServiceInstance(),
                cloverSessionService: this.getCloverSessionServiceInstance(),
            });
            this.registerListeners(provider);
        }
        else {
            await vscode.commands.executeCommand(`${Package.name}.SidebarProvider.focus`);
            provider = this.sidebarProvider;
        }
        await provider.removeClineFromStack();
        await provider.postStateToWebview();
        await provider.postMessageToWebview({ type: "action", action: "chatButtonClicked" });
        await provider.postMessageToWebview({ type: "invoke", invoke: "newChat", text, images });
        const options = {
            consecutiveMistakeLimit: Number.MAX_SAFE_INTEGER,
        };
        const task = await provider.createTask(text, images, undefined, options, configuration);
        if (!task) {
            throw new Error("Failed to create task due to policy restrictions");
        }
        return task.taskId;
    }
    async resumeTask(taskId) {
        const { historyItem } = await this.sidebarProvider.getTaskWithId(taskId);
        await this.sidebarProvider.createTaskWithHistoryItem(historyItem);
        await this.sidebarProvider.postMessageToWebview({ type: "action", action: "chatButtonClicked" });
    }
    async isTaskInHistory(taskId) {
        try {
            await this.sidebarProvider.getTaskWithId(taskId);
            return true;
        }
        catch {
            return false;
        }
    }
    getCurrentTaskStack() {
        return this.sidebarProvider.getCurrentTaskStack();
    }
    async clearCurrentTask(lastMessage) {
        await this.sidebarProvider.finishSubTask(lastMessage ?? "");
        await this.sidebarProvider.postStateToWebview();
    }
    async cancelCurrentTask() {
        await this.sidebarProvider.cancelTask();
    }
    async cancelTask(taskId) {
        const provider = this.taskMap.get(taskId);
        if (provider) {
            await provider.cancelTask();
            this.taskMap.delete(taskId);
        }
    }
    async sendMessage(text, images) {
        await this.sidebarProvider.postMessageToWebview({ type: "invoke", invoke: "sendMessage", text, images });
    }
    async pressPrimaryButton() {
        await this.sidebarProvider.postMessageToWebview({ type: "invoke", invoke: "primaryButtonClick" });
    }
    async pressSecondaryButton() {
        await this.sidebarProvider.postMessageToWebview({ type: "invoke", invoke: "secondaryButtonClick" });
    }
    async listSurfaces() {
        const service = this.ensureEndlessSurfaceService();
        return service.listSummaries();
    }
    async createSurface(title) {
        const service = this.ensureEndlessSurfaceService();
        const record = await service.createSurface(title);
        await service.setActiveSurface(record.meta.id);
        await this.sidebarProvider.postMessageToWebview({ type: "action", action: "switchTab", tab: "brainstorm" });
        await this.sidebarProvider.postMessageToWebview({ type: "openSurface", surfaceId: record.meta.id });
        return record;
    }
    async deleteSurface(surfaceId) {
        const service = this.ensureEndlessSurfaceService();
        return service.deleteSurface(surfaceId);
    }
    async openSurface(surfaceId) {
        const service = this.ensureEndlessSurfaceService();
        const record = await service.getSurface(surfaceId);
        if (!record) {
            throw new Error(`Surface not found: ${surfaceId}`);
        }
        await service.setActiveSurface(surfaceId);
        await this.sidebarProvider.postMessageToWebview({ type: "action", action: "switchTab", tab: "brainstorm" });
        await this.sidebarProvider.postMessageToWebview({ type: "openSurface", surfaceId });
    }
    async getSurfaceData(surfaceId) {
        const service = this.ensureEndlessSurfaceService();
        return service.getSurfaceData(surfaceId);
    }
    async saveSurfaceRecord(record) {
        const service = this.ensureEndlessSurfaceService();
        await service.updateSurface(record);
    }
    async createSurfaceNode(surfaceId, node) {
        const service = this.ensureEndlessSurfaceService();
        return service.createNode(surfaceId, node);
    }
    async updateSurfaceNode(surfaceId, node) {
        const service = this.ensureEndlessSurfaceService();
        return service.updateNode(surfaceId, node);
    }
    async deleteSurfaceNode(surfaceId, nodeId) {
        const service = this.ensureEndlessSurfaceService();
        return service.deleteNode(surfaceId, nodeId);
    }
    async createSurfaceEdge(surfaceId, edge) {
        const service = this.ensureEndlessSurfaceService();
        return service.createEdge(surfaceId, edge);
    }
    async updateSurfaceEdge(surfaceId, edge) {
        const service = this.ensureEndlessSurfaceService();
        return service.updateEdge(surfaceId, edge);
    }
    async deleteSurfaceEdge(surfaceId, edgeId) {
        const service = this.ensureEndlessSurfaceService();
        return service.deleteEdge(surfaceId, edgeId);
    }
    isReady() {
        return this.sidebarProvider.viewLaunched;
    }
    registerListeners(provider) {
        provider.on(RooCodeEventName.TaskCreated, (task) => {
            // Task Lifecycle
            task.on(RooCodeEventName.TaskStarted, async () => {
                this.emit(RooCodeEventName.TaskStarted, task.taskId);
                this.taskMap.set(task.taskId, provider);
                await this.fileLog(`[${new Date().toISOString()}] taskStarted -> ${task.taskId}\n`);
            });
            task.on(RooCodeEventName.TaskCompleted, async (_, tokenUsage, toolUsage) => {
                this.emit(RooCodeEventName.TaskCompleted, task.taskId, tokenUsage, toolUsage, {
                    isSubtask: !!task.parentTaskId,
                });
                this.taskMap.delete(task.taskId);
                await this.fileLog(`[${new Date().toISOString()}] taskCompleted -> ${task.taskId} | ${JSON.stringify(tokenUsage, null, 2)} | ${JSON.stringify(toolUsage, null, 2)}\n`);
            });
            task.on(RooCodeEventName.TaskAborted, () => {
                this.emit(RooCodeEventName.TaskAborted, task.taskId);
                this.taskMap.delete(task.taskId);
            });
            task.on(RooCodeEventName.TaskFocused, () => {
                this.emit(RooCodeEventName.TaskFocused, task.taskId);
            });
            task.on(RooCodeEventName.TaskUnfocused, () => {
                this.emit(RooCodeEventName.TaskUnfocused, task.taskId);
            });
            task.on(RooCodeEventName.TaskActive, () => {
                this.emit(RooCodeEventName.TaskActive, task.taskId);
            });
            task.on(RooCodeEventName.TaskInteractive, () => {
                this.emit(RooCodeEventName.TaskInteractive, task.taskId);
            });
            task.on(RooCodeEventName.TaskResumable, () => {
                this.emit(RooCodeEventName.TaskResumable, task.taskId);
            });
            task.on(RooCodeEventName.TaskIdle, () => {
                this.emit(RooCodeEventName.TaskIdle, task.taskId);
            });
            // Subtask Lifecycle
            task.on(RooCodeEventName.TaskPaused, () => {
                this.emit(RooCodeEventName.TaskPaused, task.taskId);
            });
            task.on(RooCodeEventName.TaskUnpaused, () => {
                this.emit(RooCodeEventName.TaskUnpaused, task.taskId);
            });
            task.on(RooCodeEventName.TaskSpawned, (childTaskId) => {
                this.emit(RooCodeEventName.TaskSpawned, task.taskId, childTaskId);
            });
            // Task Execution
            task.on(RooCodeEventName.Message, async (message) => {
                this.emit(RooCodeEventName.Message, { taskId: task.taskId, ...message });
                if (message.message.partial !== true) {
                    await this.fileLog(`[${new Date().toISOString()}] ${JSON.stringify(message.message, null, 2)}\n`);
                }
            });
            task.on(RooCodeEventName.TaskModeSwitched, (taskId, mode) => {
                this.emit(RooCodeEventName.TaskModeSwitched, taskId, mode);
            });
            task.on(RooCodeEventName.TaskAskResponded, () => {
                this.emit(RooCodeEventName.TaskAskResponded, task.taskId);
            });
            // Task Analytics
            task.on(RooCodeEventName.TaskToolFailed, (taskId, tool, error) => {
                this.emit(RooCodeEventName.TaskToolFailed, taskId, tool, error);
            });
            task.on(RooCodeEventName.TaskTokenUsageUpdated, (_, usage) => {
                this.emit(RooCodeEventName.TaskTokenUsageUpdated, task.taskId, usage);
            });
            // Let's go!
            this.emit(RooCodeEventName.TaskCreated, task.taskId);
        });
    }
    // Logging
    outputChannelLog(...args) {
        for (const arg of args) {
            if (arg === null) {
                this.outputChannel.appendLine("null");
            }
            else if (arg === undefined) {
                this.outputChannel.appendLine("undefined");
            }
            else if (typeof arg === "string") {
                this.outputChannel.appendLine(arg);
            }
            else if (arg instanceof Error) {
                this.outputChannel.appendLine(`Error: ${arg.message}\n${arg.stack || ""}`);
            }
            else {
                try {
                    this.outputChannel.appendLine(JSON.stringify(arg, (key, value) => {
                        if (typeof value === "bigint")
                            return `BigInt(${value})`;
                        if (typeof value === "function")
                            return `Function: ${value.name || "anonymous"}`;
                        if (typeof value === "symbol")
                            return value.toString();
                        return value;
                    }, 2));
                }
                catch (error) {
                    this.outputChannel.appendLine(`[Non-serializable object: ${Object.prototype.toString.call(arg)}]`);
                }
            }
        }
    }
    async fileLog(message) {
        if (!this.logfile) {
            return;
        }
        try {
            await fs.appendFile(this.logfile, message, "utf8");
        }
        catch (_) {
            this.logfile = undefined;
        }
    }
    // Global Settings Management
    getConfiguration() {
        return Object.fromEntries(Object.entries(this.sidebarProvider.getValues()).filter(([key]) => !isSecretStateKey(key)));
    }
    async setConfiguration(values) {
        await this.sidebarProvider.contextProxy.setValues(values);
        await this.sidebarProvider.providerSettingsManager.saveConfig(values.currentApiConfigName || "default", values);
        await this.sidebarProvider.postStateToWebview();
    }
    // Provider Profile Management
    getProfiles() {
        return this.sidebarProvider.getProviderProfileEntries().map(({ name }) => name);
    }
    getProfileEntry(name) {
        return this.sidebarProvider.getProviderProfileEntry(name);
    }
    async createProfile(name, profile, activate = true) {
        const entry = this.getProfileEntry(name);
        if (entry) {
            throw new Error(`Profile with name "${name}" already exists`);
        }
        const id = await this.sidebarProvider.upsertProviderProfile(name, profile ?? {}, activate);
        if (!id) {
            throw new Error(`Failed to create profile with name "${name}"`);
        }
        return id;
    }
    async updateProfile(name, profile, activate = true) {
        const entry = this.getProfileEntry(name);
        if (!entry) {
            throw new Error(`Profile with name "${name}" does not exist`);
        }
        const id = await this.sidebarProvider.upsertProviderProfile(name, profile, activate);
        if (!id) {
            throw new Error(`Failed to update profile with name "${name}"`);
        }
        return id;
    }
    async upsertProfile(name, profile, activate = true) {
        const id = await this.sidebarProvider.upsertProviderProfile(name, profile, activate);
        if (!id) {
            throw new Error(`Failed to upsert profile with name "${name}"`);
        }
        return id;
    }
    async deleteProfile(name) {
        const entry = this.getProfileEntry(name);
        if (!entry) {
            throw new Error(`Profile with name "${name}" does not exist`);
        }
        await this.sidebarProvider.deleteProviderProfile(entry);
    }
    getActiveProfile() {
        return this.getConfiguration().currentApiConfigName;
    }
    async setActiveProfile(name) {
        const entry = this.getProfileEntry(name);
        if (!entry) {
            throw new Error(`Profile with name "${name}" does not exist`);
        }
        await this.sidebarProvider.activateProviderProfile({ name });
        return this.getActiveProfile();
    }
}
//# sourceMappingURL=api.js.map