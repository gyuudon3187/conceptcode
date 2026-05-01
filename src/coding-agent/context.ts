import {
  buildScopedContextTree,
  createLocalFileSystemBackend,
  resolveScopedContextFiles,
  type ResolvedScopedContext,
  type ScopedContextTreeDirectory,
} from "coding-agent"
import { latestUserText, type ChatTurnRequest } from "agent-chat"

import { resolveConceptCodePromptReferences } from "../prompt/references"

export type RequestScopedContext = {
  latestPrompt: string
  activePaths: string[]
  scopedContext: ResolvedScopedContext
  scopedContextTree: ScopedContextTreeDirectory[]
}

export type PromptScopedContext = {
  activePaths: string[]
  scopedContext: ResolvedScopedContext
  scopedContextTree: ScopedContextTreeDirectory[]
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

export async function resolvePromptScopedContext(prompt: string, workspaceRoot: string, cwd: string): Promise<PromptScopedContext> {
  const activePaths = await activeFileReferencesForPrompt(prompt, workspaceRoot, cwd)
  const scopedContext = await resolveScopedContextFiles({
    workspaceRoot,
    cwd,
    activePaths,
    fs: createLocalFileSystemBackend(),
  })
  const scopedContextTree = buildScopedContextTree(scopedContext)
  return { activePaths, scopedContext, scopedContextTree }
}

export async function resolveRequestScopedContext(request: ChatTurnRequest, workspaceRoot: string, cwd: string): Promise<RequestScopedContext> {
  const latestPrompt = latestUserText(request.messages)
  const context = await resolvePromptScopedContext(latestPrompt, workspaceRoot, cwd)
  return { latestPrompt, ...context }
}
