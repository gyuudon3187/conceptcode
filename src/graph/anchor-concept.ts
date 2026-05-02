export * from "conceptcode/graph/anchor-concept"

import { anchorConcept } from "conceptcode/graph/anchor-concept"

async function main(): Promise<void> {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Expected a JSON payload argument")
  }
  await anchorConcept(JSON.parse(raw) as Parameters<typeof anchorConcept>[0])
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
