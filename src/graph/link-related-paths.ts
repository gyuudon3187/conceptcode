export * from "conceptcode/graph/link-related-paths"

import { linkRelatedPaths } from "conceptcode/graph/link-related-paths"

async function main(): Promise<void> {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Expected a JSON payload argument")
  }
  await linkRelatedPaths(JSON.parse(raw) as Parameters<typeof linkRelatedPaths>[0])
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
