import { resolve } from "node:path"

import type { CodingAgentToolInput, ToolDef, ToolResult } from "../types"
import { displayWorkspacePath, normalizeWorkspacePath } from "./path-utils"
import { clamp, decodeText, numberedLines, splitLines } from "./file-tool-utils"
import { markFileRead } from "./read-before-write"

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
      markFileRead(ctx, absolutePath)
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
  const readFileTool = createReadFileTool()
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
        const result = await readFileTool.execute({ path, limit: Math.min(80, ctx.limits.fileLinesDefault) }, ctx)
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
