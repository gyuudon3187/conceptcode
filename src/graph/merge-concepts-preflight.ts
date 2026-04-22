import { mergeConceptPreflight, type MergeConceptPreflight } from "./analyze"
import { readGraph } from "./mutate"

export type MergeConceptPreflightInput = {
  graphPath: string
  survivorPath: string
  removedPath: string
}

function validateMergePaths(survivorPath: string, removedPath: string): void {
  if (survivorPath === removedPath) {
    throw new Error(`Merge requires distinct concept paths: ${survivorPath}`)
  }
}

export async function preflightMergeConcepts(input: MergeConceptPreflightInput): Promise<MergeConceptPreflight> {
  validateMergePaths(input.survivorPath, input.removedPath)
  const graph = await readGraph(input.graphPath)
  const preflight = mergeConceptPreflight(graph, input.survivorPath, input.removedPath)
  if (!preflight.survivorExists) {
    throw new Error(`Survivor concept does not exist: ${input.survivorPath}`)
  }
  if (!preflight.removedExists) {
    throw new Error(`Removed concept does not exist: ${input.removedPath}`)
  }
  return preflight
}
