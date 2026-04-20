import { RGBA, ScrollBoxRenderable, SyntaxStyle, TextareaRenderable, createCliRenderer, type CliRenderer, type KeyEvent } from "@opentui/core"

import { createInitialAppState, loadProjectPaths, parseArgs } from "./app/init"
import { openPromptEditor, syncPromptDraft } from "./app/prompt-editor"
import { bindKeyHandler } from "./app/keybindings"
import { clearCtrlCExitState, copyWithStatus, openExternalEditor } from "./app/platform"
import { createPromptThreadController } from "./app/prompt-thread"
import { createWorkspaceController } from "./app/workspace"
import { createSseChatTransport, startDummyChatServer } from "./chat"
import { loadConceptGraph } from "./model"
import { activeSession } from "./session"
import { clampCursor, handleResize } from "./state"
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

function createScrollBox(renderer: CliRenderer): ScrollBoxRenderable {
  const scroll = new ScrollBoxRenderable(renderer, {
    width: "100%",
    height: "100%",
    viewportCulling: false,
    scrollbarOptions: { showArrows: false },
  })
  scroll.verticalScrollBar.visible = false
  scroll.horizontalScrollBar.visible = false
  return scroll
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

  const promptEditorDepsFor = (nextState = state, nextRedraw = draw) => buildPromptEditorDeps(nextState, nextRedraw, promptThread, workspace)

  function openPromptEditorWithDeps(nextState = state, nextRenderer = renderer, nextRedraw = draw): void {
    openPromptEditor(nextState, nextRenderer, promptEditorDepsFor(nextState, nextRedraw))
  }

  function submitPromptMessage(): void {
    promptThread.submitPromptMessage(state, renderer, draw, {
      syncPromptDraft,
      openPromptEditor: (nextState, nextRenderer, nextRedraw) => openPromptEditor(nextState, nextRenderer, promptEditorDepsFor(nextState, nextRedraw)),
    })
  }

  workspace = createWorkspaceController({
    state,
    redraw: draw,
    openPromptEditor: () => openPromptEditorWithDeps(),
  })

  function mountRenderer(nextRenderer: CliRenderer): void {
    renderer = nextRenderer
    listScroll = createScrollBox(renderer)
    mainScroll = createScrollBox(renderer)
    promptScroll = createScrollBox(renderer)
    promptThread.setPromptScrollRenderable(promptScroll)
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
      clearCtrlCExitState: () => clearCtrlCExitState(state),
      copyWithStatus: (payload: string, successMessage: string) => copyWithStatus(state, payload, successMessage, { draw }),
      updateCreateDraftText,
      closeConfirmModal,
      openInspector: (kind: InspectorKind) => openInspector(state, kind),
      closeInspector: () => closeInspector(state),
      refreshPromptScroll: () => promptThread.refreshPromptScroll(state),
      refreshPromptTokenBreakdown: () => promptThread.refreshPromptTokenBreakdown(state, draw),
      submitPromptMessage,
      openPromptEditor: (nextState: AppState, nextRenderer: CliRenderer, nextRedraw: () => void) => openPromptEditor(nextState, nextRenderer, promptEditorDepsFor(nextState, nextRedraw)),
      buildPromptEditorDeps: () => promptEditorDepsFor(),
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

  handleResize(state, initialRenderer.terminalWidth || process.stdout.columns || 120)
  workspace.applyStartupPromptPaneRatio()
  openPromptEditor(state, initialRenderer, promptEditorDepsFor())
  promptThread.refreshPromptTokenBreakdown(state, draw)
  draw()
  state.startupDrawComplete = true
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
