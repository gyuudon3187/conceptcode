import type { AppState, BufferModalTarget, BufferSummary, BufferedConcept, ConceptNode, LayoutMode, StatusTone } from "./types"

function pathSegments(path: string): string[] {
  return path.split(".")
}

function aliasForPath(path: string, depth: number): string {
  const segments = pathSegments(path)
  const sliceStart = Math.max(0, segments.length - depth)
  return `@${segments.slice(sliceStart).join(".")}`
}

export function rebuildConceptAliases(state: AppState): void {
  const uniquePaths = [...new Set(state.bufferedConcepts.map((item) => item.path))]
  const conceptAliases: Record<string, string> = {}
  const aliasPaths: Record<string, string> = {}

  for (const path of uniquePaths) {
    const segmentCount = pathSegments(path).length
    let resolvedAlias = aliasForPath(path, 1)
    for (let depth = 1; depth <= segmentCount; depth += 1) {
      const candidate = aliasForPath(path, depth)
      const collisions = uniquePaths.filter((otherPath) => aliasForPath(otherPath, depth) === candidate)
      resolvedAlias = candidate
      if (collisions.length === 1) {
        break
      }
    }
    conceptAliases[path] = resolvedAlias
    aliasPaths[resolvedAlias] = path
  }

  state.conceptAliases = conceptAliases
  state.aliasPaths = aliasPaths
}

export function bufferedConceptForPath(state: AppState, path: string): BufferedConcept | undefined {
  return state.bufferedConcepts.find((item) => item.path === path)
}

export function bufferedPaths(state: AppState): string[] {
  return state.bufferedConcepts.map((item) => item.path)
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
  const visible = bufferedPaths(state).slice(0, maxVisible)
  return {
    visiblePaths: visible,
    hiddenCount: Math.max(0, state.bufferedConcepts.length - visible.length),
  }
}

export function bufferModalItems(state: AppState): string[] {
  return state.bufferedConcepts.map((item) => item.path)
}

export function clampBufferModalState(state: AppState): void {
  rebuildConceptAliases(state)
  const items = bufferModalItems(state)
  state.bufferModal.conceptCursor = Math.max(0, Math.min(state.bufferModal.conceptCursor, Math.max(0, items.length - 1)))
  if (state.bufferModal.focus === "categories") {
    if (items.length === 0) {
      state.bufferModal.focus = "prompt"
    }
  }
}

export function resetBufferModal(state: AppState): void {
  state.bufferModal = {
    focus: "prompt",
    conceptCursor: 0,
  }
  clampBufferModalState(state)
}

export function selectedBufferModalTarget(state: AppState): BufferModalTarget {
  clampBufferModalState(state)
  if (state.bufferModal.focus === "prompt") {
    return { kind: "prompt" }
  }
  const items = bufferModalItems(state)
  const path = items[state.bufferModal.conceptCursor]
  return path ? { kind: "concept", path } : { kind: "prompt" }
}

export function moveBufferModalCursor(state: AppState, delta: number): boolean {
  clampBufferModalState(state)
  if (state.bufferModal.focus === "prompt") {
    if (delta <= 0) {
      return false
    }
    const items = bufferModalItems(state)
    if (items.length === 0) {
      return false
    }
    state.bufferModal.focus = "categories"
    state.bufferModal.conceptCursor = 0
    return true
  }
  const items = bufferModalItems(state)
  if (items.length === 0) {
    state.bufferModal.focus = "prompt"
    return true
  }
  const previous = state.bufferModal.conceptCursor
  const next = previous + delta
  if (next < 0) {
    state.bufferModal.focus = "prompt"
    return true
  }
  state.bufferModal.conceptCursor = Math.max(0, Math.min(next, items.length - 1))
  return state.bufferModal.conceptCursor !== previous
}
