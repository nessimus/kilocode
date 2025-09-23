export function getArchiveTeamDescription(): string {
	return `## archive_team

**Description:**
Soft-delete a team. Archived teams keep their history but are removed from department hierarchies and lose active memberships.

**Parameters:**
- \`company_id\` (required unless every entry in \`team_ids\` specifies one): Company that owns the team(s).
- \`team_id\` (required when archiving a single team): Team identifier to archive.
- \`team_ids\` (optional): JSON array (or array of objects) describing multiple teams to archive. Each entry may override \`company_id\`.

**Usage Notes:**
- All team member links are soft-removed, so employees stay active elsewhere.
- Department associations are automatically severed.

**Single Example:**
<archive_team>
<company_id>COMPANY_ID</company_id>
<team_id>TEAM_ID</team_id>
</archive_team>

**Bulk Example:**
<archive_team>
<company_id>COMPANY_ID</company_id>
<team_ids>["TEAM_A", "TEAM_B"]</team_ids>
</archive_team>
`
}
