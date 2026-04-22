import { restructureConceptPreflight, type RestructureConceptPreflight } from "./analyze"
import { conceptAtPath, ensureChildren, readGraph, type JsonObject } from "./mutate"

export type MoveConceptPreflightInput = {
  graphPath: string
  conceptPath: string
  destinationParentPath: string
}

function validateMove(graph: JsonObject, conceptPath: string, destinationParentPath: string): string {
  const concept = conceptAtPath(graph, conceptPath)
  if (!concept) {
    throw new Error(`Concept does not exist: ${conceptPath}`)
  }
  if (conceptPath.split(".").length < 2) {
    throw new Error("Cannot move the root concept")
  }
  const destinationParent = conceptAtPath(graph, destinationParentPath)
  if (!destinationParent) {
    throw new Error(`Destination parent does not exist: ${destinationParentPath}`)
  }
  if (destinationParentPath === conceptPath || destinationParentPath.startsWith(`${conceptPath}.`)) {
    throw new Error(`Cannot move a concept into its own descendant: ${destinationParentPath}`)
  }
  const childKey = conceptPath.split(".").at(-1)!
  const destinationChildren = ensureChildren(destinationParent)
  const targetPath = `${destinationParentPath}.${childKey}`
  if (childKey in destinationChildren) {
    throw new Error(`Sibling concept already exists at ${targetPath}`)
  }
  return targetPath
}

export async function preflightMoveConcept(input: MoveConceptPreflightInput): Promise<RestructureConceptPreflight> {
  const graph = await readGraph(input.graphPath)
  const targetPath = validateMove(graph, input.conceptPath, input.destinationParentPath)
  return restructureConceptPreflight(graph, input.conceptPath, targetPath)
}
