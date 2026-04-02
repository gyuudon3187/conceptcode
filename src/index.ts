import { ScrollBoxRenderable, createCliRenderer, type KeyEvent } from "@opentui/core"

import { buildClipboardPayload, clipboardSelection, copyToClipboard } from "./clipboard"
import { loadConceptGraph } from "./model"
import { applySelectionChange, clampCursor, currentNode, currentPath, handleResize, moveCursor, pageSize, scrollMain, setStatus, visiblePaths } from "./state"
import type { AppState } from "./types"
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
      message: "Browse concepts. Enter copies compact context. y copies full context.",
      tone: "info",
    },
    layoutMode: "wide",
    mainScrollTop: 0,
    mainViewportHeight: 18,
    showBufferModal: false,
    statusTimeout: null,
    statusVersion: 0,
  }

  const renderer = await createCliRenderer({ exitOnCtrlC: true })
  const listScroll = new ScrollBoxRenderable(renderer, {
    width: "100%",
    height: "100%",
    viewportCulling: false,
    scrollbarOptions: { showArrows: true },
  })
  const mainScroll = new ScrollBoxRenderable(renderer, {
    width: "100%",
    height: "100%",
    viewportCulling: false,
    scrollbarOptions: { showArrows: true },
  })

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
      setStatusNow(fallback || "Browse concepts. Enter copies compact context. y copies full context.", fallback ? "success" : "info")
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
        setStatusNow(fallback || "Browse concepts. Enter copies compact context. y copies full context.", fallback ? "success" : "info")
        draw()
      }, 2000)
    } else {
      setTimedStatus(result.message, "error")
    }
  }

  renderer.on("resize", (width) => {
    handleResize(state, width)
    draw()
  })

  renderer.keyInput.on("keypress", async (key: KeyEvent) => {
    const visible = visiblePaths(state)
    if (state.showBufferModal) {
      state.showBufferModal = false
      const fallback = bufferStatusMessage()
      clearStatusTimeout()
      setStatusNow(fallback || "Browse concepts. Enter copies compact context. y copies full context.", fallback ? "success" : "info")
      draw()
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
        setStatusNow(fallback || "Browse concepts. Enter copies compact context. y copies full context.", fallback ? "success" : "info")
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
        setStatusNow(fallback || "Browse concepts. Enter copies compact context. y copies full context.", fallback ? "success" : "info")
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
      draw()
      return
    }
    if (key.name === "y") {
      const selection = clipboardSelection(state, currentPath(state))
      debugStatus("copy-full-selection", { selection, bufferedPaths: state.bufferedPaths, currentPath: currentPath(state), footer: state.status.message })
      await copyWithStatus(
        buildClipboardPayload({ ...state, bufferedPaths: selection.paths }, false, currentPath(state)),
        `Copied full context for ${selection.count} concept${selection.count === 1 ? "" : "s"}`,
      )
      return
    }
    if (key.name === "c") {
      clearStatusTimeout()
      state.bufferedPaths = []
      setStatusNow("Cleared buffered concepts", "info")
      draw()
      return
    }
    if (key.name === "b") {
      if (state.bufferedPaths.length === 0) {
        setTimedStatus("Buffer is empty", "info")
        return
      }
      clearStatusTimeout()
      state.showBufferModal = true
      setStatusNow(`Showing ${state.bufferedPaths.length} buffered concept${state.bufferedPaths.length === 1 ? "" : "s"}`, "info")
      draw()
      return
    }
    if (key.name === "p") {
      const path = currentPath(state)
      await copyWithStatus(path, `Copied path: ${path}`)
      return
    }
    if (key.name === "return") {
      const selection = clipboardSelection(state, currentPath(state))
      debugStatus("copy-compact-selection", { selection, bufferedPaths: state.bufferedPaths, currentPath: currentPath(state), footer: state.status.message })
      await copyWithStatus(
        buildClipboardPayload({ ...state, bufferedPaths: selection.paths }, true, currentPath(state)),
        `Copied compact context for ${selection.count} concept${selection.count === 1 ? "" : "s"}`,
      )
      return
    }
    if (key.name === "?" || (key.shift && key.name === "/")) {
      setTimedStatus("Keys: j/k move, pgup/pgdn jump, g/G home/end, l open, h back, space buffer, b list buffer, enter/y/p copy, c clear, q quit", "info")
    }
  })

  handleResize(state, process.stdout.columns || 120)
  draw()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
