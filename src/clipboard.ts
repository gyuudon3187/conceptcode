import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { encodingForModel } from "js-tiktoken"

import { asMetadataObject, bulletList } from "./model"
import type { AppState, ConceptNode, JsonValue } from "./types"

const CLIPBOARD_PREAMBLE = `${readFileSync(resolve(import.meta.dir, "../prompts/clipboard_preamble.md"), "utf8").trim()}\n`
const TOKEN_ENCODING = encodingForModel("gpt-4o")

function referencedPaths(text: string): string[] {
  const matches = [...text.matchAll(/@([a-zA-Z0-9_.-]+)/g)]
  return [...new Set(matches.map((match) => {
    const raw = match[1]
    if (raw === "root" || raw.startsWith("root.")) {
      return raw
    }
    return `root.${raw}`
  }))]
}

export function referencedConceptPaths(text: string, nodes: Map<string, ConceptNode>): string[] {
  return referencedPaths(text).filter((path) => nodes.has(path))
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

export type EffectivePromptTokenBreakdown = {
  staticTokenCount: number
  promptTextTokenCount: number
  referencedConceptTokenCount: number
  referencedFileTokenCount: number
  totalTokenCount: number
  referencedConcepts: Array<{ path: string; alias: string; tokenCount: number }>
  referencedFiles: Array<{ path: string; alias: string; tokenCount: number; kind: "file" | "directory" }>
}

export const EMPTY_PROMPT_TOKEN_BREAKDOWN: EffectivePromptTokenBreakdown = {
  staticTokenCount: 0,
  promptTextTokenCount: 0,
  referencedConceptTokenCount: 0,
  referencedFileTokenCount: 0,
  totalTokenCount: 0,
  referencedConcepts: [],
  referencedFiles: [],
}

function referencedFilePaths(text: string): string[] {
  return [...new Set([...text.matchAll(/&([^\s@&]+)/g)].map((match) => match[1]))]
}

function renderFileReferenceBlock(path: string, content: string): string {
  return ["## File", `- path: \`${path}\``, "```", content.trimEnd(), "```", ""].join("\n")
}

function renderDirectoryReferenceBlock(path: string): string {
  return ["## Directory", `- path: \`${path}\``, ""].join("\n")
}

async function referencedFileEntries(state: AppState): Promise<Array<{ path: string; kind: "file" | "directory"; block: string }>> {
  const paths = referencedFilePaths(state.promptText.trim())
    .filter((path) => state.projectFiles.includes(path) || state.projectDirectories.includes(path))
    .sort((left, right) => left.localeCompare(right))
  return Promise.all(paths.map(async (path) => {
    if (state.projectDirectories.includes(path)) {
      return { path, kind: "directory" as const, block: renderDirectoryReferenceBlock(path) }
    }
    const absolutePath = resolve(process.cwd(), path)
    const content = await readFile(absolutePath, "utf8").catch(() => "")
    return { path, kind: "file" as const, block: renderFileReferenceBlock(path, content) }
  }))
}

export function renderClipboardBlockWithContext(node: ConceptNode): string {
  return renderClipboardBlock(node)
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

export async function buildEffectivePrompt(state: AppState, _currentPath: string): Promise<string> {
  const promptText = state.promptText.trim()
  const conceptPaths = referencedConceptPaths(promptText, state.nodes)
  const fileEntries = await referencedFileEntries(state)
  const concepts = conceptPaths
    .map((path) => renderClipboardBlockWithContext(state.nodes.get(path)!))
    .join("\n")
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
  if (conceptPaths.length > 0) {
    sections.push("# Concepts", concepts.trimEnd())
  }
  if (fileEntries.length > 0) {
    sections.push("# Files", fileEntries.map((entry) => entry.block).join("\n").trimEnd())
  }
  if (hintLines.length > 0) {
    sections.push(["# Shared Interpretation Hints", ...hintLines].join("\n"))
  }
  return `${sections.join("\n\n")}\n`
}

export async function effectivePromptTokenBreakdown(state: AppState, _currentPath: string): Promise<EffectivePromptTokenBreakdown> {
  const promptText = state.promptText.trim()
  const conceptPaths = referencedConceptPaths(promptText, state.nodes)
  const fileEntries = await referencedFileEntries(state)
  const interpretationHint = normalizedInterpretationHint(state)
  const hintLines = flattenInterpretationHints(interpretationHint)
  const staticSections = [CLIPBOARD_PREAMBLE]
  const systemOverview = renderSystemOverviewBlock(state.nodes.get("root"))
  if (systemOverview) {
    staticSections.push(systemOverview.trimEnd())
  }
  if (hintLines.length > 0) {
    staticSections.push(["# Shared Interpretation Hints", ...hintLines].join("\n"))
  }
  const staticPrompt = `${staticSections.join("\n\n")}\n`
  const promptTextSection = promptText ? `${["# Main Instructions", promptText].join("\n\n")}\n` : ""
  const referencedConcepts = conceptPaths.map((path) => {
    const block = renderClipboardBlockWithContext(state.nodes.get(path)!)
    return { path, alias: `@${path}`, tokenCount: TOKEN_ENCODING.encode(block).length }
  })
  const referencedFiles = fileEntries.map((entry) => ({ path: entry.path, alias: `&${entry.path}`, tokenCount: TOKEN_ENCODING.encode(entry.block).length, kind: entry.kind }))
  const conceptsSection = conceptPaths.length > 0
    ? `${["# Concepts", conceptPaths.map((path) => renderClipboardBlockWithContext(state.nodes.get(path)!)).join("\n")].join("\n\n")}\n`
    : ""
  const filesSection = fileEntries.length > 0
    ? `${["# Files", fileEntries.map((entry) => entry.block).join("\n")].join("\n\n")}\n`
    : ""
  const staticTokenCount = TOKEN_ENCODING.encode(staticPrompt).length
  const promptTextTokenCount = TOKEN_ENCODING.encode(promptTextSection).length
  const referencedConceptTokenCount = TOKEN_ENCODING.encode(conceptsSection).length
  const referencedFileTokenCount = TOKEN_ENCODING.encode(filesSection).length
  return {
    staticTokenCount,
    promptTextTokenCount,
    referencedConceptTokenCount,
    referencedFileTokenCount,
    totalTokenCount: staticTokenCount + promptTextTokenCount + referencedConceptTokenCount + referencedFileTokenCount,
    referencedConcepts,
    referencedFiles,
  }
}

export async function countEffectivePromptTokens(state: AppState, currentPath: string): Promise<number> {
  return TOKEN_ENCODING.encode(await buildEffectivePrompt(state, currentPath)).length
}

export async function buildClipboardPayload(state: AppState, currentPath: string): Promise<string> {
  return buildEffectivePrompt(state, currentPath)
}

export function clipboardSelection(state: AppState, _currentPath: string): { paths: string[]; count: number } {
  const promptText = state.promptText.trim()
  const paths = [...referencedConceptPaths(promptText, state.nodes), ...referencedFilePaths(promptText).filter((path) => state.projectFiles.includes(path) || state.projectDirectories.includes(path))]
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
