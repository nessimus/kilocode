import fs from "fs/promises";
import { formatResponse } from "../prompts/responses";
import { getCommand, getCommandNames } from "../../services/command/commands";
import { EXPERIMENT_IDS, experiments } from "../../shared/experiments";
import { refreshWorkflowToggles } from "../context/instructions/workflows";
import { collectEnabledWorkflowSops, findWorkflowSop, formatWorkflowSourceLabel, getPrimaryWorkflowSlug, } from "../slash-commands/sopWorkflowUtils";
export async function runSlashCommandTool(task, block, askApproval, handleError, pushToolResult, removeClosingTag) {
    // Check if run slash command experiment is enabled
    const provider = task.providerRef.deref();
    const state = await provider?.getState();
    const isRunSlashCommandEnabled = experiments.isEnabled(state?.experiments ?? {}, EXPERIMENT_IDS.RUN_SLASH_COMMAND);
    if (!isRunSlashCommandEnabled) {
        pushToolResult(formatResponse.toolError("Standard Operating Procedures are an experimental feature. Please enable 'Run Slash Command' under Experimental Settings to unlock SOP guidance."));
        return;
    }
    const commandName = block.params.command;
    const args = block.params.args;
    try {
        if (block.partial) {
            const normalizedCommand = removeClosingTag("command", commandName);
            const partialMessage = JSON.stringify({
                tool: "runSlashCommand",
                command: normalizedCommand,
                sop: normalizedCommand,
                sop_variant: undefined,
                args: removeClosingTag("args", args),
            });
            await task.ask("tool", partialMessage, block.partial).catch(() => { });
            return;
        }
        else {
            if (!commandName) {
                task.consecutiveMistakeCount++;
                task.recordToolError("run_slash_command");
                pushToolResult(await task.sayAndCreateMissingParamError("run_slash_command", "command"));
                return;
            }
            task.consecutiveMistakeCount = 0;
            const documentCommand = await getCommand(task.cwd, commandName);
            const providerContext = provider?.context;
            const workflowToggleState = providerContext
                ? await refreshWorkflowToggles(providerContext, task.cwd)
                : undefined;
            const workflowEntries = workflowToggleState
                ? collectEnabledWorkflowSops(workflowToggleState.localWorkflowToggles, workflowToggleState.globalWorkflowToggles)
                : [];
            const workflowMatch = documentCommand ? undefined : findWorkflowSop(workflowEntries, commandName);
            if (!documentCommand && !workflowMatch) {
                const availableCommands = await getCommandNames(task.cwd);
                const workflowNames = workflowEntries.map((entry) => getPrimaryWorkflowSlug(entry));
                task.recordToolError("run_slash_command");
                const documentList = availableCommands.length ? availableCommands.join(", ") : "(none)";
                const workflowList = workflowNames.length ? workflowNames.join(", ") : "(none)";
                pushToolResult(formatResponse.toolError(`Standard Operating Procedure '${commandName}' not found. Document SOPs: ${documentList}. Workflow SOPs: ${workflowList}.`));
                return;
            }
            const sopVariant = documentCommand ? "document" : "workflow";
            const sopContent = documentCommand
                ? documentCommand.content.trim()
                : (await fs.readFile(workflowMatch.fullPath, "utf8")).trim();
            const sopPath = documentCommand ? documentCommand.filePath : workflowMatch.fullPath;
            const sopSource = documentCommand
                ? documentCommand.source
                : formatWorkflowSourceLabel(workflowMatch.source);
            const sopName = documentCommand ? documentCommand.name : getPrimaryWorkflowSlug(workflowMatch);
            const sopDisplayName = documentCommand ? documentCommand.name : workflowMatch.fileName;
            const sopDescription = documentCommand?.description;
            const sopArgumentHint = documentCommand?.argumentHint;
            const toolMessage = JSON.stringify({
                tool: "runSlashCommand",
                command: sopName,
                sop: sopName,
                sop_variant: sopVariant,
                sopVariant,
                variant: sopVariant,
                displayName: sopDisplayName,
                args,
                source: sopSource,
                description: sopDescription,
                argument_hint: sopArgumentHint,
                argumentHint: sopArgumentHint,
                path: sopPath,
                filePath: sopPath,
            });
            const didApprove = await askApproval("tool", toolMessage);
            if (!didApprove) {
                return;
            }
            let result = `Standard Operating Procedure: ${sopDisplayName}`;
            result += `\nType: ${sopVariant === "document" ? "Loose document guidance" : "Strict workflow"}`;
            result += `\nSource: ${sopSource}`;
            if (sopDescription) {
                result += `\nSummary: ${sopDescription}`;
            }
            if (sopVariant === "document" && sopArgumentHint) {
                result += `\nUsage hint: ${sopArgumentHint}`;
            }
            if (args) {
                result += `\nContext provided: ${args}`;
            }
            const sectionLabel = sopVariant === "document" ? "Document Guidance" : "Workflow Definition";
            result += `\n\n--- ${sectionLabel} ---\n\n${sopContent}`;
            if (sopVariant === "workflow") {
                result += `\n\nFollow this workflow sequentially, honoring each node's inputs and outputs before advancing.`;
            }
            else {
                result += `\n\nUse this document as a reference and narrate how each step applies to the current task.`;
            }
            pushToolResult(result);
            return;
        }
    }
    catch (error) {
        await handleError("running slash command", error);
        return;
    }
}
//# sourceMappingURL=runSlashCommandTool.js.map