import { readFile, writeFile } from "node:fs/promises"

import type { JsonValue } from "../core/types"

export type JsonObject = Record<string, JsonValue>

function isObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function pathSegments(conceptPath: string): string[] {
  const parts = conceptPath.split(".").filter(Boolean)
  if (parts[0] !== "root" && parts[0] !== "domain") {
    throw new Error(`Concept path must start with root or domain: ${conceptPath}`)
  }
  return parts
}

export async function readGraph(graphPath: string): Promise<JsonObject> {
  const raw = JSON.parse(await readFile(graphPath, "utf8")) as JsonValue
  if (!isObject(raw) || (!isObject(raw.root) && !isObject(raw.domain))) {
    throw new Error(`Concept graph at ${graphPath} must include at least one of root or domain`)
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
    throw new Error("Cannot mutate the root concept")
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
