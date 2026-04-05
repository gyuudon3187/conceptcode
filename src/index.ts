import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"

import { ScrollBoxRenderable, TextareaRenderable, createCliRenderer, type CliRenderer, type KeyEvent } from "@opentui/core"

import { buildClipboardPayload, clipboardSelection, copyToClipboard } from "./clipboard"
import { loadConceptGraph } from "./model"
import { applySelectionChange, bufferedConceptForPath, clampBufferModalState, clampCursor, currentNode, currentPath, handleResize, moveBufferModalCategory, moveBufferModalCursor, moveCursor, pageSize, resetBufferModal, scrollMain, selectedBufferModalTarget, setStatus, visiblePaths } from "./state"
import type { AppState, ConceptNode, CopyMode, CreateConceptDraft, EditorModalState, KindDefinition } from "./types"
import { repaint } from "./view"

const DEBUG_STATUS = process.env.SETSUMEI_DEBUG_STATUS === "1"

function debugStatus(event: string, details: Record<string, unknown>): void {
  if (!DEBUG_STATUS) {
    return
  }
  console.error(`[setsumei-debug] ${event} ${JSON.stringify(details)}`)
}

function parseArgs(argv: string[]): { conceptsPath: string } {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--concepts-path") {
      const value = argv[index + 1]
      if (!value) {
        throw new Error("Missing value for --concepts-path")
      }
      return { conceptsPath: value }
    }
  }
  throw new Error("Expected --concepts-path <path>")
}

function emptyCreateDraft(): CreateConceptDraft {
  return {
    title: "",
    summary: "",
    selectedKind: null,
    newKindName: "",
    newKindDescription: "",
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

function insertDraftConcept(state: AppState, draft: CreateConceptDraft, kindDefinition: KindDefinition): string {
  const parent = state.nodes.get(state.currentParentPath)
  if (!parent) {
    throw new Error("Current parent concept not found")
  }
  const path = uniqueChildPath(state, state.currentParentPath, draft.title)
  const metadata: ConceptNode["metadata"] = kindDefinition.description ? { kind_description: kindDefinition.description } : {}
  const node: ConceptNode = {
    path,
    title: draft.title.trim(),
    kind: kindDefinition.kind,
    summary: draft.summary.trim(),
    parentPath: state.currentParentPath,
    metadata,
    childPaths: [],
    isDraft: true,
  }
  state.nodes.set(path, node)
  parent.childPaths = [...parent.childPaths, path]
  state.cursor = parent.childPaths.indexOf(path)
  applySelectionChange(state)
  if (!state.kindDefinitions.some((item) => item.kind === kindDefinition.kind)) {
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
  const { conceptsPath } = parseArgs(process.argv.slice(2))
  const { graphPayload, nodes, kindDefinitions } = loadConceptGraph(conceptsPath)
  const state: AppState = {
    jsonPath: conceptsPath,
    graphPayload,
    nodes,
    currentParentPath: "root",
    cursor: 0,
    bufferedConcepts: [],
    kindDefinitions,
    createConceptModal: null,
    confirmModal: null,
    status: {
      message: "Browse concepts. n creates a draft concept. y copies context.",
      tone: "info",
    },
    layoutMode: "wide",
    mainScrollTop: 0,
    mainViewportHeight: 18,
    showBufferModal: false,
    bufferModal: {
      focus: "prompt",
      activeCategory: "buffered",
      cursors: {
        buffered: 0,
        deleted: 0,
        created: 0,
      },
    },
    promptText: "",
    conceptNotes: {},
    editorModal: null,
    pendingCopyChoice: null,
    statusTimeout: null,
    statusVersion: 0,
  }

  let renderer: CliRenderer
  let listScroll: ScrollBoxRenderable
  let mainScroll: ScrollBoxRenderable

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
      step: "details",
      draft: emptyCreateDraft(),
      fieldIndex: 0,
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
    const field = modal.step === "details" ? (modal.fieldIndex === 0 ? "title" : "summary") : modal.fieldIndex === 0 ? "newKindName" : "newKindDescription"
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
    if (modal.step === "details" || modal.step === "new-kind") {
      if (key.name === "tab" || (key.ctrl && key.name === "j")) {
        modal.fieldIndex = (modal.fieldIndex + 1) % 2
        draw()
        return true
      }
      if ((key.shift && key.name === "tab") || (key.ctrl && key.name === "k")) {
        modal.fieldIndex = (modal.fieldIndex + 1) % 2
        draw()
        return true
      }
      if (key.name === "return") {
        if (modal.step === "details") {
          if (!modal.draft.title.trim() || !modal.draft.summary.trim()) {
            setTimedStatus("Name and summary are required", "warning")
            return true
          }
          modal.step = "pick-kind"
          modal.kindCursor = 0
          modal.kindQuery = ""
          draw()
          return true
        }
        if (!modal.draft.newKindName.trim() || !modal.draft.newKindDescription.trim()) {
          setTimedStatus("Kind name and description are required", "warning")
          return true
        }
        const kindDefinition: KindDefinition = {
          kind: modal.draft.newKindName.trim(),
          description: modal.draft.newKindDescription.trim(),
          source: "session",
        }
        const createdPath = insertDraftConcept(state, modal.draft, kindDefinition)
        closeCreateConceptModal()
        clampCursor(state)
        setStatusNow(`Created draft concept: ${createdPath}`, "success")
        draw()
        return true
      }
      if (updateCreateDraftText(key)) {
        draw()
        return true
      }
      return true
    }

    const query = modal.kindQuery.trim().toLowerCase()
    const rankedOptions = state.kindDefinitions
      .map((item) => ({ item, score: fuzzyKindScore(item.kind, query) }))
      .filter((entry) => query.length === 0 || entry.score > 0)
      .sort((left, right) => right.score - left.score || left.item.kind.localeCompare(right.item.kind))
      .map((entry) => entry.item)
    const options = [{ kind: "<new kind>", description: "Create a new kind with its own semantic description.", source: "session" as const }, ...rankedOptions]
    modal.kindCursor = Math.min(modal.kindCursor, Math.max(0, options.length - 1))
    if (key.ctrl && key.name === "j") {
      modal.kindCursor = Math.min(options.length - 1, modal.kindCursor + 1)
      draw()
      return true
    }
    if (key.ctrl && key.name === "k") {
      modal.kindCursor = Math.max(0, modal.kindCursor - 1)
      draw()
      return true
    }
    if (key.name === "return") {
      const selected = options[modal.kindCursor]
      if (selected.kind === "<new kind>") {
        modal.step = "new-kind"
        modal.fieldIndex = 0
        draw()
        return true
      }
      const createdPath = insertDraftConcept(state, modal.draft, selected)
      closeCreateConceptModal()
      clampCursor(state)
      setStatusNow(`Created draft concept: ${createdPath}`, "success")
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
      setStatusNow("Removed draft concept", "info")
      draw()
      return true
    }
    return true
  }

  function promptToRemoveDraft(path: string): void {
    state.confirmModal = {
      kind: "remove-draft",
      title: "Remove Draft Concept",
      message: [
        `Remove drafted concept ${path}?`,
        "This removes the concept from the current TUI session.",
      ],
      confirmLabel: "removes this draft concept",
      path,
    }
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

  function bindKeyHandler(): void {
    renderer.keyInput.on("keypress", async (key: KeyEvent) => {
      const visible = visiblePaths(state)
      if (state.confirmModal) {
        handleConfirmModalKey(key)
        return
      }
      if (state.createConceptModal) {
        handleCreateConceptModalKey(key)
        return
      }
      if (state.pendingCopyChoice) {
        if (key.name === "escape") {
          const previous = state.pendingCopyChoice
          state.pendingCopyChoice = null
          clearStatusTimeout()
          setStatusNow(previous.previousMessage, previous.previousTone)
          draw()
          return
        }
        if (key.name === "1") {
          state.pendingCopyChoice = null
          await handleCopyChoice("full")
          return
        }
        if (key.name === "2") {
          state.pendingCopyChoice = null
          await handleCopyChoice("compact")
          return
        }
        return
      }
      if (state.editorModal) {
        if (key.name === "escape" || (key.ctrl && key.name === "q")) {
          state.editorModal.renderable.blur()
          state.editorModal = null
          draw()
          return
        }
        if (key.ctrl && key.name === "return") {
          applyEditorText(state.editorModal)
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
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            try {
              renderer.resume()
            } catch {
              mountRenderer(await createCliRenderer({ exitOnCtrlC: true }))
              bindKeyHandler()
            }
            setTimedStatus(message, "error")
          }
          draw()
          return
        }
        draw()
        return
      }
      if (state.showBufferModal) {
        if (key.name === "escape" || key.name === "q") {
          closeBufferModal()
          const fallback = bufferStatusMessage()
          clearStatusTimeout()
          setStatusNow(defaultStatusMessage(), fallback ? "success" : "info")
          draw()
          return
        }
        if (key.name === "j" || key.name === "down") {
          moveBufferModalCursor(state, 1)
          setStatusNow(bufferModalStatusMessage(), "info")
          draw()
          return
        }
        if (key.name === "k" || key.name === "up") {
          moveBufferModalCursor(state, -1)
          setStatusNow(bufferModalStatusMessage(), "info")
          draw()
          return
        }
        if (key.name === "h" || key.name === "left") {
          moveBufferModalCategory(state, -1)
          setStatusNow(bufferModalStatusMessage(), "info")
          draw()
          return
        }
        if (key.name === "l" || key.name === "right") {
          moveBufferModalCategory(state, 1)
          setStatusNow(bufferModalStatusMessage(), "info")
          draw()
          return
        }
        if (key.name === "return") {
          const target = selectedBufferModalTarget(state)
          const text = target.kind === "prompt" ? state.promptText : state.conceptNotes[target.path ?? ""] ?? ""
          const renderable = new TextareaRenderable(renderer, {
            initialValue: text,
            width: "100%",
            minHeight: 8,
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
          })
          renderable.gotoBufferEnd()
          state.editorModal = { target, renderable }
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
        moveCursor(state, 1)
        draw()
        return
      }
      if (key.name === "k" || key.name === "up") {
        moveCursor(state, -1)
        draw()
        return
      }
      if (key.name === "pagedown") {
        if (key.ctrl) {
          scrollMain(state, Math.max(1, state.mainViewportHeight - 2))
        } else {
          moveCursor(state, pageSize(state.layoutMode))
        }
        draw()
        return
      }
      if (key.name === "pageup") {
        if (key.ctrl) {
          scrollMain(state, -Math.max(1, state.mainViewportHeight - 2))
        } else {
          moveCursor(state, -pageSize(state.layoutMode))
        }
        draw()
        return
      }
      if (key.name === "home" || key.name === "g") {
        state.cursor = 0
        applySelectionChange(state)
        draw()
        return
      }
      if (key.name === "end" || (key.shift && key.name === "g")) {
        state.cursor = Math.max(0, visible.length - 1)
        applySelectionChange(state)
        draw()
        return
      }
      if (key.name === "l" || key.name === "right") {
        const node = currentNode(state)
        if (node.childPaths.length === 0) {
          setTimedStatus(`${node.path} has no child concepts`, "warning")
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
          setTimedStatus("Already at the root concept", "warning")
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
      if (key.name === "n") {
        clearStatusTimeout()
        openCreateConceptModal()
        draw()
        return
      }
      if (key.name === "space") {
        const path = currentPath(state)
        if (isDraftConcept(state, path)) {
          promptToRemoveDraft(path)
          draw()
          return
        }
        if (bufferedConceptForPath(state, path)) {
          state.bufferedConcepts = state.bufferedConcepts.filter((item) => item.path !== path)
          clearStatusTimeout()
          debugStatus("buffer-remove", { path, bufferedConcepts: state.bufferedConcepts, currentPath: currentPath(state) })
          setStatusNow(state.bufferedConcepts.length === 0 ? "Buffer cleared" : bufferStatusMessage(), state.bufferedConcepts.length === 0 ? "info" : "success")
        } else {
          state.bufferedConcepts = [...state.bufferedConcepts, { path }]
          clearStatusTimeout()
          debugStatus("buffer-add", { path, bufferedConcepts: state.bufferedConcepts, currentPath: currentPath(state) })
          setStatusNow(bufferStatusMessage(), "success")
        }
        clampBufferModalState(state)
        draw()
        return
      }
      if (key.name === "d") {
        const path = currentPath(state)
        if (isDraftConcept(state, path)) {
          promptToRemoveDraft(path)
          draw()
          return
        }
        const existing = bufferedConceptForPath(state, path)
        if (existing?.action === "delete") {
          state.bufferedConcepts = state.bufferedConcepts.filter((item) => item.path !== path)
          clearStatusTimeout()
          setStatusNow(state.bufferedConcepts.length === 0 ? "Buffer cleared" : bufferStatusMessage(), state.bufferedConcepts.length === 0 ? "info" : "success")
        } else if (existing) {
          state.bufferedConcepts = state.bufferedConcepts.map((item) => (item.path === path ? { ...item, action: "delete" } : item))
          clearStatusTimeout()
          setStatusNow(`Marked for deletion: ${path}`, "success")
        } else {
          state.bufferedConcepts = [...state.bufferedConcepts, { path, action: "delete" }]
          clearStatusTimeout()
          setStatusNow(`Marked for deletion: ${path}`, "success")
        }
        clampBufferModalState(state)
        draw()
        return
      }
      if (key.name === "y") {
        clearStatusTimeout()
        state.pendingCopyChoice = {
          previousMessage: state.status.message,
          previousTone: state.status.tone,
        }
        setStatusNow("Copy to clipboard: 1 Full Context, 2 Compact Context, Esc cancel", "info")
        draw()
        return
      }
      if (key.name === "c") {
        clearStatusTimeout()
        state.bufferedConcepts = state.bufferedConcepts.filter((item) => isDraftConcept(state, item.path))
        setStatusNow("Cleared buffered concepts", "info")
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
        setTimedStatus("Keys: j/k move, pgup/pgdn jump, g/G home/end, l open, h back, n new concept, space buffer/remove draft, d delete-buffer/remove draft, Enter open modal, y copy, p path, c clear, q quit", "info")
      }
    })
  }

  mountRenderer(await createCliRenderer({ exitOnCtrlC: true }))
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

  function bufferStatusMessage(): string {
    return state.bufferedConcepts.length > 0 ? `Buffer updated (${state.bufferedConcepts.length} concept${state.bufferedConcepts.length === 1 ? "" : "s"})` : ""
  }

  function bufferModalStatusMessage(): string {
    const target = selectedBufferModalTarget(state)
    if (target.kind === "concept" && target.path) {
      const summary = state.nodes.get(target.path)?.summary?.trim()
      return `Summary: ${summary || "(none)"}`
    }
    return "Prompt Editor selected"
  }

  function defaultStatusMessage(): string {
    const fallback = bufferStatusMessage()
    return fallback || "Browse concepts. n creates a draft concept. y copies context."
  }

  function closeBufferModal(): void {
    state.showBufferModal = false
    state.editorModal?.renderable.blur()
    state.editorModal = null
    clampBufferModalState(state)
  }

  function applyEditorText(editor: EditorModalState): void {
    const text = editor.renderable.plainText
    if (editor.target.kind === "prompt") {
      state.promptText = text
      return
    }
    if (editor.target.path) {
      state.conceptNotes[editor.target.path] = text
    }
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

  async function handleCopyChoice(mode: CopyMode): Promise<void> {
    const selection = clipboardSelection(state, currentPath(state))
    await copyWithStatus(
      buildClipboardPayload({ ...state, bufferedConcepts: state.bufferedConcepts.length > 0 ? state.bufferedConcepts.filter((item) => selection.paths.includes(item.path)) : [{ path: currentPath(state) }] }, mode === "compact", currentPath(state)),
      `Copied ${mode} context for ${selection.count} concept${selection.count === 1 ? "" : "s"}`,
    )
  }

  function clearStatusTimeout(): void {
    if (state.statusTimeout) {
      debugStatus("clear-timeout", { status: state.status.message })
      clearTimeout(state.statusTimeout)
      state.statusTimeout = null
    }
  }

  function setStatusNow(message: string, tone: AppState["status"]["tone"]): void {
    state.statusVersion += 1
    setStatus(state, message, tone)
  }

  function setTimedStatus(message: string, tone: AppState["status"]["tone"], durationMs = 2000): void {
    clearStatusTimeout()
    debugStatus("set-timed-status", { message, tone, durationMs, bufferedConcepts: state.bufferedConcepts, currentPath: currentPath(state) })
    setStatusNow(message, tone)
    draw()
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
      draw()
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
