import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ExtensionContext, Memento } from "vscode"

import { createWorkplaceService } from "../WorkplaceService"
import type {
	WorkplaceState,
	WorkplaceCompany,
	WorkplaceEmployee,
	WorkplaceActionItem,
	WorkplaceActionStatus,
} from "../../../shared/golden/workplace"

vi.mock("vscode", () => ({
	window: {
		showErrorMessage: vi.fn(),
		showInformationMessage: vi.fn(),
	},
	workspace: {},
	commands: { executeCommand: vi.fn() },
}))

const STORAGE_KEY = "goldenWorkplace.state"

const baseTimestamp = "2025-09-01T00:00:00.000Z"

const buildEmployee = (overrides: Partial<WorkplaceEmployee>): WorkplaceEmployee => ({
	id: "employee",
	name: "Employee",
	role: "Role",
	createdAt: baseTimestamp,
	updatedAt: baseTimestamp,
	isExecutiveManager: false,
	personaMode: undefined,
	deletedAt: undefined,
	...overrides,
})

const buildActionStatus = (overrides: Partial<WorkplaceActionStatus>): WorkplaceActionStatus => ({
	id: "status",
	name: "Status",
	order: 0,
	isTerminal: false,
	color: undefined,
	createdAt: baseTimestamp,
	updatedAt: baseTimestamp,
	...overrides,
})

const buildActionItem = (overrides: Partial<WorkplaceActionItem>): WorkplaceActionItem => ({
	id: "action",
	companyId: "company-1",
	title: "Action",
	kind: "task",
	statusId: "status-not-started",
	description: undefined,
	ownerEmployeeId: "employee-1",
	dueAt: undefined,
	priority: undefined,
	customProperties: undefined,
	createdAt: baseTimestamp,
	updatedAt: baseTimestamp,
	relationIds: [],
	lastStartedAt: undefined,
	lastStartedBy: undefined,
	startCount: undefined,
	...overrides,
})

const createInitialCompany = (): WorkplaceCompany => {
	const employees: WorkplaceEmployee[] = [
		buildEmployee({ id: "employee-1", name: "Alice", role: "Engineer", isExecutiveManager: true }),
		buildEmployee({ id: "employee-2", name: "Bob", role: "Designer" }),
	]

	const statuses: WorkplaceActionStatus[] = [
		buildActionStatus({ id: "status-not-started", name: "Not Started", order: 0 }),
		buildActionStatus({ id: "status-in-progress", name: "In Progress", order: 1 }),
		buildActionStatus({ id: "status-complete", name: "Complete", order: 2, isTerminal: true }),
	]

	const actionItems: WorkplaceActionItem[] = [
		buildActionItem({ id: "action-1", ownerEmployeeId: "employee-1" }),
		buildActionItem({ id: "action-2", ownerEmployeeId: "employee-1", statusId: "status-complete" }),
		buildActionItem({ id: "action-3", ownerEmployeeId: "employee-2" }),
		buildActionItem({ id: "action-4", ownerEmployeeId: undefined }),
	]

	return {
		id: "company-1",
		name: "Acme Corp",
		vision: "",
		mission: "",
		ownerProfile: { name: "", role: "Owner & CEO" },
		createdAt: baseTimestamp,
		updatedAt: baseTimestamp,
		executiveManagerId: "employee-1",
		activeEmployeeId: "employee-1",
		employees,
		departments: [],
		teams: [],
		actionStatuses: statuses,
		actionItems,
		actionRelations: [],
	}
}

const createInitialState = (): WorkplaceState => ({
	companies: [createInitialCompany()],
	activeCompanyId: "company-1",
	activeEmployeeId: "employee-1",
	ownerProfileDefaults: undefined,
})

const createMockContext = (initialState: WorkplaceState) => {
	let state = initialState

	const memento: Memento = {
		get: vi.fn((key: string) => (key === STORAGE_KEY ? state : undefined)),
		update: vi.fn(async (key: string, value: unknown) => {
			if (key === STORAGE_KEY) {
				state = value as WorkplaceState
			}
		}),
		keys: vi.fn(() => []),
	}

	return {
		globalState: memento,
		workspaceState: {
			get: vi.fn(),
			update: vi.fn(),
			keys: vi.fn(() => []),
		},
	} as unknown as ExtensionContext
}

describe("WorkplaceService.startActionItems", () => {
	let context: ExtensionContext

	beforeEach(() => {
		context = createMockContext(createInitialState())
	})

	it("starts all assigned action items when scope is company", async () => {
		const service = await createWorkplaceService(context)
		await service.startActionItems({ companyId: "company-1", scope: "company", initiatedBy: "user" })
		const company = service.getState().companies[0]
		const inProgressId = "status-in-progress"

		const started = company.actionItems.find((item) => item.id === "action-1")
		expect(started?.statusId).toBe(inProgressId)
		expect(started?.lastStartedAt).toBeTruthy()
		expect(started?.lastStartedBy).toBe("user")
		expect(started?.startCount).toBe(1)

		const untouchedTerminal = company.actionItems.find((item) => item.id === "action-2")
		expect(untouchedTerminal?.statusId).toBe("status-complete")
		expect(untouchedTerminal?.startCount ?? 0).toBe(0)

		const unassigned = company.actionItems.find((item) => item.id === "action-4")
		expect(unassigned?.statusId).toBe("status-not-started")
		expect(unassigned?.startCount ?? 0).toBe(0)
	})

	it("increments start count when running the same employee twice", async () => {
		const service = await createWorkplaceService(context)
		await service.startActionItems({
			companyId: "company-1",
			scope: "employee",
			employeeId: "employee-2",
			initiatedBy: "user",
		})
		await service.startActionItems({
			companyId: "company-1",
			scope: "employee",
			employeeId: "employee-2",
			initiatedBy: "user",
		})

		const company = service.getState().companies[0]
		const employeeTask = company.actionItems.find((item) => item.id === "action-3")
		expect(employeeTask?.statusId).toBe("status-in-progress")
		expect(employeeTask?.startCount).toBe(2)
	})

	it("allows selection scope to start unassigned tasks", async () => {
		const service = await createWorkplaceService(context)
		await service.startActionItems({
			companyId: "company-1",
			scope: "selection",
			actionItemIds: ["action-4"],
			initiatedBy: "user",
		})

		const company = service.getState().companies[0]
		const unassigned = company.actionItems.find((item) => item.id === "action-4")
		expect(unassigned?.statusId).toBe("status-in-progress")
		expect(unassigned?.startCount).toBe(1)
	})
})
