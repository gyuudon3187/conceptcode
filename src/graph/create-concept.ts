import type { JsonValue } from "../core/types"
import { conceptAtPath, conceptParentAtPath, ensureChildren, readGraph, writeGraph, type JsonObject } from "./mutate"

type CreateConceptInput = {
  graphPath: string
  conceptPath: string
  fields: Record<string, JsonValue>
}

function slugSegment(segment: string): string {
  const normalized = segment.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
  if (!normalized) {
    throw new Error("Concept key must contain at least one alphanumeric character")
  }
  return normalized
}

function validateNewConceptPath(graph: JsonObject, conceptPath: string): { parentPath: string; childKey: string } {
  if (conceptAtPath(graph, conceptPath)) {
    throw new Error(`Concept already exists: ${conceptPath}`)
  }
  const { parent } = conceptParentAtPath(graph, conceptPath)
  const childKey = conceptPath.split(".").at(-1)!
  if (slugSegment(childKey) !== childKey) {
    throw new Error(`Rightmost path segment must already be a stable child key: ${childKey}`)
  }
  if (!parent) {
    throw new Error(`Parent concept does not exist for ${conceptPath}`)
  }
  return { parentPath: conceptPath.split(".").slice(0, -1).join("."), childKey }
}

function normalizeFields(fields: Record<string, JsonValue>): JsonObject {
  const summary = fields.summary
  if (typeof summary !== "string" || !summary.trim()) {
    throw new Error("New concepts must include a non-empty summary field")
  }
  const title = typeof fields.title === "string" && fields.title.trim() ? fields.title.trim() : String(fields.title ?? "")
  const concept: JsonObject = {
    title: title || summary,
    summary: summary.trim(),
    children: {},
    not_yet_implemented: false,
  }
  for (const [key, value] of Object.entries(fields)) {
    if (key === "children") continue
    concept[key] = value
  }
  if (typeof concept.title !== "string" || !String(concept.title).trim()) {
    concept.title = conceptPathTitleFallback(summary)
  }
  concept.not_yet_implemented = false
  return concept
}

function validateNamespaceSpecificFields(conceptPath: string, fields: Record<string, JsonValue>): void {
  const namespace = conceptPath.split(".")[0]
  if (namespace !== "domain") return
  for (const forbiddenKey of ["loc", "exploration_coverage", "summary_confidence"]) {
    if (forbiddenKey in fields) {
      throw new Error(`Domain concepts cannot include ${forbiddenKey}`)
    }
  }
}

function conceptPathTitleFallback(summary: string): string {
  return summary.split(/[.!?\n]/)[0]?.trim() || "New Concept"
}

export async function createConcept(input: CreateConceptInput): Promise<void> {
  const graph = await readGraph(input.graphPath)
  const { childKey } = validateNewConceptPath(graph, input.conceptPath)
  validateNamespaceSpecificFields(input.conceptPath, input.fields)
  const { parent } = conceptParentAtPath(graph, input.conceptPath)
  const children = ensureChildren(parent)
  children[childKey] = normalizeFields(input.fields)
  await writeGraph(input.graphPath, graph)
}

async function main(): Promise<void> {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Expected a JSON payload argument")
  }
  await createConcept(JSON.parse(raw) as CreateConceptInput)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
