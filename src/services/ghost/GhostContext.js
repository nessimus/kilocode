import * as vscode from "vscode";
export class GhostContext {
    documentStore;
    constructor(documentStore) {
        this.documentStore = documentStore;
    }
    addRecentOperations(context) {
        if (!context.document) {
            return context;
        }
        const recentOperations = this.documentStore.getRecentOperations(context.document);
        if (recentOperations) {
            context.recentOperations = recentOperations;
        }
        return context;
    }
    addEditor(context) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            context.editor = editor;
        }
        return context;
    }
    addOpenFiles(context) {
        const openFiles = vscode.workspace.textDocuments.filter((doc) => doc.uri.scheme === "file");
        context.openFiles = openFiles;
        return context;
    }
    addRange(context) {
        if (!context.range && context.editor) {
            context.range = context.editor.selection;
        }
        return context;
    }
    async addAST(context) {
        if (!context.document) {
            return context;
        }
        if (this.documentStore.needsASTUpdate(context.document)) {
            await this.documentStore.storeDocument({
                document: context.document,
                parseAST: true,
                bypassDebounce: true,
            });
        }
        context.documentAST = this.documentStore.getAST(context.document.uri);
        return context;
    }
    addRangeASTNode(context) {
        if (!context.range || !context.documentAST) {
            return context;
        }
        const startPosition = {
            row: context.range.start.line,
            column: context.range.start.character,
        };
        const endPosition = {
            row: context.range.end.line,
            column: context.range.end.character,
        };
        const nodeAtCursor = context.documentAST.rootNode.descendantForPosition(startPosition, endPosition);
        if (!nodeAtCursor) {
            return context;
        }
        context.rangeASTNode = nodeAtCursor;
        return context;
    }
    addDiagnostics(context) {
        if (!context.document) {
            return context;
        }
        const diagnostics = vscode.languages.getDiagnostics(context.document.uri);
        if (diagnostics && diagnostics.length > 0) {
            context.diagnostics = diagnostics;
        }
        return context;
    }
    async generate(initialContext) {
        let context = initialContext;
        context = this.addEditor(context);
        context = this.addOpenFiles(context);
        context = this.addRange(context);
        //context = await this.addAST(context)
        context = this.addRangeASTNode(context);
        context = this.addRecentOperations(context);
        context = this.addDiagnostics(context);
        return context;
    }
}
//# sourceMappingURL=GhostContext.js.map