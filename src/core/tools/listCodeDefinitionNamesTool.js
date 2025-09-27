import path from "path";
import fs from "fs/promises";
import { getReadablePath } from "../../utils/path";
import { isPathOutsideWorkspace } from "../../utils/pathUtils";
import { parseSourceCodeForDefinitionsTopLevel, parseSourceCodeDefinitionsForFile } from "../../services/tree-sitter";
export async function listCodeDefinitionNamesTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag) {
    const relPath = block.params.path;
    // Calculate if the path is outside workspace
    const absolutePath = relPath ? path.resolve(cline.cwd, relPath) : cline.cwd;
    const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath);
    const sharedMessageProps = {
        tool: "listCodeDefinitionNames",
        path: getReadablePath(cline.cwd, removeClosingTag("path", relPath)),
        isOutsideWorkspace,
    };
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({ ...sharedMessageProps, content: "" });
            await cline.ask("tool", partialMessage, block.partial).catch(() => { });
            return;
        }
        else {
            if (!relPath) {
                cline.consecutiveMistakeCount++;
                cline.recordToolError("list_code_definition_names");
                pushToolResult(await cline.sayAndCreateMissingParamError("list_code_definition_names", "path"));
                return;
            }
            cline.consecutiveMistakeCount = 0;
            let result;
            try {
                const stats = await fs.stat(absolutePath);
                if (stats.isFile()) {
                    const fileResult = await parseSourceCodeDefinitionsForFile(absolutePath, cline.rooIgnoreController);
                    result = fileResult ?? "No source code definitions found in cline file.";
                }
                else if (stats.isDirectory()) {
                    result = await parseSourceCodeForDefinitionsTopLevel(absolutePath, cline.rooIgnoreController);
                }
                else {
                    result = "The specified path is neither a file nor a directory.";
                }
            }
            catch {
                result = `${absolutePath}: does not exist or cannot be accessed.`;
            }
            const completeMessage = JSON.stringify({ ...sharedMessageProps, content: result });
            const didApprove = await askApproval("tool", completeMessage);
            if (!didApprove) {
                return;
            }
            if (relPath) {
                await cline.fileContextTracker.trackFileContext(relPath, "read_tool");
            }
            pushToolResult(result);
            return;
        }
    }
    catch (error) {
        await handleError("parsing source code definitions", error);
        return;
    }
}
//# sourceMappingURL=listCodeDefinitionNamesTool.js.map