import type { CodingAgentToolInput, ToolDef, ToolPathIntent } from "../types"
import { ensureParentDirectory, TEXT_DECODER } from "./file-tool-utils"
import { normalizeWorkspacePath } from "./path-utils"
import { assertReadBeforeModify } from "./read-before-write"

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

async function patchPathIntents(input: CodingAgentToolInput, ctx: Parameters<NonNullable<ToolDef["getPathIntents"]>>[1]): Promise<ToolPathIntent[]> {
  const patch = String(input.patch ?? "")
  const operations = parsePatch(patch)
  const intents: ToolPathIntent[] = []
  for (const operation of operations) {
    if (operation.type === "add") {
      intents.push({ path: await normalizeWorkspacePath(ctx, operation.path, "write"), action: "write" })
      continue
    }
    if (operation.type === "delete") {
      intents.push({ path: await normalizeWorkspacePath(ctx, operation.path, "delete"), action: "delete" })
      continue
    }
    intents.push({ path: await normalizeWorkspacePath(ctx, operation.path, "write"), action: "write" })
    if (operation.moveTo) {
      intents.push({ path: await normalizeWorkspacePath(ctx, operation.moveTo, "write"), action: "write" })
    }
  }
  return intents
}

async function applyUpdateOperation(ctx: Parameters<ToolDef["execute"]>[1], operation: Extract<PatchOperation, { type: "update" }>): Promise<string> {
  const sourcePath = await normalizeWorkspacePath(ctx, operation.path, "write")
  await assertReadBeforeModify(ctx, sourcePath)
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
    await assertReadBeforeModify(ctx, destinationPath)
    await ensureParentDirectory(ctx, destinationPath)
    await ctx.fs.rename(sourcePath, destinationPath)
    return `updated ${operation.path} -> ${operation.moveTo}`
  }
  return `updated ${operation.path}`
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
    getPathIntents: patchPathIntents,
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
          await ctx.fs.writeFile(path, operation.lines.join("\n"))
          summaries.push(`added ${operation.path}`)
          filesWritten += 1
          continue
        }
        if (operation.type === "delete") {
          const path = await normalizeWorkspacePath(ctx, operation.path, "delete")
          await assertReadBeforeModify(ctx, path)
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
