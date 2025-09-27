import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import * as vscode from "vscode";
import { GhostContext } from "../GhostContext";
import { GhostDocumentStore } from "../GhostDocumentStore";
import { GhostStrategy } from "../GhostStrategy";
import { MockTextDocument } from "../../mocking/MockTextDocument";
// Mock vscode
vi.mock("vscode", () => ({
    Uri: {
        parse: (uriString) => ({
            toString: () => uriString,
            fsPath: uriString.replace("file://", ""),
            scheme: "file",
            path: uriString.replace("file://", ""),
        }),
    },
    workspace: {
        asRelativePath: vi.fn().mockImplementation((uri) => {
            if (typeof uri === "string") {
                return uri.replace("file:///", "");
            }
            return uri.toString().replace("file:///", "");
        }),
        textDocuments: [], // Mock textDocuments as an empty array
    },
    window: {
        activeTextEditor: null,
    },
    languages: {
        getDiagnostics: vi.fn().mockReturnValue([]), // Mock getDiagnostics to return empty array
    },
    Position: class {
        line;
        character;
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    Range: class {
        start;
        end;
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
    DiagnosticSeverity: {
        Error: 0,
        Warning: 1,
        Information: 2,
        Hint: 3,
    },
}));
// Mock diff - using importOriginal as recommended in the error message
vi.mock("diff", async (importOriginal) => {
    // Create a mock module with the functions we need
    return {
        createPatch: vi.fn().mockImplementation((filePath, oldContent, newContent) => {
            return `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,1 +1,1 @@\n-${oldContent}\n+${newContent}`;
        }),
        structuredPatch: vi.fn().mockImplementation((oldFileName, newFileName, oldContent, newContent) => {
            return {
                hunks: [
                    {
                        oldStart: 1,
                        oldLines: 1,
                        newStart: 1,
                        newLines: 1,
                        lines: [`-${oldContent}`, `+${newContent}`],
                    },
                ],
            };
        }),
        parsePatch: vi.fn().mockReturnValue([]),
    };
});
describe("GhostRecentOperations", () => {
    let documentStore;
    let context;
    let strategy;
    let mockDocument;
    beforeEach(() => {
        documentStore = new GhostDocumentStore();
        context = new GhostContext(documentStore);
        strategy = new GhostStrategy();
        // Create a mock document
        const uri = vscode.Uri.parse("file:///test-file.ts");
        mockDocument = new MockTextDocument(uri, "test-content");
    });
    afterEach(() => {
        vi.clearAllMocks();
    });
    it("should include recent operations in the prompt when available", async () => {
        // Store initial document version
        await documentStore.storeDocument({ document: mockDocument, bypassDebounce: true });
        // Update document content and store again
        mockDocument.updateContent("test-content-updated");
        await documentStore.storeDocument({ document: mockDocument, bypassDebounce: true });
        // Create a suggestion context
        const suggestionContext = {
            document: mockDocument,
        };
        // Generate context with recent operations
        const enrichedContext = await context.generate(suggestionContext);
        // Verify that recent operations were added to the context
        expect(enrichedContext.recentOperations).toBeDefined();
        expect(enrichedContext.recentOperations?.length).toBeGreaterThan(0);
        // Generate prompt
        const prompt = strategy.getSuggestionPrompt(enrichedContext);
        // Verify that the prompt includes the recent operations section
        // The new strategy system uses "## Recent Typing" format
        expect(prompt).toContain("## Recent Typing");
    });
    it("should not include recent operations in the prompt when not available", async () => {
        // Create a suggestion context without storing document history
        const suggestionContext = {
            document: mockDocument,
        };
        // Generate context
        const enrichedContext = await context.generate(suggestionContext);
        // Generate prompt
        const prompt = strategy.getSuggestionPrompt(enrichedContext);
        // Verify that the prompt does not include recent operations section
        // The current document content will still be in the prompt, so we should only check
        // that the "**Recent Changes (Diff):**" section is not present
        expect(prompt.includes("**Recent Changes (Diff):**")).toBe(false);
    });
});
//# sourceMappingURL=GhostRecentOperations.spec.js.map