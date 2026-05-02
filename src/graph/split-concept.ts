export * from "conceptcode/graph/split-concept"

import { splitConcept } from "conceptcode/graph/split-concept"

async function main(): Promise<void> {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Expected a JSON payload argument")
  }
  await splitConcept(JSON.parse(raw) as Parameters<typeof splitConcept>[0])
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
