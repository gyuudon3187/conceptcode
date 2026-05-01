import type { CliRenderer, KeyEvent } from "@opentui/core"

import { applySelectionChange, currentNode, currentPath, cycleConceptNamespaceMode, moveCursor, pageSize, scrollMain, visiblePaths } from "../core/state"
import type { AppState, InspectorKind } from "../core/types"
import { isDraftConcept, openCreateConceptModal, promptToRemoveDraft } from "../concepts/drafts"
import { buildClipboardPayload } from "../prompt/payload"
import { openSummaryEditor, syncPromptDraft } from "../prompt/editor"
import { flushActiveSession, openSessionModal } from "../sessions/commands"

type PromptEditorDeps = {
  redraw: () => void
  refreshPromptTokenBreakdown: () => void
  refreshPromptScroll: () => void
  schedulePromptScrollSync: (reason: string) => void
  refreshPromptPaneTarget: () => void
}

export type AppCommandDeps = {
  state: AppState
  renderer: () => CliRenderer
  draw: () => void
  clearCtrlCExitState: () => void
  copyWithStatus: (payload: string) => Promise<void>
  openInspector: (kind: InspectorKind) => void
  openScopedContextModal: () => Promise<void>
  buildPromptEditorDeps: () => PromptEditorDeps
}

export async function handleCtrlCKey(key: KeyEvent, deps: Pick<AppCommandDeps, "state" | "renderer" | "draw" | "clearCtrlCExitState">): Promise<boolean> {
  const { state } = deps
  key.preventDefault()
  key.stopPropagation()
  if (state.editorModal && state.editorModal.renderable.plainText.length > 0) {
    state.editorModal.renderable.setText("")
    state.editorModal.renderable.focus()
    deps.clearCtrlCExitState()
    deps.draw()
    return true
  }
  if (state.pendingCtrlCExit) {
    await flushActiveSession(state, syncPromptDraft)
    deps.renderer().destroy()
    process.exit(0)
  }
  state.confirmModal = {
    kind: "remove-draft",
    title: "Quit",
    message: ["Press Ctrl+C again to quit, or Esc to stay"],
    confirmLabel: "dismisses this message",
    path: currentPath(state),
  }
  state.pendingCtrlCExit = true
  deps.draw()
  return true
}

export async function handleBrowserKey(state: AppState, key: KeyEvent, deps: AppCommandDeps): Promise<boolean> {
  if (key.name === "tab") {
    key.preventDefault()
    key.stopPropagation()
    cycleConceptNamespaceMode(state)
    deps.draw()
    return true
  }
  if (key.ctrl && key.name === "s") {
    openSessionModal(state)
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
  if (key.name === "q") {
    await flushActiveSession(state, syncPromptDraft)
    deps.renderer().destroy()
    process.exit(0)
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
  if (key.name === "?" || (key.shift && key.name === "/")) {
    state.confirmModal = {
      kind: "remove-draft",
      title: "Help",
      message: ["Browse: j/k move  h/l back/open  i prompt  Enter summary  Ctrl+S sessions  s/t/m inspect  Ctrl+M scoped context  y copy  p path  q quit"],
      confirmLabel: "dismisses help",
      path: currentPath(state),
    }
    deps.draw()
    return true
  }
  return false
}
