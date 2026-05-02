export * from "conceptcode/graph/move-concept"

import { moveConcept } from "conceptcode/graph/move-concept"

async function main(): Promise<void> {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Expected a JSON payload argument")
  }
  await moveConcept(JSON.parse(raw) as Parameters<typeof moveConcept>[0])
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
