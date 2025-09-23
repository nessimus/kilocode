export function getListActionItemsDescription(): string {
	return `## list_action_items

**Description:**
List open goals, projects, or tasks for a company. Use this to inspect the current workload, find unassigned items, or surface work in specific statuses before you make edits.

**Parameters:**
- \`company_id\` (optional): Restrict results to a single company. Defaults to every company in the session.
- \`status_id\` (optional): Filter by workflow column.
- \`owner_employee_id\` (optional): Filter by owner. Use \`unassigned\` to show only items without an owner.
- \`kind\` (optional): One of \`goal\`, \`project\`, or \`task\`.
- \`search\` (optional): Case-insensitive keyword search across titles and descriptions.
- \`limit\` (optional): Maximum number of items to return (default 200).

**Usage Notes:**
- Combine filters to zero in on the right slice (for example company + status + owner).
- When you’re about to update several items, run this first to confirm their ids and current state.
- Results include status name, kind, owner, due date, and priority where available.

**Example:**
<list_action_items>
<company_id>COMPANY_ID</company_id>
<status_id>STATUS_IN_PROGRESS</status_id>
<owner_employee_id>unassigned</owner_employee_id>
<limit>10</limit>
</list_action_items>
`
}
