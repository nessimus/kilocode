import * as vscode from "vscode";
import { calculateDiff } from "./utils/CharacterDiff";
import { createSVGDecorationType } from "./utils/createSVGDecorationType";
export const DELETION_DECORATION_OPTIONS = {
    isWholeLine: false,
    border: "1px solid",
    borderColor: new vscode.ThemeColor("editorGutter.deletedBackground"),
    overviewRulerColor: new vscode.ThemeColor("editorGutter.deletedBackground"),
    overviewRulerLane: vscode.OverviewRulerLane.Right,
};
/**
 * Hybrid ghost decorations: SVG highlighting for edits/additions, simple styling for deletions
 * Acts as an orchestrator using createSVGDecorationType utility
 */
export class GhostDecorations {
    deletionDecorationType;
    codeEditDecorationTypes = [];
    constructor() {
        this.deletionDecorationType = vscode.window.createTextEditorDecorationType(DELETION_DECORATION_OPTIONS);
    }
    /**
     * Display edit operations using SVG decorations
     */
    async displayEditOperationGroup(editor, group) {
        const line = Math.min(...group.map((x) => x.oldLine));
        const range = this.calculateRangeForOperations(editor, line);
        const newContent = group.find((x) => x.type === "+")?.content || "";
        if (!newContent.trim()) {
            return;
        }
        const originalContent = line < editor.document.lineCount ? editor.document.lineAt(line).text : "";
        const backgroundRanges = calculateDiff(originalContent, newContent);
        const svgContent = {
            text: newContent,
            backgroundRanges: backgroundRanges,
        };
        await this.createSvgDecoration(editor, range, svgContent);
    }
    /**
     * Display deletion operations using simple border styling
     */
    displayDeleteOperationGroup(editor, group) {
        const lines = group.map((x) => x.oldLine);
        const from = Math.min(...lines);
        const to = Math.max(...lines);
        const start = editor.document.lineAt(from).range.start;
        const end = editor.document.lineAt(to).range.end;
        const range = new vscode.Range(start, end);
        editor.setDecorations(this.deletionDecorationType, [{ range }]);
    }
    /**
     * Display suggestions using hybrid approach: SVG for edits/additions, simple styling for deletions
     */
    async displaySuggestions(suggestions) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const documentUri = editor.document.uri;
        const suggestionsFile = suggestions.getFile(documentUri);
        if (!suggestionsFile) {
            this.clearAll();
            return;
        }
        const fileOperations = suggestions.getFile(documentUri)?.getAllOperations() || [];
        if (fileOperations.length === 0) {
            this.clearAll();
            return;
        }
        const groups = suggestionsFile.getGroupsOperations();
        if (groups.length === 0) {
            this.clearAll();
            return;
        }
        const selectedGroupIndex = suggestionsFile.getSelectedGroup();
        if (selectedGroupIndex === null) {
            this.clearAll();
            return;
        }
        const selectedGroup = groups[selectedGroupIndex];
        const groupType = suggestionsFile.getGroupType(selectedGroup);
        // Clear previous decorations
        this.clearAll();
        // Route to appropriate display method
        if (groupType === "/") {
            await this.displayEditOperationGroup(editor, selectedGroup);
        }
        else if (groupType === "-") {
            this.displayDeleteOperationGroup(editor, selectedGroup);
        }
        else if (groupType === "+") {
            await this.displayAdditionsOperationGroup(editor, selectedGroup);
        }
    }
    /**
     * Display addition operations using SVG decorations
     */
    async displayAdditionsOperationGroup(editor, group) {
        const line = Math.min(...group.map((x) => x.oldLine));
        const range = this.calculateRangeForOperations(editor, line);
        const content = group
            .sort((a, b) => a.line - b.line)
            .map((x) => x.content)
            .join("\n");
        if (!content.trim()) {
            return;
        }
        // For additions, all content is new/modified (highlight entire content)
        const backgroundRanges = [{ start: 0, end: content.length, type: "modified" }];
        const svgContent = {
            text: content,
            backgroundRanges: backgroundRanges,
        };
        await this.createSvgDecoration(editor, range, svgContent);
    }
    /**
     * Calculate range for operations, handling end-of-document gracefully
     */
    calculateRangeForOperations(editor, line) {
        if (line >= editor.document.lineCount) {
            // If the line is beyond the document, use the last line of the document
            const lastLineIndex = Math.max(0, editor.document.lineCount - 1);
            const lastLineInfo = editor.document.lineAt(lastLineIndex);
            return new vscode.Range(lastLineInfo.range.end, lastLineInfo.range.end);
        }
        else {
            const nextLineInfo = editor.document.lineAt(line);
            return nextLineInfo.range;
        }
    }
    /**
     * Create SVG decoration using the createSVGDecorationType utility
     */
    async createSvgDecoration(editor, range, content) {
        const decorationType = await createSVGDecorationType(content, editor.document);
        this.codeEditDecorationTypes.push(decorationType);
        editor.setDecorations(decorationType, [{ range }]);
    }
    /**
     * Clears all ghost decorations from the active editor.
     */
    clearAll() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        editor.setDecorations(this.deletionDecorationType, []);
        for (const decorationType of this.codeEditDecorationTypes) {
            decorationType.dispose();
        }
        this.codeEditDecorationTypes = [];
    }
}
//# sourceMappingURL=GhostDecorations.js.map