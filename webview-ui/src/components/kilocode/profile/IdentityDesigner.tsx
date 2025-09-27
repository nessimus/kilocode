import { useEffect, useMemo, useState, useId } from "react"

import {
	MBTI_TYPES,
	type MbtiType,
	type WorkplaceCompany,
	type WorkplaceEmployee,
	type WorkplaceOwnerProfile,
} from "@roo/golden/workplace"

import { useExtensionState } from "@/context/ExtensionStateContext"

import {
	Badge,
	Button,
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Checkbox,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Separator,
	Textarea,
} from "@/components/ui"

const MBTI_PLACEHOLDER_VALUE = "__mbti_not_set__"

interface OwnerFormState {
	companyName: string
	companyEmoji: string
	companyDescription: string
	ownerName: string
	ownerFirstName: string
	ownerLastName: string
	ownerRole: string
	ownerMbti: MbtiType | ""
	ownerTraits: string
	ownerBio: string
	mission: string
	vision: string
}

interface EmployeeFormState {
	name: string
	role: string
	mbtiType: MbtiType | ""
	traits: string
	personality: string
	description: string
}

const buildOwnerFormState = (company?: WorkplaceCompany, defaults?: WorkplaceOwnerProfile): OwnerFormState => {
	const ownerProfile = company?.ownerProfile ?? defaults
	const resolvedName = ownerProfile?.name ?? ""
	let derivedFirstName = ownerProfile?.firstName ?? ""
	let derivedLastName = ownerProfile?.lastName ?? ""

	if ((!derivedFirstName || !derivedLastName) && resolvedName) {
		const parts = resolvedName
			.split(/\s+/)
			.map((segment) => segment.trim())
			.filter(Boolean)
		if (parts.length > 0 && !derivedFirstName) {
			derivedFirstName = parts[0]
		}
		if (parts.length > 1 && !derivedLastName) {
			derivedLastName = parts.slice(1).join(" ")
		}
	}

	return {
		companyName: company?.name ?? "",
		companyEmoji: company?.emoji ?? "",
		companyDescription: company?.description ?? "",
		ownerName: resolvedName,
		ownerFirstName: derivedFirstName,
		ownerLastName: derivedLastName,
		ownerRole: ownerProfile?.role ?? "Owner & CEO",
		ownerMbti: ownerProfile?.mbtiType ?? "",
		ownerTraits: ownerProfile?.personalityTraits?.join(", ") ?? "",
		ownerBio: ownerProfile?.bio ?? "",
		mission: company?.mission ?? "",
		vision: company?.vision ?? "",
	}
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
	return traits.length > 0 ? traits : undefined
}

const IdentityDesigner = () => {
	const {
		workplaceState,
		createCompany,
		updateCompany,
		createEmployee,
		updateEmployee,
		selectCompany,
		setActiveEmployee,
	} = useExtensionState()

	const ownerDefaults = workplaceState?.ownerProfileDefaults
	const companies = useMemo(() => workplaceState?.companies ?? [], [workplaceState?.companies])
	const resolvedActiveCompanyId = workplaceState?.activeCompanyId ?? companies[0]?.id
	const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>(resolvedActiveCompanyId)

	const activeCompany = useMemo(() => {
		if (!companies.length) return undefined
		const targetId = selectedCompanyId ?? resolvedActiveCompanyId
		return companies.find((company) => company.id === targetId) ?? companies[0]
	}, [companies, resolvedActiveCompanyId, selectedCompanyId])

	useEffect(() => {
		setSelectedCompanyId(resolvedActiveCompanyId)
	}, [resolvedActiveCompanyId])

	const ownerDefaultsCheckboxId = useId()
	const [applyOwnerDefaults, setApplyOwnerDefaults] = useState<boolean>(() => !activeCompany)

	const [ownerForm, setOwnerForm] = useState<OwnerFormState>(() => buildOwnerFormState(activeCompany, ownerDefaults))

	useEffect(() => {
		setOwnerForm(buildOwnerFormState(activeCompany, ownerDefaults))
	}, [activeCompany, ownerDefaults])

	useEffect(() => {
		setApplyOwnerDefaults(!activeCompany)
	}, [activeCompany])

	const [ownerFeedback, setOwnerFeedback] = useState<string | undefined>()

	const [employeeDialog, setEmployeeDialog] = useState<
		{ mode: "create"; employee?: undefined } | { mode: "edit"; employee: WorkplaceEmployee } | null
	>(null)

	const [employeeForm, setEmployeeForm] = useState<EmployeeFormState>(() => buildEmployeeFormState())

	useEffect(() => {
		if (employeeDialog?.mode === "edit" && employeeDialog.employee) {
			setEmployeeForm(buildEmployeeFormState(employeeDialog.employee))
		} else if (!employeeDialog) {
			setEmployeeForm(buildEmployeeFormState())
		}
	}, [employeeDialog])

	const handleOwnerSubmit = () => {
		if (!activeCompany) {
			setOwnerFeedback("Create your company first.")
			return
		}

		if (!ownerForm.companyName.trim()) {
			setOwnerFeedback("Company name is required.")
			return
		}

		const firstName = ownerForm.ownerFirstName.trim()
		const lastName = ownerForm.ownerLastName.trim()
		const fullNameFromParts = [firstName, lastName].filter(Boolean).join(" ")
		const normalizedName = ownerForm.ownerName.trim() || fullNameFromParts
		const emojiValue = ownerForm.companyEmoji.trim()
		const descriptionValue = ownerForm.companyDescription.trim()

		updateCompany({
			id: activeCompany.id,
			name: ownerForm.companyName.trim(),
			emoji: emojiValue ? emojiValue : "",
			description: descriptionValue ? descriptionValue : "",
			mission: ownerForm.mission.trim() || undefined,
			vision: ownerForm.vision.trim() || undefined,
			ownerProfile: {
				name: normalizedName,
				firstName: firstName || undefined,
				lastName: lastName || undefined,
				role: ownerForm.ownerRole.trim() || "Owner & CEO",
				mbtiType: ownerForm.ownerMbti || undefined,
				personalityTraits: parseTraitsInput(ownerForm.ownerTraits),
				bio: ownerForm.ownerBio.trim() || undefined,
			},
			updateDefaultOwnerProfile: applyOwnerDefaults,
		})
		setOwnerFeedback("Saved")
		setTimeout(() => setOwnerFeedback(undefined), 2500)
	}

	const handleCreateCompany = () => {
		if (!ownerForm.companyName.trim()) {
			setOwnerFeedback("Company name is required.")
			return
		}

		const firstName = ownerForm.ownerFirstName.trim()
		const lastName = ownerForm.ownerLastName.trim()
		const fullNameFromParts = [firstName, lastName].filter(Boolean).join(" ")
		const normalizedName = ownerForm.ownerName.trim() || fullNameFromParts
		const emojiValue = ownerForm.companyEmoji.trim()
		const descriptionValue = ownerForm.companyDescription.trim()

		createCompany({
			name: ownerForm.companyName.trim(),
			emoji: emojiValue ? emojiValue : undefined,
			description: descriptionValue ? descriptionValue : undefined,
			mission: ownerForm.mission.trim() || undefined,
			vision: ownerForm.vision.trim() || undefined,
			ownerProfile: {
				name: normalizedName,
				firstName: firstName || undefined,
				lastName: lastName || undefined,
				role: ownerForm.ownerRole.trim() || "Owner & CEO",
				mbtiType: ownerForm.ownerMbti || undefined,
				personalityTraits: parseTraitsInput(ownerForm.ownerTraits),
				bio: ownerForm.ownerBio.trim() || undefined,
			},
			updateDefaultOwnerProfile: applyOwnerDefaults,
		})
		setOwnerFeedback("Company created")
		setTimeout(() => setOwnerFeedback(undefined), 2500)
	}

	const handleEmployeeSubmit = () => {
		if (!activeCompany) {
			return
		}

		if (!employeeForm.name.trim() || !employeeForm.role.trim()) {
			return
		}

		const payload = {
			name: employeeForm.name.trim(),
			role: employeeForm.role.trim(),
			mbtiType: employeeForm.mbtiType || undefined,
			personalityTraits: parseTraitsInput(employeeForm.traits),
			personality: employeeForm.personality.trim() || undefined,
			description: employeeForm.description.trim() || undefined,
		}

		if (employeeDialog?.mode === "edit" && employeeDialog.employee) {
			updateEmployee({
				companyId: activeCompany.id,
				employee: {
					...employeeDialog.employee,
					...payload,
				},
			})
		} else {
			createEmployee({
				companyId: activeCompany.id,
				...payload,
			})
		}

		setEmployeeDialog(null)
	}

	const ownerEmployeeId = activeCompany?.executiveManagerId
	const teammates = (activeCompany?.employees ?? []).filter((employee) => employee.id !== ownerEmployeeId)
	const ownerEmployee = (activeCompany?.employees ?? []).find((employee) => employee.id === ownerEmployeeId)

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-base font-semibold text-[var(--vscode-foreground)]">Identity Designer</h2>
					<p className="text-sm text-[var(--vscode-descriptionForeground)]">
						Introduce yourself and your team so the AI understands your company context.
					</p>
				</div>
				{companies.length > 1 && activeCompany && (
					<Select
						value={activeCompany.id}
						onValueChange={(value) => {
							setSelectedCompanyId(value)
							selectCompany(value)
						}}>
						<SelectTrigger className="w-52">
							<SelectValue placeholder="Choose company" />
						</SelectTrigger>
						<SelectContent>
							{companies.map((company) => (
								<SelectItem key={company.id} value={company.id}>
									{company.name || "Untitled company"}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</div>

			<Card>
				<CardHeader className="gap-2">
					<CardTitle>Founder Profile</CardTitle>
					<CardDescription>
						Share how you want the workspace to recognize you and the company vision you lead.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-3 md:grid-cols-2">
						<div className="flex flex-col gap-2">
							<label className="text-sm font-medium text-[var(--vscode-foreground)]">Company name</label>
							<Input
								value={ownerForm.companyName}
								onChange={(event) =>
									setOwnerForm((prev) => ({ ...prev, companyName: event.target.value }))
								}
								placeholder="Acme Robotics"
							/>
						</div>
						<div className="flex flex-col gap-2">
							<label className="text-sm font-medium text-[var(--vscode-foreground)]">Display name</label>
							<Input
								value={ownerForm.ownerName}
								onChange={(event) =>
									setOwnerForm((prev) => ({ ...prev, ownerName: event.target.value }))
								}
								placeholder="Alex Founder"
							/>
						</div>
					</div>

					<div className="flex flex-col gap-3 md:flex-row md:items-start">
						<div className="flex flex-col gap-2 md:w-[140px]">
							<label className="text-sm font-medium text-[var(--vscode-foreground)]">Company emoji</label>
							<Input
								value={ownerForm.companyEmoji}
								onChange={(event) =>
									setOwnerForm((prev) => ({ ...prev, companyEmoji: event.target.value }))
								}
								placeholder="🚀"
								maxLength={4}
							/>
						</div>
						<div className="flex flex-1 flex-col gap-2">
							<label className="text-sm font-medium text-[var(--vscode-foreground)]">Company description</label>
							<Textarea
								value={ownerForm.companyDescription}
								onChange={(event) =>
									setOwnerForm((prev) => ({ ...prev, companyDescription: event.target.value }))
								}
								placeholder="Summarize what this company is building."
								rows={3}
							/>
						</div>
					</div>

					<div className="grid gap-3 md:grid-cols-2">
						<div className="flex flex-col gap-2">
							<label className="text-sm font-medium text-[var(--vscode-foreground)]">First name</label>
							<Input
								value={ownerForm.ownerFirstName}
								onChange={(event) =>
									setOwnerForm((prev) => ({ ...prev, ownerFirstName: event.target.value }))
								}
								placeholder="Alex"
							/>
						</div>
						<div className="flex flex-col gap-2">
							<label className="text-sm font-medium text-[var(--vscode-foreground)]">Last name</label>
							<Input
								value={ownerForm.ownerLastName}
								onChange={(event) =>
									setOwnerForm((prev) => ({ ...prev, ownerLastName: event.target.value }))
								}
								placeholder="Founder"
							/>
						</div>
					</div>

					<div className="grid gap-3 md:grid-cols-2">
						<div className="flex flex-col gap-2">
							<label className="text-sm font-medium text-[var(--vscode-foreground)]">Your role</label>
							<Input
								value={ownerForm.ownerRole}
								onChange={(event) =>
									setOwnerForm((prev) => ({ ...prev, ownerRole: event.target.value }))
								}
								placeholder="Owner & CEO"
							/>
						</div>
						<div className="flex flex-col gap-2">
							<label className="text-sm font-medium text-[var(--vscode-foreground)]">MBTI profile</label>
							<Select
								value={ownerForm.ownerMbti || MBTI_PLACEHOLDER_VALUE}
								onValueChange={(value) =>
									setOwnerForm((prev) => ({
										...prev,
										ownerMbti: value === MBTI_PLACEHOLDER_VALUE ? "" : (value as MbtiType),
									}))
								}>
								<SelectTrigger>
									<SelectValue placeholder="Select type" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={MBTI_PLACEHOLDER_VALUE}>Not sure yet</SelectItem>
									{MBTI_TYPES.map((type) => (
										<SelectItem value={type} key={type}>
											{type}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="grid gap-3 md:grid-cols-2">
						<div className="flex flex-col gap-2">
							<label className="text-sm font-medium text-[var(--vscode-foreground)]">
								Signature traits
							</label>
							<Textarea
								rows={2}
								value={ownerForm.ownerTraits}
								onChange={(event) =>
									setOwnerForm((prev) => ({ ...prev, ownerTraits: event.target.value }))
								}
								placeholder="Visionary, candid, energized by shipping"
							/>
							<p className="text-xs text-[var(--vscode-descriptionForeground)]">
								Separate traits with commas for easy tagging.
							</p>
						</div>
						<div className="flex flex-col gap-2">
							<label className="text-sm font-medium text-[var(--vscode-foreground)]">Founder bio</label>
							<Textarea
								rows={3}
								value={ownerForm.ownerBio}
								onChange={(event) =>
									setOwnerForm((prev) => ({ ...prev, ownerBio: event.target.value }))
								}
								placeholder="Why you started the company and what excites you right now"
							/>
						</div>
					</div>

					<Separator className="bg-[var(--vscode-panel-border)]" />

					<div className="grid gap-3 md:grid-cols-2">
						<div className="flex flex-col gap-2">
							<label className="text-sm font-medium text-[var(--vscode-foreground)]">
								Company mission
							</label>
							<Textarea
								rows={3}
								value={ownerForm.mission}
								onChange={(event) => setOwnerForm((prev) => ({ ...prev, mission: event.target.value }))}
								placeholder="Why this company exists"
							/>
						</div>
						<div className="flex flex-col gap-2">
							<label className="text-sm font-medium text-[var(--vscode-foreground)]">
								Company vision
							</label>
							<Textarea
								rows={3}
								value={ownerForm.vision}
								onChange={(event) => setOwnerForm((prev) => ({ ...prev, vision: event.target.value }))}
								placeholder="Where you want to take things next"
							/>
						</div>
					</div>
				</CardContent>
				<CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-2">
						<Checkbox
							id={ownerDefaultsCheckboxId}
							checked={applyOwnerDefaults}
							onCheckedChange={(checked) => setApplyOwnerDefaults(checked === true)}
						/>
						<label
							htmlFor={ownerDefaultsCheckboxId}
							className="text-xs text-[var(--vscode-descriptionForeground)] sm:text-sm">
							Use as default for new companies
						</label>
					</div>
					<div className="flex items-center gap-3">
						{ownerFeedback && (
							<span className="text-xs text-[var(--vscode-descriptionForeground)]">{ownerFeedback}</span>
						)}
						<Button
							variant="default"
							onClick={() => {
								if (activeCompany) {
									handleOwnerSubmit()
								} else {
									handleCreateCompany()
								}
							}}>
							{activeCompany ? "Save profile" : "Create company"}
						</Button>
					</div>
				</CardFooter>
			</Card>

			{ownerEmployee && (
				<Card>
					<CardHeader className="gap-2">
						<CardTitle>Your executive agent</CardTitle>
						<CardDescription>
							This is the persona the AI activates when you speak as the owner. Fine-tune their profile
							below.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-wrap items-center gap-2">
						<Badge variant="secondary">{ownerEmployee.role}</Badge>
						{ownerEmployee.mbtiType && <Badge variant="outline">{ownerEmployee.mbtiType}</Badge>}
						{(ownerEmployee.personalityTraits ?? []).map((trait) => (
							<Badge key={trait} variant="outline">
								{trait}
							</Badge>
						))}
					</CardContent>
					<CardFooter className="flex justify-end">
						<Button
							size="sm"
							variant="secondary"
							onClick={() => setEmployeeDialog({ mode: "edit", employee: ownerEmployee })}>
							Edit executive agent
						</Button>
					</CardFooter>
				</Card>
			)}

			{activeCompany && (
				<Card>
					<CardHeader className="gap-2">
						<CardTitle>Team profiles</CardTitle>
						<CardDescription>
							Give each AI teammate a personality, MBTI profile, and job description so prompts stay
							consistent.
						</CardDescription>
						<CardAction>
							<Button size="sm" variant="secondary" onClick={() => setEmployeeDialog({ mode: "create" })}>
								Add teammate
							</Button>
						</CardAction>
					</CardHeader>
					<CardContent className="space-y-4">
						{teammates.length === 0 ? (
							<div className="text-sm text-[var(--vscode-descriptionForeground)]">
								No teammates yet. Add the AI employees you collaborate with the most.
							</div>
						) : (
							<div className="grid gap-3">
								{teammates.map((employee) => (
									<Card
										key={employee.id}
										className="border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]">
										<CardHeader className="flex flex-row items-start justify-between gap-2">
											<div className="space-y-1">
												<CardTitle className="text-sm font-semibold">{employee.name}</CardTitle>
												<CardDescription>{employee.role}</CardDescription>
											</div>
											<div className="flex gap-2">
												<Button
													size="sm"
													variant="secondary"
													onClick={() =>
														activeCompany &&
														setActiveEmployee(activeCompany.id, employee.id)
													}>
													Set active
												</Button>
												<Button
													size="sm"
													variant="ghost"
													onClick={() => setEmployeeDialog({ mode: "edit", employee })}>
													Edit
												</Button>
											</div>
										</CardHeader>
										<CardContent className="flex flex-wrap gap-2">
											{employee.mbtiType && <Badge variant="outline">{employee.mbtiType}</Badge>}
											{(employee.personalityTraits ?? []).map((trait) => (
												<Badge
													key={trait}
													variant="secondary"
													className="bg-[color-mix(in_srgb,var(--vscode-button-background)_20%,transparent)]">
													{trait}
												</Badge>
											))}
										</CardContent>
										{employee.description && (
											<CardContent>
												<p className="text-sm leading-relaxed text-[var(--vscode-descriptionForeground)]">
													{employee.description}
												</p>
											</CardContent>
										)}
									</Card>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			)}

			<Dialog open={!!employeeDialog} onOpenChange={(open) => (!open ? setEmployeeDialog(null) : undefined)}>
				<DialogContent className="max-w-xl">
					<DialogHeader>
						<DialogTitle>
							{employeeDialog?.mode === "edit" ? "Edit teammate profile" : "Add a teammate"}
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						<div className="grid gap-3 md:grid-cols-2">
							<div className="flex flex-col gap-2">
								<label className="text-sm font-medium text-[var(--vscode-foreground)]">Name</label>
								<Input
									value={employeeForm.name}
									onChange={(event) =>
										setEmployeeForm((prev) => ({ ...prev, name: event.target.value }))
									}
									placeholder="Abigail Ops"
								/>
							</div>
							<div className="flex flex-col gap-2">
								<label className="text-sm font-medium text-[var(--vscode-foreground)]">Role</label>
								<Input
									value={employeeForm.role}
									onChange={(event) =>
										setEmployeeForm((prev) => ({ ...prev, role: event.target.value }))
									}
									placeholder="Lifecycle Specialist"
								/>
							</div>
						</div>

						<div className="grid gap-3 md:grid-cols-2">
							<div className="flex flex-col gap-2">
								<label className="text-sm font-medium text-[var(--vscode-foreground)]">MBTI type</label>
								<Select
									value={employeeForm.mbtiType || MBTI_PLACEHOLDER_VALUE}
									onValueChange={(value) =>
										setEmployeeForm((prev) => ({
											...prev,
											mbtiType: value === MBTI_PLACEHOLDER_VALUE ? "" : (value as MbtiType),
										}))
									}>
									<SelectTrigger>
										<SelectValue placeholder="Select type" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={MBTI_PLACEHOLDER_VALUE}>Not sure yet</SelectItem>
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
									Signature traits
								</label>
								<Textarea
									rows={2}
									value={employeeForm.traits}
									onChange={(event) =>
										setEmployeeForm((prev) => ({ ...prev, traits: event.target.value }))
									}
									placeholder="Methodical, calming, systems thinker"
								/>
							</div>
						</div>

						<div className="flex flex-col gap-2">
							<label className="text-sm font-medium text-[var(--vscode-foreground)]">Working style</label>
							<Textarea
								rows={3}
								value={employeeForm.personality}
								onChange={(event) =>
									setEmployeeForm((prev) => ({ ...prev, personality: event.target.value }))
								}
								placeholder="How this teammate makes decisions, tone preferences, escalation habits"
							/>
						</div>

						<div className="flex flex-col gap-2">
							<label className="text-sm font-medium text-[var(--vscode-foreground)]">
								Job description
							</label>
							<Textarea
								rows={4}
								value={employeeForm.description}
								onChange={(event) =>
									setEmployeeForm((prev) => ({ ...prev, description: event.target.value }))
								}
								placeholder="Extended summary of responsibilities, deliverables, KPIs"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setEmployeeDialog(null)}>
							Cancel
						</Button>
						<Button variant="default" onClick={handleEmployeeSubmit}>
							{employeeDialog?.mode === "edit" ? "Save changes" : "Add teammate"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}

export default IdentityDesigner
