import type { LayoutMode } from "agent-tui/types"
import {
  clearDirtyPaths as clearArchonDirtyPathsBase,
  clearPendingDeletes as clearArchonPendingDeletesBase,
  cycleSubmode as cycleArchonSubmodeBase,
  isPathDirty as isArchonPathDirtyBase,
  markPathDirty as markArchonPathDirtyBase,
  markPendingDelete as markArchonPendingDeleteBase,
  moveSelection as moveArchonSelectionBase,
  replaceCatalog as replaceArchonCatalogBase,
  selectedCommand as selectedArchonCommandBase,
  selectedWorkflow as selectedArchonWorkflowBase,
  selectedWorkflowNode as selectedArchonWorkflowNodeBase,
  setSubmode as setArchonSubmodeBase,
} from "archon"
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
import type { ArchonState } from "archon"

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

export function archonState(state: AppState): ArchonState {
  return state.archon
}

export function isArchonPathDirty(state: AppState, path: string | null | undefined): boolean {
  return isArchonPathDirtyBase(state.archon, path)
}

export function markArchonPathDirty(state: AppState, path: string): void {
  markArchonPathDirtyBase(state.archon, path)
}

export function clearArchonDirtyPaths(state: AppState, paths?: string[]): void {
  clearArchonDirtyPathsBase(state.archon, paths)
}

export function markArchonPendingDelete(state: AppState, path: string): void {
  markArchonPendingDeleteBase(state.archon, path)
}

export function clearArchonPendingDeletes(state: AppState, paths?: string[]): void {
  clearArchonPendingDeletesBase(state.archon, paths)
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

export function selectedArchonWorkflow(state: AppState) {
  return selectedArchonWorkflowBase(state.archon)
}

export function selectedArchonCommand(state: AppState) {
  return selectedArchonCommandBase(state.archon)
}

export function selectedArchonWorkflowNode(state: AppState) {
  return selectedArchonWorkflowNodeBase(state.archon)
}

export function applyArchonSelectionChange(state: AppState): void {
  state.mainScrollTop = 0
}

export function moveArchonSelection(state: AppState, delta: number): boolean {
  const changed = moveArchonSelectionBase(state.archon, delta)
  if (!changed) return false
  applyArchonSelectionChange(state)
  return changed
}

export function setArchonSubmode(state: AppState, submode: ArchonState["submode"]): void {
  setArchonSubmodeBase(state.archon, submode)
  applyArchonSelectionChange(state)
}

export function cycleArchonSubmode(state: AppState): void {
  cycleArchonSubmodeBase(state.archon)
  applyArchonSelectionChange(state)
}

export function replaceArchonCatalog(
  state: AppState,
  nextCatalog: ArchonState["catalog"],
  selection?: { workflowPath?: string | null; commandPath?: string | null },
): void {
  replaceArchonCatalogBase(state.archon, nextCatalog, selection)
}
