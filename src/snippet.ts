import { resolve } from "node:path"

import { RGBA, SyntaxStyle, TextAttributes } from "@opentui/core"
import type { TextChunk } from "@opentui/core"
import { bundledThemes, codeToTokens } from "shiki"
import type { BundledLanguage, ThemeRegistrationResolved, ThemedToken, TokensResult } from "shiki"
import type { RawThemeSetting } from "@shikijs/types"

import { sourceLinesForNode, sourcePathForNode } from "./model"
import type { AppState, ConceptNode } from "./types"

const SHIKI_THEME = "dark-plus"
const DEFAULT_CODE_FG = RGBA.fromHex("#e5e9f0")
const MUTED_FG = RGBA.fromHex("#9aa7b0")
const LINE_NUMBER_FG = RGBA.fromHex("#6a7b8a")
const ERROR_FG = RGBA.fromHex("#bf616a")

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".tsx": "tsx",
  ".jsx": "jsx",
  ".json": "json",
  ".py": "python",
  ".md": "markdown",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".toml": "toml",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".rb": "ruby",
  ".php": "php",
  ".css": "css",
  ".html": "html",
  ".sql": "sql",
}

let syntaxStylePromise: Promise<SyntaxStyle> | null = null

function rgba(hex: string | undefined, fallback: RGBA): RGBA {
  if (!hex) {
    return fallback
  }
  try {
    return RGBA.fromHex(hex)
  } catch {
    return fallback
  }
}

function languageForFile(filePath: string): string {
  const normalized = filePath.toLowerCase()
  const extension = Object.keys(LANGUAGE_BY_EXTENSION).find((suffix) => normalized.endsWith(suffix))
  return extension ? LANGUAGE_BY_EXTENSION[extension] : "text"
}

async function syntaxStyleFromShikiTheme(): Promise<SyntaxStyle> {
  const themeModule = bundledThemes[SHIKI_THEME]
  const theme = themeModule ? ((await themeModule()).default as ThemeRegistrationResolved) : undefined
  const tokenColors = Array.isArray(theme?.tokenColors) ? theme.tokenColors : []
  return SyntaxStyle.fromTheme(
    tokenColors
      .filter((entry: RawThemeSetting) => entry.scope)
      .map((entry: RawThemeSetting) => ({
        scope: (Array.isArray(entry.scope) ? entry.scope : [entry.scope]).filter((scope): scope is string => typeof scope === "string"),
        style: {
          foreground: entry.settings?.foreground,
          background: entry.settings?.background,
          bold: entry.settings?.fontStyle?.includes("bold"),
          italic: entry.settings?.fontStyle?.includes("italic"),
          underline: entry.settings?.fontStyle?.includes("underline"),
        },
      })),
  )
}

export async function getSnippetSyntaxStyle(): Promise<SyntaxStyle> {
  if (!syntaxStylePromise) {
    syntaxStylePromise = syntaxStyleFromShikiTheme()
  }
  return syntaxStylePromise
}

function attributesForToken(token: ThemedToken): number {
  let attributes = 0
  const fontStyle = typeof token.fontStyle === "number" ? token.fontStyle : 0
  if (fontStyle & 1) {
    attributes |= TextAttributes.ITALIC
  }
  if (fontStyle & 2) {
    attributes |= TextAttributes.BOLD
  }
  if (fontStyle & 4) {
    attributes |= TextAttributes.UNDERLINE
  }
  return attributes
}

function createChunk(text: string, fg: RGBA, attributes = 0): TextChunk {
  return {
    __isChunk: true,
    text,
    fg,
    attributes,
  }
}

function numberedLineChunks(label: string, width: number): TextChunk[] {
  return [createChunk(`${label.padStart(width, " ")} | `, LINE_NUMBER_FG)]
}

function chunkForToken(token: ThemedToken): TextChunk {
  return createChunk(token.content, rgba(token.color, DEFAULT_CODE_FG), attributesForToken(token))
}

type SnippetLine = {
  chunks: TextChunk[]
}

export type PreviewLegendItem = {
  kindLabel: string
  color: RGBA
}

export type ContextPreview = {
  title: string
  lines: SnippetLine[]
  legendItems?: PreviewLegendItem[]
  useSyntaxStyle?: boolean
}

const TREE_CONNECTOR_FG = RGBA.fromHex("#6a7b8a")
const NO_KIND_FG = RGBA.fromHex("#9aa7b0")
const KIND_PALETTE = [
  RGBA.fromHex("#88c0d0"),
  RGBA.fromHex("#a3be8c"),
  RGBA.fromHex("#ebcb8b"),
  RGBA.fromHex("#d08770"),
  RGBA.fromHex("#b48ead"),
  RGBA.fromHex("#8fbcbb"),
  RGBA.fromHex("#81a1c1"),
  RGBA.fromHex("#bf616a"),
]

function hashKind(kind: string): number {
  let hash = 0
  for (let index = 0; index < kind.length; index += 1) {
    hash = (hash * 31 + kind.charCodeAt(index)) >>> 0
  }
  return hash
}

function colorForKind(kind: string | null): RGBA {
  if (!kind) {
    return NO_KIND_FG
  }
  return KIND_PALETTE[hashKind(kind) % KIND_PALETTE.length] ?? NO_KIND_FG
}

function treeLine(label: string, indent: string, connector: string, color: RGBA, bold = false): SnippetLine {
  return {
    chunks: [
      ...(indent ? [createChunk(indent, TREE_CONNECTOR_FG)] : []),
      ...(connector ? [createChunk(connector, TREE_CONNECTOR_FG)] : []),
      createChunk(label, color, bold ? TextAttributes.BOLD : 0),
    ],
  }
}

function spacerLine(): SnippetLine {
  return { chunks: [createChunk("", MUTED_FG)] }
}

function appendTreeLines(lines: SnippetLine[], state: AppState, path: string, prefix: string, isLast: boolean, depth: number, maxDepth: number): number {
  const node = state.nodes.get(path)
  if (!node) {
    return 0
  }

  const connector = depth === 0 ? "" : isLast ? "└─ " : "├─ "
  lines.push(treeLine(node.title, prefix, connector, colorForKind(node.kind), depth === 0))
  if (depth === 0 && node.childPaths.length > 0) {
    lines.push(spacerLine())
  }

  if (depth >= maxDepth) {
    const hiddenCount = node.childPaths.length
    if (hiddenCount > 0) {
      const childPrefix = prefix + (depth === 0 ? "" : isLast ? "   " : "│  ")
      lines.push(treeLine(`… ${hiddenCount} more`, childPrefix, "", MUTED_FG))
      return hiddenCount
    }
    return 0
  }

  let hiddenCount = 0
  const childPrefix = prefix + (depth === 0 ? "" : isLast ? "   " : "│  ")
  node.childPaths.forEach((childPath, index) => {
    hiddenCount += appendTreeLines(lines, state, childPath, childPrefix, index === node.childPaths.length - 1, depth + 1, maxDepth)
  })
  return hiddenCount
}

function legendItemsForLines(state: AppState, node: ConceptNode): PreviewLegendItem[] {
  const seen = new Set<string>()
  const items: PreviewLegendItem[] = []
  const stack = [node.path]
  while (stack.length > 0) {
    const path = stack.pop()!
    const current = state.nodes.get(path)
    if (!current) {
      continue
    }
    const kindLabel = current.kind ?? "(no kind)"
    if (!seen.has(kindLabel)) {
      seen.add(kindLabel)
      items.push({ kindLabel, color: colorForKind(current.kind) })
    }
    for (let index = current.childPaths.length - 1; index >= 0; index -= 1) {
      stack.push(current.childPaths[index]!)
    }
  }
  return items.sort((left, right) => left.kindLabel.localeCompare(right.kindLabel))
}

export async function buildContextPreview(state: AppState, node: ConceptNode): Promise<ContextPreview> {
  if (node.childPaths.length > 0) {
    return buildSubtreePreview(state, node)
  }
  return buildSnippetPreview(state, node)
}

export async function buildSubtreePreview(state: AppState, node: ConceptNode): Promise<ContextPreview> {
  if (node.childPaths.length > 0) {
    const lines: SnippetLine[] = []
    const maxDepth = state.layoutMode === "wide" ? 5 : 3
    appendTreeLines(lines, state, node.path, "", true, 0, maxDepth)
    return {
      title: `Concept Tree ${node.title}`,
      lines,
      legendItems: legendItemsForLines(state, node),
      useSyntaxStyle: false,
    }
  }
  return {
    title: `Subtree ${node.title}`,
    lines: [{ chunks: [createChunk("This concept does not have child concepts.", MUTED_FG)] }],
    useSyntaxStyle: false,
  }
}

export async function buildMetadataPreview(_state: AppState, node: ConceptNode): Promise<ContextPreview> {
  const lines: SnippetLine[] = [
    { chunks: [createChunk(`path: ${node.path}`, DEFAULT_CODE_FG)] },
    { chunks: [createChunk(`title: ${node.title}`, DEFAULT_CODE_FG)] },
    { chunks: [createChunk(`kind: ${node.kind ?? "(no kind)"}`, DEFAULT_CODE_FG)] },
    { chunks: [createChunk(`parent_path: ${node.parentPath ?? "-"}`, DEFAULT_CODE_FG)] },
    { chunks: [createChunk(`children: ${node.childPaths.length}`, DEFAULT_CODE_FG)] },
  ]
  if (node.loc) {
    lines.push({ chunks: [createChunk(`loc.file: ${node.loc.file}`, DEFAULT_CODE_FG)] })
    lines.push({ chunks: [createChunk(`loc.start_line: ${node.loc.startLine}`, DEFAULT_CODE_FG)] })
    lines.push({ chunks: [createChunk(`loc.end_line: ${node.loc.endLine}`, DEFAULT_CODE_FG)] })
  }
  const metadataEntries = Object.entries(node.metadata)
  if (metadataEntries.length > 0) {
    lines.push({ chunks: [createChunk("", MUTED_FG)] })
    lines.push({ chunks: [createChunk("metadata:", DEFAULT_CODE_FG, TextAttributes.BOLD)] })
    for (const [key, value] of metadataEntries) {
      lines.push({ chunks: [createChunk(`- ${key}: ${JSON.stringify(value)}`, DEFAULT_CODE_FG)] })
    }
  }
  return {
    title: `Metadata ${node.title}`,
    lines,
    useSyntaxStyle: false,
  }
}

export async function buildSnippetPreview(state: AppState, node: ConceptNode): Promise<ContextPreview> {
  if (!node.loc) {
    return {
      title: "Context",
      lines: [{ chunks: [createChunk("No source preview for this concept.", MUTED_FG)] }],
      useSyntaxStyle: true,
    }
  }

  const sourcePath = sourcePathForNode(state.jsonPath, node)
  if (!sourcePath) {
    return {
      title: "Context",
      lines: [{ chunks: [createChunk("Source location is missing a file path.", ERROR_FG)] }],
      useSyntaxStyle: true,
    }
  }

  let sourceLines: string[] | null = null
  try {
    sourceLines = sourceLinesForNode(state.sourceFileCache, state.jsonPath, node)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      title: `Context ${node.loc.file}:${node.loc.startLine}-${node.loc.endLine}`,
      lines: [{ chunks: [createChunk(`Unable to load source: ${message}`, ERROR_FG)] }],
      useSyntaxStyle: true,
    }
  }

  const absoluteSourcePath = resolve(sourcePath)
  const snippetLines = sourceLines ?? []
  const language = languageForFile(absoluteSourcePath) as BundledLanguage
  const lineNumberWidth = String(node.loc.endLine).length
  const snippetText = snippetLines.join("\n")
  const tokenResult = await codeToTokens(snippetText, {
    lang: language,
    theme: SHIKI_THEME,
  }).catch(() => null as TokensResult | null)

  const renderedLines = snippetLines.map((lineText, index) => {
    const lineNumber = node.loc!.startLine + index
    const tokenLine = tokenResult?.tokens[index]
    if (!tokenLine) {
      return {
        chunks: [...numberedLineChunks(String(lineNumber), lineNumberWidth), createChunk(lineText, DEFAULT_CODE_FG)],
      }
    }
    return {
      chunks: [
        ...numberedLineChunks(String(lineNumber), lineNumberWidth),
        ...(tokenLine.length > 0 ? tokenLine.map(chunkForToken) : [createChunk("", DEFAULT_CODE_FG)]),
      ],
    }
  })

  return {
    title: `Context ${node.loc.file}:${node.loc.startLine}-${node.loc.endLine}`,
    lines: renderedLines,
    useSyntaxStyle: true,
  }
}
