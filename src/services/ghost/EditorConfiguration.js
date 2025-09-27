import * as vscode from "vscode";
/**
 * Get all editor configuration values in one call
 */
export function getEditorConfiguration() {
    const config = vscode.workspace.getConfiguration("editor");
    const fontSize = config.get("fontSize") || 14;
    const fontFamily = config.get("fontFamily") || "Consolas, 'Courier New', monospace";
    const rawLineHeight = config.get("lineHeight") || 1.5;
    // VS Code lineHeight can be either:
    // - A multiplier (like 1.2) if < 8
    // - An absolute pixel value (like 18) if >= 8
    const lineHeight = rawLineHeight < 8 ? rawLineHeight : rawLineHeight / fontSize;
    return { fontSize, fontFamily, lineHeight };
}
//# sourceMappingURL=EditorConfiguration.js.map