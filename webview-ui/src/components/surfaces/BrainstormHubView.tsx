import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { VSCodeButton, VSCodeCheckbox, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"

import type {
	EndlessSurfaceAgentAccess,
	EndlessSurfaceBackground,
	EndlessSurfaceRecord,
	EndlessSurfaceTheme,
} from "@roo-code/types"

import { useExtensionState } from "@/context/ExtensionStateContext"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { cn } from "@/lib/utils"

import { EndlessSurfaceCanvas } from "./EndlessSurfaceCanvas"

const accessOptions: EndlessSurfaceAgentAccess[] = ["none", "read", "write"]

export const BrainstormHubView: React.FC = () => {
	const { endlessSurface, renameSurface, setSurfaceAgentAccess, saveSurfaceRecord, requestSurfaceSnapshot } =
		useExtensionState()
	const { t } = useAppTranslation()

	const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle")
	const [surfaceDraft, setSurfaceDraft] = useState<EndlessSurfaceRecord | undefined>(endlessSurface?.activeSurface)
	const [isSettingsOpen, setIsSettingsOpen] = useState(false)
	const settingsContainerRef = useRef<HTMLDivElement | null>(null)
	const pendingSaveRef = useRef<EndlessSurfaceRecord | undefined>()
	const saveDebounceRef = useRef<NodeJS.Timeout | undefined>()
	const resetStatusTimeoutRef = useRef<NodeJS.Timeout | undefined>()
	const isMountedRef = useRef(true)

	const activeSurfaceId = endlessSurface?.activeSurfaceId
	const baseSurface = surfaceDraft ?? endlessSurface?.activeSurface
	const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().includes("MAC")
	const modKeyLabel = isMac ? "⌘" : "Ctrl"
	const shortcuts = useMemo(
		() => [
			{
				combo: `${modKeyLabel} + Z`,
				description: t("common:brainstorm.shortcuts.undo", { defaultValue: "Undo" }) as string,
			},
			{
				combo: `Shift + ${modKeyLabel} + Z`,
				description: t("common:brainstorm.shortcuts.redo", { defaultValue: "Redo" }) as string,
			},
			{
				combo: `${modKeyLabel} + C`,
				description: t("common:brainstorm.shortcuts.copy", { defaultValue: "Copy selection" }) as string,
			},
			{
				combo: `${modKeyLabel} + V`,
				description: t("common:brainstorm.shortcuts.paste", { defaultValue: "Paste selection" }) as string,
			},
			{
				combo: `${modKeyLabel} + D`,
				description: t("common:brainstorm.shortcuts.duplicate", {
					defaultValue: "Duplicate selection",
				}) as string,
			},
			{
				combo: "Delete / Backspace",
				description: t("common:brainstorm.shortcuts.delete", { defaultValue: "Delete selection" }) as string,
			},
			{
				combo: "Shift + Drag",
				description: t("common:brainstorm.shortcuts.marquee", {
					defaultValue: "Box select multiple nodes",
				}) as string,
			},
			{
				combo: "Space + Drag",
				description: t("common:brainstorm.shortcuts.pan", { defaultValue: "Pan the canvas" }) as string,
			},
			{
				combo: `${modKeyLabel} + / ${modKeyLabel} -`,
				description: t("common:brainstorm.shortcuts.zoom", { defaultValue: "Zoom in/out" }) as string,
			},
		],
		[modKeyLabel, t],
	)

	useEffect(() => {
		const latest = endlessSurface?.activeSurface
		setSurfaceDraft((previous: EndlessSurfaceRecord | undefined) => {
			if (!latest) {
				return undefined
			}
			if (!previous) {
				return latest
			}
			if (previous.meta.id !== latest.meta.id) {
				return latest
			}
			if (latest.meta.updatedAt > previous.meta.updatedAt) {
				return latest
			}
			return previous
		})
	}, [endlessSurface?.activeSurface])

	useEffect(() => {
		if (isSettingsOpen && !baseSurface) {
			setIsSettingsOpen(false)
		}
	}, [baseSurface, isSettingsOpen])

	useEffect(() => {
		if (!isSettingsOpen) {
			return
		}
		const handleClickAway = (event: MouseEvent) => {
			if (settingsContainerRef.current?.contains(event.target as Node)) {
				return
			}
			setIsSettingsOpen(false)
		}
		const handleKeydown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setIsSettingsOpen(false)
			}
		}
		document.addEventListener("mousedown", handleClickAway)
		document.addEventListener("keydown", handleKeydown)
		return () => {
			document.removeEventListener("mousedown", handleClickAway)
			document.removeEventListener("keydown", handleKeydown)
		}
	}, [isSettingsOpen])

	const handleRename = useCallback(
		(title: string) => {
			if (!activeSurfaceId) {
				return
			}
			renameSurface(activeSurfaceId, title)
		},
		[activeSurfaceId, renameSurface],
	)

	const handleAgentAccess = useCallback(
		(access: EndlessSurfaceAgentAccess) => {
			if (!activeSurfaceId) {
				return
			}
			setSurfaceAgentAccess(activeSurfaceId, access)
		},
		[activeSurfaceId, setSurfaceAgentAccess],
	)

	const flushPendingSave = useCallback(async () => {
		if (!pendingSaveRef.current) {
			return
		}
		const recordToSave = pendingSaveRef.current
		pendingSaveRef.current = undefined
		try {
			await saveSurfaceRecord(recordToSave)
			if (isMountedRef.current) {
				setSaving("saved")
				if (resetStatusTimeoutRef.current) {
					clearTimeout(resetStatusTimeoutRef.current)
				}
				resetStatusTimeoutRef.current = setTimeout(() => {
					if (isMountedRef.current) {
						setSaving("idle")
					}
					resetStatusTimeoutRef.current = undefined
				}, 1500)
			}
		} catch (error) {
			console.error("Failed to save surface record", error)
			if (isMountedRef.current) {
				setSaving("idle")
			}
		}
	}, [saveSurfaceRecord])

	const scheduleSave = useCallback(
		(record: EndlessSurfaceRecord) => {
			pendingSaveRef.current = record
			setSaving("saving")
			if (resetStatusTimeoutRef.current) {
				clearTimeout(resetStatusTimeoutRef.current)
				resetStatusTimeoutRef.current = undefined
			}
			if (saveDebounceRef.current) {
				clearTimeout(saveDebounceRef.current)
			}
			saveDebounceRef.current = setTimeout(() => {
				void flushPendingSave()
			}, 600)
		},
		[flushPendingSave],
	)

	const handleSaveRecord = useCallback(
		(nextRecord: EndlessSurfaceRecord | undefined) => {
			if (!nextRecord) {
				return
			}
			setSurfaceDraft(nextRecord)
			scheduleSave(nextRecord)
		},
		[scheduleSave],
	)

	const handleCanvasSurfaceChange = useCallback(
		(nextRecord: EndlessSurfaceRecord) => {
			handleSaveRecord(nextRecord)
		},
		[handleSaveRecord],
	)

	const commitSurfaceUpdates = useCallback(
		(updater: (surface: EndlessSurfaceRecord) => EndlessSurfaceRecord) => {
			const source = surfaceDraft ?? endlessSurface?.activeSurface
			if (!source) {
				return
			}
			const cloned = JSON.parse(JSON.stringify(source)) as EndlessSurfaceRecord
			const updated = updater({
				...cloned,
				meta: { ...cloned.meta, updatedAt: Date.now() },
				data: {
					...cloned.data,
					settings: { ...cloned.data.settings },
				},
			})
			handleSaveRecord(updated)
		},
		[endlessSurface?.activeSurface, handleSaveRecord, surfaceDraft],
	)

	const handleThemeChange = useCallback(
		(theme: EndlessSurfaceTheme) => {
			commitSurfaceUpdates((next) => {
				next.data.theme = theme
				return next
			})
		},
		[commitSurfaceUpdates],
	)

	const handleBackgroundChange = useCallback(
		(background: EndlessSurfaceBackground) => {
			commitSurfaceUpdates((next) => {
				next.data.background = background
				next.data.settings.grid = background
				return next
			})
		},
		[commitSurfaceUpdates],
	)

	const handleGridSizeChange = useCallback(
		(gridSize: number) => {
			commitSurfaceUpdates((next) => {
				next.data.settings.gridSize = gridSize
				return next
			})
		},
		[commitSurfaceUpdates],
	)

	const handleSnapToGridChange = useCallback(
		(snapToGrid: boolean) => {
			commitSurfaceUpdates((next) => {
				next.data.settings.snapToGrid = snapToGrid
				return next
			})
		},
		[commitSurfaceUpdates],
	)

	const handleAutoLayoutChange = useCallback(
		(enabled: boolean) => {
			commitSurfaceUpdates((next) => {
				next.data.settings.autoLayout = enabled ? "hierarchy" : "manual"
				if (enabled && !next.data.autoLayout) {
					next.data.autoLayout = { mode: "hierarchy", spacing: 144, mindMapOrientation: "horizontal" }
				}
				if (!enabled) {
					next.data.autoLayout = undefined
				}
				return next
			})
		},
		[commitSurfaceUpdates],
	)

	const handleShowGridChange = useCallback(
		(showGrid: boolean) => {
			commitSurfaceUpdates((next) => {
				next.data.settings.showGrid = showGrid
				return next
			})
		},
		[commitSurfaceUpdates],
	)

	const handleShowMinimapChange = useCallback(
		(showMinimap: boolean) => {
			commitSurfaceUpdates((next) => {
				next.data.settings.showMinimap = showMinimap
				return next
			})
		},
		[commitSurfaceUpdates],
	)

	const handleShowControlsChange = useCallback(
		(showControls: boolean) => {
			commitSurfaceUpdates((next) => {
				next.data.settings.showControls = showControls
				return next
			})
		},
		[commitSurfaceUpdates],
	)

	const handleSnapshot = useCallback(() => {
		if (!activeSurfaceId) {
			return
		}
		requestSurfaceSnapshot({ surfaceId: activeSurfaceId })
	}, [activeSurfaceId, requestSurfaceSnapshot])

	useEffect(() => {
		return () => {
			isMountedRef.current = false
			if (saveDebounceRef.current) {
				clearTimeout(saveDebounceRef.current)
				saveDebounceRef.current = undefined
				if (pendingSaveRef.current) {
					void saveSurfaceRecord(pendingSaveRef.current).catch((error) => {
						console.error("Failed to flush pending surface save", error)
					})
					pendingSaveRef.current = undefined
				}
			}
			if (resetStatusTimeoutRef.current) {
				clearTimeout(resetStatusTimeoutRef.current)
				resetStatusTimeoutRef.current = undefined
			}
		}
	}, [saveSurfaceRecord])

	const theme = baseSurface?.data.theme ?? "light"
	const background = baseSurface?.data.background ?? "dots"
	const settings = baseSurface?.data.settings

	const savingLabel =
		saving === "saving"
			? (t("common:brainstorm.saving", { defaultValue: "Saving..." }) as string)
			: saving === "saved"
				? (t("common:brainstorm.saved", { defaultValue: "Saved" }) as string)
				: ""

	return (
		<div className="flex h-full min-h-0 w-full flex-col bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]">
			<header className="shrink-0 border-b border-[var(--vscode-panel-border)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,rgba(255,255,255,0.04)_2%)]">
				<div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
					<div className="flex w-full min-w-0 flex-col gap-2">
						<div className="flex min-w-0 items-center gap-3">
							<input
								type="text"
								value={baseSurface?.meta.title ?? ""}
								onChange={(event) => handleRename(event.target.value)}
								placeholder={
									t("common:brainstorm.untitled", { defaultValue: "Untitled Surface" }) as string
								}
								className="flex-1 min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold outline-none transition focus:border-[var(--vscode-focusBorder)] focus:bg-[color-mix(in_srgb,var(--vscode-editor-background)_85%,rgba(255,255,255,0.1)_15%)]"
								disabled={!baseSurface}
							/>
							{savingLabel && (
								<span className="hidden text-xs font-medium text-[var(--vscode-descriptionForeground)] lg:inline">
									{savingLabel}
								</span>
							)}
						</div>
						{savingLabel && (
							<span className="text-xs text-[var(--vscode-descriptionForeground)] lg:hidden">
								{savingLabel}
							</span>
						)}
					</div>
					<div className="flex flex-wrap items-center gap-3">
						<div className="flex items-center gap-2 text-xs text-[var(--vscode-descriptionForeground)]">
							<span>
								{t("common:brainstorm.agentAccess", { defaultValue: "Agent Access" }) as string}
							</span>
							<VSCodeDropdown
								value={baseSurface?.meta.agentAccess ?? "none"}
								onChange={(event) =>
									handleAgentAccess(
										(event.target as HTMLSelectElement).value as EndlessSurfaceAgentAccess,
									)
								}
								className="min-w-[120px]">
								{accessOptions.map((option) => (
									<VSCodeOption key={option} value={option}>
										{option === "write"
											? t("common:brainstorm.accessReadWrite", { defaultValue: "Read + Write" })
											: option === "read"
												? t("common:brainstorm.accessRead", { defaultValue: "Read" })
												: t("common:brainstorm.accessNone", { defaultValue: "No Access" })}
									</VSCodeOption>
								))}
							</VSCodeDropdown>
						</div>
						<div className="relative" ref={settingsContainerRef}>
							<VSCodeButton
								appearance="secondary"
								disabled={!baseSurface}
								onClick={() => setIsSettingsOpen((open) => !open)}
								aria-expanded={isSettingsOpen}
								aria-haspopup="dialog">
								<span className="codicon codicon-settings-gear mr-1" />
								{t("common:brainstorm.settings", { defaultValue: "Settings" }) as string}
							</VSCodeButton>
							{isSettingsOpen && baseSurface && (
								<div className="absolute right-0 top-full z-30 mt-2 w-72 max-w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-md border border-[color-mix(in_srgb,var(--vscode-panel-border)_90%,transparent_10%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_98%,rgba(255,255,255,0.05)_2%)] shadow-2xl">
									<div className="max-h-[min(70vh,520px)] overflow-y-auto p-3 flex flex-col gap-3 text-xs text-[var(--vscode-descriptionForeground)]">
										<section>
											<p className="text-[10px] font-semibold uppercase tracking-wider text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent_20%)]">
												{t("common:brainstorm.theme", { defaultValue: "Theme" }) as string}
											</p>
											<div className="mt-2 flex gap-2">
												<button
													type="button"
													className={cn(
														"flex-1 rounded-md border px-2 py-2 text-sm font-medium transition",
														theme === "light"
															? "border-[var(--vscode-focusBorder)] bg-[color-mix(in_srgb,var(--vscode-focusBorder)_16%,var(--vscode-editor-background)_84%)] text-[var(--vscode-foreground)]"
															: "border-[color-mix(in_srgb,var(--vscode-panel-border)_80%,transparent_20%)] text-[var(--vscode-descriptionForeground)] hover:border-[var(--vscode-focusBorder)]",
													)}
													onClick={() => handleThemeChange("light")}>
													{t("common:theme.light", { defaultValue: "Light" }) as string}
												</button>
												<button
													type="button"
													className={cn(
														"flex-1 rounded-md border px-2 py-2 text-sm font-medium transition",
														theme === "dark"
															? "border-[var(--vscode-focusBorder)] bg-[color-mix(in_srgb,var(--vscode-focusBorder)_16%,var(--vscode-editor-background)_84%)] text-[var(--vscode-foreground)]"
															: "border-[color-mix(in_srgb,var(--vscode-panel-border)_80%,transparent_20%)] text-[var(--vscode-descriptionForeground)] hover:border-[var(--vscode-focusBorder)]",
													)}
													onClick={() => handleThemeChange("dark")}>
													{t("common:theme.dark", { defaultValue: "Dark" }) as string}
												</button>
											</div>
										</section>

										<section>
											<p className="text-[10px] font-semibold uppercase tracking-wider text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent_20%)]">
												{
													t("common:brainstorm.background", {
														defaultValue: "Background",
													}) as string
												}
											</p>
											<div className="mt-2 flex gap-2">
												<button
													type="button"
													className={cn(
														"flex-1 rounded-md border px-2 py-2 text-sm font-medium transition",
														background === "dots"
															? "border-[var(--vscode-focusBorder)] bg-[color-mix(in_srgb,var(--vscode-focusBorder)_16%,var(--vscode-editor-background)_84%)] text-[var(--vscode-foreground)]"
															: "border-[color-mix(in_srgb,var(--vscode-panel-border)_80%,transparent_20%)] text-[var(--vscode-descriptionForeground)] hover:border-[var(--vscode-focusBorder)]",
													)}
													onClick={() => handleBackgroundChange("dots")}>
													{
														t("common:brainstorm.backgroundDots", {
															defaultValue: "Dot Grid",
														}) as string
													}
												</button>
												<button
													type="button"
													className={cn(
														"flex-1 rounded-md border px-2 py-2 text-sm font-medium transition",
														background === "lines"
															? "border-[var(--vscode-focusBorder)] bg-[color-mix(in_srgb,var(--vscode-focusBorder)_16%,var(--vscode-editor-background)_84%)] text-[var(--vscode-foreground)]"
															: "border-[color-mix(in_srgb,var(--vscode-panel-border)_80%,transparent_20%)] text-[var(--vscode-descriptionForeground)] hover:border-[var(--vscode-focusBorder)]",
													)}
													onClick={() => handleBackgroundChange("lines")}>
													{
														t("common:brainstorm.backgroundLines", {
															defaultValue: "Line Grid",
														}) as string
													}
												</button>
											</div>
										</section>

										<section>
											<p className="text-[10px] font-semibold uppercase tracking-wider text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent_20%)]">
												{
													t("common:brainstorm.gridSize", {
														defaultValue: "Grid Size",
													}) as string
												}
											</p>
											<div className="mt-2 flex items-center gap-3">
												<input
													type="range"
													min={8}
													max={96}
													step={2}
													value={settings?.gridSize ?? 16}
													onChange={(event) =>
														handleGridSizeChange(Number(event.target.value))
													}
													className="flex-1 accent-[var(--vscode-focusBorder)]"
												/>
												<span className="w-8 text-right font-medium text-[var(--vscode-descriptionForeground)]">
													{settings?.gridSize ?? 16}
												</span>
											</div>
										</section>

										<section className="flex flex-col gap-1">
											<VSCodeCheckbox
												checked={settings?.snapToGrid ?? true}
												onChange={(event: any) =>
													handleSnapToGridChange(!!event.target.checked)
												}>
												{
													t("common:brainstorm.snapToGrid", {
														defaultValue: "Snap to grid",
													}) as string
												}
											</VSCodeCheckbox>
											<VSCodeCheckbox
												checked={(settings?.autoLayout ?? "manual") !== "manual"}
												onChange={(event: any) =>
													handleAutoLayoutChange(!!event.target.checked)
												}>
												{
													t("common:brainstorm.autoLayout", {
														defaultValue: "Auto-layout",
													}) as string
												}
											</VSCodeCheckbox>
										</section>

										<section className="border-t border-[color-mix(in_srgb,var(--vscode-panel-border)_80%,transparent_20%)] pt-3">
											<p className="text-[10px] font-semibold uppercase tracking-wider text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent_20%)]">
												{
													t("common:brainstorm.suggestions", {
														defaultValue: "Suggestions",
													}) as string
												}
											</p>
											<div className="mt-2 flex flex-col gap-1">
												<VSCodeCheckbox
													checked={settings?.showGrid ?? true}
													onChange={(event: any) =>
														handleShowGridChange(!!event.target.checked)
													}>
													{
														t("common:brainstorm.showGrid", {
															defaultValue: "Show grid overlay",
														}) as string
													}
												</VSCodeCheckbox>
												<VSCodeCheckbox
													checked={settings?.showMinimap ?? true}
													onChange={(event: any) =>
														handleShowMinimapChange(!!event.target.checked)
													}>
													{
														t("common:brainstorm.showMinimap", {
															defaultValue: "Show minimap",
														}) as string
													}
												</VSCodeCheckbox>
												<VSCodeCheckbox
													checked={settings?.showControls ?? true}
													onChange={(event: any) =>
														handleShowControlsChange(!!event.target.checked)
													}>
													{
														t("common:brainstorm.showControls", {
															defaultValue: "Show canvas controls",
														}) as string
													}
												</VSCodeCheckbox>
											</div>
										</section>

										<section className="border-t border-[color-mix(in_srgb,var(--vscode-panel-border)_80%,transparent_20%)] pt-3">
											<p className="text-[10px] font-semibold uppercase tracking-wider text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent_20%)]">
												{
													t("common:brainstorm.shortcutsHeading", {
														defaultValue: "Canvas shortcuts",
													}) as string
												}
											</p>
											<p className="mt-1 text-[11px] text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_90%,transparent_10%)]">
												{
													t("common:brainstorm.shortcutsHint", {
														defaultValue:
															"Use these shortcuts to work faster on the canvas.",
													}) as string
												}
											</p>
											<div className="mt-2 flex flex-col gap-1">
												{shortcuts.map((entry) => (
													<div
														key={entry.combo}
														className="flex items-center justify-between gap-3 rounded-md border border-[color-mix(in_srgb,var(--vscode-panel-border)_65%,transparent_35%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,rgba(255,255,255,0.08)_8%)] px-2 py-1">
														<span className="font-mono text-[11px] text-[var(--vscode-foreground)]">
															{entry.combo}
														</span>
														<span className="text-[11px] text-[var(--vscode-descriptionForeground)]">
															{entry.description}
														</span>
													</div>
												))}
											</div>
										</section>

										<VSCodeButton
											appearance="secondary"
											onClick={() => {
												handleSnapshot()
												setIsSettingsOpen(false)
											}}>
											<span className="codicon codicon-camera mr-1" />
											{
												t("common:brainstorm.captureSnapshot", {
													defaultValue: "Capture snapshot",
												}) as string
											}
										</VSCodeButton>
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			</header>
			<main className="flex flex-1 min-h-0 flex-col overflow-hidden">
				{baseSurface ? (
					<div className="flex flex-1 min-h-0">
						<EndlessSurfaceCanvas surface={baseSurface} onSurfaceChange={handleCanvasSurfaceChange} />
					</div>
				) : (
					<div className="flex flex-1 items-center justify-center px-6 text-sm text-[var(--vscode-descriptionForeground)]">
						{
							t("common:brainstorm.empty", {
								defaultValue: "No surfaces yet. Start a new one to capture ideas.",
							}) as string
						}
					</div>
				)}
			</main>
		</div>
	)
}

export default BrainstormHubView
