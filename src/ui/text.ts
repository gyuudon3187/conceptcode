import { RGBA, TextNodeRenderable, TextAttributes, type TextChunk } from "@opentui/core"

import type { AppState } from "../core/types"
import { COLORS } from "./theme"

export function textNodesForChunks(chunks: TextChunk[]): TextNodeRenderable[] {
  return chunks.map((chunk) => TextNodeRenderable.fromString(chunk.text, { fg: chunk.fg, bg: chunk.bg, attributes: chunk.attributes }))
}

export function truncateSingleLine(text: string, width: number): string {
  const compact = text.replace(/\s+/g, " ").trim()
  if (compact.length <= width) return compact
  return `${compact.slice(0, Math.max(0, width - 3))}...`
}

export function truncateFromStart(text: string, width: number): string {
  const compact = text.replace(/\s+/g, " ").trim()
  if (compact.length <= width) return compact
  if (width <= 3) return compact.slice(Math.max(0, compact.length - width))
  return `...${compact.slice(Math.max(0, compact.length - (width - 3)))}`
}

export function promptPreviewLines(text: string, width: number, maxLines: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n").split("\n")
  const flattened: string[] = []
  for (const line of normalized) {
    const source = line || ""
    if (source.length === 0) {
      flattened.push("")
      continue
    }
    let remaining = source
    while (remaining.length > width) {
      const segment = remaining.slice(0, width + 1)
      const breakIndex = segment.lastIndexOf(" ")
      if (breakIndex > 0) {
        flattened.push(segment.slice(0, breakIndex))
        remaining = remaining.slice(breakIndex + 1)
        continue
      }

      flattened.push(remaining.slice(0, width))
      remaining = remaining.slice(width)
    }
    flattened.push(remaining)
  }
  return flattened.slice(0, maxLines)
}

export function promptPreviewWidth(state: AppState): number {
  if (state.layoutMode === "wide") {
    const viewportWidth = process.stdout.columns || 120
    const frameInnerWidth = Math.max(40, viewportWidth - 4)
    const promptPaneWidth = Math.max(28, Math.floor((frameInnerWidth - 1) * state.promptPaneRatio))
    return Math.max(16, promptPaneWidth - 8)
  }
  const viewportWidth = process.stdout.columns || 120
  const outerPadding = 10
  const promptPanePadding = 8
  return Math.max(16, viewportWidth - outerPadding - promptPanePadding)
}

export function promptPreviewChunks(line: string): TextChunk[] {
  const chunks: TextChunk[] = []
  let lastIndex = 0
  for (const match of line.matchAll(/@[a-zA-Z0-9_.-]+/g)) {
    const start = match.index ?? 0
    if (start > lastIndex) {
      chunks.push({ __isChunk: true, text: line.slice(lastIndex, start), fg: RGBA.fromHex(COLORS.text) })
    }
    chunks.push({ __isChunk: true, text: match[0], fg: RGBA.fromHex(COLORS.warning), attributes: TextAttributes.BOLD })
    lastIndex = start + match[0].length
  }
  if (lastIndex < line.length) {
    chunks.push({ __isChunk: true, text: line.slice(lastIndex), fg: RGBA.fromHex(COLORS.text) })
  }
  if (chunks.length === 0) {
    chunks.push({ __isChunk: true, text: line, fg: RGBA.fromHex(COLORS.text) })
  }
  return chunks
}
