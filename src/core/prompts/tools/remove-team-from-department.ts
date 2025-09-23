export function getRemoveTeamFromDepartmentDescription(): string {
	return `## remove_team_from_department

**Description:**
Soft-remove a team from a department. The relationship is preserved with a timestamp but no longer appears in active hierarchies.

**Parameters:**
- \`company_id\` (required unless every entry in \`assignments\` provides one): Identifier of the company.
- \`team_id\` (required when detaching a single team): Identifier of the team to detach.
- \`department_id\` (required when detaching a single team): Identifier of the department to detach from.
- \`assignments\` (optional): JSON array (or object) describing multiple detachments. Each entry may specify \`company_id\`, \`team_id\`, and \`department_id\`.

**Usage Notes:**
- Use this when a team transitions out of a department but should stay intact elsewhere.
- Teams can later be reassigned with \`assignTeamToDepartment\`.

**Single Example:**
<remove_team_from_department>
<company_id>COMPANY_ID</company_id>
<team_id>TEAM_ID</team_id>
<department_id>DEPARTMENT_ID</department_id>
</remove_team_from_department>

**Bulk Example:**
<remove_team_from_department>
<assignments>
[
  {"company_id": "COMPANY_ID", "team_id": "TEAM_ALPHA", "department_id": "DEPT_X"},
  {"company_id": "COMPANY_ID", "team_id": "TEAM_BETA", "department_id": "DEPT_Y"}
]
</assignments>
</remove_team_from_department>
`
}
