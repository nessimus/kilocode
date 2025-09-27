// npx vitest run src/api/providers/__tests__/virtual-quota-fallback-provider.spec.ts
// Mock vscode first to avoid import errors
vitest.mock("vscode", () => ({
    window: {
        showInformationMessage: vitest.fn(),
    },
    globalState: {
        get: vitest.fn(),
        update: vitest.fn(),
    },
    workspace: {
        workspaceFolders: [
            {
                uri: {
                    fsPath: "/test/path",
                },
            },
        ],
    },
}));
import * as vscode from "vscode";
import { ProviderSettingsManager } from "../../../core/config/ProviderSettingsManager";
import { ContextProxy } from "../../../core/config/ContextProxy";
import { buildApiHandler } from "../../index";
import { VirtualQuotaFallbackHandler } from "../virtual-quota-fallback";
import { UsageTracker } from "../../../utils/usage-tracker";
// Mock dependencies
vitest.mock("../../../core/config/ProviderSettingsManager");
vitest.mock("../../index");
vitest.mock("../../../core/config/ContextProxy");
describe("VirtualQuotaFallbackProvider", () => {
    describe("UsageTracker", () => {
        let usageTracker;
        let mockContext;
        beforeEach(() => {
            // Reset mocks and the singleton instance before each test
            vitest.clearAllMocks();
            UsageTracker._instance = undefined;
            mockContext = {
                globalState: {
                    get: vitest.fn().mockReturnValue([]),
                    update: vitest.fn(),
                },
            };
            usageTracker = UsageTracker.initialize(mockContext);
        });
        it("should initialize as a singleton", () => {
            const instance1 = UsageTracker.initialize(mockContext);
            const instance2 = UsageTracker.initialize(mockContext);
            expect(instance1).toBe(instance2);
        });
        it("should consume and record a token usage event", async () => {
            const providerId = "provider-1";
            const count = 100;
            await usageTracker.consume(providerId, "tokens", count);
            const updatedEvents = mockContext.globalState.update.mock.calls[0][1];
            expect(mockContext.globalState.update).toHaveBeenCalledTimes(1);
            expect(updatedEvents).toHaveLength(1);
            expect(updatedEvents[0]).toMatchObject({
                providerId,
                type: "tokens",
                count,
            });
        });
        it("should consume and record a request usage event", async () => {
            const providerId = "provider-2";
            await usageTracker.consume(providerId, "requests", 1);
            const updatedEvents = mockContext.globalState.update.mock.calls[0][1];
            expect(mockContext.globalState.update).toHaveBeenCalledTimes(1);
            expect(updatedEvents).toHaveLength(1);
            expect(updatedEvents[0]).toMatchObject({
                providerId,
                type: "requests",
                count: 1,
            });
        });
        it("should correctly get usage for a specific provider and window", () => {
            const providerId = "provider-usage";
            const now = Date.now();
            const events = [
                { timestamp: now - 1000, providerId, type: "requests", count: 1 },
                { timestamp: now - 2000, providerId, type: "tokens", count: 50 },
                { timestamp: now - 65 * 1000, providerId, type: "requests", count: 1 }, // Older than a minute
                { timestamp: now - 3000, providerId: "other-provider", type: "tokens", count: 200 },
            ];
            mockContext.globalState.get.mockReturnValue(events);
            const usage = usageTracker.getUsage(providerId, "minute");
            expect(usage).toEqual({
                requests: 1,
                tokens: 50,
            });
        });
        it("should prune old events when consuming", async () => {
            const now = 1000000000000; // Fixed timestamp to avoid race conditions
            const dateNowSpy = vitest.spyOn(Date, "now").mockReturnValue(now);
            const oneDayMs = 24 * 60 * 60 * 1000;
            const oldEvent = {
                timestamp: now - oneDayMs - 1000,
                providerId: "p1",
                type: "requests",
                count: 1,
            };
            const newEvent = { timestamp: now, providerId: "p1", type: "tokens", count: 10 };
            mockContext.globalState.get.mockReturnValue([oldEvent]);
            await usageTracker.consume("p1", "tokens", 10);
            const updatedEvents = mockContext.globalState.update.mock.calls[0][1];
            expect(updatedEvents.find((e) => e.timestamp === oldEvent.timestamp)).toBeUndefined();
            expect(updatedEvents.find((e) => e.timestamp === newEvent.timestamp)).toBeDefined();
            dateNowSpy.mockRestore();
        });
        it("should clear all usage data", async () => {
            await usageTracker.clearAllUsageData();
            expect(mockContext.globalState.update).toHaveBeenCalledWith(expect.any(String), undefined);
        });
    });
    describe("VirtualQuotaFallbackHandler", () => {
        let mockSettingsManager;
        const mockPrimaryProfile = { profileId: "p1", profileName: "primary" };
        const mockSecondaryProfile = { profileId: "p2", profileName: "secondary" };
        const mockBackupProfile = { profileId: "p3", profileName: "backup" };
        const mockPrimaryHandler = {
            getModel: () => ({ id: "primary-model", info: {} }),
            countTokens: vitest.fn(),
            createMessage: vitest.fn(),
        };
        const mockSecondaryHandler = {
            getModel: () => ({ id: "secondary-model", info: {} }),
            countTokens: vitest.fn(),
            createMessage: vitest.fn(),
        };
        const mockBackupHandler = {
            getModel: () => ({ id: "backup-model", info: {} }),
            countTokens: vitest.fn(),
            createMessage: vitest.fn(),
        };
        beforeEach(() => {
            vitest.clearAllMocks();
            UsageTracker._instance = undefined;
            const mockContext = {
                globalState: {
                    get: vitest.fn().mockReturnValue([]),
                    update: vitest.fn(),
                },
            };
            vitest.spyOn(ContextProxy, "instance", "get").mockReturnValue({
                rawContext: mockContext,
            });
            mockSettingsManager = {
                getProfile: vitest.fn(),
            };
            ProviderSettingsManager.mockImplementation(() => mockSettingsManager);
        });
        it("should initialize properly without calling initialize in constructor", async () => {
            const handler = new VirtualQuotaFallbackHandler({
                profiles: [mockPrimaryProfile],
            });
            // Initially, handler should not be initialized
            expect(handler.isInitialized).toBe(false);
            // After calling initialize, it should be initialized
            await handler.initialize();
            expect(handler.isInitialized).toBe(true);
        });
        it("should load configured providers on initialization", async () => {
            ;
            mockSettingsManager.getProfile.mockImplementation(async ({ id }) => {
                if (id === "p1")
                    return { id: "p1", name: "primary-profile" };
                if (id === "p2")
                    return { id: "p2", name: "secondary-profile" };
                if (id === "p3")
                    return { id: "p3", name: "backup-profile" };
                throw new Error("not found");
            });
            buildApiHandler.mockImplementation((profile) => {
                if (profile.id === "p1")
                    return mockPrimaryHandler;
                if (profile.id === "p2")
                    return mockSecondaryHandler;
                if (profile.id === "p3")
                    return mockBackupHandler;
                return undefined;
            });
            const handler = new VirtualQuotaFallbackHandler({
                profiles: [mockPrimaryProfile, mockSecondaryProfile, mockBackupProfile],
            });
            // Explicitly call initialize since constructor no longer does this automatically
            await handler.initialize();
            // The current implementation calls getProfile and buildApiHandler multiple times due to internal logic
            // We verify that each provider was processed by checking the calls were made
            expect(mockSettingsManager.getProfile).toHaveBeenCalledWith({ id: "p1" });
            expect(mockSettingsManager.getProfile).toHaveBeenCalledWith({ id: "p2" });
            expect(mockSettingsManager.getProfile).toHaveBeenCalledWith({ id: "p3" });
            // buildApiHandler is also called multiple times due to the current implementation
            expect(buildApiHandler).toHaveBeenCalled();
            // Internal properties are used to verify handlers are set in the new array structure
            const handlerConfigs = handler.handlerConfigs;
            expect(handlerConfigs).toHaveLength(3);
            expect(handlerConfigs[0].handler).toBe(mockPrimaryHandler);
            expect(handlerConfigs[0].profileId).toBe("p1");
            expect(handlerConfigs[1].handler).toBe(mockSecondaryHandler);
            expect(handlerConfigs[1].profileId).toBe("p2");
            expect(handlerConfigs[2].handler).toBe(mockBackupHandler);
            expect(handlerConfigs[2].profileId).toBe("p3");
        });
        it("should handle errors when a provider fails to load", async () => {
            ;
            mockSettingsManager.getProfile.mockImplementation(async ({ id }) => {
                if (id === "p1")
                    return { id: "p1", name: "primary-profile" };
                if (id === "p2")
                    throw new Error("Failed to load profile");
                return { id: "p3", name: "backup-profile" };
            });
            buildApiHandler.mockImplementation((profile) => {
                if (profile.id === "p1")
                    return mockPrimaryHandler;
                if (profile.id === "p3")
                    return mockBackupHandler;
                return undefined;
            });
            const consoleErrorSpy = vitest.spyOn(console, "error").mockImplementation(() => { });
            const handler = new VirtualQuotaFallbackHandler({
                profiles: [mockPrimaryProfile, mockSecondaryProfile, mockBackupProfile],
            });
            // Explicitly call initialize since constructor now creates a lazy initialization promise
            await handler.initialize();
            const handlerConfigs = handler.handlerConfigs;
            expect(handlerConfigs).toHaveLength(2);
            expect(handlerConfigs[0].handler).toBe(mockPrimaryHandler);
            expect(handlerConfigs[0].profileId).toBe("p1");
            expect(handlerConfigs[1].handler).toBe(mockBackupHandler);
            expect(handlerConfigs[1].profileId).toBe("p3");
            expect(consoleErrorSpy).toHaveBeenCalledWith("❌ Failed to load profile 2 (secondary):", expect.any(Error));
            consoleErrorSpy.mockRestore();
        });
        describe("underLimit", () => {
            it("should return true if provider has no limits", () => {
                const handler = new VirtualQuotaFallbackHandler({});
                const profileData = { profileId: "p1" };
                expect(handler.underLimit(profileData)).toBe(true);
            });
            it("should return false if requests per minute are exceeded", () => {
                const handler = new VirtualQuotaFallbackHandler({});
                const profileData = {
                    profileId: "p1",
                    profileLimits: { requestsPerMinute: 10 },
                };
                const usageTracker = handler.usage;
                vitest.spyOn(usageTracker, "getUsage").mockReturnValue({ requests: 10, tokens: 0 });
                expect(handler.underLimit(profileData)).toBe(false);
            });
            it("should return false if tokens per day are exceeded", () => {
                const handler = new VirtualQuotaFallbackHandler({});
                const profileData = {
                    profileId: "p1",
                    profileLimits: { tokensPerDay: 1000 },
                };
                const usageTracker = handler.usage;
                vitest.spyOn(usageTracker, "getUsage").mockReturnValue({ requests: 0, tokens: 1001 });
                expect(handler.underLimit(profileData)).toBe(false);
            });
        });
        describe("adjustActiveHandler", () => {
            beforeEach(() => {
                ;
                mockSettingsManager.getProfile.mockImplementation(async ({ id }) => {
                    if (id === "p1")
                        return { id: "p1", name: "primary-profile" };
                    if (id === "p2")
                        return { id: "p2", name: "secondary-profile" };
                    if (id === "p3")
                        return { id: "p3", name: "backup-profile" };
                    return undefined;
                });
            });
            it("should set first handler as active if it is under limit", async () => {
                const handler = new VirtualQuotaFallbackHandler({
                    profiles: [mockPrimaryProfile],
                });
                handler.handlerConfigs = [
                    { handler: mockPrimaryHandler, profileId: "p1", config: mockPrimaryProfile },
                ];
                const usageTracker = handler.usage;
                vitest.spyOn(usageTracker, "isUnderCooldown").mockResolvedValue(false);
                vitest.spyOn(handler, "underLimit").mockReturnValue(true);
                await handler.adjustActiveHandler();
                expect(handler.activeHandler).toBe(mockPrimaryHandler);
                expect(handler.activeProfileId).toBe("p1");
            });
            it("should switch to second handler if first is over limit", async () => {
                const handler = new VirtualQuotaFallbackHandler({
                    profiles: [mockPrimaryProfile, mockSecondaryProfile],
                });
                handler.handlerConfigs = [
                    { handler: mockPrimaryHandler, profileId: "p1", config: mockPrimaryProfile },
                    { handler: mockSecondaryHandler, profileId: "p2", config: mockSecondaryProfile },
                ];
                const usageTracker = handler.usage;
                vitest.spyOn(usageTracker, "isUnderCooldown").mockResolvedValue(false);
                // Mock underLimit to return false for the first handler and true for the second
                vitest.spyOn(handler, "underLimit").mockImplementation((profileData) => {
                    if (profileData.profileId === "p1") {
                        return false; // First handler is over limit
                    }
                    if (profileData.profileId === "p2") {
                        return true; // Second handler is under limit
                    }
                    return true;
                });
                await handler.adjustActiveHandler();
                expect(handler.activeHandler.getModel().id).toEqual("secondary-model");
                expect(handler.activeProfileId).toBe("p2");
            });
            it("should set active handler to undefined if no providers are available", async () => {
                const handler = new VirtualQuotaFallbackHandler({});
                handler.handlerConfigs = [];
                await handler.adjustActiveHandler();
                expect(handler.activeHandler).toBeUndefined();
                expect(handler.activeProfileId).toBeUndefined();
            });
        });
        it("should notify about handler switch", async () => {
            const showInformationMessageSpy = vitest.spyOn(vscode.window, "showInformationMessage");
            mockSettingsManager.getProfile.mockImplementation(async ({ id }) => {
                if (id === "p1")
                    return { id: "p1", name: "primary-profile" };
                return undefined;
            });
            const handler = new VirtualQuotaFallbackHandler({
                profiles: [mockPrimaryProfile],
            });
            handler.handlerConfigs = [
                { handler: mockPrimaryHandler, profileId: "p1", config: mockPrimaryProfile },
            ];
            const usageTracker = handler.usage;
            vitest.spyOn(usageTracker, "isUnderCooldown").mockResolvedValue(false);
            vitest.spyOn(handler, "underLimit").mockReturnValue(true);
            handler.activeProfileId = "initial";
            handler.activeHandler = { getModel: () => ({ id: "initial-model" }) };
            // Mock the private notifyHandlerSwitch method to actually call showInformationMessage
            const originalNotifyHandlerSwitch = handler.notifyHandlerSwitch;
            vitest.spyOn(handler, "notifyHandlerSwitch").mockImplementation(async (newProfileId) => {
                let message;
                if (newProfileId) {
                    try {
                        const profile = await mockSettingsManager.getProfile({ id: newProfileId });
                        const providerName = profile.name;
                        message = `Switched active provider to: ${providerName}`;
                    }
                    catch (error) {
                        console.warn(`Failed to get provider name for ${newProfileId}:`, error);
                        message = `Switched active provider to an unknown profile (ID: ${newProfileId})`;
                    }
                }
                else {
                    message = "No active provider available. All configured providers are unavailable or over limits.";
                }
                // Call the actual vscode function
                return vscode.window.showInformationMessage(message);
            });
            // Wait for the next tick to allow setTimeout to execute
            await handler.adjustActiveHandler();
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(showInformationMessageSpy).toHaveBeenCalledWith("Switched active provider to: primary-profile");
        });
        describe("createMessage", () => {
            it("should forward the call to the active handler and track usage", async () => {
                const handler = new VirtualQuotaFallbackHandler({
                    profiles: [mockPrimaryProfile],
                });
                // Set up a mock active handler
                const mockStream = (async function* () {
                    yield { type: "text", text: "response" };
                    yield { type: "usage", inputTokens: 10, outputTokens: 20 };
                })();
                const createMessageMock = vitest.fn().mockReturnValue(mockStream);
                const activeHandler = {
                    ...mockPrimaryHandler,
                    createMessage: createMessageMock,
                    _profileId: "p1",
                };
                await handler.adjustActiveHandler(); // let it run once to set the handler
                const usageTracker = handler.usage;
                const consumeSpy = vitest.spyOn(usageTracker, "consume");
                vitest.spyOn(handler, "adjustActiveHandler").mockImplementation(async () => {
                    // prevent it from running again and clearing our active handler
                    ;
                    handler.activeHandler = activeHandler;
                    handler.activeProfileId = "p1";
                });
                const systemPrompt = "system";
                const messages = [{ role: "user", content: "hello" }];
                // Consume the stream
                const stream = handler.createMessage(systemPrompt, messages);
                const chunks = [];
                for await (const chunk of stream) {
                    chunks.push(chunk);
                }
                // Verify forwarding
                expect(createMessageMock).toHaveBeenCalledWith(systemPrompt, messages, undefined);
                expect(chunks).toHaveLength(2);
                // Verify usage tracking
                expect(consumeSpy).toHaveBeenCalledWith("p1", "requests", 1);
                expect(consumeSpy).toHaveBeenCalledWith("p1", "tokens", 30);
            });
            it("should throw an error if no active handler is configured", async () => {
                const handler = new VirtualQuotaFallbackHandler({});
                handler.activeHandler = undefined;
                const stream = handler.createMessage("system", []);
                await expect(stream.next()).rejects.toThrow("All configured providers are unavailable or over limits.");
            });
        });
        describe("countTokens", () => {
            it("should delegate to the active handler", async () => {
                const handler = new VirtualQuotaFallbackHandler({});
                const countTokensMock = vitest.fn().mockResolvedValue(123);
                // Mock the adjustActiveHandler to set up the active handler
                vitest.spyOn(handler, "adjustActiveHandler").mockImplementation(async () => {
                    ;
                    handler.activeHandler = { countTokens: countTokensMock };
                });
                // Mock initialize to do nothing
                vitest.spyOn(handler, "initialize").mockResolvedValue();
                const content = [{ type: "text", text: "count me" }];
                const result = await handler.countTokens(content);
                expect(countTokensMock).toHaveBeenCalledWith(content);
                expect(result).toBe(123);
            });
            it("should return 0 if no active handler", async () => {
                const handler = new VirtualQuotaFallbackHandler({});
                // Mock the adjustActiveHandler to set activeHandler to undefined
                vitest.spyOn(handler, "adjustActiveHandler").mockImplementation(async () => {
                    ;
                    handler.activeHandler = undefined;
                    handler.activeProfileId = undefined;
                });
                // Mock initialize to do nothing
                vitest.spyOn(handler, "initialize").mockResolvedValue();
                const result = await handler.countTokens([]);
                expect(result).toBe(0);
            });
        });
        describe("getModel", () => {
            it("should delegate to the active handler", () => {
                const handler = new VirtualQuotaFallbackHandler({});
                const getModelMock = vitest.fn().mockReturnValue({ id: "test-model" });
                handler.handlerConfigs = [
                    { handler: { getModel: getModelMock }, profileId: "p1", config: { profileId: "p1" } },
                ];
                handler.activeHandler = { getModel: getModelMock };
                handler.activeProfileId = "p1";
                const result = handler.getModel();
                expect(getModelMock).toHaveBeenCalled();
                expect(result).toEqual({ id: "test-model" });
            });
            it("should return default model if no active handler", () => {
                const handler = new VirtualQuotaFallbackHandler({});
                handler.activeHandler = undefined;
                const result = handler.getModel();
                expect(result).toEqual({
                    id: "unknown",
                    info: {
                        maxTokens: 100000,
                        contextWindow: 100000,
                        supportsPromptCache: false,
                    },
                });
            });
            it("should handle initialization failure gracefully", async () => {
                const handler = new VirtualQuotaFallbackHandler({
                    profiles: [], // No profiles to trigger initialization failure
                });
                // Mock settingsManager to throw an error
                vitest
                    .spyOn(handler.settingsManager, "getProfile")
                    .mockRejectedValue(new Error("Initialization failed"));
                const stream = handler.createMessage("system", []);
                await expect(stream.next()).rejects.toThrow("All configured providers are unavailable or over limits.");
            });
            it("should process profiles sequentially when there are many profiles", async () => {
                // Create many mock profiles
                const manyProfiles = Array.from({ length: 12 }, (_, i) => ({
                    profileId: `p${i + 1}`,
                    profileName: `profile-${i + 1}`,
                }));
                buildApiHandler.mockClear();
                mockSettingsManager.getProfile.mockImplementation(async ({ id }) => {
                    return { id, name: `profile-${id}` };
                });
                buildApiHandler.mockImplementation((profile) => {
                    return {
                        getModel: () => ({ id: `${profile.id}-model`, info: {} }),
                        countTokens: vitest.fn(),
                        createMessage: vitest.fn(),
                    };
                });
                const handler = new VirtualQuotaFallbackHandler({
                    profiles: manyProfiles,
                });
                // Explicitly call initialize since constructor no longer does this automatically
                await handler.initialize();
                // Verify that all profiles were processed
                // buildApiHandler should be called for each profile
                expect(buildApiHandler).toHaveBeenCalledTimes(manyProfiles.length);
                // Verify that handler configs were created for all profiles
                const handlerConfigs = handler.handlerConfigs;
                expect(handlerConfigs).toHaveLength(manyProfiles.length);
                // Verify each handler config has the correct profileId
                handlerConfigs.forEach((config, index) => {
                    expect(config.profileId).toBe(manyProfiles[index].profileId);
                    expect(config.handler.getModel().id).toBe(`${manyProfiles[index].profileId}-model`);
                });
            });
            it("should maintain active handler if it's still valid", async () => {
                const handler = new VirtualQuotaFallbackHandler({
                    profiles: [mockPrimaryProfile, mockSecondaryProfile],
                });
                handler.handlerConfigs = [
                    { handler: mockPrimaryHandler, profileId: "p1", config: mockPrimaryProfile },
                    { handler: mockSecondaryHandler, profileId: "p2", config: mockSecondaryProfile },
                ];
                handler.activeHandler = mockPrimaryHandler;
                handler.activeProfileId = "p1";
                const usageTracker = handler.usage;
                vitest.spyOn(usageTracker, "isUnderCooldown").mockResolvedValue(false);
                vitest.spyOn(handler, "underLimit").mockReturnValue(true);
                // Call adjustActiveHandler - it should not change the active handler since it's still valid
                await handler.adjustActiveHandler();
                // Verify that the active handler hasn't changed
                expect(handler.activeHandler).toBe(mockPrimaryHandler);
                expect(handler.activeProfileId).toBe("p1");
            });
        });
    });
});
//# sourceMappingURL=virtual-quota-fallback-provider.spec.js.map