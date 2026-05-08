import { RGBA, type Renderable, type VNode, Box, ScrollBoxRenderable, Text, TextAttributes, TextNodeRenderable, type TextChunk } from "@opentui/core"
import { renderWorkspaceFrame } from "agent-tui/render/frame"
import { renderInspectorOverlay } from "agent-tui/render/inspector"
import type { ShellWorkspaceFrameViewModel, WorkspaceFocus } from "agent-tui/types"

import { currentNode } from "../core/state"
import type { AppState } from "../core/types"
import { workspaceUiState } from "../core/state"
import { inspectorOverlayViewModel, renderAppOverlays } from "../conceptcode-ui/overlays"
import { activePrimaryPaneFeature, enabledPrimaryPaneFeatures } from "../features"
import { activeSession } from "../sessions/store"
import { renderConceptPreviewPane, renderDetailsPane, renderDetailsTransitionBody, renderPromptBudgetPane, renderPromptPane, renderPromptPreviewPane, renderPromptSuggestionOverlay, renderSessionTransitionBody } from "../conceptcode-ui/panes"
import { renderConceptList } from "./concepts-list"
import { renderConfirmModal, renderCreateConceptModal, renderSessionModal } from "./modals"
import { conceptCodeInspectorPreviewProvider, getSnippetSyntaxStyle, type ContextPreview } from "./snippet"
import { COLORS } from "./theme"
import { promptPreviewChunks, promptPreviewLines, promptPreviewWidth, textNodesForChunks } from "./text"
import { renderWorkspaceTransitionOverlay, wideWorkspaceGeometry, type WorkspaceRects } from "./workspace-transition"

function currentViewport() {
  return {
    width: process.stdout.columns || 120,
    height: process.stdout.rows || 36,
  }
}

let contextRenderVersion = 0
let contextPreviewKey: string | null = null

function featureTabLabel(featureId: string): string {
  if (featureId === "conceptcode") return "Concepts"
  if (featureId === "symphony") return "Symphony"
  return featureId
}

function renderFeatureTabTitle(state: Pick<AppState, "enabledPrimaryFeatureIds" | "activePrimaryFeatureId">): string {
  const features = enabledPrimaryPaneFeatures(state)
  if (features.length <= 1) {
    return featureTabLabel(activePrimaryPaneFeature(state).id)
  }
  return features
    .map((feature) => feature.id === state.activePrimaryFeatureId ? `[ ${featureTabLabel(feature.id)} ]` : featureTabLabel(feature.id))
    .join("  ")
}

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

function conceptNamespacePresentation(mode: AppState["conceptNamespaceMode"]): { label: string; color: string } {
  if (mode === "domain") {
    return { label: "DOMAIN", color: COLORS.conceptualize }
  }
  return { label: "IMPLEMENTATION", color: COLORS.accent }
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
  const feature = activePrimaryPaneFeature(state)
  if (!feature.renderPrimaryPaneContent) {
    return state.conceptNavigationFocused ? listScroll : renderPromptBudgetPane(state)
  }
  return feature.renderPrimaryPaneContent(state, listScroll)
}

function renderContextSupportPane(state: AppState): Renderable | VNode<any, any[]> {
  return Box(
    { width: "100%", height: "100%", flexDirection: "column", gap: 1 },
    Text({ content: "Context", fg: COLORS.accentSoft, attributes: TextAttributes.BOLD }),
    Box({ width: "100%", flexGrow: 1, minHeight: 0 }, renderPromptBudgetPane(state)),
  )
}

function renderTransitionPaneContentWithRects(state: AppState, focus: WorkspaceFocus, rects: WorkspaceRects, listScroll: ScrollBoxRenderable, mainScroll: ScrollBoxRenderable, promptScroll: ScrollBoxRenderable | null): WorkspaceRects & { sessionNode: Renderable | VNode<any, any[]>; contextNode: Renderable | VNode<any, any[]>; detailsNode: Renderable | VNode<any, any[]>; conceptsNode: Renderable | VNode<any, any[]>; conceptsTitle: string } | null {
  if (!rects) return null
  return {
    ...rects,
    sessionNode: renderSessionTransitionBody(state),
    contextNode: renderContextSupportPane(state),
    detailsNode: renderDetailsTransitionBody(state),
    conceptsNode: focus === "concepts" ? Box({ width: "100%", height: "100%" }, listScroll) : Box({ width: "100%", height: "100%" }, mainScroll),
    conceptsTitle: renderFeatureTabTitle(state),
  }
}


function frameViewModel(state: AppState): ShellWorkspaceFrameViewModel {
  const geometry = wideWorkspaceGeometry(workspaceUiState(state), currentViewport())
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
  const conceptNamespace = conceptNamespacePresentation(state.conceptNamespaceMode)
  const activeFeature = activePrimaryPaneFeature(state)
  const enabledFeatureCount = enabledPrimaryPaneFeatures(state).length
  const mainPaneTitle = renderFeatureTabTitle(state)
  const conceptsWorkspaceSupportTop = activeFeature.renderConceptsWorkspaceSupportTop?.(state) ?? renderDetailsPane(state)
  const mainPaneFooterStart = activeFeature.id === "conceptcode"
    ? Text({ content: conceptNamespace.label, fg: conceptNamespace.color, attributes: TextAttributes.BOLD })
    : Text({ content: featureTabLabel(activeFeature.id).toUpperCase(), fg: COLORS.accent, attributes: TextAttributes.BOLD })
  const mainPaneFooterEnd = Text({ content: enabledFeatureCount > 1 ? "[ / ] feature" : (state.conceptNavigationFocused ? "Tab namespace, Shift+Tab focus" : "Tab focus"), fg: COLORS.border })
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
      shellState: workspaceUiState(state),
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
        title: mainPaneTitle,
        borderColor: state.conceptNavigationFocused ? COLORS.borderActive : COLORS.border,
        content: conceptsContent,
        footerStart: mainPaneFooterStart,
        footerEnd: mainPaneFooterEnd,
      },
      supportTop: state.conceptNavigationFocused
        ? { key: "details", content: conceptsWorkspaceSupportTop }
        : { key: "context", content: renderContextSupportPane(state) },
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
