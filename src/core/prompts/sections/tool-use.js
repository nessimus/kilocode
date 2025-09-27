// NOTE: We expect to bind the assistant's skill level from model metadata soon. Keep this
// default aligned with the current production mix (all assistants are treated as "medium").
export const DEFAULT_TOOL_APPROVAL_SKILL_LEVEL = "medium";
export function getSharedToolUseSection(skillLevel = DEFAULT_TOOL_APPROVAL_SKILL_LEVEL) {
    // Future variants can tighten or relax the copy below based on skill level. For now
    // every level shares the same instructions so the prompt output stays stable until the
    // model skill plumbing is ready.
    const sharedInstruction = "You have access to a set of tools that are executed through the product's approval system. Treat those approvals as operational plumbing: default to running the right tool immediately without pausing to ask the user for permission first. Only stop to seek explicit confirmation if a tool action is unusually destructive, conflicts with stated guardrails, or the system blocks the request. You can use one tool per message, and will receive the result of that tool use in the user's response. You use tools step-by-step to accomplish a given task, with each tool use informed by the result of the previous tool use.";
    const instructionBySkill = {
        low: sharedInstruction,
        medium: sharedInstruction,
        high: sharedInstruction,
    };
    return `====

TOOL USE

${instructionBySkill[skillLevel] ?? sharedInstruction}

# Tool Use Formatting

Tool uses are formatted using XML-style tags. The tool name itself becomes the XML tag name. Each parameter is enclosed within its own set of tags. Here's the structure:

<actual_tool_name>
<parameter1_name>value1</parameter1_name>
<parameter2_name>value2</parameter2_name>
...
</actual_tool_name>

Always use the actual tool name as the XML tag name for proper parsing and execution.`;
}
//# sourceMappingURL=tool-use.js.map