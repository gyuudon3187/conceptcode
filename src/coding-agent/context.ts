import {
  createLocalFileSystemBackend,
  resolveScopedContextView,
  type ResolvedScopedContext,
  type ResolvedScopedContextView,
  type ScopedContextTreeDirectory,
} from "coding-agent"

import { resolveConceptCodePromptReferences } from "../prompt/references"

export type PromptScopedContext = ResolvedScopedContextView

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
  const context = await resolveScopedContextView({
    workspaceRoot,
    cwd,
    activePaths,
    fs: createLocalFileSystemBackend(),
  })
  return context
}
