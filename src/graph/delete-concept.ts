import { conceptAtPath, conceptParentAtPath, ensureChildren, readGraph, removeRelatedPathReferences, writeGraph } from "./mutate"

type DeleteConceptInput = {
  graphPath: string
  conceptPath: string
}

export async function deleteConcept(input: DeleteConceptInput): Promise<void> {
  const graph = await readGraph(input.graphPath)
  if (!conceptAtPath(graph, input.conceptPath)) {
    throw new Error(`Concept does not exist: ${input.conceptPath}`)
  }
  const { parent, childKey } = conceptParentAtPath(graph, input.conceptPath)
  const children = ensureChildren(parent)
  delete children[childKey]
  removeRelatedPathReferences(graph.root as Record<string, never>, input.conceptPath)
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
