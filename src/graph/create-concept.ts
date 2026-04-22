import type { JsonValue } from "../core/types"
import { conceptAtPath, conceptParentAtPath, ensureChildren, readGraph, stableChildKey, writeGraph, type JsonObject } from "./mutate"

export type CreateConceptInput = {
  graphPath: string
  conceptPath: string
  fields: Record<string, JsonValue>
}

function validateNewConceptPath(graph: JsonObject, conceptPath: string): { parentPath: string; childKey: string } {
  if (conceptAtPath(graph, conceptPath)) {
    throw new Error(`Concept already exists: ${conceptPath}`)
  }
  const { parent } = conceptParentAtPath(graph, conceptPath)
  const childKey = conceptPath.split(".").at(-1)!
  if (stableChildKey(childKey) !== childKey) {
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
  if ("children" in fields) {
    throw new Error("New concepts cannot include inline children")
  }
  const title = typeof fields.title === "string" && fields.title.trim() ? fields.title.trim() : String(fields.title ?? "")
  const concept: JsonObject = {
    title: title || summary,
    summary: summary.trim(),
    children: {},
  }
  for (const [key, value] of Object.entries(fields)) {
    concept[key] = value
  }
  if (typeof concept.title !== "string" || !String(concept.title).trim()) {
    concept.title = conceptPathTitleFallback(summary)
  }
  return concept
}

function validateNamespaceSpecificFields(conceptPath: string, fields: Record<string, JsonValue>): void {
  const namespace = conceptPath.split(".")[0]
  if (namespace === "domain") {
    for (const forbiddenKey of ["implemented", "loc", "exploration_coverage", "summary_confidence"]) {
      if (forbiddenKey in fields) {
        throw new Error(`Domain concepts cannot include ${forbiddenKey}`)
      }
    }
    return
  }
  if (namespace === "root" && !("implemented" in fields)) {
    fields.implemented = false
  }
}

function validateImplementedField(conceptPath: string, fields: Record<string, JsonValue>): void {
  const namespace = conceptPath.split(".")[0]
  if (!("implemented" in fields)) return
  if (namespace !== "root") {
    throw new Error("implemented is allowed only on root concepts")
  }
  if (typeof fields.implemented !== "boolean") {
    throw new Error("implemented must be a boolean when provided")
  }
}

function validateRequiredPathSegments(conceptPath: string): void {
  const parts = conceptPath.split(".").filter(Boolean)
  if (parts.length < 2) {
    throw new Error("New concepts must be created under an existing parent concept")
  }
  for (const segment of parts) {
    if (!segment.trim()) {
      throw new Error(`Concept path contains an empty segment: ${conceptPath}`)
    }
  }
}

function validateFields(conceptPath: string, fields: Record<string, JsonValue>): void {
  validateRequiredPathSegments(conceptPath)
  validateNamespaceSpecificFields(conceptPath, fields)
  validateImplementedField(conceptPath, fields)
}

function conceptPathTitleFallback(summary: string): string {
  return summary.split(/[.!?\n]/)[0]?.trim() || "New Concept"
}

export async function createConcept(input: CreateConceptInput): Promise<void> {
  const graph = await readGraph(input.graphPath)
  const { childKey } = validateNewConceptPath(graph, input.conceptPath)
  validateFields(input.conceptPath, input.fields)
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
