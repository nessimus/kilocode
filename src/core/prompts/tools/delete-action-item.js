export function getDeleteActionItemDescription() {
    return `## delete_action_item

**Description:**
Permanently remove an action item from a Golden Workplace company. Use this only when the work item is obsolete or was created by mistake.

**Parameters:**
- \`company_id\` (required unless every entry in \`action_item_ids\` sets its own company): Company that owns the item(s).
- \`action_item_id\` (required when not using \`action_item_ids\`): Single item to delete.
- \`action_item_ids\` (optional): JSON array (or array of objects) for bulk deletion. Each entry must include \`action_item_id\` and may override \`company_id\`.

**Usage Notes:**
- Deleting is irreversible. Prefer \`update_action_item\` to mark something complete or unassigned unless you truly want to discard it.
- When passing \`action_item_ids\` as an array of strings, provide a top-level \`company_id\`. For cross-company deletions, use an array of objects with explicit \`company_id\` per entry.
- Existing relations to the item (dependencies, parent/child links) are automatically cleaned up by the workplace service.

**Example:**
<delete_action_item>
<company_id>COMPANY_ID</company_id>
<action_item_id>AI-ARCHIVE-ME</action_item_id>
</delete_action_item>

**Bulk Example:**
<delete_action_item>
<action_item_ids>
[
  { "company_id": "COMPANY_ID", "action_item_id": "AI-OUTDATED-DOC" },
  { "company_id": "ANOTHER_COMPANY", "action_item_id": "AI-OLD-PLAN" }
]
</action_item_ids>
</delete_action_item>
`;
}
//# sourceMappingURL=delete-action-item.js.map