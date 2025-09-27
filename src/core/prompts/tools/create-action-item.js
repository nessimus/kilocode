export function getCreateActionItemDescription(_args) {
    return `## create_action_item

**Description:**
Add a new goal, project, or task to a Golden Workplace company. Use this tool whenever you need to capture a workstream, propose a project, or spin up a concrete task and assign an owner.

**Parameters:**
- \`company_id\` (required unless every entry in \`action_items\` sets its own id): Target company for the new work items.
- \`title\` (required when not using \`action_items\`): Concise, action-oriented headline.
- \`kind\` (required when not using \`action_items\`): One of \`goal\`, \`project\`, or \`task\`.
- \`status_id\` (optional): Workflow status. Defaults to the first status column if omitted.
- \`description\` (optional): Short summary of scope or acceptance criteria.
- \`owner_employee_id\` (optional): Employee id that will own the item.
- \`due_at\` (optional): Due date/time (ISO-8601 string, e.g. 2025-03-15 or 2025-03-15T17:00:00Z).
- \`priority\` (optional): \`low\`, \`medium\`, \`high\`, or \`urgent\`.
- \`custom_properties\` (optional): JSON object of extra structured metadata (for example {"budget": 2000}).
- \`action_items\` (optional): JSON array (or single JSON object) to create multiple entries in one call. Each entry may override any field and supply its own \`company_id\`.

**Usage Notes:**
- Keep titles crisp—\`kind\` communicates intent. Pair it with one or two lines of description when context matters.
- Always provide valid employee ids for \`owner_employee_id\`; leave it out to create an unassigned item.
- When batching with \`action_items\`, top-level parameters become defaults for entries that omit the field.
- Prefer UTC timestamps for \`due_at\` if timing matters.

**Single Example:**
<create_action_item>
<company_id>COMPANY_ID</company_id>
<title>Ship onboarding checklist</title>
<kind>project</kind>
<status_id>STATUS_IN_PROGRESS</status_id>
<owner_employee_id>EMP_PRODUCT_LEAD</owner_employee_id>
<due_at>2025-10-01</due_at>
<priority>high</priority>
<description>Coordinate design, docs, and QA to launch the new onboarding journey.</description>
<custom_properties>{"workspace":"growth","okr_ref":"OBJ-2025-Q4-1"}</custom_properties>
</create_action_item>

**Batch Example:**
<create_action_item>
<company_id>COMPANY_ID</company_id>
<action_items>
[
  {
    "title": "Draft customer interview plan",
    "kind": "task",
    "owner_employee_id": "EMP_UX_RESEARCH",
    "due_at": "2025-09-25"
  },
  {
    "company_id": "ALT_COMPANY",
    "title": "Define Q1 growth targets",
    "kind": "goal",
    "priority": "urgent"
  }
]
</action_items>
</create_action_item>
`;
}
//# sourceMappingURL=create-action-item.js.map