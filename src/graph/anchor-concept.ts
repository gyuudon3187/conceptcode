import type { JsonValue } from "../core/types"
import { conceptAtPath, readGraph, writeGraph, type JsonObject } from "./mutate"

type SourceLocation = {
  file: string
  start_line: number
  end_line: number
}

export type AnchorConceptInput = {
  graphPath: string
  conceptPath: string
  loc: SourceLocation
  explorationCoverage: number
  summary?: string
  summaryConfidence?: number
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function validateScore(field: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be a number from 0 to 1`)
  }
}

function validateLoc(loc: SourceLocation): void {
  if (!loc.file.trim()) {
    throw new Error("loc.file must be a non-empty string")
  }
  if (!Number.isInteger(loc.start_line) || loc.start_line < 1) {
    throw new Error("loc.start_line must be an integer >= 1")
  }
  if (!Number.isInteger(loc.end_line) || loc.end_line < loc.start_line) {
    throw new Error("loc.end_line must be an integer >= loc.start_line")
  }
}

export async function anchorConcept(input: AnchorConceptInput): Promise<void> {
  if (!input.conceptPath.startsWith("impl")) {
    throw new Error(`Anchors are only supported for impl concepts: ${input.conceptPath}`)
  }

  validateLoc(input.loc)
  validateScore("explorationCoverage", input.explorationCoverage)
  if (input.summaryConfidence != null) {
    validateScore("summaryConfidence", input.summaryConfidence)
  }

  const graph = await readGraph(input.graphPath)
  const concept = conceptAtPath(graph, input.conceptPath)
  if (!concept) {
    throw new Error(`Concept does not exist: ${input.conceptPath}`)
  }
  if (!isObject(concept)) {
    throw new Error(`Concept is not an object: ${input.conceptPath}`)
  }

  concept.loc = input.loc as unknown as JsonValue
  concept.exploration_coverage = input.explorationCoverage
  if (input.summary?.trim()) {
    concept.summary = input.summary.trim()
  }
  if (input.summaryConfidence != null) {
    concept.summary_confidence = input.summaryConfidence
  }

  await writeGraph(input.graphPath, graph)
}

async function main(): Promise<void> {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Expected a JSON payload argument")
  }
  await anchorConcept(JSON.parse(raw) as AnchorConceptInput)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
