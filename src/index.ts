import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"

import { RGBA, ScrollBoxRenderable, SyntaxStyle, TextareaRenderable, type Highlight, createCliRenderer, type CliRenderer, type KeyEvent } from "@opentui/core"

import { handleCreateConceptModalKey, isDraftConcept, openCreateConceptModal, promptToRemoveDraft, removeDraftConcept } from "./app/concepts"
import { createInitialAppState, loadProjectPaths, parseArgs } from "./app/init"
import { acceptAliasSuggestion, applyEditorText, cyclePromptMode, handlePromptAliasBoundaryKey, moveAliasSuggestionSelection, openEditor, openPromptEditor, openSummaryEditor, refreshAliasSuggestion, refreshAliasSuggestionSoon, refreshEditorModalHeight, syncPromptDraft, visibleAliasSuggestions } from "./app/prompt-editor"
import { createAndSwitchSession, closeSessionModal, flushActiveSession, openSessionModal, persistSessions, sessionModalEntries, switchToSession } from "./app/sessions"
import { createSseChatTransport, startDummyChatServer } from "./chat"
import { buildClipboardPayload, clipboardSelection, copyToClipboard, effectivePromptTokenBreakdown, EMPTY_PROMPT_TOKEN_BREAKDOWN } from "./clipboard"
import { loadConceptGraph } from "./model"
import { activeSession, syncSessionMetadata } from "./session"
import { applySelectionChange, clampCursor, currentNode, currentPath, handleResize, moveCursor, pageSize, scrollMain, visiblePaths } from "./state"
import type { AppState, ChatSession, EditorModalState, InspectorKind, PromptMessage, UiLayoutConfig } from "./types"
import { repaint, renderPromptThreadContent, replaceChildren, scrollListForCursor } from "./view"

const DEBUG_WORKSPACE_TRANSITION = true
const WORKSPACE_DEBUG_LOG_PATH = join(process.cwd(), "workspace-transition-debug.log")

async function appendWorkspaceDebugLog(event: string, payload: Record<string, unknown>): Promise<void> {
  if (!DEBUG_WORKSPACE_TRANSITION) return
  const line = `${JSON.stringify({ ts: new Date().toISOString(), event, ...payload })}\n`
  try {
    await appendFile(WORKSPACE_DEBUG_LOG_PATH, line, "utf8")
  } catch {
  }
}

function easeOutPower(progress: number, power: number): number {
  const clamped = Math.max(0, Math.min(1, progress))
  const normalizedPower = Math.max(1, power)
  const lateEaseStart = 0.72
  if (clamped <= lateEaseStart) {
    return clamped
  }
  const tailProgress = (clamped - lateEaseStart) / (1 - lateEaseStart)
  const easedTailProgress = 1 - ((1 - tailProgress) ** (1 / normalizedPower))
  return lateEaseStart + (easedTailProgress * (1 - lateEaseStart))
}



function refreshPromptTokenBreakdown(state: AppState, redraw: () => void): void {
  void effectivePromptTokenBreakdown(state, currentPath(state)).then((breakdown) => {
    state.promptTokenBreakdown = breakdown
    refreshPromptScroll(state)
    redraw()
  })
}

let promptScrollRef: ScrollBoxRenderable | null = null
let promptScrollSyncTimeout: ReturnType<typeof setTimeout> | null = null
let promptScrollAnimationTimeout: ReturnType<typeof setTimeout> | null = null
let promptScrollAnimationToken = 0

const PROMPT_SCROLL_ANIMATION_STEP_MS = 16
const PROMPT_SCROLL_ANIMATION_EPSILON = 0.75
const PROMPT_SCROLL_ANIMATION_DURATION_STEPS = 14

function stopPromptScrollAnimation(): void {
  promptScrollAnimationToken += 1
  if (promptScrollAnimationTimeout) {
    clearTimeout(promptScrollAnimationTimeout)
    promptScrollAnimationTimeout = null
  }
}

function newlineCount(text: string): number {
  return (text.match(/\n/g) ?? []).length
}

function animatePromptScrollTo(state: AppState, redraw: () => void, targetY: number, _reason: string): void {
  if (!promptScrollRef) return
  stopPromptScrollAnimation()
  const animationToken = promptScrollAnimationToken
  const startY = promptScrollRef.scrollTop
  if (Math.abs(targetY - startY) <= PROMPT_SCROLL_ANIMATION_EPSILON) {
    promptScrollRef.scrollTo({ x: 0, y: targetY })
    redraw()
    return
  }
  let stepIndex = 0
  const step = () => {
    if (animationToken !== promptScrollAnimationToken) {
      promptScrollAnimationTimeout = null
      return
    }
    if (!promptScrollRef) {
      promptScrollAnimationTimeout = null
      return
    }
    stepIndex += 1
    const progress = Math.min(1, stepIndex / PROMPT_SCROLL_ANIMATION_DURATION_STEPS)
    const eased = 0.5 - (Math.cos(Math.PI * progress) / 2)
    const nextY = startY + ((targetY - startY) * eased)
    promptScrollRef.scrollTo({ x: 0, y: nextY })
    redraw()
    if (progress >= 1 || Math.abs(targetY - nextY) <= PROMPT_SCROLL_ANIMATION_EPSILON) {
      promptScrollRef.scrollTo({ x: 0, y: targetY })
      promptScrollAnimationTimeout = null
      redraw()
      return
    }
    promptScrollAnimationTimeout = setTimeout(step, PROMPT_SCROLL_ANIMATION_STEP_MS)
  }
  promptScrollAnimationTimeout = setTimeout(step, PROMPT_SCROLL_ANIMATION_STEP_MS)
}

function schedulePromptScrollSync(state: AppState, redraw: () => void, reason: string): void {
  if (promptScrollSyncTimeout) {
    clearTimeout(promptScrollSyncTimeout)
  }
  promptScrollSyncTimeout = setTimeout(() => {
    promptScrollSyncTimeout = null
    const editor = state.editorModal?.target.kind === "prompt" ? state.editorModal : null
    if (!promptScrollRef || !editor) return
    const shouldStickToBottom = state.promptScrollTop === Number.MAX_SAFE_INTEGER
    const shouldAnimate = shouldStickToBottom && reason === "streamAssistantResponse"
    if (shouldStickToBottom) {
      if (shouldAnimate) {
        const currentBottom = promptScrollRef.scrollTop
        promptScrollRef.scrollTo({ x: 0, y: Number.MAX_SAFE_INTEGER })
        const targetBottom = promptScrollRef.scrollTop
        promptScrollRef.scrollTo({ x: 0, y: currentBottom })
        animatePromptScrollTo(state, redraw, targetBottom, reason)
      } else {
        stopPromptScrollAnimation()
        promptScrollRef.scrollTo({ x: 0, y: Number.MAX_SAFE_INTEGER })
        redraw()
      }
    } else if (reason === "promptCursorChange" || reason === "promptContentChange") {
      stopPromptScrollAnimation()
      promptScrollRef.scrollTo({ x: 0, y: state.promptScrollTop })
      state.promptScrollTop = Math.max(0, promptScrollRef.scrollTop)
      redraw()
    } else {
      animatePromptScrollTo(state, redraw, state.promptScrollTop, reason)
      state.promptScrollTop = Math.max(0, promptScrollRef.scrollTop)
    }
    redraw()
  }, 0)
}

function refreshPromptScroll(state: AppState): void {
  const editor = state.editorModal?.target.kind === "prompt" ? state.editorModal : null
  if (!promptScrollRef || !editor) return
  const shouldStickToBottom = state.promptScrollTop === Number.MAX_SAFE_INTEGER
  replaceChildren(promptScrollRef, renderPromptThreadContent(state, editor))
  state.promptViewportHeight = Math.max(8, promptScrollRef.viewport.height || (state.layoutMode === "wide" ? 16 : 10))
  if (!shouldStickToBottom) {
    promptScrollRef.scrollTo({ x: 0, y: state.promptScrollTop })
    state.promptScrollTop = Math.max(0, promptScrollRef.scrollTop)
  }
}

function syncStreamingOverflowScroll(state: AppState, redraw: () => void): void {
  if (!promptScrollRef) return
  if (state.promptScrollTop !== Number.MAX_SAFE_INTEGER) return
  const assistantMessageId = state.activeAssistantMessageId
  if (!assistantMessageId) return
  const assistantMessage = activeSession(state).messages.find((message) => message.id === assistantMessageId)
  if (!assistantMessage) return
  const nextNewlineCount = newlineCount(assistantMessage.text)
  if (nextNewlineCount <= state.activeAssistantNewlineCount) return
  const previousTop = promptScrollRef.scrollTop
  promptScrollRef.scrollTo({ x: 0, y: Number.MAX_SAFE_INTEGER })
  const targetTop = promptScrollRef.scrollTop
  promptScrollRef.scrollTo({ x: 0, y: previousTop })
  state.activeAssistantNewlineCount = nextNewlineCount
  if (targetTop > previousTop) {
    state.lastPromptAutoScrollTop = targetTop
    animatePromptScrollTo(state, redraw, targetTop, "streamAssistantOverflow")
    return
  }
  state.lastPromptAutoScrollTop = previousTop
}

function syncPromptScrollToBottom(state: AppState, redraw: () => void): void {
  if (!promptScrollRef) return
  if (state.promptScrollTop !== Number.MAX_SAFE_INTEGER) return
  const previousTop = promptScrollRef.scrollTop
  promptScrollRef.scrollTo({ x: 0, y: Number.MAX_SAFE_INTEGER })
  const targetTop = promptScrollRef.scrollTop
  if (targetTop <= previousTop) return
  animatePromptScrollTo(state, redraw, targetTop, "streamAssistantComplete")
}

function replacePromptMessage(state: AppState, messageId: string, updater: (message: PromptMessage) => PromptMessage): void {
  const session = activeSession(state)
  const index = session.messages.findIndex((message) => message.id === messageId)
  if (index < 0) return
  session.messages[index] = updater(session.messages[index])
}

function rebindActiveAssistantMessageId(state: AppState, nextMessageId: string): void {
  const activeAssistantMessageId = state.activeAssistantMessageId
  if (!activeAssistantMessageId || activeAssistantMessageId === nextMessageId) return
  const session = activeSession(state)
  const index = session.messages.findIndex((message) => message.id === activeAssistantMessageId && message.role === "assistant")
  if (index < 0) return
  session.messages[index] = { ...session.messages[index], id: nextMessageId }
}

async function streamAssistantResponse(state: AppState, redraw: () => void): Promise<void> {
  const requestMessages = activeSession(state).messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .filter((message) => message.text.trim().length > 0)
    .map((message) => ({ role: message.role, text: message.text }))
  try {
    for await (const event of state.chatTransport.streamTurn({ messages: requestMessages, mode: state.uiMode })) {
      if (event.type === "response.created") {
        rebindActiveAssistantMessageId(state, event.messageId)
        state.activeResponseId = event.responseId
        state.activeAssistantMessageId = event.messageId
        state.activeAssistantNewlineCount = 0
        replacePromptMessage(state, event.messageId, (message) => ({ ...message, provider: event.provider, status: "streaming" }))
      } else if (event.type === "response.output_text.delta") {
        replacePromptMessage(state, event.messageId, (message) => ({ ...message, text: `${message.text}${event.delta}`, status: "streaming" }))
      } else if (event.type === "response.completed") {
        replacePromptMessage(state, event.messageId, (message) => ({ ...message, status: "complete" }))
      } else if (event.type === "response.error") {
        replacePromptMessage(state, event.messageId, (message) => ({ ...message, text: message.text || `Error: ${event.error}`, status: "error" }))
      }
      refreshPromptScroll(state)
      if (event.type === "response.completed" || event.type === "response.error") {
        syncPromptScrollToBottom(state, redraw)
        state.activeResponseId = null
        state.activeAssistantMessageId = null
        state.activeAssistantNewlineCount = 0
      } else {
        syncStreamingOverflowScroll(state, redraw)
      }
      redraw()
    }
  } catch (error) {
    const assistantMessageId = state.activeAssistantMessageId
    if (assistantMessageId) {
      const message = error instanceof Error ? error.message : String(error)
      replacePromptMessage(state, assistantMessageId, (current) => ({ ...current, text: current.text || `Error: ${message}`, status: "error" }))
    }
    state.activeResponseId = null
    state.activeAssistantMessageId = null
    state.activeAssistantNewlineCount = 0
    refreshPromptScroll(state)
    redraw()
  }
}

function submitPromptMessage(state: AppState, renderer: CliRenderer, redraw: () => void): void {
  const editor = state.editorModal
  if (!editor || editor.target.kind !== "prompt") return
  syncPromptDraft(state, editor)
  const session = activeSession(state)
  const currentDraftIndex = editor.promptDraftIndex ?? Math.max(0, session.messages.length - 1)
  const currentText = session.messages[currentDraftIndex]?.text ?? ""
  if (!currentText.trim()) return
  const userMessageId = `msg_${crypto.randomUUID()}`
  const assistantMessageId = `msg_${crypto.randomUUID()}`
  const draftMessageId = `msg_${crypto.randomUUID()}`
  session.messages[currentDraftIndex] = { id: userMessageId, text: currentText, role: "user", mode: state.uiMode, status: "complete" }
  const nextMessages: PromptMessage[] = [
    ...session.messages,
    { id: assistantMessageId, text: "", role: "assistant", status: "streaming", provider: "dummy-local" },
    { id: draftMessageId, text: "", role: "user", status: "complete" },
  ]
  session.messages = nextMessages
  session.draftPromptText = ""
  session.lastMode = state.uiMode
  syncSessionMetadata(session)
  state.activeAssistantMessageId = assistantMessageId
  state.activeAssistantNewlineCount = 0
  state.lastPromptAutoScrollTop = null
  openEditor(state, renderer, { kind: "prompt" }, "", buildPromptEditorDeps(state, redraw, refreshPromptTokenBreakdown, refreshPromptScroll, schedulePromptScrollSync), nextMessages.length - 1)
  state.promptScrollTop = Number.MAX_SAFE_INTEGER
  refreshPromptScroll(state)
  schedulePromptScrollSync(state, redraw, "submitPromptMessage")
  refreshPromptTokenBreakdown(state, redraw)
  void streamAssistantResponse(state, redraw)
}

let refreshPromptPaneTarget: () => void = () => {}

function buildPromptEditorDeps(
  state: AppState,
  redraw: () => void,
  refreshPromptTokenBreakdownForState: (state: AppState, redraw: () => void) => void,
  refreshPromptScrollForState: (state: AppState) => void,
  schedulePromptScrollSyncForState: (state: AppState, redraw: () => void, reason: string) => void,
) {
  return {
    redraw,
    refreshPromptTokenBreakdown: () => refreshPromptTokenBreakdownForState(state, redraw),
    refreshPromptScroll: () => refreshPromptScrollForState(state),
    schedulePromptScrollSync: (reason: string) => schedulePromptScrollSyncForState(state, redraw, reason),
    refreshPromptPaneTarget,
  }
}

function openInspector(state: AppState, kind: InspectorKind): void {
  state.inspector = { kind }
}

function closeInspector(state: AppState): void {
  state.inspector = null
}

async function main(): Promise<void> {
  const { conceptsPath, optionsPath } = parseArgs(process.argv.slice(2))
  const { graphPayload, nodes, kindDefinitions, uiLayoutConfig } = loadConceptGraph(conceptsPath, optionsPath)
  const dummyChatServer = await startDummyChatServer()
  const { projectFiles, projectDirectories } = await loadProjectPaths(process.cwd())
  const state: AppState = await createInitialAppState({
    conceptsPath,
    graphPayload,
    nodes,
    kindDefinitions,
    uiLayoutConfig,
    dummyChatServerBaseUrl: dummyChatServer.baseUrl,
    projectFiles,
    projectDirectories,
  })
  state.uiMode = activeSession(state).lastMode

  process.on("exit", () => {
    void dummyChatServer.stop()
  })

  let renderer: CliRenderer
  let listScroll!: ScrollBoxRenderable
  let mainScroll!: ScrollBoxRenderable
  let promptScroll!: ScrollBoxRenderable

  function mountRenderer(nextRenderer: CliRenderer): void {
    renderer = nextRenderer
    listScroll = new ScrollBoxRenderable(renderer, { width: "100%", height: "100%", viewportCulling: false, scrollbarOptions: { showArrows: false } })
    mainScroll = new ScrollBoxRenderable(renderer, { width: "100%", height: "100%", viewportCulling: false, scrollbarOptions: { showArrows: false } })
    promptScroll = new ScrollBoxRenderable(renderer, { width: "100%", height: "100%", viewportCulling: false, scrollbarOptions: { showArrows: false } })
    promptScrollRef = promptScroll
    listScroll.verticalScrollBar.visible = false
    listScroll.horizontalScrollBar.visible = false
    mainScroll.verticalScrollBar.visible = false
    mainScroll.horizontalScrollBar.visible = false
    promptScroll.verticalScrollBar.visible = false
    promptScroll.horizontalScrollBar.visible = false
    renderer.on("resize", (width) => {
      handleResize(state, width)
      if (!state.startupDrawComplete) {
        state.promptPaneTargetRatio = desiredPromptPaneRatio()
        state.promptPaneRatio = state.promptPaneTargetRatio
        draw()
        state.startupDrawComplete = true
        return
      }
      refreshPromptPaneTarget()
      draw()
    })
  }

  function closeConfirmModal(): void {
    state.confirmModal = null
  }

  function desiredPromptPaneRatio(): number {
    if (state.layoutMode !== "wide") return 1
    return state.promptPaneMode === "expanded" ? state.uiLayoutConfig.expandedPromptRatio : state.uiLayoutConfig.collapsedPromptRatio
  }

  function stopPromptPaneAnimation(): void {
    if (state.promptPaneAnimationTimeout) {
      clearTimeout(state.promptPaneAnimationTimeout)
      state.promptPaneAnimationTimeout = null
    }
  }

  function stopWorkspaceTransition(): void {
    if (state.workspaceTransitionTimeout) {
      clearTimeout(state.workspaceTransitionTimeout)
      state.workspaceTransitionTimeout = null
    }
  }

  function finishWorkspaceTransition(nextFocus: boolean, openPromptEditorAfterTransition = false): void {
    stopWorkspaceTransition()
    stopPromptPaneAnimation()
    if (nextFocus && state.editorModal?.target.kind === "prompt") {
      applyEditorText(state, state.editorModal)
      state.editorModal.renderable.blur()
      state.editorModal = null
    }
    state.workspaceTransition = null
    state.conceptNavigationFocused = nextFocus
    state.promptPaneMode = nextFocus ? "collapsed" : "expanded"
    state.promptPaneTargetRatio = desiredPromptPaneRatio()
    state.promptPaneRatio = state.promptPaneTargetRatio
    if (openPromptEditorAfterTransition && !nextFocus) {
      if (state.editorModal?.target.kind === "prompt") {
        state.editorModal.renderable.focus()
      } else {
        openPromptEditor(state, renderer, buildPromptEditorDeps(state, draw, refreshPromptTokenBreakdown, refreshPromptScroll, schedulePromptScrollSync))
        return
      }
    }
    draw()
  }

  function startWorkspaceTransition(nextFocus: boolean, openPromptEditorAfterTransition = false): void {
    if (state.layoutMode !== "wide") {
      finishWorkspaceTransition(nextFocus, openPromptEditorAfterTransition)
      return
    }
    stopWorkspaceTransition()
    state.workspaceTransition = {
      from: state.conceptNavigationFocused ? "concepts" : "session",
      to: nextFocus ? "concepts" : "session",
      progress: 0,
      startedAt: Date.now(),
      loggedFirstFrame: false,
    }
    void appendWorkspaceDebugLog("transition_start", {
      from: state.workspaceTransition.from,
      to: state.workspaceTransition.to,
      viewportWidth: process.stdout.columns || 120,
      viewportHeight: process.stdout.rows || 36,
      promptPaneRatio: state.promptPaneRatio,
      promptPaneTargetRatio: state.promptPaneTargetRatio,
      layoutMode: state.layoutMode,
    })
    const step = () => {
      const transition = state.workspaceTransition
      if (!transition) return
      const elapsed = Date.now() - transition.startedAt
      const linearProgress = Math.min(1, elapsed / state.uiLayoutConfig.workspaceTransitionDurationMs)
      transition.progress = easeOutPower(linearProgress, state.uiLayoutConfig.workspaceTransitionEndEasePower)
      if (transition.progress >= 1) {
        void appendWorkspaceDebugLog("transition_end", {
          from: transition.from,
          to: transition.to,
          progress: transition.progress,
          linearProgress,
          elapsed,
          viewportWidth: process.stdout.columns || 120,
          viewportHeight: process.stdout.rows || 36,
        })
        finishWorkspaceTransition(nextFocus, openPromptEditorAfterTransition)
        return
      }
      draw()
      state.workspaceTransitionTimeout = setTimeout(step, state.uiLayoutConfig.workspaceTransitionStepMs)
    }
    draw()
    state.workspaceTransitionTimeout = setTimeout(step, state.uiLayoutConfig.workspaceTransitionStepMs)
  }

  function animatePromptPane(): void {
    stopPromptPaneAnimation()
    if (state.layoutMode !== "wide") {
      state.promptPaneRatio = 1
      state.promptPaneTargetRatio = 1
      draw()
      return
    }
    const step = () => {
      const delta = state.promptPaneTargetRatio - state.promptPaneRatio
      if (Math.abs(delta) <= state.uiLayoutConfig.promptAnimationEpsilon) {
        state.promptPaneRatio = state.promptPaneTargetRatio
        state.promptPaneAnimationTimeout = null
        draw()
        return
      }
      state.promptPaneRatio += delta * state.uiLayoutConfig.promptAnimationLerp
      draw()
      state.promptPaneAnimationTimeout = setTimeout(step, state.uiLayoutConfig.promptAnimationStepMs)
    }
    draw()
    state.promptPaneAnimationTimeout = setTimeout(step, state.uiLayoutConfig.promptAnimationStepMs)
  }

  refreshPromptPaneTarget = (): void => {
    const nextTarget = desiredPromptPaneRatio()
    if (state.layoutMode !== "wide") {
      stopPromptPaneAnimation()
      state.promptPaneTargetRatio = 1
      state.promptPaneRatio = 1
      return
    }
    if (Math.abs(nextTarget - state.promptPaneRatio) <= state.uiLayoutConfig.promptAnimationEpsilon) {
      stopPromptPaneAnimation()
      state.promptPaneTargetRatio = nextTarget
      state.promptPaneRatio = nextTarget
      return
    }
    if (Math.abs(nextTarget - state.promptPaneTargetRatio) <= state.uiLayoutConfig.promptAnimationEpsilon) {
      state.promptPaneTargetRatio = nextTarget
      return
    }
    state.promptPaneTargetRatio = nextTarget
    animatePromptPane()
  }

  function togglePaneFocus(state: AppState, renderer: CliRenderer, redraw: () => void): void {
    if (state.workspaceTransition) return
    if (state.editorModal?.target.kind === "prompt") {
      applyEditorText(state, state.editorModal)
      state.editorModal.renderable.blur()
      state.editorModal = null
      startWorkspaceTransition(true)
      return
    }
    if (state.conceptNavigationFocused) {
      startWorkspaceTransition(false, true)
      return
    }
    openPromptEditor(state, renderer, buildPromptEditorDeps(state, redraw, refreshPromptTokenBreakdown, refreshPromptScroll, schedulePromptScrollSync))
  }

  function focusPromptPane(state: AppState, renderer: CliRenderer, redraw: () => void): void {
    if (state.workspaceTransition) return
    if (state.editorModal?.target.kind === "prompt") {
      startWorkspaceTransition(false, true)
      return
    }
    openPromptEditor(state, renderer, buildPromptEditorDeps(state, redraw, refreshPromptTokenBreakdown, refreshPromptScroll, schedulePromptScrollSync))
  }

  function updateCreateDraftText(key: KeyEvent): boolean {
    const modal = state.createConceptModal
    if (!modal) return false
    const field = modal.fieldIndex === 0 ? "title" : "summary"
    if (key.name === "backspace") {
      modal.draft[field] = modal.draft[field].slice(0, -1)
      return true
    }
    if (key.name === "space") {
      modal.draft[field] += " "
      return true
    }
    if (typeof key.sequence === "string" && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      const code = key.sequence.charCodeAt(0)
      if (code >= 32 && code <= 126) {
        modal.draft[field] += key.sequence
        return true
      }
    }
    return false
  }

  function handleConfirmModalKey(key: KeyEvent): boolean {
    const modal = state.confirmModal
    if (!modal) return false
    if (key.name === "escape" || (key.ctrl && key.name === "q")) {
      closeConfirmModal()
      draw()
      return true
    }
    if (key.name === "return") {
      removeDraftConcept(state, modal.path)
      closeConfirmModal()
      draw()
      return true
    }
    return true
  }

  async function handleSessionModalKey(key: KeyEvent): Promise<boolean> {
    const modal = state.sessionModal
    if (!modal) return false
    const entries = sessionModalEntries(state)
    if (key.name === "escape" || (key.ctrl && key.name === "q")) {
      key.preventDefault()
      key.stopPropagation()
      closeSessionModal(state)
      draw()
      return true
    }
    if (key.name === "j" || key.name === "down") {
      key.preventDefault()
      key.stopPropagation()
      modal.selectedIndex = Math.min(entries.length - 1, modal.selectedIndex + 1)
      draw()
      return true
    }
    if (key.name === "k" || key.name === "up") {
      key.preventDefault()
      key.stopPropagation()
      modal.selectedIndex = Math.max(0, modal.selectedIndex - 1)
      draw()
      return true
    }
    if (key.name === "n") {
      key.preventDefault()
      key.stopPropagation()
      await createAndSwitchSession(state, renderer, draw, { syncPromptDraft, openPromptEditor: (nextState, nextRenderer, nextRedraw) => openPromptEditor(nextState, nextRenderer, buildPromptEditorDeps(nextState, nextRedraw, refreshPromptTokenBreakdown, refreshPromptScroll, schedulePromptScrollSync)) })
      draw()
      return true
    }
    if (key.name === "return") {
      key.preventDefault()
      key.stopPropagation()
      const selected = entries[modal.selectedIndex]
      if (selected) {
        await switchToSession(state, selected.id, renderer, draw, { syncPromptDraft, openPromptEditor: (nextState, nextRenderer, nextRedraw) => openPromptEditor(nextState, nextRenderer, buildPromptEditorDeps(nextState, nextRedraw, refreshPromptTokenBreakdown, refreshPromptScroll, schedulePromptScrollSync)) })
        draw()
      }
      return true
    }
    return true
  }

  function bindKeyHandler(): void {
    renderer.keyInput.on("keypress", async (key: KeyEvent) => {
      if (key.ctrl && key.name === "c") {
        key.preventDefault()
        key.stopPropagation()
        if (state.editorModal && state.editorModal.renderable.plainText.length > 0) {
          state.editorModal.renderable.setText("")
          state.editorModal.renderable.focus()
          applyEditorText(state, state.editorModal)
          refreshAliasSuggestion(state)
          refreshEditorModalHeight(state)
          clearCtrlCExitState()
          draw()
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
        draw()
        return
      }

      if (state.pendingCtrlCExit) {
        state.pendingCtrlCExit = false
      }
      const visible = visiblePaths(state)

      if (state.confirmModal) {
        handleConfirmModalKey(key)
        return
      }
      if (state.sessionModal) {
        key.preventDefault()
        key.stopPropagation()
        await handleSessionModalKey(key)
        return
      }
      if (state.inspector) {
        if (key.name === "escape" || key.name === "q") {
          closeInspector(state)
          draw()
          return
        }
        if (key.name === "pageup") {
          scrollMain(state, -Math.max(1, state.mainViewportHeight - 2))
          draw()
          return
        }
        if (key.name === "pagedown") {
          scrollMain(state, Math.max(1, state.mainViewportHeight - 2))
          draw()
          return
        }
        return
      }
      if (state.createConceptModal) {
        handleCreateConceptModalKey(state, key, { draw, updateCreateDraftText })
        return
      }
      if (state.editorModal) {
        if (key.ctrl && key.name === "s") {
          key.preventDefault()
          key.stopPropagation()
          openSessionModal(state)
          draw()
          return
        }
        if (state.editorModal.target.kind === "prompt" && key.name === "pagedown") {
          state.promptScrollTop += Math.max(1, state.promptViewportHeight - 2)
          refreshPromptScroll(state)
          draw()
          return
        }
        if (state.editorModal.target.kind === "prompt" && key.name === "pageup") {
          state.promptScrollTop = Math.max(0, state.promptScrollTop - Math.max(1, state.promptViewportHeight - 2))
          refreshPromptScroll(state)
          draw()
          return
        }
        if (state.editorModal.target.kind === "prompt" && key.name === "tab" && !key.shift) {
          cyclePromptMode(state, draw, () => refreshPromptTokenBreakdown(state, draw))
          return
        }
        if (key.shift && key.name === "tab") {
          key.preventDefault()
          key.stopPropagation()
          togglePaneFocus(state, renderer, draw)
          return
        }
        if (state.editorModal.target.kind === "prompt" && key.name === "return" && !key.shift && !key.ctrl && !state.editorModal.aliasSuggestion) {
          key.preventDefault()
          key.stopPropagation()
          submitPromptMessage(state, renderer, draw)
          draw()
          return
        }
        if (handlePromptAliasBoundaryKey(state, key, draw)) {
          return
        }
        if (key.name === "escape") {
          key.preventDefault()
          key.stopPropagation()
          applyEditorText(state, state.editorModal)
          state.editorModal.renderable.blur()
          if (state.editorModal.target.kind === "prompt") {
            state.editorModal = null
            startWorkspaceTransition(true)
            return
          }
          state.editorModal = null
          refreshPromptPaneTarget()
          draw()
          return
        }
        if (key.ctrl && key.name === "g") {
          try {
            renderer.suspend()
            const nextText = await openExternalEditor(state.editorModal.renderable.plainText)
            renderer.resume()
            state.editorModal.renderable.setText(nextText)
            state.editorModal.renderable.gotoBufferEnd()
            state.editorModal.renderable.focus()
            refreshAliasSuggestion(state)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            try {
              renderer.resume()
            } catch {
              mountRenderer(await createCliRenderer({ exitOnCtrlC: false }))
              bindKeyHandler()
            }
            state.confirmModal = {
              kind: "remove-draft",
              title: "Editor Error",
              message: [message],
              confirmLabel: "dismisses this message",
              path: currentPath(state),
            }
          }
          draw()
          return
        }
        if (state.editorModal.aliasSuggestion && (key.name === "down" || (key.ctrl && key.name === "n"))) {
          moveAliasSuggestionSelection(state, 1)
          draw()
          return
        }
        if (state.editorModal.aliasSuggestion && (key.name === "up" || (key.ctrl && key.name === "p"))) {
          moveAliasSuggestionSelection(state, -1)
          draw()
          return
        }
        if (state.editorModal.aliasSuggestion && key.name === "return") {
          key.preventDefault()
          key.stopPropagation()
          if (acceptAliasSuggestion(state)) {
            draw()
          }
          return
        }
        applyEditorText(state, state.editorModal)
        refreshAliasSuggestionSoon(state, draw)
        draw()
        return
      }

      if (key.shift && key.name === "tab") {
        key.preventDefault()
        key.stopPropagation()
        togglePaneFocus(state, renderer, draw)
        return
      }
      if (key.ctrl && key.name === "s") {
        openSessionModal(state)
        draw()
        return
      }
      if (key.name === "s") {
        openInspector(state, "snippet")
        draw()
        return
      }
      if (key.name === "t") {
        openInspector(state, "subtree")
        draw()
        return
      }
      if (key.name === "m") {
        openInspector(state, "metadata")
        draw()
        return
      }
      if (key.name === "q") {
        await flushActiveSession(state, syncPromptDraft)
        renderer.destroy()
        process.exit(0)
      }
      if (key.name === "j" || key.name === "down") {
        if (moveCursor(state, 1)) draw()
        return
      }
      if (key.name === "k" || key.name === "up") {
        if (moveCursor(state, -1)) draw()
        return
      }
      if (key.name === "pagedown") {
        if (key.ctrl) {
          scrollMain(state, Math.max(1, state.mainViewportHeight - 2))
          draw()
        } else if (moveCursor(state, pageSize(state.layoutMode))) {
          draw()
        }
        return
      }
      if (key.name === "pageup") {
        if (key.ctrl) {
          scrollMain(state, -Math.max(1, state.mainViewportHeight - 2))
          draw()
        } else if (moveCursor(state, -pageSize(state.layoutMode))) {
          draw()
        }
        return
      }
      if (key.name === "home" || key.name === "g") {
        if (state.cursor !== 0) {
          state.cursor = 0
          applySelectionChange(state)
          draw()
        }
        return
      }
      if (key.name === "end" || (key.shift && key.name === "g")) {
        const nextCursor = Math.max(0, visible.length - 1)
        if (state.cursor !== nextCursor) {
          state.cursor = nextCursor
          applySelectionChange(state)
          draw()
        }
        return
      }
      if (key.name === "l" || key.name === "right") {
        const node = currentNode(state)
        if (node.childPaths.length > 0) {
          state.currentParentPath = node.path
          state.cursor = 0
          applySelectionChange(state)
              draw()
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
              draw()
        }
        return
      }
      if (key.name === "space") {
        if (isDraftConcept(state, currentPath(state))) {
          promptToRemoveDraft(state, currentPath(state))
          draw()
        }
        return
      }
      if (key.name === "n") {
        openCreateConceptModal(state)
        draw()
        return
      }
      if (key.name === "y") {
        const selection = clipboardSelection(state, currentPath(state))
        await copyWithStatus(await buildClipboardPayload(state, currentPath(state)), `Copied context for ${selection.count} reference${selection.count === 1 ? "" : "s"}`)
        return
      }
      if (key.name === "return") {
        openSummaryEditor(state, renderer, buildPromptEditorDeps(state, draw, refreshPromptTokenBreakdown, refreshPromptScroll, schedulePromptScrollSync))
        draw()
        return
      }
      if (key.name === "p") {
        const path = currentPath(state)
        await copyWithStatus(path, `Copied path: ${path}`)
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
        draw()
      }
    })
  }

  const initialRenderer = await createCliRenderer({ exitOnCtrlC: false })
  mountRenderer(initialRenderer)
  bindKeyHandler()

  function draw(): void {
    clampCursor(state)
    repaint(state, listScroll, mainScroll, promptScroll, renderer.root)
  }

  function scrollMainToState(): void {
    scrollListForCursor(state, listScroll)
    state.mainViewportHeight = Math.max(8, mainScroll.viewport.height || (state.layoutMode === "wide" ? 18 : 12))
    mainScroll.scrollTo({ x: 0, y: state.mainScrollTop })
  }

  async function openExternalEditor(initialText: string): Promise<string> {
    const editor = process.env.EDITOR?.trim()
    if (!editor) throw new Error("EDITOR is not set")
    const tempDir = await mkdtemp(join(tmpdir(), "conceptcode-"))
    const tempFile = join(tempDir, "buffer-note.txt")
    await writeFile(tempFile, initialText, "utf8")
    const [command, ...args] = editor.split(/\s+/)
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, [...args, tempFile], { stdio: "inherit" })
      child.on("error", reject)
      child.on("close", (code) => {
        if (code === 0 || code === null) resolve()
        else reject(new Error(`${editor} exited with code ${code}`))
      })
    })
    const nextText = await readFile(tempFile, "utf8")
    await rm(tempDir, { recursive: true, force: true })
    return nextText
  }

  function clearCtrlCExitState(): void {
    state.pendingCtrlCExit = false
    if (state.ctrlCExitTimeout) {
      clearTimeout(state.ctrlCExitTimeout)
      state.ctrlCExitTimeout = null
    }
  }

  async function copyWithStatus(payload: string, _successMessage: string): Promise<void> {
    const result = await copyToClipboard(payload)
    if (!result.ok) {
      state.confirmModal = {
        kind: "remove-draft",
        title: "Clipboard Error",
        message: [result.message],
        confirmLabel: "dismisses this message",
        path: currentPath(state),
      }
      draw()
    }
  }

  handleResize(state, initialRenderer.terminalWidth || process.stdout.columns || 120)
  state.promptPaneTargetRatio = desiredPromptPaneRatio()
  state.promptPaneRatio = state.promptPaneTargetRatio
  openPromptEditor(state, initialRenderer, buildPromptEditorDeps(state, draw, refreshPromptTokenBreakdown, refreshPromptScroll, schedulePromptScrollSync))
  refreshPromptTokenBreakdown(state, draw)
  draw()
  state.startupDrawComplete = true
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
