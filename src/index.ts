import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"

import { RGBA, ScrollBoxRenderable, SyntaxStyle, TextareaRenderable, type Highlight, createCliRenderer, type CliRenderer, type KeyEvent } from "@opentui/core"

import { createSseChatTransport, startDummyChatServer } from "./chat"
import { buildClipboardPayload, clipboardSelection, copyToClipboard, effectivePromptTokenBreakdown, EMPTY_PROMPT_TOKEN_BREAKDOWN } from "./clipboard"
import { loadConceptGraph } from "./model"
import { activeSession, createNamedSession, loadSessions, saveSessions, syncSessionMetadata } from "./session"
import { applySelectionChange, clampCursor, currentNode, currentPath, handleResize, moveCursor, pageSize, scrollMain, visiblePaths } from "./state"
import type { AppState, ChatSession, ConceptNode, CreateConceptDraft, EditorModalState, InspectorKind, KindDefinition, PromptMessage, UiLayoutConfig } from "./types"
import { repaint, renderPromptThreadContent, replaceChildren, scrollListForCursor } from "./view"

const FILE_REFERENCE_TOKEN = /&[^\s&]+/g
const CONCEPT_REFERENCE_TOKEN = /@[a-zA-Z0-9_.-]+/g
const DEBUG_WORKSPACE_TRANSITION = true
const WORKSPACE_DEBUG_LOG_PATH = join(process.cwd(), "workspace-transition-debug.log")
type PromptReferenceToken = { token: string; start: number; end: number }
type ActivePromptSuggestion = { prefix: "@" | "&"; query: string; start: number; end: number; suggestions: string[] }

const DEFAULT_UI_LAYOUT_CONFIG: UiLayoutConfig = {
  collapsedPromptRatio: 0.34,
  conceptsToSessionTransitionCollapsedPromptRatio: 0.34,
  expandedPromptRatio: 0.58,
  conceptsToSessionTransitionExpandedPromptRatio: 0.58,
  promptAnimationEpsilon: 0.015,
  promptAnimationStepMs: 16,
  promptAnimationLerp: 0.28,
  workspaceTransitionStepMs: 16,
  workspaceTransitionDurationMs: 5000,
  workspaceTransitionAcceleration: 1.22,
  workspaceTransitionStaggerDelay: 0.115,
  workspaceTransitionFadeStart: 0.78,
  workspaceTransitionFadeEnd: 0.92,
  viewportHorizontalInset: 4,
  rootPadding: 1,
  interPaneGap: 1,
  minFrameWidth: 40,
  minFrameHeight: 12,
  minPromptPaneWidth: 28,
  minSidebarWidth: 24,
  supportHeight: 22,
  minPreviewHeight: 5,
  minPaneWidth: 8,
  minPaneHeight: 3,
  transitionChipWidth: 8,
  transitionChipHeight: 3,
}

async function appendWorkspaceDebugLog(event: string, payload: Record<string, unknown>): Promise<void> {
  if (!DEBUG_WORKSPACE_TRANSITION) return
  const line = `${JSON.stringify({ ts: new Date().toISOString(), event, ...payload })}\n`
  try {
    await appendFile(WORKSPACE_DEBUG_LOG_PATH, line, "utf8")
  } catch {
  }
}

function parseArgs(argv: string[]): { conceptsPath: string; optionsPath?: string } {
  let conceptsPath: string | null = null
  let optionsPath: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--concepts-path") {
      const value = argv[index + 1]
      if (!value) throw new Error("Missing value for --concepts-path")
      conceptsPath = value
    }
    if (argv[index] === "--options-path") {
      const value = argv[index + 1]
      if (!value) throw new Error("Missing value for --options-path")
      optionsPath = value
    }
  }
  if (!conceptsPath) throw new Error("Expected --concepts-path <path>")
  return { conceptsPath, optionsPath }
}

function emptyCreateDraft(): CreateConceptDraft {
  return { title: "", summary: "" }
}

function sessionModalEntries(state: AppState): ChatSession[] {
  return [...state.sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

function openSessionModal(state: AppState): void {
  const entries = sessionModalEntries(state)
  const activeIndex = Math.max(0, entries.findIndex((session) => session.id === state.activeSessionId))
  if (state.editorModal?.target.kind === "prompt") {
    state.editorModal.renderable.blur()
  }
  state.sessionModal = { selectedIndex: activeIndex }
}

function closeSessionModal(state: AppState): void {
  state.sessionModal = null
  if (state.editorModal?.target.kind === "prompt") {
    state.editorModal.renderable.focus()
  }
}

async function persistSessions(state: AppState): Promise<void> {
  for (const session of state.sessions) {
    syncSessionMetadata(session)
  }
  await saveSessions(state.jsonPath, state.sessions, state.activeSessionId)
}

async function switchToSession(state: AppState, sessionId: string, renderer: CliRenderer, redraw: () => void): Promise<void> {
  const session = state.sessions.find((candidate) => candidate.id === sessionId)
  if (!session) return
  if (state.editorModal?.target.kind === "prompt") {
    syncPromptDraft(state, state.editorModal)
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
  openPromptEditor(state, renderer, redraw)
}

async function createAndSwitchSession(state: AppState, renderer: CliRenderer, redraw: () => void): Promise<void> {
  if (state.editorModal?.target.kind === "prompt") {
    syncPromptDraft(state, state.editorModal)
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
  openPromptEditor(state, renderer, redraw)
}

async function flushActiveSession(state: AppState): Promise<void> {
  if (state.editorModal?.target.kind === "prompt") {
    syncPromptDraft(state, state.editorModal)
  }
  const session = activeSession(state)
  session.lastMode = state.uiMode
  syncSessionMetadata(session)
  await persistSessions(state)
}

function slugifyTitle(title: string): string {
  const normalized = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
  return normalized || "new_concept"
}

function allAliasSuggestions(state: AppState, query: string): string[] {
  const paths = [...state.nodes.keys()].sort((left, right) => left.localeCompare(right))
  const aliases = paths.map((path) => `@${path}`)
  if (!query) {
    return aliases
  }
  const normalized = query.toLowerCase()
  const score = (alias: string): number => {
    const path = alias.slice(1).toLowerCase()
    const lastSegment = path.split(".").at(-1) ?? path
    if (lastSegment === normalized) return 400
    if (lastSegment.startsWith(normalized)) return 300 - lastSegment.indexOf(normalized)
    if (path.startsWith(normalized)) return 220 - path.indexOf(normalized)
    if (path.includes(normalized)) return 120 - path.indexOf(normalized)
    return 0
  }
  return aliases
    .map((alias) => ({ alias, score: score(alias) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.alias.length - right.alias.length || left.alias.localeCompare(right.alias))
    .map((entry) => entry.alias)
}

function allFileSuggestions(state: AppState, query: string): string[] {
  const files = [...new Set([...(state.projectFiles ?? []), ...(state.projectDirectories ?? [])])].sort((left, right) => left.localeCompare(right))
  const references = files.map((path) => `&${path}`)
  if (!query) {
    return references
  }
  const normalized = query.toLowerCase()
  const score = (reference: string): number => {
    const path = reference.slice(1).toLowerCase()
    const lastSegment = path.split("/").filter(Boolean).at(-1) ?? path
    if (lastSegment === normalized) return 500
    if (path === normalized) return 460
    if (lastSegment.startsWith(normalized)) return 360 - lastSegment.indexOf(normalized)
    if (path.startsWith(normalized)) return 280 - path.indexOf(normalized)
    if (path.includes(`/${normalized}`)) return 220 - path.indexOf(`/${normalized}`)
    if (path.includes(normalized)) return 140 - path.indexOf(normalized)
    return 0
  }
  return references
    .map((reference) => ({ reference, score: score(reference) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.reference.length - right.reference.length || left.reference.localeCompare(right.reference))
    .map((entry) => entry.reference)
}

export function visibleAliasSuggestions(state: AppState, aliasSuggestion: NonNullable<EditorModalState["aliasSuggestion"]>): { full: string[]; visible: string[]; selectedAlias: string | null } {
  const full = aliasSuggestion.mode === "resolved"
    ? [`${aliasSuggestion.prefix}${aliasSuggestion.query}`]
    : (aliasSuggestion.prefix === "@" ? allAliasSuggestions(state, aliasSuggestion.query) : allFileSuggestions(state, aliasSuggestion.query))
  const visible = full.slice(aliasSuggestion.visibleStartIndex, aliasSuggestion.visibleStartIndex + maxVisibleAliasSuggestions())
  const selectedAlias = full[aliasSuggestion.selectedIndex] ?? null
  return { full, visible, selectedAlias }
}

function maxVisibleAliasSuggestions(): number {
  const viewportHeight = process.stdout.rows || 24
  return viewportHeight <= 32 ? 3 : 4
}

function editorCursorOffset(editor: EditorModalState): number {
  const cursorOffset = (editor.renderable as TextareaRenderable & { cursorOffset?: number }).cursorOffset
  return typeof cursorOffset === "number" ? cursorOffset : editor.renderable.plainText.length
}

function tokenAtCursor(text: string, cursor: number, pattern: RegExp): PromptReferenceToken | null {
  const matches = [...text.matchAll(pattern)]
  for (const match of matches) {
    const token = match[0]
    const start = match.index ?? 0
    const end = start + token.length
    if (cursor >= start && cursor <= end) {
      return { token, start, end }
    }
  }
  return null
}

function tokenEndingAtCursor(text: string, cursor: number, pattern: RegExp): PromptReferenceToken | null {
  const matches = [...text.matchAll(pattern)]
  for (const match of matches) {
    const token = match[0]
    const start = match.index ?? 0
    const end = start + token.length
    if (cursor === end) {
      return { token, start, end }
    }
  }
  return null
}

function tokenStartingAtCursor(text: string, cursor: number, pattern: RegExp): PromptReferenceToken | null {
  const matches = [...text.matchAll(pattern)]
  for (const match of matches) {
    const token = match[0]
    const start = match.index ?? 0
    const end = start + token.length
    if (cursor === start) {
      return { token, start, end }
    }
  }
  return null
}

function promptAliasStyle(): SyntaxStyle {
  const style = SyntaxStyle.create()
  style.registerStyle("prompt.alias", { fg: RGBA.fromHex("#ebcb8b"), bold: true })
  style.registerStyle("prompt.file", { fg: RGBA.fromHex("#88c0d0"), bold: true })
  return style
}

function applyPromptAliasHighlights(editor: TextareaRenderable): void {
  editor.clearAllHighlights()
  const styleId = editor.syntaxStyle?.getStyleId("prompt.alias")
  if (styleId == null) {
    return
  }
  const fileStyleId = editor.syntaxStyle?.getStyleId("prompt.file")
  const matches = [...editor.plainText.matchAll(CONCEPT_REFERENCE_TOKEN)]
  for (const match of matches) {
    const token = match[0]
    const start = match.index ?? 0
    const highlight: Highlight = { start, end: start + token.length, styleId }
    editor.addHighlightByCharRange(highlight)
  }
  if (fileStyleId == null) {
    return
  }
  for (const match of editor.plainText.matchAll(FILE_REFERENCE_TOKEN)) {
    const token = match[0]
    const start = match.index ?? 0
    const highlight: Highlight = { start, end: start + token.length, styleId: fileStyleId }
    editor.addHighlightByCharRange(highlight)
  }
}

function activeAliasSuggestion(state: AppState, editor: EditorModalState): ActivePromptSuggestion | null {
  if (editor.target.kind !== "prompt") {
    return null
  }
  const text = editor.renderable.plainText
  const cursor = editorCursorOffset(editor)
  const exactAliasToken = tokenAtCursor(text, cursor, CONCEPT_REFERENCE_TOKEN)
  if (exactAliasToken) {
    const exactPath = exactAliasToken.token.slice(1)
    if (state.nodes.has(exactPath)) {
      return { prefix: "@", query: exactPath, start: exactAliasToken.start, end: exactAliasToken.end, suggestions: [exactAliasToken.token] }
    }
  }
  const exactFileToken = tokenAtCursor(text, cursor, FILE_REFERENCE_TOKEN)
  if (exactFileToken) {
    const exactPath = exactFileToken.token.slice(1)
    if ((state.projectFiles ?? []).includes(exactPath) || (state.projectDirectories ?? []).includes(exactPath)) {
      return { prefix: "&", query: exactPath, start: exactFileToken.start, end: exactFileToken.end, suggestions: [exactFileToken.token] }
    }
  }
  const beforeCursor = text.slice(0, cursor)
  const match = beforeCursor.match(/(?:^|\s)([@&]([^\s@&]*))$/)
  if (!match) {
    return null
  }
  const token = match[1]
  const prefix = token[0] as "@" | "&"
  const query = match[2] ?? ""
  const start = cursor - token.length
  const afterCursor = text.slice(cursor)
  const suffixMatch = afterCursor.match(prefix === "@" ? /^([a-zA-Z0-9_.-]*)/ : /^([^\s@&]*)/)
  const end = cursor + (suffixMatch?.[1]?.length ?? 0)
  return { prefix, query, start, end, suggestions: prefix === "@" ? allAliasSuggestions(state, query) : allFileSuggestions(state, query) }
}

function refreshAliasSuggestion(state: AppState): void {
  const editor = state.editorModal
  if (!editor) return
  const next = activeAliasSuggestion(state, editor)
  if (!next || next.suggestions.length === 0) {
    editor.aliasSuggestion = null
    return
  }
  const previousIndex = editor.aliasSuggestion?.selectedIndex ?? 0
  const maxVisibleSuggestions = maxVisibleAliasSuggestions()
  editor.aliasSuggestion = {
    prefix: next.prefix,
    mode: next.suggestions.length === 1 && next.suggestions[0] === `${next.prefix}${next.query}` ? "resolved" : "search",
    query: next.query,
    start: next.start,
    end: next.end,
    selectedIndex: Math.max(0, Math.min(previousIndex, next.suggestions.length - 1)),
    visibleStartIndex: 0,
  }
  const maxStart = Math.max(0, next.suggestions.length - maxVisibleSuggestions)
  editor.aliasSuggestion.visibleStartIndex = Math.max(0, Math.min(editor.aliasSuggestion.selectedIndex - Math.floor(maxVisibleSuggestions / 2), maxStart))
}

function editorVisibleLineCount(text: string): number {
  return Math.max(1, Math.min(6, text.split("\n").length))
}

function refreshEditorModalHeight(state: AppState): boolean {
  const editor = state.editorModal
  if (!editor) return false
  const nextVisibleLineCount = editorVisibleLineCount(editor.renderable.plainText)
  if (editor.visibleLineCount === nextVisibleLineCount) return false
  editor.visibleLineCount = nextVisibleLineCount
  editor.renderable.minHeight = nextVisibleLineCount + 2
  editor.renderable.maxHeight = nextVisibleLineCount + 2
  return true
}

function refreshAliasSuggestionSoon(state: AppState, redraw: () => void): void {
  setTimeout(() => {
    const editor = state.editorModal
    if (!editor) return
    refreshEditorModalHeight(state)
    refreshAliasSuggestion(state)
    redraw()
  }, 0)
}

function moveAliasSuggestionSelection(state: AppState, delta: number): boolean {
  const editor = state.editorModal
  if (!editor?.aliasSuggestion) return false
  const suggestions = editor.aliasSuggestion.prefix === "@"
    ? allAliasSuggestions(state, editor.aliasSuggestion.query)
    : allFileSuggestions(state, editor.aliasSuggestion.query)
  if (suggestions.length === 0) {
    editor.aliasSuggestion = null
    return false
  }
  const previous = editor.aliasSuggestion.selectedIndex
  const suggestionCount = suggestions.length
  const maxVisibleSuggestions = maxVisibleAliasSuggestions()
  editor.aliasSuggestion.selectedIndex = ((previous + delta) % suggestionCount + suggestionCount) % suggestionCount
  if (editor.aliasSuggestion.selectedIndex < editor.aliasSuggestion.visibleStartIndex) {
    editor.aliasSuggestion.visibleStartIndex = editor.aliasSuggestion.selectedIndex
  } else if (editor.aliasSuggestion.selectedIndex >= editor.aliasSuggestion.visibleStartIndex + maxVisibleSuggestions) {
    editor.aliasSuggestion.visibleStartIndex = editor.aliasSuggestion.selectedIndex - maxVisibleSuggestions + 1
  }
  return editor.aliasSuggestion.selectedIndex !== previous
}

function acceptAliasSuggestion(state: AppState): boolean {
  const editor = state.editorModal
  if (!editor?.aliasSuggestion) return false
  const suggestions = editor.aliasSuggestion.prefix === "@"
    ? allAliasSuggestions(state, editor.aliasSuggestion.query)
    : allFileSuggestions(state, editor.aliasSuggestion.query)
  const alias = suggestions[editor.aliasSuggestion.selectedIndex]
  if (!alias) {
    editor.aliasSuggestion = null
    return false
  }
  const text = editor.renderable.plainText
  const suffix = text.slice(editor.aliasSuggestion.end)
  const isDirectoryReference = editor.aliasSuggestion.prefix === "&" && state.projectDirectories.includes(alias.slice(1))
  const trailingText = isDirectoryReference ? "/" : ((suffix.length === 0 || !/^[\s.,;:!?)}\]]/.test(suffix)) ? " " : "")
  const nextText = `${text.slice(0, editor.aliasSuggestion.start)}${alias}${trailingText}${suffix}`
  editor.renderable.setText(nextText)
  editor.renderable.cursorOffset = editor.aliasSuggestion.start + alias.length + trailingText.length
  editor.renderable.focus()
  applyEditorText(state, editor)
  editor.aliasSuggestion = isDirectoryReference ? editor.aliasSuggestion : null
  return true
}

function syncPromptEditorAfterProgrammaticChange(state: AppState, redraw: () => void): void {
  const editor = state.editorModal
  if (!editor || editor.target.kind !== "prompt") return
  applyEditorText(state, editor)
  applyPromptAliasHighlights(editor.renderable)
  refreshEditorModalHeight(state)
  refreshAliasSuggestion(state)
  redraw()
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

function syncPromptDraft(state: AppState, editor: EditorModalState): void {
  if (editor.target.kind !== "prompt") return
  const session = activeSession(state)
  const promptDraftIndex = editor.promptDraftIndex ?? Math.max(0, session.messages.length - 1)
  if (!session.messages[promptDraftIndex]) {
    session.messages[promptDraftIndex] = { text: "", role: "user", status: "complete" }
  }
  session.messages[promptDraftIndex].text = editor.renderable.plainText
  session.draftPromptText = editor.renderable.plainText
  session.lastMode = state.uiMode
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
  openEditor(state, renderer, redraw, { kind: "prompt" }, "", nextMessages.length - 1)
  state.promptScrollTop = Number.MAX_SAFE_INTEGER
  refreshPromptScroll(state)
  schedulePromptScrollSync(state, redraw, "submitPromptMessage")
  refreshPromptTokenBreakdown(state, redraw)
  void streamAssistantResponse(state, redraw)
}

function handlePromptAliasBoundaryKey(state: AppState, key: KeyEvent, redraw: () => void): boolean {
  const editor = state.editorModal
  if (!editor || editor.target.kind !== "prompt") return false
  const renderable = editor.renderable as TextareaRenderable & { cursorOffset: number }
  const text = renderable.plainText
  const cursor = editorCursorOffset(editor)

  if (key.name === "backspace") {
    const token = tokenEndingAtCursor(text, cursor, /[@&][^\s@&]+/g)
    if (!token) return false
    key.preventDefault()
    key.stopPropagation()
    renderable.setText(`${text.slice(0, token.start)}${text.slice(token.end)}`)
    renderable.cursorOffset = token.start
    syncPromptEditorAfterProgrammaticChange(state, redraw)
    return true
  }

  if (key.name === "left") {
    const token = tokenEndingAtCursor(text, cursor, /[@&][^\s@&]+/g)
    if (!token) return false
    key.preventDefault()
    key.stopPropagation()
    renderable.cursorOffset = token.start
    syncPromptEditorAfterProgrammaticChange(state, redraw)
    return true
  }

  if (key.name === "right") {
    const token = tokenStartingAtCursor(text, cursor, /[@&][^\s@&]+/g)
    if (!token) return false
    key.preventDefault()
    key.stopPropagation()
    renderable.cursorOffset = token.end
    syncPromptEditorAfterProgrammaticChange(state, redraw)
    return true
  }

  return false
}

let refreshPromptPaneTarget: () => void = () => {}

function applyEditorText(state: AppState, editor: EditorModalState): void {
  const text = editor.renderable.plainText
  if (editor.target.kind === "prompt") {
    syncPromptDraft(state, editor)
    return
  }
  if (editor.target.path) {
    const node = state.nodes.get(editor.target.path)
    if (node) {
      node.summary = text
    }
  }
}

function togglePromptMode(state: AppState): void {
  state.uiMode = state.uiMode === "plan" ? "build" : state.uiMode === "build" ? "conceptualize" : "plan"
}

function cyclePromptMode(state: AppState, redraw: () => void): void {
  togglePromptMode(state)
  refreshPromptTokenBreakdown(state, redraw)
}

  function openEditor(state: AppState, renderer: CliRenderer, redraw: () => void, target: EditorModalState["target"], initialText: string, promptDraftIndex?: number): void {
  const visibleLineCount = editorVisibleLineCount(initialText)
  const renderable = new TextareaRenderable(renderer, {
    initialValue: initialText,
    width: "100%",
    minHeight: visibleLineCount + 2,
    maxHeight: visibleLineCount + 2,
    paddingX: 1,
    paddingY: 1,
    backgroundColor: "#202930",
    focusedBackgroundColor: "#202930",
    textColor: "#e5e9f0",
    focusedTextColor: "#e5e9f0",
    cursorColor: "#f2cc8f",
    cursorStyle: { style: "block", blinking: true },
    wrapMode: "word",
    showCursor: true,
    keyBindings: [
      { name: "j", ctrl: true, action: "newline" },
      { name: "return", shift: true, action: "newline" },
    ],
    onContentChange: () => {
  if (state.editorModal?.renderable === renderable) {
    applyEditorText(state, state.editorModal)
        if (target.kind === "prompt") {
          refreshPromptTokenBreakdown(state, redraw)
          refreshPromptScroll(state)
          schedulePromptScrollSync(state, redraw, "promptContentChange")
        }
      }
      if (target.kind === "prompt") {
        applyPromptAliasHighlights(renderable)
      }
      if (refreshEditorModalHeight(state)) {
        redraw()
      }
    },
  })
  if (target.kind === "prompt") {
    const session = activeSession(state)
    if (typeof promptDraftIndex === "number") {
      session.messages[promptDraftIndex] = { ...(session.messages[promptDraftIndex] ?? { role: "user", status: "complete" }), text: initialText, role: "user", status: "complete" }
    }
    renderable.syntaxStyle = promptAliasStyle()
    renderable.focus()
    renderable.onCursorChange = () => {
      applyPromptAliasHighlights(renderable)
      refreshAliasSuggestion(state)
      refreshPromptScroll(state)
      schedulePromptScrollSync(state, redraw, "promptCursorChange")
      redraw()
    }
    applyPromptAliasHighlights(renderable)
  }
  renderable.gotoBufferEnd()
  state.editorModal = { target, renderable, aliasSuggestion: null, visibleLineCount, promptDraftIndex }
  refreshAliasSuggestion(state)
  if (target.kind === "prompt") {
    state.conceptNavigationFocused = false
    state.promptPaneMode = "expanded"
    refreshPromptPaneTarget()
    refreshPromptScroll(state)
    schedulePromptScrollSync(state, redraw, "openEditor")
  }
  setTimeout(() => {
    if (state.editorModal?.renderable === renderable) {
      renderable.focus()
      redraw()
    }
  }, 0)
}

function openPromptEditor(state: AppState, renderer: CliRenderer, redraw: () => void): void {
  const session = activeSession(state)
  const promptDraftIndex = Math.max(0, session.messages.length - 1)
  const initialText = session.messages[promptDraftIndex]?.text ?? session.draftPromptText
  openEditor(state, renderer, redraw, { kind: "prompt" }, initialText, promptDraftIndex)
}

function openSummaryEditor(state: AppState, renderer: CliRenderer, redraw: () => void): void {
  const node = currentNode(state)
  openEditor(state, renderer, redraw, { kind: "concept-summary", path: node.path }, node.summary)
}

function openInspector(state: AppState, kind: InspectorKind): void {
  state.inspector = { kind }
}

function closeInspector(state: AppState): void {
  state.inspector = null
}

function uniqueChildPath(state: AppState, parentPath: string, title: string): string {
  const base = slugifyTitle(title)
  let candidate = `${parentPath}.${base}`
  let counter = 2
  while (state.nodes.has(candidate)) {
    candidate = `${parentPath}.${base}_${counter}`
    counter += 1
  }
  return candidate
}

function isDraftConcept(state: AppState, path: string): boolean {
  return Boolean(state.nodes.get(path)?.isDraft)
}

function insertDraftConcept(state: AppState, draft: CreateConceptDraft, kindDefinition: KindDefinition | null): string {
  const parent = state.nodes.get(state.currentParentPath)
  if (!parent) throw new Error("Current parent concept not found")
  const path = uniqueChildPath(state, state.currentParentPath, draft.title)
  const metadata: ConceptNode["metadata"] = kindDefinition?.description ? { kind_description: kindDefinition.description } : {}
  const node: ConceptNode = {
    path,
    title: draft.title.trim(),
    kind: kindDefinition?.kind ?? null,
    summary: draft.summary.trim(),
    parentPath: state.currentParentPath,
    metadata,
    loc: null,
    childPaths: [],
    isDraft: true,
  }
  state.nodes.set(path, node)
  parent.childPaths = [...parent.childPaths, path]
  state.cursor = parent.childPaths.indexOf(path)
  applySelectionChange(state)
  if (kindDefinition && !state.kindDefinitions.some((item) => item.kind === kindDefinition.kind)) {
    state.kindDefinitions = [...state.kindDefinitions, kindDefinition].sort((left, right) => left.kind.localeCompare(right.kind))
  }
  return path
}

function removeDraftConcept(state: AppState, path: string): void {
  const node = state.nodes.get(path)
  if (!node?.isDraft) return
  if (node.parentPath) {
    const parent = state.nodes.get(node.parentPath)
    if (parent) {
      parent.childPaths = parent.childPaths.filter((item) => item !== path)
    }
  }
  state.nodes.delete(path)
  clampCursor(state)
  applySelectionChange(state)
}

async function main(): Promise<void> {
  const { conceptsPath, optionsPath } = parseArgs(process.argv.slice(2))
  const { graphPayload, nodes, kindDefinitions, uiLayoutConfig } = loadConceptGraph(conceptsPath, optionsPath)
  const resolvedUiLayoutConfig: UiLayoutConfig = { ...DEFAULT_UI_LAYOUT_CONFIG, ...uiLayoutConfig }
  const dummyChatServer = await startDummyChatServer()
  const trackedPaths = (await readFile(join(process.cwd(), ".gitignore"), "utf8").catch(() => ""), await Bun.$`git ls-files -co --exclude-standard`.text())
  const projectFiles = trackedPaths.replace(/\r\n/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean)
  const projectDirectories = [...new Set(projectFiles.flatMap((file) => {
    const parts = file.split("/")
    const directories: string[] = []
    for (let index = 1; index < parts.length; index += 1) {
      directories.push(parts.slice(0, index).join("/"))
    }
    return directories
  }))].sort((left, right) => left.localeCompare(right))
  const { sessions, activeSessionId } = await loadSessions(conceptsPath, "plan")
  const state: AppState = {
    jsonPath: conceptsPath,
    graphPayload,
    nodes,
    projectFiles,
    projectDirectories,
    sourceFileCache: new Map(),
    currentParentPath: "root",
    cursor: 0,
    kindDefinitions,
    createConceptModal: null,
    confirmModal: null,
    layoutMode: "wide",
    uiMode: "plan",
    inspector: null,
    mainScrollTop: 0,
    mainViewportHeight: 18,
    contextTitle: "Inspector",
    contextLegendItems: [],
    sessions,
    activeSessionId,
    promptPaneRatio: resolvedUiLayoutConfig.expandedPromptRatio,
    promptPaneTargetRatio: resolvedUiLayoutConfig.expandedPromptRatio,
    promptPaneMode: "expanded",
    uiLayoutConfig: resolvedUiLayoutConfig,
    promptScrollTop: 0,
    promptViewportHeight: 12,
    conceptNavigationFocused: false,
    startupDrawComplete: false,
    editorModal: null,
    sessionModal: null,
    pendingCtrlCExit: false,
    ctrlCExitTimeout: null,
    promptPaneAnimationTimeout: null,
    promptTokenBreakdown: EMPTY_PROMPT_TOKEN_BREAKDOWN,
    chatTransport: createSseChatTransport(dummyChatServer.baseUrl),
    activeResponseId: null,
    activeAssistantMessageId: null,
    lastPromptAutoScrollTop: null,
    activeAssistantNewlineCount: 0,
    workspaceTransition: null,
    workspaceTransitionTimeout: null,
  }
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

  function openCreateConceptModal(): void {
    state.createConceptModal = { draft: emptyCreateDraft(), fieldIndex: 0, kindExpanded: false, kindCursor: 0, kindQuery: "" }
  }

  function closeCreateConceptModal(): void {
    state.createConceptModal = null
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

  function finishWorkspaceTransition(nextFocus: boolean): void {
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
    draw()
  }

  function startWorkspaceTransition(nextFocus: boolean): void {
    if (state.layoutMode !== "wide") {
      finishWorkspaceTransition(nextFocus)
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
      transition.progress = Math.min(1, elapsed / state.uiLayoutConfig.workspaceTransitionDurationMs)
      if (transition.progress >= 1) {
        void appendWorkspaceDebugLog("transition_end", {
          from: transition.from,
          to: transition.to,
          progress: transition.progress,
          elapsed,
          viewportWidth: process.stdout.columns || 120,
          viewportHeight: process.stdout.rows || 36,
        })
        finishWorkspaceTransition(nextFocus)
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
      startWorkspaceTransition(false)
      return
    }
    openPromptEditor(state, renderer, redraw)
  }

  function focusPromptPane(state: AppState, renderer: CliRenderer, redraw: () => void): void {
    if (state.workspaceTransition) return
    if (state.editorModal?.target.kind === "prompt") {
      startWorkspaceTransition(false)
      return
    }
    openPromptEditor(state, renderer, redraw)
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

  function fuzzyKindScore(candidate: string, query: string): number {
    if (!query) return 1
    const normalizedCandidate = candidate.toLowerCase()
    if (normalizedCandidate.includes(query)) return 100 - normalizedCandidate.indexOf(query)
    let queryIndex = 0
    let score = 0
    for (let index = 0; index < normalizedCandidate.length && queryIndex < query.length; index += 1) {
      if (normalizedCandidate[index] === query[queryIndex]) {
        score += 2
        queryIndex += 1
      }
    }
    return queryIndex === query.length ? score : 0
  }

  function createKindOptions(query: string): KindDefinition[] {
    const normalizedQuery = query.trim().toLowerCase()
    const filtered = state.kindDefinitions
      .map((item) => ({ item, score: fuzzyKindScore(item.kind, normalizedQuery) }))
      .filter((entry) => normalizedQuery.length === 0 || entry.score > 0)
      .sort((left, right) => right.score - left.score || left.item.kind.localeCompare(right.item.kind))
      .map((entry) => entry.item)
    const noneOption: KindDefinition = { kind: "None", description: "Create this concept without assigning a kind.", source: "options" }
    return normalizedQuery.length === 0 || fuzzyKindScore(noneOption.kind, normalizedQuery) > 0 ? [noneOption, ...filtered] : filtered
  }

  function exactKindMatch(query: string): KindDefinition | null {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return null
    return state.kindDefinitions.find((item) => item.kind.toLowerCase() === normalizedQuery) ?? null
  }

  function submitCreateConceptModal(): boolean {
    const modal = state.createConceptModal
    if (!modal) return false
    if (!modal.draft.title.trim() || !modal.draft.summary.trim()) {
      state.confirmModal = {
        kind: "remove-draft",
        title: "Missing Fields",
        message: ["Concept name and summary are required"],
        confirmLabel: "dismisses this message",
        path: currentPath(state),
      }
      return true
    }
    const options = createKindOptions(modal.kindQuery)
    const selectedKind = modal.kindExpanded
      ? options.length > 0
        ? options[Math.max(0, Math.min(modal.kindCursor, options.length - 1))]
        : exactKindMatch(modal.kindQuery)
      : exactKindMatch(modal.kindQuery)
    const resolvedKind = selectedKind?.kind === "None" ? null : selectedKind
    const createdPath = insertDraftConcept(state, modal.draft, resolvedKind)
    closeCreateConceptModal()
    clampCursor(state)
    draw()
    return true
  }

  function handleCreateConceptModalKey(key: KeyEvent): boolean {
    const modal = state.createConceptModal
    if (!modal) return false
    if (key.name === "escape" || (key.ctrl && key.name === "q")) {
      closeCreateConceptModal()
      draw()
      return true
    }
    const fieldCount = 3
    const kindFieldSelected = modal.fieldIndex === 1
    if (kindFieldSelected && modal.kindExpanded) {
      const options = createKindOptions(modal.kindQuery)
      modal.kindCursor = Math.min(modal.kindCursor, Math.max(0, options.length - 1))
      if (key.name === "up") {
        modal.kindCursor = Math.max(0, modal.kindCursor - 1)
        draw()
        return true
      }
      if (key.name === "down") {
        modal.kindCursor = Math.min(Math.max(0, options.length - 1), modal.kindCursor + 1)
        draw()
        return true
      }
      if (key.name === "return") {
        modal.kindExpanded = false
        draw()
        return true
      }
      if (key.name === "backspace") {
        modal.kindQuery = modal.kindQuery.slice(0, -1)
        modal.kindCursor = 0
        draw()
        return true
      }
      if (typeof key.sequence === "string" && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        modal.kindQuery += key.sequence
        modal.kindCursor = 0
        draw()
        return true
      }
      return true
    }
    if (key.name === "tab") {
      modal.fieldIndex = (modal.fieldIndex + 1) % fieldCount
      draw()
      return true
    }
    if (key.shift && key.name === "tab") {
      modal.fieldIndex = (modal.fieldIndex + fieldCount - 1) % fieldCount
      draw()
      return true
    }
    if (kindFieldSelected) {
      if (key.name === "return") {
        modal.kindExpanded = true
        modal.kindCursor = 0
        draw()
        return true
      }
      if (key.name === "backspace") {
        modal.kindQuery = ""
        draw()
        return true
      }
      if (typeof key.sequence === "string" && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        modal.kindExpanded = true
        modal.kindQuery += key.sequence
        modal.kindCursor = 0
        draw()
        return true
      }
      return true
    }
    if (key.name === "return") return submitCreateConceptModal()
    if (updateCreateDraftText(key)) {
      draw()
      return true
    }
    return true
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
      await createAndSwitchSession(state, renderer, draw)
      draw()
      return true
    }
    if (key.name === "return") {
      key.preventDefault()
      key.stopPropagation()
      const selected = entries[modal.selectedIndex]
      if (selected) {
        await switchToSession(state, selected.id, renderer, draw)
        draw()
      }
      return true
    }
    return true
  }

  function promptToRemoveDraft(path: string): void {
    state.confirmModal = {
      kind: "remove-draft",
      title: "Remove Draft",
      message: [`Remove draft ${path}?`, "This removes the draft from the current TUI session."],
      confirmLabel: "removes this draft concept",
      path,
    }
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
          await flushActiveSession(state)
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
        handleCreateConceptModalKey(key)
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
          cyclePromptMode(state, draw)
          draw()
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
        await flushActiveSession(state)
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
          promptToRemoveDraft(currentPath(state))
          draw()
        }
        return
      }
      if (key.name === "n") {
        openCreateConceptModal()
        draw()
        return
      }
      if (key.name === "y") {
        const selection = clipboardSelection(state, currentPath(state))
        await copyWithStatus(await buildClipboardPayload(state, currentPath(state)), `Copied context for ${selection.count} reference${selection.count === 1 ? "" : "s"}`)
        return
      }
      if (key.name === "return") {
        openSummaryEditor(state, renderer, draw)
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
  openPromptEditor(state, initialRenderer, draw)
  refreshPromptTokenBreakdown(state, draw)
  draw()
  state.startupDrawComplete = true
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
