import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"

import { RGBA, ScrollBoxRenderable, SyntaxStyle, TextareaRenderable, createCliRenderer, type CliRenderer, type KeyEvent } from "@opentui/core"

import { createInitialAppState, loadProjectPaths, parseArgs } from "./app/init"
import { openPromptEditor, syncPromptDraft } from "./app/prompt-editor"
import { bindKeyHandler } from "./app/keybindings"
import { createPromptThreadController } from "./app/prompt-thread"
import { createWorkspaceController } from "./app/workspace"
import { createSseChatTransport, startDummyChatServer } from "./chat"
import { copyToClipboard } from "./clipboard"
import { loadConceptGraph } from "./model"
import { activeSession } from "./session"
import { clampCursor, currentPath, handleResize } from "./state"
import type { AppState, InspectorKind } from "./types"
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

  function buildKeybindingDeps() {
    return {
      state,
      renderer: () => renderer,
      draw,
      openExternalEditor,
      clearCtrlCExitState,
      copyWithStatus,
      updateCreateDraftText,
      closeConfirmModal,
      openInspector: (kind: InspectorKind) => openInspector(state, kind),
      closeInspector: () => closeInspector(state),
      refreshPromptScroll: () => promptThread.refreshPromptScroll(state),
      refreshPromptTokenBreakdown: () => promptThread.refreshPromptTokenBreakdown(state, draw),
      submitPromptMessage: () => promptThread.submitPromptMessage(state, renderer, draw, {
        syncPromptDraft,
        openPromptEditor: (nextState, nextRenderer, nextRedraw) => openPromptEditor(nextState, nextRenderer, buildPromptEditorDeps(nextState, nextRedraw, promptThread, workspace)),
      }),
      openPromptEditor: (nextState: AppState, nextRenderer: CliRenderer, nextRedraw: () => void) => openPromptEditor(nextState, nextRenderer, buildPromptEditorDeps(nextState, nextRedraw, promptThread, workspace)),
      buildPromptEditorDeps: () => buildPromptEditorDeps(state, draw, promptThread, workspace),
      workspace,
      remountRenderer: async () => {
        mountRenderer(await createCliRenderer({ exitOnCtrlC: false }))
        bindKeyHandler(buildKeybindingDeps())
      },
    }
  }

  const initialRenderer = await createCliRenderer({ exitOnCtrlC: false })
  mountRenderer(initialRenderer)
  bindKeyHandler(buildKeybindingDeps())

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
