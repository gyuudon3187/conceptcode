import type { LayoutMode } from "agent-tui/types"
import {
  clampCursor as clampConceptCursor,
  currentNode as currentConceptNode,
  currentPath as currentConceptPath,
  cycleConceptNamespaceMode as cycleConceptNamespaceModeBase,
  moveCursor as moveConceptCursor,
  namespaceRootPath as conceptNamespaceRootPath,
  setConceptNamespaceMode as setConceptNamespaceModeBase,
  visiblePaths as visibleConceptPaths,
} from "conceptcode/state"

import type {
  AppState,
  ConceptGraphState,
  ConceptNamespaceMode,
  ConceptNode,
  ModalTransientState,
  PromptEditorHostState,
  PromptEditorUiState,
  SessionChatState,
  SessionModalHostState,
  WorkspaceUiState,
} from "./types"

export function conceptGraphState(state: AppState): ConceptGraphState {
  return state
}

export function promptEditorUiState(state: AppState): PromptEditorUiState {
  return state
}

export function promptEditorHostState(state: AppState): PromptEditorHostState {
  return state
}

export function workspaceUiState(state: AppState): WorkspaceUiState {
  return state
}

export function sessionChatState(state: AppState): SessionChatState {
  return state
}

export function modalTransientState(state: AppState): ModalTransientState {
  return state
}

export function sessionModalHostState(state: AppState): SessionModalHostState {
  return state
}

export function namespaceRootPath(mode: ConceptNamespaceMode): "impl" | "domain" {
  return conceptNamespaceRootPath(mode)
}

export function setConceptNamespaceMode(state: AppState, mode: ConceptNamespaceMode): void {
  setConceptNamespaceModeBase(state, mode)
  applySelectionChange(state)
  clampCursor(state)
}

export function cycleConceptNamespaceMode(state: AppState): void {
  cycleConceptNamespaceModeBase(state)
  applySelectionChange(state)
  clampCursor(state)
}

export function visiblePaths(state: AppState): string[] {
  return visibleConceptPaths(state)
}

export function currentPath(state: AppState): string {
  return currentConceptPath(state)
}

export function currentNode(state: AppState): ConceptNode {
  return currentConceptNode(state)
}

export function clampCursor(state: AppState): void {
  clampConceptCursor(state)
}

export function applySelectionChange(state: AppState): void {
  state.mainScrollTop = 0
}

export function scrollMain(state: AppState, delta: number): void {
  state.mainScrollTop = Math.max(0, state.mainScrollTop + delta)
}

export function handleResize(state: AppState, width: number): void {
  workspaceUiState(state).layoutMode = width >= 120 ? "wide" : "narrow"
}

export function moveCursor(state: AppState, delta: number): boolean {
  const changed = moveConceptCursor(state, delta)
  if (changed) {
    applySelectionChange(state)
  }
  return changed
}

export function pageSize(layoutMode: LayoutMode): number {
  return layoutMode === "wide" ? 10 : 6
}
