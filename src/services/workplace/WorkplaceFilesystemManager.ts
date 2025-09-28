import * as vscode from "vscode"

import { Package } from "../../shared/package"
import { cloneWorkplaceState, WorkplaceCompany, WorkplaceState } from "../../shared/golden/workplace"
import type { WorkplaceStateObserver } from "./WorkplaceService"

const ROOT_STATE_KEY = "goldenWorkplace.rootUri"
const COMPANY_FOLDER_STATE_KEY = "goldenWorkplace.companyFolders"

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

	private async syncCompanyFolders(state: WorkplaceState): Promise<void> {
		if (!this.rootUri) {
			return
		}

		let mapChanged = false
		const currentCompanyIds = new Set(state.companies.map((company) => company.id))

		for (const existingId of Object.keys(this.folderMap)) {
			if (!currentCompanyIds.has(existingId)) {
				delete this.folderMap[existingId]
				mapChanged = true
			}
		}

		for (const company of state.companies) {
			if (this.ensureFolderMapping(company)) {
				mapChanged = true
			}
		}

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

	private async handleActiveCompanyChange(currentCompanyId: string | undefined, previous?: string | undefined) {
		if (!this.rootUri) {
			return
		}

		const targetUri = currentCompanyId ? this.getCompanyFolderUri(currentCompanyId) : this.rootUri
		if (!targetUri) {
			console.warn(
				`[WorkplaceFilesystem] Missing folder mapping for company ${currentCompanyId ?? "<root>"}, cannot open workspace.`,
			)
			return
		}

		const openInNewWindow = currentCompanyId
			? vscode.workspace.getConfiguration(Package.name).get<boolean>("openCompanyInNewWindow", true)
			: false

		if (!openInNewWindow && this.isCurrentWorkspace(targetUri)) {
			return
		}

		try {
			await vscode.commands.executeCommand("vscode.openFolder", targetUri, openInNewWindow)
		} catch (error) {
			console.error(
				`[WorkplaceFilesystem] Failed to open workspace for company ${currentCompanyId ?? "root"}`,
				error,
			)
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
