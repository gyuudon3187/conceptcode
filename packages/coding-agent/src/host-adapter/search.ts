import { relative, resolve } from "node:path"

import type { CodingAgentToolInput, ToolContext, ToolDef, ToolResult } from "../types"
import { discoverRipgrep, type RipgrepBinary } from "./binaries"
import { displayWorkspacePath, normalizeWorkspacePath } from "./path-utils"

function globToRegExpSource(pattern: string): string {
  let source = ""
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    const next = pattern[index + 1]
    if (char === "*") {
      if (next === "*") {
        source += ".*"
        index += 1
      } else {
        source += "[^/]*"
      }
      continue
    }
    if (char === "?") {
      source += "."
      continue
    }
    if (char === "{") {
      const end = pattern.indexOf("}", index)
      if (end > index) {
        const parts = pattern.slice(index + 1, end).split(",").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        source += `(${parts.join("|")})`
        index = end
        continue
      }
    }
    source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }
  return `^${source}$`
}

function matchesGlob(pattern: string, value: string): boolean {
  return new RegExp(globToRegExpSource(pattern)).test(value)
}

async function walk(ctx: ToolContext, root: string, limit: number): Promise<string[]> {
  const pending = [root]
  const files: string[] = []
  while (pending.length > 0 && files.length < limit) {
    const current = pending.shift() as string
    const entries = await ctx.fs.readDir(current)
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const absolutePath = resolve(current, entry.name)
      if (entry.isDirectory) {
        pending.push(absolutePath)
      } else if (entry.isFile) {
        files.push(absolutePath)
        if (files.length >= limit) {
          break
        }
      }
    }
  }
  return files
}

function formatPathResults(prefix: string, results: string[], truncated: boolean): string {
  const lines = results.length > 0 ? results : ["No matches."]
  return `${prefix}\n${lines.join("\n")}${truncated ? "\n... results truncated ..." : ""}`
}

function numberedText(text: string): string[] {
  return text.split(/\r?\n/).map((line, index) => `${index + 1}: ${line}`)
}

async function nativeGlob(pattern: string, basePath: string, limit: number, ctx: ToolContext): Promise<ToolResult<Record<string, unknown>>> {
  const files = await walk(ctx, basePath, ctx.limits.searchResultsMax * 5)
  const relativeMatches = files.map((file) => relative(basePath, file)).filter((file) => matchesGlob(pattern, file))
  const results = relativeMatches.slice(0, limit).map((file) => file || ".")
  const truncated = relativeMatches.length > limit
  return {
    text: formatPathResults(`glob ${pattern}`, results, truncated),
    metadata: {
      path: displayWorkspacePath(ctx, basePath),
      backend: "native",
      results: results.length,
      truncated,
      nextOffset: truncated ? results.length + 1 : undefined,
    },
  }
}

async function rgGlob(pattern: string, basePath: string, limit: number, ctx: ToolContext, rg: RipgrepBinary): Promise<ToolResult<Record<string, unknown>>> {
  const proc = Bun.spawn([rg.path, "--files", basePath, "-g", pattern], { stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0 && stdout.trim() === "") {
    throw new Error(stderr.trim() || `ripgrep exited with ${exitCode}`)
  }
  const all = stdout.split(/\r?\n/).filter(Boolean).map((file) => relative(basePath, file))
  const results = all.slice(0, limit)
  const truncated = all.length > limit
  return {
    text: formatPathResults(`glob ${pattern}`, results, truncated),
    metadata: {
      path: displayWorkspacePath(ctx, basePath),
      backend: `ripgrep:${rg.source}`,
      results: results.length,
      truncated,
      nextOffset: truncated ? results.length + 1 : undefined,
    },
  }
}

async function nativeGrep(
  pattern: string,
  basePath: string,
  include: string | undefined,
  exclude: string | undefined,
  limit: number,
  caseSensitive: boolean,
  ctx: ToolContext,
): Promise<ToolResult<Record<string, unknown>>> {
  const flags = caseSensitive ? "g" : "gi"
  const regex = new RegExp(pattern, flags)
  const files = await walk(ctx, basePath, ctx.limits.searchResultsMax * 5)
  const hits: string[] = []
  for (const file of files) {
    const rel = relative(basePath, file)
    if (include && !matchesGlob(include, rel)) {
      continue
    }
    if (exclude && matchesGlob(exclude, rel)) {
      continue
    }
    const buffer = await ctx.fs.readFile(file)
    if (buffer.includes(0)) {
      continue
    }
    const text = Buffer.from(buffer).toString("utf8")
    for (const line of numberedText(text)) {
      const rawLine = line.replace(/^\d+:\s/, "")
      if (regex.test(rawLine)) {
        hits.push(`${rel}:${line}`)
        if (hits.length >= limit) {
          return {
            text: formatPathResults(`grep ${pattern}`, hits, true),
            metadata: { path: displayWorkspacePath(ctx, basePath), backend: "native", results: hits.length, truncated: true },
          }
        }
      }
    }
  }
  return {
    text: formatPathResults(`grep ${pattern}`, hits, false),
    metadata: { path: displayWorkspacePath(ctx, basePath), backend: "native", results: hits.length, truncated: false },
  }
}

async function rgGrep(
  pattern: string,
  basePath: string,
  include: string | undefined,
  exclude: string | undefined,
  limit: number,
  caseSensitive: boolean,
  ctx: ToolContext,
  rg: RipgrepBinary,
): Promise<ToolResult<Record<string, unknown>>> {
  const args = [rg.path, "--json", "-n", caseSensitive ? "--case-sensitive" : "--ignore-case", pattern, basePath]
  if (include) {
    args.push("-g", include)
  }
  if (exclude) {
    args.push("-g", `!${exclude}`)
  }
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode > 1) {
    throw new Error(stderr.trim() || `ripgrep exited with ${exitCode}`)
  }
  const hits: string[] = []
  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    const parsed = JSON.parse(line) as Record<string, unknown>
    if (parsed.type !== "match") {
      continue
    }
    const data = parsed.data as Record<string, unknown>
    const path = (data.path as { text?: string }).text ?? ""
    const lineNumber = Number(data.line_number ?? 0)
    const text = ((data.lines as { text?: string }).text ?? "").trimEnd()
    hits.push(`${relative(basePath, path)}:${lineNumber}: ${text}`)
    if (hits.length >= limit) {
      break
    }
  }
  const truncated = hits.length >= limit
  return {
    text: formatPathResults(`grep ${pattern}`, hits, truncated),
    metadata: { path: displayWorkspacePath(ctx, basePath), backend: `ripgrep:${rg.source}`, results: hits.length, truncated },
  }
}

export function createGlobTool(): ToolDef<CodingAgentToolInput> {
  return {
    id: "glob",
    description: "Match file paths with a structured glob query, using ripgrep when available",
    schema: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        path: { type: "string" },
        limit: { type: "number" },
      },
      required: ["pattern"],
    },
    async getPathIntents(input, ctx) {
      const path = await normalizeWorkspacePath(ctx, typeof input.path === "string" ? input.path : ".", "list")
      return [{ path, action: "list" }]
    },
    async execute(input, ctx) {
      const pattern = String(input.pattern ?? "").trim()
      if (!pattern) {
        throw new Error("Missing required field: pattern")
      }
      const basePath = await normalizeWorkspacePath(ctx, typeof input.path === "string" ? input.path : ".", "list")
      const limit = Math.min(
        typeof input.limit === "number" && Number.isFinite(input.limit) ? input.limit : ctx.limits.searchResultsDefault,
        ctx.limits.searchResultsMax,
      )
      const rg = await discoverRipgrep(ctx)
      return rg ? rgGlob(pattern, basePath, limit, ctx, rg) : nativeGlob(pattern, basePath, limit, ctx)
    },
  }
}

export function createGrepTool(): ToolDef<CodingAgentToolInput> {
  return {
    id: "grep",
    description: "Search file contents with structured parameters, using ripgrep when available",
    schema: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        path: { type: "string" },
        include: { type: "string" },
        exclude: { type: "string" },
        limit: { type: "number" },
        caseSensitive: { type: "boolean" },
      },
      required: ["pattern"],
    },
    async getPathIntents(input, ctx) {
      const path = await normalizeWorkspacePath(ctx, typeof input.path === "string" ? input.path : ".", "list")
      return [{ path, action: "list" }]
    },
    async execute(input, ctx) {
      const pattern = String(input.pattern ?? "").trim()
      if (!pattern) {
        throw new Error("Missing required field: pattern")
      }
      const basePath = await normalizeWorkspacePath(ctx, typeof input.path === "string" ? input.path : ".", "list")
      const include = typeof input.include === "string" ? input.include : undefined
      const exclude = typeof input.exclude === "string" ? input.exclude : undefined
      const limit = Math.min(
        typeof input.limit === "number" && Number.isFinite(input.limit) ? input.limit : ctx.limits.searchResultsDefault,
        ctx.limits.searchResultsMax,
      )
      const caseSensitive = input.caseSensitive === true
      const rg = await discoverRipgrep(ctx)
      return rg
        ? rgGrep(pattern, basePath, include, exclude, limit, caseSensitive, ctx, rg)
        : nativeGrep(pattern, basePath, include, exclude, limit, caseSensitive, ctx)
    },
  }
}
