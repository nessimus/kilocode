import { v4 as uuid } from "uuid";
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
];
export const createExecutiveManagerProfile = (companyName) => ({
    name: "Executive Manager",
    role: "Executive Manager",
    description: `Primary orchestrator helping ${companyName} scale its AI workforce.`,
    personality: "Strategic, supportive, focused on alignment and growth.",
});
const defaultActionStatusSeeds = [
    { name: "Not Started", order: 0 },
    { name: "In Progress", order: 1 },
    { name: "Blocked", order: 2 },
    { name: "In Review", order: 3 },
    { name: "Complete", order: 4, isTerminal: true },
];
export const createDefaultActionStatuses = () => {
    const now = new Date().toISOString();
    return defaultActionStatusSeeds.map((seed, index) => ({
        id: uuid(),
        name: seed.name,
        color: undefined,
        order: seed.order ?? index,
        isTerminal: seed.isTerminal,
        createdAt: now,
        updatedAt: now,
    }));
};
export const createDefaultWorkdayState = () => ({
    status: "idle",
    autoStartActionItems: true,
    activeEmployeeIds: [],
    bypassedEmployeeIds: [],
    employeeSchedules: [],
});
export const withGeneratedIds = {
    company(payload) {
        const now = new Date().toISOString();
        return {
            id: uuid(),
            name: payload.name,
            emoji: payload.emoji,
            description: payload.description,
            vision: payload.vision,
            mission: payload.mission,
            isFavorite: false,
            ownerProfile: payload.ownerProfile ?? {
                name: "",
                role: "Owner & CEO",
                firstName: undefined,
                lastName: undefined,
            },
            createdAt: now,
            updatedAt: now,
            executiveManagerId: "",
            activeEmployeeId: undefined,
            employees: [],
            departments: [],
            teams: [],
            actionStatuses: [],
            actionItems: [],
            actionRelations: [],
            shifts: [],
            workday: createDefaultWorkdayState(),
        };
    },
    employee(payload) {
        const now = new Date().toISOString();
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
        };
    },
    department(payload) {
        const now = new Date().toISOString();
        return {
            id: uuid(),
            name: payload.name,
            description: payload.description,
            teamIds: [],
            teamLinks: [],
            createdAt: now,
            updatedAt: now,
            deletedAt: undefined,
        };
    },
    team(payload) {
        const now = new Date().toISOString();
        return {
            id: uuid(),
            name: payload.name,
            description: payload.description,
            employeeIds: [],
            memberships: [],
            createdAt: now,
            updatedAt: now,
            deletedAt: undefined,
        };
    },
    actionItem(payload) {
        const now = new Date().toISOString();
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
            lastStartedAt: undefined,
            lastStartedBy: undefined,
            startCount: 0,
        };
    },
    actionStatus(payload) {
        const now = new Date().toISOString();
        return {
            id: uuid(),
            name: payload.name,
            order: payload.order,
            color: payload.color,
            isTerminal: payload.isTerminal,
            createdAt: now,
            updatedAt: now,
        };
    },
};
export const cloneWorkplaceState = (state) => JSON.parse(JSON.stringify(state));
//# sourceMappingURL=workplace.js.map
