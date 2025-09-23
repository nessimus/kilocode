import path from "path"

import { ClineRulesToggles } from "../../shared/cline-rules"

export type WorkflowSopSource = "local" | "global"

export interface WorkflowSopEntry {
	source: WorkflowSopSource
	fullPath: string
	fileName: string
	slugs: string[]
}

function buildSlugVariants(fileName: string): string[] {
	const variants = new Set<string>()
	let current = fileName
	while (current.length) {
		variants.add(current)
		const lastDotIndex = current.lastIndexOf(".")
		if (lastDotIndex === -1) {
			break
		}
		current = current.slice(0, lastDotIndex)
	}
	return Array.from(variants).map((variant) => variant.toLowerCase())
}

export function collectEnabledWorkflowSops(
	localWorkflowToggles: ClineRulesToggles = {},
	globalWorkflowToggles: ClineRulesToggles = {},
): WorkflowSopEntry[] {
	const entries: WorkflowSopEntry[] = []

	for (const [fullPath, enabled] of Object.entries(localWorkflowToggles)) {
		if (!enabled) {
			continue
		}
		const fileName = path.basename(fullPath)
		entries.push({
			source: "local",
			fullPath,
			fileName,
			slugs: buildSlugVariants(fileName),
		})
	}

	for (const [fullPath, enabled] of Object.entries(globalWorkflowToggles)) {
		if (!enabled) {
			continue
		}
		const fileName = path.basename(fullPath)
		entries.push({
			source: "global",
			fullPath,
			fileName,
			slugs: buildSlugVariants(fileName),
		})
	}

	return entries
}

export function findWorkflowSop(entries: WorkflowSopEntry[], name: string | undefined): WorkflowSopEntry | undefined {
	if (!name) {
		return undefined
	}
	const normalized = name.trim().toLowerCase()
	if (!normalized.length) {
		return undefined
	}
	return entries.find((entry) => entry.slugs.includes(normalized))
}

export function formatWorkflowSourceLabel(source: WorkflowSopSource): "project workflow" | "global workflow" {
	return source === "local" ? "project workflow" : "global workflow"
}

export function getPrimaryWorkflowSlug(entry: WorkflowSopEntry): string {
	// Prefer the shortest slug for user-friendly commands (e.g. "deploy" over "deploy.workflow.json")
	return entry.slugs.slice().sort((a, b) => a.length - b.length)[0] ?? entry.fileName.toLowerCase()
}
