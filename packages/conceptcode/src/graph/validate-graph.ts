import { readGraph } from "./mutate"
import { validateGraph, type ValidateGraphResult } from "./analyze"

type ValidateGraphInput = {
  graphPath: string
}

export async function validateConceptGraph(input: ValidateGraphInput): Promise<ValidateGraphResult> {
  const graph = await readGraph(input.graphPath)
  return validateGraph(graph, input.graphPath)
}

async function main(): Promise<void> {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Expected a JSON payload argument")
  }
  const result = await validateConceptGraph(JSON.parse(raw) as ValidateGraphInput)
  console.log(JSON.stringify(result, null, 2))
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
