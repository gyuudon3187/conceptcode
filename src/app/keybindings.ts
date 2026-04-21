import { createCliRenderer, type CliRenderer, type KeyEvent } from "@opentui/core"

import { applySelectionChange, currentNode, currentPath, cycleConceptNamespaceMode, moveCursor, pageSize, scrollMain, visiblePaths } from "../core/state"
import type { AppState, InspectorKind } from "../core/types"
import { handleCreateConceptModalKey, isDraftConcept, openCreateConceptModal, promptToRemoveDraft, removeDraftConcept } from "../concepts/drafts"
import { buildClipboardPayload, clipboardSelection } from "../prompt/payload"
import { acceptPromptSuggestion, applyEditorText, cyclePromptMode, handlePromptAliasBoundaryKey, movePromptSuggestionSelection, openSummaryEditor, refreshPromptSuggestion, refreshPromptSuggestionSoon, refreshEditorModalHeight, syncPromptDraft } from "../prompt/editor"
import { closeSessionModal, createAndSwitchSession, flushActiveSession, openSessionModal, sessionModalEntries, switchToSession } from "../sessions/commands"

type PromptEditorDeps = {
  redraw: () => void
  refreshPromptTokenBreakdown: () => void
  refreshPromptScroll: () => void
  schedulePromptScrollSync: (reason: string) => void
  refreshPromptPaneTarget: () => void
}

type KeybindingDeps = {
  state: AppState
  renderer: () => CliRenderer
  draw: () => void
  openExternalEditor: (initialText: string) => Promise<string>
  clearCtrlCExitState: () => void
  copyWithStatus: (payload: string) => Promise<void>
  updateCreateDraftText: (key: KeyEvent) => boolean
  closeConfirmModal: () => void
  openInspector: (kind: InspectorKind) => void
  closeInspector: () => void
  refreshPromptScroll: () => void
  refreshPromptTokenBreakdown: () => void
  submitPromptMessage: () => void
  openPromptEditor: (nextState: AppState, nextRenderer: CliRenderer, nextRedraw: () => void) => void
  buildPromptEditorDeps: () => PromptEditorDeps
  workspace: {
    refreshPromptPaneTarget: () => void
    togglePaneFocus: () => void
  }
  remountRenderer: () => Promise<void>
}

export function handleConfirmModalKey(state: AppState, key: KeyEvent, deps: Pick<KeybindingDeps, "draw" | "closeConfirmModal">): boolean {
  const modal = state.confirmModal
  if (!modal) return false
  if (key.name === "escape" || (key.ctrl && key.name === "q")) {
    deps.closeConfirmModal()
    deps.draw()
    return true
  }
  if (key.name === "return") {
    removeDraftConcept(state, modal.path)
    deps.closeConfirmModal()
    deps.draw()
    return true
  }
  return true
}

export async function handleSessionModalKey(state: AppState, key: KeyEvent, deps: Pick<KeybindingDeps, "draw" | "renderer" | "openPromptEditor">): Promise<boolean> {
  const modal = state.sessionModal
  if (!modal) return false
  const entries = sessionModalEntries(state)
  if (key.name === "escape" || (key.ctrl && key.name === "q")) {
    key.preventDefault()
    key.stopPropagation()
    closeSessionModal(state)
    deps.draw()
    return true
  }
  if (key.name === "j" || key.name === "down") {
    key.preventDefault()
    key.stopPropagation()
    modal.selectedIndex = Math.min(entries.length - 1, modal.selectedIndex + 1)
    deps.draw()
    return true
  }
  if (key.name === "k" || key.name === "up") {
    key.preventDefault()
    key.stopPropagation()
    modal.selectedIndex = Math.max(0, modal.selectedIndex - 1)
    deps.draw()
    return true
  }
  if (key.name === "n") {
    key.preventDefault()
    key.stopPropagation()
    await createAndSwitchSession(state, deps.renderer(), deps.draw, { syncPromptDraft, openPromptEditor: deps.openPromptEditor })
    deps.draw()
    return true
  }
  if (key.name === "return") {
    key.preventDefault()
    key.stopPropagation()
    const selected = entries[modal.selectedIndex]
    if (selected) {
      await switchToSession(state, selected.id, deps.renderer(), deps.draw, { syncPromptDraft, openPromptEditor: deps.openPromptEditor })
      deps.draw()
    }
    return true
  }
  return true
}

export function bindKeyHandler(deps: KeybindingDeps): void {
  deps.renderer().keyInput.on("keypress", async (key: KeyEvent) => {
    const { state } = deps
    const renderer = deps.renderer()

    if (key.ctrl && key.name === "c") {
      key.preventDefault()
      key.stopPropagation()
      if (state.editorModal && state.editorModal.renderable.plainText.length > 0) {
        state.editorModal.renderable.setText("")
        state.editorModal.renderable.focus()
        applyEditorText(state, state.editorModal)
        refreshPromptSuggestion(state)
        refreshEditorModalHeight(state)
        deps.clearCtrlCExitState()
        deps.draw()
        return
      }
      if (state.pendingCtrlCExit) {
        await flushActiveSession(state, syncPromptDraft)
        renderer.destroy()
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
      return
    }

    if (state.pendingCtrlCExit) {
      state.pendingCtrlCExit = false
    }
    const visible = visiblePaths(state)

    if (state.confirmModal) {
      handleConfirmModalKey(state, key, deps)
      return
    }
    if (state.sessionModal) {
      key.preventDefault()
      key.stopPropagation()
      await handleSessionModalKey(state, key, deps)
      return
    }
    if (state.inspector) {
      if (key.name === "escape" || key.name === "q") {
        deps.closeInspector()
        deps.draw()
        return
      }
      if (key.name === "pageup") {
        scrollMain(state, -Math.max(1, state.mainViewportHeight - 2))
        deps.draw()
        return
      }
      if (key.name === "pagedown") {
        scrollMain(state, Math.max(1, state.mainViewportHeight - 2))
        deps.draw()
        return
      }
      return
    }
    if (state.createConceptModal) {
      handleCreateConceptModalKey(state, key, { draw: deps.draw, updateCreateDraftText: deps.updateCreateDraftText })
      return
    }
    if (state.editorModal) {
      if (key.ctrl && key.name === "s") {
        key.preventDefault()
        key.stopPropagation()
        openSessionModal(state)
        deps.draw()
        return
      }
      if (state.editorModal.target.kind === "prompt" && key.name === "pagedown") {
        state.promptScrollTop += Math.max(1, state.promptViewportHeight - 2)
        deps.refreshPromptScroll()
        deps.draw()
        return
      }
      if (state.editorModal.target.kind === "prompt" && key.name === "pageup") {
        state.promptScrollTop = Math.max(0, state.promptScrollTop - Math.max(1, state.promptViewportHeight - 2))
        deps.refreshPromptScroll()
        deps.draw()
        return
      }
      if (state.editorModal.target.kind === "prompt" && key.name === "tab" && !key.shift) {
        cyclePromptMode(state, deps.draw, deps.refreshPromptTokenBreakdown)
        return
      }
      if (key.shift && key.name === "tab") {
        key.preventDefault()
        key.stopPropagation()
        deps.workspace.togglePaneFocus()
        return
      }
      if (state.editorModal.target.kind === "prompt" && key.name === "return" && !key.shift && !key.ctrl && !state.editorModal.promptSuggestion) {
        key.preventDefault()
        key.stopPropagation()
        deps.submitPromptMessage()
        deps.draw()
        return
      }
      if (handlePromptAliasBoundaryKey(state, key, deps.draw)) {
        return
      }
      if (key.name === "escape") {
        key.preventDefault()
        key.stopPropagation()
        applyEditorText(state, state.editorModal)
        state.editorModal.renderable.blur()
        if (state.editorModal.target.kind === "prompt") {
          state.editorModal = null
          deps.workspace.togglePaneFocus()
          return
        }
        state.editorModal = null
        deps.workspace.refreshPromptPaneTarget()
        deps.draw()
        return
      }
      if (key.ctrl && key.name === "g") {
        try {
          renderer.suspend()
          const nextText = await deps.openExternalEditor(state.editorModal.renderable.plainText)
          renderer.resume()
          state.editorModal.renderable.setText(nextText)
          state.editorModal.renderable.gotoBufferEnd()
          state.editorModal.renderable.focus()
          refreshPromptSuggestion(state)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          try {
            renderer.resume()
          } catch {
            await deps.remountRenderer()
          }
          state.confirmModal = {
            kind: "remove-draft",
            title: "Editor Error",
            message: [message],
            confirmLabel: "dismisses this message",
            path: currentPath(state),
          }
        }
        deps.draw()
        return
      }
      if (state.editorModal.promptSuggestion && (key.name === "down" || (key.ctrl && key.name === "n"))) {
        movePromptSuggestionSelection(state, 1)
        deps.draw()
        return
      }
      if (state.editorModal.promptSuggestion && (key.name === "up" || (key.ctrl && key.name === "p"))) {
        movePromptSuggestionSelection(state, -1)
        deps.draw()
        return
      }
      if (state.editorModal.promptSuggestion && key.name === "return") {
        key.preventDefault()
        key.stopPropagation()
        if (acceptPromptSuggestion(state)) {
          deps.draw()
        }
        return
      }
      applyEditorText(state, state.editorModal)
      refreshPromptSuggestionSoon(state, deps.draw)
      deps.draw()
      return
    }

    if (key.shift && key.name === "tab") {
      key.preventDefault()
      key.stopPropagation()
      deps.workspace.togglePaneFocus()
      return
    }
    if (key.name === "tab") {
      key.preventDefault()
      key.stopPropagation()
      cycleConceptNamespaceMode(state)
      deps.draw()
      return
    }
    if (key.ctrl && key.name === "s") {
      openSessionModal(state)
      deps.draw()
      return
    }
    if (key.name === "s") {
      deps.openInspector("snippet")
      deps.draw()
      return
    }
    if (key.name === "t") {
      deps.openInspector("subtree")
      deps.draw()
      return
    }
    if (key.name === "m") {
      deps.openInspector("metadata")
      deps.draw()
      return
    }
    if (key.name === "q") {
      await flushActiveSession(state, syncPromptDraft)
      renderer.destroy()
      process.exit(0)
    }
    if (key.name === "j" || key.name === "down") {
      if (moveCursor(state, 1)) deps.draw()
      return
    }
    if (key.name === "k" || key.name === "up") {
      if (moveCursor(state, -1)) deps.draw()
      return
    }
    if (key.name === "pagedown") {
      if (key.ctrl) {
        scrollMain(state, Math.max(1, state.mainViewportHeight - 2))
        deps.draw()
      } else if (moveCursor(state, pageSize(state.layoutMode))) {
        deps.draw()
      }
      return
    }
    if (key.name === "pageup") {
      if (key.ctrl) {
        scrollMain(state, -Math.max(1, state.mainViewportHeight - 2))
        deps.draw()
      } else if (moveCursor(state, -pageSize(state.layoutMode))) {
        deps.draw()
      }
      return
    }
    if (key.name === "home" || key.name === "g") {
      if (state.cursor !== 0) {
        state.cursor = 0
        applySelectionChange(state)
        deps.draw()
      }
      return
    }
    if (key.name === "end" || (key.shift && key.name === "g")) {
      const nextCursor = Math.max(0, visible.length - 1)
      if (state.cursor !== nextCursor) {
        state.cursor = nextCursor
        applySelectionChange(state)
        deps.draw()
      }
      return
    }
    if (key.name === "l" || key.name === "right") {
      const node = currentNode(state)
      if (node.childPaths.length > 0) {
        state.currentParentPath = node.path
        state.cursor = 0
        applySelectionChange(state)
        deps.draw()
      }
      return
    }
    if (key.name === "h" || key.name === "left") {
      const currentParent = state.nodes.get(state.currentParentPath)!
      if (currentParent.parentPath !== null) {
        const oldParent = state.currentParentPath
        state.currentParentPath = currentParent.parentPath
        state.cursor = Math.max(0, visiblePaths(state).indexOf(oldParent))
        applySelectionChange(state)
        deps.draw()
      }
      return
    }
    if (key.name === "space") {
      if (isDraftConcept(state, currentPath(state))) {
        promptToRemoveDraft(state, currentPath(state))
        deps.draw()
      }
      return
    }
    if (key.name === "n") {
      openCreateConceptModal(state)
      deps.draw()
      return
    }
    if (key.name === "y") {
      const selection = clipboardSelection(state, currentPath(state))
      await deps.copyWithStatus(await buildClipboardPayload(state, currentPath(state)))
      return
    }
    if (key.name === "return") {
      openSummaryEditor(state, renderer, deps.buildPromptEditorDeps())
      deps.draw()
      return
    }
    if (key.name === "p") {
      const path = currentPath(state)
      await deps.copyWithStatus(path)
      return
    }
    if (key.name === "?" || (key.shift && key.name === "/")) {
      state.confirmModal = {
        kind: "remove-draft",
        title: "Help",
        message: ["Browse: j/k move  h/l back/open  i prompt  Enter summary  Ctrl+S sessions  s/t/m inspect  y copy  p path  q quit"],
        confirmLabel: "dismisses help",
        path: currentPath(state),
      }
      deps.draw()
    }
  })
}
