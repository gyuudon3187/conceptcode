import type { JsonValue } from "../core/types"
import { applyPathRewrites } from "./rewrite-paths"
import { conceptAtPath, ensureChildren, normalizeRelatedPaths, readGraph, writeGraph, type JsonObject } from "./mutate"
import { preflightSplitConcept, type SplitConceptPreflightInput, type SplitConceptTarget } from "./split-concept-preflight"

type SplitConceptInput = SplitConceptPreflightInput & {
  confirmed?: boolean
  targetFields?: Record<string, Record<string, JsonValue>>
}

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function pickMetadataForTarget(source: JsonObject, childKeys: string[], overrideFields: Record<string, JsonValue> | undefined): JsonObject {
  const next: JsonObject = {}
  for (const [field, value] of Object.entries(source)) {
    if (field === "children" || field === "aliases" || field === "related_paths") continue
    next[field] = cloneJson(value)
  }

  next.children = {}
  next.implemented = false
  next.related_paths = normalizeRelatedPaths(childKeys.map((childKey) => `pending:${childKey}`))

  if (overrideFields) {
    for (const [field, value] of Object.entries(overrideFields)) {
      if (field === "children") continue
      next[field] = cloneJson(value)
    }
  }

  return next
}

function finalizeTargetRelatedPaths(target: JsonObject, childKeys: string[], conceptPath: string, targetPath: string): void {
  const placeholders = new Map(childKeys.map((childKey) => [`pending:${childKey}`, `${targetPath}.${childKey}`]))
  const current = Array.isArray(target.related_paths) ? target.related_paths : []
  const rewritten = current.map((value) => (typeof value === "string" && placeholders.has(value) ? placeholders.get(value)! : value))
  target.related_paths = normalizeRelatedPaths([...rewritten.filter((value): value is string => typeof value === "string"), conceptPath]).filter(
    (value) => value !== targetPath,
  )
}

function attachChildren(sourceChildren: JsonObject, targetChildren: JsonObject, childKeys: string[]): void {
  for (const childKey of childKeys) {
    const child = sourceChildren[childKey]
    delete sourceChildren[childKey]
    targetChildren[childKey] = child
  }
}

export async function splitConcept(input: SplitConceptInput): Promise<void> {
  const preflight = await preflightSplitConcept(input)
  if (!preflight.exists) {
    throw new Error(`Concept does not exist: ${input.conceptPath}`)
  }
  if (!input.confirmed) {
    throw new Error(`Split requires confirmation after preflight for ${input.conceptPath}`)
  }

  const graph = await readGraph(input.graphPath)
  const concept = conceptAtPath(graph, input.conceptPath)
  if (!concept) {
    throw new Error(`Concept does not exist: ${input.conceptPath}`)
  }

  const sourceChildren = ensureChildren(concept)
  const allRewrites = preflight.targetPlans.flatMap((targetPlan) => targetPlan.subtreePathRewrites)

  for (const target of input.targets) {
    const targetPath = `${input.conceptPath}.${target.newKey}`
    const targetNode = pickMetadataForTarget(concept, target.childKeys, input.targetFields?.[target.newKey])
    const targetChildren = ensureChildren(targetNode)
    attachChildren(sourceChildren, targetChildren, target.childKeys)
    finalizeTargetRelatedPaths(targetNode, target.childKeys, input.conceptPath, targetPath)
    sourceChildren[target.newKey] = targetNode
  }

  applyPathRewrites(graph, allRewrites)
  await writeGraph(input.graphPath, graph)
}

async function main(): Promise<void> {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Expected a JSON payload argument")
  }
  await splitConcept(JSON.parse(raw) as SplitConceptInput)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
