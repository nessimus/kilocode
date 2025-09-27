import { CommitMessageProvider } from "./CommitMessageProvider";
import { t } from "../../i18n";
/**
 * Registers the commit message provider with the extension context.
 * This function should be called during extension activation.
 */
export function registerCommitMessageProvider(context, outputChannel) {
    const commitProvider = new CommitMessageProvider(context, outputChannel);
    commitProvider.activate().catch((error) => {
        outputChannel.appendLine(t("kilocode:commitMessage.activationFailed", { error: error.message }));
        console.error("Commit message provider activation failed:", error);
    });
    outputChannel.appendLine(t("kilocode:commitMessage.providerRegistered"));
}
//# sourceMappingURL=index.js.map