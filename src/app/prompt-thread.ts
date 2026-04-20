import { ScrollBoxRenderable, type CliRenderer } from "@opentui/core"

import { effectivePromptTokenBreakdown } from "../clipboard"
import { activeSession, syncSessionMetadata } from "../session"
import { currentPath } from "../state"
import type { AppState, EditorModalState, PromptMessage } from "../types"
import { renderPromptThreadContent, replaceChildren } from "../view"

type PromptThreadDeps = {
  syncPromptDraft: (state: AppState, editor: EditorModalState) => void
  openPromptEditor: (state: AppState, renderer: CliRenderer, redraw: () => void) => void
}

export function createPromptThreadController() {
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
      if (shouldStickToBottom) {
        stopPromptScrollAnimation()
        promptScrollRef.scrollTo({ x: 0, y: Number.MAX_SAFE_INTEGER })
        redraw()
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

  function syncPromptScrollToBottom(state: AppState, redraw: () => void): void {
    if (!promptScrollRef) return
    if (state.promptScrollTop !== Number.MAX_SAFE_INTEGER) return
    const previousTop = promptScrollRef.scrollTop
    promptScrollRef.scrollTo({ x: 0, y: Number.MAX_SAFE_INTEGER })
    const targetTop = promptScrollRef.scrollTop
    if (targetTop <= previousTop) {
      promptScrollRef.scrollTo({ x: 0, y: Number.MAX_SAFE_INTEGER })
      redraw()
      return
    }
    animatePromptScrollTo(state, redraw, targetTop, "streamAssistantComplete")
  }

  function refreshPromptTokenBreakdown(state: AppState, redraw: () => void): void {
    void effectivePromptTokenBreakdown(state, currentPath(state)).then((breakdown) => {
      state.promptTokenBreakdown = breakdown
      refreshPromptScroll(state)
      redraw()
    })
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
        } else {
          schedulePromptScrollSync(state, redraw, "streamAssistantResponse")
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
      refreshPromptScroll(state)
      redraw()
    }
  }

  function submitPromptMessage(state: AppState, renderer: CliRenderer, redraw: () => void, deps: PromptThreadDeps): void {
    const editor = state.editorModal
    if (!editor || editor.target.kind !== "prompt") return
    deps.syncPromptDraft(state, editor)
    const session = activeSession(state)
    const currentDraftIndex = editor.promptDraftIndex ?? Math.max(0, session.messages.length - 1)
    const currentText = session.messages[currentDraftIndex]?.text ?? ""
    if (!currentText.trim()) return
    const userMessageId = `msg_${crypto.randomUUID()}`
    const assistantMessageId = `msg_${crypto.randomUUID()}`
    const draftMessageId = `msg_${crypto.randomUUID()}`
    session.messages[currentDraftIndex] = { id: userMessageId, text: currentText, role: "user", mode: state.uiMode, status: "complete" }
    session.messages = [
      ...session.messages,
      { id: assistantMessageId, text: "", role: "assistant", status: "streaming", provider: "dummy-local" },
      { id: draftMessageId, text: "", role: "user", status: "complete" },
    ]
    session.draftPromptText = ""
    session.lastMode = state.uiMode
    syncSessionMetadata(session)
    state.activeAssistantMessageId = assistantMessageId
    deps.openPromptEditor(state, renderer, redraw)
    state.promptScrollTop = Number.MAX_SAFE_INTEGER
    refreshPromptScroll(state)
    schedulePromptScrollSync(state, redraw, "submitPromptMessage")
    refreshPromptTokenBreakdown(state, redraw)
    void streamAssistantResponse(state, redraw)
  }

  return {
    setPromptScrollRenderable(renderable: ScrollBoxRenderable | null) {
      promptScrollRef = renderable
    },
    refreshPromptTokenBreakdown,
    refreshPromptScroll,
    schedulePromptScrollSync,
    submitPromptMessage,
  }
}
