export function getListTeamsDescription() {
    return `## list_teams

**Description:**
List teams with their ids, associated company, and current department so you can target other workforce tools accurately.

**Parameters:**
- \`company_id\` (optional): Restrict to teams inside a single company.
- \`team_id\` (optional): Fetch a specific team.
- \`department_id\` (optional): Only include teams currently attached to the given department.
- \`name\_contains\` (optional): Case-insensitive substring filter on the team name.
- \`include_archived\` (optional): Pass \`true\` to include archived teams.

**Usage Notes:**
- Each entry includes the team id, name, company id, archived status, department id (if attached), and member counts.
- Combine filters to drill down to exactly the teams you need.

**Example:**
<list_teams>
<company_id>COMPANY_ID</company_id>
<name_contains>platform</name_contains>
</list_teams>
`;
}
//# sourceMappingURL=list-teams.js.map