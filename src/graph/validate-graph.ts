export * from "conceptcode/graph/validate-graph"

import { validateConceptGraph } from "conceptcode/graph/validate-graph"

async function main(): Promise<void> {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Expected a JSON payload argument")
  }
  const result = await validateConceptGraph(JSON.parse(raw) as Parameters<typeof validateConceptGraph>[0])
  console.log(JSON.stringify(result, null, 2))
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
