import type { TextareaRenderable } from "@opentui/core"

import type { RGBA } from "@opentui/core"
import type { EffectivePromptTokenBreakdown } from "./clipboard"

export type JsonPrimitive = null | boolean | number | string
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type ConceptNode = {
  path: string
  title: string
  kind: string | null
  summary: string
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
  root?: Record<string, JsonValue>
}

export type LayoutMode = "wide" | "narrow"

export type UiMode = "plan" | "build"

export type InspectorKind = "snippet" | "subtree" | "metadata"

export type MainLine = {
  content: string
  role: "title" | "section" | "body" | "muted"
}

export type ListLine = {
  title: string
  kindLabel: string
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

export type AliasSuggestionState = {
  prefix: "@" | "&"
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
  aliasSuggestion: AliasSuggestionState | null
  visibleLineCount: number
  promptDraftIndex?: number
}

export type PromptMessage = {
  text: string
  role: "user" | "assistant"
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

export type AppState = {
  jsonPath: string
  graphPayload: GraphPayload
  nodes: Map<string, ConceptNode>
  projectFiles: string[]
  projectDirectories: string[]
  sourceFileCache: Map<string, string[]>
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
  promptMessages: PromptMessage[]
  promptText: string
  promptPaneRatio: number
  promptPaneTargetRatio: number
  promptPaneMode: "collapsed" | "expanded"
  promptScrollTop: number
  promptViewportHeight: number
  conceptNavigationFocused: boolean
  startupDrawComplete: boolean
  editorModal: EditorModalState | null
  pendingCtrlCExit: boolean
  ctrlCExitTimeout: ReturnType<typeof setTimeout> | null
  promptPaneAnimationTimeout: ReturnType<typeof setTimeout> | null
  promptTokenBreakdown: EffectivePromptTokenBreakdown
}
