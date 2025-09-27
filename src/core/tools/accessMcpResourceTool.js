import { formatResponse } from "../prompts/responses";
export async function accessMcpResourceTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag) {
    const server_name = block.params.server_name;
    const uri = block.params.uri;
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({
                type: "access_mcp_resource",
                serverName: removeClosingTag("server_name", server_name),
                uri: removeClosingTag("uri", uri),
            });
            await cline.ask("use_mcp_server", partialMessage, block.partial).catch(() => { });
            return;
        }
        else {
            if (!server_name) {
                cline.consecutiveMistakeCount++;
                cline.recordToolError("access_mcp_resource");
                pushToolResult(await cline.sayAndCreateMissingParamError("access_mcp_resource", "server_name"));
                return;
            }
            if (!uri) {
                cline.consecutiveMistakeCount++;
                cline.recordToolError("access_mcp_resource");
                pushToolResult(await cline.sayAndCreateMissingParamError("access_mcp_resource", "uri"));
                return;
            }
            cline.consecutiveMistakeCount = 0;
            const completeMessage = JSON.stringify({
                type: "access_mcp_resource",
                serverName: server_name,
                uri,
            });
            const didApprove = await askApproval("use_mcp_server", completeMessage);
            if (!didApprove) {
                return;
            }
            // Now execute the tool
            await cline.say("mcp_server_request_started");
            const resourceResult = await cline.providerRef.deref()?.getMcpHub()?.readResource(server_name, uri);
            const resourceResultPretty = resourceResult?.contents
                .map((item) => {
                if (item.text) {
                    return item.text;
                }
                return "";
            })
                .filter(Boolean)
                .join("\n\n") || "(Empty response)";
            // Handle images (image must contain mimetype and blob)
            let images = [];
            resourceResult?.contents.forEach((item) => {
                if (item.mimeType?.startsWith("image") && item.blob) {
                    if (item.blob.startsWith("data:")) {
                        images.push(item.blob);
                    }
                    else {
                        images.push(`data:${item.mimeType};base64,` + item.blob);
                    }
                }
            });
            await cline.say("mcp_server_response", resourceResultPretty, images);
            pushToolResult(formatResponse.toolResult(resourceResultPretty, images));
            return;
        }
    }
    catch (error) {
        await handleError("accessing MCP resource", error);
        return;
    }
}
//# sourceMappingURL=accessMcpResourceTool.js.map