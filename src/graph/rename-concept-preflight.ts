import { restructureConceptPreflight, type RestructureConceptPreflight } from "./analyze"
import { conceptAtPath, conceptParentAtPath, ensureChildren, readGraph, stableChildKey, type JsonObject } from "./mutate"

export type RenameConceptPreflightInput = {
  graphPath: string
  conceptPath: string
  newKey: string
}

function validateRename(graph: JsonObject, conceptPath: string, newKey: string): string {
  if (!conceptAtPath(graph, conceptPath)) {
    throw new Error(`Concept does not exist: ${conceptPath}`)
  }
  const { parent, childKey } = conceptParentAtPath(graph, conceptPath)
  if (conceptPath.split(".").length < 2) {
    throw new Error("Cannot rename the root concept")
  }
  if (stableChildKey(newKey) !== newKey) {
    throw new Error(`New child key must already be a stable child key: ${newKey}`)
  }
  if (newKey === childKey) {
    throw new Error(`New child key matches the current key: ${newKey}`)
  }
  const siblings = ensureChildren(parent)
  if (newKey in siblings) {
    throw new Error(`Sibling concept already exists at ${conceptPath.split(".").slice(0, -1).join(".")}.${newKey}`)
  }
  return `${conceptPath.split(".").slice(0, -1).join(".")}.${newKey}`
}

export async function preflightRenameConcept(input: RenameConceptPreflightInput): Promise<RestructureConceptPreflight> {
  const graph = await readGraph(input.graphPath)
  const targetPath = validateRename(graph, input.conceptPath, input.newKey)
  return restructureConceptPreflight(graph, input.conceptPath, targetPath)
}
