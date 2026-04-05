import type { TextareaRenderable } from "@opentui/core"

export type JsonPrimitive = null | boolean | number | string
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type ConceptNode = {
  path: string
  title: string
  kind: string
  summary: string
  parentPath: string | null
  metadata: Record<string, JsonValue>
  childPaths: string[]
  isDraft?: boolean
}

export type GraphPayload = {
  interpretation_hint?: Record<string, JsonValue>
  root?: Record<string, JsonValue>
}

export type StatusTone = "info" | "success" | "warning" | "error"

export type StatusState = {
  message: string
  tone: StatusTone
}

export type LayoutMode = "wide" | "narrow"

export type MainLine = {
  content: string
  role: "title" | "section" | "body" | "muted"
}

export type BufferSummary = {
  visiblePaths: string[]
  hiddenCount: number
}

export type ConceptAction = "delete"

export type BufferedConcept = {
  path: string
  action?: ConceptAction
}

export type ListLine = {
  title: string
  kindLabel: string
  stateLabel?: string
  selected: boolean
  buffered: boolean
  tone?: "draft" | "delete"
  empty?: boolean
}

export type BufferModalTarget = {
  kind: "prompt" | "concept"
  path?: string
}

export type BufferModalCategory = "buffered" | "deleted" | "created"

export type BufferModalState = {
  focus: "prompt" | "categories"
  activeCategory: BufferModalCategory
  cursors: Record<BufferModalCategory, number>
}

export type EditorModalState = {
  target: BufferModalTarget
  renderable: TextareaRenderable
}

export type CopyMode = "full" | "compact"

export type PendingCopyChoiceState = {
  previousMessage: string
  previousTone: StatusTone
}

export type KindDefinition = {
  kind: string
  description: string
  source: "graph" | "session"
}

export type CreateConceptDraft = {
  title: string
  summary: string
  selectedKind: string | null
  newKindName: string
  newKindDescription: string
}

export type CreateConceptModalState = {
  step: "details" | "pick-kind" | "new-kind"
  draft: CreateConceptDraft
  fieldIndex: number
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
  currentParentPath: string
  cursor: number
  bufferedConcepts: BufferedConcept[]
  kindDefinitions: KindDefinition[]
  createConceptModal: CreateConceptModalState | null
  confirmModal: ConfirmModalState | null
  status: StatusState
  layoutMode: LayoutMode
  mainScrollTop: number
  mainViewportHeight: number
  showBufferModal: boolean
  bufferModal: BufferModalState
  promptText: string
  conceptNotes: Record<string, string>
  editorModal: EditorModalState | null
  pendingCopyChoice: PendingCopyChoiceState | null
  statusTimeout: ReturnType<typeof setTimeout> | null
  statusVersion: number
}
