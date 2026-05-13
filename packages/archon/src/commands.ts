import { basename, relative } from "node:path"

import type { ArchonCommand, ArchonCommandEntry, ArchonValidationFinding } from "./types"

function parseFrontmatter(text: string): { fields: Record<string, string>; body: string; malformedLines: string[]; hasFrontmatter: boolean } {
  const normalized = text.replace(/\r\n/g, "\n")
  if (!normalized.startsWith("---\n")) {
    return { fields: {}, body: normalized.trim(), malformedLines: [], hasFrontmatter: false }
  }
  const endIndex = normalized.indexOf("\n---\n", 4)
  if (endIndex === -1) {
    throw new Error("Command frontmatter is missing a closing --- line.")
  }
  const fields: Record<string, string> = {}
  const malformedLines: string[] = []
  for (const line of normalized.slice(4, endIndex).split("\n")) {
    if (!line.trim()) continue
    const separatorIndex = line.indexOf(":")
    if (separatorIndex === -1) {
      malformedLines.push(line.trim())
      continue
    }
    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()
    if (key) fields[key] = value.replace(/^['"]|['"]$/g, "")
  }
  return { fields, body: normalized.slice(endIndex + 5).trim(), malformedLines, hasFrontmatter: true }
}

export function parseCommandFile(workspaceRoot: string, path: string, text: string): ArchonCommandEntry {
  const relativePath = relative(workspaceRoot, path)
  try {
    const { fields, body, malformedLines, hasFrontmatter } = parseFrontmatter(text)
    const unsupportedKeys = Object.keys(fields).filter((key) => key !== "description" && key !== "argument-hint").sort((left, right) => left.localeCompare(right))
    const command: ArchonCommand = {
      path,
      relativePath,
      name: basename(path, ".md"),
      description: fields.description ?? null,
      argumentHint: fields["argument-hint"] ?? null,
      body,
    }
    const findings: ArchonValidationFinding[] = []
    if (!hasFrontmatter) {
      findings.push({ severity: "warning", message: "Command file is missing frontmatter." })
    }
    if (malformedLines.length > 0) {
      findings.push({ severity: "warning", message: `Malformed frontmatter lines: ${malformedLines.join(", ")}` })
    }
    if (body.trim().length === 0) {
      findings.push({ severity: "warning", message: "Command body is empty." })
    }
    if (!command.description) {
      findings.push({ severity: "warning", message: "Command description is missing." })
    }
    if (unsupportedKeys.length > 0) {
      findings.push({ severity: "warning", message: `Unsupported frontmatter fields: ${unsupportedKeys.join(", ")}` })
    }
    return {
      path,
      relativePath,
      command,
      findings,
      parseError: null,
      referencedByWorkflowPaths: [],
    }
  } catch (error) {
    return {
      path,
      relativePath,
      command: null,
      findings: [],
      parseError: error instanceof Error ? error.message : String(error),
      referencedByWorkflowPaths: [],
    }
  }
}

export function serializeCommandFile(command: ArchonCommand): string {
  const lines = ["---"]
  if (command.description) lines.push(`description: ${JSON.stringify(command.description)}`)
  if (command.argumentHint) lines.push(`argument-hint: ${JSON.stringify(command.argumentHint)}`)
  lines.push("---", "")
  return `${lines.join("\n")}${command.body}${command.body.endsWith("\n") ? "" : "\n"}`
}
