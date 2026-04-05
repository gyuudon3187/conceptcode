import { readFileSync } from "node:fs"

import type { ConceptNode, GraphPayload, JsonValue, KindDefinition } from "./types"

function asObject(value: JsonValue | undefined): Record<string, JsonValue> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, JsonValue>
  }
  return {}
}

function asString(value: JsonValue | undefined, fallback = ""): string {
  return typeof value === "string" ? value : fallback
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
    kind: asString(nodePayload.kind, "concept"),
    summary: asString(nodePayload.summary),
    parentPath,
    metadata,
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

function kindDefinitionsFromPayload(payload: GraphPayload, nodes: Map<string, ConceptNode>): KindDefinition[] {
  const interpretationHint = asObject(payload.interpretation_hint)
  const kindDefinitions = asObject(interpretationHint.kind_definitions)
  const fromGraph = Object.entries(kindDefinitions)
    .filter(([, value]) => typeof value === "string")
    .map(([kind, description]) => ({ kind, description: String(description), source: "graph" as const }))
  if (fromGraph.length > 0) {
    return fromGraph.sort((left, right) => left.kind.localeCompare(right.kind))
  }
  const inferredKinds = [...new Set([...nodes.values()].map((node) => node.kind))].sort((left, right) => left.localeCompare(right))
  return inferredKinds.map((kind) => ({ kind, description: "", source: "graph" as const }))
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

export function loadConceptGraph(jsonPath: string): { graphPayload: GraphPayload; nodes: Map<string, ConceptNode>; kindDefinitions: KindDefinition[] } {
  const payload = JSON.parse(readFileSync(jsonPath, "utf8")) as GraphPayload
  const rootPayload = asObject(payload.root as JsonValue | undefined)
  if (Object.keys(rootPayload).length === 0) {
    throw new Error(`Concept graph at ${jsonPath} is missing a root object`)
  }
  const nodes = buildNodes(rootPayload, "root", null)
  return { graphPayload: payload, nodes, kindDefinitions: kindDefinitionsFromPayload(payload, nodes) }
}
