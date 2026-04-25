import type {
  AppState,
  ConceptGraphState,
  ConceptNamespaceMode,
  ConceptNode,
  LayoutMode,
  ModalTransientState,
  PromptEditorUiState,
  SessionChatState,
  ShellWorkspaceUiState,
} from "./types"

export function conceptGraphState(state: AppState): ConceptGraphState {
  return state
}

export function promptEditorUiState(state: AppState): PromptEditorUiState {
  return state
}

export function shellWorkspaceUiState(state: AppState): ShellWorkspaceUiState {
  return state
}

export function sessionChatState(state: AppState): SessionChatState {
  return state
}

export function modalTransientState(state: AppState): ModalTransientState {
  return state
}

export function namespaceRootPath(mode: ConceptNamespaceMode): "impl" | "domain" {
  return mode === "implementation" ? "impl" : "domain"
}

export function setConceptNamespaceMode(state: AppState, mode: ConceptNamespaceMode): void {
  state.conceptNamespaceMode = mode
  state.currentParentPath = namespaceRootPath(mode)
  state.cursor = 0
  applySelectionChange(state)
  clampCursor(state)
}

export function cycleConceptNamespaceMode(state: AppState): void {
  setConceptNamespaceMode(state, state.conceptNamespaceMode === "implementation" ? "domain" : "implementation")
}

export function visiblePaths(state: AppState): string[] {
  return state.nodes.get(state.currentParentPath)?.childPaths ?? []
}

export function currentPath(state: AppState): string {
  const visible = visiblePaths(state)
  return visible[state.cursor] ?? state.currentParentPath
}

export function currentNode(state: AppState): ConceptNode {
  const node = state.nodes.get(currentPath(state))
  if (!node) {
    throw new Error("Current concept not found")
  }
  return node
}

export function clampCursor(state: AppState): void {
  const visible = visiblePaths(state)
  state.cursor = visible.length === 0 ? 0 : Math.max(0, Math.min(state.cursor, visible.length - 1))
}

export function applySelectionChange(state: AppState): void {
  state.mainScrollTop = 0
}

export function scrollMain(state: AppState, delta: number): void {
  state.mainScrollTop = Math.max(0, state.mainScrollTop + delta)
}

export function handleResize(state: AppState, width: number): void {
  shellWorkspaceUiState(state).layoutMode = width >= 120 ? "wide" : "narrow"
}

export function moveCursor(state: AppState, delta: number): boolean {
  const visible = visiblePaths(state)
  if (visible.length === 0 || delta === 0) {
    return false
  }
  const previous = state.cursor
  state.cursor = (state.cursor + delta % visible.length + visible.length) % visible.length
  const changed = state.cursor !== previous
  if (changed) {
    applySelectionChange(state)
  }
  return changed
}

export function pageSize(layoutMode: LayoutMode): number {
  return layoutMode === "wide" ? 10 : 6
}
