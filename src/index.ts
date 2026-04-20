import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"

import { RGBA, ScrollBoxRenderable, SyntaxStyle, TextareaRenderable, type Highlight, createCliRenderer, type CliRenderer, type KeyEvent } from "@opentui/core"

import { handleCreateConceptModalKey, isDraftConcept, openCreateConceptModal, promptToRemoveDraft, removeDraftConcept } from "./app/concepts"
import { createInitialAppState, loadProjectPaths, parseArgs } from "./app/init"
import { acceptAliasSuggestion, applyEditorText, cyclePromptMode, handlePromptAliasBoundaryKey, moveAliasSuggestionSelection, openPromptEditor, openSummaryEditor, refreshAliasSuggestion, refreshAliasSuggestionSoon, refreshEditorModalHeight, syncPromptDraft } from "./app/prompt-editor"
import { createPromptThreadController } from "./app/prompt-thread"
import { createAndSwitchSession, closeSessionModal, flushActiveSession, openSessionModal, persistSessions, sessionModalEntries, switchToSession } from "./app/sessions"
import { createWorkspaceController } from "./app/workspace"
import { createSseChatTransport, startDummyChatServer } from "./chat"
import { buildClipboardPayload, clipboardSelection, copyToClipboard, EMPTY_PROMPT_TOKEN_BREAKDOWN } from "./clipboard"
import { loadConceptGraph } from "./model"
import { activeSession } from "./session"
import { applySelectionChange, clampCursor, currentNode, currentPath, handleResize, moveCursor, pageSize, scrollMain, visiblePaths } from "./state"
import type { AppState, ChatSession, InspectorKind, UiLayoutConfig } from "./types"
import { repaint, scrollListForCursor } from "./view"

function buildPromptEditorDeps(
  state: AppState,
  redraw: () => void,
  promptThread: ReturnType<typeof createPromptThreadController>,
  workspace: ReturnType<typeof createWorkspaceController>,
) {
  return {
    redraw,
    refreshPromptTokenBreakdown: () => promptThread.refreshPromptTokenBreakdown(state, redraw),
    refreshPromptScroll: () => promptThread.refreshPromptScroll(state),
    schedulePromptScrollSync: (reason: string) => promptThread.schedulePromptScrollSync(state, redraw, reason),
    refreshPromptPaneTarget: () => workspace.refreshPromptPaneTarget(),
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
  const promptThread = createPromptThreadController()
  let workspace!: ReturnType<typeof createWorkspaceController>

  function openPromptEditorWithDeps(nextState = state, nextRenderer = renderer, nextRedraw = draw): void {
    openPromptEditor(nextState, nextRenderer, buildPromptEditorDeps(nextState, nextRedraw, promptThread, workspace))
  }

  workspace = createWorkspaceController({
    state,
    redraw: draw,
    openPromptEditor: () => openPromptEditorWithDeps(),
  })

  function mountRenderer(nextRenderer: CliRenderer): void {
    renderer = nextRenderer
    listScroll = new ScrollBoxRenderable(renderer, { width: "100%", height: "100%", viewportCulling: false, scrollbarOptions: { showArrows: false } })
    mainScroll = new ScrollBoxRenderable(renderer, { width: "100%", height: "100%", viewportCulling: false, scrollbarOptions: { showArrows: false } })
    promptScroll = new ScrollBoxRenderable(renderer, { width: "100%", height: "100%", viewportCulling: false, scrollbarOptions: { showArrows: false } })
    promptThread.setPromptScrollRenderable(promptScroll)
    listScroll.verticalScrollBar.visible = false
    listScroll.horizontalScrollBar.visible = false
    mainScroll.verticalScrollBar.visible = false
    mainScroll.horizontalScrollBar.visible = false
    promptScroll.verticalScrollBar.visible = false
    promptScroll.horizontalScrollBar.visible = false
    renderer.on("resize", (width) => {
      handleResize(state, width)
      workspace.handleResize()
    })
  }

  function closeConfirmModal(): void {
    state.confirmModal = null
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
      await createAndSwitchSession(state, renderer, draw, { syncPromptDraft, openPromptEditor: (nextState, nextRenderer, nextRedraw) => openPromptEditor(nextState, nextRenderer, buildPromptEditorDeps(nextState, nextRedraw, promptThread, workspace)) })
      draw()
      return true
    }
    if (key.name === "return") {
      key.preventDefault()
      key.stopPropagation()
      const selected = entries[modal.selectedIndex]
      if (selected) {
        await switchToSession(state, selected.id, renderer, draw, { syncPromptDraft, openPromptEditor: (nextState, nextRenderer, nextRedraw) => openPromptEditor(nextState, nextRenderer, buildPromptEditorDeps(nextState, nextRedraw, promptThread, workspace)) })
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
          promptThread.refreshPromptScroll(state)
          draw()
          return
        }
        if (state.editorModal.target.kind === "prompt" && key.name === "pageup") {
          state.promptScrollTop = Math.max(0, state.promptScrollTop - Math.max(1, state.promptViewportHeight - 2))
          promptThread.refreshPromptScroll(state)
          draw()
          return
        }
        if (state.editorModal.target.kind === "prompt" && key.name === "tab" && !key.shift) {
          cyclePromptMode(state, draw, () => promptThread.refreshPromptTokenBreakdown(state, draw))
          return
        }
        if (key.shift && key.name === "tab") {
          key.preventDefault()
          key.stopPropagation()
          workspace.togglePaneFocus()
          return
        }
        if (state.editorModal.target.kind === "prompt" && key.name === "return" && !key.shift && !key.ctrl && !state.editorModal.aliasSuggestion) {
          key.preventDefault()
          key.stopPropagation()
          promptThread.submitPromptMessage(state, renderer, draw, {
            syncPromptDraft,
            openPromptEditor: (nextState, nextRenderer, nextRedraw) => openPromptEditor(nextState, nextRenderer, buildPromptEditorDeps(nextState, nextRedraw, promptThread, workspace)),
          })
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
            workspace.togglePaneFocus()
            return
          }
          state.editorModal = null
          workspace.refreshPromptPaneTarget()
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
        workspace.togglePaneFocus()
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
        openSummaryEditor(state, renderer, buildPromptEditorDeps(state, draw, promptThread, workspace))
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
  workspace.applyStartupPromptPaneRatio()
  openPromptEditor(state, initialRenderer, buildPromptEditorDeps(state, draw, promptThread, workspace))
  promptThread.refreshPromptTokenBreakdown(state, draw)
  draw()
  state.startupDrawComplete = true
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
