import { deleteConceptPreflight, type DeleteConceptPreflight } from "./analyze"
import { conceptParentAtPath, ensureChildren, readGraph, removeRelatedPathReferences, writeGraph } from "./mutate"

type DeleteConceptInput = {
  graphPath: string
  conceptPath: string
  confirmed?: boolean
}

export async function preflightDeleteConcept(input: Omit<DeleteConceptInput, "confirmed">): Promise<DeleteConceptPreflight> {
  const graph = await readGraph(input.graphPath)
  return deleteConceptPreflight(graph, input.conceptPath)
}

export async function deleteConcept(input: DeleteConceptInput): Promise<void> {
  const graph = await readGraph(input.graphPath)
  const preflight = deleteConceptPreflight(graph, input.conceptPath)
  if (!preflight.exists) {
    throw new Error(`Concept does not exist: ${input.conceptPath}`)
  }
  if (!input.confirmed) {
    throw new Error(`Deletion requires confirmation after preflight for ${input.conceptPath}`)
  }
  const { parent, childKey } = conceptParentAtPath(graph, input.conceptPath)
  const children = ensureChildren(parent)
  delete children[childKey]
  if (graph.impl && typeof graph.impl === "object" && !Array.isArray(graph.impl)) {
    removeRelatedPathReferences(graph.impl as Record<string, never>, input.conceptPath)
  }
  if (graph.domain && typeof graph.domain === "object" && !Array.isArray(graph.domain)) {
    removeRelatedPathReferences(graph.domain as Record<string, never>, input.conceptPath)
  }
  await writeGraph(input.graphPath, graph)
}

async function main(): Promise<void> {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Expected a JSON payload argument")
  }
  await deleteConcept(JSON.parse(raw) as DeleteConceptInput)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
