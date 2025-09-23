import { useEffect, useMemo, useState } from "react"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"

import { MBTI_TYPES, type MbtiType, type WorkplaceCompany, type WorkplaceEmployee } from "@roo/golden/workplace"

import { useExtensionState } from "@/context/ExtensionStateContext"
import { useAppTranslation } from "@/i18n/TranslationContext"
import {
	Button,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Textarea,
} from "@/components/ui"

const MBTI_PLACEHOLDER_VALUE = "__mbti_placeholder__"

interface EmployeeFormState {
	name: string
	role: string
	mbtiType: MbtiType | ""
	traits: string
	personality: string
	description: string
}

const buildEmployeeFormState = (employee?: WorkplaceEmployee): EmployeeFormState => ({
	name: employee?.name ?? "",
	role: employee?.role ?? "",
	mbtiType: employee?.mbtiType ?? "",
	traits: employee?.personalityTraits?.join(", ") ?? "",
	personality: employee?.personality ?? "",
	description: employee?.description ?? "",
})

const parseTraitsInput = (value: string): string[] | undefined => {
	const traits = value
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean)
	return traits.length ? traits : undefined
}

interface HubEmployeeManagerProps {
	company?: WorkplaceCompany
}

export const HubEmployeeManager: React.FC<HubEmployeeManagerProps> = ({ company }) => {
	const { t } = useAppTranslation()
	const { updateEmployee } = useExtensionState()

	const employees = useMemo(() => company?.employees ?? [], [company?.employees])
	const [isOpen, setIsOpen] = useState(false)
	const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>(undefined)
	const [formState, setFormState] = useState<EmployeeFormState>(() => buildEmployeeFormState())
	const [validationMessage, setValidationMessage] = useState<string | undefined>()

	const manageEmployeesLabel = t("common:hub.manageEmployees", { defaultValue: "Manage employees" }) as string
	const chooseTeammateLabel = t("common:hub.employeeSelectionLabel", { defaultValue: "Choose teammate" }) as string
	const nameLabel = t("common:hub.employeeNameLabel", { defaultValue: "Name" }) as string
	const roleLabel = t("common:hub.employeeRoleLabel", { defaultValue: "Role" }) as string
	const mbtiLabel = t("common:hub.employeeMbtiLabel", { defaultValue: "MBTI type" }) as string
	const traitsLabel = t("common:hub.employeeTraitsLabel", { defaultValue: "Signature traits" }) as string
	const personalityLabel = t("common:hub.employeePersonalityLabel", { defaultValue: "Working style" }) as string
	const descriptionLabel = t("common:hub.employeeDescriptionLabel", { defaultValue: "Job description" }) as string
	const saveChangesLabel = t("common:hub.employeeSave", { defaultValue: "Save changes" }) as string
	const validationLabel = t("common:hub.employeeValidation", {
		defaultValue: "Name and role are required to update this teammate.",
	}) as string
	const noEmployeesLabel = t("common:hub.manageEmployeesEmpty", {
		defaultValue: "Add employees to your workspace first.",
	}) as string

	useEffect(() => {
		setSelectedEmployeeId((previous) => {
			if (!employees.length) {
				return undefined
			}
			if (previous && employees.some((employee) => employee.id === previous)) {
				return previous
			}
			return employees[0]?.id
		})
	}, [employees])

	useEffect(() => {
		const employee = employees.find((entry) => entry.id === selectedEmployeeId)
		setFormState(buildEmployeeFormState(employee))
		setValidationMessage(undefined)
	}, [selectedEmployeeId, employees])

	useEffect(() => {
		if (!isOpen) {
			setValidationMessage(undefined)
		}
	}, [isOpen])

	const selectedEmployee = useMemo(
		() => employees.find((entry) => entry.id === selectedEmployeeId),
		[employees, selectedEmployeeId],
	)

	const handleSave = () => {
		if (!company || !selectedEmployee) {
			return
		}

		const trimmedName = formState.name.trim()
		const trimmedRole = formState.role.trim()

		if (!trimmedName || !trimmedRole) {
			setValidationMessage(validationLabel)
			return
		}

		updateEmployee({
			companyId: company.id,
			employee: {
				...selectedEmployee,
				name: trimmedName,
				role: trimmedRole,
				mbtiType: formState.mbtiType || undefined,
				personalityTraits: parseTraitsInput(formState.traits),
				personality: formState.personality.trim() || undefined,
				description: formState.description.trim() || undefined,
			},
		})

		setIsOpen(false)
	}

	return (
		<div className="flex flex-col gap-2">
			<VSCodeButton appearance="secondary" onClick={() => setIsOpen(true)} disabled={!employees.length}>
				{manageEmployeesLabel}
			</VSCodeButton>
			{!employees.length && (
				<p className="text-xs text-[var(--vscode-descriptionForeground)]">{noEmployeesLabel}</p>
			)}

			<Dialog open={isOpen} onOpenChange={(open) => setIsOpen(open)}>
				<DialogContent className="max-w-xl">
					<DialogHeader>
						<DialogTitle>
							{t("common:hub.editEmployeeTitle", { defaultValue: "Edit teammate profile" })}
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						<Select
							value={selectedEmployeeId ?? ""}
							onValueChange={(value) => setSelectedEmployeeId(value || undefined)}
							disabled={!employees.length}>
							<SelectTrigger>
								<SelectValue placeholder={chooseTeammateLabel} />
							</SelectTrigger>
							<SelectContent>
								{employees.map((employee) => (
									<SelectItem key={employee.id} value={employee.id}>
										{employee.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<div className="grid gap-3 md:grid-cols-2">
							<div className="flex flex-col gap-2">
								<label className="text-sm font-medium text-[var(--vscode-foreground)]">
									{nameLabel}
								</label>
								<Input
									value={formState.name}
									onChange={(event) =>
										setFormState((prev) => ({ ...prev, name: event.target.value }))
									}
									placeholder="Jordan Ops"
								/>
							</div>
							<div className="flex flex-col gap-2">
								<label className="text-sm font-medium text-[var(--vscode-foreground)]">
									{roleLabel}
								</label>
								<Input
									value={formState.role}
									onChange={(event) =>
										setFormState((prev) => ({ ...prev, role: event.target.value }))
									}
									placeholder="Lifecycle Specialist"
								/>
							</div>
						</div>

						<div className="grid gap-3 md:grid-cols-2">
							<div className="flex flex-col gap-2">
								<label className="text-sm font-medium text-[var(--vscode-foreground)]">
									{mbtiLabel}
								</label>
								<Select
									value={formState.mbtiType || MBTI_PLACEHOLDER_VALUE}
									onValueChange={(value) =>
										setFormState((prev) => ({
											...prev,
											mbtiType: value === MBTI_PLACEHOLDER_VALUE ? "" : (value as MbtiType),
										}))
									}>
									<SelectTrigger>
										<SelectValue
											placeholder={
												t("common:hub.employeeMbtiPlaceholder", {
													defaultValue: "Not set",
												}) as string
											}
										/>
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={MBTI_PLACEHOLDER_VALUE}>
											{t("common:hub.employeeMbtiPlaceholder", { defaultValue: "Not set" })}
										</SelectItem>
										{MBTI_TYPES.map((type) => (
											<SelectItem value={type} key={type}>
												{type}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="flex flex-col gap-2">
								<label className="text-sm font-medium text-[var(--vscode-foreground)]">
									{traitsLabel}
								</label>
								<Textarea
									rows={2}
									value={formState.traits}
									onChange={(event) =>
										setFormState((prev) => ({ ...prev, traits: event.target.value }))
									}
									placeholder="Methodical, calming, systems thinker"
								/>
							</div>
						</div>

						<div className="flex flex-col gap-2">
							<label className="text-sm font-medium text-[var(--vscode-foreground)]">
								{personalityLabel}
							</label>
							<Textarea
								rows={3}
								value={formState.personality}
								onChange={(event) =>
									setFormState((prev) => ({ ...prev, personality: event.target.value }))
								}
								placeholder="How this teammate makes decisions, tone preferences, escalation habits"
							/>
						</div>

						<div className="flex flex-col gap-2">
							<label className="text-sm font-medium text-[var(--vscode-foreground)]">
								{descriptionLabel}
							</label>
							<Textarea
								rows={4}
								value={formState.description}
								onChange={(event) =>
									setFormState((prev) => ({ ...prev, description: event.target.value }))
								}
								placeholder="Extended summary of responsibilities, deliverables, KPIs"
							/>
						</div>

						{validationMessage && (
							<p className="text-sm text-[color:var(--vscode-errorForeground)]">{validationMessage}</p>
						)}
					</div>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setIsOpen(false)}>
							{t("answers.cancel", { defaultValue: "Cancel" })}
						</Button>
						<Button variant="default" onClick={handleSave} disabled={!company || !selectedEmployee}>
							{saveChangesLabel}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}

export default HubEmployeeManager
