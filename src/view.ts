import { appendFile } from "node:fs/promises"
import { join } from "node:path"

import { RGBA, type Renderable, type VNode, Box, ScrollBoxRenderable, Text, TextAttributes, TextNodeRenderable, type TextChunk } from "@opentui/core"

import { getSnippetSyntaxStyle, buildMetadataPreview, buildSnippetPreview, buildSubtreePreview, type ContextPreview, type PreviewLegendItem } from "./snippet"
import { visibleAliasSuggestions } from "./app/prompt-editor"
import { currentNode, currentPath, visiblePaths } from "./core/state"
import type { AppState, ChatSession, CreateConceptModalState, ListLine, WorkspaceFocus } from "./core/types"
import { activeSession } from "./session"

export const COLORS = {
  bg: "#111417",
  panel: "#1b2228",
  panelSoft: "#202930",
  border: "#38505f",
  borderActive: "#d08770",
  accent: "#88c0d0",
  accentSoft: "#8fbcbb",
  plan: "#7aa2f7",
  build: "#d19a66",
  conceptualize: "#7fbf7f",
  text: "#e5e9f0",
  muted: "#9aa7b0",
  success: "#a3be8c",
  warning: "#ebcb8b",
  error: "#bf616a",
  selectedFg: "#101418",
  selectedBg: "#f2cc8f",
} as const

const DEBUG_WORKSPACE_TRANSITION = true
const WORKSPACE_DEBUG_LOG_PATH = join(process.cwd(), "workspace-transition-debug.log")

async function appendWorkspaceDebugLog(event: string, payload: Record<string, unknown>): Promise<void> {
  if (!DEBUG_WORKSPACE_TRANSITION) return
  const line = `${JSON.stringify({ ts: new Date().toISOString(), event, ...payload })}\n`
  try {
    await appendFile(WORKSPACE_DEBUG_LOG_PATH, line, "utf8")
  } catch {
  }
}

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

function textNodesForChunks(chunks: TextChunk[]): TextNodeRenderable[] {
  return chunks.map((chunk) => TextNodeRenderable.fromString(chunk.text, { fg: chunk.fg, bg: chunk.bg, attributes: chunk.attributes }))
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

function truncateSingleLine(text: string, width: number): string {
  const compact = text.replace(/\s+/g, " ").trim()
  if (compact.length <= width) return compact
  return `${compact.slice(0, Math.max(0, width - 3))}...`
}

function truncateFromStart(text: string, width: number): string {
  const compact = text.replace(/\s+/g, " ").trim()
  if (compact.length <= width) return compact
  if (width <= 3) return compact.slice(Math.max(0, compact.length - width))
  return `...${compact.slice(Math.max(0, compact.length - (width - 3)))}`
}

function promptPreviewLines(text: string, width: number, maxLines: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n").split("\n")
  const flattened: string[] = []
  for (const line of normalized) {
    const source = line || ""
    if (source.length === 0) {
      flattened.push("")
      continue
    }
    let remaining = source
    while (remaining.length > width) {
      const segment = remaining.slice(0, width + 1)
      const breakIndex = segment.lastIndexOf(" ")
      if (breakIndex > 0) {
        flattened.push(segment.slice(0, breakIndex))
        remaining = remaining.slice(breakIndex + 1)
        continue
      }

      flattened.push(remaining.slice(0, width))
      remaining = remaining.slice(width)
    }
    flattened.push(remaining)
  }
  return flattened.slice(0, maxLines)
}

function promptPreviewWidth(state: AppState): number {
  if (state.layoutMode === "wide") {
    const viewportWidth = process.stdout.columns || 120
    const frameInnerWidth = Math.max(40, viewportWidth - 4)
    const promptPaneWidth = Math.max(28, Math.floor((frameInnerWidth - 1) * state.promptPaneRatio))
    return Math.max(16, promptPaneWidth - 8)
  }
  const viewportWidth = process.stdout.columns || 120
  const outerPadding = 10
  const promptPanePadding = 8
  return Math.max(16, viewportWidth - outerPadding - promptPanePadding)
}

function promptPreviewChunks(line: string): TextChunk[] {
  const chunks: TextChunk[] = []
  let lastIndex = 0
  for (const match of line.matchAll(/@[a-zA-Z0-9_.-]+/g)) {
    const start = match.index ?? 0
    if (start > lastIndex) {
      chunks.push({ __isChunk: true, text: line.slice(lastIndex, start), fg: RGBA.fromHex(COLORS.text) })
    }
    chunks.push({ __isChunk: true, text: match[0], fg: RGBA.fromHex(COLORS.warning), attributes: TextAttributes.BOLD })
    lastIndex = start + match[0].length
  }
  if (lastIndex < line.length) {
    chunks.push({ __isChunk: true, text: line.slice(lastIndex), fg: RGBA.fromHex(COLORS.text) })
  }
  if (chunks.length === 0) {
    chunks.push({ __isChunk: true, text: line, fg: RGBA.fromHex(COLORS.text) })
  }
  return chunks
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
  return Box(
    { width: "100%", height: "100%", borderStyle: "rounded", borderColor: COLORS.border, title: "Details", padding: 1, backgroundColor: COLORS.panel, flexDirection: "column", gap: 1 },
    Box(
      { width: "100%", flexDirection: "row", justifyContent: "space-between" },
      Text({ content: truncateSingleLine(node.title, state.layoutMode === "wide" ? 24 : 18), fg: COLORS.text, attributes: TextAttributes.BOLD }),
      Text({ content: node.kind ?? "(no kind)", fg: COLORS.accentSoft }),
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

type PaneRect = { left: number; top: number; width: number; height: number }

type WorkspaceRects = {
  session: PaneRect
  context: PaneRect
  conceptPreview: PaneRect
  details: PaneRect
  concepts: PaneRect
  canvasLeft: number
  canvasTop: number
  canvasWidth: number
  canvasHeight: number
  frameLeft: number
  frameTop: number
  frameWidth: number
  frameHeight: number
}

type WideWorkspaceGeometry = {
  frameLeft: number
  frameTop: number
  frameWidth: number
  frameHeight: number
  promptPaneWidth: number
  sidebarWidth: number
  supportHeight: number
  previewHeight: number
}

function wideWorkspaceGeometry(state: AppState): WideWorkspaceGeometry | null {
  return wideWorkspaceGeometryForRatio(state, state.promptPaneRatio)
}

function wideWorkspaceGeometryForRatio(state: AppState, promptPaneRatio: number): WideWorkspaceGeometry | null {
  if (state.layoutMode !== "wide") return null
  const config = state.uiLayoutConfig
  const viewportWidth = process.stdout.columns || 120
  const viewportHeight = process.stdout.rows || 36
  const rootPadding = config.rootPadding
  const frameInnerWidth = Math.max(config.minFrameWidth, viewportWidth - config.viewportHorizontalInset)
  const frameHeight = Math.max(config.minFrameHeight, viewportHeight - (rootPadding * 2))
  const promptPaneWidth = Math.max(config.minPromptPaneWidth, Math.floor((frameInnerWidth - config.interPaneGap) * promptPaneRatio))
  const sidebarWidth = Math.max(config.minSidebarWidth, frameInnerWidth - config.interPaneGap - promptPaneWidth)
  const supportHeight = config.supportHeight
  const previewHeight = Math.max(config.minPreviewHeight, frameHeight - supportHeight - config.interPaneGap)
  return {
    frameLeft: rootPadding,
    frameTop: rootPadding,
    frameWidth: frameInnerWidth,
    frameHeight,
    promptPaneWidth,
    sidebarWidth,
    supportHeight,
    previewHeight,
  }
}

function workspaceRects(state: AppState): WorkspaceRects | null {
  return workspaceRectsForRatio(state, state.promptPaneRatio)
}

function workspaceRectsForRatio(state: AppState, promptPaneRatio: number): WorkspaceRects | null {
  const geometry = wideWorkspaceGeometryForRatio(state, promptPaneRatio)
  if (!geometry) return null
  const rowGap = state.uiLayoutConfig.interPaneGap
  const contentTop = 0
  const contentHeight = Math.max(8, geometry.frameHeight)
  const left = 0
  const rightColumnLeft = rightAlignedLeft(geometry.frameWidth, geometry.promptPaneWidth)
  return {
    canvasLeft: 0,
    canvasTop: 0,
    canvasWidth: geometry.frameWidth,
    canvasHeight: geometry.frameHeight,
    frameLeft: geometry.frameLeft,
    frameTop: geometry.frameTop,
    frameWidth: geometry.frameWidth,
    frameHeight: geometry.frameHeight,
    session: { left: rightColumnLeft, top: contentTop, width: geometry.promptPaneWidth, height: contentHeight },
    context: { left, top: contentTop, width: geometry.sidebarWidth, height: geometry.supportHeight },
    conceptPreview: { left, top: contentTop + geometry.supportHeight + rowGap, width: geometry.sidebarWidth, height: geometry.previewHeight },
    details: { left: rightColumnLeft, top: contentTop, width: geometry.sidebarWidth, height: geometry.supportHeight },
    concepts: { left, top: contentTop, width: geometry.promptPaneWidth, height: contentHeight },
  }
}

function interpolateRect(from: PaneRect, to: PaneRect, progress: number): PaneRect {
  const minPaneWidth = 8
  const minPaneHeight = 3
  return {
    left: Math.round(from.left + (to.left - from.left) * progress),
    top: Math.round(from.top + (to.top - from.top) * progress),
    width: Math.max(minPaneWidth, Math.round(from.width + (to.width - from.width) * progress)),
    height: Math.max(minPaneHeight, Math.round(from.height + (to.height - from.height) * progress)),
  }
}

function rightAlignedLeft(containerWidth: number, paneWidth: number): number {
  return containerWidth - paneWidth
}

function interpolateValue(from: number, to: number, progress: number): number {
  return Math.round(from + (to - from) * progress)
}

function delayedProgress(progress: number, delayFraction: number): number {
  if (progress <= delayFraction) return 0
  return Math.min(1, (progress - delayFraction) / (1 - delayFraction))
}

function revealAfter(progress: number, delayFraction: number): boolean {
  return progress > delayFraction
}

function acceleratedProgress(progress: number, factor: number): number {
  return Math.min(1, progress * factor)
}

function blendProgress(progress: number, start: number, end: number): number {
  if (progress <= start) return 0
  if (progress >= end) return 1
  return (progress - start) / (end - start)
}

function interpolateVerticalStack(topFrom: PaneRect, bottomFrom: PaneRect, topTo: PaneRect, bottomTo: PaneRect, progress: number, gap: number): { topRect: PaneRect; bottomRect: PaneRect } {
  const topLeft = interpolateValue(topFrom.left, topTo.left, progress)
  const topWidth = interpolateValue(topFrom.width, topTo.width, progress)
  const bottomLeft = interpolateValue(bottomFrom.left, bottomTo.left, progress)
  const bottomWidth = interpolateValue(bottomFrom.width, bottomTo.width, progress)
  const columnTop = interpolateValue(topFrom.top, topTo.top, progress)
  const columnBottom = interpolateValue(bottomFrom.top + bottomFrom.height, bottomTo.top + bottomTo.height, progress)
  const topHeight = Math.max(3, interpolateValue(topFrom.height, topTo.height, progress))
  const bottomTop = columnTop + topHeight + gap
  const bottomHeight = Math.max(3, columnBottom - bottomTop)
  return {
    topRect: { left: topLeft, top: columnTop, width: topWidth, height: topHeight },
    bottomRect: { left: bottomLeft, top: bottomTop, width: bottomWidth, height: bottomHeight },
  }
}

function interpolateBottomAnchoredRect(from: PaneRect, to: PaneRect, progress: number): PaneRect {
  const left = Math.round(from.left + (to.left - from.left) * progress)
  const width = Math.max(8, Math.round(from.width + (to.width - from.width) * progress))
  const height = Math.max(3, Math.round(from.height + (to.height - from.height) * progress))
  const fromBottom = from.top + from.height
  const toBottom = to.top + to.height
  const bottom = Math.round(fromBottom + (toBottom - fromBottom) * progress)
  return {
    left,
    top: bottom - height,
    width,
    height,
  }
}

function interpolateBottomRightAnchoredRect(from: PaneRect, to: PaneRect, progress: number): PaneRect {
  const width = Math.max(8, Math.round(from.width + (to.width - from.width) * progress))
  const height = Math.max(3, Math.round(from.height + (to.height - from.height) * progress))
  const fromRight = from.left + from.width
  const toRight = to.left + to.width
  const right = Math.round(fromRight + (toRight - fromRight) * progress)
  const fromBottom = from.top + from.height
  const toBottom = to.top + to.height
  const bottom = Math.round(fromBottom + (toBottom - fromBottom) * progress)
  return {
    left: right - width,
    top: bottom - height,
    width,
    height,
  }
}

function interpolateTopRightAnchoredRect(from: PaneRect, to: PaneRect, progress: number): PaneRect {
  const width = Math.max(8, Math.round(from.width + (to.width - from.width) * progress))
  const height = Math.max(3, Math.round(from.height + (to.height - from.height) * progress))
  const fromRight = from.left + from.width
  const toRight = to.left + to.width
  const right = Math.round(fromRight + (toRight - fromRight) * progress)
  const top = Math.round(from.top + (to.top - from.top) * progress)
  return {
    left: right - width,
    top,
    width,
    height,
  }
}

function interpolateTopRightAnchoredRectWithIndependentHeightProgress(from: PaneRect, to: PaneRect, progress: number, heightProgress: number): PaneRect {
  const width = Math.max(8, Math.round(from.width + (to.width - from.width) * progress))
  const height = Math.max(3, Math.round(from.height + (to.height - from.height) * heightProgress))
  const fromRight = from.left + from.width
  const toRight = to.left + to.width
  const right = Math.round(fromRight + (toRight - fromRight) * progress)
  const top = Math.round(from.top + (to.top - from.top) * progress)
  return {
    left: right - width,
    top,
    width,
    height,
  }
}

function interpolateTopLeftAnchoredRect(from: PaneRect, to: PaneRect, progress: number): PaneRect {
  const left = Math.round(from.left + (to.left - from.left) * progress)
  const top = Math.round(from.top + (to.top - from.top) * progress)
  const width = Math.max(8, Math.round(from.width + (to.width - from.width) * progress))
  const height = Math.max(3, Math.round(from.height + (to.height - from.height) * progress))
  return {
    left,
    top,
    width,
    height,
  }
}

function interpolateBottomLeftAnchoredRect(from: PaneRect, to: PaneRect, progress: number): PaneRect {
  const left = Math.round(from.left + (to.left - from.left) * progress)
  const width = Math.max(8, Math.round(from.width + (to.width - from.width) * progress))
  const height = Math.max(3, Math.round(from.height + (to.height - from.height) * progress))
  const fromBottom = from.top + from.height
  const toBottom = to.top + to.height
  const bottom = Math.round(fromBottom + (toBottom - fromBottom) * progress)
  return {
    left,
    top: bottom - height,
    width,
    height,
  }
}

function renderAnimatedPane(rect: PaneRect, child: Renderable | VNode<any, any[]>, borderColor: string, title?: string): Renderable | VNode<any, any[]> {
  return Box(
    { position: "absolute", left: rect.left, top: rect.top, width: rect.width, height: rect.height, borderStyle: "rounded", borderColor, title, padding: 1, backgroundColor: COLORS.panel, flexDirection: "column" },
    child,
  )
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

function renderWorkspaceTransitionOverlay(state: AppState, listScroll: ScrollBoxRenderable, mainScroll: ScrollBoxRenderable, promptScroll: ScrollBoxRenderable | null): Array<Renderable | VNode<any, any[]>> {
  const transition = state.workspaceTransition
  if (!transition) return []
  const config = state.uiLayoutConfig
  const collapsedWorkspaceRects = workspaceRectsForRatio(state, state.uiLayoutConfig.collapsedPromptRatio)
  const conceptsToSessionTransitionSourceRects = workspaceRectsForRatio(state, state.uiLayoutConfig.conceptsToSessionTransitionCollapsedPromptRatio)
  const expandedWorkspaceRects = workspaceRectsForRatio(state, state.uiLayoutConfig.expandedPromptRatio)
  const conceptsToSessionTransitionRects = workspaceRectsForRatio(state, state.uiLayoutConfig.conceptsToSessionTransitionExpandedPromptRatio)
  if (!collapsedWorkspaceRects || !conceptsToSessionTransitionSourceRects || !expandedWorkspaceRects || !conceptsToSessionTransitionRects) return []
  const fromRects = transition.from === "concepts" && transition.to === "session"
    ? conceptsToSessionTransitionSourceRects
    : (transition.from === "concepts" ? collapsedWorkspaceRects : expandedWorkspaceRects)
  const toRects = transition.from === "concepts" && transition.to === "session"
    ? conceptsToSessionTransitionRects
    : (transition.to === "concepts" ? collapsedWorkspaceRects : expandedWorkspaceRects)
  const fromWorkspace = renderTransitionPaneContentWithRects(state, transition.from, fromRects, listScroll, mainScroll, promptScroll)
  const toWorkspace = renderTransitionPaneContentWithRects(state, transition.to, toRects, listScroll, mainScroll, promptScroll)
  if (!fromWorkspace || !toWorkspace) return []
  const progress = transition.progress
  if (transition.from === "concepts" && transition.to === "session") {
    const conceptsToSessionRightStackStartWidth = Math.max(
      config.minPaneWidth,
      Math.min(fromWorkspace.frameWidth, Math.round(toWorkspace.details.width * config.conceptsToSessionRightStackStartWidthRatio)),
    )
    const conceptsMiniTarget: PaneRect = {
      left: 0,
      top: toWorkspace.conceptPreview.top,
      width: toWorkspace.conceptPreview.width,
      height: toWorkspace.conceptPreview.height,
    }
    const contextPinnedTarget: PaneRect = {
      left: 0,
      top: toWorkspace.context.top,
      width: toWorkspace.context.width,
      height: toWorkspace.context.height,
    }
    const sessionEnterStart: PaneRect = {
      left: rightAlignedLeft(fromWorkspace.frameWidth, conceptsToSessionRightStackStartWidth),
      top: fromWorkspace.frameHeight - conceptsMiniTarget.height,
      width: conceptsToSessionRightStackStartWidth,
      height: conceptsMiniTarget.height,
    }
    const detailsSourceRect: PaneRect = {
      left: rightAlignedLeft(fromWorkspace.frameWidth, conceptsToSessionRightStackStartWidth),
      top: fromWorkspace.details.top,
      width: conceptsToSessionRightStackStartWidth,
      height: fromWorkspace.details.height,
    }
    const detailsExitTarget: PaneRect = { left: rightAlignedLeft(fromWorkspace.frameWidth, config.transitionChipWidth), top: 0, width: config.transitionChipWidth, height: config.transitionChipHeight }
    const rightStackProgress = acceleratedProgress(progress, config.workspaceTransitionAcceleration)
    const detailsHeightProgress = acceleratedProgress(rightStackProgress, config.conceptsToSessionDetailsHeightAcceleration)
    const detailsRect = interpolateTopRightAnchoredRectWithIndependentHeightProgress(detailsSourceRect, detailsExitTarget, rightStackProgress, detailsHeightProgress)
    const detailsVisibleProgress = blendProgress(rightStackProgress, config.workspaceTransitionFadeStart, config.workspaceTransitionFadeEnd)
    const showDetailsPane = detailsVisibleProgress < 1
    const sessionRectWithSoloGrowth = interpolateBottomRightAnchoredRect(sessionEnterStart, toWorkspace.session, rightStackProgress)
    const contextEnterStart: PaneRect = { left: 0, top: 0, width: config.transitionChipWidth, height: config.transitionChipHeight }
    const leftStackProgress = acceleratedProgress(progress, config.workspaceTransitionAcceleration)
    const contextDelay = config.workspaceTransitionStaggerDelay
    const contextProgress = delayedProgress(leftStackProgress, contextDelay)
    const showContextPane = revealAfter(leftStackProgress, contextDelay)
    const conceptsAnimatedRect = interpolateBottomRightAnchoredRect(fromWorkspace.concepts, conceptsMiniTarget, leftStackProgress)
    const contextHeight = Math.max(3, interpolateValue(contextEnterStart.height, contextPinnedTarget.height, contextProgress))
    const contextWidth = interpolateValue(contextEnterStart.width, contextPinnedTarget.width, contextProgress)
    const contextLeft = interpolateValue(contextEnterStart.left, contextPinnedTarget.left, contextProgress)
    const contextRect: PaneRect = {
      left: contextLeft,
      top: contextPinnedTarget.top,
      width: contextWidth,
      height: contextHeight,
    }
    const conceptsRectWithSharedGap = showContextPane
      ? {
          left: conceptsAnimatedRect.left,
          top: contextRect.top + contextRect.height + 1,
          width: conceptsAnimatedRect.width,
          height: Math.max(config.minPaneHeight, fromWorkspace.frameHeight - (contextRect.top + contextRect.height + config.interPaneGap)),
        }
      : conceptsAnimatedRect
    if (!transition.loggedFirstFrame) {
      transition.loggedFirstFrame = true
      void appendWorkspaceDebugLog("transition_first_frame", {
        from: transition.from,
        to: transition.to,
        progress,
        viewportWidth: process.stdout.columns || 120,
        viewportHeight: process.stdout.rows || 36,
        concepts: {
          from: fromWorkspace.concepts,
          miniTarget: conceptsMiniTarget,
          current: conceptsRectWithSharedGap,
        },
        session: {
          from: sessionEnterStart,
          target: toWorkspace.session,
          current: sessionRectWithSoloGrowth,
        },
        details: {
          from: fromWorkspace.details,
          exitTarget: detailsExitTarget,
          current: detailsRect,
        },
        context: {
          enterStart: contextEnterStart,
          target: contextPinnedTarget,
          current: contextRect,
        },
      })
    }
    return [
      Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#111417cc" }),
      Box(
        { position: "absolute", top: fromWorkspace.frameTop, left: fromWorkspace.frameLeft, width: fromWorkspace.frameWidth, height: fromWorkspace.frameHeight },
        renderAnimatedPane(sessionRectWithSoloGrowth, fromWorkspace.sessionNode, COLORS.borderActive, progress > 0.35 ? "Session" : undefined),
        ...(showDetailsPane ? [renderAnimatedPane(detailsRect, fromWorkspace.detailsNode, COLORS.border, progress > 0.7 ? undefined : "Details")] : []),
        renderAnimatedPane(conceptsRectWithSharedGap, fromWorkspace.conceptsNode, COLORS.borderActive, "Concepts"),
        ...(showContextPane ? [renderAnimatedPane(contextRect, toWorkspace.contextNode, COLORS.border, progress > 0.45 ? "Context" : undefined)] : []),
      ),
    ]
  }
  const sessionMiniTarget: PaneRect = {
    left: rightAlignedLeft(fromWorkspace.frameWidth, toWorkspace.session.width),
    top: fromWorkspace.frameHeight - toWorkspace.conceptPreview.height,
    width: toWorkspace.session.width,
    height: toWorkspace.conceptPreview.height,
  }
  const conceptsPinnedTarget: PaneRect = {
    left: 0,
    top: toWorkspace.concepts.top,
    width: toWorkspace.context.width,
    height: toWorkspace.concepts.height,
  }
  const contextExitTarget: PaneRect = { left: 0, top: 0, width: config.transitionChipWidth, height: config.transitionChipHeight }
  const leftStackProgress = acceleratedProgress(progress, config.workspaceTransitionAcceleration)
  const leftStack = interpolateVerticalStack(fromWorkspace.context, fromWorkspace.conceptPreview, contextExitTarget, conceptsPinnedTarget, leftStackProgress, config.interPaneGap)
  const contextRect = leftStack.topRect
  const conceptRect = leftStack.bottomRect
  const contextVisibleProgress = blendProgress(leftStackProgress, config.workspaceTransitionFadeStart, config.workspaceTransitionFadeEnd)
  const showContextPane = contextVisibleProgress < 1
  const conceptSoloBlend = blendProgress(leftStackProgress, 0.72, 0.9)
  const conceptSoloTop = interpolateValue(fromWorkspace.conceptPreview.top, conceptsPinnedTarget.top, leftStackProgress)
  const conceptBottom = interpolateValue(fromWorkspace.conceptPreview.top + fromWorkspace.conceptPreview.height, conceptsPinnedTarget.top + conceptsPinnedTarget.height, leftStackProgress)
  const maxConceptTopWhileContextVisible = contextRect.top + contextRect.height + config.interPaneGap
  const blendedConceptTop = interpolateValue(conceptRect.top, conceptSoloTop, conceptSoloBlend)
  const clampedConceptTop = Math.max(blendedConceptTop, maxConceptTopWhileContextVisible)
  const finalConceptTop = interpolateValue(clampedConceptTop, conceptSoloTop, contextVisibleProgress)
  const conceptRectWithSoloGrowth: PaneRect = {
    left: conceptRect.left,
    top: finalConceptTop,
    width: conceptRect.width,
    height: Math.max(config.minPaneHeight, conceptBottom - finalConceptTop),
  }
  const detailsEnterStart: PaneRect = { left: rightAlignedLeft(fromWorkspace.frameWidth, config.transitionChipWidth), top: 0, width: config.transitionChipWidth, height: config.transitionChipHeight }
  const detailsPinnedTarget: PaneRect = {
    left: rightAlignedLeft(fromWorkspace.frameWidth, toWorkspace.session.width),
    top: toWorkspace.details.top,
    width: toWorkspace.session.width,
    height: toWorkspace.details.height,
  }
  const rightStackProgress = acceleratedProgress(progress, config.workspaceTransitionAcceleration)
  const detailsDelay = config.workspaceTransitionStaggerDelay
  const detailsProgress = delayedProgress(rightStackProgress, detailsDelay)
  const showDetailsPane = revealAfter(rightStackProgress, detailsDelay)
  const sessionRect = interpolateBottomRightAnchoredRect(fromWorkspace.session, sessionMiniTarget, rightStackProgress)
  const detailsHeight = Math.max(config.minPaneHeight, interpolateValue(detailsEnterStart.height, detailsPinnedTarget.height, detailsProgress))
  const detailsWidth = interpolateValue(detailsEnterStart.width, detailsPinnedTarget.width, detailsProgress)
  const detailsLeft = interpolateValue(detailsEnterStart.left, detailsPinnedTarget.left, detailsProgress)
  const detailsRect: PaneRect = {
    left: detailsLeft,
    top: detailsPinnedTarget.top,
    width: detailsWidth,
    height: detailsHeight,
  }
  const sessionRectWithSharedGap: PaneRect = showDetailsPane
    ? {
        left: sessionRect.left,
        top: detailsRect.top + detailsRect.height + 1,
        width: sessionRect.width,
        height: Math.max(config.minPaneHeight, (fromWorkspace.frameHeight) - (detailsRect.top + detailsRect.height + config.interPaneGap)),
      }
    : sessionRect
  if (!transition.loggedFirstFrame) {
    transition.loggedFirstFrame = true
    const sessionFromRight = fromWorkspace.session.left + fromWorkspace.session.width
    const sessionTargetRight = sessionMiniTarget.left + sessionMiniTarget.width
    const sessionCurrentRight = sessionRect.left + sessionRect.width
    const detailsStartRight = detailsEnterStart.left + detailsEnterStart.width
    const detailsTargetRight = detailsPinnedTarget.left + detailsPinnedTarget.width
    const detailsCurrentRight = detailsRect.left + detailsRect.width
    void appendWorkspaceDebugLog("transition_first_frame", {
      from: transition.from,
      to: transition.to,
      progress,
      viewportWidth: process.stdout.columns || 120,
      viewportHeight: process.stdout.rows || 36,
      outerFrame: { left: fromWorkspace.frameLeft, top: fromWorkspace.frameTop, width: fromWorkspace.frameWidth, height: fromWorkspace.frameHeight },
      innerCanvas: { left: fromWorkspace.frameLeft + fromWorkspace.canvasLeft, top: fromWorkspace.frameTop + fromWorkspace.canvasTop, width: fromWorkspace.canvasWidth, height: fromWorkspace.canvasHeight },
      overlayContainer: { top: fromWorkspace.frameTop, left: fromWorkspace.frameLeft, width: fromWorkspace.frameWidth, height: fromWorkspace.frameHeight },
      frameRightEdge: fromWorkspace.frameLeft + fromWorkspace.frameWidth,
      canvasRightEdge: fromWorkspace.frameLeft + fromWorkspace.canvasLeft + fromWorkspace.canvasWidth,
      session: {
        liveOuter: {
          left: fromWorkspace.frameLeft + fromWorkspace.session.left,
          top: fromWorkspace.frameTop + fromWorkspace.session.top,
          width: fromWorkspace.session.width,
          height: fromWorkspace.session.height,
        },
        animatedOuter: {
          left: fromWorkspace.frameLeft + sessionRect.left,
          top: fromWorkspace.frameTop + sessionRect.top,
          width: sessionRectWithSharedGap.width,
          height: sessionRectWithSharedGap.height,
        },
        from: fromWorkspace.session,
        target: sessionMiniTarget,
        current: sessionRectWithSharedGap,
        rightEdges: {
          from: sessionFromRight,
          target: sessionTargetRight,
          current: sessionRectWithSharedGap.left + sessionRectWithSharedGap.width,
          liveOuter: fromWorkspace.frameLeft + fromWorkspace.session.left + fromWorkspace.session.width,
          animatedOuter: fromWorkspace.frameLeft + sessionRectWithSharedGap.left + sessionRectWithSharedGap.width,
        },
        distanceToFrameRight: {
          liveOuter: (fromWorkspace.frameLeft + fromWorkspace.frameWidth) - (fromWorkspace.frameLeft + fromWorkspace.session.left + fromWorkspace.session.width),
          animatedOuter: (fromWorkspace.frameLeft + fromWorkspace.frameWidth) - (fromWorkspace.frameLeft + sessionRectWithSharedGap.left + sessionRectWithSharedGap.width),
        },
        distanceToCanvasRight: {
          liveOuter: (fromWorkspace.frameLeft + fromWorkspace.canvasLeft + fromWorkspace.canvasWidth) - (fromWorkspace.frameLeft + fromWorkspace.session.left + fromWorkspace.session.width),
          animatedOuter: (fromWorkspace.frameLeft + fromWorkspace.canvasLeft + fromWorkspace.canvasWidth) - (fromWorkspace.frameLeft + sessionRectWithSharedGap.left + sessionRectWithSharedGap.width),
        },
      },
      details: {
        liveOuter: {
          left: fromWorkspace.frameLeft + detailsPinnedTarget.left,
          top: fromWorkspace.frameTop + detailsPinnedTarget.top,
          width: detailsPinnedTarget.width,
          height: detailsPinnedTarget.height,
        },
        animatedOuter: {
          left: fromWorkspace.frameLeft + detailsRect.left,
          top: fromWorkspace.frameTop + detailsRect.top,
          width: detailsRect.width,
          height: detailsRect.height,
        },
        start: detailsEnterStart,
        target: detailsPinnedTarget,
        current: detailsRect,
        rightEdges: {
          start: detailsStartRight,
          target: detailsTargetRight,
          current: detailsCurrentRight,
          liveOuter: fromWorkspace.frameLeft + detailsPinnedTarget.left + detailsPinnedTarget.width,
          animatedOuter: fromWorkspace.frameLeft + detailsRect.left + detailsRect.width,
        },
        distanceToFrameRight: {
          liveOuter: (fromWorkspace.frameLeft + fromWorkspace.frameWidth) - (fromWorkspace.frameLeft + detailsPinnedTarget.left + detailsPinnedTarget.width),
          animatedOuter: (fromWorkspace.frameLeft + fromWorkspace.frameWidth) - (fromWorkspace.frameLeft + detailsRect.left + detailsRect.width),
        },
        distanceToCanvasRight: {
          liveOuter: (fromWorkspace.frameLeft + fromWorkspace.canvasLeft + fromWorkspace.canvasWidth) - (fromWorkspace.frameLeft + detailsPinnedTarget.left + detailsPinnedTarget.width),
          animatedOuter: (fromWorkspace.frameLeft + fromWorkspace.canvasLeft + fromWorkspace.canvasWidth) - (fromWorkspace.frameLeft + detailsRect.left + detailsRect.width),
        },
      },
    })
  }
  return [
    Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#111417cc" }),
    Box(
      { position: "absolute", top: fromWorkspace.frameTop, left: fromWorkspace.frameLeft, width: fromWorkspace.frameWidth, height: fromWorkspace.frameHeight },
      renderAnimatedPane(sessionRectWithSharedGap, fromWorkspace.sessionNode, COLORS.borderActive, "Session"),
      ...(showContextPane ? [renderAnimatedPane(contextRect, fromWorkspace.contextNode, COLORS.border, progress > 0.7 ? undefined : "Context")] : []),
      renderAnimatedPane(conceptRectWithSoloGrowth, toWorkspace.conceptsNode, transition.to === "concepts" ? COLORS.borderActive : COLORS.border, progress > 0.35 ? "Concepts" : undefined),
      ...(showDetailsPane ? [renderAnimatedPane(detailsRect, toWorkspace.detailsNode, COLORS.border, progress > 0.45 ? "Details" : undefined)] : []),
    ),
  ]
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

  if (state.editorModal?.target.kind === "prompt" && state.editorModal.aliasSuggestion) {
    const aliasSuggestion = state.editorModal.aliasSuggestion
    const { visible: suggestions, selectedAlias } = visibleAliasSuggestions(state, aliasSuggestion)
    const selectedPath = selectedAlias?.slice(1)
    const selectedSummary = selectedPath ? state.nodes.get(selectedPath)?.summary?.trim() : ""
    overlays.push(
      Box(
        { position: "absolute", bottom: 7, right: state.layoutMode === "wide" ? 2 : 1, width: state.layoutMode === "wide" ? 72 : "94%", padding: 1, backgroundColor: COLORS.panel, borderStyle: "rounded", borderColor: COLORS.warning, flexDirection: "column", gap: 1 },
        ...suggestions.map((alias) => {
          const selected = alias === selectedAlias
          if (alias.startsWith("&")) {
            const path = alias.slice(1)
            const isDirectory = state.projectDirectories.includes(path)
            return Box(
              { width: "100%", paddingX: 1, backgroundColor: selected ? COLORS.selectedBg : "#171d22", flexDirection: "column" },
              Text({ content: alias, fg: selected ? COLORS.selectedFg : COLORS.accent, attributes: TextAttributes.BOLD }),
              Text({ content: selected ? (isDirectory ? "Directory reference" : "File reference") : truncateSingleLine(isDirectory ? "Directory reference" : "File reference", state.layoutMode === "wide" ? 56 : 36), fg: selected ? COLORS.selectedFg : COLORS.muted }),
            )
          }
          return Box(
            { width: "100%", paddingX: 1, backgroundColor: selected ? COLORS.selectedBg : "#171d22", flexDirection: "column" },
            Text({ content: alias, fg: selected ? COLORS.selectedFg : COLORS.warning, attributes: TextAttributes.BOLD }),
            Text({ content: selected ? (selectedSummary || "No summary for this concept yet.") : truncateSingleLine(state.nodes.get(alias.slice(1))?.summary ?? "", state.layoutMode === "wide" ? 56 : 36), fg: selected ? COLORS.selectedFg : COLORS.muted }),
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
  overlays.push(...renderWorkspaceTransitionOverlay(state, listScroll, mainScroll, promptScroll))

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

export function listLines(state: AppState): ListLine[] {
  const visible = visiblePaths(state)
  if (visible.length === 0) {
    return [{ title: `(no child concepts under ${state.currentParentPath})`, kindLabel: "", leftMarker: "", rightMarker: "", selected: false, empty: true }]
  }
  return visible.map((path, index) => {
    const node = state.nodes.get(path)!
    return {
      title: node.title,
      kindLabel: node.kind ?? "(no kind)",
      leftMarker: node.parentPath && node.parentPath !== "root" ? "<-" : "",
      rightMarker: node.childPaths.length > 0 ? "->" : "",
      selected: index === state.cursor,
      tone: node.isDraft ? "draft" : undefined,
    }
  })
}

function conceptRowColors(item: ListLine): { background: string; title: string; kind: string; badge: string } {
  if (item.selected) {
    return { background: COLORS.selectedBg, title: COLORS.selectedFg, kind: COLORS.selectedFg, badge: COLORS.selectedFg }
  }
  if (item.empty) {
    return { background: COLORS.panel, title: COLORS.muted, kind: COLORS.muted, badge: COLORS.muted }
  }
  return {
    background: COLORS.panel,
    title: item.tone === "draft" ? COLORS.warning : COLORS.text,
    kind: COLORS.muted,
    badge: item.tone === "draft" ? COLORS.warning : COLORS.border,
  }
}

export function scrollListForCursor(state: AppState, listScroll: ScrollBoxRenderable): void {
  const halfViewport = Math.max(2, Math.floor((listScroll.viewport.height || 10) / 2))
  listScroll.scrollTo({ x: 0, y: Math.max(0, state.cursor - halfViewport) })
}

function renderCreateConceptModal(state: AppState, modal: CreateConceptModalState): Array<Renderable | VNode<any, any[]>> {
  const options = createKindOptions(state, modal.kindQuery)
  const selectedOption = options[Math.max(0, Math.min(modal.kindCursor, Math.max(0, options.length - 1)))]
  const visibleOptions = options.slice(0, state.layoutMode === "wide" ? 8 : 6)
  return [
    Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000088" }),
    Box(
      { position: "absolute", top: state.layoutMode === "wide" ? 5 : 3, left: state.layoutMode === "wide" ? "50%" : 2, width: state.layoutMode === "wide" ? 84 : "94%", padding: 1, backgroundColor: COLORS.panelSoft, borderStyle: "rounded", borderColor: COLORS.borderActive, marginLeft: state.layoutMode === "wide" ? -42 : undefined, flexDirection: "column", gap: 1 },
      Text({ content: "Add Draft Concept", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
      Text({ content: `Name: ${modal.draft.title || ""}`, fg: modal.fieldIndex === 0 ? COLORS.selectedBg : COLORS.text }),
      Text({ content: `Kind: ${selectedOption?.kind ?? (modal.kindQuery || "None")}`, fg: modal.fieldIndex === 1 ? COLORS.selectedBg : COLORS.text }),
      ...(modal.kindExpanded
        ? [
            Box(
              { width: "100%", padding: 1, backgroundColor: COLORS.panel, borderStyle: "rounded", borderColor: COLORS.warning, flexDirection: "column" },
              ...visibleOptions.map((option, index) => {
                const selected = index === Math.max(0, Math.min(modal.kindCursor, visibleOptions.length - 1))
                return Box(
                  { width: "100%", paddingX: 1, backgroundColor: selected ? COLORS.selectedBg : COLORS.panel, flexDirection: "row", justifyContent: "space-between" },
                  Text({ content: option.kind, fg: selected ? COLORS.selectedFg : COLORS.text, attributes: selected ? TextAttributes.BOLD : 0 }),
                  Text({ content: option.description, fg: selected ? COLORS.selectedFg : COLORS.muted }),
                )
              }),
            ),
          ]
        : []),
      Text({ content: `Summary: ${modal.draft.summary || ""}`, fg: modal.fieldIndex === 2 ? COLORS.selectedBg : COLORS.text }),
      Text({ content: modal.kindExpanded ? "Type -> Filter  Arrows -> Move  Enter -> Close  Esc -> Close" : "Tab -> Next  Shift+Tab -> Prev  Enter -> Open/Create  Esc -> Close", fg: COLORS.muted }),
    ),
  ]
}

function createKindOptions(state: AppState, query: string): Array<{ kind: string; description: string }> {
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = state.kindDefinitions
    .filter((item) => normalizedQuery.length === 0 || fuzzyKindScore(item.kind, normalizedQuery) > 0)
    .sort((left, right) => {
      const leftScore = fuzzyKindScore(left.kind, normalizedQuery)
      const rightScore = fuzzyKindScore(right.kind, normalizedQuery)
      return rightScore - leftScore || left.kind.localeCompare(right.kind)
    })
    .map((item) => ({ kind: item.kind, description: item.description }))
  return [{ kind: "None", description: "Create this concept without assigning a kind." }, ...filtered]
}

function fuzzyKindScore(candidate: string, query: string): number {
  if (!query) return 1
  const normalizedCandidate = candidate.toLowerCase()
  if (normalizedCandidate.includes(query)) return 100 - normalizedCandidate.indexOf(query)
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

function renderConfirmModal(state: AppState): Array<Renderable | VNode<any, any[]>> {
  if (!state.confirmModal) return []
  return [
    Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000088" }),
    Box(
      { position: "absolute", top: state.layoutMode === "wide" ? 8 : 6, left: state.layoutMode === "wide" ? "50%" : 2, width: state.layoutMode === "wide" ? 74 : "92%", padding: 1, backgroundColor: COLORS.panelSoft, borderStyle: "rounded", borderColor: COLORS.borderActive, marginLeft: state.layoutMode === "wide" ? -37 : undefined, flexDirection: "column", gap: 1 },
      Text({ content: state.confirmModal.title, fg: COLORS.accent, attributes: TextAttributes.BOLD }),
      ...state.confirmModal.message.map((line) => Text({ content: line, fg: COLORS.text })),
      Text({ content: "Enter -> Remove  Esc -> Close", fg: COLORS.muted }),
    ),
  ]
}

function renderSessionModalRow(state: AppState, session: ChatSession, selected: boolean): Renderable | VNode<any, any[]> {
  const mode = promptModePresentation(session.lastMode)
  return Box(
    { width: "100%", paddingX: 1, backgroundColor: selected ? COLORS.selectedBg : COLORS.panel, flexDirection: "row", justifyContent: "space-between" },
    Box(
      { flexDirection: "column", flexGrow: 1 },
      Text({ content: truncateSingleLine(session.title, state.layoutMode === "wide" ? 42 : 28), fg: selected ? COLORS.selectedFg : COLORS.text, attributes: TextAttributes.BOLD }),
      Text({ content: truncateSingleLine(`${session.messages.filter((message) => message.text.trim()).length} messages  ${session.updatedAt.replace("T", " ").slice(0, 16)}`, state.layoutMode === "wide" ? 42 : 28), fg: selected ? COLORS.selectedFg : COLORS.muted }),
    ),
    Text({ content: mode.label, fg: selected ? COLORS.selectedFg : mode.color, attributes: TextAttributes.BOLD }),
  )
}

function renderSessionModal(state: AppState): Array<Renderable | VNode<any, any[]>> {
  if (!state.sessionModal) return []
  const sessions = [...state.sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  return [
    Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000088" }),
    Box(
      { position: "absolute", top: state.layoutMode === "wide" ? 5 : 3, left: state.layoutMode === "wide" ? "50%" : 2, width: state.layoutMode === "wide" ? 84 : "94%", padding: 1, backgroundColor: COLORS.panelSoft, borderStyle: "rounded", borderColor: COLORS.borderActive, marginLeft: state.layoutMode === "wide" ? -42 : undefined, flexDirection: "column", gap: 1 },
      Text({ content: "Sessions", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
      ...sessions.map((session, index) => renderSessionModalRow(state, session, index === state.sessionModal?.selectedIndex)),
      Text({ content: "Enter -> Switch  n -> New  Esc -> Close", fg: COLORS.muted }),
    ),
  ]
}

export function repaint(state: AppState, listScroll: ScrollBoxRenderable, mainScroll: ScrollBoxRenderable, promptScroll: ScrollBoxRenderable | null, root: { getChildren: () => Renderable[]; add: (child: Renderable | VNode<any, any[]>, index?: number) => number }): void {
  const listItems = listLines(state)
  const selectedNode = currentNode(state)
  const nextContextKey = `${contextKeyForNode(selectedNode.path, selectedNode.loc, selectedNode.summary)}::${state.inspector?.kind ?? "none"}`
  const shouldRefreshContext = contextPreviewKey !== nextContextKey
  const renderVersion = shouldRefreshContext ? (contextRenderVersion += 1) : contextRenderVersion

  replaceChildren(
    listScroll,
    Box(
      { width: "100%", flexDirection: "column", gap: 0 },
      ...listItems.map((item) => {
        const colors = conceptRowColors(item)
        const titleWidth = state.layoutMode === "wide" ? 24 : 20
        const kindWidth = state.layoutMode === "wide" ? 10 : 10
        return Box(
          { width: "100%", paddingX: 1, backgroundColor: colors.background, flexDirection: "row", justifyContent: "space-between" },
          Box(
            { flexDirection: "row", gap: 1, flexGrow: 1 },
            Text({ content: item.leftMarker ? item.leftMarker.padEnd(3, " ") : "   ", fg: colors.badge, attributes: item.selected || Boolean(item.leftMarker) ? TextAttributes.BOLD : 0 }),
            Text({ content: truncateSingleLine(item.title, titleWidth), fg: colors.title, attributes: item.selected ? TextAttributes.BOLD : 0 }),
          ),
          Box(
            { flexDirection: "row", gap: 1, flexShrink: 0 },
            Text({ content: item.kindLabel ? truncateSingleLine(item.kindLabel, kindWidth) : "", fg: colors.kind, attributes: item.selected ? TextAttributes.BOLD : 0 }),
            Text({ content: item.rightMarker ? item.rightMarker.padEnd(2, " ") : "  ", fg: colors.badge, attributes: item.selected || Boolean(item.rightMarker) ? TextAttributes.BOLD : 0 }),
          ),
        )
      }),
    ),
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
