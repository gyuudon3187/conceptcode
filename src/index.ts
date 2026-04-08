import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"

import { ScrollBoxRenderable, TextareaRenderable, createCliRenderer, type CliRenderer, type KeyEvent } from "@opentui/core"

import { buildClipboardPayload, clipboardSelection, copyToClipboard } from "./clipboard"
import { loadConceptGraph } from "./model"
import { applySelectionChange, bufferedConceptForPath, bufferModalItems, clampBufferModalState, clampCursor, currentNode, currentPath, handleResize, moveBufferModalCursor, moveCursor, pageSize, rebuildConceptAliases, resetBufferModal, scrollMain, selectedBufferModalTarget, setStatus, visiblePaths } from "./state"
import type { AppState, ConceptNode, CreateConceptDraft, EditorModalState, KindDefinition } from "./types"
import { repaint, renderFrame, renderStatusPane, replaceChildren, scrollListForCursor } from "./view"

const DEBUG_STATUS = process.env.SETSUMEI_DEBUG_STATUS === "1"

function debugStatus(event: string, details: Record<string, unknown>): void {
  if (!DEBUG_STATUS) {
    return
  }
  console.error(`[setsumei-debug] ${event} ${JSON.stringify(details)}`)
}

function parseArgs(argv: string[]): { conceptsPath: string; optionsPath?: string } {
  let conceptsPath: string | null = null
  let optionsPath: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--concepts-path") {
      const value = argv[index + 1]
      if (!value) {
        throw new Error("Missing value for --concepts-path")
      }
      conceptsPath = value
    }
    if (argv[index] === "--options-path") {
      const value = argv[index + 1]
      if (!value) {
        throw new Error("Missing value for --options-path")
      }
      optionsPath = value
    }
  }
  if (!conceptsPath) {
    throw new Error("Expected --concepts-path <path>")
  }
  return { conceptsPath, optionsPath }
}

function emptyCreateDraft(): CreateConceptDraft {
  return {
    title: "",
    summary: "",
  }
}

function slugifyTitle(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return normalized || "new_concept"
}

function aliasSuggestions(state: AppState, query: string): string[] {
  const aliases = Object.keys(state.aliasPaths).sort((left, right) => left.localeCompare(right))
  if (!query) {
    return aliases
  }
  const normalizedQuery = query.toLowerCase()
  const prefixMatches = aliases.filter((alias) => alias.slice(1).toLowerCase().startsWith(normalizedQuery))
  const substringMatches = aliases.filter((alias) => !prefixMatches.includes(alias) && alias.slice(1).toLowerCase().includes(normalizedQuery))
  return [...prefixMatches, ...substringMatches]
}

function maxVisibleAliasSuggestions(): number {
  const viewportHeight = process.stdout.rows || 24
  return viewportHeight <= 32 ? 3 : 4
}

function editorCursorOffset(editor: EditorModalState): number {
  const cursorOffset = (editor.renderable as TextareaRenderable & { cursorOffset?: number }).cursorOffset
  return typeof cursorOffset === "number" ? cursorOffset : editor.renderable.plainText.length
}

function activeAliasSuggestion(state: AppState, editor: EditorModalState): { query: string; start: number; end: number; suggestions: string[] } | null {
  const text = editor.renderable.plainText
  const cursor = editorCursorOffset(editor)
  const beforeCursor = text.slice(0, cursor)
  const match = beforeCursor.match(/(?:^|\s)(@([a-zA-Z0-9_.-]*))$/)
  if (!match) {
    return null
  }
  const token = match[1]
  const query = match[2] ?? ""
  const start = cursor - token.length
  const afterCursor = text.slice(cursor)
  const suffixMatch = afterCursor.match(/^([a-zA-Z0-9_.-]*)/)
  const end = cursor + (suffixMatch?.[1]?.length ?? 0)
  return {
    query,
    start,
    end,
    suggestions: aliasSuggestions(state, query),
  }
}

function refreshAliasSuggestion(state: AppState): void {
  const editor = state.editorModal
  const maxVisibleSuggestions = maxVisibleAliasSuggestions()
  if (!editor) {
    return
  }
  const next = activeAliasSuggestion(state, editor)
  if (!next || next.suggestions.length === 0) {
    editor.aliasSuggestion = null
    return
  }
  const previousIndex = editor.aliasSuggestion?.selectedIndex ?? 0
  editor.aliasSuggestion = {
    query: next.query,
    start: next.start,
    end: next.end,
    selectedIndex: Math.max(0, Math.min(previousIndex, next.suggestions.length - 1)),
    visibleStartIndex: 0,
  }
  const maxStart = Math.max(0, next.suggestions.length - maxVisibleSuggestions)
  editor.aliasSuggestion.visibleStartIndex = Math.max(
    0,
    Math.min(editor.aliasSuggestion.selectedIndex - Math.floor(maxVisibleSuggestions / 2), maxStart),
  )
}

function editorVisibleLineCount(text: string): number {
  const lineCount = text.split("\n").length
  return Math.max(1, Math.min(4, lineCount))
}

function refreshEditorModalHeight(state: AppState): boolean {
  const editor = state.editorModal
  if (!editor) {
    return false
  }
  const nextVisibleLineCount = editorVisibleLineCount(editor.renderable.plainText)
  if (editor.visibleLineCount === nextVisibleLineCount) {
    return false
  }
  editor.visibleLineCount = nextVisibleLineCount
  editor.renderable.minHeight = nextVisibleLineCount + 2
  editor.renderable.maxHeight = nextVisibleLineCount + 2
  return true
}

function refreshAliasSuggestionSoon(state: AppState, redraw: () => void): void {
  setTimeout(() => {
    const editor = state.editorModal
    if (!editor) {
      return
    }
    try {
      editor.renderable.plainText
    } catch {
      return
    }
    refreshEditorModalHeight(state)
    refreshAliasSuggestion(state)
    redraw()
  }, 0)
}

function moveAliasSuggestionSelection(state: AppState, delta: number): boolean {
  const editor = state.editorModal
  const maxVisibleSuggestions = maxVisibleAliasSuggestions()
  if (!editor?.aliasSuggestion) {
    return false
  }
  const suggestions = aliasSuggestions(state, editor.aliasSuggestion.query)
  if (suggestions.length === 0) {
    editor.aliasSuggestion = null
    return false
  }
  const previous = editor.aliasSuggestion.selectedIndex
  const suggestionCount = suggestions.length
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
  if (!editor?.aliasSuggestion) {
    return false
  }
  const suggestions = aliasSuggestions(state, editor.aliasSuggestion.query)
  const alias = suggestions[editor.aliasSuggestion.selectedIndex]
  if (!alias) {
    editor.aliasSuggestion = null
    return false
  }
  const text = editor.renderable.plainText
  const suffix = text.slice(editor.aliasSuggestion.end)
  const needsTrailingSpace = suffix.length === 0 || !/^[\s.,;:!?)}\]]/.test(suffix)
  const nextText = `${text.slice(0, editor.aliasSuggestion.start)}${alias}${needsTrailingSpace ? " " : ""}${suffix}`
  editor.renderable.setText(nextText)
  editor.renderable.gotoBufferEnd()
  editor.renderable.focus()
  applyEditorText(state, editor)
  editor.aliasSuggestion = null
  return true
}

function applyEditorText(state: AppState, editor: EditorModalState): void {
  const text = editor.renderable.plainText
  if (editor.target.kind === "prompt") {
    state.promptText = text
    return
  }
  if (editor.target.path) {
    state.conceptNotes[editor.target.path] = text
  }
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
  if (!parent) {
    throw new Error("Current parent concept not found")
  }
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
  if (!state.bufferedConcepts.some((item) => item.path === path)) {
    state.bufferedConcepts = [...state.bufferedConcepts, { path }]
  }
  return path
}

function removeDraftConcept(state: AppState, path: string): void {
  const node = state.nodes.get(path)
  if (!node?.isDraft) {
    return
  }
  if (node.parentPath) {
    const parent = state.nodes.get(node.parentPath)
    if (parent) {
      parent.childPaths = parent.childPaths.filter((item) => item !== path)
    }
  }
  state.nodes.delete(path)
  state.bufferedConcepts = state.bufferedConcepts.filter((item) => item.path !== path)
  delete state.conceptNotes[path]
  clampCursor(state)
  applySelectionChange(state)
}

async function main(): Promise<void> {
  const { conceptsPath, optionsPath } = parseArgs(process.argv.slice(2))
  const { graphPayload, nodes, kindDefinitions } = loadConceptGraph(conceptsPath, optionsPath)
  const state: AppState = {
    jsonPath: conceptsPath,
    graphPayload,
    nodes,
    sourceFileCache: new Map(),
    currentParentPath: "root",
    cursor: 0,
    bufferedConcepts: [],
    kindDefinitions,
    createConceptModal: null,
      confirmModal: null,
      status: {
      message: "Browse concepts. n adds a draft. Space toggles selection. y copies context.",
      tone: "info",
    },
    layoutMode: "wide",
    mainScrollTop: 0,
    mainViewportHeight: 18,
    contextTitle: "Context",
    contextLegendItems: [],
    showBufferModal: false,
    bufferModal: {
      focus: "prompt",
      conceptCursor: 0,
    },
    promptText: "",
    conceptNotes: {},
    conceptAliases: {},
    aliasPaths: {},
    editorModal: null,
    pendingCtrlCExit: false,
    ctrlCExitTimeout: null,
    preserveStatusAboveModal: false,
    statusTimeout: null,
    statusVersion: 0,
  }

  let renderer: CliRenderer
  let listScroll: ScrollBoxRenderable
  let mainScroll: ScrollBoxRenderable

  rebuildConceptAliases(state)

  function mountRenderer(nextRenderer: CliRenderer): void {
    renderer = nextRenderer
    listScroll = new ScrollBoxRenderable(renderer, {
      width: "100%",
      height: "100%",
      viewportCulling: false,
      scrollbarOptions: { showArrows: true },
    })
    mainScroll = new ScrollBoxRenderable(renderer, {
      width: "100%",
      height: "100%",
      viewportCulling: false,
      scrollbarOptions: { showArrows: true },
    })
    renderer.on("resize", (width) => {
      handleResize(state, width)
      draw()
    })
  }

  function openCreateConceptModal(): void {
    state.createConceptModal = {
      draft: emptyCreateDraft(),
      fieldIndex: 0,
      kindExpanded: false,
      kindCursor: 0,
      kindQuery: "",
    }
  }

  function closeCreateConceptModal(): void {
    state.createConceptModal = null
  }

  function closeConfirmModal(): void {
    state.confirmModal = null
  }

  function updateCreateDraftText(key: KeyEvent): boolean {
    const modal = state.createConceptModal
    if (!modal) {
      return false
    }
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
    if (!query) {
      return 1
    }
    const normalizedCandidate = candidate.toLowerCase()
    if (normalizedCandidate.includes(query)) {
      return 100 - normalizedCandidate.indexOf(query)
    }
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
    if (!normalizedQuery) {
      return null
    }
    return state.kindDefinitions.find((item) => item.kind.toLowerCase() === normalizedQuery) ?? null
  }

  function submitCreateConceptModal(): boolean {
    const modal = state.createConceptModal
    if (!modal) {
      return false
    }
    if (!modal.draft.title.trim() || !modal.draft.summary.trim()) {
      setTimedStatus("Concept name and summary are required", "warning")
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
    setStatusNow(resolvedKind ? `Added draft concept: ${createdPath}` : `Added draft concept without kind: ${createdPath}`, "success")
    draw()
    return true
  }

  function handleCreateConceptModalKey(key: KeyEvent): boolean {
    const modal = state.createConceptModal
    if (!modal) {
      return false
    }
    if (key.name === "escape" || (key.ctrl && key.name === "q")) {
      closeCreateConceptModal()
      setStatusNow(defaultStatusMessage(), state.bufferedConcepts.length > 0 ? "success" : "info")
      draw()
      return true
    }
    const fieldCount = 3
    const kindFieldSelected = modal.fieldIndex === 1
    if (kindFieldSelected && modal.kindExpanded) {
      const options = createKindOptions(modal.kindQuery)
      modal.kindCursor = Math.min(modal.kindCursor, Math.max(0, options.length - 1))
      if (key.name === "escape") {
        modal.kindExpanded = false
        draw()
        return true
      }
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
      if (key.name === "space") {
        modal.kindQuery += " "
        modal.kindCursor = 0
        draw()
        return true
      }
      if (typeof key.sequence === "string" && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        const code = key.sequence.charCodeAt(0)
        if (code >= 32 && code <= 126) {
          modal.kindQuery += key.sequence
          modal.kindCursor = 0
          draw()
          return true
        }
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
        const code = key.sequence.charCodeAt(0)
        if (code >= 32 && code <= 126) {
          modal.kindExpanded = true
          modal.kindQuery += key.sequence
          modal.kindCursor = 0
          draw()
          return true
        }
      }
      return true
    }
    if (key.name === "return") {
      return submitCreateConceptModal()
    }
    if (updateCreateDraftText(key)) {
      draw()
      return true
    }
    return true
  }

  function handleConfirmModalKey(key: KeyEvent): boolean {
    const modal = state.confirmModal
    if (!modal) {
      return false
    }
    if (key.name === "escape" || (key.ctrl && key.name === "q")) {
      closeConfirmModal()
      draw()
      return true
    }
    if (key.name === "return") {
      removeDraftConcept(state, modal.path)
      closeConfirmModal()
      setStatusNow("Removed draft", "info")
      draw()
      return true
    }
    return true
  }

  function promptToRemoveDraft(path: string): void {
    state.confirmModal = {
      kind: "remove-draft",
      title: "Remove Draft",
      message: [
        `Remove draft ${path}?`,
        "This removes the draft from the current TUI session.",
      ],
      confirmLabel: "removes this draft concept",
      path,
    }
  }

  function setConceptBuffered(path: string): void {
    const existing = bufferedConceptForPath(state, path)
    if (existing) {
      state.bufferedConcepts = state.bufferedConcepts.filter((item) => item.path !== path)
      clearStatusTimeout()
      debugStatus("buffer-remove", { path, bufferedConcepts: state.bufferedConcepts, currentPath: currentPath(state) })
      setStatusNow(state.bufferedConcepts.length === 0 ? "Selection cleared" : bufferStatusMessage(), state.bufferedConcepts.length === 0 ? "info" : "success")
    } else {
      state.bufferedConcepts = [...state.bufferedConcepts, { path }]
      clearStatusTimeout()
      debugStatus("buffer-add", { path, bufferedConcepts: state.bufferedConcepts, currentPath: currentPath(state) })
      setStatusNow(bufferStatusMessage(), "success")
    }
    clampBufferModalState(state)
  }

  function bindKeyHandler(): void {
    renderer.keyInput.on("keypress", async (key: KeyEvent) => {
      if (key.ctrl && key.name === "c") {
        key.preventDefault()
        key.stopPropagation()
        if (state.editorModal) {
          if (state.editorModal.renderable.plainText.length > 0) {
            state.editorModal.renderable.setText("")
            state.editorModal.renderable.focus()
            applyEditorText(state, state.editorModal)
            refreshAliasSuggestion(state)
            refreshEditorModalHeight(state)
            clearCtrlCExitState()
            draw()
            return
          }
        }
        if (state.pendingCtrlCExit) {
          renderer.destroy()
          process.exit(0)
        }
        armCtrlCExit()
        draw()
        return
      }
      clearCtrlCExitStateIfNeeded()
      const visible = visiblePaths(state)
      if (state.confirmModal) {
        handleConfirmModalKey(key)
        return
      }
      if (state.createConceptModal) {
        handleCreateConceptModalKey(key)
        return
      }
      if (state.editorModal) {
        if (key.name === "escape") {
          applyEditorText(state, state.editorModal)
          state.editorModal.renderable.blur()
          state.editorModal = null
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
            setTimedStatus(message, "error")
          }
          draw()
          return
        }
        if (state.editorModal.aliasSuggestion && (key.name === "down" || (key.ctrl && key.name === "n"))) {
          if (moveAliasSuggestionSelection(state, 1)) {
            draw()
          } else {
            draw()
          }
          return
        }
        if (state.editorModal.aliasSuggestion && (key.name === "up" || (key.ctrl && key.name === "p"))) {
          if (moveAliasSuggestionSelection(state, -1)) {
            draw()
          } else {
            draw()
          }
          return
        }
        if (state.editorModal.aliasSuggestion && key.name === "return") {
          key.preventDefault()
          key.stopPropagation()
          if (acceptAliasSuggestion(state)) {
            draw()
            return
          }
          return
        }
        applyEditorText(state, state.editorModal)
        refreshAliasSuggestionSoon(state, draw)
        draw()
        return
      }
      if (state.showBufferModal) {
        if (key.name === "escape") {
          closeBufferModal()
          const fallback = bufferStatusMessage()
          clearStatusTimeout()
          setStatusNow(defaultStatusMessage(), fallback ? "success" : "info")
          draw()
          return
        }

        if (key.name === "j" || key.name === "down") {
          if (moveBufferModalCursor(state, 1)) {
            setStatusNow(bufferModalStatusMessage(), "info")
            draw()
          }
          return
        }
        if (key.name === "k" || key.name === "up") {
          if (moveBufferModalCursor(state, -1)) {
            setStatusNow(bufferModalStatusMessage(), "info")
            draw()
          }
          return
        }
        if (key.name === "return") {
          const target = selectedBufferModalTarget(state)
          const text = target.kind === "prompt" ? state.promptText : state.conceptNotes[target.path ?? ""] ?? ""
          const visibleLineCount = editorVisibleLineCount(text)
          const renderable = new TextareaRenderable(renderer, {
            initialValue: text,
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
              }
              if (refreshEditorModalHeight(state)) {
                draw()
              }
            },
          })
          renderable.gotoBufferEnd()
          state.editorModal = { target, renderable, aliasSuggestion: null, visibleLineCount }
          refreshAliasSuggestion(state)
          draw()
          setTimeout(() => {
            if (state.editorModal?.renderable === renderable) {
              renderable.focus()
              draw()
            }
          }, 0)
          return
        }
        return
      }
      if (key.name === "q") {
        renderer.destroy()
        process.exit(0)
      }
      if (key.name === "j" || key.name === "down") {
        if (moveCursor(state, 1)) {
          draw()
        }
        return
      }
      if (key.name === "k" || key.name === "up") {
        if (moveCursor(state, -1)) {
          draw()
        }
        return
      }
      if (key.name === "pagedown") {
        if (key.ctrl) {
          scrollMain(state, Math.max(1, state.mainViewportHeight - 2))
          draw()
        } else {
          if (moveCursor(state, pageSize(state.layoutMode))) {
            draw()
          }
        }
        return
      }
      if (key.name === "pageup") {
        if (key.ctrl) {
          scrollMain(state, -Math.max(1, state.mainViewportHeight - 2))
          draw()
        } else {
          if (moveCursor(state, -pageSize(state.layoutMode))) {
            draw()
          }
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
        if (node.childPaths.length === 0) {
          setTimedStatus(`${node.path} has no children`, "warning")
        } else {
          clearStatusTimeout()
          state.currentParentPath = node.path
          state.cursor = 0
          applySelectionChange(state)
          const fallback = bufferStatusMessage()
          setStatusNow(defaultStatusMessage(), fallback ? "success" : "info")
          draw()
        }
        return
      }
      if (key.name === "h" || key.name === "left") {
        const currentParent = state.nodes.get(state.currentParentPath)!
        if (currentParent.parentPath === null) {
          setTimedStatus("Already at the root", "warning")
        } else {
          clearStatusTimeout()
          const oldParent = state.currentParentPath
          state.currentParentPath = currentParent.parentPath
          state.cursor = Math.max(0, visiblePaths(state).indexOf(oldParent))
          applySelectionChange(state)
          const fallback = bufferStatusMessage()
          setStatusNow(defaultStatusMessage(), fallback ? "success" : "info")
          draw()
        }
        return
      }
      if (key.name === "space") {
        const path = currentPath(state)
        if (isDraftConcept(state, path)) {
          promptToRemoveDraft(path)
          draw()
          return
        }
        setConceptBuffered(path)
        draw()
        return
      }
      if (key.name === "n") {
        clearStatusTimeout()
        openCreateConceptModal()
        draw()
        return
      }
      if (key.name === "y") {
        clearStatusTimeout()
        const selection = clipboardSelection(state, currentPath(state))
        await copyWithStatus(
          buildClipboardPayload(state, currentPath(state)),
          `Copied context for ${selection.count} concept${selection.count === 1 ? "" : "s"}`,
        )
        return
      }
      if (key.name === "c") {
        clearStatusTimeout()
        state.bufferedConcepts = state.bufferedConcepts.filter((item) => isDraftConcept(state, item.path))
        setStatusNow("Cleared selection", "info")
        clampBufferModalState(state)
        draw()
        return
      }
      if (key.name === "return") {
        clearStatusTimeout()
        state.showBufferModal = true
        resetBufferModal(state)
        setStatusNow(bufferModalStatusMessage(), "info")
        draw()
        return
      }
      if (key.name === "p") {
        const path = currentPath(state)
        await copyWithStatus(path, `Copied path: ${path}`)
        return
      }
      if (key.name === "?" || (key.shift && key.name === "/")) {
        setTimedStatus("Browse: j/k -> Move  h/l -> Back/Open  Enter -> Open selection  Space -> Toggle selection  y -> Copy  q -> Quit", "info")
      }
    })
  }

  const initialRenderer = await createCliRenderer({ exitOnCtrlC: false })
  mountRenderer(initialRenderer)
  bindKeyHandler()

  function draw(): void {
    clampCursor(state)
    debugStatus("draw", {
      status: state.status.message,
      tone: state.status.tone,
      bufferedConcepts: state.bufferedConcepts,
      currentPath: currentPath(state),
      currentParentPath: state.currentParentPath,
    })
    repaint(state, listScroll, mainScroll, renderer.root)
  }

  function drawStatus(): void {
    replaceChildren(renderer.root, renderFrame(state, listScroll, mainScroll, renderStatusPane(state)))
    scrollMainToState()
  }

  function scrollMainToState(): void {
    scrollListForCursor(state, listScroll)
    state.mainViewportHeight = Math.max(8, mainScroll.viewport.height || (state.layoutMode === "wide" ? 18 : 12))
    mainScroll.scrollTo({ x: 0, y: state.mainScrollTop })
  }

  function bufferStatusMessage(): string {
    return state.bufferedConcepts.length > 0 ? `Selection: ${state.bufferedConcepts.length} concept${state.bufferedConcepts.length === 1 ? "" : "s"}` : ""
  }

  function bufferModalStatusMessage(): string {
    const target = selectedBufferModalTarget(state)
    if (target.kind === "concept" && target.path) {
      const summary = state.nodes.get(target.path)?.summary?.trim()
      return `Summary: ${summary || "(none)"}`
    }
    return "Prompt selected"
  }

    function defaultStatusMessage(): string {
    const fallback = bufferStatusMessage()
    return fallback || "Browse concepts. n adds a draft. Space toggles selection. y copies context."
  }

  function closeBufferModal(): void {
    state.showBufferModal = false
    state.editorModal?.renderable.blur()
    state.editorModal = null
    clampBufferModalState(state)
  }

  async function openExternalEditor(initialText: string): Promise<string> {
    const editor = process.env.EDITOR?.trim()
    if (!editor) {
      throw new Error("EDITOR is not set")
    }
    const tempDir = await mkdtemp(join(tmpdir(), "setsumei-"))
    const tempFile = join(tempDir, "buffer-note.txt")
    await writeFile(tempFile, initialText, "utf8")
    const [command, ...args] = editor.split(/\s+/)
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, [...args, tempFile], { stdio: "inherit" })
      child.on("error", reject)
      child.on("close", (code) => {
        if (code === 0 || code === null) {
          resolve()
        } else {
          reject(new Error(`${editor} exited with code ${code}`))
        }
      })
    })
    const nextText = await readFile(tempFile, "utf8")
    await rm(tempDir, { recursive: true, force: true })
    return nextText
  }

  function clearStatusTimeout(): void {
    if (state.statusTimeout) {
      debugStatus("clear-timeout", { status: state.status.message })
      clearTimeout(state.statusTimeout)
      state.statusTimeout = null
    }
  }

  function clearCtrlCExitState(): void {
    state.pendingCtrlCExit = false
    state.preserveStatusAboveModal = false
    if (state.ctrlCExitTimeout) {
      clearTimeout(state.ctrlCExitTimeout)
      state.ctrlCExitTimeout = null
    }
  }

  function clearCtrlCExitStateIfNeeded(): void {
    if (!state.pendingCtrlCExit && !state.preserveStatusAboveModal && !state.ctrlCExitTimeout) {
      return
    }
    clearCtrlCExitState()
    draw()
  }

  function armCtrlCExit(): void {
    clearCtrlCExitState()
    state.pendingCtrlCExit = true
    state.preserveStatusAboveModal = true
    setTimedStatus("Press Ctrl+C again to quit, or Esc to stay", "warning", 2000)
    state.ctrlCExitTimeout = setTimeout(() => {
      state.ctrlCExitTimeout = null
      state.pendingCtrlCExit = false
      state.preserveStatusAboveModal = false
      draw()
    }, 2000)
  }

  function setStatusNow(message: string, tone: AppState["status"]["tone"]): void {
    state.statusVersion += 1
    setStatus(state, message, tone)
  }

  function setTimedStatus(message: string, tone: AppState["status"]["tone"], durationMs = 2000): void {
    clearStatusTimeout()
    debugStatus("set-timed-status", { message, tone, durationMs, bufferedConcepts: state.bufferedConcepts, currentPath: currentPath(state) })
    setStatusNow(message, tone)
    drawStatus()
    const version = state.statusVersion
    state.statusTimeout = setTimeout(() => {
      if (state.statusVersion !== version) {
        debugStatus("timeout-skipped", { message, version, currentVersion: state.statusVersion })
        return
      }
      state.statusTimeout = null
      const fallback = bufferStatusMessage()
      debugStatus("timeout-fired", { previousMessage: message, fallback, bufferedConcepts: state.bufferedConcepts, currentPath: currentPath(state) })
      setStatusNow(defaultStatusMessage(), fallback ? "success" : "info")
      drawStatus()
    }, durationMs)
  }

  async function copyWithStatus(payload: string, successMessage: string): Promise<void> {
    clearStatusTimeout()
    debugStatus("copy-start", { successMessage, payloadPreview: payload.slice(0, 120), bufferedConcepts: state.bufferedConcepts, currentPath: currentPath(state) })
    setStatusNow(successMessage, "success")
    draw()
    const result = await copyToClipboard(payload)
    debugStatus("copy-finished", { successMessage, result, bufferedConcepts: state.bufferedConcepts, currentPath: currentPath(state) })
    if (result.ok) {
      clearStatusTimeout()
      const version = state.statusVersion
      state.statusTimeout = setTimeout(() => {
        if (state.statusVersion !== version) {
          debugStatus("copy-timeout-skipped", { successMessage, version, currentVersion: state.statusVersion })
          return
        }
        state.statusTimeout = null
        const fallback = bufferStatusMessage()
        debugStatus("copy-timeout-fired", { successMessage, fallback, bufferedConcepts: state.bufferedConcepts, currentPath: currentPath(state) })
        setStatusNow(defaultStatusMessage(), fallback ? "success" : "info")
        draw()
      }, 2000)
    } else {
      setTimedStatus(result.message, "error")
    }
  }

  handleResize(state, process.stdout.columns || 120)
  draw()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
