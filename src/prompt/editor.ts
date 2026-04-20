import { RGBA, SyntaxStyle, TextareaRenderable, type Highlight, type CliRenderer, type KeyEvent } from "@opentui/core"

import { currentNode } from "../core/state"
import type { AppState, EditorModalState } from "../core/types"
import { activeSession } from "../session"

const FILE_REFERENCE_TOKEN = /&[^\s&]+/g
const CONCEPT_REFERENCE_TOKEN = /@[a-zA-Z0-9_.-]+/g

type PromptReferenceToken = { token: string; start: number; end: number }
type ActivePromptSuggestion = { prefix: "@" | "&"; query: string; start: number; end: number; suggestions: string[] }

function allAliasSuggestions(state: AppState, query: string): string[] {
  const paths = [...state.nodes.keys()].sort((left, right) => left.localeCompare(right))
  const aliases = paths.map((path) => `@${path}`)
  if (!query) return aliases
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
  if (!query) return references
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
    if (cursor >= start && cursor <= end) return { token, start, end }
  }
  return null
}

function tokenEndingAtCursor(text: string, cursor: number, pattern: RegExp): PromptReferenceToken | null {
  const matches = [...text.matchAll(pattern)]
  for (const match of matches) {
    const token = match[0]
    const start = match.index ?? 0
    const end = start + token.length
    if (cursor === end) return { token, start, end }
  }
  return null
}

function tokenStartingAtCursor(text: string, cursor: number, pattern: RegExp): PromptReferenceToken | null {
  const matches = [...text.matchAll(pattern)]
  for (const match of matches) {
    const token = match[0]
    const start = match.index ?? 0
    const end = start + token.length
    if (cursor === start) return { token, start, end }
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
  if (styleId == null) return
  const fileStyleId = editor.syntaxStyle?.getStyleId("prompt.file")
  for (const match of editor.plainText.matchAll(CONCEPT_REFERENCE_TOKEN)) {
    const token = match[0]
    const start = match.index ?? 0
    const highlight: Highlight = { start, end: start + token.length, styleId }
    editor.addHighlightByCharRange(highlight)
  }
  if (fileStyleId == null) return
  for (const match of editor.plainText.matchAll(FILE_REFERENCE_TOKEN)) {
    const token = match[0]
    const start = match.index ?? 0
    const highlight: Highlight = { start, end: start + token.length, styleId: fileStyleId }
    editor.addHighlightByCharRange(highlight)
  }
}

function activeAliasSuggestion(state: AppState, editor: EditorModalState): ActivePromptSuggestion | null {
  if (editor.target.kind !== "prompt") return null
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
  if (!match) return null
  const token = match[1]
  const prefix = token[0] as "@" | "&"
  const query = match[2] ?? ""
  const start = cursor - token.length
  const afterCursor = text.slice(cursor)
  const suffixMatch = afterCursor.match(prefix === "@" ? /^([a-zA-Z0-9_.-]*)/ : /^([^\s@&]*)/)
  const end = cursor + (suffixMatch?.[1]?.length ?? 0)
  return { prefix, query, start, end, suggestions: prefix === "@" ? allAliasSuggestions(state, query) : allFileSuggestions(state, query) }
}

export function refreshAliasSuggestion(state: AppState): void {
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

export function refreshEditorModalHeight(state: AppState): boolean {
  const editor = state.editorModal
  if (!editor) return false
  const nextVisibleLineCount = editorVisibleLineCount(editor.renderable.plainText)
  if (editor.visibleLineCount === nextVisibleLineCount) return false
  editor.visibleLineCount = nextVisibleLineCount
  editor.renderable.minHeight = nextVisibleLineCount + 2
  editor.renderable.maxHeight = nextVisibleLineCount + 2
  return true
}

type PromptEditorDeps = {
  redraw: () => void
  refreshPromptTokenBreakdown: () => void
  refreshPromptScroll: () => void
  schedulePromptScrollSync: (reason: string) => void
  refreshPromptPaneTarget: () => void
}

export function refreshAliasSuggestionSoon(state: AppState, redraw: () => void): void {
  setTimeout(() => {
    const editor = state.editorModal
    if (!editor) return
    refreshEditorModalHeight(state)
    refreshAliasSuggestion(state)
    redraw()
  }, 0)
}

export function moveAliasSuggestionSelection(state: AppState, delta: number): boolean {
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

export function syncPromptDraft(state: AppState, editor: EditorModalState): void {
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

export function applyEditorText(state: AppState, editor: EditorModalState): void {
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

function syncPromptEditorAfterProgrammaticChange(state: AppState, deps: Pick<PromptEditorDeps, "redraw">): void {
  const editor = state.editorModal
  if (!editor || editor.target.kind !== "prompt") return
  applyEditorText(state, editor)
  applyPromptAliasHighlights(editor.renderable)
  refreshEditorModalHeight(state)
  refreshAliasSuggestion(state)
  deps.redraw()
}

export function acceptAliasSuggestion(state: AppState): boolean {
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

export function handlePromptAliasBoundaryKey(state: AppState, key: KeyEvent, redraw: () => void): boolean {
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
    syncPromptEditorAfterProgrammaticChange(state, { redraw })
    return true
  }

  if (key.name === "left") {
    const token = tokenEndingAtCursor(text, cursor, /[@&][^\s@&]+/g)
    if (!token) return false
    key.preventDefault()
    key.stopPropagation()
    renderable.cursorOffset = token.start
    syncPromptEditorAfterProgrammaticChange(state, { redraw })
    return true
  }

  if (key.name === "right") {
    const token = tokenStartingAtCursor(text, cursor, /[@&][^\s@&]+/g)
    if (!token) return false
    key.preventDefault()
    key.stopPropagation()
    renderable.cursorOffset = token.end
    syncPromptEditorAfterProgrammaticChange(state, { redraw })
    return true
  }

  return false
}

function togglePromptMode(state: AppState): void {
  state.uiMode = state.uiMode === "plan" ? "build" : state.uiMode === "build" ? "conceptualize" : "plan"
}

export function cyclePromptMode(state: AppState, redraw: () => void, refreshPromptTokenBreakdown: () => void): void {
  togglePromptMode(state)
  refreshPromptTokenBreakdown()
  redraw()
}

export function openEditor(
  state: AppState,
  renderer: CliRenderer,
  target: EditorModalState["target"],
  initialText: string,
  deps: PromptEditorDeps,
  promptDraftIndex?: number,
): void {
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
          deps.refreshPromptTokenBreakdown()
          deps.refreshPromptScroll()
          deps.schedulePromptScrollSync("promptContentChange")
        }
      }
      if (target.kind === "prompt") {
        applyPromptAliasHighlights(renderable)
      }
      if (refreshEditorModalHeight(state)) {
        deps.redraw()
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
      deps.refreshPromptScroll()
      deps.schedulePromptScrollSync("promptCursorChange")
      deps.redraw()
    }
    applyPromptAliasHighlights(renderable)
  }
  renderable.gotoBufferEnd()
  state.editorModal = { target, renderable, aliasSuggestion: null, visibleLineCount, promptDraftIndex }
  refreshAliasSuggestion(state)
  if (target.kind === "prompt") {
    state.conceptNavigationFocused = false
    state.promptPaneMode = "expanded"
    deps.refreshPromptPaneTarget()
    deps.refreshPromptScroll()
    deps.schedulePromptScrollSync("openEditor")
  }
  setTimeout(() => {
    if (state.editorModal?.renderable === renderable) {
      renderable.focus()
      deps.redraw()
    }
  }, 0)
}

export function openPromptEditor(state: AppState, renderer: CliRenderer, deps: PromptEditorDeps): void {
  const session = activeSession(state)
  const promptDraftIndex = Math.max(0, session.messages.length - 1)
  const initialText = session.messages[promptDraftIndex]?.text ?? session.draftPromptText
  openEditor(state, renderer, { kind: "prompt" }, initialText, deps, promptDraftIndex)
}

export function openSummaryEditor(state: AppState, renderer: CliRenderer, deps: PromptEditorDeps): void {
  const node = currentNode(state)
  openEditor(state, renderer, { kind: "concept-summary", path: node.path }, node.summary, deps)
}
