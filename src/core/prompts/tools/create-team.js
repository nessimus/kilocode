export function getCreateTeamDescription() {
    return `## create_team

**Description:**
Create a new team within a company, optionally attaching it to a department at creation time.

**Parameters:**
- \`company_id\` (required unless every entry in \`teams\` provides one): Company that owns the team(s).
- \`name\` (required when creating a single team): Team name.
- \`description\` (optional): Brief summary of the team's focus.
- \`department_id\` (optional): Department to attach this team to. Omit to create an independent team.
- \`teams\` (optional): JSON array (or object) describing one or more teams to create. Entries may override \`company_id\`, \`name\`, \`description\`, and \`department_id\`.

**Single Example:**
<create_team>
<company_id>COMPANY_ID</company_id>
<name>Incident Response Pod</name>
<description>Handles security incidents and postmortems.</description>
<department_id>SECURITY_DEPT_ID</department_id>
</create_team>

**Bulk Example:**
<create_team>
<teams>
[
  {"company_id": "COMPANY_ID", "name": "QA Guild"},
  {"company_id": "COMPANY_ID", "name": "Enablement Crew", "department_id": "REVOPS"}
]
</teams>
</create_team>
`;
}
//# sourceMappingURL=create-team.js.map