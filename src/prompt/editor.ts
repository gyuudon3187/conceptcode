import { RGBA, SyntaxStyle, TextareaRenderable, type Highlight, type CliRenderer, type KeyEvent } from "@opentui/core"

import { currentNode } from "../core/state"
import type { AppState, EditorModalState, PromptSuggestionEntry, PromptSuggestionProvider } from "../core/types"
import { featureById } from "../features"
import {
  findAppPromptReferenceAt,
  findAppPromptReferenceEndingAt,
  findAppPromptReferenceStartingAt,
  parseAppPromptReferences,
} from "./references"
import { appPromptSuggestionProvider, allFileSuggestions } from "./provider"
import { activeSession } from "../sessions/store"

export { allFileSuggestions } from "./provider"

type ActivePromptSuggestion = { prefix: "@" | "&" | "/"; query: string; start: number; end: number; suggestions: PromptSuggestionEntry[] }

type PromptSuggestionViewModel = { full: PromptSuggestionEntry[]; visible: PromptSuggestionEntry[]; selectedEntry: PromptSuggestionEntry | null }

function suggestionEntries(provider: PromptSuggestionProvider, suggestion: NonNullable<EditorModalState["promptSuggestion"]>): PromptSuggestionEntry[] {
  return provider.suggestions({ prefix: suggestion.prefix, query: suggestion.query, mode: suggestion.mode })
}

export function visiblePromptSuggestions(provider: PromptSuggestionProvider, suggestion: NonNullable<EditorModalState["promptSuggestion"]>): PromptSuggestionViewModel {
  const full = suggestionEntries(provider, suggestion)
  const visible = full.slice(suggestion.visibleStartIndex, suggestion.visibleStartIndex + maxVisibleAliasSuggestions())
  const selectedEntry = full[suggestion.selectedIndex] ?? null
  return { full, visible, selectedEntry }
}

function maxVisibleAliasSuggestions(): number {
  const viewportHeight = process.stdout.rows || 24
  return viewportHeight <= 32 ? 3 : 4
}

function editorCursorOffset(editor: EditorModalState): number {
  const cursorOffset = (editor.renderable as TextareaRenderable & { cursorOffset?: number }).cursorOffset
  return typeof cursorOffset === "number" ? cursorOffset : editor.renderable.plainText.length
}

function promptAliasStyle(): SyntaxStyle {
  const style = SyntaxStyle.create()
  style.registerStyle("prompt.alias", { fg: RGBA.fromHex("#ebcb8b"), bold: true })
  style.registerStyle("prompt.file", { fg: RGBA.fromHex("#88c0d0"), bold: true })
  style.registerStyle("prompt.slash", { fg: RGBA.fromHex("#a3be8c"), bold: true })
  return style
}

function applyPromptAliasHighlights(editor: TextareaRenderable): void {
  editor.clearAllHighlights()
  const styleId = editor.syntaxStyle?.getStyleId("prompt.alias")
  if (styleId == null) return
  const fileStyleId = editor.syntaxStyle?.getStyleId("prompt.file")
  const slashStyleId = editor.syntaxStyle?.getStyleId("prompt.slash")
  for (const match of parseAppPromptReferences(editor.plainText)) {
    const activeStyleId = match.symbol === "@" ? styleId : match.symbol === "&" ? fileStyleId : slashStyleId
    if (activeStyleId == null) continue
    const highlight: Highlight = { start: match.start, end: match.end, styleId: activeStyleId }
    editor.addHighlightByCharRange(highlight)
  }
}

function activePromptSuggestion(state: AppState, editor: EditorModalState, provider: PromptSuggestionProvider): ActivePromptSuggestion | null {
  if (editor.target.kind !== "prompt") return null
  const text = editor.renderable.plainText
  const cursor = editorCursorOffset(editor)
  const exactToken = findAppPromptReferenceAt(text, cursor)
  if (exactToken && (exactToken.symbol === "@" || exactToken.symbol === "&" || exactToken.symbol === "/")) {
    const prefix = exactToken.symbol
    const suggestions = provider.suggestions({ prefix, query: exactToken.value, mode: "resolved" })
    const resolvedValue = exactToken.raw
    const isResolved = provider.isResolvedValue?.({ prefix, query: exactToken.value, value: resolvedValue }) ?? resolvedValue === `${prefix}${exactToken.value}`
    if (isResolved && suggestions.length > 0) {
      return { prefix, query: exactToken.value, start: exactToken.start, end: exactToken.end, suggestions }
    }
  }
  const beforeCursor = text.slice(0, cursor)
  const fileMatch = beforeCursor.match(/(?:^|\s)(&([^\s@&]*))$/)
  if (fileMatch) {
    const token = fileMatch[1]
    const query = fileMatch[2] ?? ""
    const start = cursor - token.length
    const afterCursor = text.slice(cursor)
    const suffixMatch = afterCursor.match(/^([^\s@&]*)/)
    const end = cursor + (suffixMatch?.[1]?.length ?? 0)
    return {
      prefix: "&",
      query,
      start,
      end,
      suggestions: allFileSuggestions(state, query).map((value) => ({ value })),
    }
  }
  const match = beforeCursor.match(/(?:^|\s)([@/]([^\s@&/]*))$/)
  if (!match) return null
  const token = match[1]
  const prefix = token[0] as "@" | "/"
  const query = match[2] ?? ""
  const start = cursor - token.length
  const afterCursor = text.slice(cursor)
  const suffixMatch = afterCursor.match(prefix === "@" ? /^([a-zA-Z0-9_.-]*)/ : /^([^\s@&/]*)/)
  const end = cursor + (suffixMatch?.[1]?.length ?? 0)
  return {
    prefix,
    query,
    start,
    end,
    suggestions: provider.suggestions({ prefix, query, mode: "search" }),
  }
}

export function refreshPromptSuggestion(state: AppState, provider: PromptSuggestionProvider = appPromptSuggestionProvider(state)): void {
  const editor = state.editorModal
  if (!editor) return
  const next = activePromptSuggestion(state, editor, provider)
  const suggestionList = next ? provider.suggestions({ prefix: next.prefix, query: next.query, mode: "search" }) : []
  if (!next || suggestionList.length === 0) {
    editor.promptSuggestion = null
    return
  }
  const previousIndex = editor.promptSuggestion?.selectedIndex ?? 0
  const maxVisibleSuggestions = maxVisibleAliasSuggestions()
  const resolvedValue = `${next.prefix}${next.query}`
  const isResolvedValue = provider.isResolvedValue?.({ prefix: next.prefix, query: next.query, value: resolvedValue }) ?? resolvedValue === `${next.prefix}${next.query}`
  editor.promptSuggestion = {
    prefix: next.prefix,
    mode: suggestionList.length === 1 && isResolvedValue ? "resolved" : "search",
    query: next.query,
    start: next.start,
    end: next.end,
    selectedIndex: Math.max(0, Math.min(previousIndex, suggestionList.length - 1)),
    visibleStartIndex: 0,
  }
  const maxStart = Math.max(0, suggestionList.length - maxVisibleSuggestions)
  editor.promptSuggestion.visibleStartIndex = Math.max(0, Math.min(editor.promptSuggestion.selectedIndex - Math.floor(maxVisibleSuggestions / 2), maxStart))
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

export function refreshPromptSuggestionSoon(state: AppState, redraw: () => void, provider: PromptSuggestionProvider = appPromptSuggestionProvider(state)): void {
  setTimeout(() => {
    const editor = state.editorModal
    if (!editor) return
    refreshEditorModalHeight(state)
    refreshPromptSuggestion(state, provider)
    redraw()
  }, 0)
}

export function movePromptSuggestionSelection(state: AppState, delta: number, provider: PromptSuggestionProvider = appPromptSuggestionProvider(state)): boolean {
  const editor = state.editorModal
  if (!editor?.promptSuggestion) return false
  const suggestions = suggestionEntries(provider, editor.promptSuggestion)
  if (suggestions.length === 0) {
    editor.promptSuggestion = null
    return false
  }
  const previous = editor.promptSuggestion.selectedIndex
  const suggestionCount = suggestions.length
  const maxVisibleSuggestions = maxVisibleAliasSuggestions()
  editor.promptSuggestion.selectedIndex = ((previous + delta) % suggestionCount + suggestionCount) % suggestionCount
  if (editor.promptSuggestion.selectedIndex < editor.promptSuggestion.visibleStartIndex) {
    editor.promptSuggestion.visibleStartIndex = editor.promptSuggestion.selectedIndex
  } else if (editor.promptSuggestion.selectedIndex >= editor.promptSuggestion.visibleStartIndex + maxVisibleSuggestions) {
    editor.promptSuggestion.visibleStartIndex = editor.promptSuggestion.selectedIndex - maxVisibleSuggestions + 1
  }
  return editor.promptSuggestion.selectedIndex !== previous
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
  if (editor.target.kind === "feature-buffer") {
    if (editor.target.featureId) {
      const handled = featureById(editor.target.featureId)?.applyEditorText?.(state, editor) ?? false
      if (handled) return
    }
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
  refreshPromptSuggestion(state)
  deps.redraw()
}

export function acceptPromptSuggestion(state: AppState, provider: PromptSuggestionProvider = appPromptSuggestionProvider(state)): boolean {
  const editor = state.editorModal
  if (!editor?.promptSuggestion) return false
  const suggestions = suggestionEntries(provider, editor.promptSuggestion)
  const selectedEntry = suggestions[editor.promptSuggestion.selectedIndex]
  const value = selectedEntry?.value
  if (!selectedEntry || !value) {
    editor.promptSuggestion = null
    return false
  }
  const text = editor.renderable.plainText
  const suffix = text.slice(editor.promptSuggestion.end)
  const trailingText = provider.acceptTrailingText?.({ prefix: editor.promptSuggestion.prefix, value, suffix }) ?? (suffix.length === 0 || !/^[\s.,;:!?)}\]]/.test(suffix) ? " " : "")
  const keepSuggestionOpen = editor.promptSuggestion.prefix === "&" && trailingText === "/"
  const nextText = `${text.slice(0, editor.promptSuggestion.start)}${value}${trailingText}${suffix}`
  editor.renderable.setText(nextText)
  editor.renderable.cursorOffset = editor.promptSuggestion.start + value.length + trailingText.length
  editor.renderable.focus()
  applyEditorText(state, editor)
  if (keepSuggestionOpen) {
    refreshPromptSuggestion(state, provider)
  } else {
    editor.promptSuggestion = null
  }
  return true
}

export function handlePromptAliasBoundaryKey(state: AppState, key: KeyEvent, redraw: () => void): boolean {
  const editor = state.editorModal
  if (!editor || editor.target.kind !== "prompt") return false
  const renderable = editor.renderable as TextareaRenderable & { cursorOffset: number }
  const text = renderable.plainText
  const cursor = editorCursorOffset(editor)

  if (key.name === "backspace") {
    const token = findAppPromptReferenceEndingAt(text, cursor)
    if (!token || token.kind === "slash") return false
    key.preventDefault()
    key.stopPropagation()
    renderable.setText(`${text.slice(0, token.start)}${text.slice(token.end)}`)
    renderable.cursorOffset = token.start
    syncPromptEditorAfterProgrammaticChange(state, { redraw })
    return true
  }

  if (key.name === "left") {
    const token = findAppPromptReferenceEndingAt(text, cursor)
    if (!token || token.kind === "slash") return false
    key.preventDefault()
    key.stopPropagation()
    renderable.cursorOffset = token.start
    syncPromptEditorAfterProgrammaticChange(state, { redraw })
    return true
  }

  if (key.name === "right") {
    const token = findAppPromptReferenceStartingAt(text, cursor)
    if (!token || token.kind === "slash") return false
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
      refreshPromptSuggestion(state)
      deps.refreshPromptScroll()
      deps.schedulePromptScrollSync("promptCursorChange")
      deps.redraw()
    }
    applyPromptAliasHighlights(renderable)
  }
  renderable.gotoBufferEnd()
  state.editorModal = { target, renderable, promptSuggestion: null, visibleLineCount, promptDraftIndex }
  refreshPromptSuggestion(state)
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
