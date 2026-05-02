import {
  createLocalFileSystemBackend,
  resolveScopedContextView,
  type ResolvedScopedContext,
  type ResolvedScopedContextView,
  type ScopedContextTreeDirectory,
} from "coding-agent"

import { resolveAppPromptReferences } from "../prompt/references"

export type PromptScopedContext = ResolvedScopedContextView

async function activeFileReferencesForPrompt(prompt: string, workspaceRoot: string, cwd: string): Promise<string[]> {
  const resolvedReferences = await resolveAppPromptReferences({
    text: prompt,
    workspaceRoot,
    cwd,
  })
  return resolvedReferences.resolved
    .map((entry) => entry.result)
    .filter((entry): entry is Extract<(typeof resolvedReferences.resolved)[number]["result"], { kind: "file" }> => entry.kind === "file" && "path" in entry)
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
