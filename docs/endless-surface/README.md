# Endless Surface

## MVP Overview

- React Flow based infinite canvas with custom nodes (rich text, file previews, agent tool, mind map).
- Brainstorm Hub surface list with search, access toggles, and inline creation.
- Inline editing for board title and node content without modals.
- Canvas controls for grid styles, pan/zoom, auto-snap, and auto-layout placeholder.
- Debounced autosave with saved/saving affordance and undo-ready infrastructure.
- Surface state persisted through `EndlessSurfaceService` with JSON + snapshot artifacts.
- Programmatic snapshot pipeline with offscreen renderer and `/surfaceRequestSnapshot` bridge.
- API methods for agents: `listSurfaces`, `createSurface`, `openSurface`, `getSurfaceData`, `snapshotSurface`, `mutateSurface`.

## API Notes

| Method                     | Description                                            |
| -------------------------- | ------------------------------------------------------ |
| `listSurfaces()`           | Returns summaries and active surface id.               |
| `createSurface(name?)`     | Creates a new surface with optional title.             |
| `openSurface(id)`          | Focuses Brainstorm Hub on the requested board.         |
| `getSurfaceData(id)`       | Fetches full record including nodes, edges, settings.  |
| `snapshotSurface(id)`      | Generates PNG snapshot offscreen and returns metadata. |
| `mutateSurface(id, ops[])` | Applies JSON-style mutations to nodes/edges/settings.  |

## Keyboard Shortcuts

- `Cmd/Ctrl+Z` / `Shift+Cmd/Ctrl+Z`: undo / redo.
- `Cmd/Ctrl+C`, `Cmd/Ctrl+V`, `Cmd/Ctrl+D`: copy, paste, duplicate nodes.
- `Delete/Backspace`: delete selection.
- `Hold Space + Drag`: pan canvas.
- `Cmd/Ctrl+Plus/Minus`: zoom controls.
- `Enter`: add sibling (mind map).
- `Tab`: add child (mind map).
- `Esc`: deselect / close node library.

## Guardrails

- Naming guard prevents committing `whiteboard`, `white surface`, or `white-board` variants.
- Brainstorm Hub button is always labeled “Endless Surface” or “Brainstorm Hub”—no whiteboard terminology in UI or code.
- Snapshot renderer is offscreen to avoid flashing UI artifacts.

## Post-MVP Notes

- Frames & nested sub-boards with live thumbnails and inline editing.
- Optional realism/nostalgia themes (textures, stylized borders, motion).
- Advanced auto-layout strategies, grouping, and template library.
- Version history & branching, multi-user collaboration cursors.
- Agent-run utilities (tool execution from canvas) with status streaming.
