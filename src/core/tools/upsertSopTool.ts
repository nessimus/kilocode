import path from "path"
import os from "os"
import * as fs from "fs/promises"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"
import { getGlobalRooDirectory, getProjectRooDirectoryForCwd } from "../../services/roo-config"
import { GlobalFileNames } from "../../shared/globalFileNames"
import { refreshWorkflowToggles } from "../context/instructions/workflows"

function toOptionalString(value: unknown): string | undefined {
	if (value === undefined || value === null) {
		return undefined
	}
	if (typeof value === "string") {
		const trimmed = value.trim()
		return trimmed.length ? trimmed : undefined
	}
	if (typeof value === "number" || typeof value === "boolean") {
		const stringified = String(value).trim()
		return stringified.length ? stringified : undefined
	}
	return undefined
}

function normalizeVariant(value: unknown): "document" | "workflow" {
	const normalized = toOptionalString(value)?.toLowerCase()
	if (!normalized || normalized === "document") {
		return "document"
	}
	if (["workflow", "flow", "runbook"].includes(normalized)) {
		return "workflow"
	}
	throw new Error(`Unsupported sop_variant: ${value}`)
}

function normalizeScope(value: unknown): "project" | "global" {
	const normalized = toOptionalString(value)?.toLowerCase()
	if (!normalized || normalized === "project" || normalized === "local") {
		return "project"
	}
	if (normalized === "global") {
		return "global"
	}
	throw new Error(`Unsupported sop_scope: ${value}`)
}

function sanitizeSopName(raw: string): { displayName: string; slug: string } {
	const displayName = raw.trim()
	if (!displayName) {
		throw new Error("sop_name is required")
	}

	const slug = displayName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
	const normalizedSlug = slug || "sop"
	return { displayName, slug: normalizedSlug }
}

async function ensureDirectory(dirPath: string) {
	await fs.mkdir(dirPath, { recursive: true })
}

export async function upsertSopTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const rawName = block.params.sop_name ?? block.params.name
	const rawContent = block.params.content
	const looseParams = block.params as Record<string, string | undefined>
	const rawVariant = block.params.sop_variant ?? looseParams.variant
	const rawScope = block.params.sop_scope ?? looseParams.scope
	const rawDescription = block.params.description

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				tool: "upsertSop",
				sop_name: removeClosingTag("sop_name", rawName),
				sop_variant: removeClosingTag("sop_variant", rawVariant),
				sop_scope: removeClosingTag("sop_scope", rawScope),
				description: removeClosingTag("description", rawDescription),
			})
			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		}

		const name = toOptionalString(rawName)
		if (!name) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("upsert_sop")
			pushToolResult(formatResponse.toolError("sop_name is required"))
			return
		}

		const content = toOptionalString(rawContent)
		if (!content) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("upsert_sop")
			pushToolResult(formatResponse.toolError("content is required"))
			return
		}

		let variant: "document" | "workflow"
		let scope: "project" | "global"
		try {
			variant = normalizeVariant(rawVariant)
			scope = normalizeScope(rawScope)
		} catch (error) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("upsert_sop")
			pushToolResult(formatResponse.toolError(error instanceof Error ? error.message : String(error)))
			return
		}

		const { displayName, slug } = sanitizeSopName(name)
		const provider = cline.providerRef.deref()
		if (!provider) {
			pushToolResult(formatResponse.toolError("Provider reference lost"))
			return
		}

		const baseDir = scope === "global" ? getGlobalRooDirectory() : getProjectRooDirectoryForCwd(cline.cwd)
		const description = toOptionalString(rawDescription)

		let targetDir: string
		let fileName: string
		if (variant === "document") {
			targetDir = path.join(baseDir, "sops")
			fileName = `${slug}.md`
		} else {
			targetDir =
				scope === "global"
					? path.join(os.homedir(), GlobalFileNames.workflows)
					: path.join(cline.cwd, GlobalFileNames.workflows)
			fileName = `${slug}.workflow.json`
		}

		if (!targetDir) {
			pushToolResult(formatResponse.toolError("Unable to resolve SOP target directory"))
			return
		}

		await ensureDirectory(targetDir)
		const filePath = path.join(targetDir, fileName)
		let wasUpdate = false
		try {
			await fs.access(filePath)
			wasUpdate = true
		} catch (error) {
			wasUpdate = false
		}

		let fileContent = content
		if (variant === "document" && description) {
			fileContent = `---\ndescription: ${description}\n---\n\n${content.trim()}\n`
		}

		if (variant === "document" && !description) {
			fileContent = `${content.trim()}\n`
		}

		const approvalPayload = {
			tool: "upsertSop",
			sop_name: displayName,
			sop_slug: slug,
			sop_variant: variant,
			sop_scope: scope,
			target_path: filePath,
			is_update: wasUpdate,
			preview: variant === "workflow" ? undefined : fileContent.slice(0, 4000),
		}

		const didApprove = await askApproval("tool", JSON.stringify(approvalPayload))
		if (!didApprove) {
			return
		}

		await fs.writeFile(filePath, fileContent, "utf8")

		if (variant === "workflow") {
			await refreshWorkflowToggles(provider.context, cline.cwd)
		} else {
			await provider.postStateToWebview().catch(() => {})
		}

		cline.consecutiveMistakeCount = 0

		const scopeLabel = scope === "global" ? "global" : "project"
		const variantLabel = variant === "document" ? "document" : "workflow"
		const relativePath = path.relative(cline.cwd, filePath)
		const summary = wasUpdate
			? `Updated ${variantLabel} SOP '${displayName}' (${scopeLabel}) at ${relativePath}`
			: `Created ${variantLabel} SOP '${displayName}' (${scopeLabel}) at ${relativePath}`

		pushToolResult(formatResponse.toolResult(summary))
	} catch (error) {
		await handleError("upserting SOP", error as Error)
	}
}
