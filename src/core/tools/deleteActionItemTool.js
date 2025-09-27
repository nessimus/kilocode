import { formatResponse } from "../prompts/responses";
function toOptionalString(value) {
    const trimmed = value?.trim();
    return trimmed && trimmed.length ? trimmed : undefined;
}
function toOptionalStringFromUnknown(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value === "string") {
        return toOptionalString(value);
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return toOptionalString(String(value));
    }
    return undefined;
}
function parseDeleteJson(raw, fallbackCompanyId, fallbackActionItemId) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error("action_item_ids must be valid JSON (array or object)");
    }
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) {
        if (!fallbackCompanyId) {
            throw new Error("action_item_ids array requires a top-level company_id");
        }
        return parsed.map((id, index) => {
            const actionItemId = toOptionalString(id);
            if (!actionItemId) {
                throw new Error(`action_item_ids[${index}] is empty`);
            }
            return { companyId: fallbackCompanyId, actionItemId };
        });
    }
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    if (!entries.length) {
        throw new Error("action_item_ids must include at least one entry");
    }
    return entries.map((entry, index) => {
        if (!entry || typeof entry !== "object") {
            throw new Error(`action_item_ids[${index}] must be an object or string`);
        }
        const record = entry;
        const companyId = toOptionalStringFromUnknown(record["company_id"] ?? record["companyId"]) ?? fallbackCompanyId;
        if (!companyId) {
            throw new Error(`action_item_ids[${index}] is missing company_id`);
        }
        const actionItemId = toOptionalStringFromUnknown(record["action_item_id"] ?? record["actionItemId"]) ?? fallbackActionItemId;
        if (!actionItemId) {
            throw new Error(`action_item_ids[${index}] is missing action_item_id`);
        }
        return { companyId, actionItemId };
    });
}
export async function deleteActionItemTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag) {
    const companyIdRaw = block.params.company_id;
    const actionItemIdRaw = block.params.action_item_id;
    const actionItemIdsRaw = block.params.action_item_ids;
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({
                tool: "deleteActionItem",
                company_id: removeClosingTag("company_id", companyIdRaw),
                action_item_id: removeClosingTag("action_item_id", actionItemIdRaw),
                action_item_ids: removeClosingTag("action_item_ids", actionItemIdsRaw),
            });
            await cline.ask("tool", partialMessage, block.partial).catch(() => { });
            return;
        }
        const defaultCompanyId = toOptionalString(companyIdRaw);
        const defaultActionItemId = toOptionalString(actionItemIdRaw);
        let descriptors;
        try {
            if (actionItemIdsRaw && actionItemIdsRaw.trim().length) {
                descriptors = parseDeleteJson(actionItemIdsRaw.trim(), defaultCompanyId, defaultActionItemId);
            }
            else {
                if (!defaultCompanyId) {
                    throw new Error("company_id is required when action_item_ids is not provided");
                }
                if (!defaultActionItemId) {
                    throw new Error("action_item_id is required when action_item_ids is not provided");
                }
                descriptors = [{ companyId: defaultCompanyId, actionItemId: defaultActionItemId }];
            }
        }
        catch (error) {
            cline.consecutiveMistakeCount++;
            cline.recordToolError("delete_action_item");
            pushToolResult(formatResponse.toolError(error instanceof Error ? error.message : String(error)));
            return;
        }
        cline.consecutiveMistakeCount = 0;
        const provider = cline.providerRef.deref();
        if (!provider) {
            pushToolResult(formatResponse.toolError("Provider reference lost"));
            return;
        }
        const workplaceService = provider.getWorkplaceService();
        if (!workplaceService) {
            pushToolResult(formatResponse.toolError("Workplace service is unavailable in this session."));
            return;
        }
        const approvalMessage = JSON.stringify({
            tool: "deleteActionItem",
            action_item_ids: descriptors,
        });
        const didApprove = await askApproval("tool", approvalMessage);
        if (!didApprove) {
            pushToolResult("User declined to delete the action item(s).");
            return;
        }
        const summaries = [];
        for (const descriptor of descriptors) {
            const state = workplaceService.getState();
            const company = state.companies.find((entry) => entry.id === descriptor.companyId);
            if (!company) {
                throw new Error(`Company ${descriptor.companyId} not found`);
            }
            const actionItem = company.actionItems.find((entry) => entry.id === descriptor.actionItemId);
            summaries.push({
                companyId: descriptor.companyId,
                actionItemId: descriptor.actionItemId,
                title: actionItem?.title,
            });
            await workplaceService.deleteActionItem({
                companyId: descriptor.companyId,
                actionItemId: descriptor.actionItemId,
            });
        }
        await provider.postStateToWebview();
        if (!summaries.length) {
            pushToolResult(formatResponse.toolResult("No action items were deleted."));
            return;
        }
        if (summaries.length === 1) {
            const single = summaries[0];
            const titleText = single.title ? ` ${single.title}` : "";
            pushToolResult(formatResponse.toolResult(`Deleted action item${titleText} (${single.actionItemId}) from company ${single.companyId}.`));
            return;
        }
        const companySet = new Set(summaries.map((entry) => entry.companyId));
        const details = summaries
            .map((entry) => `${entry.title ?? entry.actionItemId} (${entry.actionItemId}) @ ${entry.companyId}`)
            .join("; ");
        pushToolResult(formatResponse.toolResult(`Deleted ${summaries.length} action items across ${companySet.size} companies: ${details}.`));
    }
    catch (error) {
        await handleError("delete action item", error);
    }
}
//# sourceMappingURL=deleteActionItemTool.js.map