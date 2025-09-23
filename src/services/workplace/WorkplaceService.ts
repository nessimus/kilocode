import * as vscode from "vscode"
import { v4 as uuid } from "uuid"

import {
	AssignEmployeeToTeamPayload,
	AssignTeamToDepartmentPayload,
	ArchiveDepartmentPayload,
	ArchiveEmployeePayload,
	ArchiveTeamPayload,
	CreateActionItemPayload,
	CreateActionStatusPayload,
	CreateCompanyPayload,
	CreateDepartmentPayload,
	CreateEmployeePayload,
	CreateTeamPayload,
	DeleteActionItemPayload,
	RemoveEmployeeFromTeamPayload,
	UpdateActionItemPayload,
	UpdateCompanyPayload,
	UpdateDepartmentPayload,
	UpdateEmployeePayload,
	UpdateTeamPayload,
	UpsertActionStatusPayload,
	StartActionItemsPayload,
	WorkplaceActionStartScope,
	WorkplaceActionItem,
	WorkplaceActionStatus,
	WorkplaceCompany,
	WorkplaceEmployee,
	WorkplaceDepartment,
	WorkplaceOwnerProfile,
	WorkplacePersonaMode,
	WorkplaceState,
	RemoveTeamFromDepartmentPayload,
	cloneWorkplaceState,
	createDefaultActionStatuses,
	createExecutiveManagerProfile,
	withGeneratedIds,
} from "../../shared/golden/workplace"

const STORAGE_KEY = "goldenWorkplace.state"
const ENABLE_WORKPLACE_DEBUG_LOGS = false

const debugLog = (...args: unknown[]) => {
	if (!ENABLE_WORKPLACE_DEBUG_LOGS) {
		return
	}
	console.debug("[WorkplaceService]", ...args)
}

export class WorkplaceService {
	private state: WorkplaceState

	constructor(private readonly context: vscode.ExtensionContext) {
		const stored = this.context.globalState.get<WorkplaceState>(STORAGE_KEY)
		this.state = stored
			? {
					...stored,
					ownerProfileDefaults: stored.ownerProfileDefaults
						? this.sanitizeOwnerProfile(stored.ownerProfileDefaults)
						: stored.ownerProfileDefaults,
				}
			: { companies: [] }
	}

	private sanitizeOwnerProfile(profile: WorkplaceOwnerProfile): WorkplaceOwnerProfile {
		const name = profile.name?.trim() ?? ""
		const role = profile.role?.trim() || "Owner & CEO"
		const traits = profile.personalityTraits?.map((trait) => trait.trim()).filter((trait) => trait.length > 0)
		const bio = profile.bio?.trim()
		let firstName = profile.firstName?.trim()
		let lastName = profile.lastName?.trim()

		if (name) {
			const parts = name
				.split(/\s+/)
				.map((segment) => segment.trim())
				.filter(Boolean)
			if (parts.length > 0 && !firstName) {
				;[firstName] = parts
			}
			if (parts.length > 1 && !lastName) {
				lastName = parts.slice(1).join(" ")
			}
		}

		return {
			name,
			role,
			firstName: firstName && firstName.length > 0 ? firstName : undefined,
			lastName: lastName && lastName.length > 0 ? lastName : undefined,
			mbtiType: profile.mbtiType,
			personalityTraits: traits && traits.length > 0 ? [...traits] : undefined,
			bio: bio && bio.length > 0 ? bio : undefined,
		}
	}

	private resolveOwnerProfileForNewCompany(ownerProfile?: WorkplaceOwnerProfile): WorkplaceOwnerProfile {
		const defaults = this.state.ownerProfileDefaults
		const combined: WorkplaceOwnerProfile = {
			name: ownerProfile?.name ?? defaults?.name ?? "",
			role: ownerProfile?.role ?? defaults?.role ?? "Owner & CEO",
			firstName: ownerProfile?.firstName ?? defaults?.firstName,
			lastName: ownerProfile?.lastName ?? defaults?.lastName,
			mbtiType: ownerProfile?.mbtiType ?? defaults?.mbtiType,
			personalityTraits: ownerProfile?.personalityTraits ?? defaults?.personalityTraits,
			bio: ownerProfile?.bio ?? defaults?.bio,
		}
		return this.sanitizeOwnerProfile(combined)
	}

	private updateOwnerProfileDefaults(next: WorkplaceOwnerProfile): void {
		this.state.ownerProfileDefaults = this.sanitizeOwnerProfile(next)
	}

	private logState(action: string, details?: Record<string, unknown>) {
		if (!ENABLE_WORKPLACE_DEBUG_LOGS) {
			return
		}

		const companySummaries = this.state.companies.map((company) => ({
			id: company.id,
			name: company.name,
			activeEmployeeId: company.activeEmployeeId,
			executiveManagerId: company.executiveManagerId,
			employeeCount: company.employees.length,
		}))

		debugLog("state", {
			action,
			state: {
				activeCompanyId: this.state.activeCompanyId,
				activeEmployeeId: this.state.activeEmployeeId,
				companies: companySummaries,
			},
			...(details ?? {}),
		})
	}

	public getState(): WorkplaceState {
		const snapshot = cloneWorkplaceState(this.state)
		debugLog("getState", {
			companyCount: snapshot.companies.length,
			companyNames: snapshot.companies.map((company) => company.name),
		})
		return snapshot
	}

	private resolveActiveEmployeeId(company?: WorkplaceCompany): string | undefined {
		if (!company) {
			return undefined
		}
		const activeEmployees = company.employees.filter((employee) => !employee.deletedAt)
		if (!activeEmployees.length) {
			return undefined
		}
		if (company.activeEmployeeId && activeEmployees.some((employee) => employee.id === company.activeEmployeeId)) {
			return company.activeEmployeeId
		}
		if (
			company.executiveManagerId &&
			activeEmployees.some((employee) => employee.id === company.executiveManagerId)
		) {
			return company.executiveManagerId
		}
		const executive = activeEmployees.find((employee) => employee.isExecutiveManager)
		if (executive) {
			return executive.id
		}
		return activeEmployees[0]?.id
	}

	private attachTeamToDepartment(company: WorkplaceCompany, teamId: string, departmentId: string | undefined): void {
		const now = new Date().toISOString()
		for (const department of company.departments) {
			const isTarget = department.id === departmentId
			let didMutate = false
			department.teamLinks = department.teamLinks ?? []
			const activeLinkIndex = department.teamLinks.findIndex((link) => link.teamId === teamId && !link.unlinkedAt)
			if (isTarget) {
				if (activeLinkIndex === -1) {
					const existingArchivedIndex = department.teamLinks.findIndex(
						(link) => link.teamId === teamId && link.unlinkedAt,
					)
					if (existingArchivedIndex !== -1) {
						department.teamLinks[existingArchivedIndex] = {
							...department.teamLinks[existingArchivedIndex],
							linkedAt: now,
							unlinkedAt: undefined,
						}
					} else {
						department.teamLinks.push({ teamId, linkedAt: now, unlinkedAt: undefined })
					}
					didMutate = true
				}
			} else if (activeLinkIndex !== -1) {
				department.teamLinks[activeLinkIndex] = {
					...department.teamLinks[activeLinkIndex],
					unlinkedAt: now,
				}
				didMutate = true
			}
			if (didMutate) {
				department.teamIds = department.teamLinks.filter((link) => !link.unlinkedAt).map((link) => link.teamId)
				department.updatedAt = now
			}
		}
	}

	public async initialize(): Promise<void> {
		if (this.state.companies.length === 0) {
			return
		}

		// Ensure every company retains an executive manager reference
		let mutated = false
		this.state.companies = this.state.companies.map((company) => {
			const nowIso = new Date().toISOString()

			company.employees =
				company.employees?.map((employee) => {
					const createdAt = employee.createdAt ?? nowIso
					const updatedAt = employee.updatedAt ?? nowIso
					if (
						employee.createdAt !== createdAt ||
						employee.updatedAt !== updatedAt ||
						employee.deletedAt === null
					) {
						mutated = true
					}
					return {
						...employee,
						createdAt,
						updatedAt,
						deletedAt: employee.deletedAt ?? undefined,
					}
				}) ?? []

			if (!company.executiveManagerId) {
				const executive = company.employees.find((emp) => emp.isExecutiveManager)
				if (executive) {
					company.executiveManagerId = executive.id
					mutated = true
				}
			}

			if (!company.actionStatuses || company.actionStatuses.length === 0) {
				company.actionStatuses = createDefaultActionStatuses()
				mutated = true
			} else {
				company.actionStatuses = company.actionStatuses.map((status, index) => ({
					...status,
					order: typeof status.order === "number" ? status.order : index,
					createdAt: status.createdAt ?? new Date().toISOString(),
					updatedAt: status.updatedAt ?? new Date().toISOString(),
				}))
			}

			if (!company.departments) {
				company.departments = []
				mutated = true
			}

			company.departments = company.departments.map((department) => {
				const createdAt = department.createdAt ?? nowIso
				const updatedAt = department.updatedAt ?? nowIso
				let teamLinks = Array.isArray(department.teamLinks)
					? department.teamLinks.map((link) => ({
							teamId: link.teamId,
							linkedAt: link.linkedAt ?? createdAt,
							unlinkedAt: link.unlinkedAt ?? undefined,
						}))
					: undefined
				if (!teamLinks) {
					const sourceTeamIds = Array.isArray(department.teamIds) ? department.teamIds : []
					teamLinks = sourceTeamIds.map((teamId) => ({ teamId, linkedAt: createdAt, unlinkedAt: undefined }))
					mutated = true
				}
				const activeTeamIds = teamLinks.filter((link) => !link.unlinkedAt).map((link) => link.teamId)
				if (
					!Array.isArray(department.teamIds) ||
					department.teamIds.length !== activeTeamIds.length ||
					department.teamIds.some((id, idx) => id !== activeTeamIds[idx])
				) {
					mutated = true
				}
				return {
					...department,
					teamIds: activeTeamIds,
					teamLinks,
					updatedAt,
					createdAt,
					deletedAt: department.deletedAt ?? undefined,
				}
			})

			if (!company.teams) {
				company.teams = []
				mutated = true
			}

			company.teams = company.teams.map((team) => {
				const createdAt = team.createdAt ?? nowIso
				const updatedAt = team.updatedAt ?? nowIso
				let memberships = Array.isArray(team.memberships)
					? team.memberships.map((membership) => ({
							employeeId: membership.employeeId,
							addedAt: membership.addedAt ?? createdAt,
							removedAt: membership.removedAt ?? undefined,
						}))
					: undefined
				if (!memberships) {
					const sourceEmployeeIds = Array.isArray(team.employeeIds) ? team.employeeIds : []
					memberships = sourceEmployeeIds.map((employeeId) => ({
						employeeId,
						addedAt: createdAt,
						removedAt: undefined,
					}))
					mutated = true
				}
				const activeEmployeeIds = memberships
					.filter((membership) => !membership.removedAt)
					.map((membership) => membership.employeeId)
				if (
					!Array.isArray(team.employeeIds) ||
					team.employeeIds.length !== activeEmployeeIds.length ||
					team.employeeIds.some((id, idx) => id !== activeEmployeeIds[idx])
				) {
					mutated = true
				}
				return {
					...team,
					employeeIds: activeEmployeeIds,
					memberships,
					updatedAt,
					createdAt,
					deletedAt: team.deletedAt ?? undefined,
				}
			})

			if (!company.actionItems) {
				company.actionItems = []
				mutated = true
			}

			company.actionItems = company.actionItems.map((item) => {
				const relationIds = Array.isArray(item.relationIds) ? item.relationIds : []
				const startCount =
					typeof item.startCount === "number" && Number.isFinite(item.startCount) ? item.startCount : 0
				const lastStartedBy = item.lastStartedBy?.trim()
				return {
					...item,
					relationIds,
					startCount,
					lastStartedBy: lastStartedBy && lastStartedBy.length > 0 ? lastStartedBy : undefined,
					lastStartedAt: item.lastStartedAt ?? undefined,
				}
			})

			if (!company.actionRelations) {
				company.actionRelations = []
				mutated = true
			}

			if (!company.ownerProfile) {
				company.ownerProfile = { name: "", role: "Owner & CEO" }
				mutated = true
			}

			const resolvedActiveId = this.resolveActiveEmployeeId(company)
			if (resolvedActiveId && company.activeEmployeeId !== resolvedActiveId) {
				company.activeEmployeeId = resolvedActiveId
				mutated = true
			}

			return company
		})

		if (!this.state.ownerProfileDefaults) {
			const ownerSource = this.state.companies
				.map((company) => company.ownerProfile)
				.find((profile): profile is WorkplaceOwnerProfile =>
					Boolean(
						profile &&
							((profile.name && profile.name.trim().length > 0) ||
								(profile.role && profile.role.trim().length > 0)),
					),
				)
			if (ownerSource) {
				this.state.ownerProfileDefaults = this.sanitizeOwnerProfile(ownerSource)
				mutated = true
			}
		}

		if (!this.state.activeCompanyId) {
			this.state.activeCompanyId = this.state.companies[0]?.id
			mutated = true
		}

		const activeCompany = this.state.companies.find((company) => company.id === this.state.activeCompanyId)
		const activeEmployeeId = this.resolveActiveEmployeeId(activeCompany)
		if (activeEmployeeId && this.state.activeEmployeeId !== activeEmployeeId) {
			this.state.activeEmployeeId = activeEmployeeId
			mutated = true
		}

		if (mutated) {
			await this.persist()
		}

		this.logState("initialize")
	}

	public async createCompany(payload: CreateCompanyPayload): Promise<WorkplaceState> {
		const { updateDefaultOwnerProfile, ...restPayload } = payload
		const ownerProfile = this.resolveOwnerProfileForNewCompany(restPayload.ownerProfile)
		const company = withGeneratedIds.company({ ...restPayload, ownerProfile })
		const executiveDraft = createExecutiveManagerProfile(payload.name)
		const executive = withGeneratedIds.employee({ ...executiveDraft, isExecutiveManager: true })

		company.executiveManagerId = executive.id
		company.activeEmployeeId = executive.id
		company.actionStatuses = createDefaultActionStatuses()
		company.actionItems = []
		company.actionRelations = []
		company.ownerProfile = ownerProfile
		company.employees.push(executive)
		const shouldUpdateDefaults = updateDefaultOwnerProfile !== false || !this.state.ownerProfileDefaults
		if (shouldUpdateDefaults) {
			this.updateOwnerProfileDefaults(ownerProfile)
		}

		this.state.companies.push(company)
		this.state.activeCompanyId = company.id
		this.state.activeEmployeeId = executive.id
		await this.persist()
		this.logState("createCompany", { companyId: company.id })
		return this.getState()
	}

	public async updateCompany(payload: UpdateCompanyPayload): Promise<WorkplaceState> {
		const company = this.state.companies.find((c) => c.id === payload.id)
		if (!company) {
			throw new Error(`Company ${payload.id} not found`)
		}

		company.name = payload.name
		company.mission = payload.mission
		company.vision = payload.vision

		if (payload.ownerProfile) {
			company.ownerProfile = this.sanitizeOwnerProfile(payload.ownerProfile)
		} else if (company.ownerProfile) {
			company.ownerProfile = this.sanitizeOwnerProfile(company.ownerProfile)
		} else {
			company.ownerProfile = this.resolveOwnerProfileForNewCompany()
		}

		if (payload.updateDefaultOwnerProfile) {
			this.updateOwnerProfileDefaults(company.ownerProfile)
		}

		company.updatedAt = new Date().toISOString()
		await this.persist()
		this.logState("updateCompany", { companyId: payload.id })
		return this.getState()
	}

	public async setActiveCompany(companyId: string | undefined): Promise<WorkplaceState> {
		this.state.activeCompanyId = companyId
		const company = this.state.companies.find((entry) => entry.id === companyId)
		const activeEmployeeId = this.resolveActiveEmployeeId(company)
		this.state.activeEmployeeId = activeEmployeeId
		await this.persist()
		this.logState("setActiveCompany", { companyId, resolvedActiveEmployeeId: activeEmployeeId })
		return this.getState()
	}

	public async createEmployee(payload: CreateEmployeePayload): Promise<WorkplaceState> {
		const company = this.state.companies.find((c) => c.id === payload.companyId)
		if (!company) {
			throw new Error(`Company ${payload.companyId} not found`)
		}

		const { companyId: _companyId, ...rest } = payload
		const employee = withGeneratedIds.employee(rest)

		if (employee.isExecutiveManager) {
			company.employees = company.employees.map((existing) =>
				existing.id === company.executiveManagerId ? { ...existing, isExecutiveManager: false } : existing,
			)
			company.executiveManagerId = employee.id
			company.activeEmployeeId = employee.id
		}

		company.employees.push(employee)
		company.updatedAt = new Date().toISOString()
		if (!company.activeEmployeeId) {
			company.activeEmployeeId = employee.id
		}
		if (this.state.activeCompanyId === company.id) {
			this.state.activeEmployeeId = company.activeEmployeeId ?? employee.id
		}
		await this.persist()
		this.logState("createEmployee", { companyId: company.id, employeeId: employee.id })
		return this.getState()
	}

	public async updateEmployee(payload: UpdateEmployeePayload): Promise<WorkplaceState> {
		const { companyId, employee } = payload
		const company = this.state.companies.find((c) => c.id === companyId)
		if (!company) {
			throw new Error(`Company ${companyId} not found`)
		}

		const idx = company.employees.findIndex((e) => e.id === employee.id)
		if (idx === -1) {
			throw new Error(`Employee ${employee.id} not found`)
		}

		const sanitizedDeletedAt = employee.deletedAt === null ? undefined : (employee.deletedAt ?? undefined)

		const updated: WorkplaceEmployee = {
			...employee,
			updatedAt: new Date().toISOString(),
			personaMode: employee.personaMode,
			deletedAt: sanitizedDeletedAt,
		}

		company.employees[idx] = updated

		if (updated.isExecutiveManager) {
			company.executiveManagerId = updated.id
			company.employees = company.employees.map((member, index) =>
				index === idx ? updated : { ...member, isExecutiveManager: false },
			)
			company.activeEmployeeId = updated.id
		}

		if (company.activeEmployeeId === updated.id && this.state.activeCompanyId === company.id) {
			this.state.activeEmployeeId = updated.id
		}

		company.updatedAt = new Date().toISOString()
		await this.persist()
		this.logState("updateEmployee", { companyId, employeeId: employee.id })
		return this.getState()
	}

	public async createDepartment(payload: CreateDepartmentPayload): Promise<WorkplaceState> {
		const company = this.state.companies.find((c) => c.id === payload.companyId)
		if (!company) {
			throw new Error(`Company ${payload.companyId} not found`)
		}

		const { companyId: _companyId, ...rest } = payload
		const department = withGeneratedIds.department(rest)
		company.departments.push(department)
		company.updatedAt = new Date().toISOString()
		await this.persist()
		this.logState("createDepartment", { companyId: company.id, departmentId: department.id })
		return this.getState()
	}

	public async updateDepartment(payload: UpdateDepartmentPayload): Promise<WorkplaceState> {
		const { companyId, department } = payload
		const company = this.state.companies.find((c) => c.id === companyId)
		if (!company) {
			throw new Error(`Company ${companyId} not found`)
		}
		const existing = company.departments.find((entry) => entry.id === department.id)
		if (!existing) {
			throw new Error(`Department ${department.id} not found`)
		}
		existing.name = department.name
		existing.description = department.description
		existing.deletedAt = department.deletedAt === null ? undefined : (department.deletedAt ?? undefined)
		existing.updatedAt = new Date().toISOString()
		company.updatedAt = new Date().toISOString()
		await this.persist()
		this.logState("updateDepartment", { companyId, departmentId: department.id })
		return this.getState()
	}

	public async createTeam(payload: CreateTeamPayload): Promise<WorkplaceState> {
		const company = this.state.companies.find((c) => c.id === payload.companyId)
		if (!company) {
			throw new Error(`Company ${payload.companyId} not found`)
		}

		const { companyId: _companyId, departmentId, ...rest } = payload
		if (departmentId) {
			const department = company.departments.find((entry) => entry.id === departmentId)
			if (!department) {
				throw new Error(`Department ${departmentId} not found`)
			}
			if (department.deletedAt) {
				throw new Error(`Department ${departmentId} is archived and cannot receive new teams`)
			}
		}
		const team = withGeneratedIds.team(rest)
		company.teams.push(team)
		if (departmentId) {
			this.attachTeamToDepartment(company, team.id, departmentId)
		}
		company.updatedAt = new Date().toISOString()
		await this.persist()
		this.logState("createTeam", { companyId: company.id, teamId: team.id, departmentId })
		return this.getState()
	}

	public async updateTeam(payload: UpdateTeamPayload): Promise<WorkplaceState> {
		const { companyId, team } = payload
		const company = this.state.companies.find((c) => c.id === companyId)
		if (!company) {
			throw new Error(`Company ${companyId} not found`)
		}

		const existing = company.teams.find((entry) => entry.id === team.id)
		if (!existing) {
			throw new Error(`Team ${team.id} not found`)
		}
		existing.name = team.name
		existing.description = team.description
		existing.deletedAt = team.deletedAt === null ? undefined : (team.deletedAt ?? undefined)
		existing.updatedAt = new Date().toISOString()
		company.updatedAt = new Date().toISOString()
		await this.persist()
		this.logState("updateTeam", { companyId, teamId: team.id })
		return this.getState()
	}

	public async assignTeamToDepartment(payload: AssignTeamToDepartmentPayload): Promise<WorkplaceState> {
		const company = this.state.companies.find((c) => c.id === payload.companyId)
		if (!company) {
			throw new Error(`Company ${payload.companyId} not found`)
		}

		const team = company.teams.find((entry) => entry.id === payload.teamId)
		if (!team) {
			throw new Error(`Team ${payload.teamId} not found`)
		}
		if (team.deletedAt) {
			throw new Error(`Team ${payload.teamId} is archived and cannot be reassigned`)
		}

		let targetDepartment: WorkplaceDepartment | undefined
		if (payload.departmentId) {
			targetDepartment = company.departments.find((entry) => entry.id === payload.departmentId)
			if (!targetDepartment) {
				throw new Error(`Department ${payload.departmentId} not found`)
			}
			if (targetDepartment.deletedAt) {
				throw new Error(`Department ${payload.departmentId} is archived and cannot receive new teams`)
			}
		}
		this.attachTeamToDepartment(company, payload.teamId, targetDepartment?.id)
		team.updatedAt = new Date().toISOString()
		company.updatedAt = new Date().toISOString()
		await this.persist()
		this.logState("assignTeamToDepartment", {
			companyId: company.id,
			teamId: payload.teamId,
			departmentId: payload.departmentId,
		})
		return this.getState()
	}

	public async assignEmployeeToTeam(payload: AssignEmployeeToTeamPayload): Promise<WorkplaceState> {
		const company = this.state.companies.find((c) => c.id === payload.companyId)
		if (!company) {
			throw new Error(`Company ${payload.companyId} not found`)
		}

		const team = company.teams.find((entry) => entry.id === payload.teamId)
		if (!team) {
			throw new Error(`Team ${payload.teamId} not found`)
		}
		if (team.deletedAt) {
			throw new Error(`Team ${payload.teamId} is archived and cannot receive members`)
		}

		const employee = company.employees.find((entry) => entry.id === payload.employeeId)
		if (!employee) {
			throw new Error(`Employee ${payload.employeeId} not found`)
		}
		if (employee.deletedAt) {
			throw new Error(`Employee ${payload.employeeId} is archived and cannot be assigned to teams`)
		}

		const now = new Date().toISOString()
		const activeMembership = team.memberships.find(
			(membership) => membership.employeeId === employee.id && !membership.removedAt,
		)
		if (activeMembership) {
			return this.getState()
		}

		const archivedMembershipIndex = team.memberships.findIndex(
			(membership) => membership.employeeId === employee.id && membership.removedAt,
		)
		if (archivedMembershipIndex !== -1) {
			team.memberships[archivedMembershipIndex] = {
				...team.memberships[archivedMembershipIndex],
				addedAt: now,
				removedAt: undefined,
			}
		} else {
			team.memberships.push({ employeeId: employee.id, addedAt: now, removedAt: undefined })
		}

		team.employeeIds = team.memberships
			.filter((membership) => !membership.removedAt)
			.map((membership) => membership.employeeId)
		team.updatedAt = now
		company.updatedAt = now
		await this.persist()
		this.logState("assignEmployeeToTeam", {
			companyId: company.id,
			teamId: team.id,
			employeeId: employee.id,
		})

		return this.getState()
	}

	public async removeEmployeeFromTeam(payload: RemoveEmployeeFromTeamPayload): Promise<WorkplaceState> {
		const company = this.state.companies.find((c) => c.id === payload.companyId)
		if (!company) {
			throw new Error(`Company ${payload.companyId} not found`)
		}

		const team = company.teams.find((entry) => entry.id === payload.teamId)
		if (!team) {
			throw new Error(`Team ${payload.teamId} not found`)
		}

		const membership = team.memberships.find((entry) => entry.employeeId === payload.employeeId && !entry.removedAt)
		if (!membership) {
			return this.getState()
		}

		const now = new Date().toISOString()
		membership.removedAt = now
		team.employeeIds = team.memberships.filter((entry) => !entry.removedAt).map((entry) => entry.employeeId)
		team.updatedAt = now
		company.updatedAt = now
		await this.persist()
		this.logState("removeEmployeeFromTeam", {
			companyId: company.id,
			teamId: team.id,
			employeeId: payload.employeeId,
		})

		return this.getState()
	}

	public async archiveEmployee(payload: ArchiveEmployeePayload): Promise<WorkplaceState> {
		const company = this.state.companies.find((c) => c.id === payload.companyId)
		if (!company) {
			throw new Error(`Company ${payload.companyId} not found`)
		}

		const employee = company.employees.find((entry) => entry.id === payload.employeeId)
		if (!employee) {
			throw new Error(`Employee ${payload.employeeId} not found`)
		}
		if (employee.deletedAt) {
			return this.getState()
		}

		const now = new Date().toISOString()
		const archivedEmployeeIds = new Set<string>()

		company.teams = company.teams.map((team) => {
			const membership = team.memberships.find(
				(entry) => entry.employeeId === payload.employeeId && !entry.removedAt,
			)
			if (!membership) {
				return team
			}
			membership.removedAt = now
			team.employeeIds = team.memberships.filter((entry) => !entry.removedAt).map((entry) => entry.employeeId)
			team.updatedAt = now
			archivedEmployeeIds.add(team.id)
			return team
		})

		company.actionItems = company.actionItems.map((actionItem) => {
			if (actionItem.ownerEmployeeId === payload.employeeId) {
				return {
					...actionItem,
					ownerEmployeeId: undefined,
					updatedAt: now,
				}
			}
			return actionItem
		})

		let nextExecutive: WorkplaceEmployee | undefined = company.employees.find(
			(candidate) => candidate.id !== payload.employeeId && !candidate.deletedAt && candidate.isExecutiveManager,
		)
		if (!nextExecutive) {
			nextExecutive = company.employees.find(
				(candidate) => candidate.id !== payload.employeeId && !candidate.deletedAt,
			)
		}

		company.employees = company.employees.map((member) => {
			if (member.id === payload.employeeId) {
				return {
					...member,
					deletedAt: now,
					isExecutiveManager: false,
					updatedAt: now,
				}
			}
			if (nextExecutive && member.id === nextExecutive.id) {
				return {
					...member,
					isExecutiveManager: true,
					updatedAt: now,
				}
			}
			if (member.isExecutiveManager) {
				return {
					...member,
					isExecutiveManager: member.id === nextExecutive?.id,
					updatedAt: member.updatedAt ?? now,
				}
			}
			return member
		})

		company.executiveManagerId = nextExecutive?.id ?? ""
		const nextActiveId = this.resolveActiveEmployeeId(company)
		company.activeEmployeeId = nextActiveId
		if (this.state.activeCompanyId === company.id) {
			this.state.activeEmployeeId = nextActiveId
		}
		company.updatedAt = now
		await this.persist()
		this.logState("archiveEmployee", {
			companyId: company.id,
			employeeId: payload.employeeId,
			affectedTeamIds: Array.from(archivedEmployeeIds),
		})

		return this.getState()
	}

	public async archiveDepartment(payload: ArchiveDepartmentPayload): Promise<WorkplaceState> {
		const company = this.state.companies.find((c) => c.id === payload.companyId)
		if (!company) {
			throw new Error(`Company ${payload.companyId} not found`)
		}

		const department = company.departments.find((entry) => entry.id === payload.departmentId)
		if (!department) {
			throw new Error(`Department ${payload.departmentId} not found`)
		}
		if (department.deletedAt) {
			return this.getState()
		}

		const now = new Date().toISOString()
		department.deletedAt = now
		department.updatedAt = now
		department.teamLinks = department.teamLinks.map((link) =>
			link.unlinkedAt
				? link
				: {
						...link,
						unlinkedAt: now,
					},
		)
		department.teamIds = []
		company.updatedAt = now
		await this.persist()
		this.logState("archiveDepartment", {
			companyId: company.id,
			departmentId: payload.departmentId,
		})

		return this.getState()
	}

	public async archiveTeam(payload: ArchiveTeamPayload): Promise<WorkplaceState> {
		const company = this.state.companies.find((c) => c.id === payload.companyId)
		if (!company) {
			throw new Error(`Company ${payload.companyId} not found`)
		}

		const team = company.teams.find((entry) => entry.id === payload.teamId)
		if (!team) {
			throw new Error(`Team ${payload.teamId} not found`)
		}
		if (team.deletedAt) {
			return this.getState()
		}

		const now = new Date().toISOString()
		team.deletedAt = now
		team.updatedAt = now
		team.memberships = team.memberships.map((membership) =>
			membership.removedAt
				? membership
				: {
						...membership,
						removedAt: now,
					},
		)
		team.employeeIds = []

		company.departments = company.departments.map((department) => {
			let mutated = false
			department.teamLinks = department.teamLinks.map((link) => {
				if (link.teamId === payload.teamId && !link.unlinkedAt) {
					mutated = true
					return {
						...link,
						unlinkedAt: now,
					}
				}
				return link
			})
			if (mutated) {
				department.teamIds = department.teamLinks.filter((link) => !link.unlinkedAt).map((link) => link.teamId)
				department.updatedAt = now
			}
			return department
		})

		company.updatedAt = now
		await this.persist()
		this.logState("archiveTeam", {
			companyId: company.id,
			teamId: payload.teamId,
		})

		return this.getState()
	}

	public async removeTeamFromDepartment(payload: RemoveTeamFromDepartmentPayload): Promise<WorkplaceState> {
		const company = this.state.companies.find((c) => c.id === payload.companyId)
		if (!company) {
			throw new Error(`Company ${payload.companyId} not found`)
		}

		const team = company.teams.find((entry) => entry.id === payload.teamId)
		if (!team) {
			throw new Error(`Team ${payload.teamId} not found`)
		}
		if (team.deletedAt) {
			throw new Error(`Team ${payload.teamId} is archived and cannot be detached`)
		}

		const department = company.departments.find((entry) => entry.id === payload.departmentId)
		if (!department) {
			throw new Error(`Department ${payload.departmentId} not found`)
		}

		const activeLink = department.teamLinks.find((link) => link.teamId === payload.teamId && !link.unlinkedAt)
		if (!activeLink) {
			return this.getState()
		}

		const now = new Date().toISOString()
		department.teamLinks = department.teamLinks.map((link) =>
			link.teamId === payload.teamId && !link.unlinkedAt ? { ...link, unlinkedAt: now } : link,
		)
		department.teamIds = department.teamLinks.filter((link) => !link.unlinkedAt).map((link) => link.teamId)
		department.updatedAt = now
		team.updatedAt = now
		company.updatedAt = now
		await this.persist()
		this.logState("removeTeamFromDepartment", {
			companyId: company.id,
			teamId: payload.teamId,
			departmentId: payload.departmentId,
		})

		return this.getState()
	}

	public async upsertEmployeePersonaMode(
		companyId: string,
		employeeId: string,
		personaMode: Omit<WorkplacePersonaMode, "createdAt" | "updatedAt"> & {
			createdAt?: string
			updatedAt?: string
		},
	): Promise<WorkplaceState> {
		const company = this.state.companies.find((entry) => entry.id === companyId)
		if (!company) {
			throw new Error(`Company ${companyId} not found`)
		}

		const employee = company.employees.find((entry) => entry.id === employeeId)
		if (!employee) {
			throw new Error(`Employee ${employeeId} not found in company ${companyId}`)
		}

		const now = new Date().toISOString()
		company.employees = company.employees.map((candidate) =>
			candidate.id === employeeId
				? {
						...candidate,
						personaMode: {
							...personaMode,
							updatedAt: now,
							createdAt: personaMode.createdAt ?? now,
						},
						updatedAt: now,
					}
				: candidate,
		)
		company.updatedAt = now
		await this.persist()
		this.logState("upsertEmployeePersonaMode", { companyId, employeeId, personaModeId: personaMode.id })
		return this.getState()
	}

	public async setActiveEmployee(companyId: string, employeeId: string): Promise<WorkplaceState> {
		const company = this.state.companies.find((entry) => entry.id === companyId)
		if (!company) {
			throw new Error(`Company ${companyId} not found`)
		}

		const employee = company.employees.find((entry) => entry.id === employeeId)
		if (!employee) {
			throw new Error(`Employee ${employeeId} not found in company ${companyId}`)
		}
		if (employee.deletedAt) {
			throw new Error(`Employee ${employeeId} is archived and cannot be activated`)
		}

		company.activeEmployeeId = employee.id
		this.state.activeCompanyId = companyId
		this.state.activeEmployeeId = employee.id
		await this.persist()
		this.logState("setActiveEmployee", { companyId, employeeId })
		return this.getState()
	}

	public async createActionItem(payload: CreateActionItemPayload): Promise<WorkplaceState> {
		const company = this.state.companies.find((entry) => entry.id === payload.companyId)
		if (!company) {
			throw new Error(`Company ${payload.companyId} not found`)
		}

		if (!company.actionStatuses || company.actionStatuses.length === 0) {
			company.actionStatuses = createDefaultActionStatuses()
		}

		let resolvedStatusId = payload.statusId
		if (!resolvedStatusId || !company.actionStatuses.some((status) => status.id === resolvedStatusId)) {
			resolvedStatusId = company.actionStatuses[0]?.id
		}

		if (!resolvedStatusId) {
			throw new Error("Unable to resolve status for new action item")
		}

		if (payload.ownerEmployeeId) {
			const owner = company.employees.find((entry) => entry.id === payload.ownerEmployeeId)
			if (!owner) {
				throw new Error(`Employee ${payload.ownerEmployeeId} not found in company ${company.id}`)
			}
		}

		const actionItem = withGeneratedIds.actionItem({
			companyId: company.id,
			title: payload.title,
			kind: payload.kind,
			statusId: resolvedStatusId,
			description: payload.description,
			ownerEmployeeId: payload.ownerEmployeeId,
			dueAt: payload.dueAt,
			priority: payload.priority,
			customProperties: payload.customProperties,
		})

		company.actionItems.push(actionItem)
		company.updatedAt = new Date().toISOString()
		await this.persist()
		this.logState("createActionItem", { companyId: company.id, actionItemId: actionItem.id })
		return this.getState()
	}

	public async updateActionItem(payload: UpdateActionItemPayload): Promise<WorkplaceState> {
		const company = this.state.companies.find((entry) => entry.id === payload.companyId)
		if (!company) {
			throw new Error(`Company ${payload.companyId} not found`)
		}

		const index = company.actionItems.findIndex((entry) => entry.id === payload.actionItem.id)
		if (index === -1) {
			throw new Error(`Action item ${payload.actionItem.id} not found in company ${company.id}`)
		}

		if (!company.actionStatuses.some((status) => status.id === payload.actionItem.statusId)) {
			throw new Error(`Status ${payload.actionItem.statusId} not found for company ${company.id}`)
		}

		if (payload.actionItem.ownerEmployeeId) {
			const owner = company.employees.find((entry) => entry.id === payload.actionItem.ownerEmployeeId)
			if (!owner) {
				throw new Error(`Employee ${payload.actionItem.ownerEmployeeId} not found in company ${company.id}`)
			}
		}

		const existing = company.actionItems[index]
		const next: WorkplaceActionItem = {
			...existing,
			title: payload.actionItem.title,
			kind: payload.actionItem.kind,
			statusId: payload.actionItem.statusId,
			description: payload.actionItem.description,
			ownerEmployeeId: payload.actionItem.ownerEmployeeId,
			dueAt: payload.actionItem.dueAt,
			priority: payload.actionItem.priority,
			customProperties: payload.actionItem.customProperties,
			relationIds: payload.actionItem.relationIds ?? existing.relationIds,
			updatedAt: new Date().toISOString(),
			createdAt: existing.createdAt,
			companyId: existing.companyId,
		}

		company.actionItems[index] = next
		company.updatedAt = new Date().toISOString()
		await this.persist()
		this.logState("updateActionItem", { companyId: company.id, actionItemId: next.id })
		return this.getState()
	}

	public async deleteActionItem(payload: DeleteActionItemPayload): Promise<WorkplaceState> {
		const company = this.state.companies.find((entry) => entry.id === payload.companyId)
		if (!company) {
			throw new Error(`Company ${payload.companyId} not found`)
		}

		const initialLength = company.actionItems.length
		company.actionItems = company.actionItems.filter((entry) => entry.id !== payload.actionItemId)
		company.actionRelations = company.actionRelations.filter(
			(entry) =>
				entry.sourceActionItemId !== payload.actionItemId && entry.targetActionItemId !== payload.actionItemId,
		)

		if (company.actionItems.length === initialLength) {
			throw new Error(`Action item ${payload.actionItemId} not found in company ${company.id}`)
		}

		company.updatedAt = new Date().toISOString()
		await this.persist()
		this.logState("deleteActionItem", { companyId: company.id, actionItemId: payload.actionItemId })
		return this.getState()
	}

	public async startActionItems(payload: StartActionItemsPayload): Promise<WorkplaceState> {
		const company = this.state.companies.find((entry) => entry.id === payload.companyId)
		if (!company) {
			throw new Error(`Company ${payload.companyId} not found`)
		}

		if (!company.actionStatuses || company.actionStatuses.length === 0) {
			company.actionStatuses = createDefaultActionStatuses()
		}

		if (payload.scope === "employee" && !payload.employeeId) {
			throw new Error("employeeId is required when starting action items for an employee")
		}

		if (payload.scope === "selection" && (!payload.actionItemIds || payload.actionItemIds.length === 0)) {
			throw new Error("actionItemIds is required when starting selected action items")
		}

		const targetStatusId = this.resolveInProgressStatusId(company)
		if (!targetStatusId) {
			throw new Error("Unable to determine an in-progress status for this company")
		}

		const actionItemIds = new Set(payload.actionItemIds ?? [])
		const initiatedBy = payload.initiatedBy?.trim() || "user"
		const now = new Date().toISOString()
		const statusMap = new Map(company.actionStatuses.map((status) => [status.id, status]))

		const matchesScope = (item: WorkplaceActionItem) => {
			switch (payload.scope) {
				case "company":
					return Boolean(item.ownerEmployeeId)
				case "employee":
					return Boolean(item.ownerEmployeeId && item.ownerEmployeeId === payload.employeeId)
				case "selection":
					return actionItemIds.has(item.id)
				default:
					return false
			}
		}

		const candidates = company.actionItems.filter((item) => matchesScope(item))
		if (candidates.length === 0) {
			return this.getState()
		}

		const startedIds: string[] = []
		for (const item of candidates) {
			const statusInfo = statusMap.get(item.statusId)
			if (statusInfo?.isTerminal) {
				continue
			}
			if (item.statusId !== targetStatusId) {
				item.statusId = targetStatusId
			}
			item.lastStartedAt = now
			item.lastStartedBy = initiatedBy
			item.startCount = (item.startCount ?? 0) + 1
			item.updatedAt = now
			startedIds.push(item.id)
		}

		if (startedIds.length === 0) {
			return this.getState()
		}

		company.updatedAt = now
		await this.persist()
		this.logState("startActionItems", {
			companyId: company.id,
			scope: payload.scope,
			employeeId: payload.employeeId,
			actionItemIds: startedIds,
			initiatedBy,
		})
		return this.getState()
	}

	public async createActionStatus(payload: CreateActionStatusPayload): Promise<WorkplaceState> {
		const company = this.state.companies.find((entry) => entry.id === payload.companyId)
		if (!company) {
			throw new Error(`Company ${payload.companyId} not found`)
		}

		const status = withGeneratedIds.actionStatus({
			name: payload.name,
			order: company.actionStatuses.length,
			color: payload.color,
			isTerminal: payload.isTerminal,
		})

		company.actionStatuses.push(status)
		company.updatedAt = new Date().toISOString()
		await this.persist()
		this.logState("createActionStatus", { companyId: company.id, actionStatusId: status.id })
		return this.getState()
	}

	public async upsertActionStatus(payload: UpsertActionStatusPayload): Promise<WorkplaceState> {
		const company = this.state.companies.find((entry) => entry.id === payload.companyId)
		if (!company) {
			throw new Error(`Company ${payload.companyId} not found`)
		}

		const index = company.actionStatuses.findIndex((entry) => entry.id === payload.status.id)
		if (index === -1) {
			throw new Error(`Action status ${payload.status.id} not found in company ${company.id}`)
		}

		const existing = company.actionStatuses[index]
		const next: WorkplaceActionStatus = {
			...existing,
			name: payload.status.name,
			color: payload.status.color,
			order: payload.status.order,
			isTerminal: payload.status.isTerminal,
			updatedAt: new Date().toISOString(),
		}

		company.actionStatuses[index] = next
		company.updatedAt = new Date().toISOString()
		await this.persist()
		this.logState("upsertActionStatus", { companyId: company.id, actionStatusId: next.id })
		return this.getState()
	}

	private async persist(): Promise<void> {
		await this.context.globalState.update(STORAGE_KEY, this.state)
		this.logState("persist")
	}

	private resolveInProgressStatusId(company: WorkplaceCompany): string | undefined {
		const normalizedLookup = company.actionStatuses
			.map((status) => ({
				status,
				name: status.name?.trim().toLowerCase() ?? "",
			}))
			.filter(({ name }) => name.length > 0)
			.reduce<Record<string, WorkplaceActionStatus>>((acc, entry) => {
				acc[entry.name] = entry.status
				return acc
			}, {})

		const explicit = normalizedLookup["in progress"] ?? normalizedLookup["in-progress"]
		if (explicit) {
			return explicit.id
		}

		const sorted = [...company.actionStatuses].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
		const firstNonTerminal = sorted.find((status) => !status.isTerminal)
		return firstNonTerminal?.id ?? sorted[0]?.id
	}
}

export const createWorkplaceService = async (context: vscode.ExtensionContext) => {
	const service = new WorkplaceService(context)
	await service.initialize()
	return service
}
