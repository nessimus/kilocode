export function getUpdateActionItemDescription(): string {
	return `## update_action_item

**Description:**
Modify an existing action item. Use this tool to change status, reassign ownership, adjust the title or description, update due dates, or tweak custom properties.

**Parameters:**
- \`company_id\` (required unless every entry in \`action_item_updates\` sets its own id): Company that owns the action item.
- \`action_item_id\` (required when not using \`action_item_updates\`): The item to modify.
- \`title\`, \`kind\`, \`status_id\`, \`description\`, \`owner_employee_id\`, \`due_at\`, \`priority\`, \`custom_properties\`: Optional fields to update when editing a single item.
- \`action_item_updates\` (optional): JSON array (or single JSON object) describing batch updates. Each entry must include \`action_item_id\` (and optionally \`company_id\`) plus any fields to change.

**Usage Notes:**
- To unassign an owner, set \`owner_employee_id\` to \`null\`, \`"none"\`, or leave it empty in \`action_item_updates\`. The tool will clear the owner field.
- Clearing optional fields works the same way—pass \`null\` (or \`"none"\`) for \`due_at\`, \`description\`, \`priority\`, or \`custom_properties\` to remove their values.
- When editing multiple items, top-level parameters become defaults that apply to any update entry that omits that field.
- Always use valid status ids from the target company; \`kind\` must remain one of \`goal\`, \`project\`, or \`task\`.

**Single Example:**
<update_action_item>
<company_id>COMPANY_ID</company_id>
<action_item_id>AI-123</action_item_id>
<status_id>STATUS_COMPLETE</status_id>
<owner_employee_id>none</owner_employee_id>
<priority>medium</priority>
</update_action_item>

**Batch Example:**
<update_action_item>
<company_id>COMPANY_ID</company_id>
<action_item_updates>
[
  {
    "action_item_id": "AI-201",
    "status_id": "STATUS_IN_PROGRESS",
    "owner_employee_id": "EMP_DELIVERY"
  },
  {
    "action_item_id": "AI-305",
    "due_at": null,
    "custom_properties": {"blocked_by": "AI-201"}
  }
]
</action_item_updates>
</update_action_item>
`
}
