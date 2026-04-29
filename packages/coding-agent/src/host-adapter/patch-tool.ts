import type { CodingAgentToolInput, ToolDef, ToolPathIntent } from "../types"
import { ensureParentDirectory, summarizeDiff, TEXT_DECODER } from "./file-tool-utils"
import { sha256 } from "./hash-file-content"
import { normalizeWorkspacePath } from "./path-utils"
import {
  assertReadBeforeModify,
  WRITE_CHANGED_SINCE_READ_ERROR,
  WRITE_TARGET_ALREADY_EXISTS_ERROR,
} from "./read-before-write"

type PatchOperation =
  | { type: "add"; path: string; lines: string[] }
  | { type: "delete"; path: string }
  | { type: "update"; path: string; moveTo?: string; hunks: Array<{ oldLines: string[]; newLines: string[] }> }

type PreparedFile = {
  absolutePath: string
  displayPath: string
  exists: boolean
  originalText: string | null
  originalSha256: string | null
}

type PlannedChange =
  | { type: "add"; absolutePath: string; displayPath: string; content: string }
  | { type: "delete"; absolutePath: string; displayPath: string }
  | {
      type: "update"
      absolutePath: string
      displayPath: string
      originalText: string
      originalSha256: string
      nextText: string
      moveToPath?: string
      moveToDisplayPath?: string
    }

function parseStructuredPatch(patch: string): PatchOperation[] {
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

function stripGitPrefix(path: string, expectedPrefix: "a/" | "b/"): string {
  if (path === "/dev/null") {
    return path
  }
  if (!path.startsWith(expectedPrefix)) {
    throw new Error(`Unsupported unified diff path: ${path}`)
  }
  return path.slice(expectedPrefix.length)
}

function parseUnifiedDiff(patch: string): PatchOperation[] {
  const lines = patch.replace(/\r\n/g, "\n").split("\n")
  const operations: PatchOperation[] = []
  let index = 0

  while (index < lines.length) {
    if (lines[index] === "") {
      index += 1
      continue
    }
    const diffLine = lines[index]
    if (!diffLine.startsWith("diff --git ")) {
      throw new Error(`Unsupported unified diff feature: ${diffLine}`)
    }
    const diffMatch = /^diff --git a\/(.+) b\/(.+)$/.exec(diffLine)
    if (!diffMatch) {
      throw new Error(`Unsupported unified diff header: ${diffLine}`)
    }
    index += 1

    let renameFrom: string | undefined
    let renameTo: string | undefined
    let oldPath: string | undefined
    let newPath: string | undefined
    const hunks: Array<{ oldLines: string[]; newLines: string[] }> = []

    while (index < lines.length && !lines[index].startsWith("diff --git ")) {
      const line = lines[index]
      if (line.startsWith("index ")) {
        index += 1
        continue
      }
      if (line.startsWith("new file mode ") || line.startsWith("deleted file mode ")) {
        index += 1
        continue
      }
      if (line.startsWith("rename from ")) {
        renameFrom = line.slice("rename from ".length)
        index += 1
        continue
      }
      if (line.startsWith("rename to ")) {
        renameTo = line.slice("rename to ".length)
        index += 1
        continue
      }
      if (line.startsWith("--- ")) {
        oldPath = stripGitPrefix(line.slice(4), "a/")
        index += 1
        continue
      }
      if (line.startsWith("+++ ")) {
        newPath = stripGitPrefix(line.slice(4), "b/")
        index += 1
        continue
      }
      if (line.startsWith("@@ ")) {
        index += 1
        const oldLines: string[] = []
        const newLines: string[] = []
        while (index < lines.length && !lines[index].startsWith("diff --git ") && !lines[index].startsWith("@@ ")) {
          const hunkLine = lines[index]
          if (hunkLine === "\\ No newline at end of file") {
            throw new Error("Unsupported unified diff feature: missing final newline markers")
          }
          const prefix = hunkLine[0]
          const value = hunkLine.slice(1)
          if (prefix === " ") {
            oldLines.push(value)
            newLines.push(value)
          } else if (prefix === "-") {
            oldLines.push(value)
          } else if (prefix === "+") {
            newLines.push(value)
          } else {
            throw new Error(`Unsupported unified diff feature: ${hunkLine}`)
          }
          index += 1
        }
        hunks.push({ oldLines, newLines })
        continue
      }
      if (line === "") {
        index += 1
        continue
      }
      throw new Error(`Unsupported unified diff feature: ${line}`)
    }

    const normalizedOldPath = oldPath ?? diffMatch[1]
    const normalizedNewPath = newPath ?? diffMatch[2]
    if (normalizedOldPath === "/dev/null") {
      operations.push({ type: "add", path: normalizedNewPath, lines: hunks.flatMap((hunk) => hunk.newLines) })
      continue
    }
    if (normalizedNewPath === "/dev/null") {
      operations.push({ type: "delete", path: normalizedOldPath })
      continue
    }
    operations.push({
      type: "update",
      path: renameFrom ?? normalizedOldPath,
      moveTo: renameTo,
      hunks,
    })
  }

  return operations
}

function parsePatch(patch: string): PatchOperation[] {
  const normalizedPatch = patch.replace(/\r\n/g, "\n")
  if (normalizedPatch.startsWith("*** Begin Patch")) {
    return parseStructuredPatch(normalizedPatch)
  }
  if (normalizedPatch.startsWith("diff --git ")) {
    return parseUnifiedDiff(normalizedPatch)
  }
  throw new Error("Patch must be a structured patch or a supported unified diff")
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

function splitPatchLines(text: string): string[] {
  return text.split("\n")
}

function findUniqueSequence(lines: string[], target: string[]): number {
  if (target.length === 0) {
    throw new Error("Patch hunk must include at least one context or removed line")
  }
  const matches: number[] = []
  for (let index = 0; index <= lines.length - target.length; index += 1) {
    let matched = true
    for (let offset = 0; offset < target.length; offset += 1) {
      if (lines[index + offset] !== target[offset]) {
        matched = false
        break
      }
    }
    if (matched) {
      matches.push(index)
      if (matches.length > 1) {
        break
      }
    }
  }
  if (matches.length === 0) {
    return -1
  }
  if (matches.length > 1) {
    return -2
  }
  return matches[0] ?? -1
}

function applyHunksToText(path: string, originalText: string, hunks: Array<{ oldLines: string[]; newLines: string[] }>): string {
  let nextLines = splitPatchLines(originalText)
  for (const hunk of hunks) {
    const matchIndex = findUniqueSequence(nextLines, hunk.oldLines)
    if (matchIndex === -1) {
      throw new Error(`Patch hunk not found in ${path}`)
    }
    if (matchIndex === -2) {
      throw new Error(`Patch hunk is ambiguous in ${path}`)
    }
    nextLines = [
      ...nextLines.slice(0, matchIndex),
      ...hunk.newLines,
      ...nextLines.slice(matchIndex + hunk.oldLines.length),
    ]
  }
  return nextLines.join("\n")
}

async function loadPreparedFile(
  ctx: Parameters<ToolDef["execute"]>[1],
  cache: Map<string, PreparedFile>,
  path: string,
  action: "write" | "delete",
): Promise<PreparedFile> {
  const absolutePath = await normalizeWorkspacePath(ctx, path, action)
  const cached = cache.get(absolutePath)
  if (cached) {
    return cached
  }
  const exists = await ctx.fs.exists(absolutePath)
  if (!exists) {
    const prepared: PreparedFile = {
      absolutePath,
      displayPath: path,
      exists: false,
      originalText: null,
      originalSha256: null,
    }
    cache.set(absolutePath, prepared)
    return prepared
  }
  await assertReadBeforeModify(ctx, absolutePath)
  const originalBuffer = await ctx.fs.readFile(absolutePath)
  const prepared: PreparedFile = {
    absolutePath,
    displayPath: path,
    exists: true,
    originalText: TEXT_DECODER.decode(originalBuffer),
    originalSha256: sha256(originalBuffer),
  }
  cache.set(absolutePath, prepared)
  return prepared
}

async function planPatchOperations(ctx: Parameters<ToolDef["execute"]>[1], operations: PatchOperation[]): Promise<PlannedChange[]> {
  const preparedFiles = new Map<string, PreparedFile>()
  const virtualFiles = new Map<string, { exists: boolean; text: string | null }>()
  const plans: PlannedChange[] = []

  for (const operation of operations) {
    if (operation.type === "add") {
      const absolutePath = await normalizeWorkspacePath(ctx, operation.path, "write")
      const existing = virtualFiles.get(absolutePath)
      if (existing?.exists) {
        throw new Error(WRITE_TARGET_ALREADY_EXISTS_ERROR)
      }
      if (!existing) {
        const prepared = await loadPreparedFile(ctx, preparedFiles, operation.path, "write")
        if (prepared.exists) {
          throw new Error(WRITE_TARGET_ALREADY_EXISTS_ERROR)
        }
      }
      const content = operation.lines.join("\n")
      virtualFiles.set(absolutePath, { exists: true, text: content })
      plans.push({ type: "add", absolutePath, displayPath: operation.path, content })
      continue
    }

    if (operation.type === "delete") {
      const prepared = await loadPreparedFile(ctx, preparedFiles, operation.path, "delete")
      const virtual = virtualFiles.get(prepared.absolutePath) ?? { exists: prepared.exists, text: prepared.originalText }
      if (!virtual.exists) {
        throw new Error(`File does not exist: ${operation.path}`)
      }
      virtualFiles.set(prepared.absolutePath, { exists: false, text: null })
      plans.push({ type: "delete", absolutePath: prepared.absolutePath, displayPath: operation.path })
      continue
    }

    const prepared = await loadPreparedFile(ctx, preparedFiles, operation.path, "write")
    const virtual = virtualFiles.get(prepared.absolutePath) ?? { exists: prepared.exists, text: prepared.originalText }
    if (!virtual.exists || virtual.text == null || prepared.originalSha256 == null || prepared.originalText == null) {
      throw new Error(`File does not exist: ${operation.path}`)
    }
    const nextText = applyHunksToText(operation.path, virtual.text, operation.hunks)
    if (operation.moveTo) {
      const moveToPath = await normalizeWorkspacePath(ctx, operation.moveTo, "write")
      const moveTargetVirtual = virtualFiles.get(moveToPath)
      if (moveTargetVirtual?.exists) {
        throw new Error(WRITE_TARGET_ALREADY_EXISTS_ERROR)
      }
      if (!moveTargetVirtual) {
        const targetPrepared = await loadPreparedFile(ctx, preparedFiles, operation.moveTo, "write")
        if (targetPrepared.exists) {
          throw new Error(WRITE_TARGET_ALREADY_EXISTS_ERROR)
        }
      }
      virtualFiles.set(prepared.absolutePath, { exists: false, text: null })
      virtualFiles.set(moveToPath, { exists: true, text: nextText })
      plans.push({
        type: "update",
        absolutePath: prepared.absolutePath,
        displayPath: operation.path,
        originalText: prepared.originalText,
        originalSha256: prepared.originalSha256,
        nextText,
        moveToPath,
        moveToDisplayPath: operation.moveTo,
      })
      continue
    }
    virtualFiles.set(prepared.absolutePath, { exists: true, text: nextText })
    plans.push({
      type: "update",
      absolutePath: prepared.absolutePath,
      displayPath: operation.path,
      originalText: prepared.originalText,
      originalSha256: prepared.originalSha256,
      nextText,
    })
  }

  return plans
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
      const plans = await planPatchOperations(ctx, operations)
      const summaries: string[] = []
      let filesWritten = 0
      let added = 0
      let deleted = 0
      let updated = 0
      let renamed = 0
      for (const plan of plans) {
        if (plan.type === "add") {
          await ensureParentDirectory(ctx, plan.absolutePath)
          const result = await ctx.fs.writeFileIfMissing(plan.absolutePath, plan.content)
          if (result.type === "conflict") {
            throw new Error(WRITE_TARGET_ALREADY_EXISTS_ERROR)
          }
          summaries.push(`added ${plan.displayPath}`)
          filesWritten += 1
          added += 1
          continue
        }
        if (plan.type === "delete") {
          await ctx.fs.remove(plan.absolutePath)
          summaries.push(`deleted ${plan.displayPath}`)
          filesWritten += 1
          deleted += 1
          continue
        }
        const result = await ctx.fs.writeFileIfHashMatches(plan.absolutePath, plan.nextText, plan.originalSha256)
        if (result.type === "conflict") {
          throw new Error(WRITE_CHANGED_SINCE_READ_ERROR)
        }
        if (plan.moveToPath && plan.moveToDisplayPath) {
          await ensureParentDirectory(ctx, plan.moveToPath)
          await ctx.fs.rename(plan.absolutePath, plan.moveToPath)
          summaries.push(`updated ${plan.displayPath} -> ${plan.moveToDisplayPath}`)
          renamed += 1
        } else {
          summaries.push(`updated ${plan.displayPath}\n${summarizeDiff(plan.originalText, plan.nextText)}`)
        }
        filesWritten += 1
        updated += 1
      }
      return {
        text: summaries.join("\n"),
        metadata: { filesWritten, added, deleted, updated, renamed, truncated: false },
      }
    },
  }
}
