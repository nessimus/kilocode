export function getUpdateEmployeeDescription() {
    return `## update_employee

**Description:**
Update an existing employee persona. Provide the company and employee identifiers, plus any fields that should change.

- \`company_id\` (required unless every entry in \`employee_updates\` specifies one): Company that the employee belongs to.
- \`employee_id\` (required when updating a single employee): Employee to update.
- \`name\`, \`role\`, \`description\`, \`personality\` (optional): New identity fields.
- \`mbti_type\` (optional): Updated MBTI code.
- \`personality_traits\` (optional): Comma-separated traits or JSON array.
- \`profile_image_url\` (optional): HTTPS image URL.
- \`custom_attributes\` (optional): JSON object of additional metadata.
- \`is_executive_manager\` (optional): Set to \`true\`/\`false\` to toggle executive-manager status.
- \`employee_updates\` (optional): JSON array (or object) describing multiple updates. Each entry may set \`company_id\`, \`employee_id\`, and the fields to change.

**Usage Notes:**
- Only include fields you want to change; everything else stays as-is.
- Trait and custom attribute inputs are normalized to lists/objects.
- Promoting an employee to executive manager automatically demotes the previous one.

**Single Example:**
<update_employee>
<company_id>COMPANY_ID</company_id>
<employee_id>EMPLOYEE_ID</employee_id>
<role>Lead Reliability Engineer</role>
<personality_traits>calm,systems thinker</personality_traits>
<custom_attributes>{"timezone":"UTC-6"}</custom_attributes>
</update_employee>

**Bulk Example:**
<update_employee>
<employee_updates>
[
  {"company_id": "COMPANY_ID", "employee_id": "EMPLOYEE_1", "role": "Staff PM"},
  {"company_id": "COMPANY_ID", "employee_id": "EMPLOYEE_2", "personality_traits": "supportive, detail-oriented"}
]
</employee_updates>
</update_employee>
`;
}
//# sourceMappingURL=update-employee.js.map