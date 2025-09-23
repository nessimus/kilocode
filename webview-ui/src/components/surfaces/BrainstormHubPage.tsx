import React, { useMemo } from "react"
import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import { useAppTranslation } from "@/i18n/TranslationContext"

import type { BrainstormSurfaceSummary } from "./types"

interface BrainstormHubPageProps {
	surfaces: BrainstormSurfaceSummary[]
	searchTerm: string
	onSearchChange: (term: string) => void
	onCreateSurface: () => void
	onOpenSurface: (surfaceId: string) => void
}

const BrainstormHubPage: React.FC<BrainstormHubPageProps> = ({
	surfaces,
	searchTerm,
	onSearchChange,
	onCreateSurface,
	onOpenSurface,
}) => {
	const { t } = useAppTranslation()

	const filteredSurfaces = useMemo(() => {
		if (!searchTerm.trim()) {
			return surfaces
		}
		const query = searchTerm.trim().toLowerCase()
		return surfaces.filter((surface) => {
			const haystack = `${surface.title} ${surface.description ?? ""} ${surface.owner ?? ""}`
			return haystack.toLowerCase().includes(query)
		})
	}, [surfaces, searchTerm])

	return (
		<div className="flex h-full flex-col bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]">
			<header className="border-b border-[var(--vscode-panel-border)] px-6 py-5">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
					<div className="space-y-1.5">
						<h1 className="text-2xl font-semibold tracking-tight">
							{t("common:brainstorm.title", { defaultValue: "Brainstorm Hub" }) as string}
						</h1>
						<p className="max-w-xl text-sm text-[var(--vscode-descriptionForeground)]">
							{
								t("common:brainstorm.subtitle", {
									defaultValue:
										"A calm place for Endless Surfaces—sketch roadmaps, map systems, and keep your best ideas in flow.",
								}) as string
							}
						</p>
					</div>
					<VSCodeButton appearance="primary" onClick={onCreateSurface}>
						{t("common:brainstorm.create", { defaultValue: "New Endless Surface" }) as string}
					</VSCodeButton>
				</div>
				<div className="mt-4 max-w-md">
					<VSCodeTextField
						value={searchTerm}
						onInput={(event) => onSearchChange((event.target as HTMLInputElement).value)}
						placeholder={
							t("common:brainstorm.searchPlaceholder", { defaultValue: "Search surfaces" }) as string
						}
						className="w-full"></VSCodeTextField>
				</div>
			</header>
			<div className="flex-1 overflow-y-auto px-6 py-6">
				{filteredSurfaces.length === 0 ? (
					<div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--vscode-descriptionForeground)_20%,transparent_80%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,rgba(255,255,255,0.08)_8%)] p-8 text-center">
						<span className="text-base font-medium">
							{
								t("common:brainstorm.empty", {
									defaultValue: "No surfaces yet. Start a new one to capture ideas.",
								}) as string
							}
						</span>
						<VSCodeButton onClick={onCreateSurface}>
							{t("common:brainstorm.create", { defaultValue: "New Endless Surface" }) as string}
						</VSCodeButton>
					</div>
				) : (
					<ul className="grid gap-4 lg:grid-cols-2">
						{filteredSurfaces.map((surface) => (
							<li key={surface.id}>
								<button
									onClick={() => onOpenSurface(surface.id)}
									className="group flex w-full flex-col gap-3 rounded-lg border border-[color-mix(in_srgb,var(--vscode-panel-border)_80%,transparent_20%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_96%,rgba(255,255,255,0.05)_4%)] px-5 py-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-colors hover:border-[var(--vscode-focusBorder)] hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,rgba(255,255,255,0.08)_8%)]">
									<div className="flex items-start justify-between gap-3">
										<div className="flex items-start gap-3">
											<div className="flex h-8 w-8 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--vscode-panel-border)_70%,transparent_30%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_94%,rgba(255,255,255,0.08)_6%)] text-lg">
												<span aria-hidden>{surface.emoji ?? "🧠"}</span>
											</div>
											<div className="space-y-1">
												<h2 className="text-base font-semibold leading-tight group-hover:text-[var(--vscode-editorForeground)]">
													{surface.title}
												</h2>
												{surface.description && (
													<p className="text-sm text-[var(--vscode-descriptionForeground)] line-clamp-2">
														{surface.description}
													</p>
												)}
											</div>
										</div>
										{surface.tags && surface.tags.length > 0 && (
											<div className="flex flex-wrap justify-end gap-1">
												{surface.tags.map((tag) => (
													<span
														key={tag}
														className="rounded-full border border-[color-mix(in_srgb,var(--vscode-descriptionForeground)_40%,transparent_60%)] px-2 py-0.5 text-xs uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
														{tag}
													</span>
												))}
											</div>
										)}
									</div>
									<div className="flex flex-wrap items-center gap-3 text-xs text-[var(--vscode-descriptionForeground)]">
										<span>
											{
												t("common:brainstorm.lastUpdated", {
													defaultValue: "Updated {{time}}",
													time: new Date(surface.updatedAt).toLocaleString(),
												}) as string
											}
										</span>
										{surface.owner && (
											<span className="text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_80%,transparent_20%)]">
												· {surface.owner}
											</span>
										)}
									</div>
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	)
}

export default BrainstormHubPage
