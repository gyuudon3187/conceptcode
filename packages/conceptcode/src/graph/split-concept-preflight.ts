import { splitConceptPreflight, type SplitConceptPreflight } from "./analyze"
import { conceptAtPath, ensureChildren, readGraph, stableChildKey, type JsonObject } from "./mutate"

export type SplitConceptTarget = {
  newKey: string
  childKeys: string[]
}

export type SplitConceptPreflightInput = {
  graphPath: string
  conceptPath: string
  targets: SplitConceptTarget[]
  preserveOriginal?: boolean
}

function normalizeRequestedChildKeys(childKeys: string[]): string[] {
  const normalized: string[] = []
  const seen = new Set<string>()
  for (const childKey of childKeys) {
    if (seen.has(childKey)) continue
    seen.add(childKey)
    normalized.push(childKey)
  }
  return normalized
}

function validateSplitTargets(graph: JsonObject, conceptPath: string, targets: SplitConceptTarget[]): Record<string, string[]> {
  if (targets.length === 0) {
    throw new Error(`Split requires at least one target for ${conceptPath}`)
  }

  const concept = conceptAtPath(graph, conceptPath)
  if (!concept) {
    throw new Error(`Concept does not exist: ${conceptPath}`)
  }
  const conceptChildren = ensureChildren(concept)
  const touchedChildKeys = new Set<string>()
  const normalizedTargets: Record<string, string[]> = {}

  for (const target of targets) {
    const newKey = stableChildKey(target.newKey)
    if (newKey in conceptChildren) {
      throw new Error(`Split target already exists under ${conceptPath}: ${newKey}`)
    }
    const childKeys = normalizeRequestedChildKeys(target.childKeys)
    if (childKeys.length === 0) {
      throw new Error(`Split target ${newKey} requires at least one child key`)
    }
    for (const childKey of childKeys) {
      if (!(childKey in conceptChildren)) {
        throw new Error(`Split child does not exist under ${conceptPath}: ${childKey}`)
      }
      if (touchedChildKeys.has(childKey)) {
        throw new Error(`Split child cannot be assigned more than once: ${childKey}`)
      }
      touchedChildKeys.add(childKey)
    }
    normalizedTargets[`${conceptPath}.${newKey}`] = childKeys
  }

  return normalizedTargets
}

export async function preflightSplitConcept(input: SplitConceptPreflightInput): Promise<SplitConceptPreflight> {
  const graph = await readGraph(input.graphPath)
  const normalizedTargets = validateSplitTargets(graph, input.conceptPath, input.targets)
  return splitConceptPreflight(graph, input.conceptPath, normalizedTargets, input.preserveOriginal !== false)
}

async function main(): Promise<void> {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Expected a JSON payload argument")
  }
  const preflight = await preflightSplitConcept(JSON.parse(raw) as SplitConceptPreflightInput)
  console.log(JSON.stringify(preflight, null, 2))
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
