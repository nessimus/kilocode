/**
 * Generates the upsert_sop tool description.
 */
export function getUpsertSopDescription() {
    return `## upsert_sop
Description: Create or update a Standard Operating Procedure so future runs can reuse it. Supports both loose document guidance (Markdown) and strict workflow definitions (JSON).

Parameters:
- sop_name: (required) Human-readable SOP title. Used to derive the slug/filename.
- content: (required) SOP body. For document SOPs provide Markdown; for workflow SOPs provide the JSON definition.
- sop_variant: (optional) "document" (default) or "workflow".
- sop_scope: (optional) "project" (default) to save inside the current workspace, or "global" to share across workspaces.
- description: (optional) Short summary stored in frontmatter for document SOPs.

Usage:
<upsert_sop>
<sop_name>Create release checklist</sop_name>
<content>1. Draft notes\n2. QA sign-off\n3. Publish announcement</content>
<description>Checklist for weekly releases</description>
</upsert_sop>

Workflow example:
<upsert_sop>
<sop_name>deploy</sop_name>
<sop_variant>workflow</sop_variant>
<content>{"nodes":[],"edges":[]}</content>
</upsert_sop>

Emit this tool after confirming the user is satisfied so SOPs stay current, and reference the SOP slug in follow-up guidance.`;
}
//# sourceMappingURL=upsert-sop.js.map