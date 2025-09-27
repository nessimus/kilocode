import * as vscode from "vscode";
import { t } from "../../i18n";
export class GhostCodeActionProvider {
    providedCodeActionKinds = {
        quickfix: vscode.CodeActionKind.QuickFix,
    };
    provideCodeActions(document, range, context, token) {
        const action = new vscode.CodeAction(t("kilocode:ghost.codeAction.title"), this.providedCodeActionKinds["quickfix"]);
        action.command = {
            command: "kilo-code.ghost.generateSuggestions",
            title: "",
            arguments: [document.uri, range],
        };
        return [action];
    }
    async resolveCodeAction(codeAction, token) {
        if (token.isCancellationRequested) {
            return codeAction;
        }
        return codeAction;
    }
}
//# sourceMappingURL=GhostCodeActionProvider.js.map