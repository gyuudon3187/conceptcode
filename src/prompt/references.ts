import {
  parsePromptReferences,
  findPromptReferenceAt,
  findPromptReferenceEndingAt,
  findPromptReferenceStartingAt,
  resolvePromptReferences,
  type PromptReferenceMatch,
  type PromptReferenceResolverMap,
  type PromptReferenceSpec,
} from "agent-tui/prompt"
import { isAbsolute, relative, resolve } from "node:path"

import { ACTIVE_FEATURES } from "../features"
import type { FeaturePromptReferenceResult, FeaturePromptResolverContext } from "../features/types"

type FilePromptReferenceKind = "file"
type AppPromptReferenceKind = FilePromptReferenceKind | string

export type AppPromptReference = PromptReferenceMatch<AppPromptReferenceKind>

const FILE_PROMPT_REFERENCE_SPEC: PromptReferenceSpec<FilePromptReferenceKind> = {
  kind: "file",
  symbol: "&",
  bodyPattern: /[^\s@&]/,
}

const APP_PROMPT_REFERENCE_SPECS: PromptReferenceSpec<AppPromptReferenceKind>[] = [
  FILE_PROMPT_REFERENCE_SPEC,
  ...ACTIVE_FEATURES.flatMap((feature) => feature.promptReferenceSpecs ?? []),
]

export type ResolvedAppPromptReference =
  | { kind: "file"; path: string; absolutePath: string; target: "file" | "directory" | "unknown" }
  | FeaturePromptReferenceResult

function isWithinWorkspace(workspaceRoot: string, targetPath: string): boolean {
  const rel = relative(workspaceRoot, targetPath)
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
}

function toWorkspaceRelativePath(workspaceRoot: string, absolutePath: string): string {
  const rel = relative(workspaceRoot, absolutePath)
  return rel === "" ? "." : rel.split("\\").join("/")
}

function featurePromptResolvers(context: FeaturePromptResolverContext): PromptReferenceResolverMap<AppPromptReferenceKind, FeaturePromptResolverContext, ResolvedAppPromptReference> {
  const entries = ACTIVE_FEATURES.flatMap((feature) => Object.entries(feature.createPromptResolvers?.(context) ?? {}))
  return Object.fromEntries(entries) as PromptReferenceResolverMap<AppPromptReferenceKind, FeaturePromptResolverContext, ResolvedAppPromptReference>
}

export function parseAppPromptReferences(text: string): AppPromptReference[] {
  return parsePromptReferences(text, APP_PROMPT_REFERENCE_SPECS)
}

export function findAppPromptReferenceAt(text: string, cursor: number): AppPromptReference | null {
  return findPromptReferenceAt(text, cursor, APP_PROMPT_REFERENCE_SPECS)
}

export function findAppPromptReferenceEndingAt(text: string, cursor: number): AppPromptReference | null {
  return findPromptReferenceEndingAt(text, cursor, APP_PROMPT_REFERENCE_SPECS)
}

export function findAppPromptReferenceStartingAt(text: string, cursor: number): AppPromptReference | null {
  return findPromptReferenceStartingAt(text, cursor, APP_PROMPT_REFERENCE_SPECS)
}

export async function resolveAppPromptReferences(input: {
  text: string
  cwd: string
  workspaceRoot: string
  conceptPaths?: Iterable<string>
  projectFiles?: Iterable<string>
  projectDirectories?: Iterable<string>
}): Promise<{
  matches: AppPromptReference[]
  resolved: Array<{ match: AppPromptReference; result: ResolvedAppPromptReference }>
  unresolved: AppPromptReference[]
}> {
  const workspaceRoot = resolve(input.workspaceRoot)
  const cwd = resolve(input.cwd)
  const conceptPaths = input.conceptPaths ? new Set(input.conceptPaths) : null
  const projectFiles = input.projectFiles ? new Set(input.projectFiles) : null
  const projectDirectories = input.projectDirectories ? new Set(input.projectDirectories) : null
  const context: FeaturePromptResolverContext = {
    text: input.text,
    workspaceRoot,
    cwd,
    conceptPaths,
    projectFiles,
    projectDirectories,
  }

  return resolvePromptReferences<AppPromptReferenceKind, FeaturePromptResolverContext, ResolvedAppPromptReference>({
    text: input.text,
    specs: APP_PROMPT_REFERENCE_SPECS,
    context,
    resolvers: {
      file: (match, resolverContext) => {
        const absolutePath = resolve(resolverContext.cwd, match.value)
        if (!isWithinWorkspace(resolverContext.workspaceRoot, absolutePath)) return null
        const path = toWorkspaceRelativePath(resolverContext.workspaceRoot, absolutePath)
        const isFile = resolverContext.projectFiles?.has(path) ?? false
        const isDirectory = resolverContext.projectDirectories?.has(path) ?? false
        if (resolverContext.projectFiles || resolverContext.projectDirectories) {
          if (!isFile && !isDirectory) return null
        }
        return { kind: "file", path, absolutePath, target: isDirectory ? "directory" : isFile ? "file" : "unknown" }
      },
      ...featurePromptResolvers(context),
    },
  })
}
