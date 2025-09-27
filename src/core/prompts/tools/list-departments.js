export function getListDepartmentsDescription() {
    return `## list_departments

**Description:**
List departments so you can discover ids or verify which ones are active.

**Parameters:**
- \`company_id\` (optional): Only return departments that belong to this company.
- \`department_id\` (optional): Fetch details for a specific department id.
- \`team_id\` (optional): Filter to departments that currently include the given team.
- \`name\_contains\` (optional): Case-insensitive substring filter on the department name.
- \`include_archived\` (optional): Pass \`true\` to include archived departments.

**Usage Notes:**
- Combining filters narrows the result set (logical AND).
- Results include department id, name, company id, archived status, and linked team ids.

**Example:**
<list_departments>
<company_id>COMPANY_ID</company_id>
<include_archived>false</include_archived>
</list_departments>
`;
}
//# sourceMappingURL=list-departments.js.map