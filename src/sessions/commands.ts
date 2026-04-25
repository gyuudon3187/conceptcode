import type { CliRenderer } from "@opentui/core"

import type { ShellSessionListItem } from "agent-tui/types"

import { sessionModalHostState } from "../core/state"
import type { AppState, ChatSession, EditorModalState, SessionModalHostState } from "../core/types"
import { activeSession, createNamedSession, saveSessions, sessionActivityAt, syncSessionMetadata } from "./store"

type SyncPromptDraft = (state: AppState, editor: EditorModalState) => void
type OpenPromptEditor = (state: AppState, renderer: CliRenderer, redraw: () => void) => void

export function sessionModalEntries(state: Pick<SessionModalHostState, "sessions">): ChatSession[] {
  return [...state.sessions].sort((left, right) => sessionActivityAt(right).localeCompare(sessionActivityAt(left)))
}

export function sessionModalItem(session: ChatSession, selected: boolean): ShellSessionListItem {
  const activityAt = sessionActivityAt(session)
  const badge = session.lastMode === "plan"
    ? { label: "PLAN", color: "#74c0fc" }
    : session.lastMode === "build"
      ? { label: "BUILD", color: "#ffa94d" }
      : { label: "CONCEPTUALIZE", color: "#8ce99a" }
  return {
    id: session.id,
    title: session.title,
    subtitle: `${session.messages.filter((message) => message.text.trim()).length} messages  ${activityAt.replace("T", " ").slice(0, 16)}`,
    badge,
    selected,
  }
}

export function openSessionModal(state: AppState): void {
  const entries = sessionModalEntries(sessionModalHostState(state))
  const activeIndex = Math.max(0, entries.findIndex((session) => session.id === state.activeSessionId))
  if (state.editorModal?.target.kind === "prompt") {
    state.editorModal.renderable.blur()
  }
  state.sessionModal = { selectedIndex: activeIndex, scrollTop: Math.max(0, activeIndex - 3) }
}

export function closeSessionModal(state: AppState): void {
  state.sessionModal = null
  if (state.editorModal?.target.kind === "prompt") {
    state.editorModal.renderable.focus()
  }
}

export function promptToDeleteSession(state: AppState, session: ChatSession): void {
  state.confirmModal = {
    kind: "delete-session",
    title: "Delete Session",
    message: [`Delete session \"${session.title}\"?`, "This permanently removes the saved chat history for this session."],
    confirmLabel: "deletes this session",
    sessionId: session.id,
  }
}

export async function persistSessions(state: AppState): Promise<void> {
  for (const session of state.sessions) {
    syncSessionMetadata(session)
  }
  await saveSessions(state.jsonPath, state.sessions, state.activeSessionId)
}

export async function deleteSession(state: AppState, sessionId: string): Promise<void> {
  const existingIndex = state.sessions.findIndex((session) => session.id === sessionId)
  if (existingIndex === -1) return
  if (state.sessions.length <= 1) return
  const deletingActive = state.activeSessionId === sessionId
  state.sessions.splice(existingIndex, 1)
  if (state.sessionModal) {
    const entries = sessionModalEntries(sessionModalHostState(state))
    state.sessionModal.selectedIndex = Math.max(0, Math.min(state.sessionModal.selectedIndex, entries.length - 1))
    state.sessionModal.scrollTop = Math.max(0, Math.min(state.sessionModal.scrollTop, entries.length - 1))
  }
  if (deletingActive) {
    const fallback = state.sessions[Math.max(0, Math.min(existingIndex, state.sessions.length - 1))]
    if (fallback) {
      state.activeSessionId = fallback.id
      state.uiMode = fallback.lastMode
      state.activeResponseId = null
      state.activeAssistantMessageId = null
      state.promptScrollTop = Number.MAX_SAFE_INTEGER
      state.editorModal = null
    }
  }
  await persistSessions(state)
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
  state.promptScrollTop = Number.MAX_SAFE_INTEGER
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
  state.promptScrollTop = Number.MAX_SAFE_INTEGER
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
