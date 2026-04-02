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
  statusTimeout: ReturnType<typeof setTimeout> | null
  statusVersion: number
}
