import { spawn } from "node:child_process"

import { asMetadataObject, bulletList } from "./model"
import type { AppState, BufferedConcept, ConceptAction, ConceptNode, JsonValue } from "./types"

function noteLabel(action: ConceptAction | undefined): string {
  return action === "delete" ? "instructions" : "context"
}

function withConceptNote(lines: string[], note: string | undefined, action: ConceptAction | undefined): string[] {
  if (!note?.trim()) {
    return lines
  }
  return [...lines, `- ${noteLabel(action)}:`, ...note.trim().split("\n").map((line) => `  ${line}`)]
}

function actionInstruction(action: ConceptAction): string {
  if (action === "delete") {
    return "Remove the code, behavior, UI, state, and references that correspond to this concept. Preserve surrounding code by updating call sites, imports, transitions, and related logic as needed."
  }
  return ""
}

export function renderClipboardBlock(node: ConceptNode, compact: boolean, action: ConceptAction | undefined): string {
  const lines = ["## Concept", `- path: \`${node.path}\``, `- title: ${node.title}`, `- kind: ${node.kind}`]
  if (node.isDraft) {
    lines.push("- action: create")
  } else if (action) {
    lines.push(`- action: ${action}`)
  }
  if (node.summary) {
    lines.push(`- summary: ${node.summary}`)
  }
  const codeRefs = bulletList(node.metadata.code_refs)
  if (codeRefs.length > 0) {
    if (compact) {
      lines.push(`- code_ref: ${codeRefs[0]}`)
    } else {
      lines.push("- code_refs:", ...codeRefs.map((item) => `  - ${item}`))
    }
  }
  if (compact) {
    return `${lines.join("\n")}\n`
  }
  lines.push(`- parent_path: ${node.parentPath ?? "-"}`)
  for (const [label, values] of [
    ["related_paths", bulletList(node.metadata.related_paths)],
    ["aliases", bulletList(node.metadata.aliases)],
  ] as const) {
    if (values.length > 0) {
      lines.push(`- ${label}:`, ...values.map((item) => `  - ${item}`))
    }
  }
  for (const key of ["state_predicate", "why_it_exists"] as const) {
    const value = node.metadata[key]
    if (typeof value === "string" && value) {
      lines.push(`- ${key}: ${value}`)
    }
  }
  if (node.childPaths.length > 0) {
    lines.push("- child_paths:", ...node.childPaths.map((item) => `  - ${item}`))
  }
  if (node.isDraft) {
    lines.push("- draft_status: newly created in the TUI and not yet present in the source concept graph")
  }
  return `${lines.join("\n")}\n`
}

export function renderClipboardBlockWithContext(node: ConceptNode, compact: boolean, note: string | undefined, action: ConceptAction | undefined): string {
  const effectiveAction = node.isDraft ? undefined : action
  const base = renderClipboardBlock(node, compact, effectiveAction).trimEnd().split("\n")
  return `${withConceptNote(base, note, node.isDraft ? undefined : effectiveAction).join("\n")}\n`
}

function renderActionMetadata(nodes: ConceptNode[], bufferedConcepts: BufferedConcept[]): string[] {
  const actions = new Set<ConceptAction | "create">()
  for (const node of nodes) {
    if (node.isDraft) {
      actions.add("create")
    }
  }
  for (const item of bufferedConcepts) {
    if (item.action) {
      actions.add(item.action)
    }
  }
  if (actions.size === 0) {
    return []
  }
  const lines = ["# Actions"]
  for (const action of [...actions]) {
    if (action === "create") {
      lines.push("- create: Add code, behavior, UI, state, and references needed to implement this newly drafted concept and integrate it into the surrounding system.")
    } else {
      lines.push(`- ${action}: ${actionInstruction(action)}`)
    }
  }
  lines.push("")
  return lines
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

export function buildClipboardPayload(state: AppState, compact: boolean, currentPath: string): string {
  const bufferedConcepts = state.bufferedConcepts.length > 0 ? state.bufferedConcepts : [{ path: currentPath }]
  const selectedNodes = bufferedConcepts.map((item) => state.nodes.get(item.path)!).filter(Boolean)
  const concepts = bufferedConcepts
    .map((item) => renderClipboardBlockWithContext(state.nodes.get(item.path)!, compact, state.conceptNotes[item.path], item.action))
    .join("\n")
  const promptText = state.promptText.trim()
  if (compact) {
    return [promptText, concepts.trimEnd()].filter(Boolean).join("\n\n") + "\n"
  }
  const interpretationHint = asMetadataObject(state.graphPayload.interpretation_hint)
  const hintLines = flattenInterpretationHints(interpretationHint)
  const conceptsHeader = promptText || "# Concepts"
  const actionLines = renderActionMetadata(selectedNodes, bufferedConcepts)
  if (hintLines.length === 0) {
    return [conceptsHeader, "", concepts.trimEnd(), "", ...actionLines].join("\n")
  }
  return [conceptsHeader, "", concepts.trimEnd(), "", ...actionLines, "# Shared Interpretation Hints", ...hintLines, ""].join("\n")
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
