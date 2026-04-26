import { createCliRenderer, type CliRenderer, type KeyEvent } from "@opentui/core"
import { confirmOrCancelCommand, inspectorCommand, moveShellListSelection, sessionModalCommand, sessionModalVisibleRowCount, sharedFocusCommand } from "agent-tui/keybindings"

import { currentPath, scrollMain } from "../core/state"
import type { AppState, InspectorKind } from "../core/types"
import { handleBrowserKey, handleCtrlCKey } from "./commands"
import { handleCreateConceptModalKey, removeDraftConcept } from "../concepts/drafts"
import { acceptPromptSuggestion, applyEditorText, conceptCodePromptSuggestionProvider, cyclePromptMode, handlePromptAliasBoundaryKey, movePromptSuggestionSelection, refreshPromptSuggestion, refreshPromptSuggestionSoon, refreshEditorModalHeight, syncPromptDraft } from "../prompt/editor"
import { closeSessionModal, createAndSwitchSession, deleteSession, openSessionModal, promptToDeleteSession, sessionModalEntries, switchToSession } from "../sessions/commands"

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
  const command = confirmOrCancelCommand(key)
  if (command?.kind === "cancel") {
    deps.closeConfirmModal()
    deps.draw()
    return true
  }
  if (command?.kind === "confirm") {
    if (modal.kind === "remove-draft") {
      removeDraftConcept(state, modal.path)
    }
    if (modal.kind === "delete-session") {
      void deleteSession(state, modal.sessionId)
    }
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
  const visibleRowCount = sessionModalVisibleRowCount(state.layoutMode, process.stdout.rows || 24)
  const command = sessionModalCommand(key)
  if (command?.kind === "cancel" || key.name === "q") {
    key.preventDefault()
    key.stopPropagation()
    closeSessionModal(state)
    deps.draw()
    return true
  }
  if (command?.kind === "move") {
    key.preventDefault()
    key.stopPropagation()
    moveShellListSelection(modal, entries.length, command.delta, visibleRowCount)
    deps.draw()
    return true
  }
  if (command?.kind === "create") {
    key.preventDefault()
    key.stopPropagation()
    await createAndSwitchSession(state, deps.renderer(), deps.draw, { syncPromptDraft, openPromptEditor: deps.openPromptEditor })
    deps.draw()
    return true
  }
  if (command?.kind === "delete") {
    key.preventDefault()
    key.stopPropagation()
    const selected = entries[modal.selectedIndex]
    if (selected && entries.length > 1) {
      promptToDeleteSession(state, selected)
      deps.draw()
    }
    return true
  }
  if (command?.kind === "confirm") {
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
    const promptSuggestionProvider = conceptCodePromptSuggestionProvider(state)

    if (key.ctrl && key.name === "c") {
      if (state.editorModal) {
        applyEditorText(state, state.editorModal)
        refreshPromptSuggestion(state, promptSuggestionProvider)
        refreshEditorModalHeight(state)
      }
      await handleCtrlCKey(key, deps)
      return
    }

    if (state.pendingCtrlCExit) {
      state.pendingCtrlCExit = false
    }

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
      const command = inspectorCommand(key, Math.max(1, state.mainViewportHeight - 2))
      if (command?.kind === "cancel") {
        deps.closeInspector()
        deps.draw()
        return
      }
      if (command?.kind === "scroll") {
        scrollMain(state, command.delta)
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
      if (sharedFocusCommand(key)?.kind === "toggleFocus") {
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
          refreshPromptSuggestion(state, promptSuggestionProvider)
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
        movePromptSuggestionSelection(state, 1, promptSuggestionProvider)
        deps.draw()
        return
      }
      if (state.editorModal.promptSuggestion && (key.name === "up" || (key.ctrl && key.name === "p"))) {
        movePromptSuggestionSelection(state, -1, promptSuggestionProvider)
        deps.draw()
        return
      }
      if (state.editorModal.promptSuggestion && key.name === "return") {
        key.preventDefault()
        key.stopPropagation()
        if (acceptPromptSuggestion(state, promptSuggestionProvider)) {
          deps.draw()
        }
        return
      }
      applyEditorText(state, state.editorModal)
      refreshPromptSuggestionSoon(state, deps.draw, promptSuggestionProvider)
      deps.draw()
      return
    }

    if (sharedFocusCommand(key)?.kind === "toggleFocus") {
      key.preventDefault()
      key.stopPropagation()
      deps.workspace.togglePaneFocus()
      return
    }
    await handleBrowserKey(state, key, {
      state,
      renderer: deps.renderer,
      draw: deps.draw,
      clearCtrlCExitState: deps.clearCtrlCExitState,
      copyWithStatus: deps.copyWithStatus,
      openInspector: deps.openInspector,
      buildPromptEditorDeps: deps.buildPromptEditorDeps,
    })
  })
}
