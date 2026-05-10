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
import type { AppState, EditorModalState } from "../core/types"
import { visiblePromptSuggestions } from "../prompt/editor"
import { appPromptSuggestionProvider } from "../prompt/provider"
import { activeSession } from "../sessions/store"
import { COLORS } from "../ui/theme"
import { promptPreviewChunks, promptPreviewLines, promptPreviewWidth, textNodesForChunks, truncateSingleLine } from "../ui/text"

type ConceptCodeEditorModalState = EditorModalState & {
  target: {
    kind: "prompt" | "concept-summary"
    path?: string
  }
}

type ConceptCodePaneState = Omit<AppState, "editorModal"> & {
  editorModal: ConceptCodeEditorModalState | null
}

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
} satisfies Parameters<typeof renderDetailsPaneBase<ConceptCodePaneState>>[1]

function isConceptCodeEditorModal(editorModal: AppState["editorModal"]): editorModal is ConceptCodeEditorModalState {
  return !!editorModal && (editorModal.target.kind === "prompt" || editorModal.target.kind === "concept-summary")
}

function conceptCodePaneState(state: AppState): ConceptCodePaneState {
  if (isConceptCodeEditorModal(state.editorModal)) {
    return { ...state, editorModal: state.editorModal }
  }
  return { ...state, editorModal: null }
}

export function renderDetailsPane(state: AppState): Renderable | VNode<any, any[]> {
  return renderDetailsPaneBase(conceptCodePaneState(state), paneDeps)
}

export function renderPromptPreviewPane(state: AppState): Renderable | VNode<any, any[]> {
  return renderPromptPreviewPaneBase(conceptCodePaneState(state), paneDeps)
}

export function renderConceptPreviewPane(state: AppState): Renderable | VNode<any, any[]> {
  return renderConceptPreviewPaneBase(conceptCodePaneState(state), paneDeps)
}

export function renderSessionTransitionBody(state: AppState): Renderable | VNode<any, any[]> {
  return renderSessionTransitionBodyBase(conceptCodePaneState(state), paneDeps)
}

export function renderDetailsTransitionBody(state: AppState): Renderable | VNode<any, any[]> {
  return renderDetailsTransitionBodyBase(conceptCodePaneState(state), paneDeps)
}

export function renderPromptPane(state: AppState, promptScroll: ScrollBoxRenderable | null): Renderable | VNode<any, any[]> {
  return renderPromptPaneBase(conceptCodePaneState(state), promptScroll, paneDeps)
}

export function renderPromptBudgetPane(state: AppState): Renderable | VNode<any, any[]> {
  return renderPromptBudgetPaneBase(conceptCodePaneState(state), paneDeps)
}

export function renderPromptSuggestionOverlay(state: AppState): Array<Renderable | VNode<any, any[]>> {
  return renderPromptSuggestionOverlayBase(conceptCodePaneState(state), paneDeps)
}
