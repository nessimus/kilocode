import { ToolArgs } from "./types"

export function getCreateEmployeeDescription(_args?: ToolArgs): string {
	return `## create_employee

**Description:**
Add a new persona to the active Golden Workplace company. Use this tool when you want to grow the team with a specialist or helper persona. You must target an existing company by id and supply the employee's name and role. Optional fields let you capture responsibilities, personality, traits, MBTI, profile imagery, and any custom key/value attributes.

**Parameters:**
- \`company_id\` (required unless every entry in \`employees\` provides its own id): The company that should receive these hires.
- \`name\`, \`role\`, and the other optional persona fields apply when creating a single employee.
- \`employees\` (optional): JSON array (or single JSON object) of employee definitions. Each entry supports the same fields and may override \`company_id\` per persona.
- \`description\` (optional): Responsibilities or scope (one short paragraph max).
- \`personality\` (optional): Tone, style, or behavior notes.
- \`mbti_type\` (optional): One of the MBTI codes (e.g. ENFP).
- \`personality_traits\` (optional): Comma-separated traits or an array (e.g. ["curious", "systems thinker"]).
- \`profile_image_url\` (optional): HTTPS image URL.
- \`custom_attributes\` (optional): JSON object with additional metadata. Must be valid JSON.
- \`is_executive_manager\` (optional): Set to \`true\` if this employee should replace the current executive manager.

**Usage Notes:**
- Keep attributes concise. Only include details that materially change how teammates collaborate with this persona.
- When providing \`custom_attributes\`, always pass a JSON object (e.g. {"timezone": "UTC-5"}).
- Traits can be comma-separated text or an array; they will be normalized into a list.
- Creating an executive manager will automatically demote the previous one.
- Use \`employees\` when you need to create several personas in one call. Top-level fields act as defaults for entries that omit them.

**Example:**
<create_employee>
<company_id>COMPANY_ID</company_id>
<name>Riley Chen</name>
<role>Security Engineer</role>
<description>Monitors code changes for security regressions and advises on hardening tasks.</description>
<personality>Pragmatic, detail-oriented, collaborative.</personality>
<personality_traits>methodical,calm,proactive</personality_traits>
<custom_attributes>{"timezone":"UTC-5","favorite_stack":"Rust"}</custom_attributes>
</create_employee>

**Bulk Example:**
<create_employee>
<company_id>COMPANY_ID</company_id>
<employees>
[
  {
    "name": "Priya Nair",
    "role": "Data Scientist",
    "personality_traits": ["curious", "thoughtful"],
    "custom_attributes": {"timezone": "UTC+5:30"}
  },
  {
    "company_id": "SECOND_COMPANY_ID",
    "name": "Miguel Santos",
    "role": "QA Lead",
    "personality": "Calm, methodical, user-focused.",
    "is_executive_manager": true
  }
]
</employees>
</create_employee>
`
}
