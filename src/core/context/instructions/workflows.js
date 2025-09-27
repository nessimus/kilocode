import path from "path";
import os from "os";
import { ContextProxy } from "../../config/ContextProxy";
import { GlobalFileNames } from "../../../shared/globalFileNames";
import { synchronizeRuleToggles } from "./rule-helpers";
async function refreshLocalWorkflowToggles(proxy, context, workingDirectory) {
    const workflowRulesToggles = (await proxy.getWorkspaceState(context, "localWorkflowToggles")) || {};
    const workflowsDirPath = path.resolve(workingDirectory, GlobalFileNames.workflows);
    const updatedWorkflowToggles = await synchronizeRuleToggles(workflowsDirPath, workflowRulesToggles);
    await proxy.updateWorkspaceState(context, "localWorkflowToggles", updatedWorkflowToggles);
    return updatedWorkflowToggles;
}
async function refreshGlobalWorkflowToggles(proxy) {
    const globalWorkflowToggles = (await proxy.getGlobalState("globalWorkflowToggles")) || {};
    const globalWorkflowsDir = path.join(os.homedir(), GlobalFileNames.workflows);
    const updatedGlobalWorkflowToggles = await synchronizeRuleToggles(globalWorkflowsDir, globalWorkflowToggles);
    await proxy.updateGlobalState("globalWorkflowToggles", updatedGlobalWorkflowToggles);
    return updatedGlobalWorkflowToggles;
}
export async function refreshWorkflowToggles(context, workingDirectory) {
    const proxy = new ContextProxy(context);
    return {
        globalWorkflowToggles: await refreshGlobalWorkflowToggles(proxy),
        localWorkflowToggles: await refreshLocalWorkflowToggles(proxy, context, workingDirectory),
    };
}
//# sourceMappingURL=workflows.js.map