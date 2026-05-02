export * from "conceptcode/graph/create-concept"

import { createConcept } from "conceptcode/graph/create-concept"

async function main(): Promise<void> {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Expected a JSON payload argument")
  }
  await createConcept(JSON.parse(raw) as Parameters<typeof createConcept>[0])
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
