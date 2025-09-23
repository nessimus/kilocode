import { ToolArgs } from "./types"

export function getCreateDepartmentDescription(_args?: ToolArgs): string {
	return `## create_department

**Description:**
Add a new department to a Golden Workplace company. Provide the company identifier and the department name; include an optional description for additional context.

**Parameters:**
- \`company_id\` (required unless every entry in \`departments\` provides one): Target company identifier.
- \`name\` (required when creating a single department): Department name.
- \`description\` (optional): Short explanation of the department's remit.
- \`departments\` (optional): JSON array (or object) describing one or more departments to create. Each entry may override \`company_id\`, \`name\`, and \`description\`.

**Single Example:**
<create_department>
<company_id>COMPANY_ID</company_id>
<name>Research & Development</name>
<description>Focuses on emerging AI product initiatives.</description>
</create_department>

**Bulk Example:**
<create_department>
<departments>
[
  {"company_id": "COMPANY_A", "name": "Sales Enablement"},
  {"company_id": "COMPANY_B", "name": "Field Operations", "description": "Supports on-site deployments."}
]
</departments>
</create_department>
`
}
