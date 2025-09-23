/**
 * Generates the run_slash_command tool description.
 */
export function getRunSlashCommandDescription(): string {
	return `## run_slash_command
Description: Retrieve a Standard Operating Procedure (SOP) for the current task. SOPs come in two styles: loose document guidance and strict workflow runbooks. Use this before starting any substantial or repeatable action to check for existing playbooks.

Parameters:
- command: (required) The SOP name or slug (e.g., "init", "publish-release", "deploy.workflow")
- args: (optional) Scenario-specific context the SOP should account for

Usage:
<run_slash_command>
<command>sop_name</command>
<args>optional scenario details</args>
</run_slash_command>

Examples:

1. Loading a document SOP to analyze a codebase:
<run_slash_command>
<command>init</command>
</run_slash_command>

2. Loading a strict workflow SOP with extra context:
<run_slash_command>
<command>deploy</command>
<args>target environment: staging</args>
</run_slash_command>

The SOP content will be returned with its type, source, and guidance so you can follow or narrate each step.`
}
