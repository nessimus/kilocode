class GhostSuggestionFile {
    uri;
    fileUri;
    selectedGroup = null;
    groups = [];
    constructor(uri) {
        this.uri = uri;
        this.fileUri = uri;
    }
    addOperation(operation) {
        // Priority 1: Try to create or join a modification group (delete on line N, add on line N+1)
        const modificationGroupIndex = this.findOrCreateModificationGroup(operation);
        if (modificationGroupIndex !== -1) {
            return;
        }
        // Priority 2: Try to join an existing group of same type on subsequent lines
        const sameTypeGroupIndex = this.findSameTypeGroup(operation);
        if (sameTypeGroupIndex !== -1) {
            this.groups[sameTypeGroupIndex].push(operation);
            return;
        }
        // Priority 3: Create a new group
        this.groups.push([operation]);
    }
    findOrCreateModificationGroup(operation) {
        // Look for existing operations that can form a modification group
        // Modification group: delete on line N, add on line N+1
        for (let i = 0; i < this.groups.length; i++) {
            const group = this.groups[i];
            for (const existingOp of group) {
                // Check if we can form a modification group
                const canFormModificationGroup = (operation.type === "+" && existingOp.type === "-" && existingOp.newLine === operation.newLine) ||
                    (operation.type === "-" && existingOp.type === "+" && operation.newLine === existingOp.newLine);
                if (canFormModificationGroup) {
                    // Remove the existing operation from its current group
                    this.removeOperationFromGroup(i, existingOp);
                    // Create new modification group with delete first, then add
                    const deleteOp = operation.type === "-" ? operation : existingOp;
                    const addOp = operation.type === "+" ? operation : existingOp;
                    this.groups.push([deleteOp, addOp]);
                    return this.groups.length - 1;
                }
            }
        }
        return -1;
    }
    findSameTypeGroup(operation) {
        for (let i = 0; i < this.groups.length; i++) {
            const group = this.groups[i];
            // Skip modification groups (groups with both + and -)
            const hasDelete = group.some((op) => op.type === "-");
            const hasAdd = group.some((op) => op.type === "+");
            if (hasDelete && hasAdd) {
                continue;
            }
            // Check if group has same type operations
            if (group.length > 0 && group[0].type === operation.type) {
                // Check if the operation is on a subsequent line
                const maxLine = Math.max(...group.map((op) => op.line));
                const minLine = Math.min(...group.map((op) => op.line));
                if (operation.line === maxLine + 1 || operation.line === minLine - 1) {
                    return i;
                }
            }
        }
        return -1;
    }
    removeOperationFromGroup(groupIndex, operation) {
        const group = this.groups[groupIndex];
        const opIndex = group.findIndex((op) => op.line === operation.line && op.type === operation.type && op.content === operation.content);
        if (opIndex !== -1) {
            group.splice(opIndex, 1);
            // Remove empty groups
            if (group.length === 0) {
                this.groups.splice(groupIndex, 1);
            }
        }
    }
    isEmpty() {
        return this.groups.length === 0;
    }
    getSelectedGroup() {
        return this.selectedGroup;
    }
    getGroupType = (group) => {
        const types = group.flatMap((x) => x.type);
        if (types.length == 2) {
            return "/";
        }
        return types[0];
    };
    getSelectedGroupPreviousOperations() {
        if (this.selectedGroup === null || this.selectedGroup <= 0) {
            return [];
        }
        const previousGroups = this.groups.slice(0, this.selectedGroup);
        return previousGroups.flat();
    }
    getSelectedGroupOperations() {
        if (this.selectedGroup === null || this.selectedGroup >= this.groups.length) {
            return [];
        }
        return this.groups[this.selectedGroup];
    }
    getPlaceholderOffsetSelectedGroupOperations() {
        const operations = this.getSelectedGroupPreviousOperations();
        const { added, removed } = operations.reduce((acc, op) => {
            if (op.type === "+") {
                return { added: acc.added + 1, removed: acc.removed };
            }
            else if (op.type === "-") {
                return { added: acc.added, removed: acc.removed + 1 };
            }
            return acc;
        }, { added: 0, removed: 0 });
        return { added, removed, offset: added - removed };
    }
    getGroupsOperations() {
        return this.groups;
    }
    getAllOperations() {
        return this.groups.flat().sort((a, b) => a.line - b.line);
    }
    sortGroups() {
        this.groups
            .sort((a, b) => {
            const aLine = a[0].line;
            const bLine = b[0].line;
            return aLine - bLine;
        })
            .forEach((group) => {
            group.sort((a, b) => a.line - b.line);
        });
        this.selectedGroup = this.groups.length > 0 ? 0 : null;
    }
    computeOperationsOffset(group) {
        const { added, removed } = group.reduce((acc, op) => {
            if (op.type === "+") {
                return { added: acc.added + 1, removed: acc.removed };
            }
            else if (op.type === "-") {
                return { added: acc.added, removed: acc.removed + 1 };
            }
            return acc;
        }, { added: 0, removed: 0 });
        return { added, removed, offset: added - removed };
    }
    deleteSelectedGroup() {
        if (this.selectedGroup !== null && this.selectedGroup < this.groups.length) {
            const deletedGroup = this.groups.splice(this.selectedGroup, 1);
            const { offset } = this.computeOperationsOffset(deletedGroup[0]);
            // update deleted operations in the next groups
            for (let i = this.selectedGroup; i < this.groups.length; i++) {
                for (let j = 0; j < this.groups[i].length; j++) {
                    const op = this.groups[i][j];
                    if (op.type === "-") {
                        op.line = op.line + offset;
                    }
                    op.oldLine = op.oldLine + offset;
                }
            }
            // reset selected group
            this.selectedGroup = null;
        }
    }
    selectNextGroup() {
        if (this.selectedGroup === null) {
            this.selectedGroup = 0;
        }
        else {
            this.selectedGroup = (this.selectedGroup + 1) % this.groups.length;
        }
    }
    selectPreviousGroup() {
        if (this.selectedGroup === null) {
            this.selectedGroup = this.groups.length - 1;
        }
        else {
            this.selectedGroup = (this.selectedGroup - 1 + this.groups.length) % this.groups.length;
        }
    }
    selectClosestGroup(selection) {
        if (this.groups.length === 0) {
            this.selectedGroup = null;
            return;
        }
        console.log("GROUPS", this.groups);
        let bestGroup = null;
        const selectionStartLine = selection.start.line;
        const selectionEndLine = selection.end.line;
        // Find the group with minimum distance to the selection
        for (let groupIndex = 0; groupIndex < this.groups.length; groupIndex++) {
            const group = this.groups[groupIndex];
            const groupLine = Math.min(...group.map((x) => x.oldLine));
            // Calculate minimum distance from selection to any operation in this group
            let distance = Infinity;
            if (groupLine < selectionStartLine) {
                distance = selectionStartLine - groupLine;
            }
            else if (groupLine > selectionEndLine) {
                distance = groupLine - selectionEndLine;
            }
            else {
                distance = 0;
            }
            // Check if this group is better than current best
            if (bestGroup === null || distance < bestGroup.distance) {
                bestGroup = { groupIndex, distance };
            }
            if (distance === 0) {
                break;
            }
        }
        // Set the closest group as selected
        if (bestGroup !== null) {
            this.selectedGroup = bestGroup.groupIndex;
            console.log("BEST GROUP", this.groups[bestGroup.groupIndex]);
        }
    }
}
export class GhostSuggestionsState {
    files = new Map();
    constructor() { }
    addFile(fileUri) {
        const key = fileUri.toString();
        if (!this.files.has(key)) {
            this.files.set(key, new GhostSuggestionFile(fileUri));
        }
        return this.files.get(key);
    }
    getFile(fileUri) {
        return this.files.get(fileUri.toString());
    }
    clear() {
        this.files.clear();
    }
    hasSuggestions() {
        return this.files.size > 0;
    }
    validateFiles() {
        for (const file of this.files.values()) {
            if (file.isEmpty()) {
                this.files.delete(file.fileUri.toString());
            }
        }
    }
    sortGroups() {
        this.validateFiles();
        for (const file of this.files.values()) {
            file.sortGroups();
        }
    }
}
//# sourceMappingURL=GhostSuggestions.js.map