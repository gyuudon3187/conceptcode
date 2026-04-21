import { RGBA, type Renderable, type VNode, Box, ScrollBoxRenderable, Text, TextAttributes, TextNodeRenderable, type TextChunk } from "@opentui/core"

import { currentNode, currentPath, visiblePaths } from "../core/state"
import type { AppState, ChatSession, CreateConceptModalState, ListLine, WorkspaceFocus } from "../core/types"
import { slashSuggestionDescription, visiblePromptSuggestions } from "../prompt/editor"
import { activeSession } from "../sessions/store"
import { renderConceptList } from "./concepts-list"
import { renderConfirmModal, renderCreateConceptModal, renderSessionModal } from "./modals"
import { getSnippetSyntaxStyle, buildMetadataPreview, buildSnippetPreview, buildSubtreePreview, type ContextPreview, type PreviewLegendItem } from "./snippet"
import { COLORS } from "./theme"
import { promptPreviewChunks, promptPreviewLines, promptPreviewWidth, textNodesForChunks, truncateFromStart, truncateSingleLine } from "./text"
import { renderWorkspaceTransitionOverlay, rightAlignedLeft, wideWorkspaceGeometry, workspaceRects, type PaneRect, type WorkspaceRects } from "./workspace-transition"

function maxVisibleAliasSuggestions(): number {
  const viewportHeight = process.stdout.rows || 24
  return viewportHeight <= 32 ? 3 : 4
}

let contextRenderVersion = 0
let contextPreviewKey: string | null = null

function contextKeyForNode(path: string, loc: { file: string; startLine: number; endLine: number } | null, summary: string): string {
  if (!loc) return `${path}::no-loc::${summary}`
  return `${path}::${loc.file}:${loc.startLine}-${loc.endLine}::${summary}`
}

function renderLegendFooter(items: PreviewLegendItem[]): Renderable | VNode<any, any[]> {
  if (items.length === 0) return Box({ width: "100%" })
  const nodes: Array<Renderable | VNode<any, any[]>> = []
  items.forEach((item, index) => {
    if (index > 0) nodes.push(Text({ content: "  ·  ", fg: COLORS.border }))
    nodes.push(Text({ content: item.kindLabel, fg: item.color, attributes: TextAttributes.BOLD }))
  })
  return Box(
    { position: "absolute", right: 1, bottom: 0 },
    Box({ borderStyle: "rounded", borderColor: COLORS.border, backgroundColor: COLORS.panel, paddingX: 1, paddingY: 0, flexDirection: "row", flexWrap: "wrap" }, ...nodes),
  )
}


function latestConversationPreview(state: AppState): { text: string; role: "user" | "assistant" | "none"; status: "streaming" | "complete" | "error" | "idle" } {
  const session = activeSession(state)
  const activeAssistantId = state.activeAssistantMessageId
  if (activeAssistantId) {
    const activeAssistant = session.messages.find((message) => message.id === activeAssistantId && message.role === "assistant")
    if (activeAssistant) {
      return {
        text: activeAssistant.text.trim() || "Assistant is thinking...",
        role: "assistant",
        status: activeAssistant.status ?? "streaming",
      }
    }
  }

  const latestUserMessage = [...session.messages].reverse().find((message) => message.role === "user" && message.text.trim())
  if (latestUserMessage) {
    return { text: latestUserMessage.text.trim(), role: "user", status: latestUserMessage.status ?? "complete" }
  }

  if (session.draftPromptText.trim()) {
    return { text: session.draftPromptText.trim(), role: "user", status: "complete" }
  }

  return { text: "Prompt workspace available", role: "none", status: "idle" }
}

function renderDetailsPane(state: AppState): Renderable | VNode<any, any[]> {
  const node = currentNode(state)
  const body = node.summary.trim() || "No summary for this concept yet."
  const metricText = (label: string, value: number | null): string => `${label} ${value === null ? "--" : `${Math.round(value * 100)}%`}`
  return Box(
    { width: "100%", height: "100%", borderStyle: "rounded", borderColor: COLORS.border, title: "Details", padding: 1, backgroundColor: COLORS.panel, flexDirection: "column", gap: 1 },
    Box(
      { width: "100%", flexDirection: "row", justifyContent: "space-between" },
      Text({ content: truncateSingleLine(node.title, state.layoutMode === "wide" ? 24 : 18), fg: COLORS.text, attributes: TextAttributes.BOLD }),
      Text({ content: node.kind ?? "(no kind)", fg: COLORS.accentSoft }),
    ),
    Box(
      { width: "100%", flexDirection: "row", gap: 2 },
      Text({ content: metricText("Explored", node.explorationCoverage), fg: COLORS.muted }),
      Text({ content: metricText("Summary", node.summaryConfidence), fg: COLORS.muted }),
    ),
    Text({ content: body, fg: node.summary.trim() ? COLORS.text : COLORS.muted }),
  )
}

function renderPromptPreviewPane(state: AppState): Renderable | VNode<any, any[]> {
  const preview = latestConversationPreview(state)
  const statusLabel = preview.status === "streaming"
    ? "thinking"
    : preview.status === "error"
      ? "error"
      : "idle"
  const hint = "Tab -> Prompt"
  const width = Math.max(16, promptPreviewWidth(state) - hint.length - 12)
  const lines = promptPreviewLines(preview.text, width, 1)
  const leftLabel = preview.role === "assistant" ? "Live reply" : preview.role === "user" ? "Draft" : ""
  return Box(
    { width: "100%", height: "100%", borderStyle: "rounded", borderColor: COLORS.border, title: `Session: ${statusLabel}`, padding: 1, backgroundColor: COLORS.panel, flexDirection: "column", gap: 1 },
    Box(
      { width: "100%", height: "100%", paddingX: 1, backgroundColor: COLORS.panelSoft, flexDirection: "column", gap: 1 },
      Box(
        { width: "100%", flexDirection: "column", gap: 0 },
        ...(leftLabel ? [Text({ content: leftLabel, fg: COLORS.muted })] : []),
        ...lines.map((line) => Text({}, ...textNodesForChunks(promptPreviewChunks(line || " ")))),
      ),
      Box(
        { width: "100%", flexGrow: 1, flexDirection: "row", justifyContent: "flex-end", alignItems: "flex-end" },
        Text({ content: hint, fg: COLORS.border }),
      ),
    ),
  )
}

function renderConceptPreviewPane(state: AppState): Renderable | VNode<any, any[]> {
  const node = currentNode(state)
  const summary = node.summary.trim() || "No summary for this concept yet."
  return Box(
    { width: "100%", height: "100%", borderStyle: "rounded", borderColor: COLORS.border, title: "Concepts", padding: 1, backgroundColor: COLORS.panel, flexDirection: "column", gap: 1 },
    Box(
      { width: "100%", flexDirection: "row", justifyContent: "space-between" },
      Text({ content: truncateSingleLine(node.title, state.layoutMode === "wide" ? 22 : 18), fg: COLORS.text, attributes: TextAttributes.BOLD }),
      Text({ content: node.kind ?? "(no kind)", fg: COLORS.accentSoft }),
    ),
    Text({ content: truncateSingleLine(summary, state.layoutMode === "wide" ? 54 : 34), fg: node.summary.trim() ? COLORS.text : COLORS.muted }),
    Box(
      { width: "100%", flexDirection: "row", justifyContent: "flex-end" },
      Text({ content: "Shift+Tab -> Concepts", fg: COLORS.border }),
    ),
  )
}

function renderSessionTransitionBody(state: AppState): Renderable | VNode<any, any[]> {
  const preview = latestConversationPreview(state)
  const label = preview.role === "assistant" ? "Live reply" : preview.role === "user" ? "Draft" : "Session"
  const line = promptPreviewLines(preview.text, Math.max(18, promptPreviewWidth(state) - 8), 1)[0] || "Session"
  return Box(
    { width: "100%", height: "100%", flexDirection: "column", gap: 1 },
    Box(
      { width: "100%", flexDirection: "column", gap: 0 },
      Text({ content: label, fg: COLORS.muted }),
      Text({}, ...textNodesForChunks(promptPreviewChunks(line))),
    ),
  )
}

function renderDetailsTransitionBody(state: AppState): Renderable | VNode<any, any[]> {
  const node = currentNode(state)
  const body = truncateSingleLine(node.summary.trim() || "No summary for this concept yet.", 42)
  return Box(
    { width: "100%", height: "100%", flexDirection: "column", gap: 1 },
    Box(
      { width: "100%", flexDirection: "row", justifyContent: "space-between" },
      Text({ content: truncateSingleLine(node.title, 22), fg: COLORS.text, attributes: TextAttributes.BOLD }),
      Text({ content: node.kind ?? "(no kind)", fg: COLORS.accentSoft }),
    ),
    Text({ content: body, fg: node.summary.trim() ? COLORS.text : COLORS.muted }),
  )
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

function renderPromptPane(state: AppState, promptScroll: ScrollBoxRenderable | null): Renderable | VNode<any, any[]> {
  const session = activeSession(state)
  const editor = state.editorModal?.target.kind === "prompt" ? state.editorModal : null
  const promptFocused = editor?.renderable.focused ?? false
  const { label: modeLabel, color: modeColor, tone: modeTone } = promptModePresentation(state.uiMode)
  const content = editor
    ? Box(
        { width: "100%", height: "100%", flexDirection: "column", gap: 1 },
        Box({ width: "100%", flexGrow: 1, minHeight: 0 }, promptScroll ?? Box({ width: "100%" })),
        Box(
          { width: "100%", flexDirection: "column", gap: 1 },
          Box({ width: "100%", minHeight: editor.visibleLineCount + 2, maxHeight: editor.visibleLineCount + 2, backgroundColor: COLORS.panelSoft, flexDirection: "column" }, editor.renderable),
          Box(
            { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingX: 1 },
            Box(
              { flexDirection: "row", alignItems: "center", gap: 1 },
              Text({ content: modeLabel, fg: modeColor, attributes: TextAttributes.BOLD }),
              Text({ content: modeTone, fg: COLORS.muted }),
            ),
            Text({ content: "Tab mode, Shift+Tab focus", fg: COLORS.border }),
          ),
        ),
      )
    : Box(
        { width: "100%", minHeight: 8, flexDirection: "column", gap: 1 },
        Box(
          { width: "100%", paddingX: 1, paddingY: 1, backgroundColor: COLORS.panelSoft, flexDirection: "column", gap: 0 },
          ...(session.draftPromptText.trim()
            ? promptPreviewLines(session.draftPromptText, promptPreviewWidth(state), 8).map((line) => Text({}, ...textNodesForChunks(promptPreviewChunks(line))))
            : [Text({ content: "Start writing your prompt here. Press Shift+Tab to edit.", fg: COLORS.muted })]),
        ),
        Box(
          { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingX: 1 },
          Box(
            { flexDirection: "row", alignItems: "center", gap: 1 },
            Text({ content: modeLabel, fg: modeColor, attributes: TextAttributes.BOLD }),
            Text({ content: modeTone, fg: COLORS.muted }),
          ),
          Text({ content: "Tab mode, Shift+Tab focus", fg: COLORS.border }),
        ),
      )
  return Box(
    { width: "100%", borderStyle: "rounded", borderColor: promptFocused ? COLORS.borderActive : COLORS.border, title: "Session", padding: 1, backgroundColor: COLORS.panel, flexDirection: "column", gap: 1, flexGrow: 1 },
    content,
  )
}

function renderPromptBudgetPane(state: AppState): Renderable | VNode<any, any[]> {
  const breakdown = state.promptTokenBreakdown
  const maxPathWidth = state.layoutMode === "wide" ? 30 : 22
  const conceptReferences = [...breakdown.referencedConcepts].sort((left, right) => left.path.localeCompare(right.path))
  const fileReferences = [...breakdown.referencedFiles].sort((left, right) => left.path.localeCompare(right.path))
  const references = [...conceptReferences, ...fileReferences]
  const referenceRows = references.length > 0
    ? references.map((reference) => Box(
        { width: "100%", flexDirection: "row", justifyContent: "space-between", minHeight: 1 },
        Text({ content: truncateSingleLine(reference.alias, maxPathWidth), fg: reference.alias.startsWith("@") ? COLORS.warning : COLORS.accent, attributes: TextAttributes.BOLD }),
        Text({ content: String(reference.tokenCount), fg: COLORS.text }),
      ))
    : [Text({ content: "No referenced concepts or files", fg: COLORS.muted })]
  return Box(
    { width: "100%", height: "100%", flexDirection: "column", gap: 1 },
    Text({ content: `Total prompt tokens: ${breakdown.totalTokenCount}`, fg: COLORS.text, attributes: TextAttributes.BOLD }),
    Box(
      { width: "100%", flexDirection: "column", gap: 0 },
      Text({ content: `Static context: ${breakdown.staticTokenCount}`, fg: COLORS.muted }),
      Text({ content: `Prompt text: ${breakdown.promptTextTokenCount}`, fg: COLORS.muted }),
      Text({ content: `Referenced concepts: ${breakdown.referencedConceptTokenCount}`, fg: COLORS.muted }),
      Text({ content: `Referenced files: ${breakdown.referencedFileTokenCount}`, fg: COLORS.muted }),
    ),
    Box(
      { width: "100%", flexDirection: "column", gap: 0, flexGrow: 1 },
      Text({ content: "References", fg: COLORS.accentSoft, attributes: TextAttributes.BOLD }),
      ...referenceRows,
    ),
  )
}

function renderConceptsPaneContent(state: AppState, listScroll: ScrollBoxRenderable): Renderable | VNode<any, any[]> {
  return state.conceptNavigationFocused ? listScroll : renderPromptBudgetPane(state)
}


function renderTransitionPaneContent(state: AppState, focus: WorkspaceFocus, listScroll: ScrollBoxRenderable, mainScroll: ScrollBoxRenderable, promptScroll: ScrollBoxRenderable | null): WorkspaceRects & { sessionNode: Renderable | VNode<any, any[]>; contextNode: Renderable | VNode<any, any[]>; conceptPreviewNode: Renderable | VNode<any, any[]>; detailsNode: Renderable | VNode<any, any[]>; conceptsNode: Renderable | VNode<any, any[]> } | null {
  const rects = workspaceRects(state)
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


function renderTaskPane(state: AppState, promptScroll: ScrollBoxRenderable | null): Renderable | VNode<any, any[]> {
  const viewportWidth = process.stdout.columns || 120
  const frameInnerWidth = Math.max(state.uiLayoutConfig.minFrameWidth, viewportWidth - state.uiLayoutConfig.viewportHorizontalInset)
  const widePromptWidth = Math.max(state.uiLayoutConfig.minPromptPaneWidth, Math.floor((frameInnerWidth - state.uiLayoutConfig.interPaneGap) * state.promptPaneRatio))
  const options = state.layoutMode === "wide"
    ? { width: widePromptWidth, flexBasis: widePromptWidth, minWidth: state.uiLayoutConfig.minPromptPaneWidth, flexGrow: 0, flexShrink: 0, flexDirection: "column" as const, gap: state.uiLayoutConfig.interPaneGap }
    : { width: "100%" as const, flexGrow: 0, flexShrink: 0, flexDirection: "column" as const, gap: state.uiLayoutConfig.interPaneGap }
  return Box(
    options,
    renderPromptPane(state, promptScroll),
  )
}

function renderInspectorOverlay(state: AppState, mainScroll: ScrollBoxRenderable): Array<Renderable | VNode<any, any[]>> {
  if (!state.inspector) return []
  const selectedNode = currentNode(state)
  const titleByKind = {
    snippet: selectedNode.loc ? `Snippet ${selectedNode.loc.file}:${selectedNode.loc.startLine}-${selectedNode.loc.endLine}` : "Snippet",
    subtree: `Subtree ${selectedNode.title}`,
    metadata: `Metadata ${selectedNode.title}`,
  }
  return [
    Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000088" }),
    Box(
      { position: "absolute", top: state.layoutMode === "wide" ? 3 : 2, left: state.layoutMode === "wide" ? "50%" : 2, width: state.layoutMode === "wide" ? 104 : "94%", height: state.layoutMode === "wide" ? "82%" : "84%", padding: 1, backgroundColor: COLORS.panel, borderStyle: "rounded", borderColor: COLORS.borderActive, marginLeft: state.layoutMode === "wide" ? -52 : undefined, flexDirection: "column" },
      Box(
        { width: "100%", flexDirection: "row", justifyContent: "space-between" },
        Text({ content: titleByKind[state.inspector.kind], fg: COLORS.accent, attributes: TextAttributes.BOLD }),
        Text({ content: "Esc -> Close  PgUp/PgDn -> Scroll", fg: COLORS.muted }),
      ),
      Box({ width: "100%", height: "100%", flexDirection: "column" }, Box({ width: "100%", height: "100%" }, mainScroll), renderLegendFooter(state.contextLegendItems ?? [])),
    ),
  ]
}

export function renderFrame(state: AppState, listScroll: ScrollBoxRenderable, mainScroll: ScrollBoxRenderable, promptScroll: ScrollBoxRenderable | null): Renderable | VNode<any, any[]> {
  const geometry = wideWorkspaceGeometry(state)
  const promptPaneWidth = geometry?.promptPaneWidth ?? null
  const sidebarWidth = geometry?.sidebarWidth ?? null
  const promptFocused = state.editorModal?.target.kind === "prompt" && state.editorModal.renderable.focused
  const conceptsContent = renderConceptsPaneContent(state, listScroll)
  const sidebarOptions = state.layoutMode === "wide" && sidebarWidth !== null
    ? { width: sidebarWidth, flexBasis: sidebarWidth, minWidth: 24, flexGrow: 1, flexShrink: 1, flexDirection: "column" as const, gap: 1 }
    : { width: "100%" as const, flexGrow: 0, flexShrink: 0, flexDirection: "column" as const, gap: 1 }
  const supportHeight = state.layoutMode === "wide" ? geometry?.supportHeight ?? 22 : undefined
  const previewHeight = state.layoutMode === "wide" ? geometry?.previewHeight ?? 5 : 8
  const supportColumn = state.conceptNavigationFocused
    ? Box(
        { ...sidebarOptions, height: "100%" },
        Box({ width: "100%", minHeight: supportHeight, maxHeight: supportHeight, flexDirection: "column" }, renderDetailsPane(state)),
        Box({ width: "100%", flexGrow: 1, minHeight: previewHeight, flexDirection: "column" }, renderPromptPreviewPane(state)),
      )
    : Box(
        { ...sidebarOptions, height: "100%" },
        Box({ width: "100%", minHeight: supportHeight, maxHeight: supportHeight, borderStyle: "rounded", borderColor: COLORS.border, title: "Context", padding: 1, backgroundColor: COLORS.panel, flexDirection: "column" }, renderPromptBudgetPane(state)),
        Box({ width: "100%", flexGrow: 1, minHeight: previewHeight, flexDirection: "column" }, renderConceptPreviewPane(state)),
      )
  const conceptsPane = Box(
    { flexGrow: 1, borderStyle: "rounded", borderColor: state.conceptNavigationFocused ? COLORS.borderActive : COLORS.border, title: "Concepts", padding: 1, backgroundColor: COLORS.panel },
    conceptsContent,
  )
  const promptPane = renderTaskPane(state, promptScroll)
  const overlays: Array<Renderable | VNode<any, any[]>> = []

  if (state.editorModal && state.editorModal.target.kind !== "prompt") {
    overlays.push(
      Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000066" }),
      Box(
        { position: "absolute", top: state.layoutMode === "wide" ? 7 : 5, left: state.layoutMode === "wide" ? "50%" : 2, width: state.layoutMode === "wide" ? 84 : "94%", padding: 1, backgroundColor: COLORS.panel, borderStyle: "rounded", borderColor: COLORS.borderActive, marginLeft: state.layoutMode === "wide" ? -42 : undefined, flexDirection: "column", gap: 1 },
        Text({ content: `Edit Summary: ${state.editorModal.target.path}`, fg: COLORS.accent, attributes: TextAttributes.BOLD }),
        Box({ width: "100%", minHeight: state.editorModal.visibleLineCount + 2, maxHeight: state.editorModal.visibleLineCount + 2, backgroundColor: COLORS.panelSoft, flexDirection: "column" }, state.editorModal.renderable),
      ),
    )
  }

  if (state.editorModal?.target.kind === "prompt" && state.editorModal.promptSuggestion) {
    const promptSuggestion = state.editorModal.promptSuggestion
    const { visible: suggestions, selectedValue } = visiblePromptSuggestions(state, promptSuggestion)
    const selectedPath = selectedValue?.startsWith("@") ? selectedValue.slice(1) : null
    const selectedSummary = selectedPath ? state.nodes.get(selectedPath)?.summary?.trim() : ""
    overlays.push(
      Box(
        { position: "absolute", bottom: 7, right: state.layoutMode === "wide" ? 2 : 1, width: state.layoutMode === "wide" ? 72 : "94%", padding: 1, backgroundColor: COLORS.panel, borderStyle: "rounded", borderColor: COLORS.warning, flexDirection: "column", gap: 1 },
        ...suggestions.map((value) => {
          const selected = value === selectedValue
          if (value.startsWith("/")) {
            return Box(
              { width: "100%", paddingX: 1, backgroundColor: selected ? COLORS.selectedBg : "#171d22", flexDirection: "column" },
              Text({ content: value, fg: selected ? COLORS.selectedFg : COLORS.accent, attributes: TextAttributes.BOLD }),
              Text({ content: selected ? slashSuggestionDescription(state, value) : truncateSingleLine(slashSuggestionDescription(state, value), state.layoutMode === "wide" ? 56 : 36), fg: selected ? COLORS.selectedFg : COLORS.muted }),
            )
          }
          if (value.startsWith("&")) {
            const path = value.slice(1)
            const isDirectory = state.projectDirectories.includes(path)
            return Box(
              { width: "100%", paddingX: 1, backgroundColor: selected ? COLORS.selectedBg : "#171d22", flexDirection: "column" },
              Text({ content: value, fg: selected ? COLORS.selectedFg : COLORS.accent, attributes: TextAttributes.BOLD }),
              Text({ content: selected ? (isDirectory ? "Directory reference" : "File reference") : truncateSingleLine(isDirectory ? "Directory reference" : "File reference", state.layoutMode === "wide" ? 56 : 36), fg: selected ? COLORS.selectedFg : COLORS.muted }),
            )
          }
          return Box(
            { width: "100%", paddingX: 1, backgroundColor: selected ? COLORS.selectedBg : "#171d22", flexDirection: "column" },
            Text({ content: value, fg: selected ? COLORS.selectedFg : COLORS.warning, attributes: TextAttributes.BOLD }),
            Text({ content: selected ? (selectedSummary || "No summary for this concept yet.") : truncateSingleLine(state.nodes.get(value.slice(1))?.summary ?? "", state.layoutMode === "wide" ? 56 : 36), fg: selected ? COLORS.selectedFg : COLORS.muted }),
          )
        }),
      ),
    )
  }

  if (state.createConceptModal) {
    overlays.push(...renderCreateConceptModal(state, state.createConceptModal))
  }
  overlays.push(...renderSessionModal(state))
  overlays.push(...renderConfirmModal(state))
  overlays.push(...renderInspectorOverlay(state, mainScroll))
  overlays.push(...renderWorkspaceTransitionOverlay(state, listScroll, mainScroll, promptScroll, renderTransitionPaneContentWithRects))

  return Box(
    { width: "100%", height: "100%", flexDirection: "column", backgroundColor: COLORS.bg, padding: 1, gap: 1 },
    ...(state.layoutMode === "wide"
      ? [
          state.conceptNavigationFocused
            ? Box({ width: "100%", flexGrow: 1, flexDirection: "row", gap: 1 }, conceptsPane, supportColumn)
            : Box({ width: "100%", flexGrow: 1, flexDirection: "row", gap: 1 }, supportColumn, promptPane),
        ]
      : [conceptsPane, state.conceptNavigationFocused ? renderDetailsPane(state) : Box({ width: "100%", borderStyle: "rounded", borderColor: COLORS.border, title: "Context", padding: 1, backgroundColor: COLORS.panel, flexDirection: "column" }, renderPromptBudgetPane(state)), state.conceptNavigationFocused ? renderPromptPreviewPane(state) : renderConceptPreviewPane(state), promptPane]),
    ...overlays,
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
    const previewBuilder = state.inspector?.kind === "snippet" ? buildSnippetPreview : state.inspector?.kind === "subtree" ? buildSubtreePreview : buildMetadataPreview
    if (state.inspector) {
      void previewBuilder(state, selectedNode).then(async (preview: ContextPreview) => {
        if (renderVersion !== contextRenderVersion || contextPreviewKey !== nextContextKey) return
        state.contextTitle = preview.title
        state.contextLegendItems = preview.legendItems ?? []
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
