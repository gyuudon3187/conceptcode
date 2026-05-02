export * from "conceptcode/graph/split-concept-preflight"

import { preflightSplitConcept } from "conceptcode/graph/split-concept-preflight"

async function main(): Promise<void> {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Expected a JSON payload argument")
  }
  const preflight = await preflightSplitConcept(JSON.parse(raw) as Parameters<typeof preflightSplitConcept>[0])
  console.log(JSON.stringify(preflight, null, 2))
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
