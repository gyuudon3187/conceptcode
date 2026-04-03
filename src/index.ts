import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"

import { ScrollBoxRenderable, TextareaRenderable, createCliRenderer, type CliRenderer, type KeyEvent } from "@opentui/core"

import { buildClipboardPayload, clipboardSelection, copyToClipboard } from "./clipboard"
import { loadConceptGraph } from "./model"
import { applySelectionChange, clampBufferModalCursor, clampCursor, currentNode, currentPath, handleResize, moveBufferModalCursor, moveCursor, pageSize, scrollMain, selectedBufferModalTarget, setStatus, visiblePaths } from "./state"
import type { AppState, CopyMode, EditorModalState } from "./types"
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

async function main(): Promise<void> {
  const { conceptsPath } = parseArgs(process.argv.slice(2))
  const { graphPayload, nodes } = loadConceptGraph(conceptsPath)
  const state: AppState = {
    jsonPath: conceptsPath,
    graphPayload,
    nodes,
    currentParentPath: "root",
    cursor: 0,
    bufferedPaths: [],
      status: {
        message: "Browse concepts. Enter opens prompt editor. y copies context.",
        tone: "info",
      },
    layoutMode: "wide",
    mainScrollTop: 0,
    mainViewportHeight: 18,
    showBufferModal: false,
    bufferModalCursor: 0,
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

  function bindKeyHandler(): void {
    renderer.keyInput.on("keypress", async (key: KeyEvent) => {
      const visible = visiblePaths(state)
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
        if (key.name === "j") {
          moveBufferModalCursor(state, 1)
          setStatusNow(bufferModalStatusMessage(), "info")
          draw()
          return
        }
        if (key.name === "k") {
          moveBufferModalCursor(state, -1)
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
      if (key.name === "space") {
        const path = currentPath(state)
        if (state.bufferedPaths.includes(path)) {
          state.bufferedPaths = state.bufferedPaths.filter((item) => item !== path)
          clearStatusTimeout()
          debugStatus("buffer-remove", { path, bufferedPaths: state.bufferedPaths, currentPath: currentPath(state) })
          setStatusNow(state.bufferedPaths.length === 0 ? "Buffer cleared" : bufferStatusMessage(), state.bufferedPaths.length === 0 ? "info" : "success")
        } else {
          state.bufferedPaths = [...state.bufferedPaths, path]
          clearStatusTimeout()
          debugStatus("buffer-add", { path, bufferedPaths: state.bufferedPaths, currentPath: currentPath(state) })
          setStatusNow(bufferStatusMessage(), "success")
        }
        clampBufferModalCursor(state)
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
        state.bufferedPaths = []
        setStatusNow("Cleared buffered concepts", "info")
        clampBufferModalCursor(state)
        draw()
        return
      }
      if (key.name === "return") {
        clearStatusTimeout()
        state.showBufferModal = true
        clampBufferModalCursor(state)
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
        setTimedStatus("Keys: j/k move, pgup/pgdn jump, g/G home/end, l open, h back, space buffer, Enter open modal, y copy, p path, c clear, q quit", "info")
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
      bufferedPaths: state.bufferedPaths,
      currentPath: currentPath(state),
      currentParentPath: state.currentParentPath,
    })
    repaint(state, listScroll, mainScroll, renderer.root)
  }

  function bufferStatusMessage(): string {
    return state.bufferedPaths.length > 0 ? `Buffer updated (${state.bufferedPaths.length} concept${state.bufferedPaths.length === 1 ? "" : "s"})` : ""
  }

  function bufferModalStatusMessage(): string {
    const target = selectedBufferModalTarget(state)
    if (target.kind === "concept" && target.path) {
      const summary = state.nodes.get(target.path)?.summary?.trim()
      return `Summary: ${summary || "(none)"}`
    }
    return `Showing ${state.bufferedPaths.length} buffered concept${state.bufferedPaths.length === 1 ? "" : "s"}`
  }

  function defaultStatusMessage(): string {
    const fallback = bufferStatusMessage()
    return fallback || "Browse concepts. Enter opens prompt editor. y copies context."
  }

  function closeBufferModal(): void {
    state.showBufferModal = false
    state.editorModal?.renderable.blur()
    state.editorModal = null
    clampBufferModalCursor(state)
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
      buildClipboardPayload({ ...state, bufferedPaths: selection.paths }, mode === "compact", currentPath(state)),
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
    debugStatus("set-timed-status", { message, tone, durationMs, bufferedPaths: state.bufferedPaths, currentPath: currentPath(state) })
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
      debugStatus("timeout-fired", { previousMessage: message, fallback, bufferedPaths: state.bufferedPaths, currentPath: currentPath(state) })
      setStatusNow(defaultStatusMessage(), fallback ? "success" : "info")
      draw()
    }, durationMs)
  }

  async function copyWithStatus(payload: string, successMessage: string): Promise<void> {
    clearStatusTimeout()
    debugStatus("copy-start", { successMessage, payloadPreview: payload.slice(0, 120), bufferedPaths: state.bufferedPaths, currentPath: currentPath(state) })
    setStatusNow(successMessage, "success")
    draw()
    const result = await copyToClipboard(payload)
    debugStatus("copy-finished", { successMessage, result, bufferedPaths: state.bufferedPaths, currentPath: currentPath(state) })
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
        debugStatus("copy-timeout-fired", { successMessage, fallback, bufferedPaths: state.bufferedPaths, currentPath: currentPath(state) })
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
