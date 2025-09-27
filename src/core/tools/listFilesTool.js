import * as path from "path";
import { formatResponse } from "../prompts/responses";
import { listFiles } from "../../services/glob/list-files";
import { getReadablePath } from "../../utils/path";
import { isPathOutsideWorkspace } from "../../utils/pathUtils";
/**
 * Implements the list_files tool.
 *
 * @param cline - The instance of Cline that is executing this tool.
 * @param block - The block of assistant message content that specifies the
 *   parameters for this tool.
 * @param askApproval - A function that asks the user for approval to show a
 *   message.
 * @param handleError - A function that handles an error that occurred while
 *   executing this tool.
 * @param pushToolResult - A function that pushes the result of this tool to the
 *   conversation.
 * @param removeClosingTag - A function that removes a closing tag from a string.
 */
export async function listFilesTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag) {
    const relDirPath = block.params.path;
    const recursiveRaw = block.params.recursive;
    const recursive = recursiveRaw?.toLowerCase() === "true";
    // Calculate if the path is outside workspace
    const absolutePath = relDirPath ? path.resolve(cline.cwd, relDirPath) : cline.cwd;
    const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath);
    const sharedMessageProps = {
        tool: !recursive ? "listFilesTopLevel" : "listFilesRecursive",
        path: getReadablePath(cline.cwd, removeClosingTag("path", relDirPath)),
        isOutsideWorkspace,
    };
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({ ...sharedMessageProps, content: "" });
            await cline.ask("tool", partialMessage, block.partial).catch(() => { });
            return;
        }
        else {
            if (!relDirPath) {
                cline.consecutiveMistakeCount++;
                cline.recordToolError("list_files");
                pushToolResult(await cline.sayAndCreateMissingParamError("list_files", "path"));
                return;
            }
            cline.consecutiveMistakeCount = 0;
            const [files, didHitLimit] = await listFiles(absolutePath, recursive, 200);
            const { showRooIgnoredFiles = false } = (await cline.providerRef.deref()?.getState()) ?? {};
            const result = formatResponse.formatFilesList(absolutePath, files, didHitLimit, cline.rooIgnoreController, showRooIgnoredFiles, cline.rooProtectedController);
            const completeMessage = JSON.stringify({ ...sharedMessageProps, content: result });
            const didApprove = await askApproval("tool", completeMessage);
            if (!didApprove) {
                return;
            }
            pushToolResult(result);
        }
    }
    catch (error) {
        await handleError("listing files", error);
    }
}
//# sourceMappingURL=listFilesTool.js.map