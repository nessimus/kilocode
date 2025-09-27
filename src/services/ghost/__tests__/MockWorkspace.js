import { MockTextDocument } from "../../mocking/MockTextDocument";
/**
 * Mock implementation of the key VSCode workspace APIs needed for testing GhostWorkspaceEdit
 */
export class MockWorkspace {
    documents = new Map();
    appliedEdits = [];
    addDocument(uri, content) {
        const document = new MockTextDocument(uri, content);
        this.documents.set(uri.toString(), document);
        return document;
    }
    async openTextDocument(uri) {
        const document = this.documents.get(uri.toString());
        if (!document) {
            throw new Error(`Document not found: ${uri.toString()}`);
        }
        return document;
    }
    async applyEdit(workspaceEdit) {
        this.appliedEdits.push(workspaceEdit);
        let allEditsSuccessful = true;
        // Apply each text edit to the corresponding document
        for (const [uri, textEdits] of workspaceEdit.entries()) {
            const document = this.documents.get(uri.toString());
            if (!document) {
                console.warn(`Document not found for edit: ${uri.toString()}`);
                allEditsSuccessful = false;
                continue;
            }
            await this.applyTextEditsToDocument(document, textEdits);
        }
        return allEditsSuccessful;
    }
    async applyTextEditsToDocument(document, textEdits) {
        // Sort edits by position in reverse order to avoid position shifting issues
        const sortedEdits = [...textEdits]
            .filter((edit) => "range" in edit && "newText" in edit)
            .sort((a, b) => {
            const startCompare = b.range.start.line - a.range.start.line;
            if (startCompare !== 0)
                return startCompare;
            return b.range.start.character - a.range.start.character;
        });
        let currentContent = document.getText();
        const lines = currentContent.split("\n");
        for (const edit of sortedEdits) {
            const range = edit.range;
            const newText = edit.newText;
            if (range.start.line === range.end.line) {
                // Single line edit
                const line = lines[range.start.line] || "";
                const newLine = line.slice(0, range.start.character) + newText + line.slice(range.end.character);
                lines[range.start.line] = newLine;
            }
            else {
                // Multi-line edit
                const startLine = lines[range.start.line] || "";
                const endLine = lines[range.end.line] || "";
                const newLine = startLine.slice(0, range.start.character) + newText + endLine.slice(range.end.character);
                // Remove the lines in between and replace with the new content
                lines.splice(range.start.line, range.end.line - range.start.line + 1, newLine);
            }
        }
        // Update the document with the new content
        const newContent = lines.join("\n");
        document.updateContent(newContent);
    }
    getDocumentContent(uri) {
        const document = this.documents.get(uri.toString());
        return document ? document.getText() : "";
    }
    getAppliedEdits() {
        return this.appliedEdits;
    }
    clear() {
        this.documents.clear();
        this.appliedEdits.length = 0;
    }
}
//# sourceMappingURL=MockWorkspace.js.map