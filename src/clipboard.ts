import { spawn } from "node:child_process"

import { asMetadataObject, bulletList } from "./model"
import type { AppState, ConceptNode, JsonValue } from "./types"

export function renderClipboardBlock(node: ConceptNode, compact: boolean): string {
  const lines = ["## Concept", `- path: \`${node.path}\``, `- title: ${node.title}`, `- kind: ${node.kind}`]
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
  return `${lines.join("\n")}\n`
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
  const paths = state.bufferedPaths.length > 0 ? state.bufferedPaths : [currentPath]
  const concepts = paths.map((path) => renderClipboardBlock(state.nodes.get(path)!, compact)).join("\n")
  if (compact) {
    return concepts
  }
  const interpretationHint = asMetadataObject(state.graphPayload.interpretation_hint)
  const hintLines = flattenInterpretationHints(interpretationHint)
  if (hintLines.length === 0) {
    return concepts
  }
  return [`# Concepts`, "", concepts.trimEnd(), "", "# Shared Interpretation Hints", ...hintLines, ""].join("\n")
}

export function clipboardSelection(state: AppState, currentPath: string): { paths: string[]; count: number } {
  const paths = state.bufferedPaths.length > 0 ? [...state.bufferedPaths] : [currentPath]
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
