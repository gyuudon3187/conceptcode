import { preflightMoveConcept, type MoveConceptPreflightInput } from "./move-concept-preflight"
import { applyPathRewrites } from "./rewrite-paths"
import { conceptAtPath, conceptParentAtPath, ensureChildren, readGraph, writeGraph } from "./mutate"

type MoveConceptInput = MoveConceptPreflightInput & {
  confirmed?: boolean
}

export async function moveConcept(input: MoveConceptInput): Promise<void> {
  const preflight = await preflightMoveConcept(input)
  if (!preflight.exists || !preflight.targetPath) {
    throw new Error(`Concept does not exist: ${input.conceptPath}`)
  }
  if (!input.confirmed) {
    throw new Error(`Move requires confirmation after preflight for ${input.conceptPath}`)
  }

  const graph = await readGraph(input.graphPath)
  const { parent, childKey } = conceptParentAtPath(graph, input.conceptPath)
  const sourceChildren = ensureChildren(parent)
  const node = sourceChildren[childKey]
  delete sourceChildren[childKey]

  const destinationParent = conceptAtPath(graph, input.destinationParentPath)
  if (!destinationParent) {
    throw new Error(`Destination parent does not exist: ${input.destinationParentPath}`)
  }
  const destinationChildren = ensureChildren(destinationParent)
  destinationChildren[childKey] = node

  applyPathRewrites(graph, preflight.subtreePathRewrites)
  await writeGraph(input.graphPath, graph)
}

async function main(): Promise<void> {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Expected a JSON payload argument")
  }
  await moveConcept(JSON.parse(raw) as MoveConceptInput)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
