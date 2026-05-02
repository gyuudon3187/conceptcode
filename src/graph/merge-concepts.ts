export * from "conceptcode/graph/merge-concepts"

import { mergeConcepts } from "conceptcode/graph/merge-concepts"

async function main(): Promise<void> {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Expected a JSON payload argument")
  }
  await mergeConcepts(JSON.parse(raw) as Parameters<typeof mergeConcepts>[0])
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
