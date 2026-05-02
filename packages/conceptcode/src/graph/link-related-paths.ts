import { conceptAtPath, readGraph, writeGraph, normalizeRelatedPaths } from "./mutate"

export type LinkRelatedPathsInput = {
  graphPath: string
  conceptPath: string
  operation: "add" | "remove" | "normalize"
  relatedPaths?: string[]
}

function validatePaths(graphPath: string, paths: string[] | undefined): string[] {
  const normalized = normalizeRelatedPaths(paths)
  if (normalized.length === 0) {
    throw new Error(`Link operation requires at least one related path for ${graphPath}`)
  }
  return normalized
}

export async function linkRelatedPaths(input: LinkRelatedPathsInput): Promise<void> {
  const graph = await readGraph(input.graphPath)
  const concept = conceptAtPath(graph, input.conceptPath)
  if (!concept) {
    throw new Error(`Concept does not exist: ${input.conceptPath}`)
  }

  const current = normalizeRelatedPaths(concept.related_paths)
  if (input.operation === "normalize") {
    concept.related_paths = current
    await writeGraph(input.graphPath, graph)
    return
  }

  const requested = validatePaths(input.conceptPath, input.relatedPaths)
  for (const relatedPath of requested) {
    if (!conceptAtPath(graph, relatedPath)) {
      throw new Error(`Related concept does not exist: ${relatedPath}`)
    }
  }

  if (input.operation === "add") {
    concept.related_paths = normalizeRelatedPaths([...current, ...requested])
  } else {
    const removals = new Set(requested)
    concept.related_paths = current.filter((path) => !removals.has(path))
  }

  await writeGraph(input.graphPath, graph)
}

async function main(): Promise<void> {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Expected a JSON payload argument")
  }
  await linkRelatedPaths(JSON.parse(raw) as LinkRelatedPathsInput)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
