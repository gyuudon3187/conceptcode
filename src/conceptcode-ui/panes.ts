import type { Renderable, VNode, ScrollBoxRenderable } from "@opentui/core"
import {
  renderConceptPreviewPane as renderConceptPreviewPaneBase,
  renderDetailsPane as renderDetailsPaneBase,
  renderDetailsTransitionBody as renderDetailsTransitionBodyBase,
  renderPromptBudgetPane as renderPromptBudgetPaneBase,
  renderPromptPane as renderPromptPaneBase,
  renderPromptPreviewPane as renderPromptPreviewPaneBase,
  renderPromptSuggestionOverlay as renderPromptSuggestionOverlayBase,
  renderSessionTransitionBody as renderSessionTransitionBodyBase,
} from "conceptcode/panes"

import { currentNode, namespaceRootPath } from "../core/state"
import type { AppState } from "../core/types"
import { visiblePromptSuggestions } from "../prompt/editor"
import { appPromptSuggestionProvider } from "../prompt/provider"
import { activeSession } from "../sessions/store"
import { COLORS } from "../ui/theme"
import { promptPreviewChunks, promptPreviewLines, promptPreviewWidth, textNodesForChunks, truncateSingleLine } from "../ui/text"

const paneDeps = {
  colors: COLORS,
  currentNode,
  namespaceRootPath,
  activeSession,
  promptPreviewWidth,
  promptPreviewLines,
  promptPreviewChunks,
  textNodesForChunks,
  truncateSingleLine,
  visiblePromptSuggestions,
  promptSuggestionProviderForState: appPromptSuggestionProvider,
}

export function renderDetailsPane(state: AppState): Renderable | VNode<any, any[]> {
  return renderDetailsPaneBase(state, paneDeps)
}

export function renderPromptPreviewPane(state: AppState): Renderable | VNode<any, any[]> {
  return renderPromptPreviewPaneBase(state, paneDeps)
}

export function renderConceptPreviewPane(state: AppState): Renderable | VNode<any, any[]> {
  return renderConceptPreviewPaneBase(state, paneDeps)
}

export function renderSessionTransitionBody(state: AppState): Renderable | VNode<any, any[]> {
  return renderSessionTransitionBodyBase(state, paneDeps)
}

export function renderDetailsTransitionBody(state: AppState): Renderable | VNode<any, any[]> {
  return renderDetailsTransitionBodyBase(state, paneDeps)
}

export function renderPromptPane(state: AppState, promptScroll: ScrollBoxRenderable | null): Renderable | VNode<any, any[]> {
  return renderPromptPaneBase(state, promptScroll, paneDeps)
}

export function renderPromptBudgetPane(state: AppState): Renderable | VNode<any, any[]> {
  return renderPromptBudgetPaneBase(state, paneDeps)
}

export function renderPromptSuggestionOverlay(state: AppState): Array<Renderable | VNode<any, any[]>> {
  return renderPromptSuggestionOverlayBase(state, paneDeps)
}
