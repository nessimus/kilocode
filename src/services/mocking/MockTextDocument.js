import * as vscode from "vscode";
/**
 * A simulated vscode TextDocument for testing.
 */
export class MockTextDocument {
    contentLines;
    uri;
    fileName;
    isUntitled = false;
    languageId = "typescript";
    version = 1;
    isDirty = false;
    isClosed = false;
    eol = 1; // vscode.EndOfLine.LF
    get encoding() {
        return "utf8";
    }
    get notebook() {
        return undefined;
    }
    constructor(uri, content) {
        this.uri = uri;
        this.fileName = uri.fsPath;
        this.contentLines = content.split("\n");
    }
    updateContent(newContent) {
        this.contentLines = newContent.split("\n");
        this.version++;
        this.isDirty = true;
    }
    getText(range) {
        if (!range) {
            return this.contentLines.join("\n");
        }
        const startLine = range.start.line;
        const endLine = range.end.line;
        if (startLine === endLine) {
            return this.contentLines[startLine].substring(range.start.character, range.end.character);
        }
        const lines = [];
        for (let i = startLine; i <= endLine && i < this.contentLines.length; i++) {
            if (i === startLine) {
                lines.push(this.contentLines[i].substring(range.start.character));
            }
            else if (i === endLine) {
                lines.push(this.contentLines[i].substring(0, range.end.character));
            }
            else {
                lines.push(this.contentLines[i]);
            }
        }
        return lines.join("\n");
    }
    get lineCount() {
        return this.contentLines.length;
    }
    /**
     * Returns information about a specific line in the document
     * @param lineNumber The zero-based line number
     * @returns A simplified TextLine object containing the text and position information
     */
    lineAt(positionOrLine) {
        const line = typeof positionOrLine === "number" ? positionOrLine : positionOrLine.line;
        if (line < 0 || line >= this.contentLines.length) {
            throw new Error(`Invalid line number: ${line}`);
        }
        const text = this.contentLines[line];
        const range = new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, text.length));
        return {
            text,
            range,
            lineNumber: line,
            rangeIncludingLineBreak: range, // Simplified for mock
            firstNonWhitespaceCharacterIndex: text.search(/\S|$/),
            isEmptyOrWhitespace: !/\S/.test(text),
        };
    }
    // Add other required methods with mock implementations
    offsetAt(position) {
        let offset = 0;
        for (let i = 0; i < position.line; i++) {
            if (i < this.contentLines.length) {
                offset += this.contentLines[i].length + 1; // +1 for newline
            }
        }
        offset += position.character;
        return offset;
    }
    positionAt(offset) {
        let currentOffset = 0;
        for (let i = 0; i < this.contentLines.length; i++) {
            const lineLength = this.contentLines[i].length + 1;
            if (currentOffset + lineLength > offset) {
                return new vscode.Position(i, offset - currentOffset);
            }
            currentOffset += lineLength;
        }
        // If offset is beyond the end of the document
        const lastLine = this.contentLines.length - 1;
        const lastLineLength = this.contentLines[lastLine]?.length || 0;
        return new vscode.Position(lastLine, lastLineLength);
    }
    save() {
        this.isDirty = false;
        return Promise.resolve(true);
    }
    getWordRangeAtPosition(position, regex) {
        const line = this.lineAt(position.line);
        const text = line.text;
        const wordRegex = regex || /(-?\d*\.\d\w*)|([^\`\~\!\@\#\$\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g;
        let match;
        while ((match = wordRegex.exec(text)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (position.character >= start && position.character <= end) {
                return new vscode.Range(position.line, start, position.line, end);
            }
        }
        return undefined;
    }
    validateRange(range) {
        // Simplified validation
        return range;
    }
    validatePosition(position) {
        // Simplified validation
        return position;
    }
}
//# sourceMappingURL=MockTextDocument.js.map