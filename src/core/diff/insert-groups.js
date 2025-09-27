export function insertGroups(original, insertGroups) {
    // Handle groups with index -1 separately and sort remaining groups by index
    const appendGroups = insertGroups.filter((group) => group.index === -1);
    const normalGroups = insertGroups.filter((group) => group.index !== -1).sort((a, b) => a.index - b.index);
    let result = [];
    let lastIndex = 0;
    normalGroups.forEach(({ index, elements }) => {
        // Add elements from original array up to insertion point
        result.push(...original.slice(lastIndex, index));
        // Add the group of elements
        result.push(...elements);
        lastIndex = index;
    });
    // Add remaining elements from original array
    result.push(...original.slice(lastIndex));
    // Append elements from groups with index -1 at the end
    appendGroups.forEach(({ elements }) => {
        result.push(...elements);
    });
    return result;
}
//# sourceMappingURL=insert-groups.js.map