export function getListEmployeesDescription(): string {
	return `## list_employees

**Description:**
List employees (personas) along with their ids and current assignments so follow-on actions can reference them correctly.

**Parameters:**
- \`company_id\` (optional): Restrict to employees within a single company.
- \`employee_id\` (optional): Fetch one employee by id.
- \`team_id\` (optional): Only include employees currently assigned to the given team.
- \`department_id\` (optional): Include employees who belong to any team inside the department.
- \`name\_contains\` (optional): Case-insensitive substring filter over employee names.
- \`include_archived\` (optional): Pass \`true\` to include archived employees.

**Usage Notes:**
- Results include employee id, name, role, company id, whether they are archived/executive, and a list of team ids.
- Combining filters narrows the set (logical AND).
- Use \`include_archived\` when you need to inspect or restore archived personas.

**Example:**
<list_employees>
<company_id>COMPANY_ID</company_id>
<name_contains>alex</name_contains>
</list_employees>
`
}
