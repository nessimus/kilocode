const cloverAutomationFunctionEntries = [
	{
		name: "list_companies",
		title: "Review Company IDs",
		description:
			"Pull the roster of existing company workspaces with their unique identifiers and staffing counts.",
		promptDetail:
			'optional filters: "search" (match name or id substring) and "limit" (1-25, default 10). Returns bullet points with each company\'s id, name, and basic stats. Run before update_company when you need to confirm a target id.',
	},
	{
		name: "list_insights",
		title: "Review Insight IDs",
		description:
			"Surface recent captured insights, including their ids, stage, and routing metadata for quick reference.",
		promptDetail:
			'optional filters: "search" (title or summary match), "stage" (captured|processing|ready|assigned), "assigned_company_id", and "limit" (1-25, default 10). Use before update_insight to grab the exact id you intend to adjust.',
	},
	{
		name: "create_company",
		title: "Launch A New Company Space",
		description:
			"Spin up a fresh workspace with a name, story, and optional owner profile so Clover can begin organizing momentum immediately.",
		promptDetail:
			'requires "name". Optional keys: "vision", "mission", "owner_profile" (object with name, role, first_name, last_name, bio, mbti_type, personality_traits), and "update_default_owner_profile" (boolean). For bulk creation, provide "companies" as an array of entries with the same fields.',
	},
	{
		name: "update_company",
		title: "Refresh Company Details",
		description:
			"Keep an existing workspace aligned by updating its mission, leadership profile, or narrative in one sweep or in bulk.",
		promptDetail:
			'supply "company_id" for single updates or "company_updates" (array) for bulk edits. Optional keys mirror create_company.',
	},
	{
		name: "create_insight",
		title: "Capture A New Insight",
		description:
			"Log a breakthrough thread from chat, documents, or voice notes so it enters the analysis pool with proper routing.",
		promptDetail:
			'requires "title". Optional keys: "summary", "recommended_workspace", "assigned_company_id", "stage" (captured|processing|ready|assigned), "source_type" (conversation|document|voice|integration), "captured_at_iso", and "note". Provide "insights" as an array for bulk creation.',
	},
	{
		name: "update_insight",
		title: "Refine An Existing Insight",
		description:
			"Advance momentum by changing an insight’s status, summary, or workspace assignment as the story evolves.",
		promptDetail:
			'requires "id" (or "insight_updates" array). Optional keys match create_insight plus "title" edits and "note" to describe the adjustment.',
	},
] as const

export type CloverAutomationFunctionName =
	(typeof cloverAutomationFunctionEntries)[number]["name"]

export interface CloverAutomationFunctionDefinition {
	/**
	 * Machine-readable function call name shared with Clover's automation layer.
	 */
	name: CloverAutomationFunctionName
	/**
	 * Human-readable title suitable for UI surfaces.
	 */
	title: string
	/**
	 * Short description of what the function helps Clover accomplish.
	 */
	description: string
	/**
	 * Detailed argument guidance embedded into Clover's system prompt.
	 */
	promptDetail: string
}

export const cloverAutomationFunctions: ReadonlyArray<CloverAutomationFunctionDefinition> =
	cloverAutomationFunctionEntries

export const cloverAutomationFunctionPromptList = cloverAutomationFunctions
	.map((fn) => `- ${fn.name}: ${fn.promptDetail}`)
	.join("\n")

export const cloverAutomationFunctionNames = new Set<CloverAutomationFunctionName>(
	cloverAutomationFunctions.map((fn) => fn.name),
)
