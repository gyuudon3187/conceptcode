import { readFile, writeFile } from "node:fs/promises"

import type { JsonValue } from "../core/types"

export type JsonObject = Record<string, JsonValue>

export type GraphNamespace = "impl" | "domain"

export type ConceptVisit = {
  path: string
  key: string
  namespace: GraphNamespace
  node: JsonObject
  parentPath: string | null
}

export function isObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function childEntries(node: JsonObject): Array<[string, JsonObject]> {
  if (!isObject(node.children)) return []
  return Object.entries(node.children).filter((entry): entry is [string, JsonObject] => isObject(entry[1]))
}

function pathSegments(conceptPath: string): string[] {
  const parts = conceptPath.split(".").filter(Boolean)
  if (parts[0] !== "impl" && parts[0] !== "domain") {
    throw new Error(`Concept path must start with impl or domain: ${conceptPath}`)
  }
  return parts
}

export async function readGraph(graphPath: string): Promise<JsonObject> {
  const raw = JSON.parse(await readFile(graphPath, "utf8")) as JsonValue
  if (!isObject(raw) || (!isObject(raw.impl) && !isObject(raw.domain))) {
    throw new Error(`Concept graph at ${graphPath} must include at least one of impl or domain`)
  }
  return raw
}

export async function writeGraph(graphPath: string, graph: JsonObject): Promise<void> {
  await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8")
}

export function conceptAtPath(graph: JsonObject, conceptPath: string): JsonObject | null {
  const parts = pathSegments(conceptPath)
  let current: JsonValue | undefined = graph[parts[0]]
  if (!isObject(current)) return null
  for (let index = 1; index < parts.length; index += 1) {
    const children: JsonValue | undefined = current.children
    if (!isObject(children)) return null
    const next: JsonValue | undefined = children[parts[index]]
    if (!isObject(next)) return null
    current = next
  }
  return current
}

export function conceptParentAtPath(graph: JsonObject, conceptPath: string): { parent: JsonObject; childKey: string } {
  const parts = pathSegments(conceptPath)
  if (parts.length < 2) {
    throw new Error("Cannot mutate the namespace concept")
  }
  const childKey = parts.at(-1)!
  const parentPath = parts.slice(0, -1).join(".")
  const parent = conceptAtPath(graph, parentPath)
  if (!parent) {
    throw new Error(`Parent concept does not exist: ${parentPath}`)
  }
  return { parent, childKey }
}

export function ensureChildren(node: JsonObject): JsonObject {
  if (!isObject(node.children)) {
    node.children = {}
  }
  return node.children as JsonObject
}

export function stableChildKey(segment: string): string {
  const normalized = segment.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
  if (!normalized) {
    throw new Error("Concept key must contain at least one alphanumeric character")
  }
  return normalized
}

export function removeRelatedPathReferences(node: JsonObject, deletedPath: string): void {
  const relatedPaths = node.related_paths
  if (Array.isArray(relatedPaths)) {
    node.related_paths = relatedPaths.filter((item) => item !== deletedPath)
  }
  const children = isObject(node.children) ? node.children : null
  if (!children) return
  for (const child of Object.values(children)) {
    if (isObject(child)) {
      removeRelatedPathReferences(child, deletedPath)
    }
  }
}

export function normalizeRelatedPaths(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const item of value) {
    if (typeof item !== "string") continue
    if (seen.has(item)) continue
    seen.add(item)
    normalized.push(item)
  }
  return normalized
}

export function visitConcepts(graph: JsonObject, visit: (entry: ConceptVisit) => void): void {
  for (const namespace of ["impl", "domain"] as const) {
    const node = graph[namespace]
    if (!isObject(node)) continue
    visit({ path: namespace, key: namespace, namespace, node, parentPath: null })
    visitChildren(node, namespace, namespace, visit)
  }
}

function visitChildren(node: JsonObject, parentPath: string, namespace: GraphNamespace, visit: (entry: ConceptVisit) => void): void {
  for (const [childKey, child] of childEntries(node)) {
    const path = `${parentPath}.${childKey}`
    visit({ path, key: childKey, namespace, node: child, parentPath })
    visitChildren(child, path, namespace, visit)
  }
}
