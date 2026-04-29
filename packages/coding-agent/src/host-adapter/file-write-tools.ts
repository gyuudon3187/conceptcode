import type { CodingAgentToolInput, ToolDef } from "../types"
import { displayWorkspacePath, normalizeWorkspacePath } from "./path-utils"
import { ensureParentDirectory, summarizeDiff, TEXT_DECODER } from "./file-tool-utils"
import { assertReadBeforeModify } from "./read-before-write"

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
      await assertReadBeforeModify(ctx, absolutePath)
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
      await assertReadBeforeModify(ctx, absolutePath)
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
