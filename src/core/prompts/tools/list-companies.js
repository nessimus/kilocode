export function getListCompaniesDescription() {
    return `## list_companies

**Description:**
Retrieve the companies stored in Golden Workplace so you can reference their IDs in later calls.

**Parameters:**
- \`company_id\` (optional): Limit results to a single company id.
- \`search\` (optional): Case-insensitive substring filter applied to the company name.
- \`include_archived\` (optional): Accepts \`true\` to include archived companies (none are archived by default, but supports future-proofing).

**Usage Notes:**
- The tool returns a compact summary for each match, including the company id, name, and counts of departments/teams/employees.
- When no filters are supplied it lists every company.

**Example:**
<list_companies>
<search>lab</search>
</list_companies>
`;
}
//# sourceMappingURL=list-companies.js.map