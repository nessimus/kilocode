import { beforeEach, describe, expect, it, vi } from "vitest"

import { upsertSopTool } from "../upsertSopTool"
import { Task } from "../../task/Task"
import { getGlobalRooDirectory, getProjectRooDirectoryForCwd } from "../../../services/roo-config"
import { refreshWorkflowToggles } from "../../context/instructions/workflows"
import * as fs from "fs/promises"

vi.mock("fs/promises", () => ({
	mkdir: vi.fn(),
	writeFile: vi.fn(),
	access: vi.fn(),
}))

vi.mock("../../../services/roo-config", () => ({
	getGlobalRooDirectory: vi.fn(() => "/home/user/.kilocode"),
	getProjectRooDirectoryForCwd: vi.fn(() => "/workspace/.kilocode"),
}))

vi.mock("../../context/instructions/workflows", () => ({
	refreshWorkflowToggles: vi.fn().mockResolvedValue({}),
}))

describe("upsertSopTool", () => {
	let mockTask: any
	let mockAskApproval: any
	let mockHandleError: any
	let mockPushToolResult: any
	let mockRemoveClosingTag: any

	beforeEach(() => {
		vi.clearAllMocks()

		mockTask = {
			cwd: "/workspace",
			consecutiveMistakeCount: 0,
			recordToolError: vi.fn(),
			ask: vi.fn(),
			providerRef: {
				deref: vi.fn().mockReturnValue({
					context: {} as any,
					postStateToWebview: vi.fn().mockResolvedValue(undefined),
				}),
			},
		}

		mockAskApproval = vi.fn().mockResolvedValue(true)
		mockHandleError = vi.fn()
		mockPushToolResult = vi.fn()
		mockRemoveClosingTag = vi.fn((_, value) => value ?? "")
	})

	it("creates a new document SOP in the project scope", async () => {
		vi.mocked(fs.access).mockRejectedValueOnce(new Error("not-found"))

		const block = {
			type: "tool_use" as const,
			name: "upsert_sop" as const,
			params: {
				sop_name: "Release Checklist",
				content: "1. Ship",
			},
			partial: false,
		}

		await upsertSopTool(
			mockTask as Task,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockAskApproval).toHaveBeenCalled()
		expect(fs.mkdir).toHaveBeenCalledWith("/workspace/.kilocode/sops", { recursive: true })
		expect(fs.writeFile).toHaveBeenCalledWith("/workspace/.kilocode/sops/release-checklist.md", "1. Ship\n", "utf8")
		expect(mockPushToolResult).toHaveBeenCalled()
	})

	it("creates a workflow SOP and refreshes toggles", async () => {
		vi.mocked(fs.access).mockRejectedValueOnce(new Error("not-found"))

		const block = {
			type: "tool_use" as const,
			name: "upsert_sop" as const,
			params: {
				sop_name: "Deploy",
				sop_variant: "workflow",
				content: '{"nodes":[]}',
			},
			partial: false,
		}

		await upsertSopTool(
			mockTask as Task,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(fs.mkdir).toHaveBeenCalledWith("/workspace/.kilocode/workflows", { recursive: true })
		expect(fs.writeFile).toHaveBeenCalledWith(
			"/workspace/.kilocode/workflows/deploy.workflow.json",
			'{"nodes":[]}',
			"utf8",
		)
		expect(refreshWorkflowToggles).toHaveBeenCalled()
	})

	it("saves to the global scope when requested", async () => {
		vi.mocked(fs.access).mockRejectedValueOnce(new Error("not-found"))

		const block = {
			type: "tool_use" as const,
			name: "upsert_sop" as const,
			params: {
				sop_name: "Support Escalation",
				sop_scope: "global",
				content: "Steps",
			},
			partial: false,
		}

		await upsertSopTool(
			mockTask as Task,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(fs.mkdir).toHaveBeenCalledWith("/home/user/.kilocode/sops", { recursive: true })
		expect(fs.writeFile).toHaveBeenCalledWith("/home/user/.kilocode/sops/support-escalation.md", "Steps\n", "utf8")
	})
})
