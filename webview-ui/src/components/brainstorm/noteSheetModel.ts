import { nanoid } from "nanoid"

export type NoteSheetBlockType =
    | "heading"
    | "text"
    | "checkbox"
    | "toggle"
    | "bullet"
    | "numbered"
    | "image"

export interface NoteSheetBlockImage {
    url: string
    caption?: string
}

export interface NoteSheetBlock {
    id: string
    type: NoteSheetBlockType
    text: string
    checked?: boolean
    collapsed?: boolean
    image?: NoteSheetBlockImage
    children: NoteSheetBlock[]
}

export interface NoteSheetBlockMeta {
    block: NoteSheetBlock
    path: number[]
    depth: number
}

const generateId = () => `note-block-${nanoid(6)}`

export const cloneBlock = (block: NoteSheetBlock): NoteSheetBlock => ({
    ...block,
    image: block.image ? { ...block.image } : undefined,
    children: block.children.map(cloneBlock),
})

export const createNoteSheetBlock = (
    type: NoteSheetBlockType,
    overrides: Partial<NoteSheetBlock> = {},
): NoteSheetBlock => {
    const base: NoteSheetBlock = {
        id: overrides.id ?? generateId(),
        type,
        text: "",
        children: [],
    }

    switch (type) {
        case "heading":
            base.text = overrides.text ?? ""
            break
        case "text":
            base.text = overrides.text ?? ""
            break
        case "checkbox": {
            base.text = overrides.text ?? ""
            base.checked = overrides.checked ?? false
            break
        }
        case "toggle": {
            base.text = overrides.text ?? ""
            base.collapsed = overrides.collapsed ?? false
            break
        }
        case "bullet": {
            base.text = overrides.text ?? ""
            break
        }
        case "numbered": {
            base.text = overrides.text ?? ""
            break
        }
        case "image": {
            base.image = overrides.image ?? { url: "", caption: "" }
            base.text = overrides.text ?? ""
            break
        }
        default:
            break
    }

    if (overrides.children) {
        base.children = overrides.children.map(cloneBlock)
    }

    return { ...base, ...overrides, id: base.id }
}

export const createInitialNoteSheetBlocks = (): NoteSheetBlock[] => [createNoteSheetBlock("text")]

const findBlockPath = (blocks: NoteSheetBlock[], blockId: string, path: number[] = []): number[] | undefined => {
    for (let index = 0; index < blocks.length; index += 1) {
        const block = blocks[index]
        const currentPath = [...path, index]
        if (block.id === blockId) {
            return currentPath
        }
        const childPath = findBlockPath(block.children, blockId, currentPath)
        if (childPath) {
            return childPath
        }
    }
    return undefined
}

const isSamePath = (a: number[], b: number[]) => a.length === b.length && a.every((value, index) => value === b[index])

const isDescendantPath = (maybeDescendant: number[], ancestor: number[]) =>
    maybeDescendant.length > ancestor.length && ancestor.every((value, index) => maybeDescendant[index] === value)

const getBlockAtPath = (blocks: NoteSheetBlock[], path: number[]): NoteSheetBlock | undefined => {
    let currentBlocks = blocks
    let currentBlock: NoteSheetBlock | undefined

    for (const index of path) {
        currentBlock = currentBlocks[index]
        if (!currentBlock) {
            return undefined
        }
        currentBlocks = currentBlock.children
    }

    return currentBlock
}

const updateBlockAtPath = (
    blocks: NoteSheetBlock[],
    path: number[],
    updater: (block: NoteSheetBlock) => NoteSheetBlock,
): NoteSheetBlock[] => {
    if (!path.length) {
        return blocks
    }

    const [index, ...rest] = path
    const current = blocks[index]
    if (!current) {
        return blocks
    }

    if (!rest.length) {
        const updated = updater(current)
        if (updated === current) {
            return blocks
        }
        const next = blocks.slice()
        next[index] = updated
        return next
    }

    const nextChildren = updateBlockAtPath(current.children, rest, updater)
    if (nextChildren === current.children) {
        return blocks
    }

    const next = blocks.slice()
    next[index] = { ...current, children: nextChildren }
    return next
}

export const updateBlock = (
    blocks: NoteSheetBlock[],
    blockId: string,
    updater: (block: NoteSheetBlock) => NoteSheetBlock,
): NoteSheetBlock[] => {
    const path = findBlockPath(blocks, blockId)
    if (!path) {
        return blocks
    }
    return updateBlockAtPath(blocks, path, updater)
}

interface RemoveBlockResult {
    blocks: NoteSheetBlock[]
    removed?: NoteSheetBlock
}

const removeBlockAtPath = (blocks: NoteSheetBlock[], path: number[]): RemoveBlockResult => {
    if (!path.length) {
        return { blocks }
    }

    const [index, ...rest] = path
    const current = blocks[index]
    if (!current) {
        return { blocks }
    }

    if (!rest.length) {
        const next = blocks.slice()
        const [removed] = next.splice(index, 1)
        return { blocks: next, removed }
    }

    const childResult = removeBlockAtPath(current.children, rest)
    if (childResult.blocks === current.children) {
        return { blocks }
    }

    const next = blocks.slice()
    next[index] = { ...current, children: childResult.blocks }
    return { blocks: next, removed: childResult.removed }
}

export const removeBlock = (blocks: NoteSheetBlock[], blockId: string): RemoveBlockResult => {
    const path = findBlockPath(blocks, blockId)
    if (!path) {
        return { blocks }
    }
    return removeBlockAtPath(blocks, path)
}

const insertBlockInto = (
    blocks: NoteSheetBlock[],
    parentPath: number[],
    index: number,
    block: NoteSheetBlock,
): NoteSheetBlock[] => {
    if (parentPath.length === 0) {
        const next = blocks.slice()
        const insertIndex = Math.min(Math.max(index, 0), next.length)
        next.splice(insertIndex, 0, block)
        return next
    }

    const [head, ...rest] = parentPath
    const current = blocks[head]
    if (!current) {
        return blocks
    }

    const nextChildren = insertBlockInto(current.children, rest, index, block)
    if (nextChildren === current.children) {
        return blocks
    }

    const next = blocks.slice()
    next[head] = { ...current, children: nextChildren }
    return next
}

export const insertBlockAfter = (
    blocks: NoteSheetBlock[],
    referenceId: string | null,
    block: NoteSheetBlock,
): NoteSheetBlock[] => {
    if (!referenceId) {
        return insertBlockInto(blocks, [], blocks.length, block)
    }

    const path = findBlockPath(blocks, referenceId)
    if (!path) {
        return insertBlockInto(blocks, [], blocks.length, block)
    }

    const parentPath = path.slice(0, -1)
    const index = path[path.length - 1]
    return insertBlockInto(blocks, parentPath, index + 1, block)
}

export const indentBlock = (blocks: NoteSheetBlock[], blockId: string): NoteSheetBlock[] => {
    const path = findBlockPath(blocks, blockId)
    if (!path || !path.length) {
        return blocks
    }

    const parentPath = path.slice(0, -1)
    const index = path[path.length - 1]
    if (index === 0) {
        return blocks
    }

    const previousSiblingPath = [...parentPath, index - 1]
    const removalResult = removeBlockAtPath(blocks, path)
    if (!removalResult.removed) {
        return blocks
    }

    let workingBlocks = removalResult.blocks
    const sibling = getBlockAtPath(workingBlocks, previousSiblingPath)
    if (!sibling) {
        return blocks
    }

    if (sibling.type === "toggle" && sibling.collapsed) {
        workingBlocks = updateBlockAtPath(workingBlocks, previousSiblingPath, (block) => ({
            ...block,
            collapsed: false,
        }))
    }

    const refreshedSibling = getBlockAtPath(workingBlocks, previousSiblingPath)
    const insertIndex = refreshedSibling ? refreshedSibling.children.length : 0
    const inserted = insertBlockInto(workingBlocks, previousSiblingPath, insertIndex, cloneBlock(removalResult.removed))
    return inserted
}

export const outdentBlock = (blocks: NoteSheetBlock[], blockId: string): NoteSheetBlock[] => {
    const path = findBlockPath(blocks, blockId)
    if (!path || !path.length) {
        return blocks
    }

    const parentPath = path.slice(0, -1)
    if (!parentPath.length) {
        return blocks
    }

    const removalResult = removeBlockAtPath(blocks, path)
    if (!removalResult.removed) {
        return blocks
    }

    const grandParentPath = parentPath.slice(0, -1)
    const parentIndex = parentPath[parentPath.length - 1]
    const insertIndex = parentIndex + 1
    const inserted = insertBlockInto(removalResult.blocks, grandParentPath, insertIndex, cloneBlock(removalResult.removed))
    return inserted
}

export const moveBlock = (
    blocks: NoteSheetBlock[],
    sourceId: string,
    targetId: string,
    position: "before" | "after" | "inside",
): NoteSheetBlock[] => {
    if (sourceId === targetId) {
        return blocks
    }

    const sourcePath = findBlockPath(blocks, sourceId)
    const targetPath = findBlockPath(blocks, targetId)
    if (!sourcePath || !targetPath) {
        return blocks
    }

    if (isDescendantPath(targetPath, sourcePath) || isSamePath(sourcePath, targetPath)) {
        return blocks
    }

    const removalResult = removeBlockAtPath(blocks, sourcePath)
    if (!removalResult.removed) {
        return blocks
    }

    let workingBlocks = removalResult.blocks
    const updatedTargetPath = findBlockPath(workingBlocks, targetId)
    if (!updatedTargetPath) {
        return blocks
    }

    if (position === "inside") {
        let targetBlock = getBlockAtPath(workingBlocks, updatedTargetPath)
        if (!targetBlock) {
            return blocks
        }

        if (targetBlock.type === "toggle" && targetBlock.collapsed) {
            workingBlocks = updateBlockAtPath(workingBlocks, updatedTargetPath, (block) => ({
                ...block,
                collapsed: false,
            }))
            targetBlock = getBlockAtPath(workingBlocks, updatedTargetPath)
        }

        const insertIndex = targetBlock ? targetBlock.children.length : 0
        return insertBlockInto(workingBlocks, updatedTargetPath, insertIndex, cloneBlock(removalResult.removed))
    }

    const parentPath = updatedTargetPath.slice(0, -1)
    const targetIndex = updatedTargetPath[updatedTargetPath.length - 1]
    const insertIndex = position === "before" ? targetIndex : targetIndex + 1
    return insertBlockInto(workingBlocks, parentPath, insertIndex, cloneBlock(removalResult.removed))
}

export const toggleBlockCollapsed = (blocks: NoteSheetBlock[], blockId: string): NoteSheetBlock[] =>
    updateBlock(blocks, blockId, (block) => {
        if (block.type !== "toggle") {
            return block
        }
        return { ...block, collapsed: !block.collapsed }
    })

export const setBlockText = (blocks: NoteSheetBlock[], blockId: string, text: string): NoteSheetBlock[] =>
    updateBlock(blocks, blockId, (block) => ({
        ...block,
        text,
    }))

export const setBlockChecked = (blocks: NoteSheetBlock[], blockId: string, checked: boolean): NoteSheetBlock[] =>
    updateBlock(blocks, blockId, (block) => ({
        ...block,
        checked,
    }))

export const setBlockImage = (
    blocks: NoteSheetBlock[],
    blockId: string,
    image: NoteSheetBlockImage | undefined,
): NoteSheetBlock[] =>
    updateBlock(blocks, blockId, (block) => {
        if (block.type !== "image") {
            return block
        }
        return { ...block, image }
    })

export const setBlockType = (
    blocks: NoteSheetBlock[],
    blockId: string,
    type: NoteSheetBlockType,
): NoteSheetBlock[] =>
    updateBlock(blocks, blockId, (block) => {
        if (block.type === type) {
            return block
        }

        const next: NoteSheetBlock = { ...block, type }
        if (type === "checkbox") {
            next.checked = block.checked ?? false
        } else {
            delete next.checked
        }

        if (type === "toggle") {
            next.collapsed = block.collapsed ?? false
        } else {
            delete next.collapsed
        }

        if (type === "image") {
            next.image = block.image ?? { url: "", caption: "" }
            next.text = ""
        } else if (block.type === "image") {
            delete next.image
        }

        return next
    })

export const flattenBlocks = (blocks: NoteSheetBlock[]): NoteSheetBlockMeta[] => {
    const result: NoteSheetBlockMeta[] = []

    const visit = (nodes: NoteSheetBlock[], path: number[], depth: number) => {
        nodes.forEach((node, index) => {
            const currentPath = [...path, index]
            result.push({ block: node, path: currentPath, depth })
            if (node.children.length) {
                visit(node.children, currentPath, depth + 1)
            }
        })
    }

    visit(blocks, [], 0)
    return result
}

export const findNeighborBlockId = (
    blocks: NoteSheetBlock[],
    blockId: string,
    offset: number,
): string | undefined => {
    if (!offset) {
        return blockId
    }

    const flat = flattenBlocks(blocks)
    const index = flat.findIndex((entry) => entry.block.id === blockId)
    if (index === -1) {
        return undefined
    }

    const next = flat[index + offset]
    return next?.block.id
}

export const ensureAtLeastOneBlock = (blocks: NoteSheetBlock[]): NoteSheetBlock[] => {
    if (blocks.length) {
        return blocks
    }
    return [createNoteSheetBlock("text")]
}
