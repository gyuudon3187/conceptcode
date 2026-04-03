import type { AppState, BufferModalTarget, BufferSummary, ConceptNode, LayoutMode, StatusTone } from "./types"

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

export function setStatus(state: AppState, message: string, tone: StatusTone = "info"): void {
  state.status = { message, tone }
}

export function applySelectionChange(state: AppState): void {
  state.mainScrollTop = 0
}

export function scrollMain(state: AppState, delta: number): void {
  state.mainScrollTop = Math.max(0, state.mainScrollTop + delta)
}

export function handleResize(state: AppState, width: number): void {
  state.layoutMode = width >= 120 ? "wide" : "narrow"
}

export function moveCursor(state: AppState, delta: number): boolean {
  const previous = state.cursor
  state.cursor += delta
  clampCursor(state)
  const changed = state.cursor !== previous
  if (changed) {
    applySelectionChange(state)
  }
  return changed
}

export function pageSize(layoutMode: LayoutMode): number {
  return layoutMode === "wide" ? 10 : 6
}

export function bufferSummary(state: AppState, maxVisible = 4): BufferSummary {
  const visiblePaths = state.bufferedPaths.slice(0, maxVisible)
  return {
    visiblePaths,
    hiddenCount: Math.max(0, state.bufferedPaths.length - visiblePaths.length),
  }
}

export function bufferModalTargets(state: AppState): BufferModalTarget[] {
  return [{ kind: "prompt" }, ...state.bufferedPaths.map((path) => ({ kind: "concept" as const, path }))]
}

export function clampBufferModalCursor(state: AppState): void {
  const targets = bufferModalTargets(state)
  state.bufferModalCursor = Math.max(0, Math.min(state.bufferModalCursor, Math.max(0, targets.length - 1)))
}

export function selectedBufferModalTarget(state: AppState): BufferModalTarget {
  const targets = bufferModalTargets(state)
  return targets[Math.max(0, Math.min(state.bufferModalCursor, Math.max(0, targets.length - 1)))] ?? { kind: "prompt" }
}

export function moveBufferModalCursor(state: AppState, delta: number): boolean {
  const previous = state.bufferModalCursor
  state.bufferModalCursor += delta
  clampBufferModalCursor(state)
  return state.bufferModalCursor !== previous
}
