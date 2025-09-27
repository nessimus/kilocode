import { useCallback, useEffect, useMemo, useState } from "react"
import {
	VSCodeButton,
	VSCodeDropdown,
	VSCodeOption,
	VSCodeTextArea,
	VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react"

import { MBTI_TYPES, type MbtiType, type WorkplaceCompany, type WorkplaceEmployee } from "@roo/golden/workplace"

import { useExtensionState } from "@/context/ExtensionStateContext"
import { useAppTranslation } from "@/i18n/TranslationContext"

import { Button } from "@/components/ui"
import { vscode } from "@/utils/vscode"
import { WorkforceCanvas } from "./WorkforceCanvas"

interface WorkforceViewProps {
	onDone: () => void
}

interface EmployeeFormState {
	name: string
	role: string
	mbtiType: MbtiType | ""
	traits: string
	description: string
	personality: string
	profileImageUrl: string
	customAttributes: string
	isExecutiveManager: boolean
}

const emptyCompanyForm = (company?: WorkplaceCompany) => ({
	name: company?.name ?? "",
	emoji: company?.emoji ?? "",
	description: company?.description ?? "",
	mission: company?.mission ?? "",
	vision: company?.vision ?? "",
})

const emptyEmployeeForm = (employee?: WorkplaceEmployee): EmployeeFormState => ({
	name: employee?.name ?? "",
	role: employee?.role ?? "",
	mbtiType: employee?.mbtiType ?? "",
	traits: employee?.personalityTraits?.join(", ") ?? "",
	description: employee?.description ?? "",
	personality: employee?.personality ?? "",
	profileImageUrl: employee?.profileImageUrl ?? "",
	customAttributes: employee?.customAttributes ? JSON.stringify(employee.customAttributes, null, 2) : "",
	isExecutiveManager: employee?.isExecutiveManager ?? false,
})

const parseAttributes = (value: string): Record<string, string> | undefined => {
	const trimmed = value.trim()
	if (!trimmed) return undefined

	try {
		const parsed = JSON.parse(trimmed)
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return Object.fromEntries(Object.entries(parsed).map(([key, val]) => [key, String(val)]))
		}
		throw new Error("Custom attributes must be a JSON object")
	} catch (error) {
		throw new Error(
			error instanceof Error
				? error.message
				: 'Unable to parse custom attributes. Please provide valid JSON (e.g. {"favorite_color": "blue"}).',
		)
	}
}

const parseTraits = (value: string): string[] | undefined => {
	const trimmed = value.trim()
	if (!trimmed) return undefined
	return value
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean)
}

const WorkforceView = ({ onDone }: WorkforceViewProps) => {
	const {
		workplaceState,
		createCompany,
		updateCompany,
		createEmployee,
		updateEmployee,
		createDepartment,
		createTeam,
		assignTeamToDepartment,
		assignEmployeeToTeam,
		removeEmployeeFromTeam,
		selectCompany,
		setActiveEmployee,
		updateDepartment,
		updateTeam,
		archiveDepartment,
		archiveTeam,
		archiveEmployee,
	} = useExtensionState()
	const { t } = useAppTranslation()

	const companies = useMemo(() => workplaceState?.companies ?? [], [workplaceState?.companies])
	const activeCompanyId = workplaceState?.activeCompanyId
	const activeEmployeeId = workplaceState?.activeEmployeeId

	const activeCompany = useMemo(
		() => companies.find((company) => company.id === activeCompanyId) ?? companies[0],
		[companies, activeCompanyId],
	)

	const [companyForm, setCompanyForm] = useState(() => emptyCompanyForm(activeCompany))
	const [employeeDraft, setEmployeeDraft] = useState<EmployeeFormState>(() => emptyEmployeeForm())
	const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>(activeEmployeeId)
	const [employeeForm, setEmployeeForm] = useState<EmployeeFormState>(() =>
		emptyEmployeeForm(activeCompany?.employees.find((emp) => emp.id === activeEmployeeId)),
	)
	const [companyError, setCompanyError] = useState<string | undefined>()
	const [employeeError, setEmployeeError] = useState<string | undefined>()
	const [customAttributesError, setCustomAttributesError] = useState<string | undefined>()
	const [structureFeedback, setStructureFeedback] = useState<string | undefined>()
	const [isCanvasFullscreen, setIsCanvasFullscreen] = useState(false)

	useEffect(() => {
		setCompanyForm(emptyCompanyForm(activeCompany))
	}, [activeCompany])

	useEffect(() => {
		setSelectedEmployeeId(activeEmployeeId)
		const employee = activeCompany?.employees.find((emp) => emp.id === activeEmployeeId)
		setEmployeeForm(emptyEmployeeForm(employee))
	}, [activeCompany, activeEmployeeId])

	useEffect(() => {
		const employee = activeCompany?.employees.find((emp) => emp.id === selectedEmployeeId)
		setEmployeeForm(emptyEmployeeForm(employee))
	}, [selectedEmployeeId, activeCompany])

	useEffect(() => {
		if (!isCanvasFullscreen) {
			return
		}
		const originalOverflow = document.body.style.overflow
		document.body.style.overflow = "hidden"
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setIsCanvasFullscreen(false)
			}
		}
		window.addEventListener("keydown", handleKeyDown)
		return () => {
			document.body.style.overflow = originalOverflow
			window.removeEventListener("keydown", handleKeyDown)
		}
	}, [isCanvasFullscreen])

	const openCanvasTab = useCallback(() => {
		vscode.postMessage({ type: "switchTab", tab: "workforce" })
	}, [])

	const handleUpdateDepartment = useCallback(
		(departmentId: string, updates: { name: string; description?: string }) => {
			if (!activeCompany) {
				return
			}
			const department = activeCompany.departments.find((entry) => entry.id === departmentId)
			if (!department) {
				return
			}
			updateDepartment({
				companyId: activeCompany.id,
				department: { ...department, name: updates.name, description: updates.description },
			})
		},
		[activeCompany, updateDepartment],
	)

	const handleUpdateTeam = useCallback(
		(teamId: string, updates: { name: string; description?: string }) => {
			if (!activeCompany) {
				return
			}
			const team = activeCompany.teams.find((entry) => entry.id === teamId)
			if (!team) {
				return
			}
			updateTeam({
				companyId: activeCompany.id,
				team: { ...team, name: updates.name, description: updates.description },
			})
		},
		[activeCompany, updateTeam],
	)

	const handleUpdateEmployee = useCallback(
		(employeeId: string, updates: { name: string; role: string; teamId?: string | null }) => {
			if (!activeCompany) {
				return
			}
			const employee = activeCompany.employees.find((entry) => entry.id === employeeId)
			if (!employee) {
				return
			}
			updateEmployee({
				companyId: activeCompany.id,
				employee: { ...employee, name: updates.name, role: updates.role },
			})
		},
		[activeCompany, updateEmployee],
	)

	const handleArchiveDepartment = useCallback(
		(departmentId: string) => {
			if (!activeCompany) {
				return
			}
			archiveDepartment({ companyId: activeCompany.id, departmentId })
		},
		[activeCompany, archiveDepartment],
	)

	const handleArchiveTeam = useCallback(
		(teamId: string) => {
			if (!activeCompany) {
				return
			}
			archiveTeam({ companyId: activeCompany.id, teamId })
		},
		[activeCompany, archiveTeam],
	)

	const handleArchiveEmployee = useCallback(
		(employeeId: string) => {
			if (!activeCompany) {
				return
			}
			archiveEmployee({ companyId: activeCompany.id, employeeId })
		},
		[activeCompany, archiveEmployee],
	)

	const handleInspectEmployee = useCallback(
		(employeeId: string) => {
			if (!activeCompany) {
				return
			}
			const employee = activeCompany.employees.find((entry) => entry.id === employeeId && !entry.deletedAt)
			if (!employee) {
				return
			}
			setSelectedEmployeeId(employeeId)
			setActiveEmployee(activeCompany.id, employeeId)
			setEmployeeForm(emptyEmployeeForm(employee))
		},
		[activeCompany, setActiveEmployee, setEmployeeForm],
	)

	const handleCompanySave = () => {
		setCompanyError(undefined)

		if (!activeCompany) {
			setCompanyError("Select a company to update.")
			return
		}

		if (!companyForm.name.trim()) {
			setCompanyError("Company name is required.")
			return
		}

		const emojiValue = companyForm.emoji.trim()
		const descriptionValue = companyForm.description.trim()
		updateCompany({
			id: activeCompany.id,
			name: companyForm.name.trim(),
			emoji: emojiValue ? emojiValue : "",
			description: descriptionValue ? descriptionValue : "",
			mission: companyForm.mission.trim() || undefined,
			vision: companyForm.vision.trim() || undefined,
			ownerProfile: activeCompany.ownerProfile,
		})
	}

	const handleCreateCompany = () => {
		setCompanyError(undefined)

		if (!companyForm.name.trim()) {
			setCompanyError("Company name is required.")
			return
		}

		const emojiValue = companyForm.emoji.trim()
		const descriptionValue = companyForm.description.trim()
		createCompany({
			name: companyForm.name.trim(),
			emoji: emojiValue ? emojiValue : undefined,
			description: descriptionValue ? descriptionValue : undefined,
			mission: companyForm.mission.trim() || undefined,
			vision: companyForm.vision.trim() || undefined,
		})

		setCompanyForm(emptyCompanyForm())
		setEmployeeDraft(emptyEmployeeForm())
	}

	const handleEmployeeSave = () => {
		if (!activeCompany || !selectedEmployeeId) {
			return
		}

		setEmployeeError(undefined)
		setCustomAttributesError(undefined)

		let customAttributes: Record<string, string> | undefined

		try {
			customAttributes = parseAttributes(employeeForm.customAttributes)
		} catch (error) {
			setCustomAttributesError(error instanceof Error ? error.message : String(error))
			return
		}

		const traits = parseTraits(employeeForm.traits)

		if (!employeeForm.name.trim()) {
			setEmployeeError("Employee name is required.")
			return
		}

		if (!employeeForm.role.trim()) {
			setEmployeeError("Employee role is required.")
			return
		}

		const employee = activeCompany.employees.find((emp) => emp.id === selectedEmployeeId)
		if (!employee) {
			setEmployeeError("Unable to locate employee.")
			return
		}

		updateEmployee({
			companyId: activeCompany.id,
			employee: {
				...employee,
				name: employeeForm.name.trim(),
				role: employeeForm.role.trim(),
				mbtiType: employeeForm.mbtiType ? (employeeForm.mbtiType as MbtiType) : undefined,
				personalityTraits: traits,
				description: employeeForm.description.trim() || undefined,
				personality: employeeForm.personality.trim() || undefined,
				profileImageUrl: employeeForm.profileImageUrl.trim() || undefined,
				customAttributes,
				isExecutiveManager: employeeForm.isExecutiveManager,
			},
		})
	}

	const handleEmployeeCreate = () => {
		if (!activeCompany) {
			setEmployeeError("Create or select a company first.")
			return
		}

		setEmployeeError(undefined)
		setCustomAttributesError(undefined)

		let customAttributes: Record<string, string> | undefined

		try {
			customAttributes = parseAttributes(employeeDraft.customAttributes)
		} catch (error) {
			setCustomAttributesError(error instanceof Error ? error.message : String(error))
			return
		}

		const traitList = parseTraits(employeeDraft.traits)

		if (!employeeDraft.name.trim() || !employeeDraft.role.trim()) {
			setEmployeeError("Name and role are required to create an employee.")
			return
		}

		createEmployee({
			companyId: activeCompany.id,
			name: employeeDraft.name.trim(),
			role: employeeDraft.role.trim(),
			mbtiType: employeeDraft.mbtiType ? (employeeDraft.mbtiType as MbtiType) : undefined,
			personalityTraits: traitList,
			description: employeeDraft.description.trim() || undefined,
			personality: employeeDraft.personality.trim() || undefined,
			profileImageUrl: employeeDraft.profileImageUrl.trim() || undefined,
			customAttributes,
			isExecutiveManager: employeeDraft.isExecutiveManager,
		})

		setEmployeeDraft(emptyEmployeeForm())
	}

	const handleSwitchToEmployee = (companyId: string, employeeId: string) => {
		selectCompany(companyId)
		setSelectedEmployeeId(employeeId)
		setActiveEmployee(companyId, employeeId)
	}

	const employees = activeCompany?.employees ?? []

	return (
		<div className="flex flex-col h-full">
			<header className="flex items-center justify-between border-b border-[var(--vscode-panel-border)] px-6 py-4">
				<div>
					<h1 className="text-lg font-semibold text-[var(--vscode-foreground)]">
						{t("workplace:hubTitle", { defaultValue: "Workforce Hub" })}
					</h1>
					<p className="text-sm text-[var(--vscode-descriptionForeground)]">
						{t("workplace:hubSubtitle", {
							defaultValue:
								"Design your company, refine personas, and choose who you collaborate with in chat.",
						})}
					</p>
				</div>
				<Button variant="secondary" onClick={onDone}>
					{t("common:done", { defaultValue: "Done" })}
				</Button>
			</header>

			<div className="flex-1 overflow-hidden px-6 py-4 space-y-6">
				<section className="border border-[var(--vscode-panel-border)] rounded-md p-4 space-y-3">
					<div className="flex items-start justify-between gap-3">
						<div>
							<h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
								{t("kilocode:workplace.structureCanvasHeading", { defaultValue: "Hierarchy canvas" })}
							</h2>
							<p className="text-xs text-[var(--vscode-descriptionForeground)] m-0">
								{t("kilocode:workplace.structureCanvasDescription", {
									defaultValue:
										"Right-click to add departments, teams, or employees, then drag to connect them.",
								})}
							</p>
						</div>
						<div className="workforce-canvas__header-actions">
							<button
								type="button"
								className="workspace-welcome__icon-button"
								onClick={() => setIsCanvasFullscreen(true)}
								title={t("kilocode:workplace.openCanvasFullscreen", {
									defaultValue: "View full screen",
								})}
								aria-label={t("kilocode:workplace.openCanvasFullscreen", {
									defaultValue: "View full screen",
								})}>
								<span className="codicon codicon-screen-full" aria-hidden="true" />
								<span className="sr-only">
									{t("kilocode:workplace.openCanvasFullscreen", { defaultValue: "View full screen" })}
								</span>
							</button>
							<button
								type="button"
								className="workspace-welcome__icon-button"
								onClick={openCanvasTab}
								title={t("kilocode:workplace.openStructureTab", { defaultValue: "Open structure tab" })}
								aria-label={t("kilocode:workplace.openStructureTab", {
									defaultValue: "Open structure tab",
								})}>
								<span className="codicon codicon-new-window" aria-hidden="true" />
								<span className="sr-only">
									{t("kilocode:workplace.openStructureTab", { defaultValue: "Open structure tab" })}
								</span>
							</button>
						</div>
					</div>
					<WorkforceCanvas
						company={activeCompany}
						onCreateDepartment={(name, description) =>
							activeCompany && createDepartment({ companyId: activeCompany.id, name, description })
						}
						onCreateTeam={(name, description, departmentId) =>
							activeCompany &&
							createTeam({
								companyId: activeCompany.id,
								name,
								description,
								departmentId,
							})
						}
						onCreateEmployee={(name, role) =>
							activeCompany && createEmployee({ companyId: activeCompany.id, name, role })
						}
						onAssignTeamToDepartment={(teamId, departmentId) =>
							activeCompany &&
							assignTeamToDepartment({ companyId: activeCompany.id, teamId, departmentId })
						}
						onAssignEmployeeToTeam={(teamId, employeeId) =>
							activeCompany && assignEmployeeToTeam({ companyId: activeCompany.id, teamId, employeeId })
						}
						onRemoveEmployeeFromTeam={(teamId, employeeId) =>
							activeCompany && removeEmployeeFromTeam({ companyId: activeCompany.id, teamId, employeeId })
						}
						onFeedback={(message) => setStructureFeedback(message)}
						onInspectEmployee={handleInspectEmployee}
						onUpdateDepartment={handleUpdateDepartment}
						onUpdateTeam={handleUpdateTeam}
						onUpdateEmployee={handleUpdateEmployee}
						onArchiveDepartment={handleArchiveDepartment}
						onArchiveTeam={handleArchiveTeam}
						onArchiveEmployee={handleArchiveEmployee}
					/>
					{structureFeedback && (
						<p className="text-xs text-[var(--vscode-descriptionForeground)] m-0">{structureFeedback}</p>
					)}
				</section>

				{isCanvasFullscreen && (
					<div
						className="workforce-canvas__fullscreen-overlay"
						role="dialog"
						aria-modal="true"
						aria-label={t("kilocode:workplace.structureCanvasHeading", {
							defaultValue: "Hierarchy canvas",
						})}>
						<div className="workforce-canvas__fullscreen-header">
							<div>
								<h2 className="workforce-canvas__fullscreen-title">
									{t("kilocode:workplace.structureCanvasHeading", {
										defaultValue: "Hierarchy canvas",
									})}
								</h2>
								<p className="workforce-canvas__fullscreen-subtitle">
									{t("kilocode:workplace.structureCanvasDescription", {
										defaultValue:
											"Right-click to add departments, teams, or employees, then drag to connect them.",
									})}
								</p>
							</div>
							<div className="workforce-canvas__header-actions">
								<button
									type="button"
									className="workspace-welcome__icon-button"
									onClick={() => setIsCanvasFullscreen(false)}
									title={t("kilocode:workplace.closeCanvasFullscreen", {
										defaultValue: "Exit full screen",
									})}
									aria-label={t("kilocode:workplace.closeCanvasFullscreen", {
										defaultValue: "Exit full screen",
									})}>
									<span className="codicon codicon-screen-normal" aria-hidden="true" />
									<span className="sr-only">
										{t("kilocode:workplace.closeCanvasFullscreen", {
											defaultValue: "Exit full screen",
										})}
									</span>
								</button>
							</div>
						</div>
						<div className="workforce-canvas__fullscreen-body">
							<WorkforceCanvas
								company={activeCompany}
								onCreateDepartment={(name, description) =>
									activeCompany &&
									createDepartment({ companyId: activeCompany.id, name, description })
								}
								onCreateTeam={(name, description, departmentId) =>
									activeCompany &&
									createTeam({
										companyId: activeCompany.id,
										name,
										description,
										departmentId,
									})
								}
								onCreateEmployee={(name, role) =>
									activeCompany && createEmployee({ companyId: activeCompany.id, name, role })
								}
								onAssignTeamToDepartment={(teamId, departmentId) =>
									activeCompany &&
									assignTeamToDepartment({ companyId: activeCompany.id, teamId, departmentId })
								}
								onAssignEmployeeToTeam={(teamId, employeeId) =>
									activeCompany &&
									assignEmployeeToTeam({ companyId: activeCompany.id, teamId, employeeId })
								}
								onRemoveEmployeeFromTeam={(teamId, employeeId) =>
									activeCompany &&
									removeEmployeeFromTeam({ companyId: activeCompany.id, teamId, employeeId })
								}
								onFeedback={(message) => setStructureFeedback(message)}
								onInspectEmployee={handleInspectEmployee}
								onUpdateDepartment={handleUpdateDepartment}
								onUpdateTeam={handleUpdateTeam}
								onUpdateEmployee={handleUpdateEmployee}
								onArchiveDepartment={handleArchiveDepartment}
								onArchiveTeam={handleArchiveTeam}
								onArchiveEmployee={handleArchiveEmployee}
								isFullscreen
							/>
						</div>
					</div>
				)}

				<div className="grid gap-6 md:grid-cols-[320px_1fr]">
					<section className="border border-[var(--vscode-panel-border)] rounded-md overflow-hidden flex flex-col">
						<div className="border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBarSectionHeader-background)] px-4 py-3">
							<h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
								{t("workplace:companies", { defaultValue: "Companies" })}
							</h2>
						</div>
						<div className="flex-1 overflow-y-auto">
							{companies.length === 0 && (
								<p className="p-4 text-xs text-[var(--vscode-descriptionForeground)]">
									{t("workplace:noCompanies", {
										defaultValue: "No companies yet. Create one below to get started.",
									})}
								</p>
							)}
							<ul className="m-0 p-0 list-none">
								{companies.map((company) => {
									const isActive = company.id === activeCompany?.id
									return (
										<li key={company.id}>
											<button
												onClick={() => selectCompany(company.id)}
												className={`w-full text-left px-4 py-3 border-b border-[var(--vscode-panel-border)] hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_85%,transparent)] ${
													isActive
														? "bg-[color-mix(in_srgb,var(--vscode-editor-background)_92%,transparent)]"
														: ""
												}`}
												style={{ color: "var(--vscode-foreground)", cursor: "pointer" }}>
												<div className="font-medium text-sm flex items-center gap-2">
													{company.emoji && (
														<span className="text-base leading-none" aria-hidden>
															{company.emoji}
														</span>
													)}
													<span className="truncate">{company.name}</span>
												</div>
												<div className="text-xs text-[var(--vscode-descriptionForeground)] truncate">
													{company.description ||
														company.mission ||
														company.vision ||
														t("workplace:companyPlaceholder", {
															defaultValue: "No mission yet.",
														})}
												</div>
											</button>
										</li>
									)
								})}
							</ul>
						</div>
						<div className="border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] px-4 py-4 space-y-2">
							<h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
								{t("workplace:createCompany", { defaultValue: "Create Company" })}
							</h3>
							<VSCodeTextField
								value={companyForm.emoji}
								onInput={(event: any) =>
									setCompanyForm((prev) => ({ ...prev, emoji: event.target.value }))
								}
								placeholder={t("workplace:companyEmojiPlaceholder", {
									defaultValue: "Emoji (optional)",
								})}
									maxlength={4}
							/>
							<VSCodeTextField
								value={companyForm.name}
								onInput={(event: any) =>
									setCompanyForm((prev) => ({ ...prev, name: event.target.value }))
								}
								placeholder={t("workplace:companyNamePlaceholder")}
							/>
							<VSCodeTextArea
								value={companyForm.description}
								onInput={(event: any) =>
									setCompanyForm((prev) => ({ ...prev, description: event.target.value }))
								}
								placeholder={t("workplace:companyDescriptionPlaceholder", {
									defaultValue: "Description (optional)",
								})}
								rows={3}
							/>
							<VSCodeTextField
								value={companyForm.mission}
								onInput={(event: any) =>
									setCompanyForm((prev) => ({ ...prev, mission: event.target.value }))
								}
								placeholder={t("workplace:companyMissionPlaceholder")}
							/>
							<VSCodeTextField
								value={companyForm.vision}
								onInput={(event: any) =>
									setCompanyForm((prev) => ({ ...prev, vision: event.target.value }))
								}
								placeholder={t("workplace:companyVisionPlaceholder", {
									defaultValue: "Vision (optional)",
								})}
							/>
							<div className="flex gap-2">
								<VSCodeButton appearance="primary" onClick={handleCreateCompany}>
									{t("workplace:createCompanyButton")}
								</VSCodeButton>
								{activeCompany && (
									<VSCodeButton appearance="secondary" onClick={handleCompanySave}>
										{t("workplace:updateCompanyButton", { defaultValue: "Save Changes" })}
									</VSCodeButton>
								)}
							</div>
							{companyError && (
								<p className="text-xs text-[var(--vscode-errorForeground)]">{companyError}</p>
							)}
						</div>
					</section>

					<section className="border border-[var(--vscode-panel-border)] rounded-md flex flex-col overflow-hidden">
						<div className="border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBarSectionHeader-background)] px-4 py-3 flex items-center justify-between">
							<div>
								<h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
									{t("workplace:employeesHeader", { company: activeCompany?.name ?? "" })}
								</h2>
								<p className="text-xs text-[var(--vscode-descriptionForeground)] m-0">
									{activeCompany
										? t("workplace:employeesSubheader", {
												defaultValue:
													"Select an employee to edit their persona or create a new teammate.",
											})
										: t("workplace:noCompanySelected", {
												defaultValue: "Select a company to manage employees.",
											})}
								</p>
							</div>
							<div className="flex gap-2 items-center">
								{activeCompany && (
									<VSCodeDropdown
										value={selectedEmployeeId}
										onChange={(event: any) => setSelectedEmployeeId(event.target.value)}
										className="min-w-[180px]">
										{employees.map((employee) => (
											<VSCodeOption key={employee.id} value={employee.id}>
												{employee.name}
											</VSCodeOption>
										))}
										{employees.length === 0 && (
											<VSCodeOption value="">{t("workplace:noEmployees")}</VSCodeOption>
										)}
									</VSCodeDropdown>
								)}
								{selectedEmployeeId && activeCompany && (
									<Button
										variant={
											selectedEmployeeId === (activeCompany.activeEmployeeId ?? activeEmployeeId)
												? "default"
												: "secondary"
										}
										onClick={() => handleSwitchToEmployee(activeCompany.id, selectedEmployeeId)}>
										{selectedEmployeeId === (activeCompany.activeEmployeeId ?? activeEmployeeId)
											? t("workplace:activePersona", { defaultValue: "Active in Chat" })
											: t("workplace:setActivePersona", {
													defaultValue: "Speak with this agent",
												})}
									</Button>
								)}
							</div>
						</div>

						<div className="grid gap-6 md:grid-cols-2 flex-1 overflow-y-auto p-4">
							<div className="space-y-3">
								<h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
									{t("workplace:editPersona", { defaultValue: "Edit Persona" })}
								</h3>
								{selectedEmployeeId && activeCompany ? (
									<div className="space-y-2">
										<VSCodeTextField
											value={employeeForm.name}
											onInput={(event: any) =>
												setEmployeeForm((prev) => ({ ...prev, name: event.target.value }))
											}
											placeholder={t("workplace:employeeNamePlaceholder")}
										/>
										<VSCodeTextField
											value={employeeForm.role}
											onInput={(event: any) =>
												setEmployeeForm((prev) => ({ ...prev, role: event.target.value }))
											}
											placeholder={t("workplace:employeeRolePlaceholder")}
										/>
										<VSCodeDropdown
											value={employeeForm.mbtiType}
											onChange={(event: any) =>
												setEmployeeForm((prev) => ({
													...prev,
													mbtiType: event.target.value as MbtiType | "",
												}))
											}
											className="w-full">
											<VSCodeOption value="">
												{t("workplace:mbtiPlaceholder", { defaultValue: "No MBTI selected" })}
											</VSCodeOption>
											{MBTI_TYPES.map((type) => (
												<VSCodeOption key={type} value={type}>
													{type}
												</VSCodeOption>
											))}
										</VSCodeDropdown>
										<VSCodeTextField
											value={employeeForm.traits}
											onInput={(event: any) =>
												setEmployeeForm((prev) => ({ ...prev, traits: event.target.value }))
											}
											placeholder={t("workplace:employeeTraitsPlaceholder", {
												defaultValue: "Strategic, calm, data-driven",
											})}
										/>
										<VSCodeTextField
											type="text"
											value={employeeForm.profileImageUrl}
											onInput={(event: any) =>
												setEmployeeForm((prev) => ({
													...prev,
													profileImageUrl: event.target.value,
												}))
											}
											placeholder={t("workplace:profileImagePlaceholder", {
												defaultValue: "Avatar URL (optional)",
											})}
										/>
										<VSCodeTextArea
											rows={3}
											value={employeeForm.description}
											onInput={(event: any) =>
												setEmployeeForm((prev) => ({
													...prev,
													description: event.target.value,
												}))
											}
											placeholder={t("workplace:employeeDescriptionPlaceholder", {
												defaultValue: "Job description",
											})}
										/>
										<VSCodeTextArea
											rows={3}
											value={employeeForm.personality}
											onInput={(event: any) =>
												setEmployeeForm((prev) => ({
													...prev,
													personality: event.target.value,
												}))
											}
											placeholder={t("workplace:employeePersonalityPlaceholder", {
												defaultValue: "Personality, tone, preferred workflows",
											})}
										/>
										<VSCodeTextArea
											rows={4}
											value={employeeForm.customAttributes}
											onInput={(event: any) =>
												setEmployeeForm((prev) => ({
													...prev,
													customAttributes: event.target.value,
												}))
											}
											placeholder={`{\n  "favorite_color": "blue"\n}`}
											className="font-mono"
										/>
										<div className="flex items-center gap-2">
											<input
												type="checkbox"
												checked={employeeForm.isExecutiveManager}
												onChange={(event) =>
													setEmployeeForm((prev) => ({
														...prev,
														isExecutiveManager: event.target.checked,
													}))
												}
											/>
											<span className="text-xs text-[var(--vscode-foreground)]">
												{t("workplace:markAsExecutive", { defaultValue: "Executive Manager" })}
											</span>
										</div>
										<div className="flex gap-2">
											<VSCodeButton appearance="primary" onClick={handleEmployeeSave}>
												{t("workplace:updateEmployeeButton", { defaultValue: "Save Persona" })}
											</VSCodeButton>
										</div>
										{employeeError && (
											<p className="text-xs text-[var(--vscode-errorForeground)]">
												{employeeError}
											</p>
										)}
										{customAttributesError && (
											<p className="text-xs text-[var(--vscode-errorForeground)]">
												{customAttributesError}
											</p>
										)}
									</div>
								) : (
									<p className="text-xs text-[var(--vscode-descriptionForeground)]">
										{t("workplace:noEmployeeSelected", {
											defaultValue: "Select an employee to edit their persona.",
										})}
									</p>
								)}
							</div>

							<div className="space-y-3">
								<h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
									{t("workplace:addEmployeeHeader")}
								</h3>
								<VSCodeTextField
									value={employeeDraft.name}
									onInput={(event: any) =>
										setEmployeeDraft((prev) => ({ ...prev, name: event.target.value }))
									}
									placeholder={t("workplace:employeeNamePlaceholder")}
								/>
								<VSCodeTextField
									value={employeeDraft.role}
									onInput={(event: any) =>
										setEmployeeDraft((prev) => ({ ...prev, role: event.target.value }))
									}
									placeholder={t("workplace:employeeRolePlaceholder")}
								/>
								<VSCodeDropdown
									value={employeeDraft.mbtiType}
									onChange={(event: any) =>
										setEmployeeDraft((prev) => ({
											...prev,
											mbtiType: event.target.value as MbtiType | "",
										}))
									}
									className="w-full">
									<VSCodeOption value="">
										{t("workplace:mbtiPlaceholder", { defaultValue: "No MBTI selected" })}
									</VSCodeOption>
									{MBTI_TYPES.map((type) => (
										<VSCodeOption key={type} value={type}>
											{type}
										</VSCodeOption>
									))}
								</VSCodeDropdown>
								<VSCodeTextField
									value={employeeDraft.traits}
									onInput={(event: any) =>
										setEmployeeDraft((prev) => ({ ...prev, traits: event.target.value }))
									}
									placeholder={t("workplace:employeeTraitsPlaceholder", {
										defaultValue: "Visionary, empathetic",
									})}
								/>
								<VSCodeTextArea
									rows={3}
									value={employeeDraft.description}
									onInput={(event: any) =>
										setEmployeeDraft((prev) => ({ ...prev, description: event.target.value }))
									}
									placeholder={t("workplace:employeeDescriptionPlaceholder", {
										defaultValue: "Job description",
									})}
								/>
								<VSCodeTextArea
									rows={3}
									value={employeeDraft.personality}
									onInput={(event: any) =>
										setEmployeeDraft((prev) => ({ ...prev, personality: event.target.value }))
									}
									placeholder={t("workplace:employeePersonalityPlaceholder", {
										defaultValue: "Persona, tone, decision style",
									})}
								/>
								<VSCodeTextArea
									rows={4}
									value={employeeDraft.customAttributes}
									onInput={(event: any) =>
										setEmployeeDraft((prev) => ({ ...prev, customAttributes: event.target.value }))
									}
									placeholder={`{\n  "workspace": "research"\n}`}
									className="font-mono"
								/>
								<div className="flex items-center gap-2">
									<input
										type="checkbox"
										checked={employeeDraft.isExecutiveManager}
										onChange={(event) =>
											setEmployeeDraft((prev) => ({
												...prev,
												isExecutiveManager: event.target.checked,
											}))
										}
									/>
									<span className="text-xs text-[var(--vscode-foreground)]">
										{t("workplace:markAsExecutive", { defaultValue: "Executive Manager" })}
									</span>
								</div>
								<VSCodeButton appearance="secondary" onClick={handleEmployeeCreate}>
									{t("workplace:addEmployeeButton")}
								</VSCodeButton>
								{employeeError && (
									<p className="text-xs text-[var(--vscode-errorForeground)]">{employeeError}</p>
								)}
								{customAttributesError && (
									<p className="text-xs text-[var(--vscode-errorForeground)]">
										{customAttributesError}
									</p>
								)}
							</div>
						</div>
					</section>
				</div>
			</div>
		</div>
	)
}

export default WorkforceView
