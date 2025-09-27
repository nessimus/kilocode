export function getArchiveEmployeeDescription() {
    return `## archive_employee

**Description:**
Soft-delete an employee from a Golden Workplace company. The employee remains in history, but is removed from team assignments and no longer appears in active rosters.

**Parameters:**
- \`company_id\` (required unless every entry in \`employee_ids\` provides its own id): Target company.
- \`employee_id\` (required when archiving a single employee): Employee to archive.
- \`employee_ids\` (optional): JSON array (or array of objects) describing multiple employees to archive. Each entry can specify \`company_id\` and must include \`employee_id\`.

**Usage Notes:**
- Archiving an executive manager will promote another active employee automatically.
- Existing action items owned by the employee will be unassigned.
- Use this instead of deleting so you can potentially restore context later.

**Single Example:**
<archive_employee>
<company_id>COMPANY_ID</company_id>
<employee_id>EMPLOYEE_ID</employee_id>
</archive_employee>

**Bulk Example:**
<archive_employee>
<company_id>COMPANY_ID</company_id>
<employee_ids>
["EMPLOYEE_ID_1", "EMPLOYEE_ID_2"]
</employee_ids>
</archive_employee>
`;
}
//# sourceMappingURL=archive-employee.js.map