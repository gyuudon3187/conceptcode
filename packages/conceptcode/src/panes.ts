import { Box, ScrollBoxRenderable, Text, TextAttributes, type Renderable, type VNode } from "@opentui/core"

type PromptSuggestionProvider = {
  suggestions: (context: { prefix: "@" | "&" | "/"; query: string; mode: "search" | "resolved" }) => Array<{ value: string; description?: string }>
}

type ConceptCodeNode = {
  path: string
  namespace: "impl" | "domain"
  title: string
  kind: string | null
  summary: string
  explorationCoverage: number | null
  summaryConfidence: number | null
}

type ConceptCodePaneState = {
  layoutMode: "wide" | "narrow"
  conceptNamespaceMode: "implementation" | "domain"
  uiMode: "plan" | "build" | "conceptualize"
  activeAssistantMessageId: string | null
  promptTokenBreakdown: {
    totalTokenCount: number
    staticTokenCount: number
    promptTextTokenCount: number
    referencedConceptTokenCount: number
    referencedFileTokenCount: number
    referencedConcepts: Array<{ path: string; alias: string; tokenCount: number }>
    referencedFiles: Array<{ path: string; alias: string; tokenCount: number }>
  }
  editorModal: {
    target: { kind: "prompt" | "concept-summary" }
    visibleLineCount: number
    renderable: Renderable & { focused?: boolean }
    promptSuggestion: {
      prefix: "@" | "&" | "/"
      mode: "search" | "resolved"
      query: string
      start: number
      end: number
      selectedIndex: number
      visibleStartIndex: number
    } | null
  } | null
  nodes: Map<string, ConceptCodeNode & { summary: string }>
}

type PaneDeps<TState extends ConceptCodePaneState> = {
  colors: Record<string, string>
  currentNode: (state: TState) => ConceptCodeNode & { summary: string }
  namespaceRootPath: (mode: TState["conceptNamespaceMode"]) => "impl" | "domain"
  activeSession: (state: TState) => { draftPromptText: string; messages: Array<{ id?: string; role: "user" | "assistant"; text: string; status?: "streaming" | "complete" | "error" }> }
  promptPreviewWidth: (state: TState) => number
  promptPreviewLines: (text: string, width: number, maxLines: number) => string[]
  promptPreviewChunks: (line: string) => any[]
  textNodesForChunks: (chunks: any[]) => any[]
  truncateSingleLine: (text: string, maxWidth: number) => string
  visiblePromptSuggestions: (provider: PromptSuggestionProvider, suggestion: NonNullable<NonNullable<TState["editorModal"]>["promptSuggestion"]>) => { visible: Array<{ value: string; description?: string }>; selectedEntry: { value: string; description?: string } | null }
  promptSuggestionProviderForState: (state: TState) => PromptSuggestionProvider
}

function latestConversationPreview<TState extends ConceptCodePaneState>(state: TState, deps: PaneDeps<TState>): { text: string; role: "user" | "assistant" | "none"; status: "streaming" | "complete" | "error" | "idle" } {
  const session = deps.activeSession(state)
  const activeAssistantId = state.activeAssistantMessageId
  if (activeAssistantId) {
    const activeAssistant = session.messages.find((message) => message.id === activeAssistantId && message.role === "assistant")
    if (activeAssistant) return { text: activeAssistant.text.trim() || "Assistant is thinking...", role: "assistant", status: activeAssistant.status ?? "streaming" }
  }
  const latestUserMessage = [...session.messages].reverse().find((message) => message.role === "user" && message.text.trim())
  if (latestUserMessage) return { text: latestUserMessage.text.trim(), role: "user", status: latestUserMessage.status ?? "complete" }
  if (session.draftPromptText.trim()) return { text: session.draftPromptText.trim(), role: "user", status: "complete" }
  return { text: "Prompt workspace available", role: "none", status: "idle" }
}

function conceptNamespacePresentation(mode: ConceptCodePaneState["conceptNamespaceMode"], colors: Record<string, string>): { label: string; color: string; tone: string } {
  return mode === "domain" ? { label: "DOMAIN", color: colors.conceptualize, tone: "Domain concepts" } : { label: "IMPLEMENTATION", color: colors.accent, tone: "Code-backed concepts" }
}

function promptModePresentation(mode: ConceptCodePaneState["uiMode"], colors: Record<string, string>): { label: string; color: string; tone: string } {
  if (mode === "plan") return { label: "PLAN", color: colors.plan, tone: "Strategy mode" }
  if (mode === "build") return { label: "BUILD", color: colors.build, tone: "Execution mode" }
  return { label: "CONCEPTUALIZE", color: colors.conceptualize, tone: "Graph editing mode" }
}

export function renderDetailsPane<TState extends ConceptCodePaneState>(state: TState, deps: PaneDeps<TState>): Renderable | VNode<any, any[]> {
  const node = deps.currentNode(state)
  const body = node.summary.trim() || "No summary for this concept yet."
  const metricText = (label: string, value: number | null): string => `${label} ${value === null ? "--" : `${Math.round(value * 100)}%`}`
  const showImplementationMetrics = node.namespace === "impl"
  return Box(
    { width: "100%", height: "100%", borderStyle: "rounded", borderColor: deps.colors.border, title: "Details", padding: 1, backgroundColor: deps.colors.panel, flexDirection: "column", gap: 1 },
    Box({ width: "100%", flexDirection: "row", justifyContent: "space-between" }, Text({ content: deps.truncateSingleLine(node.title, state.layoutMode === "wide" ? 24 : 18), fg: deps.colors.text, attributes: TextAttributes.BOLD }), Text({ content: node.kind ?? "(no kind)", fg: deps.colors.accentSoft })),
    ...(showImplementationMetrics ? [Box({ width: "100%", flexDirection: "row", gap: 2 }, Text({ content: metricText("Explored", node.explorationCoverage), fg: deps.colors.muted }), Text({ content: metricText("Summary", node.summaryConfidence), fg: deps.colors.muted }))] : []),
    Text({ content: body, fg: node.summary.trim() ? deps.colors.text : deps.colors.muted }),
  )
}

export function renderPromptPreviewPane<TState extends ConceptCodePaneState>(state: TState, deps: PaneDeps<TState>): Renderable | VNode<any, any[]> {
  const preview = latestConversationPreview(state, deps)
  const statusLabel = preview.status === "streaming" ? "thinking" : preview.status === "error" ? "error" : "idle"
  const hint = "Tab -> Prompt"
  const width = Math.max(16, deps.promptPreviewWidth(state) - hint.length - 12)
  const lines = deps.promptPreviewLines(preview.text, width, 1)
  const leftLabel = preview.role === "assistant" ? "Live reply" : preview.role === "user" ? "Draft" : ""
  return Box({ width: "100%", height: "100%", borderStyle: "rounded", borderColor: deps.colors.border, title: `Session: ${statusLabel}`, padding: 1, backgroundColor: deps.colors.panel, flexDirection: "column", gap: 1 }, Box({ width: "100%", height: "100%", paddingX: 1, backgroundColor: deps.colors.panelSoft, flexDirection: "column", gap: 1 }, Box({ width: "100%", flexDirection: "column", gap: 0 }, ...(leftLabel ? [Text({ content: leftLabel, fg: deps.colors.muted })] : []), ...lines.map((line) => Text({}, ...deps.textNodesForChunks(deps.promptPreviewChunks(line || " "))))), Box({ width: "100%", flexGrow: 1, flexDirection: "row", justifyContent: "flex-end", alignItems: "flex-end" }, Text({ content: hint, fg: deps.colors.border }))))
}

export function renderConceptPreviewPane<TState extends ConceptCodePaneState>(state: TState, deps: PaneDeps<TState>): Renderable | VNode<any, any[]> {
  if (!state.nodes.has(deps.namespaceRootPath(state.conceptNamespaceMode))) {
    const { label, color, tone } = conceptNamespacePresentation(state.conceptNamespaceMode, deps.colors)
    return Box({ width: "100%", height: "100%", borderStyle: "rounded", borderColor: deps.colors.border, title: "Concepts", padding: 1, backgroundColor: deps.colors.panel, flexDirection: "column", gap: 1 }, Text({ content: label, fg: color, attributes: TextAttributes.BOLD }), Text({ content: `No ${tone.toLowerCase()} in this graph yet.`, fg: deps.colors.muted }), Box({ width: "100%", flexDirection: "row", justifyContent: "flex-end" }, Text({ content: "Tab namespace, Shift+Tab focus", fg: deps.colors.border })))
  }
  const node = deps.currentNode(state)
  const summary = node.summary.trim() || "No summary for this concept yet."
  const { label, color, tone } = conceptNamespacePresentation(state.conceptNamespaceMode, deps.colors)
  return Box({ width: "100%", height: "100%", borderStyle: "rounded", borderColor: deps.colors.border, title: "Concepts", padding: 1, backgroundColor: deps.colors.panel, flexDirection: "column", gap: 1 }, Box({ width: "100%", flexDirection: "row", justifyContent: "space-between" }, Text({ content: label, fg: color, attributes: TextAttributes.BOLD }), Text({ content: tone, fg: deps.colors.muted })), Box({ width: "100%", flexDirection: "row", justifyContent: "space-between" }, Text({ content: deps.truncateSingleLine(node.title, state.layoutMode === "wide" ? 22 : 18), fg: deps.colors.text, attributes: TextAttributes.BOLD }), Text({ content: node.kind ?? "(no kind)", fg: deps.colors.accentSoft })), Text({ content: deps.truncateSingleLine(summary, state.layoutMode === "wide" ? 54 : 34), fg: node.summary.trim() ? deps.colors.text : deps.colors.muted }), Box({ width: "100%", flexDirection: "row", justifyContent: "flex-end" }, Text({ content: "Tab namespace, Shift+Tab focus", fg: deps.colors.border })))
}

export function renderSessionTransitionBody<TState extends ConceptCodePaneState>(state: TState, deps: PaneDeps<TState>): Renderable | VNode<any, any[]> {
  const preview = latestConversationPreview(state, deps)
  const label = preview.role === "assistant" ? "Live reply" : preview.role === "user" ? "Draft" : "Session"
  const line = deps.promptPreviewLines(preview.text, Math.max(18, deps.promptPreviewWidth(state) - 8), 1)[0] || "Session"
  return Box({ width: "100%", height: "100%", flexDirection: "column", gap: 1 }, Box({ width: "100%", flexDirection: "column", gap: 0 }, Text({ content: label, fg: deps.colors.muted }), Text({}, ...deps.textNodesForChunks(deps.promptPreviewChunks(line)))))
}

export function renderDetailsTransitionBody<TState extends ConceptCodePaneState>(state: TState, deps: PaneDeps<TState>): Renderable | VNode<any, any[]> {
  const node = deps.currentNode(state)
  const body = deps.truncateSingleLine(node.summary.trim() || "No summary for this concept yet.", 42)
  return Box({ width: "100%", height: "100%", flexDirection: "column", gap: 1 }, Box({ width: "100%", flexDirection: "row", justifyContent: "space-between" }, Text({ content: deps.truncateSingleLine(node.title, 22), fg: deps.colors.text, attributes: TextAttributes.BOLD }), Text({ content: node.kind ?? "(no kind)", fg: deps.colors.accentSoft })), Text({ content: body, fg: node.summary.trim() ? deps.colors.text : deps.colors.muted }))
}

export function renderPromptPane<TState extends ConceptCodePaneState>(state: TState, promptScroll: ScrollBoxRenderable | null, deps: PaneDeps<TState>): Renderable | VNode<any, any[]> {
  const session = deps.activeSession(state)
  const editor = state.editorModal?.target.kind === "prompt" ? state.editorModal : null
  const { label: modeLabel, color: modeColor, tone: modeTone } = promptModePresentation(state.uiMode, deps.colors)
  const content = editor ? Box({ width: "100%", height: "100%", flexDirection: "column", gap: 1 }, Box({ width: "100%", flexGrow: 1, minHeight: 0 }, promptScroll ?? Box({ width: "100%" })), Box({ width: "100%", flexDirection: "column", gap: 1 }, Box({ width: "100%", minHeight: editor.visibleLineCount + 2, maxHeight: editor.visibleLineCount + 2, backgroundColor: deps.colors.panelSoft, flexDirection: "column" }, editor.renderable), Box({ width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingX: 1 }, Box({ flexDirection: "row", alignItems: "center", gap: 1 }, Text({ content: modeLabel, fg: modeColor, attributes: TextAttributes.BOLD }), Text({ content: modeTone, fg: deps.colors.muted })), Text({ content: "Tab mode, Shift+Tab focus", fg: deps.colors.border })))) : Box({ width: "100%", minHeight: 8, flexDirection: "column", gap: 1 }, Box({ width: "100%", paddingX: 1, paddingY: 1, backgroundColor: deps.colors.panelSoft, flexDirection: "column", gap: 0 }, ...(session.draftPromptText.trim() ? deps.promptPreviewLines(session.draftPromptText, deps.promptPreviewWidth(state), 8).map((line) => Text({}, ...deps.textNodesForChunks(deps.promptPreviewChunks(line)))) : [Text({ content: "Start writing your prompt here. Press Shift+Tab to edit.", fg: deps.colors.muted })])), Box({ width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingX: 1 }, Box({ flexDirection: "row", alignItems: "center", gap: 1 }, Text({ content: modeLabel, fg: modeColor, attributes: TextAttributes.BOLD }), Text({ content: modeTone, fg: deps.colors.muted })), Text({ content: "Tab mode, Shift+Tab focus", fg: deps.colors.border })))
  return Box({ width: "100%", height: "100%", flexDirection: "column", gap: 1 }, content)
}

export function renderPromptBudgetPane<TState extends ConceptCodePaneState>(state: TState, deps: PaneDeps<TState>): Renderable | VNode<any, any[]> {
  const breakdown = state.promptTokenBreakdown
  const maxPathWidth = state.layoutMode === "wide" ? 30 : 22
  const conceptReferences = [...breakdown.referencedConcepts].sort((left, right) => left.path.localeCompare(right.path))
  const fileReferences = [...breakdown.referencedFiles].sort((left, right) => left.path.localeCompare(right.path))
  const references = [...conceptReferences, ...fileReferences]
  const referenceRows = references.length > 0 ? references.map((reference) => Box({ width: "100%", flexDirection: "row", justifyContent: "space-between", minHeight: 1 }, Text({ content: deps.truncateSingleLine(reference.alias, maxPathWidth), fg: reference.alias.startsWith("@") ? deps.colors.warning : deps.colors.accent, attributes: TextAttributes.BOLD }), Text({ content: String(reference.tokenCount), fg: deps.colors.text }))) : [Text({ content: "No referenced concepts or files", fg: deps.colors.muted })]
  return Box({ width: "100%", height: "100%", flexDirection: "column", gap: 1 }, Text({ content: `Total prompt tokens: ${breakdown.totalTokenCount}`, fg: deps.colors.text, attributes: TextAttributes.BOLD }), Box({ width: "100%", flexDirection: "column", gap: 0 }, Text({ content: `Static context: ${breakdown.staticTokenCount}`, fg: deps.colors.muted }), Text({ content: `Prompt text: ${breakdown.promptTextTokenCount}`, fg: deps.colors.muted }), Text({ content: `Referenced concepts: ${breakdown.referencedConceptTokenCount}`, fg: deps.colors.muted }), Text({ content: `Referenced files: ${breakdown.referencedFileTokenCount}`, fg: deps.colors.muted })), Box({ width: "100%", flexDirection: "column", gap: 0, flexGrow: 1 }, Text({ content: "References", fg: deps.colors.accentSoft, attributes: TextAttributes.BOLD }), ...referenceRows))
}

export function renderPromptSuggestionOverlay<TState extends ConceptCodePaneState>(state: TState, deps: PaneDeps<TState>): Array<Renderable | VNode<any, any[]>> {
  if (!(state.editorModal?.target.kind === "prompt" && state.editorModal.promptSuggestion)) return []
  const promptSuggestion = state.editorModal.promptSuggestion
  const provider = deps.promptSuggestionProviderForState(state)
  const { visible: suggestions, selectedEntry } = deps.visiblePromptSuggestions(provider, promptSuggestion)
  const selectedValue = selectedEntry?.value ?? null
  const selectedPath = selectedValue?.startsWith("@") ? selectedValue.slice(1) : null
  const selectedSummary = selectedPath ? state.nodes.get(selectedPath)?.summary?.trim() : ""
  return [Box({ position: "absolute", bottom: 7, right: state.layoutMode === "wide" ? 2 : 1, width: state.layoutMode === "wide" ? 72 : "94%", padding: 1, backgroundColor: deps.colors.panel, borderStyle: "rounded", borderColor: deps.colors.warning, flexDirection: "column", gap: 1 }, ...suggestions.map((entry) => {
    const value = entry.value
    const selected = value === selectedValue
    if (value.startsWith("/")) return Box({ width: "100%", paddingX: 1, backgroundColor: selected ? deps.colors.selectedBg : "#171d22", flexDirection: "column" }, Text({ content: value, fg: selected ? deps.colors.selectedFg : deps.colors.accent, attributes: TextAttributes.BOLD }), Text({ content: selected ? (entry.description ?? "Command or skill") : deps.truncateSingleLine(entry.description ?? "Command or skill", state.layoutMode === "wide" ? 56 : 36), fg: selected ? deps.colors.selectedFg : deps.colors.muted }))
    if (value.startsWith("&")) {
      const referenceDescription = entry.description ?? "File reference"
      return Box({ width: "100%", paddingX: 1, backgroundColor: selected ? deps.colors.selectedBg : "#171d22", flexDirection: "column" }, Text({ content: value, fg: selected ? deps.colors.selectedFg : deps.colors.accent, attributes: TextAttributes.BOLD }), Text({ content: selected ? referenceDescription : deps.truncateSingleLine(referenceDescription, state.layoutMode === "wide" ? 56 : 36), fg: selected ? deps.colors.selectedFg : deps.colors.muted }))
    }
    return Box({ width: "100%", paddingX: 1, backgroundColor: selected ? deps.colors.selectedBg : "#171d22", flexDirection: "column" }, Text({ content: value, fg: selected ? deps.colors.selectedFg : deps.colors.warning, attributes: TextAttributes.BOLD }), Text({ content: selected ? (selectedSummary || entry.description || "No summary for this concept yet.") : deps.truncateSingleLine(entry.description ?? "", state.layoutMode === "wide" ? 56 : 36), fg: selected ? deps.colors.selectedFg : deps.colors.muted }))
  }))]
}
