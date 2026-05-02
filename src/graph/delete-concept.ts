export * from "conceptcode/graph/delete-concept"

import { deleteConcept } from "conceptcode/graph/delete-concept"

async function main(): Promise<void> {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Expected a JSON payload argument")
  }
  await deleteConcept(JSON.parse(raw) as Parameters<typeof deleteConcept>[0])
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
