import { v4 as uuid } from "uuid";
import { cloneWorkplaceState, createDefaultActionStatuses, createDefaultWorkdayState, createExecutiveManagerProfile, withGeneratedIds, } from "../../shared/golden/workplace";
const STORAGE_KEY = "goldenWorkplace.state";
const ENABLE_WORKPLACE_DEBUG_LOGS = false;
const debugLog = (...args) => {
    if (!ENABLE_WORKPLACE_DEBUG_LOGS) {
        return;
    }
    console.debug("[WorkplaceService]", ...args);
};
const sanitizeOptionalText = (value) => {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};
const DAY_OF_WEEK_VALUES = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
];
const DAY_OF_WEEK_SET = new Set(DAY_OF_WEEK_VALUES);
export class WorkplaceService {
    context;
    state;
    stateObserver;
    constructor(context) {
        this.context = context;
        const stored = this.context.globalState.get(STORAGE_KEY);
        this.state = stored
            ? {
                ...stored,
                ownerProfileDefaults: stored.ownerProfileDefaults
                    ? this.sanitizeOwnerProfile(stored.ownerProfileDefaults)
                    : stored.ownerProfileDefaults,
            }
            : { companies: [] };
    }
    sanitizeOwnerProfile(profile) {
        const name = profile.name?.trim() ?? "";
        const role = profile.role?.trim() || "Owner & CEO";
        const traits = profile.personalityTraits?.map((trait) => trait.trim()).filter((trait) => trait.length > 0);
        const bio = profile.bio?.trim();
        let firstName = profile.firstName?.trim();
        let lastName = profile.lastName?.trim();
        if (name) {
            const parts = name
                .split(/\s+/)
                .map((segment) => segment.trim())
                .filter(Boolean);
            if (parts.length > 0 && !firstName) {
                ;
                [firstName] = parts;
            }
            if (parts.length > 1 && !lastName) {
                lastName = parts.slice(1).join(" ");
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
        };
    }
    resolveOwnerProfileForNewCompany(ownerProfile) {
        const defaults = this.state.ownerProfileDefaults;
        const combined = {
            name: ownerProfile?.name ?? defaults?.name ?? "",
            role: ownerProfile?.role ?? defaults?.role ?? "Owner & CEO",
            firstName: ownerProfile?.firstName ?? defaults?.firstName,
            lastName: ownerProfile?.lastName ?? defaults?.lastName,
            mbtiType: ownerProfile?.mbtiType ?? defaults?.mbtiType,
            personalityTraits: ownerProfile?.personalityTraits ?? defaults?.personalityTraits,
            bio: ownerProfile?.bio ?? defaults?.bio,
        };
        return this.sanitizeOwnerProfile(combined);
    }
    updateOwnerProfileDefaults(next) {
        const sanitized = this.sanitizeOwnerProfile(next);
        this.state.ownerProfileDefaults = sanitized;
        return sanitized;
    }
    async setOwnerProfileDefaults(profile) {
        const sanitizedDefaults = this.updateOwnerProfileDefaults(profile);
        const now = new Date().toISOString();
        for (const company of this.state.companies) {
            const existingProfile = company.ownerProfile;
            const baseline = existingProfile
                ? this.sanitizeOwnerProfile(existingProfile)
                : sanitizedDefaults;
            const mergedProfile = {
                ...baseline,
                ...sanitizedDefaults,
            };
            company.ownerProfile = mergedProfile;
            company.updatedAt = now;
        }
        await this.persist();
        this.logState("setOwnerProfileDefaults");
        return this.getState();
    }
    normalizeMinutes(value) {
        if (typeof value !== "number" || Number.isNaN(value)) {
            return undefined;
        }
        const rounded = Math.round(value);
        if (rounded < 0 || rounded >= 24 * 60) {
            return undefined;
        }
        return rounded;
    }
    normalizeIsoTimestamp(value) {
        if (typeof value !== "string") {
            return undefined;
        }
        const trimmed = value.trim();
        if (!trimmed) {
            return undefined;
        }
        const date = new Date(trimmed);
        if (Number.isNaN(date.getTime())) {
            return undefined;
        }
        return date.toISOString();
    }
    sanitizeShiftRecurrence(recurrence) {
        if (!recurrence || typeof recurrence !== "object") {
            return undefined;
        }
        const record = recurrence;
        if (record.type !== "weekly") {
            return undefined;
        }
        const interval = typeof record.interval === "number" && Number.isFinite(record.interval)
            ? Math.min(12, Math.max(1, Math.trunc(record.interval)))
            : 1;
        const weekdays = Array.isArray(record.weekdays)
            ? Array.from(new Set(record.weekdays.filter((day) => DAY_OF_WEEK_SET.has(day))))
            : [];
        const until = this.normalizeIsoTimestamp(record.until);
        return {
            type: "weekly",
            interval,
            weekdays,
            ...(until ? { until } : {}),
        };
    }
    sanitizeCompanyShifts(company) {
        const shifts = Array.isArray(company.shifts) ? company.shifts : [];
        const activeEmployeeIds = new Set(company.employees.filter((employee) => !employee.deletedAt).map((employee) => employee.id));
        const seen = new Set();
        const nowIso = new Date().toISOString();
        const sanitized = [];
        for (const entry of shifts) {
            if (!entry || typeof entry !== "object") {
                continue;
            }
            const raw = entry;
            const id = typeof raw.id === "string" && raw.id.trim().length > 0 ? raw.id.trim() : uuid();
            if (seen.has(id)) {
                continue;
            }
            const employeeId = typeof raw.employeeId === "string" ? raw.employeeId : undefined;
            if (!employeeId || !activeEmployeeIds.has(employeeId)) {
                continue;
            }
            const start = this.normalizeIsoTimestamp(raw.start);
            const end = this.normalizeIsoTimestamp(raw.end);
            if (!start || !end) {
                continue;
            }
            if (new Date(end).getTime() <= new Date(start).getTime()) {
                continue;
            }
            const recurrence = this.sanitizeShiftRecurrence(raw.recurrence);
            const name = sanitizeOptionalText(raw.name);
            const description = sanitizeOptionalText(raw.description);
            const timezone = sanitizeOptionalText(raw.timezone);
            const createdAt = this.normalizeIsoTimestamp(raw.createdAt) ?? nowIso;
            const updatedAt = this.normalizeIsoTimestamp(raw.updatedAt) ?? createdAt;
            sanitized.push({
                id,
                companyId: company.id,
                employeeId,
                name,
                description,
                timezone,
                start,
                end,
                recurrence,
                createdAt,
                updatedAt,
            });
            seen.add(id);
        }
        sanitized.sort((a, b) => a.start.localeCompare(b.start));
        company.shifts = sanitized;
        return sanitized;
    }
    sanitizeWorkdayState(company) {
        const nowIso = new Date().toISOString();
        const existing = company.workday ?? createDefaultWorkdayState();
        const activeEmployees = company.employees.filter((employee) => !employee.deletedAt);
        const activeEmployeeIds = new Set(activeEmployees.map((employee) => employee.id));
        const scheduleLookup = new Map((existing.employeeSchedules ?? []).map((schedule) => [schedule.employeeId, schedule]));
        const sanitizedSchedules = activeEmployees.map((employee) => {
            const current = scheduleLookup.get(employee.id);
            const normalizedAvailability = (() => {
                const availability = current?.availability;
                if (availability === "suspended" || availability === "on_call" || availability === "flexible") {
                    return availability;
                }
                return "available";
            })();
            const normalizedWorkdays = Array.isArray(current?.workdays)
                ? current.workdays.filter((day) => DAY_OF_WEEK_SET.has(day))
                : undefined;
            return {
                employeeId: employee.id,
                availability: normalizedAvailability,
                timezone: current?.timezone,
                weeklyHoursTarget: typeof current?.weeklyHoursTarget === "number" && Number.isFinite(current.weeklyHoursTarget)
                    ? current.weeklyHoursTarget
                    : undefined,
                workdays: normalizedWorkdays,
                dailyStartMinute: this.normalizeMinutes(current?.dailyStartMinute),
                dailyEndMinute: this.normalizeMinutes(current?.dailyEndMinute),
                lastUpdatedAt: current?.lastUpdatedAt ?? nowIso,
            };
        });
        const sanitizedScheduleMap = new Map(sanitizedSchedules.map((schedule) => [schedule.employeeId, schedule]));
        const sanitizedActiveIds = (existing.activeEmployeeIds ?? [])
            .filter((id) => typeof id === "string" && activeEmployeeIds.has(id))
            .filter((id) => sanitizedScheduleMap.get(id)?.availability !== "suspended");
        const sanitizedBypassedIds = (existing.bypassedEmployeeIds ?? [])
            .filter((id) => typeof id === "string" && activeEmployeeIds.has(id));
        const status = existing.status === "active" || existing.status === "paused" ? existing.status : "idle";
        const sanitized = {
            status,
            startedAt: existing.startedAt,
            haltedAt: existing.haltedAt,
            autoStartActionItems: typeof existing.autoStartActionItems === "boolean"
                ? existing.autoStartActionItems
                : true,
            activeEmployeeIds: sanitizedActiveIds,
            bypassedEmployeeIds: sanitizedBypassedIds,
            employeeSchedules: sanitizedSchedules,
            lastActivationReason: existing.lastActivationReason,
        };
        company.workday = sanitized;
        return sanitized;
    }
    resolveActiveEmployeesForWorkday(company, explicitIds) {
        const workday = this.sanitizeWorkdayState(company);
        const eligibleEmployees = company.employees.filter((employee) => !employee.deletedAt);
        const employeeOrder = eligibleEmployees.map((employee) => employee.id);
        const validIds = new Set(employeeOrder);
        let baseline;
        if (explicitIds && explicitIds.length) {
            baseline = new Set(explicitIds.filter((id) => validIds.has(id)));
        }
        else {
            baseline = new Set(workday.employeeSchedules
                .filter((schedule) => (schedule.availability === "available" || schedule.availability === "flexible") &&
                validIds.has(schedule.employeeId))
                .map((schedule) => schedule.employeeId));
        }
        for (const schedule of workday.employeeSchedules) {
            if (schedule.availability === "flexible" && validIds.has(schedule.employeeId)) {
                baseline.add(schedule.employeeId);
            }
        }
        const ordered = [];
        for (const id of employeeOrder) {
            if (baseline.has(id)) {
                ordered.push(id);
            }
        }
        return ordered;
    }
    logState(action, details) {
        if (!ENABLE_WORKPLACE_DEBUG_LOGS) {
            return;
        }
        const companySummaries = this.state.companies.map((company) => ({
            id: company.id,
            name: company.name,
            activeEmployeeId: company.activeEmployeeId,
            executiveManagerId: company.executiveManagerId,
            employeeCount: company.employees.length,
        }));
        debugLog("state", {
            action,
            state: {
                activeCompanyId: this.state.activeCompanyId,
                activeEmployeeId: this.state.activeEmployeeId,
                companies: companySummaries,
            },
            ...(details ?? {}),
        });
    }
    attachStateObserver(observer) {
        this.stateObserver = observer;
    }
    getState() {
        const snapshot = cloneWorkplaceState(this.state);
        debugLog("getState", {
            companyCount: snapshot.companies.length,
            companyNames: snapshot.companies.map((company) => company.name),
        });
        return snapshot;
    }
    resolveActiveEmployeeId(company) {
        if (!company) {
            return undefined;
        }
        const activeEmployees = company.employees.filter((employee) => !employee.deletedAt);
        if (!activeEmployees.length) {
            return undefined;
        }
        if (company.activeEmployeeId && activeEmployees.some((employee) => employee.id === company.activeEmployeeId)) {
            return company.activeEmployeeId;
        }
        if (company.executiveManagerId &&
            activeEmployees.some((employee) => employee.id === company.executiveManagerId)) {
            return company.executiveManagerId;
        }
        const executive = activeEmployees.find((employee) => employee.isExecutiveManager);
        if (executive) {
            return executive.id;
        }
        return activeEmployees[0]?.id;
    }
    attachTeamToDepartment(company, teamId, departmentId) {
        const now = new Date().toISOString();
        for (const department of company.departments) {
            const isTarget = department.id === departmentId;
            let didMutate = false;
            department.teamLinks = department.teamLinks ?? [];
            const activeLinkIndex = department.teamLinks.findIndex((link) => link.teamId === teamId && !link.unlinkedAt);
            if (isTarget) {
                if (activeLinkIndex === -1) {
                    const existingArchivedIndex = department.teamLinks.findIndex((link) => link.teamId === teamId && link.unlinkedAt);
                    if (existingArchivedIndex !== -1) {
                        department.teamLinks[existingArchivedIndex] = {
                            ...department.teamLinks[existingArchivedIndex],
                            linkedAt: now,
                            unlinkedAt: undefined,
                        };
                    }
                    else {
                        department.teamLinks.push({ teamId, linkedAt: now, unlinkedAt: undefined });
                    }
                    didMutate = true;
                }
            }
            else if (activeLinkIndex !== -1) {
                department.teamLinks[activeLinkIndex] = {
                    ...department.teamLinks[activeLinkIndex],
                    unlinkedAt: now,
                };
                didMutate = true;
            }
            if (didMutate) {
                department.teamIds = department.teamLinks.filter((link) => !link.unlinkedAt).map((link) => link.teamId);
                department.updatedAt = now;
            }
        }
    }
    async initialize() {
        if (this.state.companies.length === 0) {
            return;
        }
        // Ensure every company retains an executive manager reference
        let mutated = false;
        this.state.companies = this.state.companies.map((company) => {
            const nowIso = new Date().toISOString();
            const isFavorite = company.isFavorite === true;
            if (company.isFavorite !== isFavorite) {
                mutated = true;
            }
            company.isFavorite = isFavorite;
            company.employees =
                company.employees?.map((employee) => {
                    const createdAt = employee.createdAt ?? nowIso;
                    const updatedAt = employee.updatedAt ?? nowIso;
                    if (employee.createdAt !== createdAt ||
                        employee.updatedAt !== updatedAt ||
                        employee.deletedAt === null) {
                        mutated = true;
                    }
                    return {
                        ...employee,
                        createdAt,
                        updatedAt,
                        deletedAt: employee.deletedAt ?? undefined,
                    };
                }) ?? [];
            if (!company.executiveManagerId) {
                const executive = company.employees.find((emp) => emp.isExecutiveManager);
                if (executive) {
                    company.executiveManagerId = executive.id;
                    mutated = true;
                }
            }
            if (!company.actionStatuses || company.actionStatuses.length === 0) {
                company.actionStatuses = createDefaultActionStatuses();
                mutated = true;
            }
            else {
                company.actionStatuses = company.actionStatuses.map((status, index) => ({
                    ...status,
                    order: typeof status.order === "number" ? status.order : index,
                    createdAt: status.createdAt ?? new Date().toISOString(),
                    updatedAt: status.updatedAt ?? new Date().toISOString(),
                }));
            }
            if (!company.departments) {
                company.departments = [];
                mutated = true;
            }
            company.departments = company.departments.map((department) => {
                const createdAt = department.createdAt ?? nowIso;
                const updatedAt = department.updatedAt ?? nowIso;
                let teamLinks = Array.isArray(department.teamLinks)
                    ? department.teamLinks.map((link) => ({
                        teamId: link.teamId,
                        linkedAt: link.linkedAt ?? createdAt,
                        unlinkedAt: link.unlinkedAt ?? undefined,
                    }))
                    : undefined;
                if (!teamLinks) {
                    const sourceTeamIds = Array.isArray(department.teamIds) ? department.teamIds : [];
                    teamLinks = sourceTeamIds.map((teamId) => ({ teamId, linkedAt: createdAt, unlinkedAt: undefined }));
                    mutated = true;
                }
                const activeTeamIds = teamLinks.filter((link) => !link.unlinkedAt).map((link) => link.teamId);
                if (!Array.isArray(department.teamIds) ||
                    department.teamIds.length !== activeTeamIds.length ||
                    department.teamIds.some((id, idx) => id !== activeTeamIds[idx])) {
                    mutated = true;
                }
                return {
                    ...department,
                    teamIds: activeTeamIds,
                    teamLinks,
                    updatedAt,
                    createdAt,
                    deletedAt: department.deletedAt ?? undefined,
                };
            });
            if (!company.teams) {
                company.teams = [];
                mutated = true;
            }
            company.teams = company.teams.map((team) => {
                const createdAt = team.createdAt ?? nowIso;
                const updatedAt = team.updatedAt ?? nowIso;
                let memberships = Array.isArray(team.memberships)
                    ? team.memberships.map((membership) => ({
                        employeeId: membership.employeeId,
                        addedAt: membership.addedAt ?? createdAt,
                        removedAt: membership.removedAt ?? undefined,
                    }))
                    : undefined;
                if (!memberships) {
                    const sourceEmployeeIds = Array.isArray(team.employeeIds) ? team.employeeIds : [];
                    memberships = sourceEmployeeIds.map((employeeId) => ({
                        employeeId,
                        addedAt: createdAt,
                        removedAt: undefined,
                    }));
                    mutated = true;
                }
                const activeEmployeeIds = memberships
                    .filter((membership) => !membership.removedAt)
                    .map((membership) => membership.employeeId);
                if (!Array.isArray(team.employeeIds) ||
                    team.employeeIds.length !== activeEmployeeIds.length ||
                    team.employeeIds.some((id, idx) => id !== activeEmployeeIds[idx])) {
                    mutated = true;
                }
                return {
                    ...team,
                    employeeIds: activeEmployeeIds,
                    memberships,
                    updatedAt,
                    createdAt,
                    deletedAt: team.deletedAt ?? undefined,
                };
            });
            const beforeShiftSnapshot = JSON.stringify(company.shifts ?? []);
            const sanitizedShiftList = this.sanitizeCompanyShifts(company);
            if (beforeShiftSnapshot !== JSON.stringify(sanitizedShiftList)) {
                mutated = true;
            }
            if (!company.actionItems) {
                company.actionItems = [];
                mutated = true;
            }
            company.actionItems = company.actionItems.map((item) => {
                const relationIds = Array.isArray(item.relationIds) ? item.relationIds : [];
                const startCount = typeof item.startCount === "number" && Number.isFinite(item.startCount) ? item.startCount : 0;
                const lastStartedBy = item.lastStartedBy?.trim();
                return {
                    ...item,
                    relationIds,
                    startCount,
                    lastStartedBy: lastStartedBy && lastStartedBy.length > 0 ? lastStartedBy : undefined,
                    lastStartedAt: item.lastStartedAt ?? undefined,
                };
            });
            if (!company.actionRelations) {
                company.actionRelations = [];
                mutated = true;
            }
            if (!company.ownerProfile) {
                company.ownerProfile = { name: "", role: "Owner & CEO" };
                mutated = true;
            }
            const resolvedActiveId = this.resolveActiveEmployeeId(company);
            if (resolvedActiveId && company.activeEmployeeId !== resolvedActiveId) {
                company.activeEmployeeId = resolvedActiveId;
                mutated = true;
            }
            this.sanitizeWorkdayState(company);
            return company;
        });
        if (!this.state.ownerProfileDefaults) {
            const ownerSource = this.state.companies
                .map((company) => company.ownerProfile)
                .find((profile) => Boolean(profile &&
                ((profile.name && profile.name.trim().length > 0) ||
                    (profile.role && profile.role.trim().length > 0))));
            if (ownerSource) {
                this.state.ownerProfileDefaults = this.sanitizeOwnerProfile(ownerSource);
                mutated = true;
            }
        }
        if (!this.state.activeCompanyId) {
            this.state.activeCompanyId = this.state.companies[0]?.id;
            mutated = true;
        }
        const activeCompany = this.state.companies.find((company) => company.id === this.state.activeCompanyId);
        const activeEmployeeId = this.resolveActiveEmployeeId(activeCompany);
        if (activeEmployeeId && this.state.activeEmployeeId !== activeEmployeeId) {
            this.state.activeEmployeeId = activeEmployeeId;
            mutated = true;
        }
        if (mutated) {
            await this.persist();
        }
        this.logState("initialize");
    }
    async createCompany(payload) {
        const { updateDefaultOwnerProfile, ...restPayload } = payload;
        const ownerProfile = this.resolveOwnerProfileForNewCompany(restPayload.ownerProfile);
        const sanitizedEmoji = sanitizeOptionalText(restPayload.emoji);
        const sanitizedDescription = sanitizeOptionalText(restPayload.description);
        const company = withGeneratedIds.company({
            ...restPayload,
            emoji: sanitizedEmoji,
            description: sanitizedDescription,
            ownerProfile,
        });
        const executiveDraft = createExecutiveManagerProfile(payload.name);
        const executive = withGeneratedIds.employee({ ...executiveDraft, isExecutiveManager: true });
        company.executiveManagerId = executive.id;
        company.activeEmployeeId = executive.id;
        company.actionStatuses = createDefaultActionStatuses();
        company.actionItems = [];
        company.actionRelations = [];
        company.ownerProfile = ownerProfile;
        company.employees.push(executive);
        this.sanitizeWorkdayState(company);
        const shouldUpdateDefaults = updateDefaultOwnerProfile !== false || !this.state.ownerProfileDefaults;
        if (shouldUpdateDefaults) {
            this.updateOwnerProfileDefaults(ownerProfile);
        }
        this.state.companies.push(company);
        this.state.activeCompanyId = company.id;
        this.state.activeEmployeeId = executive.id;
        await this.persist();
        this.logState("createCompany", { companyId: company.id });
        return this.getState();
    }
    async updateCompany(payload) {
        const company = this.state.companies.find((c) => c.id === payload.id);
        if (!company) {
            throw new Error(`Company ${payload.id} not found`);
        }
        if (typeof payload.name === "string") {
            company.name = payload.name;
        }
        if (payload.mission !== undefined) {
            company.mission = payload.mission;
        }
        if (payload.vision !== undefined) {
            company.vision = payload.vision;
        }
        if (payload.emoji !== undefined) {
            company.emoji = sanitizeOptionalText(payload.emoji);
        }
        if (payload.description !== undefined) {
            company.description = sanitizeOptionalText(payload.description);
        }
        if (payload.ownerProfile) {
            company.ownerProfile = this.sanitizeOwnerProfile(payload.ownerProfile);
        }
        else if (company.ownerProfile) {
            company.ownerProfile = this.sanitizeOwnerProfile(company.ownerProfile);
        }
        else {
            company.ownerProfile = this.resolveOwnerProfileForNewCompany();
        }
        if (payload.updateDefaultOwnerProfile) {
            this.updateOwnerProfileDefaults(company.ownerProfile);
        }
        company.updatedAt = new Date().toISOString();
        await this.persist();
        this.logState("updateCompany", { companyId: payload.id });
        return this.getState();
    }
    async setCompanyFavorite(payload) {
        const company = this.state.companies.find((entry) => entry.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        const nextFavorite = payload.isFavorite === true;
        if (company.isFavorite === nextFavorite) {
            return this.getState();
        }
        company.isFavorite = nextFavorite;
        company.updatedAt = new Date().toISOString();
        await this.persist();
        this.logState("setCompanyFavorite", { companyId: company.id, isFavorite: nextFavorite });
        return this.getState();
    }
    async deleteCompany(payload) {
        const index = this.state.companies.findIndex((entry) => entry.id === payload.companyId);
        if (index === -1) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        this.state.companies.splice(index, 1);
        if (this.state.activeCompanyId === payload.companyId) {
            const nextCompany = this.state.companies[0];
            this.state.activeCompanyId = nextCompany?.id;
            this.state.activeEmployeeId = this.resolveActiveEmployeeId(nextCompany);
        }
        else {
            const activeCompany = this.state.companies.find((entry) => entry.id === this.state.activeCompanyId);
            this.state.activeEmployeeId = this.resolveActiveEmployeeId(activeCompany);
        }
        await this.persist();
        this.logState("deleteCompany", {
            companyId: payload.companyId,
            nextActiveCompanyId: this.state.activeCompanyId,
        });
        return this.getState();
    }
    async setActiveCompany(companyId) {
        this.state.activeCompanyId = companyId;
        const company = this.state.companies.find((entry) => entry.id === companyId);
        const activeEmployeeId = this.resolveActiveEmployeeId(company);
        this.state.activeEmployeeId = activeEmployeeId;
        await this.persist();
        this.logState("setActiveCompany", { companyId, resolvedActiveEmployeeId: activeEmployeeId });
        return this.getState();
    }
    async createEmployee(payload) {
        const company = this.state.companies.find((c) => c.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        const { companyId: _companyId, ...rest } = payload;
        const employee = withGeneratedIds.employee(rest);
        if (employee.isExecutiveManager) {
            company.employees = company.employees.map((existing) => existing.id === company.executiveManagerId ? { ...existing, isExecutiveManager: false } : existing);
            company.executiveManagerId = employee.id;
            company.activeEmployeeId = employee.id;
        }
        company.employees.push(employee);
        this.sanitizeWorkdayState(company);
        company.updatedAt = new Date().toISOString();
        if (!company.activeEmployeeId) {
            company.activeEmployeeId = employee.id;
        }
        if (this.state.activeCompanyId === company.id) {
            this.state.activeEmployeeId = company.activeEmployeeId ?? employee.id;
        }
        await this.persist();
        this.logState("createEmployee", { companyId: company.id, employeeId: employee.id });
        return this.getState();
    }
    async updateEmployee(payload) {
        const { companyId, employee } = payload;
        const company = this.state.companies.find((c) => c.id === companyId);
        if (!company) {
            throw new Error(`Company ${companyId} not found`);
        }
        const idx = company.employees.findIndex((e) => e.id === employee.id);
        if (idx === -1) {
            throw new Error(`Employee ${employee.id} not found`);
        }
        const sanitizedDeletedAt = employee.deletedAt === null ? undefined : (employee.deletedAt ?? undefined);
        const updated = {
            ...employee,
            updatedAt: new Date().toISOString(),
            personaMode: employee.personaMode,
            deletedAt: sanitizedDeletedAt,
        };
        company.employees[idx] = updated;
        if (updated.isExecutiveManager) {
            company.executiveManagerId = updated.id;
            company.employees = company.employees.map((member, index) => index === idx ? updated : { ...member, isExecutiveManager: false });
            company.activeEmployeeId = updated.id;
        }
        if (company.activeEmployeeId === updated.id && this.state.activeCompanyId === company.id) {
            this.state.activeEmployeeId = updated.id;
        }
        company.updatedAt = new Date().toISOString();
        await this.persist();
        this.logState("updateEmployee", { companyId, employeeId: employee.id });
        return this.getState();
    }
    async createDepartment(payload) {
        const company = this.state.companies.find((c) => c.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        const { companyId: _companyId, ...rest } = payload;
        const department = withGeneratedIds.department(rest);
        company.departments.push(department);
        company.updatedAt = new Date().toISOString();
        await this.persist();
        this.logState("createDepartment", { companyId: company.id, departmentId: department.id });
        return this.getState();
    }
    async updateDepartment(payload) {
        const { companyId, department } = payload;
        const company = this.state.companies.find((c) => c.id === companyId);
        if (!company) {
            throw new Error(`Company ${companyId} not found`);
        }
        const existing = company.departments.find((entry) => entry.id === department.id);
        if (!existing) {
            throw new Error(`Department ${department.id} not found`);
        }
        existing.name = department.name;
        existing.description = department.description;
        existing.deletedAt = department.deletedAt === null ? undefined : (department.deletedAt ?? undefined);
        existing.updatedAt = new Date().toISOString();
        company.updatedAt = new Date().toISOString();
        await this.persist();
        this.logState("updateDepartment", { companyId, departmentId: department.id });
        return this.getState();
    }
    async createTeam(payload) {
        const company = this.state.companies.find((c) => c.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        const { companyId: _companyId, departmentId, ...rest } = payload;
        if (departmentId) {
            const department = company.departments.find((entry) => entry.id === departmentId);
            if (!department) {
                throw new Error(`Department ${departmentId} not found`);
            }
            if (department.deletedAt) {
                throw new Error(`Department ${departmentId} is archived and cannot receive new teams`);
            }
        }
        const team = withGeneratedIds.team(rest);
        company.teams.push(team);
        if (departmentId) {
            this.attachTeamToDepartment(company, team.id, departmentId);
        }
        company.updatedAt = new Date().toISOString();
        await this.persist();
        this.logState("createTeam", { companyId: company.id, teamId: team.id, departmentId });
        return this.getState();
    }
    async updateTeam(payload) {
        const { companyId, team } = payload;
        const company = this.state.companies.find((c) => c.id === companyId);
        if (!company) {
            throw new Error(`Company ${companyId} not found`);
        }
        const existing = company.teams.find((entry) => entry.id === team.id);
        if (!existing) {
            throw new Error(`Team ${team.id} not found`);
        }
        existing.name = team.name;
        existing.description = team.description;
        existing.deletedAt = team.deletedAt === null ? undefined : (team.deletedAt ?? undefined);
        existing.updatedAt = new Date().toISOString();
        company.updatedAt = new Date().toISOString();
        await this.persist();
        this.logState("updateTeam", { companyId, teamId: team.id });
        return this.getState();
    }
    async assignTeamToDepartment(payload) {
        const company = this.state.companies.find((c) => c.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        const team = company.teams.find((entry) => entry.id === payload.teamId);
        if (!team) {
            throw new Error(`Team ${payload.teamId} not found`);
        }
        if (team.deletedAt) {
            throw new Error(`Team ${payload.teamId} is archived and cannot be reassigned`);
        }
        let targetDepartment;
        if (payload.departmentId) {
            targetDepartment = company.departments.find((entry) => entry.id === payload.departmentId);
            if (!targetDepartment) {
                throw new Error(`Department ${payload.departmentId} not found`);
            }
            if (targetDepartment.deletedAt) {
                throw new Error(`Department ${payload.departmentId} is archived and cannot receive new teams`);
            }
        }
        this.attachTeamToDepartment(company, payload.teamId, targetDepartment?.id);
        team.updatedAt = new Date().toISOString();
        company.updatedAt = new Date().toISOString();
        await this.persist();
        this.logState("assignTeamToDepartment", {
            companyId: company.id,
            teamId: payload.teamId,
            departmentId: payload.departmentId,
        });
        return this.getState();
    }
    async assignEmployeeToTeam(payload) {
        const company = this.state.companies.find((c) => c.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        const team = company.teams.find((entry) => entry.id === payload.teamId);
        if (!team) {
            throw new Error(`Team ${payload.teamId} not found`);
        }
        if (team.deletedAt) {
            throw new Error(`Team ${payload.teamId} is archived and cannot receive members`);
        }
        const employee = company.employees.find((entry) => entry.id === payload.employeeId);
        if (!employee) {
            throw new Error(`Employee ${payload.employeeId} not found`);
        }
        if (employee.deletedAt) {
            throw new Error(`Employee ${payload.employeeId} is archived and cannot be assigned to teams`);
        }
        const now = new Date().toISOString();
        const activeMembership = team.memberships.find((membership) => membership.employeeId === employee.id && !membership.removedAt);
        if (activeMembership) {
            return this.getState();
        }
        const archivedMembershipIndex = team.memberships.findIndex((membership) => membership.employeeId === employee.id && membership.removedAt);
        if (archivedMembershipIndex !== -1) {
            team.memberships[archivedMembershipIndex] = {
                ...team.memberships[archivedMembershipIndex],
                addedAt: now,
                removedAt: undefined,
            };
        }
        else {
            team.memberships.push({ employeeId: employee.id, addedAt: now, removedAt: undefined });
        }
        team.employeeIds = team.memberships
            .filter((membership) => !membership.removedAt)
            .map((membership) => membership.employeeId);
        team.updatedAt = now;
        company.updatedAt = now;
        await this.persist();
        this.logState("assignEmployeeToTeam", {
            companyId: company.id,
            teamId: team.id,
            employeeId: employee.id,
        });
        return this.getState();
    }
    async removeEmployeeFromTeam(payload) {
        const company = this.state.companies.find((c) => c.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        const team = company.teams.find((entry) => entry.id === payload.teamId);
        if (!team) {
            throw new Error(`Team ${payload.teamId} not found`);
        }
        const membership = team.memberships.find((entry) => entry.employeeId === payload.employeeId && !entry.removedAt);
        if (!membership) {
            return this.getState();
        }
        const now = new Date().toISOString();
        membership.removedAt = now;
        team.employeeIds = team.memberships.filter((entry) => !entry.removedAt).map((entry) => entry.employeeId);
        team.updatedAt = now;
        company.updatedAt = now;
        await this.persist();
        this.logState("removeEmployeeFromTeam", {
            companyId: company.id,
            teamId: team.id,
            employeeId: payload.employeeId,
        });
        return this.getState();
    }
    async archiveEmployee(payload) {
        const company = this.state.companies.find((c) => c.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        const employee = company.employees.find((entry) => entry.id === payload.employeeId);
        if (!employee) {
            throw new Error(`Employee ${payload.employeeId} not found`);
        }
        if (employee.deletedAt) {
            return this.getState();
        }
        const now = new Date().toISOString();
        const archivedEmployeeIds = new Set();
        company.teams = company.teams.map((team) => {
            const membership = team.memberships.find((entry) => entry.employeeId === payload.employeeId && !entry.removedAt);
            if (!membership) {
                return team;
            }
            membership.removedAt = now;
            team.employeeIds = team.memberships.filter((entry) => !entry.removedAt).map((entry) => entry.employeeId);
            team.updatedAt = now;
            archivedEmployeeIds.add(team.id);
            return team;
        });
        company.actionItems = company.actionItems.map((actionItem) => {
            if (actionItem.ownerEmployeeId === payload.employeeId) {
                return {
                    ...actionItem,
                    ownerEmployeeId: undefined,
                    updatedAt: now,
                };
            }
            return actionItem;
        });
        let nextExecutive = company.employees.find((candidate) => candidate.id !== payload.employeeId && !candidate.deletedAt && candidate.isExecutiveManager);
        if (!nextExecutive) {
            nextExecutive = company.employees.find((candidate) => candidate.id !== payload.employeeId && !candidate.deletedAt);
        }
        company.employees = company.employees.map((member) => {
            if (member.id === payload.employeeId) {
                return {
                    ...member,
                    deletedAt: now,
                    isExecutiveManager: false,
                    updatedAt: now,
                };
            }
            if (nextExecutive && member.id === nextExecutive.id) {
                return {
                    ...member,
                    isExecutiveManager: true,
                    updatedAt: now,
                };
            }
            if (member.isExecutiveManager) {
                return {
                    ...member,
                    isExecutiveManager: member.id === nextExecutive?.id,
                    updatedAt: member.updatedAt ?? now,
                };
            }
            return member;
        });
        company.executiveManagerId = nextExecutive?.id ?? "";
        const nextActiveId = this.resolveActiveEmployeeId(company);
        company.activeEmployeeId = nextActiveId;
        if (this.state.activeCompanyId === company.id) {
            this.state.activeEmployeeId = nextActiveId;
        }
        this.sanitizeWorkdayState(company);
        company.updatedAt = now;
        await this.persist();
        this.logState("archiveEmployee", {
            companyId: company.id,
            employeeId: payload.employeeId,
            affectedTeamIds: Array.from(archivedEmployeeIds),
        });
        return this.getState();
    }
    async archiveDepartment(payload) {
        const company = this.state.companies.find((c) => c.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        const department = company.departments.find((entry) => entry.id === payload.departmentId);
        if (!department) {
            throw new Error(`Department ${payload.departmentId} not found`);
        }
        if (department.deletedAt) {
            return this.getState();
        }
        const now = new Date().toISOString();
        department.deletedAt = now;
        department.updatedAt = now;
        department.teamLinks = department.teamLinks.map((link) => link.unlinkedAt
            ? link
            : {
                ...link,
                unlinkedAt: now,
            });
        department.teamIds = [];
        company.updatedAt = now;
        await this.persist();
        this.logState("archiveDepartment", {
            companyId: company.id,
            departmentId: payload.departmentId,
        });
        return this.getState();
    }
    async archiveTeam(payload) {
        const company = this.state.companies.find((c) => c.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        const team = company.teams.find((entry) => entry.id === payload.teamId);
        if (!team) {
            throw new Error(`Team ${payload.teamId} not found`);
        }
        if (team.deletedAt) {
            return this.getState();
        }
        const now = new Date().toISOString();
        team.deletedAt = now;
        team.updatedAt = now;
        team.memberships = team.memberships.map((membership) => membership.removedAt
            ? membership
            : {
                ...membership,
                removedAt: now,
            });
        team.employeeIds = [];
        company.departments = company.departments.map((department) => {
            let mutated = false;
            department.teamLinks = department.teamLinks.map((link) => {
                if (link.teamId === payload.teamId && !link.unlinkedAt) {
                    mutated = true;
                    return {
                        ...link,
                        unlinkedAt: now,
                    };
                }
                return link;
            });
            if (mutated) {
                department.teamIds = department.teamLinks.filter((link) => !link.unlinkedAt).map((link) => link.teamId);
                department.updatedAt = now;
            }
            return department;
        });
        company.updatedAt = now;
        await this.persist();
        this.logState("archiveTeam", {
            companyId: company.id,
            teamId: payload.teamId,
        });
        return this.getState();
    }
    async removeTeamFromDepartment(payload) {
        const company = this.state.companies.find((c) => c.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        const team = company.teams.find((entry) => entry.id === payload.teamId);
        if (!team) {
            throw new Error(`Team ${payload.teamId} not found`);
        }
        if (team.deletedAt) {
            throw new Error(`Team ${payload.teamId} is archived and cannot be detached`);
        }
        const department = company.departments.find((entry) => entry.id === payload.departmentId);
        if (!department) {
            throw new Error(`Department ${payload.departmentId} not found`);
        }
        const activeLink = department.teamLinks.find((link) => link.teamId === payload.teamId && !link.unlinkedAt);
        if (!activeLink) {
            return this.getState();
        }
        const now = new Date().toISOString();
        department.teamLinks = department.teamLinks.map((link) => link.teamId === payload.teamId && !link.unlinkedAt ? { ...link, unlinkedAt: now } : link);
        department.teamIds = department.teamLinks.filter((link) => !link.unlinkedAt).map((link) => link.teamId);
        department.updatedAt = now;
        team.updatedAt = now;
        company.updatedAt = now;
        await this.persist();
        this.logState("removeTeamFromDepartment", {
            companyId: company.id,
            teamId: payload.teamId,
            departmentId: payload.departmentId,
        });
        return this.getState();
    }
    async upsertEmployeePersonaMode(companyId, employeeId, personaMode) {
        const company = this.state.companies.find((entry) => entry.id === companyId);
        if (!company) {
            throw new Error(`Company ${companyId} not found`);
        }
        const employee = company.employees.find((entry) => entry.id === employeeId);
        if (!employee) {
            throw new Error(`Employee ${employeeId} not found in company ${companyId}`);
        }
        const now = new Date().toISOString();
        company.employees = company.employees.map((candidate) => candidate.id === employeeId
            ? {
                ...candidate,
                personaMode: {
                    ...personaMode,
                    updatedAt: now,
                    createdAt: personaMode.createdAt ?? now,
                },
                updatedAt: now,
            }
            : candidate);
        company.updatedAt = now;
        await this.persist();
        this.logState("upsertEmployeePersonaMode", { companyId, employeeId, personaModeId: personaMode.id });
        return this.getState();
    }
    async setActiveEmployee(companyId, employeeId) {
        const company = this.state.companies.find((entry) => entry.id === companyId);
        if (!company) {
            throw new Error(`Company ${companyId} not found`);
        }
        const employee = company.employees.find((entry) => entry.id === employeeId);
        if (!employee) {
            throw new Error(`Employee ${employeeId} not found in company ${companyId}`);
        }
        if (employee.deletedAt) {
            throw new Error(`Employee ${employeeId} is archived and cannot be activated`);
        }
        company.activeEmployeeId = employee.id;
        this.state.activeCompanyId = companyId;
        this.state.activeEmployeeId = employee.id;
        await this.persist();
        this.logState("setActiveEmployee", { companyId, employeeId });
        return this.getState();
    }
    async createActionItem(payload) {
        const company = this.state.companies.find((entry) => entry.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        if (!company.actionStatuses || company.actionStatuses.length === 0) {
            company.actionStatuses = createDefaultActionStatuses();
        }
        let resolvedStatusId = payload.statusId;
        if (!resolvedStatusId || !company.actionStatuses.some((status) => status.id === resolvedStatusId)) {
            resolvedStatusId = company.actionStatuses[0]?.id;
        }
        if (!resolvedStatusId) {
            throw new Error("Unable to resolve status for new action item");
        }
        if (payload.ownerEmployeeId) {
            const owner = company.employees.find((entry) => entry.id === payload.ownerEmployeeId);
            if (!owner) {
                throw new Error(`Employee ${payload.ownerEmployeeId} not found in company ${company.id}`);
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
        });
        company.actionItems.push(actionItem);
        company.updatedAt = new Date().toISOString();
        await this.persist();
        this.logState("createActionItem", { companyId: company.id, actionItemId: actionItem.id });
        return this.getState();
    }
    async updateActionItem(payload) {
        const company = this.state.companies.find((entry) => entry.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        const index = company.actionItems.findIndex((entry) => entry.id === payload.actionItem.id);
        if (index === -1) {
            throw new Error(`Action item ${payload.actionItem.id} not found in company ${company.id}`);
        }
        if (!company.actionStatuses.some((status) => status.id === payload.actionItem.statusId)) {
            throw new Error(`Status ${payload.actionItem.statusId} not found for company ${company.id}`);
        }
        if (payload.actionItem.ownerEmployeeId) {
            const owner = company.employees.find((entry) => entry.id === payload.actionItem.ownerEmployeeId);
            if (!owner) {
                throw new Error(`Employee ${payload.actionItem.ownerEmployeeId} not found in company ${company.id}`);
            }
        }
        const existing = company.actionItems[index];
        const next = {
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
        };
        company.actionItems[index] = next;
        company.updatedAt = new Date().toISOString();
        await this.persist();
        this.logState("updateActionItem", { companyId: company.id, actionItemId: next.id });
        return this.getState();
    }
    async deleteActionItem(payload) {
        const company = this.state.companies.find((entry) => entry.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        const initialLength = company.actionItems.length;
        company.actionItems = company.actionItems.filter((entry) => entry.id !== payload.actionItemId);
        company.actionRelations = company.actionRelations.filter((entry) => entry.sourceActionItemId !== payload.actionItemId && entry.targetActionItemId !== payload.actionItemId);
        if (company.actionItems.length === initialLength) {
            throw new Error(`Action item ${payload.actionItemId} not found in company ${company.id}`);
        }
        company.updatedAt = new Date().toISOString();
        await this.persist();
        this.logState("deleteActionItem", { companyId: company.id, actionItemId: payload.actionItemId });
        return this.getState();
    }
    async startActionItems(payload) {
        const company = this.state.companies.find((entry) => entry.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        if (!company.actionStatuses || company.actionStatuses.length === 0) {
            company.actionStatuses = createDefaultActionStatuses();
        }
        if (payload.scope === "employee" && !payload.employeeId) {
            throw new Error("employeeId is required when starting action items for an employee");
        }
        if (payload.scope === "selection" && (!payload.actionItemIds || payload.actionItemIds.length === 0)) {
            throw new Error("actionItemIds is required when starting selected action items");
        }
        const targetStatusId = this.resolveInProgressStatusId(company);
        if (!targetStatusId) {
            throw new Error("Unable to determine an in-progress status for this company");
        }
        const actionItemIds = new Set(payload.actionItemIds ?? []);
        const initiatedBy = payload.initiatedBy?.trim() || "user";
        const now = new Date().toISOString();
        const statusMap = new Map(company.actionStatuses.map((status) => [status.id, status]));
        const matchesScope = (item) => {
            switch (payload.scope) {
                case "company":
                    return Boolean(item.ownerEmployeeId);
                case "employee":
                    return Boolean(item.ownerEmployeeId && item.ownerEmployeeId === payload.employeeId);
                case "selection":
                    return actionItemIds.has(item.id);
                default:
                    return false;
            }
        };
        const candidates = company.actionItems.filter((item) => matchesScope(item));
        if (candidates.length === 0) {
            return this.getState();
        }
        const startedIds = [];
        for (const item of candidates) {
            const statusInfo = statusMap.get(item.statusId);
            if (statusInfo?.isTerminal) {
                continue;
            }
            if (item.statusId !== targetStatusId) {
                item.statusId = targetStatusId;
            }
            item.lastStartedAt = now;
            item.lastStartedBy = initiatedBy;
            item.startCount = (item.startCount ?? 0) + 1;
            item.updatedAt = now;
            startedIds.push(item.id);
        }
        if (startedIds.length === 0) {
            return this.getState();
        }
        company.updatedAt = now;
        await this.persist();
        this.logState("startActionItems", {
            companyId: company.id,
            scope: payload.scope,
            employeeId: payload.employeeId,
            actionItemIds: startedIds,
            initiatedBy,
        });
        return this.getState();
    }
    async startWorkday(payload) {
        const company = this.state.companies.find((entry) => entry.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        const workday = this.sanitizeWorkdayState(company);
        const now = new Date().toISOString();
        const activeEmployeeIds = this.resolveActiveEmployeesForWorkday(company, payload.employeeIds);
        const reason = payload.reason?.trim();
        workday.status = "active";
        workday.startedAt = now;
        workday.haltedAt = undefined;
        workday.lastActivationReason = reason && reason.length > 0 ? reason : undefined;
        workday.activeEmployeeIds = activeEmployeeIds;
        if (payload.employeeIds && payload.employeeIds.length > 0) {
            const requestedSet = new Set(payload.employeeIds);
            workday.bypassedEmployeeIds = workday.employeeSchedules
                .filter((schedule) => schedule.availability !== "available" &&
                schedule.availability !== "flexible" &&
                !requestedSet.has(schedule.employeeId))
                .map((schedule) => schedule.employeeId);
        }
        else {
            workday.bypassedEmployeeIds = workday.employeeSchedules
                .filter((schedule) => schedule.availability !== "available" && schedule.availability !== "flexible")
                .map((schedule) => schedule.employeeId);
        }
        company.workday = workday;
        company.updatedAt = now;
        await this.persist();
        this.logState("startWorkday", {
            companyId: company.id,
            employeeIds: activeEmployeeIds,
            initiatedBy: payload.initiatedBy,
            reason: workday.lastActivationReason,
        });
        let latestState;
        if (workday.autoStartActionItems && activeEmployeeIds.length > 0) {
            for (const employeeId of activeEmployeeIds) {
                latestState = await this.startActionItems({
                    companyId: company.id,
                    scope: "employee",
                    employeeId,
                    initiatedBy: payload.initiatedBy ?? "workday",
                });
            }
        }
        return latestState ?? this.getState();
    }
    async haltWorkday(payload) {
        const company = this.state.companies.find((entry) => entry.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        const workday = this.sanitizeWorkdayState(company);
        const now = new Date().toISOString();
        const previousActive = [...workday.activeEmployeeIds];
        const reason = payload.reason?.trim();
        if (payload.suspendActiveEmployees && previousActive.length) {
            const scheduleMap = new Map(workday.employeeSchedules.map((schedule) => [schedule.employeeId, schedule]));
            for (const employeeId of previousActive) {
                const schedule = scheduleMap.get(employeeId);
                if (schedule && schedule.availability !== "suspended") {
                    schedule.availability = "suspended";
                    schedule.lastUpdatedAt = now;
                }
            }
        }
        workday.status = "paused";
        workday.haltedAt = now;
        workday.activeEmployeeIds = [];
        if (reason && reason.length > 0) {
            workday.lastActivationReason = reason;
        }
        company.workday = workday;
        this.sanitizeWorkdayState(company);
        company.updatedAt = now;
        await this.persist();
        this.logState("haltWorkday", {
            companyId: company.id,
            initiatedBy: payload.initiatedBy,
            reason: workday.lastActivationReason,
            previousActive,
            suspended: payload.suspendActiveEmployees === true,
        });
        return this.getState();
    }
    async updateEmployeeSchedule(payload) {
        const company = this.state.companies.find((entry) => entry.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        const employee = company.employees.find((entry) => entry.id === payload.employeeId && !entry.deletedAt);
        if (!employee) {
            throw new Error(`Employee ${payload.employeeId} not found in company ${payload.companyId}`);
        }
        const workday = this.sanitizeWorkdayState(company);
        const scheduleMap = new Map(workday.employeeSchedules.map((schedule) => [schedule.employeeId, schedule]));
        const now = new Date().toISOString();
        const timezone = sanitizeOptionalText(payload.timezone);
        const workdays = Array.isArray(payload.workdays)
            ? payload.workdays.filter((day) => DAY_OF_WEEK_SET.has(day))
            : undefined;
        let schedule = scheduleMap.get(employee.id);
        if (!schedule) {
            schedule = {
                employeeId: employee.id,
                availability: payload.availability,
                lastUpdatedAt: now,
            };
            workday.employeeSchedules.push(schedule);
        }
        else {
            schedule.availability = payload.availability;
            schedule.lastUpdatedAt = now;
        }
        schedule.timezone = timezone;
        schedule.weeklyHoursTarget =
            typeof payload.weeklyHoursTarget === "number" && Number.isFinite(payload.weeklyHoursTarget)
                ? payload.weeklyHoursTarget
                : undefined;
        if (workdays) {
            schedule.workdays = workdays;
        }
        else if (payload.workdays !== undefined) {
            schedule.workdays = [];
        }
        if (payload.dailyStartMinute !== undefined) {
            schedule.dailyStartMinute = this.normalizeMinutes(payload.dailyStartMinute);
        }
        if (payload.dailyEndMinute !== undefined) {
            schedule.dailyEndMinute = this.normalizeMinutes(payload.dailyEndMinute);
        }
        company.workday = workday;
        this.sanitizeWorkdayState(company);
        company.updatedAt = now;
        await this.persist();
        this.logState("updateEmployeeSchedule", {
            companyId: company.id,
            employeeId: employee.id,
            availability: schedule.availability,
        });
        return this.getState();
    }
    async createShift(payload) {
        const company = this.state.companies.find((entry) => entry.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        const employee = company.employees.find((entry) => entry.id === payload.shift.employeeId && !entry.deletedAt);
        if (!employee) {
            throw new Error(`Employee ${payload.shift.employeeId} not found in company ${payload.companyId}`);
        }
        const start = this.normalizeIsoTimestamp(payload.shift.start);
        const end = this.normalizeIsoTimestamp(payload.shift.end);
        if (!start || !end) {
            throw new Error("Shift start and end times must be valid ISO timestamps");
        }
        if (new Date(end).getTime() <= new Date(start).getTime()) {
            throw new Error("Shift end time must come after the start time");
        }
        const id = typeof payload.shift.id === "string" && payload.shift.id.trim().length > 0 ? payload.shift.id.trim() : uuid();
        const now = new Date().toISOString();
        const recurrence = payload.shift.recurrence && payload.shift.recurrence.type === "weekly"
            ? this.sanitizeShiftRecurrence(payload.shift.recurrence)
            : undefined;
        const shift = {
            id,
            companyId: company.id,
            employeeId: employee.id,
            name: sanitizeOptionalText(payload.shift.name),
            description: sanitizeOptionalText(payload.shift.description),
            timezone: sanitizeOptionalText(payload.shift.timezone),
            start,
            end,
            recurrence,
            createdAt: now,
            updatedAt: now,
        };
        company.shifts = company.shifts ?? [];
        company.shifts.push(shift);
        this.sanitizeCompanyShifts(company);
        company.updatedAt = now;
        await this.persist();
        this.logState("createShift", {
            companyId: company.id,
            shiftId: shift.id,
            employeeId: shift.employeeId,
        });
        return this.getState();
    }
    async updateShift(payload) {
        const company = this.state.companies.find((entry) => entry.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        company.shifts = company.shifts ?? [];
        const index = company.shifts.findIndex((entry) => entry.id === payload.shift.id);
        if (index === -1) {
            throw new Error(`Shift ${payload.shift.id} not found in company ${payload.companyId}`);
        }
        const employee = company.employees.find((entry) => entry.id === payload.shift.employeeId && !entry.deletedAt);
        if (!employee) {
            throw new Error(`Employee ${payload.shift.employeeId} not found in company ${payload.companyId}`);
        }
        const start = this.normalizeIsoTimestamp(payload.shift.start);
        const end = this.normalizeIsoTimestamp(payload.shift.end);
        if (!start || !end) {
            throw new Error("Shift start and end times must be valid ISO timestamps");
        }
        if (new Date(end).getTime() <= new Date(start).getTime()) {
            throw new Error("Shift end time must come after the start time");
        }
        const recurrence = payload.shift.recurrence && payload.shift.recurrence.type === "weekly"
            ? this.sanitizeShiftRecurrence(payload.shift.recurrence)
            : undefined;
        const existing = company.shifts[index];
        const now = new Date().toISOString();
        const updated = {
            ...existing,
            employeeId: employee.id,
            name: sanitizeOptionalText(payload.shift.name),
            description: sanitizeOptionalText(payload.shift.description),
            timezone: sanitizeOptionalText(payload.shift.timezone),
            start,
            end,
            recurrence,
            updatedAt: now,
        };
        company.shifts[index] = updated;
        this.sanitizeCompanyShifts(company);
        company.updatedAt = now;
        await this.persist();
        this.logState("updateShift", {
            companyId: company.id,
            shiftId: updated.id,
            employeeId: updated.employeeId,
        });
        return this.getState();
    }
    async deleteShift(payload) {
        const company = this.state.companies.find((entry) => entry.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        company.shifts = company.shifts ?? [];
        const index = company.shifts.findIndex((entry) => entry.id === payload.shiftId);
        if (index === -1) {
            throw new Error(`Shift ${payload.shiftId} not found in company ${payload.companyId}`);
        }
        company.shifts.splice(index, 1);
        this.sanitizeCompanyShifts(company);
        company.updatedAt = new Date().toISOString();
        await this.persist();
        this.logState("deleteShift", {
            companyId: company.id,
            shiftId: payload.shiftId,
        });
        return this.getState();
    }
    async createActionStatus(payload) {
        const company = this.state.companies.find((entry) => entry.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        const status = withGeneratedIds.actionStatus({
            name: payload.name,
            order: company.actionStatuses.length,
            color: payload.color,
            isTerminal: payload.isTerminal,
        });
        company.actionStatuses.push(status);
        company.updatedAt = new Date().toISOString();
        await this.persist();
        this.logState("createActionStatus", { companyId: company.id, actionStatusId: status.id });
        return this.getState();
    }
    async upsertActionStatus(payload) {
        const company = this.state.companies.find((entry) => entry.id === payload.companyId);
        if (!company) {
            throw new Error(`Company ${payload.companyId} not found`);
        }
        const index = company.actionStatuses.findIndex((entry) => entry.id === payload.status.id);
        if (index === -1) {
            throw new Error(`Action status ${payload.status.id} not found in company ${company.id}`);
        }
        const existing = company.actionStatuses[index];
        const next = {
            ...existing,
            name: payload.status.name,
            color: payload.status.color,
            order: payload.status.order,
            isTerminal: payload.status.isTerminal,
            updatedAt: new Date().toISOString(),
        };
        company.actionStatuses[index] = next;
        company.updatedAt = new Date().toISOString();
        await this.persist();
        this.logState("upsertActionStatus", { companyId: company.id, actionStatusId: next.id });
        return this.getState();
    }
    async persist() {
        await this.context.globalState.update(STORAGE_KEY, this.state);
        this.logState("persist");
        const snapshot = cloneWorkplaceState(this.state);
        if (this.stateObserver?.onStatePersisted) {
            await this.stateObserver.onStatePersisted(snapshot);
        }
    }
    resolveInProgressStatusId(company) {
        const normalizedLookup = company.actionStatuses
            .map((status) => ({
            status,
            name: status.name?.trim().toLowerCase() ?? "",
        }))
            .filter(({ name }) => name.length > 0)
            .reduce((acc, entry) => {
            acc[entry.name] = entry.status;
            return acc;
        }, {});
        const explicit = normalizedLookup["in progress"] ?? normalizedLookup["in-progress"];
        if (explicit) {
            return explicit.id;
        }
        const sorted = [...company.actionStatuses].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const firstNonTerminal = sorted.find((status) => !status.isTerminal);
        return firstNonTerminal?.id ?? sorted[0]?.id;
    }
}
export const createWorkplaceService = async (context) => {
    const service = new WorkplaceService(context);
    await service.initialize();
    return service;
};
//# sourceMappingURL=WorkplaceService.js.map