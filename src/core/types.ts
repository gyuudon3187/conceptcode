import type { TextareaRenderable } from "@opentui/core"

import type { RGBA } from "@opentui/core"
import type { EffectivePromptTokenBreakdown } from "../prompt/payload"

export type JsonPrimitive = null | boolean | number | string
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type ConceptNode = {
  path: string
  namespace: "impl" | "domain"
  title: string
  kind: string | null
  summary: string
  explorationCoverage: number | null
  summaryConfidence: number | null
  parentPath: string | null
  metadata: Record<string, JsonValue>
  loc: SourceLoc | null
  childPaths: string[]
  isDraft?: boolean
}

export type SourceLoc = {
  file: string
  startLine: number
  endLine: number
}

export type GraphPayload = {
  interpretation_hint?: Record<string, JsonValue>
  impl?: Record<string, JsonValue>
  domain?: Record<string, JsonValue>
}

export type ConceptNamespace = "impl" | "domain"
export type ConceptNamespaceMode = "implementation" | "domain"

export type LayoutMode = "wide" | "narrow"

export type UiMode = "plan" | "build" | "conceptualize"

export type InspectorKind = "snippet" | "subtree" | "metadata"

export type MainLine = {
  content: string
  role: "title" | "section" | "body" | "muted"
}

export type ListLine = {
  title: string
  kindLabel: string
  explorationCoverage: number | null
  summaryConfidence: number | null
  leftMarker: string
  rightMarker: string
  selected: boolean
  tone?: "draft"
  empty?: boolean
}

export type BufferModalTarget = {
  kind: "prompt" | "concept-summary"
  path?: string
}

export type InspectorState = {
  kind: InspectorKind
}

export type PromptSuggestionState = {
  prefix: "@" | "&" | "/"
  mode: "search" | "resolved"
  query: string
  start: number
  end: number
  selectedIndex: number
  visibleStartIndex: number
}

export type EditorModalState = {
  target: BufferModalTarget
  renderable: TextareaRenderable
  promptSuggestion: PromptSuggestionState | null
  visibleLineCount: number
  promptDraftIndex?: number
}

export type PromptMessage = {
  id?: string
  text: string
  role: "user" | "assistant"
  mode?: UiMode
  status?: "streaming" | "complete" | "error"
  provider?: string
}

export type ChatSession = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  graphPath: string
  draftPromptText: string
  lastMode: UiMode
  messages: PromptMessage[]
}

export type ChatSessionSummary = {
  id: string
  title: string
  updatedAt: string
  messageCount: number
  lastMode: UiMode
}

export type SessionStoreIndex = {
  schemaVersion: 1
  graphPath: string
  activeSessionId: string | null
  sessions: ChatSessionSummary[]
}

export type ChatStreamEvent =
  | { type: "response.created"; responseId: string; messageId: string; role: "assistant"; provider: string }
  | { type: "response.output_text.delta"; responseId: string; messageId: string; delta: string }
  | { type: "response.completed"; responseId: string; messageId: string }
  | { type: "response.error"; responseId: string; messageId: string; error: string }

export type ChatTurnRequest = {
  messages: Array<{ role: "user" | "assistant"; text: string }>
  mode: UiMode
}

export type ChatTransport = {
  streamTurn: (request: ChatTurnRequest) => AsyncIterable<ChatStreamEvent>
}

export type KindDefinition = {
  kind: string
  description: string
  source: "graph" | "options"
}

export type CreateConceptDraft = {
  title: string
  summary: string
}

export type CreateConceptModalState = {
  draft: CreateConceptDraft
  fieldIndex: number
  kindExpanded: boolean
  kindCursor: number
  kindQuery: string
}

export type ConfirmModalState =
  {
      kind: "remove-draft"
      title: string
      message: string[]
      confirmLabel: string
      path: string
    }

export type SessionModalState = {
  selectedIndex: number
  scrollTop: number
}

export type WorkspaceFocus = "session" | "concepts"

export type WorkspaceTransitionState = {
  from: WorkspaceFocus
  to: WorkspaceFocus
  progress: number
  startedAt: number
  loggedFirstFrame?: boolean
}

export type UiLayoutConfig = {
  collapsedPromptRatio: number
  conceptsToSessionTransitionCollapsedPromptRatio: number
  expandedPromptRatio: number
  conceptsToSessionTransitionExpandedPromptRatio: number
  conceptsToSessionRightStackStartWidthRatio: number
  conceptsToSessionDetailsHeightAcceleration: number
  promptAnimationEpsilon: number
  promptAnimationStepMs: number
  promptAnimationLerp: number
  workspaceTransitionStepMs: number
  workspaceTransitionDurationMs: number
  workspaceTransitionAcceleration: number
  workspaceTransitionEndEasePower: number
  workspaceTransitionStaggerDelay: number
  workspaceTransitionFadeStart: number
  workspaceTransitionFadeEnd: number
  viewportHorizontalInset: number
  rootPadding: number
  interPaneGap: number
  minFrameWidth: number
  minFrameHeight: number
  minPromptPaneWidth: number
  minSidebarWidth: number
  supportHeight: number
  minPreviewHeight: number
  minPaneWidth: number
  minPaneHeight: number
  transitionChipWidth: number
  transitionChipHeight: number
}

export type AppState = {
  jsonPath: string
  graphPayload: GraphPayload
  nodes: Map<string, ConceptNode>
  projectFiles: string[]
  projectDirectories: string[]
  sourceFileCache: Map<string, string[]>
  conceptNamespaceMode: ConceptNamespaceMode
  currentParentPath: string
  cursor: number
  kindDefinitions: KindDefinition[]
  createConceptModal: CreateConceptModalState | null
  confirmModal: ConfirmModalState | null
  layoutMode: LayoutMode
  uiMode: UiMode
  inspector: InspectorState | null
  mainScrollTop: number
  mainViewportHeight: number
  contextTitle: string
  contextLegendItems: Array<{ kindLabel: string; color: RGBA }>
  sessions: ChatSession[]
  activeSessionId: string
  promptPaneRatio: number
  promptPaneTargetRatio: number
  promptPaneMode: "collapsed" | "expanded"
  uiLayoutConfig: UiLayoutConfig
  promptScrollTop: number
  promptViewportHeight: number
  conceptNavigationFocused: boolean
  startupDrawComplete: boolean
  editorModal: EditorModalState | null
  sessionModal: SessionModalState | null
  pendingCtrlCExit: boolean
  ctrlCExitTimeout: ReturnType<typeof setTimeout> | null
  promptPaneAnimationTimeout: ReturnType<typeof setTimeout> | null
  promptTokenBreakdown: EffectivePromptTokenBreakdown
  chatTransport: ChatTransport
  activeResponseId: string | null
  activeAssistantMessageId: string | null
  workspaceTransition: WorkspaceTransitionState | null
  workspaceTransitionTimeout: ReturnType<typeof setTimeout> | null
}
