import { createContext, useContext } from "react"

import type { NoteSheetBlock } from "./noteSheetModel"

type NoteSheetHandlers = {
    updateBlocks: (nodeId: string, updater: (blocks: NoteSheetBlock[]) => NoteSheetBlock[]) => void
    focusBlock: (nodeId: string, blockId: string | undefined) => void
}

const NoteSheetHandlersContext = createContext<NoteSheetHandlers | null>(null)

export const NoteSheetHandlersProvider = NoteSheetHandlersContext.Provider

export const useNoteSheetHandlers = (): NoteSheetHandlers => {
    const context = useContext(NoteSheetHandlersContext)
    if (!context) {
        throw new Error("useNoteSheetHandlers must be used within a NoteSheetHandlersProvider")
    }
    return context
}
