export function getArchiveDepartmentDescription(): string {
	return `## archive_department

**Description:**
Soft-delete a department. Archived departments retain audit history but vanish from active workforce views.

**Parameters:**
- \`company_id\` (required unless every entry in \`department_ids\` includes one): Company that owns the department(s).
- \`department_id\` (required when archiving a single department): Department to archive.
- \`department_ids\` (optional): JSON array (or array of objects) describing multiple departments to archive. Entries may override \`company_id\`.

**Usage Notes:**
- Active team links are automatically severed when the department is archived.
- Use this once a department is no longer relevant but you want its past context preserved.

**Single Example:**
<archive_department>
<company_id>COMPANY_ID</company_id>
<department_id>DEPARTMENT_ID</department_id>
</archive_department>

**Bulk Example:**
<archive_department>
<company_id>COMPANY_ID</company_id>
<department_ids>["DEPT_A", "DEPT_B"]</department_ids>
</archive_department>
`
}
