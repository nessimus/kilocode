import { useMemo, useState } from "react"
import { VSCodeButton, VSCodeTextField, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"

import { useExtensionState } from "@src/context/ExtensionStateContext"
import { useAppTranslation } from "@src/i18n/TranslationContext"

const EMPTY_COMPANY_STATE = { companies: [] as any[], activeCompanyId: undefined as string | undefined }

const WorkplacePanel = () => {
	const { workplaceState, createCompany, createEmployee, selectCompany } = useExtensionState()
	const { t } = useAppTranslation()

	const [companyName, setCompanyName] = useState("")
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
		createCompany({ name: companyName.trim(), mission: companyMission.trim() || undefined })
		setCompanyName("")
		setCompanyMission("")
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
	}

	return (
		<div className="workplace-panel rounded-lg border border-[var(--vscode-editorGroup-border)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_85%,transparent)] shadow-sm">
			<div className="px-5 py-4 border-b border-[var(--vscode-editorGroup-border)] flex items-center justify-between gap-3">
				<div>
					<h3 className="text-base font-semibold text-[var(--vscode-foreground)] mb-1">
						{t("workplace:title")}
					</h3>
					<p className="text-sm text-[var(--vscode-descriptionForeground)] m-0">{t("workplace:subtitle")}</p>
				</div>
				{state.companies.length > 0 && (
					<VSCodeDropdown
						value={activeCompany?.id}
						onChange={(event: any) => selectCompany(event.target.value as string)}
						className="min-w-[180px]">
						{state.companies.map((company) => (
							<VSCodeOption key={company.id} value={company.id}>
								{company.name}
							</VSCodeOption>
						))}
					</VSCodeDropdown>
				)}
			</div>

			<div className="grid gap-6 px-5 py-4">
				{state.companies.length === 0 && (
					<div className="grid gap-3">
						<p className="text-sm text-[var(--vscode-descriptionForeground)]">
							{t("workplace:createCompanyHint")}
						</p>
						<div className="grid gap-2 sm:grid-cols-2">
							<VSCodeTextField
								value={companyName}
								onInput={(event: any) => setCompanyName(event.target.value)}
								placeholder={t("workplace:companyNamePlaceholder")}
							/>
							<VSCodeTextField
								value={companyMission}
								onInput={(event: any) => setCompanyMission(event.target.value)}
								placeholder={t("workplace:companyMissionPlaceholder")}
							/>
						</div>
						<VSCodeButton appearance="primary" onClick={handleCreateCompany}>
							{t("workplace:createCompanyButton")}
						</VSCodeButton>
					</div>
				)}

				{activeCompany && (
					<div className="grid gap-5">
						<div>
							<h4 className="text-sm font-semibold text-[var(--vscode-foreground)] uppercase tracking-wide mb-2">
								{t("workplace:employeesHeader", { company: activeCompany.name })}
							</h4>
							<div className="grid gap-2">
								{activeCompany.employees.map((employee) => (
									<div
										key={employee.id}
										className="flex items-center justify-between rounded-md border border-[color-mix(in_srgb,var(--primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_60%,transparent)] px-3 py-2">
										<div>
											<p className="text-sm font-medium text-[var(--vscode-foreground)] m-0">
												{employee.name}
											</p>
											<p className="text-xs text-[var(--vscode-descriptionForeground)] m-0">
												{employee.role}
												{employee.isExecutiveManager && (
													<span className="ml-1 text-[var(--vscode-textLink-foreground)]">
														{t("workplace:executiveManagerTag")}
													</span>
												)}
											</p>
										</div>
									</div>
								))}
								{activeCompany.employees.length === 0 && (
									<p className="text-xs text-[var(--vscode-descriptionForeground)] italic m-0">
										{t("workplace:noEmployees")}
									</p>
								)}
							</div>
						</div>

						<div className="grid gap-2">
							<h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
								{t("workplace:addEmployeeHeader")}
							</h4>
							<div className="grid gap-2 sm:grid-cols-2">
								<VSCodeTextField
									value={employeeName}
									onInput={(event: any) => setEmployeeName(event.target.value)}
									placeholder={t("workplace:employeeNamePlaceholder")}
								/>
								<VSCodeTextField
									value={employeeRole}
									onInput={(event: any) => setEmployeeRole(event.target.value)}
									placeholder={t("workplace:employeeRolePlaceholder")}
								/>
							</div>
							<VSCodeButton appearance="secondary" onClick={handleCreateEmployee}>
								{t("workplace:addEmployeeButton")}
							</VSCodeButton>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

export default WorkplacePanel
