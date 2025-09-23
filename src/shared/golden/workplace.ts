import { v4 as uuid } from "uuid"

export const MBTI_TYPES = [
	"INTJ",
	"INTP",
	"ENTJ",
	"ENTP",
	"INFJ",
	"INFP",
	"ENFJ",
	"ENFP",
	"ISTJ",
	"ISFJ",
	"ESTJ",
	"ESFJ",
	"ISTP",
	"ISFP",
	"ESTP",
	"ESFP",
] as const

export type MbtiType = (typeof MBTI_TYPES)[number]

export interface WorkplacePersonaMode {
	id: string
	name: string
	/**
	 * Optional short summary surfaced in the UI.
	 */
	summary?: string
	/**
	 * Primary instruction block for this employee's agent behavior.
	 */
	instructions: string
	/**
	 * Optional base mode slug to inherit tooling policies from while we migrate off global modes.
	 */
	baseModeSlug?: string
	/**
	 * Explicit tool group allow-list. When provided, overrides the base mode configuration.
	 */
	allowedToolGroups?: string[]
	/**
	 * Optional provider profile identifier to activate when this persona is in focus.
	 */
	providerProfileId?: string
	createdAt: string
	updatedAt: string
}

export interface WorkplaceTeamMembership {
	employeeId: string
	addedAt: string
	removedAt?: string
}

export interface WorkplaceDepartmentTeamLink {
	teamId: string
	linkedAt: string
	unlinkedAt?: string
}

export interface WorkplaceEmployee {
	id: string
	name: string
	role: string
	description?: string
	personality?: string
	mbtiType?: MbtiType
	personalityTraits?: string[]
	profileImageUrl?: string
	customAttributes?: Record<string, string>
	createdAt: string
	updatedAt: string
	isExecutiveManager?: boolean
	personaMode?: WorkplacePersonaMode
	deletedAt?: string | null
}

export type WorkplaceActionItemKind = "goal" | "project" | "task"

export interface WorkplaceActionStatus {
	id: string
	name: string
	color?: string
	order: number
	isTerminal?: boolean
	createdAt: string
	updatedAt: string
}

export interface WorkplaceActionRelation {
	id: string
	sourceActionItemId: string
	targetActionItemId: string
	type: "dependsOn" | "relatedTo" | "parentOf"
	createdAt: string
	updatedAt: string
}

export interface WorkplaceActionItem {
	id: string
	companyId: string
	title: string
	kind: WorkplaceActionItemKind
	statusId: string
	description?: string
	ownerEmployeeId?: string
	dueAt?: string
	priority?: "low" | "medium" | "high" | "urgent"
	customProperties?: Record<string, string | number | boolean | string[]>
	createdAt: string
	updatedAt: string
	relationIds: string[]
	lastStartedAt?: string
	lastStartedBy?: string
	startCount?: number
}

export interface WorkplaceOwnerProfile {
	name: string
	role: string
	firstName?: string
	lastName?: string
	bio?: string
	mbtiType?: MbtiType
	personalityTraits?: string[]
}

export interface WorkplaceTeam {
	id: string
	name: string
	description?: string
	employeeIds: string[]
	memberships: WorkplaceTeamMembership[]
	createdAt: string
	updatedAt: string
	deletedAt?: string | null
}

export interface WorkplaceDepartment {
	id: string
	name: string
	description?: string
	teamIds: string[]
	teamLinks: WorkplaceDepartmentTeamLink[]
	createdAt: string
	updatedAt: string
	deletedAt?: string | null
}

export interface WorkplaceCompany {
	id: string
	name: string
	vision?: string
	mission?: string
	ownerProfile?: WorkplaceOwnerProfile
	createdAt: string
	updatedAt: string
	executiveManagerId: string
	activeEmployeeId?: string
	employees: WorkplaceEmployee[]
	departments: WorkplaceDepartment[]
	teams: WorkplaceTeam[]
	actionStatuses: WorkplaceActionStatus[]
	actionItems: WorkplaceActionItem[]
	actionRelations: WorkplaceActionRelation[]
}

export interface WorkplaceState {
	companies: WorkplaceCompany[]
	activeCompanyId?: string
	activeEmployeeId?: string
	ownerProfileDefaults?: WorkplaceOwnerProfile
}

export interface CreateCompanyPayload {
	name: string
	vision?: string
	mission?: string
	ownerProfile?: WorkplaceOwnerProfile
	updateDefaultOwnerProfile?: boolean
}

export interface UpdateCompanyPayload {
	id: string
	name: string
	vision?: string
	mission?: string
	ownerProfile?: WorkplaceOwnerProfile
	updateDefaultOwnerProfile?: boolean
}

export interface CreateEmployeePayload {
	companyId: string
	name: string
	role: string
	description?: string
	personality?: string
	mbtiType?: MbtiType
	personalityTraits?: string[]
	profileImageUrl?: string
	isExecutiveManager?: boolean
	customAttributes?: Record<string, string>
}

export interface UpdateEmployeePayload {
	companyId: string
	employee: WorkplaceEmployee
}

export interface ArchiveEmployeePayload {
	companyId: string
	employeeId: string
}

export interface CreateDepartmentPayload {
	companyId: string
	name: string
	description?: string
}

export interface UpdateDepartmentPayload {
	companyId: string
	department: WorkplaceDepartment
}

export interface ArchiveDepartmentPayload {
	companyId: string
	departmentId: string
}

export interface CreateTeamPayload {
	companyId: string
	name: string
	description?: string
	departmentId?: string
}

export interface UpdateTeamPayload {
	companyId: string
	team: WorkplaceTeam
}

export interface ArchiveTeamPayload {
	companyId: string
	teamId: string
}

export interface AssignTeamToDepartmentPayload {
	companyId: string
	teamId: string
	departmentId?: string
}

export interface RemoveTeamFromDepartmentPayload {
	companyId: string
	teamId: string
	departmentId: string
}

export interface AssignEmployeeToTeamPayload {
	companyId: string
	teamId: string
	employeeId: string
}

export interface RemoveEmployeeFromTeamPayload {
	companyId: string
	teamId: string
	employeeId: string
}

export interface CreateActionItemPayload {
	companyId: string
	title: string
	kind: WorkplaceActionItemKind
	statusId?: string
	description?: string
	ownerEmployeeId?: string
	dueAt?: string
	priority?: "low" | "medium" | "high" | "urgent"
	customProperties?: Record<string, string | number | boolean | string[]>
}

export interface UpdateActionItemPayload {
	companyId: string
	actionItem: WorkplaceActionItem
}

export interface DeleteActionItemPayload {
	companyId: string
	actionItemId: string
}

export type WorkplaceActionStartScope = "company" | "employee" | "selection"

export interface StartActionItemsPayload {
	companyId: string
	scope: WorkplaceActionStartScope
	employeeId?: string
	actionItemIds?: string[]
	initiatedBy?: string
}

export interface UpsertActionStatusPayload {
	companyId: string
	status: WorkplaceActionStatus
}

export interface CreateActionStatusPayload {
	companyId: string
	name: string
	color?: string
	isTerminal?: boolean
}

export const createExecutiveManagerProfile = (companyName: string) => ({
	name: "Executive Manager",
	role: "Executive Manager",
	description: `Primary orchestrator helping ${companyName} scale its AI workforce.`,
	personality: "Strategic, supportive, focused on alignment and growth.",
})

const defaultActionStatusSeeds = [
	{ name: "Not Started", order: 0 },
	{ name: "In Progress", order: 1 },
	{ name: "Blocked", order: 2 },
	{ name: "In Review", order: 3 },
	{ name: "Complete", order: 4, isTerminal: true },
]

export const createDefaultActionStatuses = () => {
	const now = new Date().toISOString()
	return defaultActionStatusSeeds.map((seed, index) => ({
		id: uuid(),
		name: seed.name,
		color: undefined as string | undefined,
		order: seed.order ?? index,
		isTerminal: seed.isTerminal,
		createdAt: now,
		updatedAt: now,
	}))
}

export const withGeneratedIds = {
	company(payload: CreateCompanyPayload) {
		const now = new Date().toISOString()
		return {
			id: uuid(),
			name: payload.name,
			vision: payload.vision,
			mission: payload.mission,
			ownerProfile: payload.ownerProfile ?? {
				name: "",
				role: "Owner & CEO",
				firstName: undefined,
				lastName: undefined,
			},
			createdAt: now,
			updatedAt: now,
			executiveManagerId: "",
			activeEmployeeId: undefined as string | undefined,
			employees: [] as WorkplaceEmployee[],
			departments: [] as WorkplaceDepartment[],
			teams: [] as WorkplaceTeam[],
			actionStatuses: [] as WorkplaceActionStatus[],
			actionItems: [] as WorkplaceActionItem[],
			actionRelations: [] as WorkplaceActionRelation[],
		}
	},
	employee(payload: Omit<CreateEmployeePayload, "companyId">) {
		const now = new Date().toISOString()
		return {
			id: uuid(),
			name: payload.name,
			role: payload.role,
			description: payload.description,
			personality: payload.personality,
			mbtiType: payload.mbtiType,
			personalityTraits: payload.personalityTraits,
			profileImageUrl: payload.profileImageUrl,
			customAttributes: payload.customAttributes,
			createdAt: now,
			updatedAt: now,
			isExecutiveManager: payload.isExecutiveManager ?? false,
			personaMode: undefined,
			deletedAt: undefined,
		}
	},
	department(payload: Omit<CreateDepartmentPayload, "companyId">) {
		const now = new Date().toISOString()
		return {
			id: uuid(),
			name: payload.name,
			description: payload.description,
			teamIds: [] as string[],
			teamLinks: [] as WorkplaceDepartmentTeamLink[],
			createdAt: now,
			updatedAt: now,
			deletedAt: undefined,
		}
	},
	team(payload: Omit<CreateTeamPayload, "companyId" | "departmentId">) {
		const now = new Date().toISOString()
		return {
			id: uuid(),
			name: payload.name,
			description: payload.description,
			employeeIds: [] as string[],
			memberships: [] as WorkplaceTeamMembership[],
			createdAt: now,
			updatedAt: now,
			deletedAt: undefined,
		}
	},
	actionItem(payload: Omit<CreateActionItemPayload, "companyId"> & { companyId: string; statusId: string }) {
		const now = new Date().toISOString()
		return {
			id: uuid(),
			companyId: payload.companyId,
			title: payload.title,
			kind: payload.kind,
			statusId: payload.statusId,
			description: payload.description,
			ownerEmployeeId: payload.ownerEmployeeId,
			dueAt: payload.dueAt,
			priority: payload.priority,
			customProperties: payload.customProperties,
			createdAt: now,
			updatedAt: now,
			relationIds: [],
			lastStartedAt: undefined as string | undefined,
			lastStartedBy: undefined as string | undefined,
			startCount: 0,
		}
	},
	actionStatus(payload: { name: string; order: number; color?: string; isTerminal?: boolean }) {
		const now = new Date().toISOString()
		return {
			id: uuid(),
			name: payload.name,
			order: payload.order,
			color: payload.color,
			isTerminal: payload.isTerminal,
			createdAt: now,
			updatedAt: now,
		}
	},
}

export const cloneWorkplaceState = (state: WorkplaceState): WorkplaceState => JSON.parse(JSON.stringify(state))
