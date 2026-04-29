import { basename, dirname, isAbsolute, normalize, relative, resolve, sep } from "node:path"

import type { ToolContext, ToolPathAction } from "../types"

function relativeInside(base: string, target: string): boolean {
  const rel = relative(base, target)
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
}

async function canonicalizeExisting(path: string, ctx: ToolContext): Promise<string> {
  if (await ctx.fs.exists(path)) {
    return ctx.fs.realPath(path)
  }
  return path
}

export async function normalizeWorkspacePath(ctx: ToolContext, inputPath: string, action: ToolPathAction): Promise<string> {
  const base = isAbsolute(inputPath) ? inputPath : resolve(ctx.cwd, inputPath)
  const normalized = normalize(base)
  const candidate = action === "write" || action === "delete"
    ? await (async () => {
      if (await ctx.fs.exists(normalized)) {
        return canonicalizeExisting(normalized, ctx)
      }
      const canonicalParent = await canonicalizeExisting(dirname(normalized), ctx)
      return resolve(canonicalParent, basename(normalized))
    })()
    : await canonicalizeExisting(normalized, ctx)
  const workspaceRoot = await canonicalizeExisting(ctx.workspaceRoot, ctx)
  if (!relativeInside(workspaceRoot, candidate)) {
    throw new Error(`Path is outside the workspace: ${inputPath}`)
  }
  return candidate
}

export function displayWorkspacePath(ctx: ToolContext, absolutePath: string): string {
  const rel = relative(ctx.workspaceRoot, absolutePath)
  return rel && rel !== "" ? rel : "."
}
