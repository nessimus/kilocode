export function getUpdateTeamDescription(): string {
	return `## update_team

**Description:**
Edit an existing team's metadata. Provide the company and team identifiers plus any fields that should change.

**Parameters:**
- \`company_id\` (required unless every entry in \`team_updates\` provides one): Company that owns the team.
- \`team_id\` (required when updating a single team): Team to update.
- \`name\` (optional): New team name.
- \`description\` (optional): Updated description.
- \`team_updates\` (optional): JSON array (or object) describing multiple updates. Each entry may specify \`company_id\`, \`team_id\`, and the fields to change.

**Usage Notes:**
- To move a team between departments use \`assign_team_to_department\`.
- Keep updates succinct for clear UI rendering.

**Single Example:**
<update_team>
<company_id>COMPANY_ID</company_id>
<team_id>TEAM_ID</team_id>
<description>Coordinates on-call rotations and incident retrospectives.</description>
</update_team>

**Bulk Example:**
<update_team>
<team_updates>
[
  {"team_id": "TEAM_A", "company_id": "COMPANY_ID", "name": "Lifecycle Marketing"},
  {"team_id": "TEAM_B", "company_id": "COMPANY_ID", "description": "Runs beta programs."}
]
</team_updates>
</update_team>
`
}
