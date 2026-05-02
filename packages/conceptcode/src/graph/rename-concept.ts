import { preflightRenameConcept, type RenameConceptPreflightInput } from "./rename-concept-preflight"
import { applyPathRewrites } from "./rewrite-paths"
import { conceptParentAtPath, ensureChildren, readGraph, writeGraph } from "./mutate"

type RenameConceptInput = RenameConceptPreflightInput & {
  confirmed?: boolean
  addOldLeafAlias?: boolean
}

export async function renameConcept(input: RenameConceptInput): Promise<void> {
  const preflight = await preflightRenameConcept(input)
  if (!preflight.exists || !preflight.targetPath) {
    throw new Error(`Concept does not exist: ${input.conceptPath}`)
  }
  if (!input.confirmed) {
    throw new Error(`Rename requires confirmation after preflight for ${input.conceptPath}`)
  }

  const graph = await readGraph(input.graphPath)
  const { parent, childKey } = conceptParentAtPath(graph, input.conceptPath)
  const children = ensureChildren(parent)
  const node = children[childKey]
  delete children[childKey]
  children[input.newKey] = node

  if (input.addOldLeafAlias && node && typeof node === "object" && !Array.isArray(node)) {
    const aliases = Array.isArray(node.aliases) ? node.aliases.filter((value): value is string => typeof value === "string") : []
    if (!aliases.includes(childKey)) aliases.push(childKey)
    node.aliases = aliases
  }

  applyPathRewrites(graph, preflight.subtreePathRewrites)
  await writeGraph(input.graphPath, graph)
}

async function main(): Promise<void> {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Expected a JSON payload argument")
  }
  await renameConcept(JSON.parse(raw) as RenameConceptInput)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
