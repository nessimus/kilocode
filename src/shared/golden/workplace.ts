import { v4 as uuid } from "uuid"

export interface WorkplaceEmployee {
	id: string
	name: string
	role: string
	description?: string
	personality?: string
	profileImageUrl?: string
	createdAt: string
	updatedAt: string
	isExecutiveManager?: boolean
}

export interface WorkplaceTeam {
	id: string
	name: string
	description?: string
	employeeIds: string[]
	createdAt: string
	updatedAt: string
}

export interface WorkplaceDepartment {
	id: string
	name: string
	description?: string
	teamIds: string[]
	createdAt: string
	updatedAt: string
}

export interface WorkplaceCompany {
	id: string
	name: string
	vision?: string
	mission?: string
	createdAt: string
	updatedAt: string
	executiveManagerId: string
	employees: WorkplaceEmployee[]
	departments: WorkplaceDepartment[]
	teams: WorkplaceTeam[]
}

export interface WorkplaceState {
	companies: WorkplaceCompany[]
	activeCompanyId?: string
}

export interface CreateCompanyPayload {
	name: string
	vision?: string
	mission?: string
}

export interface CreateEmployeePayload {
	companyId: string
	name: string
	role: string
	description?: string
	personality?: string
	isExecutiveManager?: boolean
}

export const createExecutiveManagerProfile = (companyName: string) => ({
	name: "Executive Manager",
	role: "Executive Manager",
	description: `Primary orchestrator helping ${companyName} scale its AI workforce.`,
	personality: "Strategic, supportive, focused on alignment and growth.",
})

export const withGeneratedIds = {
	company(payload: CreateCompanyPayload) {
		const now = new Date().toISOString()
		return {
			id: uuid(),
			name: payload.name,
			vision: payload.vision,
			mission: payload.mission,
			createdAt: now,
			updatedAt: now,
			executiveManagerId: "",
			employees: [] as WorkplaceEmployee[],
			departments: [] as WorkplaceDepartment[],
			teams: [] as WorkplaceTeam[],
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
			createdAt: now,
			updatedAt: now,
			isExecutiveManager: payload.isExecutiveManager ?? false,
		}
	},
}

export const cloneWorkplaceState = (state: WorkplaceState): WorkplaceState => JSON.parse(JSON.stringify(state))
