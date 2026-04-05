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

export type SnippetPreview = {
  title: string
  lines: SnippetLine[]
}

export async function buildSnippetPreview(state: AppState, node: ConceptNode): Promise<SnippetPreview> {
  if (!node.loc) {
    return {
      title: "Context",
      lines: [{ chunks: [createChunk("No source preview for this concept.", MUTED_FG)] }],
    }
  }

  const sourcePath = sourcePathForNode(state.jsonPath, node)
  if (!sourcePath) {
    return {
      title: "Context",
      lines: [{ chunks: [createChunk("Source location is missing a file path.", ERROR_FG)] }],
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
  }
}
