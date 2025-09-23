import fs from "fs/promises"
import path from "path"
import { Mode } from "../../../shared/modes"
import { fileExistsAtPath } from "../../../utils/fs"

export type PromptVariables = {
	workspace?: string
	mode?: string
	language?: string
	shell?: string
	operatingSystem?: string
	// Golden Workplace persona variables (optional)
	personaName?: string
	personaRole?: string
	personaPersonality?: string
	personaDescription?: string
	companyName?: string
	companyId?: string
	personaModeName?: string
	personaModeSummary?: string
	employeeId?: string
	teamIds?: string
	departmentIds?: string
}

export function interpolatePromptContent(content: string, variables: PromptVariables): string {
	if (!content) return content

	// Computed convenience tokens
	const personaName = variables.personaName || ""
	const personaRole = variables.personaRole || ""
	const personaNameRole = personaRole ? `${personaName}, ${personaRole}` : personaName

	let interpolatedContent = content

	// Support the common JS-like conditional macro seen in UI text
	// {{ personaRole ? ', ' + personaRole : '' }}
	const conditionalRolePattern =
		/\{\{\s*personaRole\s*\?\s*['"]\s*,\s*['"]\s*\+\s*personaRole\s*:\s*['"]\s*['"]\s*\}\}/g
	interpolatedContent = interpolatedContent.replace(conditionalRolePattern, personaRole ? `, ${personaRole}` : "")

	// Support combined token if user writes {{personaName}}{{ personaRole ? ', ' + personaRole : '' }}
	const namePlusConditional = /\{\{\s*personaName\s*\}\}\s*\{\{\s*personaRole\s*\?[^}]*\}\}/g
	interpolatedContent = interpolatedContent.replace(namePlusConditional, personaNameRole)

	// Provide {{personaNameRole}} directly too
	interpolatedContent = interpolatedContent.replace(/\{\{\s*personaNameRole\s*\}\}/g, personaNameRole)

	// Basic {{key}} replacements
	for (const key in variables) {
		if (
			Object.prototype.hasOwnProperty.call(variables, key) &&
			variables[key as keyof PromptVariables] !== undefined
		) {
			const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "g")
			interpolatedContent = interpolatedContent.replace(
				placeholder,
				String(variables[key as keyof PromptVariables]!),
			)
		}
	}
	return interpolatedContent
}

/**
 * Safely reads a file, returning an empty string if the file doesn't exist
 */
async function safeReadFile(filePath: string): Promise<string> {
	try {
		const content = await fs.readFile(filePath, "utf-8")
		// When reading with "utf-8" encoding, content should be a string
		return content.trim()
	} catch (err) {
		const errorCode = (err as NodeJS.ErrnoException).code
		if (!errorCode || !["ENOENT", "EISDIR"].includes(errorCode)) {
			throw err
		}
		return ""
	}
}

/**
 * Get the path to a system prompt file for a specific mode
 */
export function getSystemPromptFilePath(cwd: string, mode: Mode): string {
	// kilocode_change
	return path.join(cwd, ".kilocode", `system-prompt-${mode}`)
}

/**
 * Loads custom system prompt from a file at .kilocode/system-prompt-[mode slug]
 * If the file doesn't exist, returns an empty string
 */
export async function loadSystemPromptFile(cwd: string, mode: Mode, variables: PromptVariables): Promise<string> {
	const filePath = getSystemPromptFilePath(cwd, mode)
	const rawContent = await safeReadFile(filePath)
	if (!rawContent) {
		return ""
	}
	const interpolatedContent = interpolatePromptContent(rawContent, variables)
	return interpolatedContent
}

/**
 * Ensures the .kilocode directory exists, creating it if necessary
 */
export async function ensureRooDirectory(cwd: string): Promise<void> {
	// kilocode_change
	const rooDir = path.join(cwd, ".kilocode")

	// Check if directory already exists
	if (await fileExistsAtPath(rooDir)) {
		return
	}

	// Create the directory
	try {
		await fs.mkdir(rooDir, { recursive: true })
	} catch (err) {
		// If directory already exists (race condition), ignore the error
		const errorCode = (err as NodeJS.ErrnoException).code
		if (errorCode !== "EEXIST") {
			throw err
		}
	}
}
