export function getUpdateDepartmentDescription() {
    return `## update_department

**Description:**
Modify an existing department's details. Supply the company and department identifiers and any fields you want to change.

**Parameters:**
- \`company_id\` (required unless every entry in \`department_updates\` provides one): Company that owns the department.
- \`department_id\` (required when updating a single department): Department to update.
- \`name\` (optional): New department name.
- \`description\` (optional): Updated description.
- \`department_updates\` (optional): JSON array (or object) describing multiple updates. Each entry may supply \`company_id\`, \`department_id\`, and the fields to change.

**Usage Notes:**
- Fields you omit remain unchanged.
- Keep descriptions concise so the UI summary stays readable.

**Single Example:**
<update_department>
<company_id>COMPANY_ID</company_id>
<department_id>DEPARTMENT_ID</department_id>
<name>Customer Experience</name>
<description>Aligns support, success, and advocacy programs.</description>
</update_department>

**Bulk Example:**
<update_department>
<department_updates>
[
  {"company_id": "COMPANY_ID", "department_id": "DEPT_A", "name": "Strategy"},
  {"company_id": "COMPANY_ID", "department_id": "DEPT_B", "description": "Handles GTM enablement."}
]
</department_updates>
</update_department>
`;
}
//# sourceMappingURL=update-department.js.map