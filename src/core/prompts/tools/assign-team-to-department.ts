export function getAssignTeamToDepartmentDescription(): string {
	return `## assign_team_to_department

**Description:**
Link a team to a department or move it between departments. Provide the company and team identifiers and the destination department, or omit \`department_id\` to make the team independent.

**Parameters:**
- \`company_id\` (required unless every entry in \`assignments\` includes one): Company identifier.
- \`team_id\` (required when modifying a single team): Team to re-home.
- \`department_id\` (optional): Department to attach the team to. Leave blank to detach from all departments.
- \`assignments\` (optional): JSON array (or object) describing multiple team-to-department moves. Each entry may specify \`company_id\`, \`team_id\`, and \`department_id\` (or omit the latter to detach).

**Single Example (attach):**
<assign_team_to_department>
<company_id>COMPANY_ID</company_id>
<team_id>TEAM_ID</team_id>
<department_id>DEPARTMENT_ID</department_id>
</assign_team_to_department>

**Single Example (detach):**
<assign_team_to_department>
<company_id>COMPANY_ID</company_id>
<team_id>TEAM_ID</team_id>
</assign_team_to_department>

**Bulk Example:**
<assign_team_to_department>
<assignments>
[
  {"company_id": "COMPANY_ID", "team_id": "TEAM_ALPHA", "department_id": "ENGINEERING"},
  {"company_id": "COMPANY_ID", "team_id": "TEAM_BETA"}
]
</assignments>
</assign_team_to_department>
`
}
