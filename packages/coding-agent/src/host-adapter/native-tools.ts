import { dirname, extname, resolve } from "node:path"

import type { CodingAgentToolInput, ToolContext, ToolDef, ToolResult } from "../types"
import { displayWorkspacePath, normalizeWorkspacePath } from "./path-utils"

const TEXT_DECODER = new TextDecoder("utf8", { fatal: false })

function clamp(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback
  }
  return Math.min(Math.floor(value), max)
}

function decodeText(buffer: Uint8Array): { text: string; binary: boolean } {
  if (buffer.includes(0)) {
    return { text: "", binary: true }
  }
  return { text: TEXT_DECODER.decode(buffer), binary: false }
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/)
}

function numberedLines(lines: string[], start: number): string {
  return lines.map((line, index) => `${start + index}: ${line}`).join("\n")
}

async function ensureParentDirectory(ctx: ToolContext, path: string): Promise<void> {
  const parent = dirname(path)
  if (!(await ctx.fs.exists(parent))) {
    await ctx.fs.mkdir(parent, { recursive: true })
  }
}

function summarizeDiff(oldText: string, newText: string): string {
  const oldLines = splitLines(oldText)
  const newLines = splitLines(newText)
  let start = 0
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
    start += 1
  }
  let oldEnd = oldLines.length - 1
  let newEnd = newLines.length - 1
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd -= 1
    newEnd -= 1
  }
  const removed = oldLines.slice(start, oldEnd + 1)
  const added = newLines.slice(start, newEnd + 1)
  return [
    `Changed around line ${start + 1}.`,
    removed.length > 0 ? `- ${removed.join("\\n- ")}` : "- <no removed lines>",
    added.length > 0 ? `+ ${added.join("\\n+ ")}` : "+ <no added lines>",
  ].join("\n")
}

type PatchOperation =
  | { type: "add"; path: string; lines: string[] }
  | { type: "delete"; path: string }
  | { type: "update"; path: string; moveTo?: string; hunks: Array<{ oldLines: string[]; newLines: string[] }> }

function parsePatch(patch: string): PatchOperation[] {
  const lines = patch.replace(/\r\n/g, "\n").split("\n")
  if (lines[0] !== "*** Begin Patch" || lines[lines.length - 1] !== "*** End Patch") {
    throw new Error("Patch must start with *** Begin Patch and end with *** End Patch")
  }
  const operations: PatchOperation[] = []
  let index = 1
  while (index < lines.length - 1) {
    const line = lines[index]
    if (line.startsWith("*** Add File: ")) {
      const path = line.slice("*** Add File: ".length)
      index += 1
      const content: string[] = []
      while (index < lines.length - 1 && !lines[index].startsWith("*** ")) {
        if (!lines[index].startsWith("+")) {
          throw new Error(`Add file lines must start with + for ${path}`)
        }
        content.push(lines[index].slice(1))
        index += 1
      }
      operations.push({ type: "add", path, lines: content })
      continue
    }
    if (line.startsWith("*** Delete File: ")) {
      operations.push({ type: "delete", path: line.slice("*** Delete File: ".length) })
      index += 1
      continue
    }
    if (line.startsWith("*** Update File: ")) {
      const path = line.slice("*** Update File: ".length)
      index += 1
      let moveTo: string | undefined
      if (lines[index]?.startsWith("*** Move to: ")) {
        moveTo = lines[index].slice("*** Move to: ".length)
        index += 1
      }
      const hunks: Array<{ oldLines: string[]; newLines: string[] }> = []
      while (index < lines.length - 1 && !lines[index].startsWith("*** ")) {
        if (lines[index] !== "@@") {
          throw new Error(`Expected @@ in update for ${path}`)
        }
        index += 1
        const oldLines: string[] = []
        const newLines: string[] = []
        while (index < lines.length - 1 && lines[index] !== "@@" && !lines[index].startsWith("*** ")) {
          const prefix = lines[index][0]
          const value = lines[index].slice(1)
          if (prefix === " ") {
            oldLines.push(value)
            newLines.push(value)
          } else if (prefix === "-") {
            oldLines.push(value)
          } else if (prefix === "+") {
            newLines.push(value)
          } else {
            throw new Error(`Unexpected patch line in ${path}: ${lines[index]}`)
          }
          index += 1
        }
        hunks.push({ oldLines, newLines })
      }
      operations.push({ type: "update", path, moveTo, hunks })
      continue
    }
    if (line === "") {
      index += 1
      continue
    }
    throw new Error(`Unknown patch directive: ${line}`)
  }
  return operations
}

async function applyUpdateOperation(ctx: ToolContext, operation: Extract<PatchOperation, { type: "update" }>): Promise<string> {
  const sourcePath = await normalizeWorkspacePath(ctx, operation.path, "write")
  const original = TEXT_DECODER.decode(await ctx.fs.readFile(sourcePath))
  let nextText = original
  for (const hunk of operation.hunks) {
    const before = hunk.oldLines.join("\n")
    const after = hunk.newLines.join("\n")
    const occurrences = nextText.split(before).length - 1
    if (occurrences === 0) {
      throw new Error(`Patch hunk not found in ${operation.path}`)
    }
    if (occurrences > 1) {
      throw new Error(`Patch hunk is ambiguous in ${operation.path}`)
    }
    nextText = nextText.replace(before, after)
  }
  await ctx.fs.writeFile(sourcePath, nextText)
  if (operation.moveTo) {
    const destinationPath = await normalizeWorkspacePath(ctx, operation.moveTo, "write")
    await ensureParentDirectory(ctx, destinationPath)
    await ctx.fs.rename(sourcePath, destinationPath)
    return `updated ${operation.path} -> ${operation.moveTo}`
  }
  return `updated ${operation.path}`
}

export function createReadFileTool(): ToolDef<CodingAgentToolInput> {
  return {
    id: "read_file",
    description: "Read a text file with line numbers, pagination, binary detection, and structured metadata",
    schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        offset: { type: "number" },
        limit: { type: "number" },
      },
      required: ["path"],
    },
    async getPathIntents(input, ctx) {
      const path = await normalizeWorkspacePath(ctx, String(input.path ?? ""), "read")
      return [{ path, action: "read" }]
    },
    async execute(input, ctx): Promise<ToolResult<Record<string, unknown>>> {
      const absolutePath = await normalizeWorkspacePath(ctx, String(input.path ?? ""), "read")
      const fileStat = await ctx.fs.stat(absolutePath)
      if (!fileStat.isFile) {
        throw new Error(`Path is not a file: ${input.path}`)
      }
      const buffer = await ctx.fs.readFile(absolutePath)
      const decoded = decodeText(buffer)
      if (decoded.binary) {
        return {
          text: `Binary file: ${displayWorkspacePath(ctx, absolutePath)}`,
          metadata: {
            path: displayWorkspacePath(ctx, absolutePath),
            bytesRead: buffer.byteLength,
            binary: true,
            truncated: false,
          },
        }
      }
      const lines = splitLines(decoded.text)
      const offset = clamp(typeof input.offset === "number" ? input.offset : undefined, 1, Number.MAX_SAFE_INTEGER)
      const limit = clamp(typeof input.limit === "number" ? input.limit : undefined, ctx.limits.fileLinesDefault, ctx.limits.fileLinesMax)
      const start = offset - 1
      const visible = lines.slice(start, start + limit)
      const truncated = start + limit < lines.length
      const lineEnd = start + visible.length
      return {
        text: numberedLines(visible, offset),
        metadata: {
          path: displayWorkspacePath(ctx, absolutePath),
          bytesRead: buffer.byteLength,
          lineStart: offset,
          lineEnd,
          nextOffset: truncated ? lineEnd + 1 : undefined,
          truncated,
          filesRead: 1,
        },
      }
    },
  }
}

export function createReadManyTool(): ToolDef<CodingAgentToolInput> {
  return {
    id: "read_many",
    description: "Read several files in one tool call using the same structured file reader",
    schema: {
      type: "object",
      properties: {
        paths: { type: "array", items: { type: "string" } },
      },
      required: ["paths"],
    },
    async getPathIntents(input, ctx) {
      const paths = Array.isArray(input.paths) ? input.paths : []
      return Promise.all(paths.map(async (path) => ({ path: await normalizeWorkspacePath(ctx, String(path), "read"), action: "read" as const })))
    },
    async execute(input, ctx) {
      const paths = Array.isArray(input.paths) ? input.paths.map((value) => String(value)) : []
      const sections: string[] = []
      let filesRead = 0
      for (const path of paths.slice(0, 20)) {
        const result = await createReadFileTool().execute({ path, limit: Math.min(80, ctx.limits.fileLinesDefault) }, ctx)
        sections.push(`# ${path}\n${result.text}`)
        filesRead += 1
      }
      return {
        text: sections.join("\n\n"),
        metadata: { filesRead, truncated: paths.length > 20 },
      }
    },
  }
}

export function createListDirTool(): ToolDef<CodingAgentToolInput> {
  return {
    id: "list_dir",
    description: "List directory entries natively with sorting, pagination, and structured metadata",
    schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        offset: { type: "number" },
        limit: { type: "number" },
      },
    },
    async getPathIntents(input, ctx) {
      const path = await normalizeWorkspacePath(ctx, typeof input.path === "string" ? input.path : ".", "list")
      return [{ path, action: "list" }]
    },
    async execute(input, ctx) {
      const absolutePath = await normalizeWorkspacePath(ctx, typeof input.path === "string" ? input.path : ".", "list")
      const stats = await ctx.fs.stat(absolutePath)
      if (!stats.isDirectory) {
        throw new Error(`Path is not a directory: ${input.path ?? "."}`)
      }
      const entries = await ctx.fs.readDir(absolutePath)
      entries.sort((left, right) => left.name.localeCompare(right.name))
      const offset = clamp(typeof input.offset === "number" ? input.offset : undefined, 1, Number.MAX_SAFE_INTEGER)
      const limit = clamp(typeof input.limit === "number" ? input.limit : undefined, ctx.limits.dirEntriesDefault, ctx.limits.dirEntriesMax)
      const start = offset - 1
      const visible = entries.slice(start, start + limit)
      const truncated = start + limit < entries.length
      const text = visible.map((entry) => `${entry.name}${entry.isDirectory ? "/" : ""}`).join("\n") || "<empty directory>"
      return {
        text,
        metadata: {
          path: displayWorkspacePath(ctx, absolutePath),
          filesRead: 1,
          lineStart: offset,
          lineEnd: start + visible.length,
          nextOffset: truncated ? start + visible.length + 1 : undefined,
          truncated,
        },
      }
    },
  }
}

export function createTreeTool(): ToolDef<CodingAgentToolInput> {
  return {
    id: "tree",
    description: "Show a shallow native directory tree without shelling out",
    schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        depth: { type: "number" },
        limit: { type: "number" },
      },
    },
    async getPathIntents(input, ctx) {
      const path = await normalizeWorkspacePath(ctx, typeof input.path === "string" ? input.path : ".", "list")
      return [{ path, action: "list" }]
    },
    async execute(input, ctx) {
      const root = await normalizeWorkspacePath(ctx, typeof input.path === "string" ? input.path : ".", "list")
      const maxDepth = clamp(typeof input.depth === "number" ? input.depth : 2, 2, 10)
      const maxEntries = clamp(typeof input.limit === "number" ? input.limit : ctx.limits.treeEntriesDefault, ctx.limits.treeEntriesDefault, ctx.limits.treeEntriesMax)
      const lines: string[] = []
      let truncated = false
      async function visit(path: string, depth: number, prefix: string): Promise<void> {
        if (depth > maxDepth || lines.length >= maxEntries) {
          truncated = truncated || depth > maxDepth || lines.length >= maxEntries
          return
        }
        const entries = await ctx.fs.readDir(path)
        entries.sort((left, right) => left.name.localeCompare(right.name))
        for (const entry of entries) {
          if (lines.length >= maxEntries) {
            truncated = true
            return
          }
          lines.push(`${prefix}${entry.name}${entry.isDirectory ? "/" : ""}`)
          if (entry.isDirectory) {
            await visit(resolve(path, entry.name), depth + 1, `${prefix}  `)
          }
        }
      }
      await visit(root, 1, "")
      return {
        text: lines.join("\n") || "<empty tree>",
        metadata: { path: displayWorkspacePath(ctx, root), truncated, filesRead: 1 },
      }
    },
  }
}

export function createStatTool(): ToolDef<CodingAgentToolInput> {
  return {
    id: "stat",
    description: "Return native file or directory metadata for a workspace path",
    schema: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
    },
    async getPathIntents(input, ctx) {
      const path = await normalizeWorkspacePath(ctx, String(input.path ?? ""), "stat")
      return [{ path, action: "stat" }]
    },
    async execute(input, ctx) {
      const absolutePath = await normalizeWorkspacePath(ctx, String(input.path ?? ""), "stat")
      const fileStat = await ctx.fs.stat(absolutePath)
      const metadata = {
        path: displayWorkspacePath(ctx, absolutePath),
        ...fileStat,
      }
      return { text: JSON.stringify(metadata, null, 2), metadata }
    },
  }
}

export function createWriteFileTool(): ToolDef<CodingAgentToolInput> {
  return {
    id: "write_file",
    description: "Write a file natively inside the workspace with structured metadata",
    schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
    async getPathIntents(input, ctx) {
      const path = await normalizeWorkspacePath(ctx, String(input.path ?? ""), "write")
      return [{ path, action: "write" }]
    },
    async execute(input, ctx) {
      const absolutePath = await normalizeWorkspacePath(ctx, String(input.path ?? ""), "write")
      const content = String(input.content ?? "")
      await ensureParentDirectory(ctx, absolutePath)
      await ctx.fs.writeFile(absolutePath, content)
      return {
        text: `Wrote ${displayWorkspacePath(ctx, absolutePath)}`,
        metadata: {
          path: displayWorkspacePath(ctx, absolutePath),
          filesWritten: 1,
          bytesWritten: Buffer.byteLength(content, "utf8"),
        },
      }
    },
  }
}

export function createEditFileTool(): ToolDef<CodingAgentToolInput> {
  return {
    id: "edit_file",
    description: "Replace exact text in a file with ambiguity checks and a concise reviewable diff summary",
    schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        old: { type: "string" },
        new: { type: "string" },
        replaceAll: { type: "boolean" },
      },
      required: ["path", "old", "new"],
    },
    async getPathIntents(input, ctx) {
      const path = await normalizeWorkspacePath(ctx, String(input.path ?? ""), "write")
      return [{ path, action: "write" }]
    },
    async execute(input, ctx) {
      const absolutePath = await normalizeWorkspacePath(ctx, String(input.path ?? ""), "write")
      if (!(await ctx.fs.exists(absolutePath))) {
        throw new Error(`File does not exist: ${input.path}`)
      }
      const oldText = String(input.old ?? "")
      const newText = String(input.new ?? "")
      const replaceAll = input.replaceAll === true
      const original = TEXT_DECODER.decode(await ctx.fs.readFile(absolutePath))
      const parts = original.split(oldText)
      const occurrences = oldText.length === 0 ? 0 : parts.length - 1
      if (occurrences === 0) {
        throw new Error(`Exact match not found in ${input.path}`)
      }
      if (occurrences > 1 && !replaceAll) {
        throw new Error(`Exact match is ambiguous in ${input.path}; found ${occurrences} occurrences`)
      }
      const nextText = replaceAll ? parts.join(newText) : original.replace(oldText, newText)
      await ctx.fs.writeFile(absolutePath, nextText)
      return {
        text: summarizeDiff(original, nextText),
        metadata: {
          path: displayWorkspacePath(ctx, absolutePath),
          filesWritten: 1,
          replacements: replaceAll ? occurrences : 1,
        },
      }
    },
  }
}

export function createApplyPatchTool(): ToolDef<CodingAgentToolInput> {
  return {
    id: "apply_patch",
    description: "Apply a structured multi-file patch with explicit add, update, move, and delete operations",
    schema: {
      type: "object",
      properties: {
        patch: { type: "string" },
      },
      required: ["patch"],
    },
    async execute(input, ctx) {
      const patch = String(input.patch ?? "")
      const operations = parsePatch(patch)
      const summaries: string[] = []
      let filesWritten = 0
      for (const operation of operations) {
        if (operation.type === "add") {
          const path = await normalizeWorkspacePath(ctx, operation.path, "write")
          if (await ctx.fs.exists(path)) {
            throw new Error(`File already exists: ${operation.path}`)
          }
          await ensureParentDirectory(ctx, path)
          const content = operation.lines.join("\n")
          await ctx.fs.writeFile(path, content)
          summaries.push(`added ${operation.path}`)
          filesWritten += 1
          continue
        }
        if (operation.type === "delete") {
          const path = await normalizeWorkspacePath(ctx, operation.path, "delete")
          await ctx.fs.remove(path)
          summaries.push(`deleted ${operation.path}`)
          filesWritten += 1
          continue
        }
        summaries.push(await applyUpdateOperation(ctx, operation))
        filesWritten += 1
      }
      return {
        text: summaries.join("\n"),
        metadata: { filesWritten, truncated: false },
      }
    },
  }
}

export function createNativeFileTools(): ToolDef[] {
  return [
    createReadFileTool(),
    createReadManyTool(),
    createListDirTool(),
    createTreeTool(),
    createStatTool(),
    createWriteFileTool(),
    createEditFileTool(),
    createApplyPatchTool(),
  ]
}
