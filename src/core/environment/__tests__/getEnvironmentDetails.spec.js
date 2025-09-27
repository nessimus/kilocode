// npx vitest core/environment/__tests__/getEnvironmentDetails.spec.ts
import pWaitFor from "p-wait-for";
import delay from "delay";
import { getEnvironmentDetails } from "../getEnvironmentDetails";
import { EXPERIMENT_IDS, experiments } from "../../../shared/experiments";
import { getFullModeDetails, isToolAllowedForMode } from "../../../shared/modes";
import { getApiMetrics } from "../../../shared/getApiMetrics";
import { listFiles } from "../../../services/glob/list-files";
import { TerminalRegistry } from "../../../integrations/terminal/TerminalRegistry";
import { Terminal } from "../../../integrations/terminal/Terminal";
import { arePathsEqual } from "../../../utils/path";
import { formatResponse } from "../../prompts/responses";
vi.mock("vscode", () => ({
    window: {
        tabGroups: { all: [], onDidChangeTabs: vi.fn() },
        visibleTextEditors: [],
    },
    env: {
        language: "en-US",
    },
}));
vi.mock("p-wait-for", () => ({
    default: vi.fn(),
}));
vi.mock("delay", () => ({
    default: vi.fn(),
}));
vi.mock("execa", () => ({
    execa: vi.fn(),
}));
vi.mock("../../../shared/experiments");
vi.mock("../../../shared/modes");
vi.mock("../../../shared/getApiMetrics");
vi.mock("../../../services/glob/list-files");
vi.mock("../../../integrations/terminal/TerminalRegistry");
vi.mock("../../../integrations/terminal/Terminal");
vi.mock("../../../utils/path");
vi.mock("../../prompts/responses");
describe("getEnvironmentDetails", () => {
    const mockCwd = "/test/path";
    const mockTaskId = "test-task-id";
    let mockCline;
    let mockProvider;
    let mockState;
    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            terminalOutputLineLimit: 100,
            maxWorkspaceFiles: 50,
            maxOpenTabsContext: 10,
            mode: "code",
            customModes: [],
            experiments: {},
            customInstructions: "test instructions",
            language: "en",
            showRooIgnoredFiles: false,
        };
        mockProvider = {
            getState: vi.fn().mockResolvedValue(mockState),
        };
        mockCline = {
            cwd: mockCwd,
            taskId: mockTaskId,
            didEditFile: false,
            fileContextTracker: {
                getAndClearRecentlyModifiedFiles: vi.fn().mockReturnValue([]),
            },
            rooIgnoreController: {
                filterPaths: vi.fn((paths) => paths.join("\n")),
                cwd: mockCwd,
                ignoreInstance: {},
                disposables: [],
                rooIgnoreContent: "",
                isPathIgnored: vi.fn(),
                getIgnoreContent: vi.fn(),
                updateIgnoreContent: vi.fn(),
                addToIgnore: vi.fn(),
                removeFromIgnore: vi.fn(),
                dispose: vi.fn(),
            },
            clineMessages: [],
            api: {
                getModel: vi.fn().mockReturnValue({ id: "test-model", info: { contextWindow: 100000 } }),
                createMessage: vi.fn(),
                countTokens: vi.fn(),
            },
            diffEnabled: true,
            providerRef: {
                deref: vi.fn().mockReturnValue(mockProvider),
                [Symbol.toStringTag]: "WeakRef",
            },
        };
        getApiMetrics.mockReturnValue({ contextTokens: 50000, totalCost: 0.25 });
        getFullModeDetails.mockResolvedValue({
            name: "💻 Code",
            roleDefinition: "You are a code assistant",
            customInstructions: "Custom instructions",
        });
        isToolAllowedForMode.mockReturnValue(true);
        listFiles.mockResolvedValue([["file1.ts", "file2.ts"], false]);
        formatResponse.formatFilesList.mockReturnValue("file1.ts\nfile2.ts");
        arePathsEqual.mockReturnValue(false);
        Terminal.compressTerminalOutput.mockImplementation((output) => output);
        TerminalRegistry.getTerminals.mockReturnValue([]);
        TerminalRegistry.getBackgroundTerminals.mockReturnValue([]);
        TerminalRegistry.isProcessHot.mockReturnValue(false);
        TerminalRegistry.getUnretrievedOutput.mockReturnValue("");
        vi.mocked(pWaitFor).mockResolvedValue(undefined);
        vi.mocked(delay).mockResolvedValue(undefined);
    });
    it("should return basic environment details", async () => {
        const result = await getEnvironmentDetails(mockCline);
        expect(result).toContain("<environment_details>");
        expect(result).toContain("</environment_details>");
        expect(result).toContain("# VSCode Visible Files");
        expect(result).toContain("# VSCode Open Tabs");
        expect(result).toContain("# Current Time");
        expect(result).toContain("# Current Cost");
        expect(result).toContain("# Current Mode");
        expect(result).toContain("<model>test-model</model>");
        expect(mockProvider.getState).toHaveBeenCalled();
        expect(getFullModeDetails).toHaveBeenCalledWith("code", [], undefined, {
            cwd: mockCwd,
            globalCustomInstructions: "test instructions",
            language: "en",
        });
        expect(getApiMetrics).toHaveBeenCalledWith(mockCline.clineMessages);
    });
    it("should include file details when includeFileDetails is true", async () => {
        const result = await getEnvironmentDetails(mockCline, true);
        expect(result).toContain("# Current Workspace Directory");
        expect(result).toContain("Files");
        expect(listFiles).toHaveBeenCalledWith(mockCwd, true, 50);
        expect(formatResponse.formatFilesList).toHaveBeenCalledWith(mockCwd, ["file1.ts", "file2.ts"], false, mockCline.rooIgnoreController, false);
    });
    it("should not include file details when includeFileDetails is false", async () => {
        await getEnvironmentDetails(mockCline, false);
        expect(listFiles).not.toHaveBeenCalled();
        expect(formatResponse.formatFilesList).not.toHaveBeenCalled();
    });
    it("should handle desktop directory specially", async () => {
        ;
        arePathsEqual.mockReturnValue(true);
        const result = await getEnvironmentDetails(mockCline, true);
        expect(result).toContain("Desktop files not shown automatically");
        expect(listFiles).not.toHaveBeenCalled();
    });
    it("should skip file listing when maxWorkspaceFiles is 0", async () => {
        mockProvider.getState.mockResolvedValue({
            ...mockState,
            maxWorkspaceFiles: 0,
        });
        const result = await getEnvironmentDetails(mockCline, true);
        expect(listFiles).not.toHaveBeenCalled();
        expect(result).toContain("Workspace files context disabled");
        expect(formatResponse.formatFilesList).not.toHaveBeenCalled();
    });
    it("should include recently modified files if any", async () => {
        ;
        mockCline.fileContextTracker.getAndClearRecentlyModifiedFiles.mockReturnValue([
            "modified1.ts",
            "modified2.ts",
        ]);
        const result = await getEnvironmentDetails(mockCline);
        expect(result).toContain("# Recently Modified Files");
        expect(result).toContain("modified1.ts");
        expect(result).toContain("modified2.ts");
    });
    it("should include active terminal information", async () => {
        const mockActiveTerminal = {
            id: "terminal-1",
            getLastCommand: vi.fn().mockReturnValue("npm test"),
            getProcessesWithOutput: vi.fn().mockReturnValue([]),
            getCurrentWorkingDirectory: vi.fn().mockReturnValue("/test/path/src"),
        };
        TerminalRegistry.getTerminals.mockReturnValue([mockActiveTerminal]);
        TerminalRegistry.getUnretrievedOutput.mockReturnValue("Test output");
        const result = await getEnvironmentDetails(mockCline);
        expect(result).toContain("# Actively Running Terminals");
        expect(result).toContain("## Terminal terminal-1 (Active)");
        expect(result).toContain("### Working Directory: `/test/path/src`");
        expect(result).toContain("### Original command: `npm test`");
        expect(result).toContain("Test output");
        mockCline.didEditFile = true;
        await getEnvironmentDetails(mockCline);
        expect(vi.mocked(delay)).toHaveBeenCalledWith(300);
        expect(vi.mocked(pWaitFor)).toHaveBeenCalled();
    });
    it("should include inactive terminals with output", async () => {
        const mockProcess = {
            command: "npm build",
            getUnretrievedOutput: vi.fn().mockReturnValue("Build output"),
        };
        const mockInactiveTerminal = {
            id: "terminal-2",
            getLastCommand: vi.fn().mockReturnValue("npm build"),
            getProcessesWithOutput: vi.fn().mockReturnValue([mockProcess]),
            cleanCompletedProcessQueue: vi.fn(),
            getCurrentWorkingDirectory: vi.fn().mockReturnValue("/test/path/build"),
        };
        TerminalRegistry.getTerminals.mockImplementation((active) => active ? [] : [mockInactiveTerminal]);
        const result = await getEnvironmentDetails(mockCline);
        expect(result).toContain("# Inactive Terminals with Completed Process Output");
        expect(result).toContain("## Terminal terminal-2 (Inactive)");
        expect(result).toContain("### Working Directory: `/test/path/build`");
        expect(result).toContain("Command: `npm build`");
        expect(result).toContain("Build output");
        expect(mockInactiveTerminal.cleanCompletedProcessQueue).toHaveBeenCalled();
    });
    it("should include working directory for terminals", async () => {
        const mockActiveTerminal = {
            id: "terminal-1",
            getLastCommand: vi.fn().mockReturnValue("cd /some/path && npm start"),
            getProcessesWithOutput: vi.fn().mockReturnValue([]),
            getCurrentWorkingDirectory: vi.fn().mockReturnValue("/some/path"),
        };
        const mockProcess = {
            command: "npm test",
            getUnretrievedOutput: vi.fn().mockReturnValue("Test completed"),
        };
        const mockInactiveTerminal = {
            id: "terminal-2",
            getLastCommand: vi.fn().mockReturnValue("npm test"),
            getProcessesWithOutput: vi.fn().mockReturnValue([mockProcess]),
            cleanCompletedProcessQueue: vi.fn(),
            getCurrentWorkingDirectory: vi.fn().mockReturnValue("/another/path"),
        };
        TerminalRegistry.getTerminals.mockImplementation((active) => active ? [mockActiveTerminal] : [mockInactiveTerminal]);
        TerminalRegistry.getUnretrievedOutput.mockReturnValue("Server started");
        const result = await getEnvironmentDetails(mockCline);
        // Check active terminal working directory
        expect(result).toContain("## Terminal terminal-1 (Active)");
        expect(result).toContain("### Working Directory: `/some/path`");
        expect(result).toContain("### Original command: `cd /some/path && npm start`");
        // Check inactive terminal working directory
        expect(result).toContain("## Terminal terminal-2 (Inactive)");
        expect(result).toContain("### Working Directory: `/another/path`");
        // Verify the methods were called
        expect(mockActiveTerminal.getCurrentWorkingDirectory).toHaveBeenCalled();
        expect(mockInactiveTerminal.getCurrentWorkingDirectory).toHaveBeenCalled();
    });
    it("should include experiment-specific details when Power Steering is enabled", async () => {
        mockState.experiments = { [EXPERIMENT_IDS.POWER_STEERING]: true };
        experiments.isEnabled.mockReturnValue(true);
        const result = await getEnvironmentDetails(mockCline);
        expect(result).toContain("<role>You are a code assistant</role>");
        expect(result).toContain("<custom_instructions>Custom instructions</custom_instructions>");
    });
    it("should handle missing provider or state", async () => {
        // Mock provider to return null.
        mockCline.providerRef.deref = vi.fn().mockReturnValue(null);
        const result = await getEnvironmentDetails(mockCline);
        // Verify the function still returns a result.
        expect(result).toContain("<environment_details>");
        expect(result).toContain("</environment_details>");
        // Mock provider to return null state.
        mockCline.providerRef.deref = vi.fn().mockReturnValue({
            getState: vi.fn().mockResolvedValue(null),
        });
        const result2 = await getEnvironmentDetails(mockCline);
        // Verify the function still returns a result.
        expect(result2).toContain("<environment_details>");
        expect(result2).toContain("</environment_details>");
    });
    it("should handle errors gracefully", async () => {
        vi.mocked(pWaitFor).mockRejectedValue(new Error("Test error"));
        const mockErrorTerminal = {
            id: "terminal-1",
            getLastCommand: vi.fn().mockReturnValue("npm test"),
            getProcessesWithOutput: vi.fn().mockReturnValue([]),
            getCurrentWorkingDirectory: vi.fn().mockReturnValue("/test/path"),
        };
        TerminalRegistry.getTerminals.mockReturnValue([mockErrorTerminal]);
        TerminalRegistry.getBackgroundTerminals.mockReturnValue([]);
        mockCline.fileContextTracker.getAndClearRecentlyModifiedFiles.mockReturnValue([]);
        await expect(getEnvironmentDetails(mockCline)).resolves.not.toThrow();
    });
    it("should include REMINDERS section when todoListEnabled is true", async () => {
        mockProvider.getState.mockResolvedValue({
            ...mockState,
            apiConfiguration: { todoListEnabled: true },
        });
        const cline = { ...mockCline, todoList: [{ content: "test", status: "pending" }] };
        const result = await getEnvironmentDetails(cline);
        expect(result).toContain("REMINDERS");
    });
    it("should NOT include REMINDERS section when todoListEnabled is false", async () => {
        mockProvider.getState.mockResolvedValue({
            ...mockState,
            apiConfiguration: { todoListEnabled: false },
        });
        const cline = { ...mockCline, todoList: [{ content: "test", status: "pending" }] };
        const result = await getEnvironmentDetails(cline);
        expect(result).not.toContain("REMINDERS");
    });
    it("should include REMINDERS section when todoListEnabled is undefined", async () => {
        mockProvider.getState.mockResolvedValue({
            ...mockState,
            apiConfiguration: {},
        });
        const cline = { ...mockCline, todoList: [{ content: "test", status: "pending" }] };
        const result = await getEnvironmentDetails(cline);
        expect(result).toContain("REMINDERS");
    });
});
//# sourceMappingURL=getEnvironmentDetails.spec.js.map