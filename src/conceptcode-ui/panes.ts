import { type Renderable, type VNode, Box, ScrollBoxRenderable, Text, TextAttributes } from "@opentui/core"

import { currentNode, namespaceRootPath } from "../core/state"
import type { AppState } from "../core/types"
import { visiblePromptSuggestions, slashSuggestionDescription } from "../prompt/editor"
import { activeSession } from "../sessions/store"
import { COLORS } from "../ui/theme"
import { promptPreviewChunks, promptPreviewLines, promptPreviewWidth, textNodesForChunks, truncateSingleLine } from "../ui/text"

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

function conceptNamespacePresentation(mode: AppState["conceptNamespaceMode"]): { label: string; color: string; tone: string } {
  if (mode === "domain") {
    return { label: "DOMAIN", color: COLORS.conceptualize, tone: "Domain concepts" }
  }
  return { label: "IMPLEMENTATION", color: COLORS.accent, tone: "Code-backed concepts" }
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

export function renderDetailsPane(state: AppState): Renderable | VNode<any, any[]> {
  const node = currentNode(state)
  const body = node.summary.trim() || "No summary for this concept yet."
  const metricText = (label: string, value: number | null): string => `${label} ${value === null ? "--" : `${Math.round(value * 100)}%`}`
  const showImplementationMetrics = node.namespace === "impl"
  return Box(
    { width: "100%", height: "100%", borderStyle: "rounded", borderColor: COLORS.border, title: "Details", padding: 1, backgroundColor: COLORS.panel, flexDirection: "column", gap: 1 },
    Box(
      { width: "100%", flexDirection: "row", justifyContent: "space-between" },
      Text({ content: truncateSingleLine(node.title, state.layoutMode === "wide" ? 24 : 18), fg: COLORS.text, attributes: TextAttributes.BOLD }),
      Text({ content: node.kind ?? "(no kind)", fg: COLORS.accentSoft }),
    ),
    ...(showImplementationMetrics
      ? [Box(
          { width: "100%", flexDirection: "row", gap: 2 },
          Text({ content: metricText("Explored", node.explorationCoverage), fg: COLORS.muted }),
          Text({ content: metricText("Summary", node.summaryConfidence), fg: COLORS.muted }),
        )]
      : []),
    Text({ content: body, fg: node.summary.trim() ? COLORS.text : COLORS.muted }),
  )
}

export function renderPromptPreviewPane(state: AppState): Renderable | VNode<any, any[]> {
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

export function renderConceptPreviewPane(state: AppState): Renderable | VNode<any, any[]> {
  if (!state.nodes.has(namespaceRootPath(state.conceptNamespaceMode))) {
    const { label, color, tone } = conceptNamespacePresentation(state.conceptNamespaceMode)
    return Box(
      { width: "100%", height: "100%", borderStyle: "rounded", borderColor: COLORS.border, title: "Concepts", padding: 1, backgroundColor: COLORS.panel, flexDirection: "column", gap: 1 },
      Text({ content: label, fg: color, attributes: TextAttributes.BOLD }),
      Text({ content: `No ${tone.toLowerCase()} in this graph yet.`, fg: COLORS.muted }),
      Box(
        { width: "100%", flexDirection: "row", justifyContent: "flex-end" },
        Text({ content: "Tab namespace, Shift+Tab focus", fg: COLORS.border }),
      ),
    )
  }
  const node = currentNode(state)
  const summary = node.summary.trim() || "No summary for this concept yet."
  const { label, color, tone } = conceptNamespacePresentation(state.conceptNamespaceMode)
  return Box(
    { width: "100%", height: "100%", borderStyle: "rounded", borderColor: COLORS.border, title: "Concepts", padding: 1, backgroundColor: COLORS.panel, flexDirection: "column", gap: 1 },
    Box(
      { width: "100%", flexDirection: "row", justifyContent: "space-between" },
      Text({ content: label, fg: color, attributes: TextAttributes.BOLD }),
      Text({ content: tone, fg: COLORS.muted }),
    ),
    Box(
      { width: "100%", flexDirection: "row", justifyContent: "space-between" },
      Text({ content: truncateSingleLine(node.title, state.layoutMode === "wide" ? 22 : 18), fg: COLORS.text, attributes: TextAttributes.BOLD }),
      Text({ content: node.kind ?? "(no kind)", fg: COLORS.accentSoft }),
    ),
    Text({ content: truncateSingleLine(summary, state.layoutMode === "wide" ? 54 : 34), fg: node.summary.trim() ? COLORS.text : COLORS.muted }),
    Box(
      { width: "100%", flexDirection: "row", justifyContent: "flex-end" },
      Text({ content: "Tab namespace, Shift+Tab focus", fg: COLORS.border }),
    ),
  )
}

export function renderSessionTransitionBody(state: AppState): Renderable | VNode<any, any[]> {
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

export function renderDetailsTransitionBody(state: AppState): Renderable | VNode<any, any[]> {
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

export function renderPromptPane(state: AppState, promptScroll: ScrollBoxRenderable | null): Renderable | VNode<any, any[]> {
  const session = activeSession(state)
  const editor = state.editorModal?.target.kind === "prompt" ? state.editorModal : null
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
  return Box({ width: "100%", height: "100%", flexDirection: "column", gap: 1 }, content)
}

export function renderPromptBudgetPane(state: AppState): Renderable | VNode<any, any[]> {
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

export function renderPromptSuggestionOverlay(state: AppState): Array<Renderable | VNode<any, any[]>> {
  if (!(state.editorModal?.target.kind === "prompt" && state.editorModal.promptSuggestion)) return []
  const promptSuggestion = state.editorModal.promptSuggestion
  const { visible: suggestions, selectedValue } = visiblePromptSuggestions(state, promptSuggestion)
  const selectedPath = selectedValue?.startsWith("@") ? selectedValue.slice(1) : null
  const selectedSummary = selectedPath ? state.nodes.get(selectedPath)?.summary?.trim() : ""
  return [
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
  ]
}
