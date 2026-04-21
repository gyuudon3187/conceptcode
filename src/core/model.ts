import { existsSync, readFileSync } from "node:fs"
import { dirname, extname, isAbsolute, resolve } from "node:path"

import type { ConceptNamespace, ConceptNode, GraphPayload, JsonValue, KindDefinition, SourceLoc, UiLayoutConfig } from "./types"

function asObject(value: JsonValue | undefined): Record<string, JsonValue> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, JsonValue>
  }
  return {}
}

function asString(value: JsonValue | undefined, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

function optionalString(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function normalizeChildren(children: JsonValue | undefined): Record<string, Record<string, JsonValue>> {
  const source = asObject(children)
  const out: Record<string, Record<string, JsonValue>> = {}
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = value as Record<string, JsonValue>
    }
  }
  return out
}

function asNumber(value: JsonValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function normalizedScore(value: JsonValue | undefined): number | null {
  const score = asNumber(value)
  if (score === null) return null
  return Math.max(0, Math.min(1, score))
}

function normalizeLoc(value: JsonValue | undefined): SourceLoc | null {
  const loc = asObject(value)
  const file = asString(loc.file)
  const startLine = asNumber(loc.start_line)
  const endLine = asNumber(loc.end_line)
  if (!file || startLine === null || endLine === null || startLine < 1 || endLine < startLine) {
    return null
  }
  return { file, startLine, endLine }
}

function buildNodes(
  nodePayload: Record<string, JsonValue>,
  path: string,
  namespace: ConceptNamespace,
  parentPath: string | null,
): Map<string, ConceptNode> {
  const childPayloads = normalizeChildren(nodePayload.children)
  const childPaths = Object.keys(childPayloads).map((key) => `${path}.${key}`)
  const metadata = Object.fromEntries(Object.entries(nodePayload).filter(([key]) => key !== "children"))
  const nodes = new Map<string, ConceptNode>()
  nodes.set(path, {
    path,
    namespace,
    title: asString(nodePayload.title, path.split(".").at(-1) ?? path),
    kind: optionalString(nodePayload.kind),
    summary: asString(nodePayload.summary),
    explorationCoverage: namespace === "root" ? normalizedScore(nodePayload.exploration_coverage) : null,
    summaryConfidence: namespace === "root" ? normalizedScore(nodePayload.summary_confidence) : null,
    parentPath,
    metadata: namespace === "root"
      ? metadata
      : Object.fromEntries(Object.entries(metadata).filter(([key]) => key !== "loc" && key !== "exploration_coverage" && key !== "summary_confidence")),
    loc: namespace === "root" ? normalizeLoc(nodePayload.loc) : null,
    childPaths,
  })
  for (const [key, child] of Object.entries(childPayloads)) {
    const childPath = `${path}.${key}`
    for (const [nestedPath, node] of buildNodes(child, childPath, namespace, path)) {
      nodes.set(nestedPath, node)
    }
  }
  return nodes
}

export function sourcePathForNode(jsonPath: string, node: ConceptNode): string | null {
  if (!node.loc?.file) {
    return null
  }
  const candidates = isAbsolute(node.loc.file)
    ? [node.loc.file]
    : [resolve(dirname(jsonPath), node.loc.file), resolve(node.loc.file)]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0] ?? null
}

export function sourceLinesForNode(sourceFileCache: Map<string, string[]>, jsonPath: string, node: ConceptNode): string[] | null {
  if (!node.loc) {
    return null
  }
  const sourcePath = sourcePathForNode(jsonPath, node)
  if (!sourcePath) {
    return null
  }
  let lines = sourceFileCache.get(sourcePath)
  if (!lines) {
    const text = readFileSync(sourcePath, "utf8")
    lines = text.replace(/\r\n/g, "\n").split("\n")
    sourceFileCache.set(sourcePath, lines)
  }
  return lines.slice(node.loc.startLine - 1, node.loc.endLine)
}

function inferredKindDefinitions(nodes: Map<string, ConceptNode>): KindDefinition[] {
  const inferredKinds = [...new Set([...nodes.values()].map((node) => node.kind).filter((kind): kind is string => Boolean(kind)))]
    .sort((left, right) => left.localeCompare(right))
  return inferredKinds.map((kind) => ({ kind, description: "", source: "graph" as const }))
}

function kindDefinitionsFromOptions(optionsPath: string | undefined): KindDefinition[] {
  if (!optionsPath) {
    return []
  }
  const payload = optionsPayloadFromPath(optionsPath)
  const root = asObject(payload)
  const kindDefinitions = asObject(root.kind_definitions)
  return Object.entries(kindDefinitions)
    .filter(([, value]) => typeof value === "string")
    .map(([kind, description]) => ({ kind, description: String(description), source: "options" as const }))
    .sort((left, right) => left.kind.localeCompare(right.kind))
}

function parseScalarYamlValue(rawValue: string): JsonValue {
  const value = rawValue.trim()
  if (value === "true") return true
  if (value === "false") return false
  if (value === "null") return null
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  const numeric = Number(value)
  if (!Number.isNaN(numeric) && value !== "") return numeric
  return value
}

function parseSimpleYaml(text: string): Record<string, JsonValue> {
  const root: Record<string, JsonValue> = {}
  const stack: Array<{ indent: number; value: Record<string, JsonValue> }> = [{ indent: -1, value: root }]
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const withoutComment = rawLine.replace(/\s+#.*$/, "")
    if (!withoutComment.trim()) continue
    const indent = withoutComment.match(/^\s*/)?.[0].length ?? 0
    const trimmed = withoutComment.trim()
    const separatorIndex = trimmed.indexOf(":")
    if (separatorIndex === -1) continue
    const key = trimmed.slice(0, separatorIndex).trim()
    const rawValue = trimmed.slice(separatorIndex + 1).trim()
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop()
    }
    const parent = stack[stack.length - 1]?.value ?? root
    if (!rawValue) {
      const child: Record<string, JsonValue> = {}
      parent[key] = child
      stack.push({ indent, value: child })
      continue
    }
    parent[key] = parseScalarYamlValue(rawValue)
  }
  return root
}

function optionsPayloadFromPath(optionsPath: string): JsonValue {
  const text = readFileSync(optionsPath, "utf8")
  const extension = extname(optionsPath).toLowerCase()
  if (extension === ".yaml" || extension === ".yml") {
    return parseSimpleYaml(text)
  }
  return JSON.parse(text) as JsonValue
}

function uiLayoutConfigFromOptions(optionsPath: string | undefined): Partial<UiLayoutConfig> {
  if (!optionsPath) return {}
  const payload = optionsPayloadFromPath(optionsPath)
  const root = asObject(payload)
  const uiLayout = asObject(root.ui_layout)
  const result: Partial<UiLayoutConfig> = {}
  const numericKeys: Array<keyof UiLayoutConfig> = [
    "collapsedPromptRatio",
    "conceptsToSessionTransitionCollapsedPromptRatio",
    "expandedPromptRatio",
    "conceptsToSessionTransitionExpandedPromptRatio",
    "conceptsToSessionRightStackStartWidthRatio",
    "conceptsToSessionDetailsHeightAcceleration",
    "promptAnimationEpsilon",
    "promptAnimationStepMs",
    "promptAnimationLerp",
    "workspaceTransitionStepMs",
    "workspaceTransitionDurationMs",
    "workspaceTransitionAcceleration",
    "workspaceTransitionEndEasePower",
    "workspaceTransitionStaggerDelay",
    "workspaceTransitionFadeStart",
    "workspaceTransitionFadeEnd",
    "viewportHorizontalInset",
    "rootPadding",
    "interPaneGap",
    "minFrameWidth",
    "minFrameHeight",
    "minPromptPaneWidth",
    "minSidebarWidth",
    "supportHeight",
    "minPreviewHeight",
    "minPaneWidth",
    "minPaneHeight",
    "transitionChipWidth",
    "transitionChipHeight",
  ]
  for (const key of numericKeys) {
    const value = uiLayout[key]
    if (typeof value === "number" && Number.isFinite(value)) {
      result[key] = value
    }
  }
  return result
}

function mergeKindDefinitions(inferred: KindDefinition[], configured: KindDefinition[]): KindDefinition[] {
  const merged = new Map<string, KindDefinition>()
  for (const item of inferred) {
    merged.set(item.kind, item)
  }
  for (const item of configured) {
    merged.set(item.kind, item)
  }
  return [...merged.values()].sort((left, right) => left.kind.localeCompare(right.kind))
}

export function asMetadataObject(value: JsonValue | undefined): Record<string, JsonValue> {
  return asObject(value)
}

export function bulletList(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is string | number => typeof item === "string" || typeof item === "number").map(String)
}

export function loadConceptGraph(jsonPath: string, optionsPath?: string): { graphPayload: GraphPayload; nodes: Map<string, ConceptNode>; kindDefinitions: KindDefinition[]; uiLayoutConfig: Partial<UiLayoutConfig> } {
  const payload = JSON.parse(readFileSync(jsonPath, "utf8")) as GraphPayload
  const rootPayload = asObject(payload.root as JsonValue | undefined)
  const domainPayload = asObject(payload.domain as JsonValue | undefined)
  if (Object.keys(rootPayload).length === 0 && Object.keys(domainPayload).length === 0) {
    throw new Error(`Concept graph at ${jsonPath} must include at least one of root or domain`)
  }
  const nodes = new Map<string, ConceptNode>()
  if (Object.keys(rootPayload).length > 0) {
    for (const [path, node] of buildNodes(rootPayload, "root", "root", null)) {
      nodes.set(path, node)
    }
  }
  if (Object.keys(domainPayload).length > 0) {
    for (const [path, node] of buildNodes(domainPayload, "domain", "domain", null)) {
      nodes.set(path, node)
    }
  }
  return {
    graphPayload: payload,
    nodes,
    kindDefinitions: mergeKindDefinitions(inferredKindDefinitions(nodes), kindDefinitionsFromOptions(optionsPath)),
    uiLayoutConfig: uiLayoutConfigFromOptions(optionsPath),
  }
}
