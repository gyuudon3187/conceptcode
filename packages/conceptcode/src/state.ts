import type { ConceptGraphState, ConceptNamespaceMode, ConceptNode } from "./types"

export function namespaceRootPath(mode: ConceptNamespaceMode): "impl" | "domain" {
  return mode === "implementation" ? "impl" : "domain"
}

export function visiblePaths<TState extends Pick<ConceptGraphState, "nodes" | "currentParentPath">>(state: TState): string[] {
  return state.nodes.get(state.currentParentPath)?.childPaths ?? []
}

export function currentPath<TState extends Pick<ConceptGraphState, "nodes" | "currentParentPath" | "cursor">>(state: TState): string {
  const visible = visiblePaths(state)
  return visible[state.cursor] ?? state.currentParentPath
}

export function currentNode<TState extends Pick<ConceptGraphState, "nodes" | "currentParentPath" | "cursor">>(state: TState): ConceptNode {
  const node = state.nodes.get(currentPath(state))
  if (!node) {
    throw new Error("Current concept not found")
  }
  return node
}

export function clampCursor<TState extends Pick<ConceptGraphState, "nodes" | "currentParentPath" | "cursor">>(state: TState): void {
  const visible = visiblePaths(state)
  state.cursor = visible.length === 0 ? 0 : Math.max(0, Math.min(state.cursor, visible.length - 1))
}

export function setConceptNamespaceMode<TState extends Pick<ConceptGraphState, "conceptNamespaceMode" | "currentParentPath" | "cursor" | "nodes"> & { mainScrollTop?: number }>(state: TState, mode: ConceptNamespaceMode): void {
  state.conceptNamespaceMode = mode
  state.currentParentPath = namespaceRootPath(mode)
  state.cursor = 0
  if (typeof state.mainScrollTop === "number") {
    state.mainScrollTop = 0
  }
  clampCursor(state)
}

export function cycleConceptNamespaceMode<TState extends Pick<ConceptGraphState, "conceptNamespaceMode" | "currentParentPath" | "cursor" | "nodes"> & { mainScrollTop?: number }>(state: TState): void {
  setConceptNamespaceMode(state, state.conceptNamespaceMode === "implementation" ? "domain" : "implementation")
}

export function moveCursor<TState extends Pick<ConceptGraphState, "nodes" | "currentParentPath" | "cursor"> & { mainScrollTop?: number }>(state: TState, delta: number): boolean {
  const visible = visiblePaths(state)
  if (visible.length === 0 || delta === 0) {
    return false
  }
  const previous = state.cursor
  state.cursor = (state.cursor + delta % visible.length + visible.length) % visible.length
  const changed = state.cursor !== previous
  if (changed && typeof state.mainScrollTop === "number") {
    state.mainScrollTop = 0
  }
  return changed
}
