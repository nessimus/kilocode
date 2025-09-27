import { describe, expect, it } from "vitest"

import {
	buildAgentToolTemplates,
	buildAvailableTools,
	buildIdeaNodeTemplates,
} from "../nodeTemplates"

describe("nodeTemplates", () => {
	it("includes new idea templates", () => {
		const ideaTemplates = buildIdeaNodeTemplates()
		const ids = ideaTemplates.map((template) => template.id)
		expect(ids).toEqual([
			"idea",
			"question",
			"task",
			"signal",
			"note-sheet",
			"file-note",
		])
	})

	it("builds available tools with defaults", () => {
		const tools = buildAvailableTools("code", {
			customModes: [],
			browserToolEnabled: true,
			mcpEnabled: true,
			apiConfiguration: { todoListEnabled: true },
			experiments: { imageGeneration: true, runSlashCommand: true },
			codebaseIndexConfig: { codebaseIndexEnabled: true, codebaseIndexQdrantUrl: "https://example.com" },
		})
		expect(tools).toContain("run_slash_command")
		expect(tools).toContain("generate_image")
		expect(tools).toContain("ask_followup_question")
	})

	it("creates agent tool templates with metadata", () => {
		const templates = buildAgentToolTemplates(
			["run_slash_command", "ask_followup_question"],
			(key, options) => {
				const defaultValue = options?.defaultValue
				return typeof defaultValue === "string" ? defaultValue : key
			},
		)
		const ids = templates.map((template) => template.id)
		expect(ids).toEqual([
			"agent-tool-run_slash_command",
			"agent-tool-ask_followup_question",
		])
		const runTemplate = templates[0]
		expect(runTemplate.meta?.toolId).toBe("run_slash_command")
		expect(runTemplate.createData().inputs).toHaveLength(1)
	})
})
