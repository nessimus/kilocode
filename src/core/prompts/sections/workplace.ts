import { WorkplaceCompany, WorkplaceEmployee } from "../../../shared/golden/workplace"
import { type ClineProviderState } from "../../webview/ClineProvider"

const formatAttributes = (attributes?: Record<string, string>) => {
	if (!attributes || Object.keys(attributes).length === 0) {
		return ""
	}

	const entries = Object.entries(attributes)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => `  - ${key}: ${value}`)

	return entries.length ? `Custom Attributes:\n${entries.join("\n")}` : ""
}

export function getWorkplacePersonaSection(
	state?: (ClineProviderState & { activeWorkplaceCompanyId?: string; activeWorkplacePersonaId?: string }) | null,
): string {
	const companies = state?.workplaceState?.companies ?? []
	if (!companies.length) {
		return ""
	}

	const resolvedCompanyId = state?.activeWorkplaceCompanyId ?? state?.workplaceState?.activeCompanyId
	const company = companies.find((candidate) => candidate.id === resolvedCompanyId) ?? companies[0]
	if (!company) {
		return ""
	}

	const resolvedEmployeeId = state?.activeWorkplacePersonaId ?? company.activeEmployeeId ?? company.executiveManagerId
	const employee = company.employees.find((candidate) => candidate.id === resolvedEmployeeId) ?? company.employees[0]
	if (!employee) {
		return ""
	}

	const companyDisplayName = company.emoji ? `${company.emoji} ${company.name}` : company.name
	const lines: string[] = ["====", "WORKPLACE CONTEXT", "", `Company: ${companyDisplayName}`]

	if (company.id) {
		lines.push(`Company ID: ${company.id}`)
	} else {
		lines.push("Company ID: unavailable (fall back to the first company in state if needed)")
	}

	if (company.mission) {
		lines.push(`Mission: ${company.mission}`)
	}

	if (company.vision) {
		lines.push(`Vision: ${company.vision}`)
	}

	if (company.description) {
		lines.push(`Description: ${company.description}`)
	}

	if (company.emoji && !company.name.includes(company.emoji)) {
		lines.push(`Emoji: ${company.emoji}`)
	}

	if (company.ownerProfile) {
		const founderLines: string[] = []
		if (company.ownerProfile.name) {
			founderLines.push(`- Name: ${company.ownerProfile.name}`)
		}
		if (company.ownerProfile.role) {
			founderLines.push(`- Role: ${company.ownerProfile.role}`)
		}
		if (company.ownerProfile.mbtiType) {
			founderLines.push(`- MBTI: ${company.ownerProfile.mbtiType}`)
		}
		if (company.ownerProfile.personalityTraits?.length) {
			founderLines.push(`- Traits: ${company.ownerProfile.personalityTraits.join(", ")}`)
		}
		if (company.ownerProfile.bio) {
			founderLines.push(`- Bio: ${company.ownerProfile.bio}`)
		}
		if (founderLines.length) {
			lines.push("", "Founder", ...founderLines)
		}
	}
	lines.push("", "Active Persona")
	lines.push(`- Name: ${employee.name}`)
	lines.push(`- Role: ${employee.role}`)
	if (employee.id) {
		lines.push(`- Employee ID: ${employee.id}`)
	}
	if (employee.mbtiType) {
		lines.push(`- MBTI: ${employee.mbtiType}`)
	}
	if (employee.personalityTraits?.length) {
		lines.push(`- Traits: ${employee.personalityTraits.join(", ")}`)
	}
	if (employee.personaMode?.name) {
		lines.push(`- Persona mode: ${employee.personaMode.name}`)
		if (employee.personaMode.summary) {
			lines.push(`- Mode summary: ${employee.personaMode.summary}`)
		}
	}

	if (employee.personality) {
		lines.push(`- Personality: ${employee.personality}`)
	}

	if (employee.description) {
		lines.push(`- Responsibilities: ${employee.description}`)
	}

	const attributeLines = formatAttributes(employee.customAttributes)
	if (attributeLines) {
		lines.push(attributeLines)
	}

	const activeTeams = (company.teams ?? [])
		.filter((team) => !team.deletedAt && (team.employeeIds ?? []).includes(employee.id))
		.map((team) => ({ id: team.id, name: team.name }))
	if (activeTeams.length) {
		lines.push("", "Team Membership")
		activeTeams.forEach((team) => {
			lines.push(`- ${team.name ?? "(unnamed team)"} (ID: ${team.id})`)
		})
	}

	const activeDepartments = (company.departments ?? [])
		.filter(
			(department) =>
				!department.deletedAt &&
				(department.teamIds ?? []).some((teamId) => activeTeams.some((team) => team.id === teamId)),
		)
		.map((department) => ({ id: department.id, name: department.name }))
	if (activeDepartments.length) {
		lines.push("", "Department Alignment")
		activeDepartments.forEach((department) => {
			lines.push(`- ${department.name ?? "(unnamed department)"} (ID: ${department.id})`)
		})
	}

	const supportingEmployees = company.employees.filter((member) => member.id !== employee.id)
	if (supportingEmployees.length) {
		lines.push("", "Other Employees")
		supportingEmployees.forEach((member) => {
			const summaryParts = [member.role, member.id ? `ID: ${member.id}` : ""].filter(Boolean)
			lines.push(`- ${member.name}${summaryParts.length ? ` (${summaryParts.join(", ")})` : ""}`)
		})
	}

	lines.push("", "Team Guidelines")
	lines.push(
		"- You can suggest or create new employees using the create_employee tool when additional expertise would help. Provide a clear rationale and gather user approval before proceeding.",
	)
	lines.push(
		"- When you need multiple specialists, supply a JSON array in the employees parameter to create several teammates in one tool call.",
	)
	if (!supportingEmployees.length) {
		lines.push(
			"- No additional employees exist yet—consider proposing specialists to round out the team when useful.",
		)
	}

	return lines.join("\n")
}
