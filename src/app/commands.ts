import type { CliRenderer, KeyEvent } from "@opentui/core"

import { currentPath, cycleConceptNamespaceMode, pageSize } from "../core/state"
import type { AppState, BufferModalTarget, InspectorKind } from "../core/types"
import { activePrimaryPaneFeature, nextPrimaryFeatureId } from "../features"
import { syncPromptDraft } from "../prompt/editor"
import { flushActiveSession, openSessionModal } from "../sessions/commands"

type PromptEditorDeps = {
  redraw: () => void
  refreshPromptTokenBreakdown: () => void
  refreshPromptScroll: () => void
  schedulePromptScrollSync: (reason: string) => void
  refreshPromptPaneTarget: () => void
}

function matchesFeatureCycleKey(key: KeyEvent, direction: "next" | "previous"): boolean {
  const names = direction === "next"
    ? new Set(["]", "close_bracket", "right_bracket", "bracketright"])
    : new Set(["[", "open_bracket", "left_bracket", "bracketleft"])
  const sequences = direction === "next" ? new Set(["]"]) : new Set(["["])
  return (typeof key.name === "string" && names.has(key.name)) || (typeof key.sequence === "string" && sequences.has(key.sequence))
}

export function cyclePrimaryFeature(state: AppState, key: KeyEvent, deps: Pick<AppCommandDeps, "draw">): boolean {
  if (!state.conceptNavigationFocused || state.editorModal) {
    return false
  }
  if (matchesFeatureCycleKey(key, "next")) {
    const nextId = nextPrimaryFeatureId(state, 1)
    if (!nextId) return false
    key.preventDefault()
    key.stopPropagation()
    state.activePrimaryFeatureId = nextId
    deps.draw()
    return true
  }
  if (matchesFeatureCycleKey(key, "previous")) {
    const nextId = nextPrimaryFeatureId(state, -1)
    if (!nextId) return false
    key.preventDefault()
    key.stopPropagation()
    state.activePrimaryFeatureId = nextId
    deps.draw()
    return true
  }
  return false
}

export type AppCommandDeps = {
  state: AppState
  renderer: () => CliRenderer
  draw: () => void
  clearCtrlCExitState: () => void
  copyWithStatus: (payload: string) => Promise<void>
  openBufferEditor: (target: Exclude<BufferModalTarget, { kind: "prompt" }>, initialText: string) => void
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
    kind: "message",
    title: "Quit",
    message: ["Press Ctrl+C again to quit, or Esc to stay"],
    confirmLabel: "dismisses this message",
  }
  state.pendingCtrlCExit = true
  deps.draw()
  return true
}

export async function handleBrowserKey(state: AppState, key: KeyEvent, deps: AppCommandDeps): Promise<boolean> {
  if (cyclePrimaryFeature(state, key, deps)) return true
  if (key.ctrl && key.name === "s") {
    openSessionModal(state)
    deps.draw()
    return true
  }
  if (key.name === "q") {
    await flushActiveSession(state, syncPromptDraft)
    deps.renderer().destroy()
    process.exit(0)
  }
  const feature = activePrimaryPaneFeature(state)
  if (await feature.handleBrowserKey?.(state, key, {
    renderer: deps.renderer,
    draw: deps.draw,
    copyWithStatus: deps.copyWithStatus,
    openBufferEditor: deps.openBufferEditor,
    openInspector: deps.openInspector,
    openScopedContextModal: deps.openScopedContextModal,
    cycleConceptNamespaceMode,
    pageSize,
    buildPromptEditorDeps: deps.buildPromptEditorDeps,
  })) return true
  if (key.name === "?" || (key.shift && key.name === "/")) {
    const helpText = feature.browseHelpText ?? "Browse: [/] feature  Shift+Tab focus  q quit"
    state.confirmModal = {
      kind: "message",
      title: "Help",
      message: [helpText],
      confirmLabel: "dismisses help",
    }
    deps.draw()
    return true
  }
  return false
}
