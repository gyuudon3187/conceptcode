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

export type ListLine = {
  content: string
  selected: boolean
  buffered: boolean
}

export type BufferModalTarget = {
  kind: "prompt" | "concept"
  path?: string
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

export type AppState = {
  jsonPath: string
  graphPayload: GraphPayload
  nodes: Map<string, ConceptNode>
  currentParentPath: string
  cursor: number
  bufferedPaths: string[]
  status: StatusState
  layoutMode: LayoutMode
  mainScrollTop: number
  mainViewportHeight: number
  showBufferModal: boolean
  bufferModalCursor: number
  promptText: string
  conceptNotes: Record<string, string>
  editorModal: EditorModalState | null
  pendingCopyChoice: PendingCopyChoiceState | null
  statusTimeout: ReturnType<typeof setTimeout> | null
  statusVersion: number
}
