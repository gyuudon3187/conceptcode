import type { AppState } from "../core/types"
import { RGBA, TextAttributes, type TextChunk } from "@opentui/core"
import { promptPreviewLines, textNodesForChunks, truncateFromStart, truncateSingleLine } from "agent-tui/text"

import { parseConceptCodePromptReferences } from "../prompt/references"
import { COLORS } from "agent-tui/theme"

export { promptPreviewLines, textNodesForChunks, truncateFromStart, truncateSingleLine }

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
  const references = parseConceptCodePromptReferences(line).filter((match) => match.kind === "concept")
  const chunks: TextChunk[] = []
  let lastIndex = 0

  for (const match of references) {
    if (match.start > lastIndex) {
      chunks.push({ __isChunk: true, text: line.slice(lastIndex, match.start), fg: RGBA.fromHex(COLORS.text) })
    }
    chunks.push({ __isChunk: true, text: match.raw, fg: RGBA.fromHex(COLORS.warning), attributes: TextAttributes.BOLD })
    lastIndex = match.end
  }

  if (lastIndex < line.length) {
    chunks.push({ __isChunk: true, text: line.slice(lastIndex), fg: RGBA.fromHex(COLORS.text) })
  }

  if (chunks.length === 0) {
    chunks.push({ __isChunk: true, text: line, fg: RGBA.fromHex(COLORS.text) })
  }

  return chunks
}
