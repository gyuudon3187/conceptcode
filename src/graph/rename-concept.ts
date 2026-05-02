export * from "conceptcode/graph/rename-concept"

import { renameConcept } from "conceptcode/graph/rename-concept"

async function main(): Promise<void> {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Expected a JSON payload argument")
  }
  await renameConcept(JSON.parse(raw) as Parameters<typeof renameConcept>[0])
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
