import {
  findPromptReferenceAt,
  findPromptReferenceEndingAt,
  findPromptReferenceStartingAt,
  parsePromptReferences,
  resolvePromptReferences,
  type PromptReferenceMatch,
  type PromptReferenceSpec,
} from "agent-tui/prompt"
import { isAbsolute, relative, resolve } from "node:path"

type ConceptCodePromptReferenceKind = "concept" | "file" | "slash"

export type ConceptCodePromptReference = PromptReferenceMatch<ConceptCodePromptReferenceKind>

export const CONCEPT_CODE_PROMPT_REFERENCE_SPECS: PromptReferenceSpec<ConceptCodePromptReferenceKind>[] = [
  { kind: "concept", symbol: "@", bodyPattern: /[a-zA-Z0-9_.-]/ },
  { kind: "file", symbol: "&", bodyPattern: /[^\s@&]/ },
  { kind: "slash", symbol: "/", bodyPattern: /[a-zA-Z0-9_.-]/, allowEmpty: true, requiresLeadingWhitespace: true },
]

export type ResolvedConceptCodePromptReference =
  | { kind: "concept"; path: string }
  | { kind: "file"; path: string; absolutePath: string; target: "file" | "directory" | "unknown" }
  | { kind: "slash"; command: string }

function isWithinWorkspace(workspaceRoot: string, targetPath: string): boolean {
  const rel = relative(workspaceRoot, targetPath)
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
}

function toWorkspaceRelativePath(workspaceRoot: string, absolutePath: string): string {
  const rel = relative(workspaceRoot, absolutePath)
  return rel === "" ? "." : rel.split("\\").join("/")
}

export function parseConceptCodePromptReferences(text: string): ConceptCodePromptReference[] {
  return parsePromptReferences(text, CONCEPT_CODE_PROMPT_REFERENCE_SPECS)
}

export function findConceptCodePromptReferenceAt(text: string, cursor: number): ConceptCodePromptReference | null {
  return findPromptReferenceAt(text, cursor, CONCEPT_CODE_PROMPT_REFERENCE_SPECS)
}

export function findConceptCodePromptReferenceEndingAt(text: string, cursor: number): ConceptCodePromptReference | null {
  return findPromptReferenceEndingAt(text, cursor, CONCEPT_CODE_PROMPT_REFERENCE_SPECS)
}

export function findConceptCodePromptReferenceStartingAt(text: string, cursor: number): ConceptCodePromptReference | null {
  return findPromptReferenceStartingAt(text, cursor, CONCEPT_CODE_PROMPT_REFERENCE_SPECS)
}

export async function resolveConceptCodePromptReferences(input: {
  text: string
  cwd: string
  workspaceRoot: string
  conceptPaths?: Iterable<string>
  projectFiles?: Iterable<string>
  projectDirectories?: Iterable<string>
}): Promise<{
  matches: ConceptCodePromptReference[]
  resolved: Array<{ match: ConceptCodePromptReference; result: ResolvedConceptCodePromptReference }>
  unresolved: ConceptCodePromptReference[]
}> {
  const workspaceRoot = resolve(input.workspaceRoot)
  const cwd = resolve(input.cwd)
  const conceptPaths = input.conceptPaths ? new Set(input.conceptPaths) : null
  const projectFiles = input.projectFiles ? new Set(input.projectFiles) : null
  const projectDirectories = input.projectDirectories ? new Set(input.projectDirectories) : null

  return resolvePromptReferences<ConceptCodePromptReferenceKind, {
    workspaceRoot: string
    cwd: string
    conceptPaths: Set<string> | null
    projectFiles: Set<string> | null
    projectDirectories: Set<string> | null
  }, ResolvedConceptCodePromptReference>({
    text: input.text,
    specs: CONCEPT_CODE_PROMPT_REFERENCE_SPECS,
    context: { workspaceRoot, cwd, conceptPaths, projectFiles, projectDirectories },
    resolvers: {
      concept: (match, context) => {
        if (!context.conceptPaths?.has(match.value)) return null
        return { kind: "concept", path: match.value }
      },
      file: (match, context) => {
        const absolutePath = resolve(context.cwd, match.value)
        if (!isWithinWorkspace(context.workspaceRoot, absolutePath)) return null
        const path = toWorkspaceRelativePath(context.workspaceRoot, absolutePath)
        const isFile = context.projectFiles?.has(path) ?? false
        const isDirectory = context.projectDirectories?.has(path) ?? false
        if (context.projectFiles || context.projectDirectories) {
          if (!isFile && !isDirectory) return null
        }
        return { kind: "file", path, absolutePath, target: isDirectory ? "directory" : isFile ? "file" : "unknown" }
      },
      slash: (match) => ({ kind: "slash", command: match.value }),
    },
  })
}
