import type { CliRenderer } from "@opentui/core"

import { activeSession, createNamedSession, saveSessions, syncSessionMetadata } from "../session"
import type { AppState, ChatSession, EditorModalState } from "../types"

type SyncPromptDraft = (state: AppState, editor: EditorModalState) => void
type OpenPromptEditor = (state: AppState, renderer: CliRenderer, redraw: () => void) => void

export function sessionModalEntries(state: AppState): ChatSession[] {
  return [...state.sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export function openSessionModal(state: AppState): void {
  const entries = sessionModalEntries(state)
  const activeIndex = Math.max(0, entries.findIndex((session) => session.id === state.activeSessionId))
  if (state.editorModal?.target.kind === "prompt") {
    state.editorModal.renderable.blur()
  }
  state.sessionModal = { selectedIndex: activeIndex }
}

export function closeSessionModal(state: AppState): void {
  state.sessionModal = null
  if (state.editorModal?.target.kind === "prompt") {
    state.editorModal.renderable.focus()
  }
}

export async function persistSessions(state: AppState): Promise<void> {
  for (const session of state.sessions) {
    syncSessionMetadata(session)
  }
  await saveSessions(state.jsonPath, state.sessions, state.activeSessionId)
}

type SessionFlowDeps = {
  syncPromptDraft: SyncPromptDraft
  openPromptEditor: OpenPromptEditor
}

export async function switchToSession(
  state: AppState,
  sessionId: string,
  renderer: CliRenderer,
  redraw: () => void,
  deps: SessionFlowDeps,
): Promise<void> {
  const session = state.sessions.find((candidate) => candidate.id === sessionId)
  if (!session) return
  if (state.editorModal?.target.kind === "prompt") {
    deps.syncPromptDraft(state, state.editorModal)
  }
  syncSessionMetadata(session)
  state.activeSessionId = sessionId
  state.uiMode = session.lastMode
  state.activeResponseId = null
  state.activeAssistantMessageId = null
  state.activeAssistantNewlineCount = 0
  state.promptScrollTop = Number.MAX_SAFE_INTEGER
  state.lastPromptAutoScrollTop = null
  state.editorModal = null
  closeSessionModal(state)
  await persistSessions(state)
  deps.openPromptEditor(state, renderer, redraw)
}

export async function createAndSwitchSession(
  state: AppState,
  renderer: CliRenderer,
  redraw: () => void,
  deps: SessionFlowDeps,
): Promise<void> {
  if (state.editorModal?.target.kind === "prompt") {
    deps.syncPromptDraft(state, state.editorModal)
  }
  const session = createNamedSession(state.jsonPath, state.uiMode)
  state.sessions.unshift(session)
  state.activeSessionId = session.id
  state.uiMode = session.lastMode
  state.activeResponseId = null
  state.activeAssistantMessageId = null
  state.activeAssistantNewlineCount = 0
  state.promptScrollTop = Number.MAX_SAFE_INTEGER
  state.lastPromptAutoScrollTop = null
  closeSessionModal(state)
  await persistSessions(state)
  deps.openPromptEditor(state, renderer, redraw)
}

export async function flushActiveSession(state: AppState, syncPromptDraft: SyncPromptDraft): Promise<void> {
  if (state.editorModal?.target.kind === "prompt") {
    syncPromptDraft(state, state.editorModal)
  }
  const session = activeSession(state)
  session.lastMode = state.uiMode
  syncSessionMetadata(session)
  await persistSessions(state)
}
