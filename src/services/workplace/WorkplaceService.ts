import * as vscode from "vscode"

import {
	CreateCompanyPayload,
	CreateEmployeePayload,
	WorkplaceCompany,
	WorkplaceEmployee,
	WorkplaceState,
	cloneWorkplaceState,
	createExecutiveManagerProfile,
	withGeneratedIds,
} from "../../shared/golden/workplace"

const STORAGE_KEY = "goldenWorkplace.state"

export class WorkplaceService {
	private state: WorkplaceState

	constructor(private readonly context: vscode.ExtensionContext) {
		this.state = this.context.globalState.get<WorkplaceState>(STORAGE_KEY) ?? { companies: [] }
	}

	public getState(): WorkplaceState {
		return cloneWorkplaceState(this.state)
	}

	public async initialize(): Promise<void> {
		if (this.state.companies.length === 0) {
			return
		}

		// Ensure every company retains an executive manager reference
		let mutated = false
		this.state.companies = this.state.companies.map((company) => {
			if (!company.executiveManagerId) {
				const executive = company.employees.find((emp) => emp.isExecutiveManager)
				if (executive) {
					company.executiveManagerId = executive.id
					mutated = true
				}
			}
			return company
		})

		if (!this.state.activeCompanyId) {
			this.state.activeCompanyId = this.state.companies[0]?.id
			mutated = true
		}

		if (mutated) {
			await this.persist()
		}
	}

	public async createCompany(payload: CreateCompanyPayload): Promise<WorkplaceState> {
		const company = withGeneratedIds.company(payload)
		const executiveDraft = createExecutiveManagerProfile(payload.name)
		const executive = withGeneratedIds.employee({ ...executiveDraft, isExecutiveManager: true })

		company.executiveManagerId = executive.id
		company.employees.push(executive)

		this.state.companies.push(company)
		this.state.activeCompanyId = company.id
		await this.persist()
		return this.getState()
	}

	public async setActiveCompany(companyId: string | undefined): Promise<WorkplaceState> {
		this.state.activeCompanyId = companyId
		await this.persist()
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
		}

		company.employees.push(employee)
		company.updatedAt = new Date().toISOString()
		await this.persist()
		return this.getState()
	}

	public async updateEmployee(companyId: string, employee: WorkplaceEmployee): Promise<WorkplaceState> {
		const company = this.state.companies.find((c) => c.id === companyId)
		if (!company) {
			throw new Error(`Company ${companyId} not found`)
		}

		const idx = company.employees.findIndex((e) => e.id === employee.id)
		if (idx === -1) {
			throw new Error(`Employee ${employee.id} not found`)
		}

		const updated: WorkplaceEmployee = { ...employee, updatedAt: new Date().toISOString() }

		company.employees[idx] = updated

		if (updated.isExecutiveManager) {
			company.executiveManagerId = updated.id
			company.employees = company.employees.map((member, index) =>
				index === idx ? updated : { ...member, isExecutiveManager: false },
			)
		}

		company.updatedAt = new Date().toISOString()
		await this.persist()
		return this.getState()
	}

	private async persist(): Promise<void> {
		await this.context.globalState.update(STORAGE_KEY, this.state)
	}
}

export const createWorkplaceService = async (context: vscode.ExtensionContext) => {
	const service = new WorkplaceService(context)
	await service.initialize()
	return service
}
