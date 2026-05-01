import { dirname, isAbsolute, join, relative, resolve } from "node:path"

import type { FileSystemBackend } from "./types"

const CONTEXT_DIRECTORY = ".coding-agent/contexts"

export type ScopedContextFile = {
  path: string
  scopeRoot: string
  content: string
}

export type ScopedContextReference = {
  path: string
  scopeRoot: string
  description: string
}

export type ResolvedScopedContext = {
  eagerFiles: ScopedContextFile[]
  lazyFiles: ScopedContextReference[]
  contextDirectories: string[]
}

export type ScopedContextTreeFile = {
  kind: "file"
  name: string
  path: string
  scopeRoot: string
  mode: "eager" | "lazy"
  description: string | null
}

export type ScopedContextTreeDirectory = {
  kind: "directory"
  name: string
  path: string
  children: ScopedContextTreeNode[]
}

export type ScopedContextTreeNode = ScopedContextTreeDirectory | ScopedContextTreeFile

export type ResolveScopedContextInput = {
  workspaceRoot: string
  cwd: string
  activePaths?: string[]
  fs: Pick<FileSystemBackend, "exists" | "stat" | "readDir" | "readFile">
}

export function parseMarkdownFrontmatter(markdown: string): { description: string | null; body: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) {
    return { description: null, body: markdown }
  }

  const frontmatter = match[1]
  const body = match[2]
  let description: string | null = null
  for (const line of frontmatter.split(/\r?\n/)) {
    const field = line.match(/^description\s*:\s*(.+)\s*$/)
    if (!field) continue
    description = stripWrappedQuotes(field[1]?.trim() ?? "") || null
    break
  }
  return { description, body }
}

function stripWrappedQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

function isWithinWorkspace(workspaceRoot: string, targetPath: string): boolean {
  const rel = relative(workspaceRoot, targetPath)
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
}

function toWorkspaceRelativePath(workspaceRoot: string, absolutePath: string): string {
  const rel = relative(workspaceRoot, absolutePath)
  return rel === "" ? "." : rel.split("\\").join("/")
}

async function resolveScopeDirectory(fs: Pick<FileSystemBackend, "stat">, workspaceRoot: string, candidatePath: string): Promise<string | null> {
  const absoluteCandidate = isAbsolute(candidatePath) ? resolve(candidatePath) : resolve(workspaceRoot, candidatePath)
  if (!isWithinWorkspace(workspaceRoot, absoluteCandidate)) {
    return null
  }
  try {
    const stats = await fs.stat(absoluteCandidate)
    return stats.isDirectory ? absoluteCandidate : dirname(absoluteCandidate)
  } catch {
    return dirname(absoluteCandidate)
  }
}

function ancestorDirectories(startDir: string, workspaceRoot: string): string[] {
  if (!isWithinWorkspace(workspaceRoot, startDir)) {
    return []
  }
  const directories: string[] = []
  let current = resolve(startDir)
  while (true) {
    directories.push(current)
    if (current === workspaceRoot) break
    const parent = dirname(current)
    if (parent === current || !isWithinWorkspace(workspaceRoot, parent)) break
    current = parent
  }
  return directories.reverse()
}

async function discoverContextDirectories(input: ResolveScopedContextInput): Promise<string[]> {
  const scopeDirectories = new Set<string>()
  scopeDirectories.add(resolve(input.cwd))
  for (const activePath of input.activePaths ?? []) {
    const scopeDirectory = await resolveScopeDirectory(input.fs, input.workspaceRoot, activePath)
    if (scopeDirectory) {
      scopeDirectories.add(scopeDirectory)
    }
  }

  const contextDirectories: string[] = []
  const seen = new Set<string>()
  for (const scopeDirectory of [...scopeDirectories].sort((left, right) => left.localeCompare(right))) {
    for (const directory of ancestorDirectories(scopeDirectory, input.workspaceRoot)) {
      const contextDirectory = join(directory, CONTEXT_DIRECTORY)
      if (seen.has(contextDirectory)) continue
      try {
        const stats = await input.fs.stat(contextDirectory)
        if (!stats.isDirectory) continue
        seen.add(contextDirectory)
        contextDirectories.push(contextDirectory)
      } catch {
        continue
      }
    }
  }
  return contextDirectories
}

export async function resolveScopedContextFiles(input: ResolveScopedContextInput): Promise<ResolvedScopedContext> {
  const workspaceRoot = resolve(input.workspaceRoot)
  const contextDirectories = await discoverContextDirectories({ ...input, workspaceRoot, cwd: resolve(input.cwd) })
  const eagerFiles: ScopedContextFile[] = []
  const lazyFiles: ScopedContextReference[] = []

  for (const contextDirectory of contextDirectories) {
    const entries = (await input.fs.readDir(contextDirectory))
      .filter((entry) => entry.isFile && entry.name.toLowerCase().endsWith(".md"))
      .sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      const absolutePath = join(contextDirectory, entry.name)
      const content = new TextDecoder().decode(await input.fs.readFile(absolutePath))
      const parsed = parseMarkdownFrontmatter(content)
      const path = toWorkspaceRelativePath(workspaceRoot, absolutePath)
      const scopeRoot = toWorkspaceRelativePath(workspaceRoot, dirname(dirname(contextDirectory)))
      if (parsed.description) {
        lazyFiles.push({ path, scopeRoot, description: parsed.description })
        continue
      }
      eagerFiles.push({ path, scopeRoot, content: parsed.body })
    }
  }

  return {
    eagerFiles,
    lazyFiles,
    contextDirectories: contextDirectories.map((directory) => toWorkspaceRelativePath(workspaceRoot, directory)),
  }
}

export function buildScopedContextTree(context: ResolvedScopedContext): ScopedContextTreeDirectory[] {
  const roots: ScopedContextTreeDirectory[] = []
  const directories = new Map<string, ScopedContextTreeDirectory>()

  function ensureDirectory(path: string): ScopedContextTreeDirectory {
    const normalizedPath = path === "." ? "." : path.replace(/\/+$/g, "")
    const existing = directories.get(normalizedPath)
    if (existing) return existing

    const parts = normalizedPath === "." ? ["."] : normalizedPath.split("/").filter(Boolean)
    const name = parts[parts.length - 1] ?? "."
    const directory: ScopedContextTreeDirectory = {
      kind: "directory",
      name,
      path: normalizedPath,
      children: [],
    }
    directories.set(normalizedPath, directory)

    if (parts.length <= 1) {
      roots.push(directory)
      return directory
    }

    const parentPath = parts.slice(0, -1).join("/") || "."
    const parent = ensureDirectory(parentPath)
    parent.children.push(directory)
    return directory
  }

  for (const contextDirectory of [...context.contextDirectories].sort((left, right) => left.localeCompare(right))) {
    ensureDirectory(contextDirectory)
  }

  const files = [
    ...context.eagerFiles.map((file) => ({
      kind: "file" as const,
      name: file.path.split("/").at(-1) ?? file.path,
      path: file.path,
      scopeRoot: file.scopeRoot,
      mode: "eager" as const,
      description: null,
    })),
    ...context.lazyFiles.map((file) => ({
      kind: "file" as const,
      name: file.path.split("/").at(-1) ?? file.path,
      path: file.path,
      scopeRoot: file.scopeRoot,
      mode: "lazy" as const,
      description: file.description,
    })),
  ].sort((left, right) => left.path.localeCompare(right.path))

  for (const file of files) {
    const parentPath = file.path.split("/").slice(0, -1).join("/") || "."
    const parent = ensureDirectory(parentPath)
    parent.children.push(file)
  }

  function sortNodes(nodes: ScopedContextTreeNode[]): void {
    nodes.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1
      return left.name.localeCompare(right.name)
    })
    for (const node of nodes) {
      if (node.kind === "directory") {
        sortNodes(node.children)
      }
    }
  }

  sortNodes(roots)
  return roots
}

export function renderScopedContextBlock(context: ResolvedScopedContext): string {
  const sections: string[] = []

  if (context.eagerFiles.length > 0) {
    sections.push("## Loaded Context")
    for (const file of context.eagerFiles) {
      sections.push(`### \`${file.path}\``)
      sections.push(file.content.trim())
    }
  }

  if (context.lazyFiles.length > 0) {
    sections.push("## Available Context References")
    for (const file of context.lazyFiles) {
      sections.push(`- \`${file.path}\`: ${file.description}`)
    }
  }

  if (sections.length === 0) {
    return ""
  }

  return ["[SCOPED CONTEXT]", ...sections].join("\n\n").trim()
}
