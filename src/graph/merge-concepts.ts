import type { JsonValue } from "../core/types"
import { preflightMergeConcepts, type MergeConceptPreflightInput } from "./merge-concepts-preflight"
import { applyPathRewrites } from "./rewrite-paths"
import { conceptAtPath, conceptParentAtPath, ensureChildren, normalizeRelatedPaths, readGraph, writeGraph, type JsonObject } from "./mutate"

type MergeConceptsInput = MergeConceptPreflightInput & {
  confirmed?: boolean
  overrideFields?: Record<string, JsonValue>
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function mergeAliases(survivor: JsonObject, removed: JsonObject): void {
  const merged = normalizeRelatedPaths([...(Array.isArray(survivor.aliases) ? survivor.aliases : []), ...(Array.isArray(removed.aliases) ? removed.aliases : [])])
  if (merged.length > 0) {
    survivor.aliases = merged
  }
}

function mergeRelatedPaths(survivor: JsonObject, removed: JsonObject, survivorPath: string, removedPath: string): void {
  const merged = normalizeRelatedPaths([
    ...(Array.isArray(survivor.related_paths) ? survivor.related_paths : []),
    ...(Array.isArray(removed.related_paths) ? removed.related_paths : []),
  ]).filter((path) => path !== survivorPath && path !== removedPath)

  if (merged.length > 0) {
    survivor.related_paths = merged
    return
  }

  if ("related_paths" in survivor) {
    delete survivor.related_paths
  }
}

function applyFieldOverrides(survivor: JsonObject, overrides: Record<string, JsonValue> | undefined): void {
  if (!overrides) return
  for (const [field, value] of Object.entries(overrides)) {
    if (field === "children") continue
    survivor[field] = value
  }
}

function mergeMetadata(survivor: JsonObject, removed: JsonObject): void {
  for (const [field, removedValue] of Object.entries(removed)) {
    if (field === "children" || field === "aliases" || field === "related_paths") continue
    if (!(field in survivor)) {
      survivor[field] = removedValue
    }
  }
}

function attachRemovedChildren(survivor: JsonObject, removed: JsonObject): void {
  const survivorChildren = ensureChildren(survivor)
  for (const [childKey, child] of Object.entries(ensureChildren(removed))) {
    if (childKey in survivorChildren) continue
    survivorChildren[childKey] = child
  }
}

export async function mergeConcepts(input: MergeConceptsInput): Promise<void> {
  const preflight = await preflightMergeConcepts(input)
  if (!input.confirmed) {
    throw new Error(`Merge requires confirmation after preflight for ${input.removedPath}`)
  }
  if (preflight.childCollisions.length > 0) {
    const collisions = preflight.childCollisions.map((collision) => collision.childKey).join(", ")
    throw new Error(`Merge has child collisions that require resolution before mutation: ${collisions}`)
  }

  const graph = await readGraph(input.graphPath)
  const survivor = conceptAtPath(graph, input.survivorPath)
  const removed = conceptAtPath(graph, input.removedPath)
  if (!survivor) {
    throw new Error(`Survivor concept does not exist: ${input.survivorPath}`)
  }
  if (!removed) {
    throw new Error(`Removed concept does not exist: ${input.removedPath}`)
  }

  mergeMetadata(survivor, removed)
  applyFieldOverrides(survivor, input.overrideFields)
  mergeAliases(survivor, removed)
  mergeRelatedPaths(survivor, removed, input.survivorPath, input.removedPath)
  attachRemovedChildren(survivor, removed)

  const { parent, childKey } = conceptParentAtPath(graph, input.removedPath)
  const siblings = ensureChildren(parent)
  delete siblings[childKey]

  applyPathRewrites(graph, preflight.subtreePathRewrites)
  await writeGraph(input.graphPath, graph)
}

async function main(): Promise<void> {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Expected a JSON payload argument")
  }
  await mergeConcepts(JSON.parse(raw) as MergeConceptsInput)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
