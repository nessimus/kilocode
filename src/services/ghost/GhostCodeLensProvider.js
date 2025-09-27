import * as vscode from "vscode";
export class GhostCodeLensProvider {
    // This emitter will be used to signal VS Code to refresh the CodeLenses
    _onDidChangeCodeLenses = new vscode.EventEmitter();
    onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
    activeSuggestionRange;
    constructor() {
        // Refresh lenses when the configuration changes
        vscode.workspace.onDidChangeConfiguration((_) => {
            this._onDidChangeCodeLenses.fire();
        });
    }
    // Method to be called by your extension to show/hide the lens
    setSuggestionRange(range) {
        this.activeSuggestionRange = range;
        this._onDidChangeCodeLenses.fire();
    }
    provideCodeLenses(document, token) {
        if (this.activeSuggestionRange) {
            const accept = new vscode.CodeLens(this.activeSuggestionRange);
            accept.command = {
                title: "Accept (Tab)",
                command: "kilo-code.ghost.applyCurrentSuggestions",
                arguments: [],
            };
            const dismiss = new vscode.CodeLens(this.activeSuggestionRange);
            dismiss.command = {
                title: "Dismiss All (Esc)",
                command: "kilo-code.ghost.cancelSuggestions",
                arguments: [],
            };
            const next = new vscode.CodeLens(this.activeSuggestionRange);
            next.command = {
                title: "Next (↓)",
                command: "kilo-code.ghost.goToNextSuggestion",
                arguments: [],
            };
            const previous = new vscode.CodeLens(this.activeSuggestionRange);
            previous.command = {
                title: "Previous (↑)",
                command: "kilo-code.ghost.goToPreviousSuggestion",
                arguments: [],
            };
            return [accept, dismiss, next, previous];
        }
        return;
    }
}
//# sourceMappingURL=GhostCodeLensProvider.js.map