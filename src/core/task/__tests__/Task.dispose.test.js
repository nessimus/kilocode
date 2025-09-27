import { Task } from "../Task";
// Mock dependencies
vi.mock("../../webview/ClineProvider");
vi.mock("../../../integrations/terminal/TerminalRegistry", () => ({
    TerminalRegistry: {
        releaseTerminalsForTask: vi.fn(),
    },
}));
vi.mock("../../ignore/RooIgnoreController");
vi.mock("../../protect/RooProtectedController");
vi.mock("../../context-tracking/FileContextTracker");
vi.mock("../../../services/browser/UrlContentFetcher");
vi.mock("../../../services/browser/BrowserSession");
vi.mock("../../../integrations/editor/DiffViewProvider");
vi.mock("../../tools/ToolRepetitionDetector");
vi.mock("../../../api", () => ({
    buildApiHandler: vi.fn(() => ({
        getModel: () => ({ info: {}, id: "test-model" }),
    })),
}));
vi.mock("./AutoApprovalHandler");
// Mock TelemetryService
vi.mock("@roo-code/telemetry", () => ({
    TelemetryService: {
        instance: {
            captureTaskCreated: vi.fn(),
            captureTaskRestarted: vi.fn(),
        },
    },
}));
describe("Task dispose method", () => {
    let mockProvider;
    let mockApiConfiguration;
    let task;
    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();
        // kilocode_change start: mock context
        const mockContext = {
            globalStorageUri: { fsPath: "/test/path" },
            subscriptions: [],
            workspaceState: {
                get: vi.fn(),
                update: vi.fn(),
            },
            globalState: {
                get: vi.fn(),
                update: vi.fn(),
            },
            extensionUri: { fsPath: "/test/extension" },
            extensionPath: "/test/extension",
            asAbsolutePath: vi.fn((path) => `/test/extension/${path}`),
            storagePath: "/test/storage",
            globalStoragePath: "/test/global-storage",
            logPath: "/test/logs",
        };
        // kilocode_change_end
        // Mock provider
        mockProvider = {
            context: mockContext, // kilocode_change
            getState: vi.fn().mockResolvedValue({ mode: "code" }),
            log: vi.fn(),
        };
        // Mock API configuration
        mockApiConfiguration = {
            apiProvider: "anthropic",
            apiKey: "test-key",
        };
        // Create task instance without starting it
        task = new Task({
            context: mockContext, // kilocode_change
            provider: mockProvider,
            apiConfiguration: mockApiConfiguration,
            startTask: false,
        });
    });
    afterEach(() => {
        // Clean up
        if (task && !task.abort) {
            task.dispose();
        }
    });
    test("should remove all event listeners when dispose is called", () => {
        // Add some event listeners using type assertion to bypass strict typing for testing
        const listener1 = vi.fn(() => { });
        const listener2 = vi.fn(() => { });
        const listener3 = vi.fn((taskId) => { });
        task.on("TaskStarted", listener1);
        task.on("TaskAborted", listener2);
        task.on("TaskIdle", listener3);
        // Verify listeners are added
        expect(task.listenerCount("TaskStarted")).toBe(1);
        expect(task.listenerCount("TaskAborted")).toBe(1);
        expect(task.listenerCount("TaskIdle")).toBe(1);
        // Spy on removeAllListeners method
        const removeAllListenersSpy = vi.spyOn(task, "removeAllListeners");
        // Call dispose
        task.dispose();
        // Verify removeAllListeners was called
        expect(removeAllListenersSpy).toHaveBeenCalledOnce();
        // Verify all listeners are removed
        expect(task.listenerCount("TaskStarted")).toBe(0);
        expect(task.listenerCount("TaskAborted")).toBe(0);
        expect(task.listenerCount("TaskIdle")).toBe(0);
    });
    test("should handle errors when removing event listeners", () => {
        // Mock removeAllListeners to throw an error
        const originalRemoveAllListeners = task.removeAllListeners;
        task.removeAllListeners = vi.fn(() => {
            throw new Error("Test error");
        });
        // Spy on console.error
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
        // Call dispose - should not throw
        expect(() => task.dispose()).not.toThrow();
        // Verify error was logged
        expect(consoleErrorSpy).toHaveBeenCalledWith("Error removing event listeners:", expect.any(Error));
        // Restore
        task.removeAllListeners = originalRemoveAllListeners;
        consoleErrorSpy.mockRestore();
    });
    test("should clean up all resources in correct order", () => {
        const removeAllListenersSpy = vi.spyOn(task, "removeAllListeners");
        const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => { });
        // Call dispose
        task.dispose();
        // Verify dispose was called and logged
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`[Task#dispose] disposing task ${task.taskId}.${task.instanceId}`));
        // Verify removeAllListeners was called first (before other cleanup)
        expect(removeAllListenersSpy).toHaveBeenCalledOnce();
        // Clean up
        consoleLogSpy.mockRestore();
    });
    test("should prevent memory leaks by removing listeners before other cleanup", () => {
        // Add multiple listeners of different types using type assertion for testing
        const listeners = {
            TaskStarted: vi.fn(() => { }),
            TaskAborted: vi.fn(() => { }),
            TaskIdle: vi.fn((taskId) => { }),
            TaskActive: vi.fn((taskId) => { }),
            TaskAskResponded: vi.fn(() => { }),
            Message: vi.fn((data) => { }),
            TaskTokenUsageUpdated: vi.fn((taskId, tokenUsage) => { }),
            TaskToolFailed: vi.fn((taskId, tool, error) => { }),
            TaskUnpaused: vi.fn(() => { }),
        };
        // Add all listeners using type assertion to bypass strict typing for testing
        const taskAny = task;
        taskAny.on("TaskStarted", listeners.TaskStarted);
        taskAny.on("TaskAborted", listeners.TaskAborted);
        taskAny.on("TaskIdle", listeners.TaskIdle);
        taskAny.on("TaskActive", listeners.TaskActive);
        taskAny.on("TaskAskResponded", listeners.TaskAskResponded);
        taskAny.on("Message", listeners.Message);
        taskAny.on("TaskTokenUsageUpdated", listeners.TaskTokenUsageUpdated);
        taskAny.on("TaskToolFailed", listeners.TaskToolFailed);
        taskAny.on("TaskUnpaused", listeners.TaskUnpaused);
        // Verify all listeners are added
        expect(task.listenerCount("TaskStarted")).toBe(1);
        expect(task.listenerCount("TaskAborted")).toBe(1);
        expect(task.listenerCount("TaskIdle")).toBe(1);
        expect(task.listenerCount("TaskActive")).toBe(1);
        expect(task.listenerCount("TaskAskResponded")).toBe(1);
        expect(task.listenerCount("Message")).toBe(1);
        expect(task.listenerCount("TaskTokenUsageUpdated")).toBe(1);
        expect(task.listenerCount("TaskToolFailed")).toBe(1);
        expect(task.listenerCount("TaskUnpaused")).toBe(1);
        // Call dispose
        task.dispose();
        // Verify all listeners are removed
        expect(task.listenerCount("TaskStarted")).toBe(0);
        expect(task.listenerCount("TaskAborted")).toBe(0);
        expect(task.listenerCount("TaskIdle")).toBe(0);
        expect(task.listenerCount("TaskActive")).toBe(0);
        expect(task.listenerCount("TaskAskResponded")).toBe(0);
        expect(task.listenerCount("Message")).toBe(0);
        expect(task.listenerCount("TaskTokenUsageUpdated")).toBe(0);
        expect(task.listenerCount("TaskToolFailed")).toBe(0);
        expect(task.listenerCount("TaskUnpaused")).toBe(0);
        // Verify total listener count is 0
        expect(task.eventNames().length).toBe(0);
    });
});
//# sourceMappingURL=Task.dispose.test.js.map