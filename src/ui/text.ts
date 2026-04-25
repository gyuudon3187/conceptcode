import type { AppState } from "../core/types"
import { promptPreviewLines, textNodesForChunks, truncateFromStart, truncateSingleLine, highlightPromptReferenceChunks } from "../shell/text"

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

export const promptPreviewChunks = highlightPromptReferenceChunks
