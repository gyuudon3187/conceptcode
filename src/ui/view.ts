import { RGBA, type Renderable, type VNode, Box, ScrollBoxRenderable, Text, TextAttributes, TextNodeRenderable, type TextChunk } from "@opentui/core"
import { renderWorkspaceFrame } from "agent-tui/render/frame"
import { renderInspectorOverlay } from "agent-tui/render/inspector"
import type { ShellWorkspaceFrameViewModel, WorkspaceFocus } from "agent-tui/types"

import { currentNode } from "../core/state"
import type { AppState } from "../core/types"
import { shellWorkspaceUiState } from "../core/state"
import { inspectorOverlayViewModel, renderAppOverlays } from "../conceptcode-ui/overlays"
import { activeSession } from "../sessions/store"
import { renderConceptPreviewPane, renderDetailsPane, renderDetailsTransitionBody, renderPromptBudgetPane, renderPromptPane, renderPromptPreviewPane, renderPromptSuggestionOverlay, renderSessionTransitionBody } from "../conceptcode-ui/panes"
import { renderConceptList } from "./concepts-list"
import { renderConfirmModal, renderCreateConceptModal, renderSessionModal } from "./modals"
import { conceptCodeInspectorPreviewProvider, getSnippetSyntaxStyle, type ContextPreview } from "./snippet"
import { COLORS } from "./theme"
import { promptPreviewChunks, promptPreviewLines, promptPreviewWidth, textNodesForChunks } from "./text"
import { renderWorkspaceTransitionOverlay, wideWorkspaceGeometry, workspaceRects, type WorkspaceRects } from "./workspace-transition"

function currentViewport() {
  return {
    width: process.stdout.columns || 120,
    height: process.stdout.rows || 36,
  }
}

let contextRenderVersion = 0
let contextPreviewKey: string | null = null

function contextKeyForNode(path: string, loc: { file: string; startLine: number; endLine: number } | null, summary: string): string {
  if (!loc) return `${path}::no-loc::${summary}`
  return `${path}::${loc.file}:${loc.startLine}-${loc.endLine}::${summary}`
}

function promptModePresentation(mode: AppState["uiMode"]): { label: string; color: string; tone: string } {
  if (mode === "plan") {
    return { label: "PLAN", color: COLORS.plan, tone: "Strategy mode" }
  }
  if (mode === "build") {
    return { label: "BUILD", color: COLORS.build, tone: "Execution mode" }
  }
  return { label: "CONCEPTUALIZE", color: COLORS.conceptualize, tone: "Graph editing mode" }
}

function renderPromptMessageHeader(message: ReturnType<typeof activeSession>["messages"][number]): Renderable | VNode<any, any[]> {
  if (message.role === "assistant") {
    const statusSuffix = message.status === "streaming" ? "thinking ·" : message.status === "error" ? "error ·" : ""
    return Box(
      { width: "100%", flexDirection: "row", justifyContent: "flex-end", gap: 1 },
      ...(statusSuffix ? [Text({ content: statusSuffix, fg: message.status === "error" ? COLORS.error : COLORS.border })] : []),
      Text({ content: "Assistant", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
    )
  }

  const { label, color } = promptModePresentation(message.mode ?? "plan")
  return Box(
    { width: "100%", flexDirection: "row", justifyContent: "flex-start" },
    Text({ content: label, fg: color, attributes: TextAttributes.BOLD }),
  )
}

export function renderPromptThreadContent(state: AppState, editor: NonNullable<AppState["editorModal"]>): Renderable | VNode<any, any[]> {
  const previewWidth = promptPreviewWidth(state)
  const history = activeSession(state).messages.slice(0, -1)
  return Box(
    { width: "100%", flexDirection: "column", gap: 1 },
    ...history.map((message) => Box(
      {
        width: "100%",
        paddingX: 1,
        paddingY: 1,
        backgroundColor: message.role === "assistant" ? "#162028" : message.mode === "build" ? "#221c17" : message.mode === "conceptualize" ? "#182219" : "#171a22",
        borderStyle: "rounded",
        borderColor: message.role === "assistant" ? COLORS.accent : (message.mode === "build" ? COLORS.build : message.mode === "conceptualize" ? COLORS.conceptualize : COLORS.plan),
        flexDirection: "column",
        gap: 1,
      },
      renderPromptMessageHeader(message),
      ...(promptPreviewLines(message.text, previewWidth, 24).map((line) => Text({}, ...textNodesForChunks(promptPreviewChunks(line))))),
    )),
  )
}

function renderConceptsPaneContent(state: AppState, listScroll: ScrollBoxRenderable): Renderable | VNode<any, any[]> {
  return state.conceptNavigationFocused ? listScroll : renderPromptBudgetPane(state)
}


function renderTransitionPaneContent(state: AppState, focus: WorkspaceFocus, listScroll: ScrollBoxRenderable, mainScroll: ScrollBoxRenderable, promptScroll: ScrollBoxRenderable | null): WorkspaceRects & { sessionNode: Renderable | VNode<any, any[]>; contextNode: Renderable | VNode<any, any[]>; conceptPreviewNode: Renderable | VNode<any, any[]>; detailsNode: Renderable | VNode<any, any[]>; conceptsNode: Renderable | VNode<any, any[]> } | null {
  const rects = workspaceRects(shellWorkspaceUiState(state), currentViewport())
  if (!rects) return null
  return renderTransitionPaneContentWithRects(state, focus, rects, listScroll, mainScroll, promptScroll)
}

function renderTransitionPaneContentWithRects(state: AppState, focus: WorkspaceFocus, rects: WorkspaceRects, listScroll: ScrollBoxRenderable, mainScroll: ScrollBoxRenderable, promptScroll: ScrollBoxRenderable | null): WorkspaceRects & { sessionNode: Renderable | VNode<any, any[]>; contextNode: Renderable | VNode<any, any[]>; conceptPreviewNode: Renderable | VNode<any, any[]>; detailsNode: Renderable | VNode<any, any[]>; conceptsNode: Renderable | VNode<any, any[]> } | null {
  if (!rects) return null
  return {
    ...rects,
    sessionNode: renderSessionTransitionBody(state),
    contextNode: renderPromptBudgetPane(state),
    conceptPreviewNode: renderConceptPreviewPane(state),
    detailsNode: renderDetailsTransitionBody(state),
    conceptsNode: focus === "concepts" ? Box({ width: "100%", height: "100%" }, listScroll) : Box({ width: "100%", height: "100%" }, mainScroll),
  }
}


function frameViewModel(state: AppState): ShellWorkspaceFrameViewModel {
  const geometry = wideWorkspaceGeometry(shellWorkspaceUiState(state), currentViewport())
  return {
    layoutMode: state.layoutMode,
    conceptNavigationFocused: state.conceptNavigationFocused,
    promptPaneFocused: state.editorModal?.target.kind === "prompt" && state.editorModal.renderable.focused,
    promptPaneWidth: geometry?.promptPaneWidth ?? null,
    sidebarWidth: geometry?.sidebarWidth ?? null,
    supportHeight: state.layoutMode === "wide" ? geometry?.supportHeight ?? 22 : 8,
    previewHeight: state.layoutMode === "wide" ? geometry?.previewHeight ?? 5 : 8,
  }
}

export function renderFrame(state: AppState, listScroll: ScrollBoxRenderable, mainScroll: ScrollBoxRenderable, promptScroll: ScrollBoxRenderable | null): Renderable | VNode<any, any[]> {
  const viewModel = frameViewModel(state)
  const conceptsContent = renderConceptsPaneContent(state, listScroll)
  const overlays: Array<Renderable | VNode<any, any[]>> = []
  overlays.push(...renderAppOverlays(state))
  overlays.push(...renderInspectorOverlay(inspectorOverlayViewModel(state), mainScroll))
  overlays.push(...renderPromptSuggestionOverlay(state))

  if (state.createConceptModal) {
    overlays.push(...renderCreateConceptModal(state, state.createConceptModal))
  }
  overlays.push(...renderSessionModal(state))
  overlays.push(...renderConfirmModal(state))
  overlays.push(...renderWorkspaceTransitionOverlay(state, {
    shellState: shellWorkspaceUiState(state),
    viewport: currentViewport(),
    listScroll,
    mainScroll,
    promptScroll,
    renderTransitionPaneContentWithRects,
  }))

  return renderWorkspaceFrame(
    viewModel,
    {
      main: {
        key: "main",
        title: "Concepts",
        borderColor: state.conceptNavigationFocused ? COLORS.borderActive : COLORS.border,
        content: conceptsContent,
      },
      supportTop: state.conceptNavigationFocused
        ? { key: "details", content: renderDetailsPane(state) }
        : { key: "context", title: "Context", shellFrame: true, content: renderPromptBudgetPane(state) },
      supportBottom: state.conceptNavigationFocused
        ? { key: "session-preview", content: renderPromptPreviewPane(state) }
        : { key: "concept-preview", content: renderConceptPreviewPane(state) },
      session: {
        key: "session",
        title: "Session",
        borderColor: viewModel.promptPaneFocused ? COLORS.borderActive : COLORS.border,
        content: renderPromptPane(state, promptScroll),
      },
    },
    overlays,
  )
}

export function replaceChildren(renderable: { getChildren: () => Renderable[]; add: (child: Renderable | VNode<any, any[]>, index?: number) => number }, child: Renderable | VNode<any, any[]>): void {
  for (const existing of renderable.getChildren()) {
    existing.destroy()
  }
  renderable.add(child)
}


export function repaint(state: AppState, listScroll: ScrollBoxRenderable, mainScroll: ScrollBoxRenderable, promptScroll: ScrollBoxRenderable | null, root: { getChildren: () => Renderable[]; add: (child: Renderable | VNode<any, any[]>, index?: number) => number }): void {
  const selectedNode = currentNode(state)
  const nextContextKey = `${contextKeyForNode(selectedNode.path, selectedNode.loc, selectedNode.summary)}::${state.inspector?.kind ?? "none"}`
  const shouldRefreshContext = contextPreviewKey !== nextContextKey
  const renderVersion = shouldRefreshContext ? (contextRenderVersion += 1) : contextRenderVersion

  replaceChildren(
    listScroll,
    renderConceptList(state),
  )

  if (shouldRefreshContext) {
    contextPreviewKey = nextContextKey
    if (state.inspector) {
      const title = conceptCodeInspectorPreviewProvider.titleFor(state, selectedNode, state.inspector.kind)
      void conceptCodeInspectorPreviewProvider.previewFor(state, selectedNode, state.inspector.kind).then(async (preview: ContextPreview) => {
        if (renderVersion !== contextRenderVersion || contextPreviewKey !== nextContextKey) return
        state.contextTitle = title
        state.contextLegendItems = conceptCodeInspectorPreviewProvider.legendItemsFor(preview).map((item) => ({ kindLabel: item.label, color: item.color }))
        if (preview.useSyntaxStyle) {
          await getSnippetSyntaxStyle()
          if (renderVersion !== contextRenderVersion || contextPreviewKey !== nextContextKey) return
        }
        replaceChildren(mainScroll, Box({ width: "100%", flexDirection: "column", gap: 0 }, ...preview.lines.map((line: ContextPreview["lines"][number]) => Text({}, ...textNodesForChunks(line.chunks)))))
        mainScroll.scrollTo({ x: 0, y: state.mainScrollTop })
        replaceChildren(root, renderFrame(state, listScroll, mainScroll, promptScroll))
      })
    } else {
      state.contextTitle = "Inspector"
      state.contextLegendItems = []
      replaceChildren(mainScroll, Box({ width: "100%" }))
    }
  }

  replaceChildren(root, renderFrame(state, listScroll, mainScroll, promptScroll))
}
