export function getAssignEmployeeToTeamDescription() {
    return `## assign_employee_to_team

**Description:**
Add an employee to a team. The membership is tracked historically so reversions are possible later.

**Parameters:**
- \`company_id\` (required unless every entry in \`assignments\` provides one): Company identifier.
- \`team_id\` (required when assigning a single employee): Team to join.
- \`employee_id\` (required when assigning a single employee): Employee to assign.
- \`assignments\` (optional): JSON array (or object) of company/team/employee triples to assign in bulk.

**Usage Notes:**
- The employee and team must both be active (not archived).
- Re-assigning someone already on the team is a no-op.

**Single Example:**
<assign_employee_to_team>
<company_id>COMPANY_ID</company_id>
<team_id>TEAM_ID</team_id>
<employee_id>EMPLOYEE_ID</employee_id>
</assign_employee_to_team>

**Bulk Example:**
<assign_employee_to_team>
<assignments>
[
  {"company_id": "COMPANY_ID", "team_id": "TEAM_CORE", "employee_id": "EMPLOYEE_A"},
  {"company_id": "COMPANY_ID", "team_id": "TEAM_CORE", "employee_id": "EMPLOYEE_B"}
]
</assignments>
</assign_employee_to_team>
`;
}
//# sourceMappingURL=assign-employee-to-team.js.map