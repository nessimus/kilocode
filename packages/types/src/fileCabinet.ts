export type FileCabinetFileKind =
	| "image"
	| "pdf"
	| "doc"
	| "markdown"
	| "text"
	| "spreadsheet"
	| "presentation"
	| "video"
	| "audio"
	| "archive"
	| "code"
	| "other"

export interface FileCabinetFolderSummary {
	/** Relative path from the company root using POSIX separators (no leading slash for root). */
	path: string
	name: string
	depth: number
	parentPath?: string
	fileCount: number
	subfolderCount: number
}

export interface FileCabinetFileSummary {
	id: string
	name: string
	path: string
	extension: string
	segments: string[]
	byteSize: number
	createdAt: string
	modifiedAt: string
	kind: FileCabinetFileKind
	contentType?: string
	isBinary: boolean
	/** Convenience: first segment if available */
	topLevelFolder?: string
}

export interface FileCabinetSnapshot {
	companyId: string
	rootUri: string
	generatedAt: string
	folders: FileCabinetFolderSummary[]
	files: FileCabinetFileSummary[]
}

export interface FileCabinetPreview {
	companyId: string
	path: string
	kind: FileCabinetFileKind
	byteSize: number
	createdAt: string
	modifiedAt: string
	contentType?: string
	text?: string
	markdown?: string
	base64?: string
	error?: string
}

export interface FileCabinetWriteRequest {
	companyId: string
	path: string
	contents: string
	encoding?: "utf8" | "base64"
}

export interface FileCabinetCreateFolderRequest {
	companyId: string
	/**
	 * Relative path from the company root for the new folder. A leading slash is optional.
	 */
	path: string
}

export interface FileCabinetCreateFileRequest {
	companyId: string
	/**
	 * Relative directory from the company root where the file should be created. Empty string for root.
	 */
	directory?: string
	/**
	 * Preferred base file name without extension. Defaults to "Untitled".
	 */
	preferredBaseName?: string
	/**
	 * File extension to use. A leading dot is optional. Defaults to ".md".
	 */
	extension?: string
	/**
	 * Initial file contents to write.
	 */
	initialContents?: string
	encoding?: "utf8" | "base64"
}

export interface FileCabinetCreateFileResult {
	success: boolean
	companyId: string
	path?: string
	fileName?: string
	error?: string
}
