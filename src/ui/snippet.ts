import { createConceptCodeInspectorPreviewProvider, getSnippetSyntaxStyle, type ContextPreview, type InspectorPreviewProvider, type PreviewLegendItem } from "conceptcode/snippet"

import { sourceLinesForNode, sourcePathForNode } from "../core/model"
import type { AppState, ConceptNode, InspectorKind } from "../core/types"

export { getSnippetSyntaxStyle }
export type { ContextPreview, PreviewLegendItem }

export type { InspectorPreviewProvider }

export const conceptCodeInspectorPreviewProvider: InspectorPreviewProvider<AppState> = createConceptCodeInspectorPreviewProvider({
  sourcePathForNode: (jsonPath, node) => sourcePathForNode(jsonPath, node as unknown as ConceptNode),
  sourceLinesForNode: (sourceFileCache, jsonPath, node) => sourceLinesForNode(sourceFileCache, jsonPath, node as unknown as ConceptNode),
})

export async function buildContextPreview(state: AppState, node: ConceptNode): Promise<ContextPreview> {
  if (node.childPaths.length > 0) {
    return conceptCodeInspectorPreviewProvider.previewFor(state, node, "subtree")
  }
  return conceptCodeInspectorPreviewProvider.previewFor(state, node, "snippet")
}

export async function buildSubtreePreview(state: AppState, node: ConceptNode): Promise<ContextPreview> {
  return conceptCodeInspectorPreviewProvider.previewFor(state, node, "subtree")
}

export async function buildSnippetPreview(state: AppState, node: ConceptNode): Promise<ContextPreview> {
  return conceptCodeInspectorPreviewProvider.previewFor(state, node, "snippet")
}

export async function buildMetadataPreview(state: AppState, node: ConceptNode): Promise<ContextPreview> {
  return conceptCodeInspectorPreviewProvider.previewFor(state, node, "metadata")
}
