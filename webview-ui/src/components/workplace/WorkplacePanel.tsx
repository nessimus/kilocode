import { useMemo, useState } from "react"
import { VSCodeButton, VSCodeTextField, VSCodeDropdown, VSCodeOption, VSCodeTextArea } from "@vscode/webview-ui-toolkit/react"

import type { WorkplaceEmployee } from "@roo/golden/workplace"
import { TOOL_GROUPS, TOOL_DISPLAY_NAMES, ALWAYS_AVAILABLE_TOOLS } from "@roo/tools"
import { getModeBySlug, getGroupName, defaultModeSlug } from "@roo/modes"
import type { ToolGroup, ToolName } from "@roo-code/types"

import { useExtensionState } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"

const EMPTY_COMPANY_STATE = {
	companies: [] as any[],
	activeCompanyId: undefined as string | undefined,
	ownerProfileDefaults: undefined,
}

type ToolChip = {
	name: ToolName
	label: string
}

type ToolkitGroup = {
	key: ToolGroup
	title: string
	description: string
	tools: ToolChip[]
}

type EmployeeToolkitSummary = {
	groups: ToolkitGroup[]
	alwaysAvailable: ToolChip[]
	sourceLabel: string
}

const TOOL_GROUP_KEYS = Object.keys(TOOL_GROUPS) as ToolGroup[]
const TOOL_NAME_KEYS = Object.keys(TOOL_DISPLAY_NAMES) as ToolName[]

const TOOL_GROUP_DETAILS: Record<ToolGroup, { title: string; description: string }> = {
	read: {
		title: "Research & Read",
		description: "Access files, search the workspace, and gather context.",
	},
	edit: {
		title: "Build & Edit",
		description: "Apply changes, produce content, and manage workplace records.",
	},
	browser: {
		title: "In-App Browser",
		description: "Open pages in the built-in browser for deeper research.",
	},
	web: {
		title: "Web Search",
		description: "Run internet searches to pull in fresh information.",
	},
	command: {
		title: "Command Line",
		description: "Execute terminal commands directly in the project.",
	},
	mcp: {
		title: "MCP Integrations",
		description: "Use Model Context Protocol tools connected to the workspace.",
	},
	modes: {
		title: "Mode Controls",
		description: "Switch personas or kick off new tasks on demand.",
	},
}

const isToolGroup = (value: string): value is ToolGroup => TOOL_GROUP_KEYS.includes(value as ToolGroup)

const isToolName = (value: string): value is ToolName => TOOL_NAME_KEYS.includes(value as ToolName)

const formatToolLabel = (tool: ToolName): string =>
	TOOL_DISPLAY_NAMES[tool] ?? tool.replace(/_/g, " ")

const dedupe = <T,>(items: readonly T[]): T[] => Array.from(new Set(items))

const groupFromMode = (modeSlug: string | undefined): ToolGroup[] => {
	if (!modeSlug) {
		return []
	}
	const mode = getModeBySlug(modeSlug)
	if (!mode) {
		return []
	}
	return dedupe(mode.groups.map((entry) => getGroupName(entry))).filter((group): group is ToolGroup =>
		isToolGroup(group),
	)
}

const resolveEmployeeToolkit = (employee: WorkplaceEmployee): EmployeeToolkitSummary => {
	const personaMode = employee.personaMode
	const normalizeGroups = (groups?: readonly string[]): ToolGroup[] => {
		if (!groups?.length) {
			return []
		}
		return dedupe(
			groups
				.map((group) => group.toLowerCase())
				.filter(isToolGroup),
		)
	}

	let resolvedGroups: ToolGroup[] = []
	let sourceLabel = "Default toolkit"

	if (personaMode?.allowedToolGroups?.length) {
		resolvedGroups = normalizeGroups(personaMode.allowedToolGroups)
		sourceLabel = "Custom toolkit"
	} else if (personaMode?.baseModeSlug) {
		resolvedGroups = groupFromMode(personaMode.baseModeSlug)
		const baseMode = getModeBySlug(personaMode.baseModeSlug)
		sourceLabel = baseMode?.name ? `${baseMode.name} mode toolkit` : `${personaMode.baseModeSlug} mode`
	}

	if (!resolvedGroups.length) {
		const defaultMode = getModeBySlug(defaultModeSlug)
		resolvedGroups = groupFromMode(defaultModeSlug)
		sourceLabel = defaultMode?.name ? `${defaultMode.name} mode toolkit` : "Default toolkit"
	}

	const groupToolNames = new Set<ToolName>()
	const groups = resolvedGroups.map((group) => {
		const groupDetails = TOOL_GROUP_DETAILS[group]
		const tools = (TOOL_GROUPS[group]?.tools ?? [])
			.map((tool) => tool as string)
			.filter(isToolName)
			.map((tool) => {
				const entry = { name: tool, label: formatToolLabel(tool) }
				groupToolNames.add(tool)
				return entry
			})
		return {
			key: group,
			title: groupDetails?.title ?? group,
			description: groupDetails?.description ?? "",
			tools,
		}
	})

	const alwaysAvailable = ALWAYS_AVAILABLE_TOOLS.filter((tool) => !groupToolNames.has(tool)).map((tool) => ({
		name: tool,
		label: formatToolLabel(tool),
	}))

	return {
		groups,
		alwaysAvailable,
		sourceLabel,
	}
}

const WorkplacePanel = () => {
	const { workplaceState, createCompany, createEmployee, selectCompany, setShowWelcome } = useExtensionState()

	const [companyName, setCompanyName] = useState("")
	const [companyEmoji, setCompanyEmoji] = useState("")
	const [companyDescription, setCompanyDescription] = useState("")
	const [companyMission, setCompanyMission] = useState("")
	const [employeeName, setEmployeeName] = useState("")
	const [employeeRole, setEmployeeRole] = useState("")

	const state = workplaceState ?? EMPTY_COMPANY_STATE
	const activeCompany = useMemo(() => {
		if (!state.companies.length) return undefined
		return state.companies.find((company) => company.id === state.activeCompanyId) ?? state.companies[0]
	}, [state])

	const handleCreateCompany = () => {
		if (!companyName.trim()) {
			return
		}
		const trimmedName = companyName.trim()
		const trimmedEmoji = companyEmoji.trim()
		const trimmedDescription = companyDescription.trim()
		const trimmedMission = companyMission.trim()
		createCompany({
			name: trimmedName,
			emoji: trimmedEmoji ? trimmedEmoji : undefined,
			description: trimmedDescription ? trimmedDescription : undefined,
			mission: trimmedMission || undefined,
		})
		setCompanyName("")
		setCompanyEmoji("")
		setCompanyDescription("")
		setCompanyMission("")
		setShowWelcome(false)
	}

	const handleCreateEmployee = () => {
		if (!activeCompany) return
		if (!employeeName.trim() || !employeeRole.trim()) return
		createEmployee({
			companyId: activeCompany.id,
			name: employeeName.trim(),
			role: employeeRole.trim(),
		})
		setEmployeeName("")
		setEmployeeRole("")
		setShowWelcome(false)
	}

	const handleSelectCompany = (companyId: string) => {
		selectCompany(companyId)
		setShowWelcome(false)
	}

	const openWorkforceHub = () => {
		setShowWelcome(false)
		vscode.postMessage({ type: "switchTab", tab: "profile" })
	}

	const openActionWorkspace = () => {
		setShowWelcome(false)
		vscode.postMessage({ type: "switchTab", tab: "workspace" })
	}

	return (
		<div className="workplace-panel rounded-lg border border-[var(--vscode-editorGroup-border)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_85%,transparent)] shadow-sm">
			<div className="px-5 py-4 border-b border-[var(--vscode-editorGroup-border)] flex items-center justify-between gap-3">
				<div>
					<h3 className="text-base font-semibold text-[var(--vscode-foreground)] mb-1">
						Build Your Workforce
					</h3>
					<p className="text-sm text-[var(--vscode-descriptionForeground)] m-0">
						Create your company, invite teammates, and choose who leads conversations.
					</p>
				</div>
				{state.companies.length > 0 && (
					<div className="flex items-center gap-2">
						<VSCodeDropdown
							value={activeCompany?.id}
							onChange={(event: any) => handleSelectCompany(event.target.value as string)}
							className="min-w-[180px]">
							{state.companies.map((company) => (
				<VSCodeOption key={company.id} value={company.id}>
					{company.emoji ? `${company.emoji} ${company.name}` : company.name}
				</VSCodeOption>
				))}
			</VSCodeDropdown>
						<VSCodeButton appearance="secondary" onClick={openWorkforceHub}>
							Open Workforce Hub
						</VSCodeButton>
						<VSCodeButton appearance="primary" onClick={openActionWorkspace}>
							Open Action Workspace
						</VSCodeButton>
					</div>
				)}
			</div>

			<div className="grid gap-6 px-5 py-4">
				<div className="grid gap-3">
					<h4 className="text-sm font-semibold text-[var(--vscode-foreground)] uppercase tracking-wide">
						Company Profile
					</h4>
					<div className="grid gap-2 sm:grid-cols-2">
						<VSCodeTextField
							value={companyName}
							onInput={(event: any) => setCompanyName(event.target.value)}
							placeholder="Company name"
						/>
							<VSCodeTextField
								value={companyEmoji}
								onInput={(event: any) => setCompanyEmoji(event.target.value)}
								placeholder="Emoji (optional)"
								maxlength={4}
								className="sm:max-w-[120px]"
							/>
						<VSCodeTextArea
							value={companyDescription}
							onInput={(event: any) => setCompanyDescription(event.target.value)}
							placeholder="Description (optional)"
							rows={3}
							className="sm:col-span-2"
						/>
						<VSCodeTextField
							value={companyMission}
							onInput={(event: any) => setCompanyMission(event.target.value)}
							placeholder="Mission (optional)"
						/>
					</div>
					<VSCodeButton appearance="primary" onClick={handleCreateCompany}>
						{state.companies.length ? "Add another company" : "Create company"}
					</VSCodeButton>
				</div>

				{activeCompany && (
					<div className="grid gap-5">
						<div>
							<h4 className="text-sm font-semibold text-[var(--vscode-foreground)] uppercase tracking-wide mb-2">
								Team Members
							</h4>
							<div className="grid gap-2">
								{activeCompany.employees.length > 0 ? (
									activeCompany.employees.map((employee) => {
										const toolkit = resolveEmployeeToolkit(employee as WorkplaceEmployee)
										return (
											<div
												key={employee.id}
												className="rounded-md border border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_55%,transparent)] px-3 py-3 space-y-3">
												<div className="flex items-start justify-between gap-3">
													<div>
														<p className="text-sm font-medium text-[var(--vscode-foreground)] m-0">
															{employee.name}
														</p>
														<p className="text-xs text-[var(--vscode-descriptionForeground)] m-0">
															{employee.role}
															{employee.isExecutiveManager && (
																<span className="ml-1 text-[var(--vscode-textLink-foreground)]">
																	Executive Manager
																</span>
															)}
														</p>
													</div>
													<span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
														{toolkit.sourceLabel}
													</span>
												</div>
												<div className="space-y-2">
													{toolkit.groups.map((group) => (
														<div key={group.key} className="space-y-1">
															<div className="flex items-center gap-2">
																<span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
																	{group.title}
																</span>
															</div>
															{group.description && (
																<p className="text-xs text-[var(--vscode-descriptionForeground)] m-0">
																	{group.description}
																</p>
															)}
															{group.tools.length > 0 && (
																<div className="flex flex-wrap gap-1">
																	{group.tools.map((tool) => (
																		<span
																			key={tool.name}
																			className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--vscode-badge-background)_50%,transparent)] bg-[color-mix(in_srgb,var(--vscode-badge-background)_20%,transparent)] px-2 py-[2px] text-[10px] font-medium uppercase tracking-wide text-[var(--vscode-badge-foreground)]">
																			{tool.label}
																		</span>
																	))}
																</div>
															)}
														</div>
													))}
													{toolkit.alwaysAvailable.length > 0 && (
														<div className="space-y-1">
															<span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
																Always available
															</span>
															<div className="flex flex-wrap gap-1">
																{toolkit.alwaysAvailable.map((tool) => (
																	<span
																		key={tool.name}
																		className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--vscode-panel-border)_60%,transparent)] bg-[color-mix(in_srgb,var(--vscode-panel-border)_20%,transparent)] px-2 py-[2px] text-[10px] font-medium uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
																		{tool.label}
																	</span>
																))}
															</div>
														</div>
													)}
												</div>
											</div>
										)
									})
								) : (
									<p className="text-xs text-[var(--vscode-descriptionForeground)] italic m-0">
										No teammates yet. Add one below.
									</p>
								)}
							</div>
						</div>

						<div className="grid gap-2">
							<h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
								Invite a teammate
							</h4>
							<div className="grid gap-2 sm:grid-cols-2">
								<VSCodeTextField
									value={employeeName}
									onInput={(event: any) => setEmployeeName(event.target.value)}
									placeholder="Name"
								/>
								<VSCodeTextField
									value={employeeRole}
									onInput={(event: any) => setEmployeeRole(event.target.value)}
									placeholder="Role"
								/>
							</div>
							<VSCodeButton appearance="secondary" onClick={handleCreateEmployee}>
								Add teammate
							</VSCodeButton>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

export default WorkplacePanel
