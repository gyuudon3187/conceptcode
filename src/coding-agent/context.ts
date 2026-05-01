import {
  createLocalFileSystemBackend,
  resolveScopedContextFiles,
  type ResolvedScopedContext,
} from "coding-agent"

import type { ChatTurnRequest } from "../core/types"
import { resolveConceptCodePromptReferences } from "../prompt/references"

export type RequestScopedContext = {
  latestPrompt: string
  activePaths: string[]
  scopedContext: ResolvedScopedContext
}

export function latestUserText(messages: Array<{ role: "user" | "assistant"; text: string }>): string {
  return [...messages].reverse().find((message) => message.role === "user")?.text.trim() ?? ""
}

async function activeFileReferencesForPrompt(prompt: string, workspaceRoot: string, cwd: string): Promise<string[]> {
  const resolvedReferences = await resolveConceptCodePromptReferences({
    text: prompt,
    workspaceRoot,
    cwd,
  })
  return resolvedReferences.resolved
    .map((entry) => entry.result)
    .filter((entry) => entry.kind === "file")
    .map((entry) => entry.path)
}

export async function resolveRequestScopedContext(request: ChatTurnRequest, workspaceRoot: string, cwd: string): Promise<RequestScopedContext> {
  const latestPrompt = latestUserText(request.messages)
  const activePaths = await activeFileReferencesForPrompt(latestPrompt, workspaceRoot, cwd)
  const scopedContext = await resolveScopedContextFiles({
    workspaceRoot,
    cwd,
    activePaths,
    fs: createLocalFileSystemBackend(),
  })
  return { latestPrompt, activePaths, scopedContext }
}

export function isMemoryCommand(text: string): boolean {
  return /^\/memory(?:\s+.*)?$/i.test(text.trim())
}

export function renderMemoryResponse(context: RequestScopedContext, cwd: string, workspaceRoot: string): string {
  const lines = [
    "Scoped context memory for this coding-agent run.",
    `Workspace root: ${workspaceRoot}`,
    `Current working directory: ${cwd}`,
  ]

  lines.push(context.activePaths.length > 0 ? `Active file references: ${context.activePaths.join(", ")}` : "Active file references: none")

  if (context.scopedContext.eagerFiles.length > 0) {
    lines.push("", "Loaded context files:")
    for (const file of context.scopedContext.eagerFiles) {
      lines.push(`- ${file.path}`)
    }
  } else {
    lines.push("", "Loaded context files: none")
  }

  if (context.scopedContext.lazyFiles.length > 0) {
    lines.push("", "Available lazy context files:")
    for (const file of context.scopedContext.lazyFiles) {
      lines.push(`- ${file.path}: ${file.description}`)
    }
  } else {
    lines.push("", "Available lazy context files: none")
  }

  return `${lines.join("\n").trim()}\n`
}
