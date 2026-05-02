export type JsonPrimitive = null | boolean | number | string
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type SourceLoc = {
  file: string
  startLine: number
  endLine: number
}

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

export type GraphPayload = {
  interpretation_hint?: Record<string, JsonValue>
  impl?: Record<string, JsonValue>
  domain?: Record<string, JsonValue>
}

export type ConceptNamespace = "impl" | "domain"
export type ConceptNamespaceMode = "implementation" | "domain"

export type KindDefinition = {
  kind: string
  description: string
  source: "graph" | "options"
}

export type CreateConceptDraft = {
  title: string
  summary: string
}

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
