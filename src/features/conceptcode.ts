import type { KeyEvent } from "@opentui/core"

import { applySelectionChange, currentNode, currentPath, moveCursor, pageSize, scrollMain, visiblePaths } from "../core/state"
import type { AppState } from "../core/types"
import { isDraftConcept, openCreateConceptModal, promptToRemoveDraft } from "../concepts/drafts"
import { buildClipboardPayload } from "../prompt/payload"
import { openSummaryEditor } from "../prompt/editor"
import type { FeatureBrowserCommandDeps } from "./types"

export async function handleConceptCodeBrowserKey(state: AppState, key: KeyEvent, deps: FeatureBrowserCommandDeps): Promise<boolean> {
  if (key.name === "tab") {
    key.preventDefault()
    key.stopPropagation()
    deps.cycleConceptNamespaceMode(state)
    deps.draw()
    return true
  }
  if (key.name === "s") {
    deps.openInspector("snippet")
    deps.draw()
    return true
  }
  if (key.name === "t") {
    deps.openInspector("subtree")
    deps.draw()
    return true
  }
  if (key.name === "m") {
    deps.openInspector("metadata")
    deps.draw()
    return true
  }
  if (key.ctrl && key.name === "m") {
    await deps.openScopedContextModal()
    deps.draw()
    return true
  }
  if (key.name === "j" || key.name === "down") {
    if (moveCursor(state, 1)) deps.draw()
    return true
  }
  if (key.name === "k" || key.name === "up") {
    if (moveCursor(state, -1)) deps.draw()
    return true
  }
  if (key.name === "pagedown") {
    if (key.ctrl) {
      scrollMain(state, Math.max(1, state.mainViewportHeight - 2))
      deps.draw()
    } else if (moveCursor(state, pageSize(state.layoutMode))) {
      deps.draw()
    }
    return true
  }
  if (key.name === "pageup") {
    if (key.ctrl) {
      scrollMain(state, -Math.max(1, state.mainViewportHeight - 2))
      deps.draw()
    } else if (moveCursor(state, -pageSize(state.layoutMode))) {
      deps.draw()
    }
    return true
  }
  if (key.name === "home" || key.name === "g") {
    if (state.cursor !== 0) {
      state.cursor = 0
      applySelectionChange(state)
      deps.draw()
    }
    return true
  }
  if (key.name === "end" || (key.shift && key.name === "g")) {
    const nextCursor = Math.max(0, visiblePaths(state).length - 1)
    if (state.cursor !== nextCursor) {
      state.cursor = nextCursor
      applySelectionChange(state)
      deps.draw()
    }
    return true
  }
  if (key.name === "l" || key.name === "right") {
    const node = currentNode(state)
    if (node.childPaths.length > 0) {
      state.currentParentPath = node.path
      state.cursor = 0
      applySelectionChange(state)
      deps.draw()
    }
    return true
  }
  if (key.name === "h" || key.name === "left") {
    const oldParent = state.currentParentPath
    const currentParent = state.nodes.get(oldParent)
    if (currentParent?.parentPath !== null && currentParent?.parentPath !== undefined) {
      state.currentParentPath = currentParent.parentPath
      state.cursor = Math.max(0, visiblePaths(state).indexOf(oldParent))
      applySelectionChange(state)
      deps.draw()
    }
    return true
  }
  if (key.name === "space") {
    const path = currentPath(state)
    if (isDraftConcept(state, path)) {
      promptToRemoveDraft(state, path)
      deps.draw()
    }
    return true
  }
  if (key.name === "n") {
    openCreateConceptModal(state)
    deps.draw()
    return true
  }
  if (key.name === "y") {
    await deps.copyWithStatus(await buildClipboardPayload(state, currentPath(state)))
    return true
  }
  if (key.name === "return") {
    openSummaryEditor(state, deps.renderer(), deps.buildPromptEditorDeps())
    deps.draw()
    return true
  }
  if (key.name === "p") {
    await deps.copyWithStatus(currentPath(state))
    return true
  }
  return false
}
