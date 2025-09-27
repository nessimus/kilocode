import { mockVscode } from "./MockWorkspace.spec";
export function createMockWorkspaceEdit() {
    const _edits = new Map();
    const createTextEdit = (range, newText) => ({ range, newText });
    return {
        insert(uri, position, newText) {
            const key = uri.toString();
            if (!_edits.has(key)) {
                _edits.set(key, []);
            }
            const range = new mockVscode.Range(position, position);
            _edits.get(key).push(createTextEdit(range, newText));
        },
        delete(uri, range) {
            const key = uri.toString();
            if (!_edits.has(key)) {
                _edits.set(key, []);
            }
            _edits.get(key).push(createTextEdit(range, ""));
        },
        replace(uri, range, newText) {
            const key = uri.toString();
            if (!_edits.has(key)) {
                _edits.set(key, []);
            }
            _edits.get(key).push(createTextEdit(range, newText));
        },
        get(uri) {
            return _edits.get(uri.toString()) || [];
        },
        entries() {
            return Array.from(_edits.entries()).map(([uriString, edits]) => [mockVscode.Uri.parse(uriString), edits]);
        },
    };
}
//# sourceMappingURL=MockWorkspaceEdit.js.map