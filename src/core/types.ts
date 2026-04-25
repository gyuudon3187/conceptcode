import type { TextareaRenderable } from "@opentui/core"

import type { RGBA } from "@opentui/core"
import type {
  LayoutMode,
  ShellWorkspaceState,
  UiLayoutConfig,
  WorkspaceTransitionState,
} from "agent-tui/types"
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

export type PromptSuggestionPrefix = PromptSuggestionState["prefix"]

export type PromptSuggestionContext = {
  prefix: PromptSuggestionPrefix
  query: string
  mode: PromptSuggestionState["mode"]
}

export type PromptSuggestionEntry = {
  value: string
  description?: string
}

export type PromptSuggestionProvider = {
  suggestions: (context: PromptSuggestionContext) => PromptSuggestionEntry[]
  isResolvedValue?: (context: { prefix: PromptSuggestionPrefix; query: string; value: string }) => boolean
  acceptTrailingText?: (context: { prefix: PromptSuggestionPrefix; value: string; suffix: string }) => string
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
  createdAt?: string
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
  | {
      kind: "remove-draft"
      title: string
      message: string[]
      confirmLabel: string
      path: string
    }
  | {
      kind: "delete-session"
      title: string
      message: string[]
      confirmLabel: string
      sessionId: string
    }

export type SessionModalState = {
  selectedIndex: number
  scrollTop: number
}

// Internal ownership boundary for the future shell extraction:
// - App-owned state keeps concept graph semantics, prompt semantics, sessions, and inspectors.
// - Shell-owned state is expected to absorb layout, workspace chrome, and modal primitives.
// This milestone keeps the runtime AppState flat, but names the slices explicitly so new
// code can depend on narrower contracts instead of the full state object.
export type ConceptGraphState = {
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
}

export type ModalTransientState = {
  createConceptModal: CreateConceptModalState | null
  confirmModal: ConfirmModalState | null
  editorModal: EditorModalState | null
  sessionModal: SessionModalState | null
  pendingCtrlCExit: boolean
  ctrlCExitTimeout: ReturnType<typeof setTimeout> | null
  promptPaneAnimationTimeout: ReturnType<typeof setTimeout> | null
  workspaceTransitionTimeout: ReturnType<typeof setTimeout> | null
}

export type PromptEditorUiState = {
  uiMode: UiMode
  inspector: InspectorState | null
  contextTitle: string
  contextLegendItems: Array<{ kindLabel: string; color: RGBA }>
  promptTokenBreakdown: EffectivePromptTokenBreakdown
}

export type WorkspaceUiState = {
  layoutMode: LayoutMode
  uiLayoutConfig: UiLayoutConfig
  conceptNavigationFocused: boolean
  startupDrawComplete: boolean
  mainViewportHeight: number
  promptViewportHeight: number
  promptPaneRatio: number
  promptPaneTargetRatio: number
  promptPaneMode: "collapsed" | "expanded"
  promptScrollTop: number
  mainScrollTop: number
  workspaceTransition: WorkspaceTransitionState | null
}

export type ShellPaneRegion = "main" | "supportTop" | "supportBottom" | "session" | "overlay"

export type SessionChatState = {
  sessions: ChatSession[]
  activeSessionId: string
  chatTransport: ChatTransport
  activeResponseId: string | null
  activeAssistantMessageId: string | null
}

export type PromptEditorHostState = Pick<
  WorkspaceUiState,
  "layoutMode" | "mainScrollTop" | "mainViewportHeight" | "promptPaneRatio" | "promptPaneTargetRatio" | "promptPaneMode" | "promptScrollTop" | "promptViewportHeight"
> &
  Pick<SessionChatState, "sessions" | "activeSessionId"> &
  PromptEditorUiState

export type SessionModalHostState = Pick<WorkspaceUiState, "layoutMode"> & Pick<SessionChatState, "sessions" | "activeSessionId"> & Pick<ModalTransientState, "sessionModal">

export type AppState = ConceptGraphState &
  ModalTransientState &
  PromptEditorUiState &
  WorkspaceUiState &
  SessionChatState
