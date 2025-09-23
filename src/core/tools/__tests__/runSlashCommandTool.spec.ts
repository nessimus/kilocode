import { describe, it, expect, vi, beforeEach } from "vitest"
import { runSlashCommandTool } from "../runSlashCommandTool"
import { Task } from "../../task/Task"
import { formatResponse } from "../../prompts/responses"
import { getCommand, getCommandNames } from "../../../services/command/commands"
import { refreshWorkflowToggles } from "../../context/instructions/workflows"
import { readFile } from "fs/promises"

// Mock dependencies
vi.mock("../../../services/command/commands", () => ({
	getCommand: vi.fn(),
	getCommandNames: vi.fn(),
}))

vi.mock("../../context/instructions/workflows", () => ({
	refreshWorkflowToggles: vi.fn(),
}))

vi.mock("fs/promises", () => ({
	readFile: vi.fn(),
}))

describe("runSlashCommandTool", () => {
	let mockTask: any
	let mockAskApproval: any
	let mockHandleError: any
	let mockPushToolResult: any
	let mockRemoveClosingTag: any

	beforeEach(() => {
		vi.clearAllMocks()

		mockTask = {
			consecutiveMistakeCount: 0,
			recordToolError: vi.fn(),
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing parameter error"),
			ask: vi.fn(),
			cwd: "/test/project",
			providerRef: {
				deref: vi.fn().mockReturnValue({
					getState: vi.fn().mockResolvedValue({
						experiments: {
							runSlashCommand: true,
						},
					}),
				}),
			},
		}

		mockAskApproval = vi.fn().mockResolvedValue(true)
		mockHandleError = vi.fn()
		mockPushToolResult = vi.fn()
		mockRemoveClosingTag = vi.fn((tag, text) => text || "")
	})

	it("should handle missing command parameter", async () => {
		const block = {
			type: "tool_use" as const,
			name: "run_slash_command" as const,
			params: {},
			partial: false,
		}

		await runSlashCommandTool(
			mockTask as Task,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockTask.consecutiveMistakeCount).toBe(1)
		expect(mockTask.recordToolError).toHaveBeenCalledWith("run_slash_command")
		expect(mockTask.sayAndCreateMissingParamError).toHaveBeenCalledWith("run_slash_command", "command")
		expect(mockPushToolResult).toHaveBeenCalledWith("Missing parameter error")
	})

	it("should handle command not found", async () => {
		const block = {
			type: "tool_use" as const,
			name: "run_slash_command" as const,
			params: {
				command: "nonexistent",
			},
			partial: false,
		}

		vi.mocked(getCommand).mockResolvedValue(undefined)
		vi.mocked(getCommandNames).mockResolvedValue(["init", "test", "deploy"])

		await runSlashCommandTool(
			mockTask as Task,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockTask.recordToolError).toHaveBeenCalledWith("run_slash_command")
		expect(mockPushToolResult).toHaveBeenCalledWith(
			formatResponse.toolError(
				"Standard Operating Procedure 'nonexistent' not found. Document SOPs: init, test, deploy. Workflow SOPs: (none).",
			),
		)
	})

	it("should handle user rejection", async () => {
		const block = {
			type: "tool_use" as const,
			name: "run_slash_command" as const,
			params: {
				command: "init",
			},
			partial: false,
		}

		const mockCommand = {
			name: "init",
			content: "Initialize project",
			source: "built-in" as const,
			filePath: "<built-in:init>",
			description: "Initialize the project",
		}

		vi.mocked(getCommand).mockResolvedValue(mockCommand)
		mockAskApproval.mockResolvedValue(false)

		await runSlashCommandTool(
			mockTask as Task,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockAskApproval).toHaveBeenCalled()
		const askArgs = mockAskApproval.mock.calls[0]
		expect(askArgs[0]).toBe("tool")
		expect(() => JSON.parse(askArgs[1])).not.toThrow()
		const parsed = JSON.parse(askArgs[1])
		expect(parsed).toMatchObject({
			tool: "runSlashCommand",
			command: "init",
			sop: "init",
			sop_variant: "document",
			source: "built-in",
			description: "Initialize the project",
		})
		expect(mockPushToolResult).not.toHaveBeenCalled()
	})

	it("should successfully execute built-in command", async () => {
		const block = {
			type: "tool_use" as const,
			name: "run_slash_command" as const,
			params: {
				command: "init",
			},
			partial: false,
		}

		const mockCommand = {
			name: "init",
			content: "Initialize project content here",
			source: "built-in" as const,
			filePath: "<built-in:init>",
			description: "Analyze codebase and create AGENTS.md",
		}

		vi.mocked(getCommand).mockResolvedValue(mockCommand)

		await runSlashCommandTool(
			mockTask as Task,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockAskApproval).toHaveBeenCalled()
		const askCall = mockAskApproval.mock.calls[0]
		expect(askCall[0]).toBe("tool")
		const askPayload = JSON.parse(askCall[1])
		expect(askPayload).toMatchObject({
			tool: "runSlashCommand",
			command: "init",
			sop_variant: "document",
			source: "built-in",
			description: "Analyze codebase and create AGENTS.md",
			filePath: "<built-in:init>",
		})

		expect(mockPushToolResult).toHaveBeenCalledWith(
			`Standard Operating Procedure: init
Type: Loose document guidance
Source: built-in
Summary: Analyze codebase and create AGENTS.md

--- Document Guidance ---

Initialize project content here

Use this document as a reference and narrate how each step applies to the current task.`,
		)
	})

	it("should successfully execute command with arguments", async () => {
		const block = {
			type: "tool_use" as const,
			name: "run_slash_command" as const,
			params: {
				command: "test",
				args: "focus on unit tests",
			},
			partial: false,
		}

		const mockCommand = {
			name: "test",
			content: "Run tests with specific focus",
			source: "project" as const,
			filePath: ".roo/commands/test.md",
			description: "Run project tests",
			argumentHint: "test type or focus area",
		}

		vi.mocked(getCommand).mockResolvedValue(mockCommand)

		await runSlashCommandTool(
			mockTask as Task,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockAskApproval).toHaveBeenCalled()
		const approvalArgs = mockAskApproval.mock.calls[0]
		const approvalJson = JSON.parse(approvalArgs[1])
		expect(approvalJson).toMatchObject({
			command: "test",
			sop_variant: "document",
			args: "focus on unit tests",
			argumentHint: "test type or focus area",
		})

		expect(mockPushToolResult).toHaveBeenCalledWith(
			`Standard Operating Procedure: test
Type: Loose document guidance
Source: project
Summary: Run project tests
Usage hint: test type or focus area
Context provided: focus on unit tests

--- Document Guidance ---

Run tests with specific focus

Use this document as a reference and narrate how each step applies to the current task.`,
		)
	})

	it("should handle global command", async () => {
		const block = {
			type: "tool_use" as const,
			name: "run_slash_command" as const,
			params: {
				command: "deploy",
			},
			partial: false,
		}

		const mockCommand = {
			name: "deploy",
			content: "Deploy application to production",
			source: "global" as const,
			filePath: "~/.roo/commands/deploy.md",
		}

		vi.mocked(getCommand).mockResolvedValue(mockCommand)

		await runSlashCommandTool(
			mockTask as Task,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockPushToolResult).toHaveBeenCalledWith(
			`Standard Operating Procedure: deploy
Type: Loose document guidance
Source: global

--- Document Guidance ---

Deploy application to production

Use this document as a reference and narrate how each step applies to the current task.`,
		)
	})

	it("should resolve workflow SOP when document is missing", async () => {
		const block = {
			type: "tool_use" as const,
			name: "run_slash_command" as const,
			params: {
				command: "publish",
				args: "release v1.0",
			},
			partial: false,
		}

		vi.mocked(getCommand).mockResolvedValue(undefined)
		vi.mocked(getCommandNames).mockResolvedValue([])
		const workflowPath = "/tmp/.kilocode/workflows/publish.workflow.json"
		vi.mocked(refreshWorkflowToggles).mockResolvedValue({
			localWorkflowToggles: { [workflowPath]: true },
			globalWorkflowToggles: {},
		})
		vi.mocked(readFile).mockResolvedValue("node1 -> node2")
		mockTask.providerRef.deref.mockReturnValue({
			getState: vi.fn().mockResolvedValue({
				experiments: {
					runSlashCommand: true,
				},
			}),
			context: {} as any,
		})

		await runSlashCommandTool(
			mockTask as Task,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockPushToolResult).toHaveBeenCalledWith(
			`Standard Operating Procedure: publish.workflow.json
Type: Strict workflow SOP
Source: project workflow
Context provided: release v1.0

--- Workflow Definition ---

node1 -> node2

Follow this workflow sequentially, honoring each node's inputs and outputs before advancing.`,
		)
	})

	it("should handle partial block", async () => {
		const block = {
			type: "tool_use" as const,
			name: "run_slash_command" as const,
			params: {
				command: "init",
			},
			partial: true,
		}

		await runSlashCommandTool(
			mockTask as Task,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockTask.ask).toHaveBeenCalled()
		const partialArgs = mockTask.ask.mock.calls[0]
		expect(partialArgs[0]).toBe("tool")
		const partialPayload = JSON.parse(partialArgs[1])
		expect(partialPayload).toMatchObject({
			tool: "runSlashCommand",
			command: "init",
			sop: "init",
			args: "",
		})
		expect(partialArgs[2]).toBe(true)

		expect(mockPushToolResult).not.toHaveBeenCalled()
	})

	it("should handle errors during execution", async () => {
		const block = {
			type: "tool_use" as const,
			name: "run_slash_command" as const,
			params: {
				command: "init",
			},
			partial: false,
		}

		const error = new Error("Test error")
		vi.mocked(getCommand).mockRejectedValue(error)

		await runSlashCommandTool(
			mockTask as Task,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockHandleError).toHaveBeenCalledWith("running slash command", error)
	})

	it("should handle empty available commands list", async () => {
		const block = {
			type: "tool_use" as const,
			name: "run_slash_command" as const,
			params: {
				command: "nonexistent",
			},
			partial: false,
		}

		vi.mocked(getCommand).mockResolvedValue(undefined)
		vi.mocked(getCommandNames).mockResolvedValue([])

		await runSlashCommandTool(
			mockTask as Task,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockPushToolResult).toHaveBeenCalledWith(
			formatResponse.toolError("Command 'nonexistent' not found. Available commands: (none)"),
		)
	})

	it("should reset consecutive mistake count on valid command", async () => {
		const block = {
			type: "tool_use" as const,
			name: "run_slash_command" as const,
			params: {
				command: "init",
			},
			partial: false,
		}

		mockTask.consecutiveMistakeCount = 5

		const mockCommand = {
			name: "init",
			content: "Initialize project",
			source: "built-in" as const,
			filePath: "<built-in:init>",
		}

		vi.mocked(getCommand).mockResolvedValue(mockCommand)

		await runSlashCommandTool(
			mockTask as Task,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockTask.consecutiveMistakeCount).toBe(0)
	})
})
