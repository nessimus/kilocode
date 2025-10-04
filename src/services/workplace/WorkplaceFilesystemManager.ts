import * as path from "node:path"
import * as os from "node:os"

import * as vscode from "vscode"

import { Package } from "../../shared/package"
import { cloneWorkplaceState, WorkplaceCompany, WorkplaceState } from "../../shared/golden/workplace"
import {
	FileCabinetFileKind,
	FileCabinetFileSummary,
	FileCabinetPreview,
	FileCabinetSnapshot,
	FileCabinetFolderSummary,
	FileCabinetWriteRequest,
	FileCabinetCreateFolderRequest,
	FileCabinetCreateFileRequest,
} from "../../shared/fileCabinet"
import type { WorkplaceStateObserver } from "./WorkplaceService"

const ROOT_STATE_KEY = "goldenWorkplace.rootUri"
const COMPANY_FOLDER_STATE_KEY = "goldenWorkplace.companyFolders"
export const FOCUS_SIDEBAR_FLAG_KEY = "goldenWorkplace.focusSidebarOnActivate"

type OpenCompanyWindowMode = "prompt" | "currentWindow" | "newWindow"
type WindowChoiceAction = "current" | "new" | "rememberCurrent" | "rememberNew"

interface WindowChoiceQuickPickItem extends vscode.QuickPickItem {
	action?: WindowChoiceAction
}

const MAX_SCAN_ENTRIES = 1000
const MAX_PREVIEW_BYTES = 256 * 1024
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024
const BINARY_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".svg",
	".mp4",
	".mov",
	".mp3",
	".wav",
	".pdf",
	".zip",
	".gz",
	".tar",
	".ppt",
	".pptx",
	".doc",
	".docx",
	".xls",
	".xlsx",
])

const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]) as Set<string>
const TEXT_EXTENSIONS = new Set([
	".txt",
	".json",
	".ts",
	".tsx",
	".js",
	".jsx",
	".py",
	".rb",
	".go",
	".rs",
	".java",
	".c",
	".cpp",
	".sql",
	".yml",
	".yaml",
	".csv",
	".log",
]) as Set<string>

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]) as Set<string>
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".avi"]) as Set<string>
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".flac"]) as Set<string>

const shouldLogWorkplaceFilesystemDebug =
	process?.env?.WORKPLACE_FILESYSTEM_DEBUG === "true" || process?.env?.WORKPLACE_FILESYSTEM_DEBUG === "1"

const workplaceFsInfo = (...args: unknown[]) => {
	if (!shouldLogWorkplaceFilesystemDebug) {
		return
	}
	console.info(...args)
}

const workplaceFsWarn = (...args: unknown[]) => {
	if (!shouldLogWorkplaceFilesystemDebug) {
		return
	}
	console.warn(...args)
}
const SPREADSHEET_EXTENSIONS = new Set([".xls", ".xlsx", ".csv"]) as Set<string>
const PRESENTATION_EXTENSIONS = new Set([".ppt", ".pptx", ".key"]) as Set<string>
const DOC_EXTENSIONS = new Set([".doc", ".docx", ".pdf"])
const ARCHIVE_EXTENSIONS = new Set([".zip", ".tar", ".gz", ".tgz", ".rar"])

const IGNORED_DIRECTORY_NAMES = new Set([".git", "node_modules", ".DS_Store", "__pycache__"])

const posixJoin = (...segments: string[]): string => segments.filter(Boolean).join("/").replace(/\\/g, "/")

export class WorkplaceFilesystemManager implements WorkplaceStateObserver {
	private rootUri: vscode.Uri | undefined
	private readonly folderMap: Record<string, string> = {}
	private previousActiveCompanyId: string | undefined
	private lastState: WorkplaceState = { companies: [] }
	private promptInFlight = false
	private initialized = false
	private readonly configListeners = new Set<() => void | Promise<void>>()

	constructor(private readonly context: vscode.ExtensionContext) {}

	public async initialize(initialState: WorkplaceState): Promise<void> {
		this.lastState = cloneWorkplaceState(initialState)
		this.previousActiveCompanyId = initialState.activeCompanyId

		const storedRoot = this.context.globalState.get<string>(ROOT_STATE_KEY)
		if (storedRoot) {
			try {
				this.rootUri = vscode.Uri.parse(storedRoot)
			} catch (error) {
				console.error("[WorkplaceFilesystem] Failed to parse stored root URI", error)
			}
		}

		const storedMap = this.context.globalState.get<Record<string, string>>(COMPANY_FOLDER_STATE_KEY)
		if (storedMap) {
			for (const [companyId, folder] of Object.entries(storedMap)) {
				if (typeof companyId === "string" && typeof folder === "string") {
					this.folderMap[companyId] = folder
				}
			}
		}

		if (this.rootUri) {
			await this.ensureRootDirectory()
			await this.syncCompanyFolders(initialState)
		}

		this.initialized = true
	}

	public isConfigured(): boolean {
		return Boolean(this.rootUri)
	}

	public getRootUri(): vscode.Uri | undefined {
		return this.rootUri
	}

	public async chooseRootFolder(options?: { ownerName?: string }): Promise<void> {
		const childFolderName = options?.ownerName ? this.buildRootFolderName(options.ownerName) : undefined
		const selected = await this.promptForRootFolder(
			childFolderName
				? {
						title: "Choose Golden Workplace parent folder",
						message: `Select where to create “${childFolderName}”. You can change this later.`,
					}
				: undefined,
		)
		if (!selected) {
			return
		}

		let target = selected
		if (childFolderName) {
			target = vscode.Uri.joinPath(selected, childFolderName)
			try {
				await vscode.workspace.fs.createDirectory(target)
			} catch (error) {
				console.error("[WorkplaceFilesystem] Failed to create root folder", error)
			}
		}

		this.rootUri = target
		await this.saveRootUri(target)
		await this.ensureRootDirectory()
		await this.syncCompanyFolders(this.lastState)
		const currentActive = this.lastState.activeCompanyId
		this.previousActiveCompanyId = currentActive
		await this.handleActiveCompanyChange(currentActive, currentActive)
		await this.notifyConfigurationListeners()
	}

	public async onStatePersisted(state: WorkplaceState): Promise<void> {
		this.lastState = cloneWorkplaceState(state)

		if (!this.initialized) {
			await this.initialize(state)
			return
		}

		if (!this.rootUri) {
			await this.handleMissingRoot(state)
			if (!this.rootUri) {
				this.previousActiveCompanyId = state.activeCompanyId
				return
			}
		}

		await this.syncCompanyFolders(state)

		const nextActiveCompanyId = state.activeCompanyId
		if (nextActiveCompanyId !== this.previousActiveCompanyId) {
			const previous = this.previousActiveCompanyId
			this.previousActiveCompanyId = nextActiveCompanyId
			await this.handleActiveCompanyChange(nextActiveCompanyId, previous)
		} else {
			const targetUri = nextActiveCompanyId ? this.getCompanyFolderUri(nextActiveCompanyId) : this.rootUri
			if (targetUri && !this.isCurrentWorkspace(targetUri)) {
				await this.handleActiveCompanyChange(nextActiveCompanyId, this.previousActiveCompanyId)
			}
		}
	}

	private async handleMissingRoot(state: WorkplaceState): Promise<void> {
		if (this.promptInFlight || state.companies.length === 0) {
			return
		}

		this.promptInFlight = true
		try {
			const selected = await this.promptForRootFolder({
				title: "Choose Golden Workplace folder",
				message:
					"Select a folder where Golden Workplace will store company workspaces. You can change this later.",
			})
			if (!selected) {
				return
			}

			this.rootUri = selected
			await this.saveRootUri(selected)
			await this.ensureRootDirectory()
			await this.syncCompanyFolders(state)
			await this.notifyConfigurationListeners()
		} finally {
			this.promptInFlight = false
		}
	}

	public addConfigurationListener(listener: () => void | Promise<void>): vscode.Disposable {
		this.configListeners.add(listener)
		return new vscode.Disposable(() => {
			this.configListeners.delete(listener)
		})
	}

	private async notifyConfigurationListeners(): Promise<void> {
		if (this.configListeners.size === 0) {
			return
		}

		const calls = Array.from(this.configListeners).map(async (listener) => {
			try {
				await listener()
			} catch (error) {
				console.error("[WorkplaceFilesystem] configuration listener failed", error)
			}
		})

		await Promise.allSettled(calls)
	}

	public getCompanyFolderNames(): Record<string, string> {
		return { ...this.folderMap }
	}

	public getCompanyWorkspacePaths(): Record<string, string> {
		const result: Record<string, string> = {}
		for (const companyId of Object.keys(this.folderMap)) {
			const uri = this.getCompanyFolderUri(companyId)
			if (uri) {
				result[companyId] = uri.fsPath
			}
		}
		return result
	}

	public async getFileCabinetSnapshot(companyId: string): Promise<FileCabinetSnapshot | undefined> {
		const companyUri = this.getCompanyFolderUri(companyId)
		if (!companyUri) {
			return undefined
		}

		const files: FileCabinetFileSummary[] = []
		const folderPaths = new Set<string>()
		const counter = { count: 0 }

		await this.scanCompanyDirectory(companyId, companyUri, "", files, folderPaths, counter)

		const folders = this.buildFolderSummaries(folderPaths, files)

		return {
			companyId,
			rootUri: companyUri.toString(),
			generatedAt: new Date().toISOString(),
			folders,
			files,
		}
	}

	public async getFileCabinetPreview(companyId: string, targetPath: string): Promise<FileCabinetPreview | undefined> {
		const companyUri = this.getCompanyFolderUri(companyId)
		if (!companyUri) {
			return undefined
		}
		const relative = this.sanitizeRelativePath(targetPath)
		if (relative === undefined) {
			return {
				companyId,
				path: targetPath,
				kind: "other",
				byteSize: 0,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				error: "Invalid path",
			}
		}

		const fileUri = vscode.Uri.joinPath(companyUri, relative)
		let stat: vscode.FileStat
		try {
			stat = await vscode.workspace.fs.stat(fileUri)
		} catch (error) {
			console.error(
				`[WorkplaceFilesystem] Failed to stat preview target ${fileUri.toString()} for company ${companyId}`,
				error,
			)
			return {
				companyId,
				path: `/${relative}`,
				kind: "other",
				byteSize: 0,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				error: "Unable to read file metadata",
			}
		}

		const extension = path.extname(relative) ?? ""
		const kind = this.detectFileKind(extension)
		const preview: FileCabinetPreview = {
			companyId,
			path: `/${relative}`,
			kind,
			byteSize: stat.size,
			createdAt: new Date(stat.ctime).toISOString(),
			modifiedAt: new Date(stat.mtime).toISOString(),
			contentType: this.guessContentType(extension),
		}

		if (stat.size > MAX_PREVIEW_BYTES && kind !== "image") {
			preview.error = "File is too large to preview"
			return preview
		}

		try {
			const data = await vscode.workspace.fs.readFile(fileUri)
			const decoder = new TextDecoder("utf-8")
			const lowercaseExt = extension.toLowerCase()
			if (kind === "markdown") {
				preview.markdown = decoder.decode(data.slice(0, MAX_PREVIEW_BYTES))
				return preview
			}
			const isPlainText = kind === "text" || kind === "code" || lowercaseExt === ".csv"

			if (isPlainText) {
				preview.text = decoder.decode(data.slice(0, MAX_PREVIEW_BYTES))
				return preview
			}
			if (kind === "image" && stat.size <= MAX_IMAGE_BYTES) {
				preview.base64 = Buffer.from(data).toString("base64")
				return preview
			}
			if (kind === "pdf") {
				preview.error = "PDF preview not yet supported"
				return preview
			}
			preview.error = "Preview not available"
		} catch (error) {
			console.error(
				`[WorkplaceFilesystem] Failed to read preview data for ${fileUri.toString()} (${companyId})`,
				error,
			)
			preview.error = "Unable to load preview"
		}

		return preview
	}

	public async createCompanyFolder(request: FileCabinetCreateFolderRequest): Promise<void> {
		const companyUri = this.getCompanyFolderUri(request.companyId)
		if (!companyUri) {
			throw new Error("Workplace root is not configured")
		}
		const relative = this.sanitizeRelativePath(request.path)
		if (!relative) {
			throw new Error("Invalid path")
		}
		await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(companyUri, relative))
	}

	public async createCompanyFile(request: FileCabinetCreateFileRequest): Promise<{ path: string; fileName: string }> {
		const companyUri = this.getCompanyFolderUri(request.companyId)
		if (!companyUri) {
			throw new Error("Workplace root is not configured")
		}
		const directoryRelative =
			request.directory && request.directory.trim().length > 0 ? this.sanitizeRelativePath(request.directory) : ""
		if (directoryRelative === undefined) {
			throw new Error("Invalid directory")
		}
		const targetDirectory = directoryRelative ? vscode.Uri.joinPath(companyUri, directoryRelative) : companyUri
		await vscode.workspace.fs.createDirectory(targetDirectory)

		const preferredBase = (request.preferredBaseName ?? "Untitled").trim() || "Untitled"
		const sanitizedBase = preferredBase.replace(/[\\/:]/g, "-").trim() || "Untitled"
		const extensionInput = request.extension?.trim()
		const extension = extensionInput
			? extensionInput.startsWith(".")
				? extensionInput
				: `.${extensionInput}`
			: ".md"

		const encoding = request.encoding ?? "utf8"
		const contents = request.initialContents ?? ""
		const data = encoding === "base64" ? Buffer.from(contents, "base64") : Buffer.from(contents, "utf8")

		let attempt = 0
		let fileName = ""
		let candidateUri: vscode.Uri | undefined
		while (attempt < 200) {
			const suffix = attempt === 0 ? "" : ` ${attempt + 1}`
			fileName = `${sanitizedBase}${suffix}${extension}`
			candidateUri = vscode.Uri.joinPath(targetDirectory, fileName)
			try {
				await vscode.workspace.fs.stat(candidateUri)
				attempt += 1
				continue
			} catch (error) {
				if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") {
					break
				}
				throw error
			}
		}

		if (!candidateUri) {
			throw new Error("Unable to resolve target file")
		}

		if (attempt >= 200) {
			throw new Error("Too many untitled files exist in this folder")
		}

		await vscode.workspace.fs.writeFile(candidateUri, data)

		const relativePath = directoryRelative ? `${directoryRelative}/${fileName}` : fileName
		return { path: relativePath, fileName }
	}

	public async writeCompanyFile(request: FileCabinetWriteRequest): Promise<void> {
		const companyUri = this.getCompanyFolderUri(request.companyId)
		if (!companyUri) {
			throw new Error("Workplace root is not configured")
		}
		const relative = this.sanitizeRelativePath(request.path)
		if (relative === undefined) {
			throw new Error("Invalid path")
		}

		const targetUri = vscode.Uri.joinPath(companyUri, relative)
		const data =
			request.encoding === "base64"
				? Buffer.from(request.contents, "base64")
				: Buffer.from(request.contents, "utf8")

		const directoryRelative = path.posix.dirname(relative)
		if (directoryRelative && directoryRelative !== ".") {
			await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(companyUri, directoryRelative))
		}
		await vscode.workspace.fs.writeFile(targetUri, data)
	}

	public async openCompanyFolder(request: { companyId: string; path?: string }): Promise<void> {
		const companyUri = this.getCompanyFolderUri(request.companyId)
		if (!companyUri) {
			throw new Error("Workplace root is not configured")
		}
		const relative = request.path ? this.sanitizeRelativePath(request.path) : ""
		if (relative === undefined) {
			throw new Error("Invalid path")
		}
		const targetUri = relative ? vscode.Uri.joinPath(companyUri, relative) : companyUri
		await vscode.commands.executeCommand("revealFileInOS", targetUri)
	}

	private async promptForRootFolder(options?: { title?: string; message?: string }): Promise<vscode.Uri | undefined> {
		if (options?.message) {
			void vscode.window.showInformationMessage(options.message)
		}

		const defaultUri = this.rootUri ?? this.guessDefaultUri()
		const selection = await vscode.window.showOpenDialog({
			title: options?.title ?? "Select Golden Workplace folder",
			openLabel: "Use Folder",
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			defaultUri,
		})

		if (!selection || selection.length === 0) {
			return undefined
		}

		return selection[0]
	}

	private guessDefaultUri(): vscode.Uri | undefined {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
		return workspaceFolder?.uri
	}

	private sanitizeFolderSegment(value?: string): string {
		if (!value) {
			return ""
		}
		return value
			.replace(/[\\/:*?"<>|]/g, "")
			.replace(/\s+/g, " ")
			.trim()
	}

	private buildRootFolderName(ownerName?: string): string {
		const sanitizedOwner = this.sanitizeFolderSegment(ownerName)
		if (sanitizedOwner) {
			return `Golden Workplace - ${sanitizedOwner}`
		}
		return "Golden Workplace"
	}

	private async ensureRootDirectory(): Promise<void> {
		if (!this.rootUri) {
			return
		}

		try {
			await vscode.workspace.fs.createDirectory(this.rootUri)
		} catch (error) {
			console.error("[WorkplaceFilesystem] Failed to ensure root directory", error)
		}
	}

	private async directoryExists(uri: vscode.Uri): Promise<boolean> {
		try {
			const stat = await vscode.workspace.fs.stat(uri)
			return (stat.type & vscode.FileType.Directory) !== 0
		} catch (error) {
			return false
		}
	}

	private async locateRelocatedRoot(missingUri: vscode.Uri, state: WorkplaceState): Promise<vscode.Uri | undefined> {
		const targetName = path.basename(missingUri.fsPath)
		const searchBases = new Set<string>()
		const missingParent = path.dirname(missingUri.fsPath)
		if (missingParent) {
			searchBases.add(missingParent)
		}
		const workspaceFolders = vscode.workspace.workspaceFolders ?? []
		for (const folder of workspaceFolders) {
			searchBases.add(folder.uri.fsPath)
			searchBases.add(path.dirname(folder.uri.fsPath))
		}
		const home = os.homedir()
		if (home) {
			searchBases.add(home)
			searchBases.add(path.join(home, "Desktop"))
			searchBases.add(path.join(home, "Documents"))
		}

		const expectedChildren = new Set<string>()
		for (const folderName of Object.values(this.folderMap)) {
			if (folderName) {
				expectedChildren.add(folderName.toLowerCase())
			}
		}
		for (const company of state.companies) {
			if (company.name) {
				expectedChildren.add(company.name.toLowerCase())
				const slug = this.slugify(company.name)
				if (slug) {
					expectedChildren.add(slug.toLowerCase())
				}
			}
		}

		for (const basePath of searchBases) {
			if (!basePath) {
				continue
			}
			let entries: [string, vscode.FileType][]
			try {
				entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(basePath))
			} catch (_error) {
				continue
			}
			for (const [entryName, entryType] of entries) {
				if ((entryType & vscode.FileType.Directory) === 0) {
					continue
				}
				if (entryName.toLowerCase() !== targetName.toLowerCase()) {
					continue
				}
				const candidate = vscode.Uri.file(path.join(basePath, entryName))
				try {
					const childEntries = await vscode.workspace.fs.readDirectory(candidate)
					const childNames = childEntries
						.filter(([, childType]) => (childType & vscode.FileType.Directory) !== 0)
						.map(([childName]) => childName.toLowerCase())
					const matches = childNames.filter((name) => expectedChildren.has(name))
					if (matches.length > 0) {
						workplaceFsInfo(
							`[WorkplaceFilesystem] Located relocated root at ${candidate.fsPath}; matched subfolders: ${matches.join(", ")}`,
						)
						return candidate
					}
				} catch (error) {
					workplaceFsWarn(
						`[WorkplaceFilesystem] Unable to inspect candidate root ${candidate.fsPath}: ${error instanceof Error ? error.message : String(error)}`,
					)
				}
			}
		}

		return undefined
	}

	private async hasVisibleDirectoryEntries(folderUri: vscode.Uri): Promise<boolean> {
		try {
			const entries = await vscode.workspace.fs.readDirectory(folderUri)
			return entries.some(
				([entryName]) =>
					!IGNORED_DIRECTORY_NAMES.has(entryName) && !entryName.startsWith(".") && entryName.length > 0,
			)
		} catch (error) {
			workplaceFsWarn(
				`[WorkplaceFilesystem] Failed to inspect directory ${folderUri.toString()}: ${error instanceof Error ? error.message : String(error)}`,
			)
			return false
		}
	}

	private async syncCompanyFolders(state: WorkplaceState): Promise<void> {
		if (!this.rootUri) {
			return
		}

		const rootExists = await this.directoryExists(this.rootUri)
		if (!rootExists) {
			workplaceFsWarn(
				`[WorkplaceFilesystem] Root folder missing at ${this.rootUri.fsPath}; attempting to locate relocation`,
			)
			const relocated = await this.locateRelocatedRoot(this.rootUri, state)
			if (relocated) {
				this.rootUri = relocated
				await this.saveRootUri(relocated)
			} else {
				console.error(
					`[WorkplaceFilesystem] Unable to locate relocated root for ${this.rootUri.fsPath}. Please choose the correct folder again.`,
				)
				void vscode.window.showWarningMessage(
					"Golden Workplace folders appear to have moved. Please run 'Golden Workplace: Choose Workplace Folder' to reconnect the workspace.",
				)
				return
			}
		}

		let mapChanged = false
		workplaceFsInfo(
			`[WorkplaceFilesystem] Syncing company folders at root ${this.rootUri.fsPath} for ${state.companies.length} companies`,
		)
		const currentCompanyIds = new Set(state.companies.map((company) => company.id))

		for (const existingId of Object.keys(this.folderMap)) {
			const mappedName = this.folderMap[existingId]
			let mappedExists = true
			if (mappedName) {
				try {
					const folderUri = vscode.Uri.joinPath(this.rootUri, mappedName)
					await vscode.workspace.fs.stat(folderUri)
					const hasContent = await this.hasVisibleDirectoryEntries(folderUri)
					if (!hasContent) {
						mappedExists = false
						workplaceFsInfo(
							`[WorkplaceFilesystem] Mapping ${existingId} → ${mappedName} is empty; will attempt to adopt an existing directory`,
						)
					}
				} catch (error) {
					mappedExists = false
					workplaceFsWarn(
						`[WorkplaceFilesystem] Removing stale mapping for ${existingId} → ${mappedName}: ${error instanceof Error ? error.message : String(error)}`,
					)
				}
			}

			if (!currentCompanyIds.has(existingId) || !mappedExists) {
				delete this.folderMap[existingId]
				mapChanged = true
			}
		}
		workplaceFsInfo(
			`[WorkplaceFilesystem] Remaining mappings after cleanup: ${
				Object.entries(this.folderMap)
					.map(([companyId, folder]) => `${companyId}→${folder}`)
					.join(", ") || "[none]"
			}`,
		)

		let existingEntries: [string, vscode.FileType][] = []
		try {
			existingEntries = await vscode.workspace.fs.readDirectory(this.rootUri)
			workplaceFsInfo(
				`[WorkplaceFilesystem] Root contains ${existingEntries.length} entries: ${existingEntries
					.map(([name]) => name)
					.join(", ")}`,
			)
		} catch (error) {
			console.error("[WorkplaceFilesystem] Failed to enumerate root directory", error)
		}

		const assignedFolderNames = new Set(Object.values(this.folderMap))
		const availableByLowerName = new Map<string, string>()
		const availableBySlug = new Map<string, string>()

		for (const [entryName, entryType] of existingEntries) {
			if (
				entryType !== vscode.FileType.Directory &&
				entryType !== (vscode.FileType.Directory | vscode.FileType.SymbolicLink)
			) {
				continue
			}
			if (assignedFolderNames.has(entryName)) {
				workplaceFsInfo(
					`[WorkplaceFilesystem] Entry ${entryName} already assigned to a company, skipping as candidate`,
				)
				continue
			}
			availableByLowerName.set(entryName.toLowerCase(), entryName)
			const entrySlug = this.slugify(entryName)
			if (entrySlug) {
				availableBySlug.set(entrySlug, entryName)
			}
		}
		if (availableByLowerName.size > 0) {
			workplaceFsInfo(
				`[WorkplaceFilesystem] Candidate folders available for adoption: ${Array.from(availableByLowerName.values()).join(", ")}`,
			)
		}

		for (const company of state.companies) {
			workplaceFsInfo(`[WorkplaceFilesystem] Resolving folder for company ${company.id} (${company.name})`)
			if (!this.folderMap[company.id]) {
				const exactName = company.name?.toLowerCase().trim()
				if (exactName) {
					const existing = availableByLowerName.get(exactName)
					if (existing) {
						workplaceFsInfo(
							`[WorkplaceFilesystem] Adopted exact-name match ${existing} for company ${company.id}`,
						)
						this.folderMap[company.id] = existing
						assignedFolderNames.add(existing)
						availableByLowerName.delete(exactName)
						const assignedSlug = this.slugify(existing)
						if (assignedSlug) {
							availableBySlug.delete(assignedSlug)
						}
						mapChanged = true
						continue
					}
				}

				const nameSlug = this.slugify(company.name)
				const idSlug = this.slugify(company.id)
				const candidateSlugs = [nameSlug, idSlug].filter((value): value is string => Boolean(value))
				let adopted = false
				for (const slug of candidateSlugs) {
					const existing = availableBySlug.get(slug)
					if (existing) {
						workplaceFsInfo(
							`[WorkplaceFilesystem] Adopted slug match ${existing} for company ${company.id}`,
						)
						this.folderMap[company.id] = existing
						assignedFolderNames.add(existing)
						availableByLowerName.delete(existing.toLowerCase())
						availableBySlug.delete(slug)
						mapChanged = true
						adopted = true
						break
					}
				}

				if (adopted) {
					continue
				}
			}

			if (!this.folderMap[company.id] && availableByLowerName.size > 0) {
				for (const [lowerName, entryName] of availableByLowerName.entries()) {
					const folderUri = vscode.Uri.joinPath(this.rootUri, entryName)
					// Only adopt directories that already contain user content.
					const hasContent = await this.hasVisibleDirectoryEntries(folderUri)
					if (!hasContent) {
						workplaceFsInfo(
							`[WorkplaceFilesystem] Skipping folder ${entryName} for company ${company.id}: no visible content`,
						)
						continue
					}
					this.folderMap[company.id] = entryName
					assignedFolderNames.add(entryName)
					availableByLowerName.delete(lowerName)
					const entrySlug = this.slugify(entryName)
					if (entrySlug) {
						availableBySlug.delete(entrySlug)
					}
					mapChanged = true
					workplaceFsInfo(
						`[WorkplaceFilesystem] Adopted existing folder ${entryName} for company ${company.id} (${company.name})`,
					)
					break
				}
			}

			if (this.ensureFolderMapping(company)) {
				mapChanged = true
			}
		}
		workplaceFsInfo(
			`[WorkplaceFilesystem] Final folder mappings: ${Object.entries(this.folderMap)
				.map(([companyId, folder]) => `${companyId}→${folder}`)
				.join(", ")}`,
		)

		if (mapChanged) {
			await this.context.globalState.update(COMPANY_FOLDER_STATE_KEY, { ...this.folderMap })
		}

		await this.ensureRootDirectory()

		for (const company of state.companies) {
			const companyUri = this.getCompanyFolderUri(company.id)
			if (!companyUri) {
				continue
			}
			try {
				await vscode.workspace.fs.createDirectory(companyUri)
			} catch (error) {
				console.error(
					`[WorkplaceFilesystem] Failed to create directory for company ${company.id} at ${companyUri.toString()}`,
					error,
				)
			}
		}
	}

	private ensureFolderMapping(company: WorkplaceCompany): boolean {
		if (this.folderMap[company.id]) {
			return false
		}

		const existingNames = new Set(Object.values(this.folderMap))
		const base = this.slugify(company.name) || "company"
		let candidate = base

		if (existingNames.has(candidate)) {
			const sanitizedId = company.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6) || Date.now().toString(36)
			candidate = `${base}-${sanitizedId}`
			let counter = 1
			while (existingNames.has(candidate)) {
				candidate = `${base}-${sanitizedId}-${counter}`
				counter += 1
			}
		}

		this.folderMap[company.id] = candidate
		return true
	}

	private slugify(value?: string): string {
		if (!value) {
			return ""
		}

		return value
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^a-zA-Z0-9\s-_]/g, "")
			.trim()
			.replace(/[\s_-]+/g, "-")
			.toLowerCase()
	}

	private getCompanyFolderUri(companyId: string): vscode.Uri | undefined {
		if (!this.rootUri) {
			return undefined
		}
		const folderName = this.folderMap[companyId]
		if (!folderName) {
			return undefined
		}
		return vscode.Uri.joinPath(this.rootUri, folderName)
	}

	private detectFileKind(extension: string): FileCabinetFileKind {
		const normalized = extension.toLowerCase()
		if (IMAGE_EXTENSIONS.has(normalized)) {
			return "image"
		}
		if (VIDEO_EXTENSIONS.has(normalized)) {
			return "video"
		}
		if (AUDIO_EXTENSIONS.has(normalized)) {
			return "audio"
		}
		if (SPREADSHEET_EXTENSIONS.has(normalized)) {
			return "spreadsheet"
		}
		if (PRESENTATION_EXTENSIONS.has(normalized)) {
			return "presentation"
		}
		if (MARKDOWN_EXTENSIONS.has(normalized)) {
			return "markdown"
		}
		if (TEXT_EXTENSIONS.has(normalized)) {
			return "text"
		}
		if (DOC_EXTENSIONS.has(normalized)) {
			return normalized === ".pdf" ? "pdf" : "doc"
		}
		if (ARCHIVE_EXTENSIONS.has(normalized)) {
			return "archive"
		}
		if (
			normalized.endsWith("ts") ||
			normalized.endsWith("js") ||
			normalized.endsWith("py") ||
			normalized.endsWith("go")
		) {
			return "code"
		}
		return "other"
	}

	private sanitizeRelativePath(target: string): string | undefined {
		const normalized = target.replace(/\\/g, "/")
		const trimmed = normalized.startsWith("/") ? normalized.slice(1) : normalized
		const resolved = path.posix.normalize(trimmed)
		if (resolved.startsWith("..")) {
			return undefined
		}
		return resolved
	}

	private async scanCompanyDirectory(
		companyId: string,
		folderUri: vscode.Uri,
		relativePath: string,
		files: FileCabinetFileSummary[],
		folderPaths: Set<string>,
		counter: { count: number },
	): Promise<void> {
		if (counter.count >= MAX_SCAN_ENTRIES) {
			return
		}

		let entries: [string, vscode.FileType][] = []
		try {
			entries = await vscode.workspace.fs.readDirectory(folderUri)
		} catch (error) {
			console.error(
				`[WorkplaceFilesystem] Failed to read directory ${folderUri?.toString() ?? ""} for company ${companyId}`,
				error,
			)
			return
		}

		for (const [name, type] of entries) {
			if (IGNORED_DIRECTORY_NAMES.has(name)) {
				continue
			}

			const childRelativePath = posixJoin(relativePath, name)
			const childUri = vscode.Uri.joinPath(folderUri, name)

			if (type === vscode.FileType.Directory) {
				folderPaths.add(childRelativePath)
				await this.scanCompanyDirectory(companyId, childUri, childRelativePath, files, folderPaths, counter)
				continue
			}

			if (type === vscode.FileType.File || type === (vscode.FileType.File | vscode.FileType.SymbolicLink)) {
				if (counter.count >= MAX_SCAN_ENTRIES) {
					return
				}
				let stat: vscode.FileStat
				try {
					stat = await vscode.workspace.fs.stat(childUri)
				} catch (error) {
					console.error(
						`[WorkplaceFilesystem] Failed to stat file ${childUri?.toString() ?? ""} for company ${companyId}`,
						error,
					)
					continue
				}

				const extension = path.extname(name) ?? ""
				const kind = this.detectFileKind(extension)
				const segments = childRelativePath.split("/")
				const id = `${companyId}:${childRelativePath}`
				files.push({
					id,
					name,
					path: `/${childRelativePath}`,
					extension,
					segments,
					byteSize: stat.size,
					createdAt: new Date(stat.ctime).toISOString(),
					modifiedAt: new Date(stat.mtime).toISOString(),
					kind,
					isBinary: BINARY_EXTENSIONS.has(extension.toLowerCase()),
					contentType: this.guessContentType(extension),
					topLevelFolder: segments.length > 1 ? segments[0] : undefined,
				})
				counter.count += 1
			}
		}
	}

	private guessContentType(extension: string): string | undefined {
		switch (extension.toLowerCase()) {
			case ".png":
				return "image/png"
			case ".jpg":
			case ".jpeg":
				return "image/jpeg"
			case ".gif":
				return "image/gif"
			case ".webp":
				return "image/webp"
			case ".svg":
				return "image/svg+xml"
			case ".mp4":
				return "video/mp4"
			case ".mov":
				return "video/quicktime"
			case ".mp3":
				return "audio/mpeg"
			case ".wav":
				return "audio/wav"
			case ".pdf":
				return "application/pdf"
			case ".json":
				return "application/json"
			case ".csv":
				return "text/csv"
			case ".md":
			case ".mdx":
				return "text/markdown"
			case ".txt":
				return "text/plain"
			default:
				return undefined
		}
	}

	private buildFolderSummaries(
		folderPaths: Set<string>,
		files: FileCabinetFileSummary[],
	): FileCabinetFolderSummary[] {
		const fileCountMap = new Map<string, number>()
		for (const file of files) {
			if (file.segments.length <= 1) {
				continue
			}
			let current = ""
			for (let i = 0; i < file.segments.length - 1; i += 1) {
				current = current ? `${current}/${file.segments[i]}` : file.segments[i]
				fileCountMap.set(current, (fileCountMap.get(current) ?? 0) + 1)
			}
		}

		const subfolderMap = new Map<string, Set<string>>()
		for (const folderPath of folderPaths) {
			if (!folderPath) {
				continue
			}
			const parent = folderPath.includes("/") ? folderPath.slice(0, folderPath.lastIndexOf("/")) : ""
			if (parent) {
				const existing = subfolderMap.get(parent) ?? new Set<string>()
				existing.add(folderPath)
				subfolderMap.set(parent, existing)
			}
		}

		return Array.from(folderPaths)
			.map((folderPath) => {
				const segments = folderPath ? folderPath.split("/") : []
				const name = segments[segments.length - 1] ?? ""
				const depth = segments.length
				const parentPath = depth > 1 ? segments.slice(0, -1).join("/") : undefined
				return {
					path: folderPath,
					name,
					depth,
					parentPath,
					fileCount: fileCountMap.get(folderPath) ?? 0,
					subfolderCount: subfolderMap.get(folderPath)?.size ?? 0,
				}
			})
			.sort((a, b) => a.path.localeCompare(b.path))
	}

	private async resolveWindowPreference(currentCompanyId?: string): Promise<boolean> {
		const config = vscode.workspace.getConfiguration(Package.name)
		const mode = config.get<OpenCompanyWindowMode>("openCompanyWindowMode", "prompt")
		if (mode === "currentWindow") {
			return false
		}
		if (mode === "newWindow") {
			return true
		}

		const legacyPreference = config.inspect<boolean>("openCompanyInNewWindow")
		const legacyValue =
			legacyPreference?.workspaceFolderValue ?? legacyPreference?.workspaceValue ?? legacyPreference?.globalValue
		if (typeof legacyValue === "boolean") {
			return legacyValue
		}

		const companyName = currentCompanyId
			? this.lastState.companies.find((company) => company.id === currentCompanyId)?.name
			: undefined

		const quickPickItems: WindowChoiceQuickPickItem[] = [
			{
				label: "Open in current window",
				detail: "Switch to this company's workspace in the window you already have open.",
				action: "current",
			},
			{
				label: "Open in new window",
				detail: "Launch a separate VS Code window for this company.",
				action: "new",
			},
			{ label: "", kind: vscode.QuickPickItemKind.Separator },
			{
				label: "Always use current window",
				detail: "Stop asking and always reuse the existing window.",
				action: "rememberCurrent",
			},
			{
				label: "Always use new window",
				detail: "Stop asking and always open a separate window.",
				action: "rememberNew",
			},
		]

		const selection = await vscode.window.showQuickPick(quickPickItems, {
			title: companyName ? `Open ${companyName}` : "Open Golden Workplace",
			placeHolder: "Choose how to open this company's workspace.",
			ignoreFocusOut: true,
		})

		switch (selection?.action) {
			case "new":
				return true
			case "rememberCurrent":
				await this.persistWindowModePreference("currentWindow", false)
				return false
			case "rememberNew":
				await this.persistWindowModePreference("newWindow", true)
				return true
			case "current":
			default:
				return false
		}
	}

	private async persistWindowModePreference(mode: OpenCompanyWindowMode, openInNewWindow: boolean): Promise<void> {
		const config = vscode.workspace.getConfiguration(Package.name)
		try {
			await config.update("openCompanyWindowMode", mode, vscode.ConfigurationTarget.Global)
		} catch (error) {
			console.error("[WorkplaceFilesystem] Failed to persist openCompanyWindowMode", error)
		}
		try {
			await config.update("openCompanyInNewWindow", openInNewWindow, vscode.ConfigurationTarget.Global)
		} catch (error) {
			console.error("[WorkplaceFilesystem] Failed to persist openCompanyInNewWindow", error)
		}
	}

	private async handleActiveCompanyChange(currentCompanyId: string | undefined, previous?: string | undefined) {
		if (!this.rootUri) {
			return
		}

		const targetUri = currentCompanyId ? this.getCompanyFolderUri(currentCompanyId) : this.rootUri
		if (!targetUri) {
			workplaceFsWarn(
				`[WorkplaceFilesystem] Missing folder mapping for company ${currentCompanyId ?? "<root>"}, cannot open workspace.`,
			)
			return
		}

		const openInNewWindow = currentCompanyId ? await this.resolveWindowPreference(currentCompanyId) : false
		const shouldSignalFocus = true

		if (!openInNewWindow && this.isCurrentWorkspace(targetUri)) {
			return
		}

		try {
			if (shouldSignalFocus) {
				await this.context.globalState.update(FOCUS_SIDEBAR_FLAG_KEY, true)
			}
			await vscode.commands.executeCommand("vscode.openFolder", targetUri, openInNewWindow)
		} catch (error) {
			console.error(
				`[WorkplaceFilesystem] Failed to open workspace for company ${currentCompanyId ?? "root"}`,
				error,
			)
			if (shouldSignalFocus) {
				try {
					await this.context.globalState.update(FOCUS_SIDEBAR_FLAG_KEY, false)
				} catch (updateError) {
					console.error("[WorkplaceFilesystem] Failed to reset sidebar focus flag", updateError)
				}
			}
			// If we failed, revert previous active company id so we don't get stuck
			this.previousActiveCompanyId = previous
		}
	}

	private isCurrentWorkspace(target: vscode.Uri): boolean {
		const folders = vscode.workspace.workspaceFolders
		if (!folders || folders.length !== 1) {
			return false
		}
		return folders[0].uri.toString() === target.toString()
	}

	private async saveRootUri(uri: vscode.Uri): Promise<void> {
		await this.context.globalState.update(ROOT_STATE_KEY, uri.toString())
	}
}
