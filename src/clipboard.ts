import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { asMetadataObject, bulletList } from "./model"
import type { AppState, ConceptNode, JsonValue } from "./types"

const CLIPBOARD_PREAMBLE = `${readFileSync(resolve(import.meta.dir, "../prompts/clipboard_preamble.md"), "utf8").trim()}\n`

function expandAliases(text: string, aliasPaths: Record<string, string>): string {
  return text.replace(/(^|\s)(@[a-zA-Z0-9_.-]+)/g, (match, prefix: string, alias: string) => {
    const resolved = aliasPaths[alias]
    return resolved ? `${prefix}${resolved}` : match
  })
}

function withConceptNote(lines: string[], note: string | undefined): string[] {
  if (!note?.trim()) {
    return lines
  }
  return [...lines, "- note:", ...note.trim().split("\n").map((line) => `  ${line}`)]
}

function pushListSection(lines: string[], label: string, values: string[]): void {
  if (values.length === 0) {
    return
  }
  lines.push(`- ${label}:`, ...values.map((item) => `  - ${item}`))
}

function renderLoc(loc: ConceptNode["loc"]): string[] {
  if (!loc) {
    return []
  }
  return ["- loc:", `  - file: ${loc.file}`, `  - start_line: ${loc.startLine}`, `  - end_line: ${loc.endLine}`]
}

function renderClipboardBlock(node: ConceptNode): string {
  const lines = ["## Concept", `- path: \`${node.path}\``, `- title: ${node.title}`]
  lines.push(node.kind ? `- kind: ${node.kind}` : "- kind: (no kind)")
  if (node.summary) {
    lines.push(`- summary: ${node.summary}`)
  }
  lines.push(`- parent_path: ${node.parentPath ?? "-"}`)
  pushListSection(lines, "related_paths", bulletList(node.metadata.related_paths))
  pushListSection(lines, "aliases", bulletList(node.metadata.aliases))
  for (const key of ["state_predicate", "why_it_exists"] as const) {
    const value = node.metadata[key]
    if (typeof value === "string" && value) {
      lines.push(`- ${key}: ${value}`)
    }
  }
  lines.push(...renderLoc(node.loc))
  pushListSection(lines, "child_paths", node.childPaths)
  if (node.isDraft) {
    lines.push("- draft_status: created in the TUI and not yet present in the source concept graph")
  }
  return `${lines.join("\n")}\n`
}

function renderSystemOverviewBlock(rootNode: ConceptNode | undefined): string | null {
  if (!rootNode) {
    return null
  }
  const lines = ["# System Overview", `- title: ${rootNode.title}`]
  if (rootNode.kind) {
    lines.push(`- kind: ${rootNode.kind}`)
  }
  if (rootNode.summary) {
    lines.push(`- summary: ${rootNode.summary}`)
  }
  return lines.length > 1 ? `${lines.join("\n")}\n` : null
}

export function renderClipboardBlockWithContext(node: ConceptNode, note: string | undefined): string {
  const base = renderClipboardBlock(node).trimEnd().split("\n")
  return `${withConceptNote(base, note).join("\n")}\n`
}

function flattenInterpretationHints(value: JsonValue, prefix = ""): string[] {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [`- ${prefix}: ${String(value)}`]
  }
  if (Array.isArray(value)) {
    const serialized = value.map((item) => (typeof item === "string" || typeof item === "number" || typeof item === "boolean" ? String(item) : JSON.stringify(item))).join(", ")
    return serialized ? [`- ${prefix}: ${serialized}`] : []
  }
  if (value && typeof value === "object") {
    const lines: string[] = []
    for (const [key, nested] of Object.entries(value)) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key
      lines.push(...flattenInterpretationHints(nested, nextPrefix))
    }
    return lines
  }
  return []
}

function kindDefinitionsHint(state: AppState): Record<string, JsonValue> {
  return Object.fromEntries(
    state.kindDefinitions
      .filter((definition) => definition.description.trim())
      .map((definition) => [definition.kind, definition.description]),
  )
}

function normalizedInterpretationHint(state: AppState): Record<string, JsonValue> {
  const interpretationHint = asMetadataObject(state.graphPayload.interpretation_hint)
  const nextHint: Record<string, JsonValue> = Object.fromEntries(
    Object.entries(interpretationHint).filter(([key]) => key !== "kind_definitions"),
  )
  const kinds = kindDefinitionsHint(state)
  if (Object.keys(kinds).length > 0) {
    nextHint.kind_definitions = kinds
  }
  return nextHint
}

export function buildClipboardPayload(state: AppState, currentPath: string): string {
  const bufferedConcepts = state.bufferedConcepts.length > 0 ? state.bufferedConcepts : [{ path: currentPath }]
  const concepts = bufferedConcepts
    .map((item) => {
      const node = state.nodes.get(item.path)!
      return renderClipboardBlockWithContext(node, expandAliases(state.conceptNotes[item.path] ?? "", state.aliasPaths))
    })
    .join("\n")
  const promptText = expandAliases(state.promptText.trim(), state.aliasPaths)
  const interpretationHint = normalizedInterpretationHint(state)
  const hintLines = flattenInterpretationHints(interpretationHint)
  const sections = [CLIPBOARD_PREAMBLE]
  const systemOverview = renderSystemOverviewBlock(state.nodes.get("root"))
  if (systemOverview) {
    sections.push(systemOverview.trimEnd())
  }
  if (promptText) {
    sections.push(["# Main Instructions", promptText].join("\n\n"))
  }
  sections.push("# Concepts", concepts.trimEnd())
  if (hintLines.length > 0) {
    sections.push(["# Shared Interpretation Hints", ...hintLines].join("\n"))
  }
  return `${sections.join("\n\n")}\n`
}

export function clipboardSelection(state: AppState, currentPath: string): { paths: string[]; count: number } {
  const paths = state.bufferedConcepts.length > 0 ? state.bufferedConcepts.map((item) => item.path) : [currentPath]
  return { paths, count: paths.length }
}

export function copyToClipboard(text: string): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn("wl-copy", ["--foreground"], { stdio: ["pipe", "ignore", "pipe"] })
    let stderr = ""
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk)
    })
    child.on("error", () => {
      resolvePromise({ ok: false, message: "wl-copy not found on PATH" })
    })
    child.on("close", (code) => {
      if (code === 0 || code === null) {
        resolvePromise({ ok: true, message: "Copied to clipboard" })
      } else {
        resolvePromise({ ok: false, message: `wl-copy failed: ${stderr.trim() || `exit code ${code}`}` })
      }
    })
    child.stdin.end(text)
  })
}
