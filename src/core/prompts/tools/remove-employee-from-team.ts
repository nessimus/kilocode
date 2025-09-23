export function getRemoveEmployeeFromTeamDescription(): string {
	return `## remove_employee_from_team

**Description:**
Soft-remove an employee from a team. The membership is archived so it can be restored later if needed.

**Parameters:**
- \`company_id\` (required unless every entry in \`assignments\` includes one): Identifier of the company that owns the team.
- \`team_id\` (required when removing a single membership): Identifier of the team.
- \`employee_id\` (required when removing a single membership): Identifier of the employee to remove.
- \`assignments\` (optional): JSON array (or object) describing multiple removals. Each entry may specify \`company_id\`, \`team_id\`, and \`employee_id\`.

**Usage Notes:**
- Use after confirming the employee should no longer contribute to the team's workstream.
- The employee remains active within the company and other teams.

**Single Example:**
<remove_employee_from_team>
<company_id>COMPANY_ID</company_id>
<team_id>TEAM_ID</team_id>
<employee_id>EMPLOYEE_ID</employee_id>
</remove_employee_from_team>

**Bulk Example:**
<remove_employee_from_team>
<assignments>
[
  {"company_id": "COMPANY_ID", "team_id": "TEAM_ALPHA", "employee_id": "EMPLOYEE_A"},
  {"company_id": "COMPANY_ID", "team_id": "TEAM_BETA", "employee_id": "EMPLOYEE_B"}
]
</assignments>
</remove_employee_from_team>
`
}
