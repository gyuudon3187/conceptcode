import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"

import type { ConceptNode, GraphPayload, JsonValue, KindDefinition, SourceLoc } from "./types"

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
  parentPath: string | null,
): Map<string, ConceptNode> {
  const childPayloads = normalizeChildren(nodePayload.children)
  const childPaths = Object.keys(childPayloads).map((key) => `${path}.${key}`)
  const metadata = Object.fromEntries(Object.entries(nodePayload).filter(([key]) => key !== "children"))
  const nodes = new Map<string, ConceptNode>()
  nodes.set(path, {
    path,
    title: asString(nodePayload.title, path.split(".").at(-1) ?? path),
    kind: optionalString(nodePayload.kind),
    summary: asString(nodePayload.summary),
    parentPath,
    metadata,
    loc: normalizeLoc(nodePayload.loc),
    childPaths,
  })
  for (const [key, child] of Object.entries(childPayloads)) {
    const childPath = `${path}.${key}`
    for (const [nestedPath, node] of buildNodes(child, childPath, path)) {
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
  const payload = JSON.parse(readFileSync(optionsPath, "utf8")) as JsonValue
  const root = asObject(payload)
  const kindDefinitions = asObject(root.kind_definitions)
  return Object.entries(kindDefinitions)
    .filter(([, value]) => typeof value === "string")
    .map(([kind, description]) => ({ kind, description: String(description), source: "options" as const }))
    .sort((left, right) => left.kind.localeCompare(right.kind))
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

export function loadConceptGraph(jsonPath: string, optionsPath?: string): { graphPayload: GraphPayload; nodes: Map<string, ConceptNode>; kindDefinitions: KindDefinition[] } {
  const payload = JSON.parse(readFileSync(jsonPath, "utf8")) as GraphPayload
  const rootPayload = asObject(payload.root as JsonValue | undefined)
  if (Object.keys(rootPayload).length === 0) {
    throw new Error(`Concept graph at ${jsonPath} is missing a root object`)
  }
  const nodes = buildNodes(rootPayload, "root", null)
  return { graphPayload: payload, nodes, kindDefinitions: mergeKindDefinitions(inferredKindDefinitions(nodes), kindDefinitionsFromOptions(optionsPath)) }
}
