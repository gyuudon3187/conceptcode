import type { AppState, BufferModalCategory, BufferModalTarget, BufferSummary, BufferedConcept, ConceptNode, LayoutMode, StatusTone } from "./types"

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

export function bufferModalCategories(): BufferModalCategory[] {
  return ["buffered", "deleted", "created"]
}

export function bufferModalItems(state: AppState, category: BufferModalCategory): string[] {
  if (category === "deleted") {
    return state.bufferedConcepts.filter((item) => item.action === "delete").map((item) => item.path)
  }
  if (category === "created") {
    return state.bufferedConcepts.filter((item) => Boolean(state.nodes.get(item.path)?.isDraft)).map((item) => item.path)
  }
  return state.bufferedConcepts
    .filter((item) => item.action !== "delete" && !state.nodes.get(item.path)?.isDraft)
    .map((item) => item.path)
}

export function clampBufferModalState(state: AppState): void {
  for (const category of bufferModalCategories()) {
    const items = bufferModalItems(state, category)
    state.bufferModal.cursors[category] = Math.max(0, Math.min(state.bufferModal.cursors[category], Math.max(0, items.length - 1)))
  }
  if (state.bufferModal.focus === "categories") {
    const items = bufferModalItems(state, state.bufferModal.activeCategory)
    if (items.length === 0) {
      state.bufferModal.focus = "prompt"
    }
  }
}

export function resetBufferModal(state: AppState): void {
  const firstNonEmpty = bufferModalCategories().find((category) => bufferModalItems(state, category).length > 0) ?? "buffered"
  state.bufferModal = {
    focus: "prompt",
    activeCategory: firstNonEmpty,
    cursors: {
      buffered: 0,
      deleted: 0,
      created: 0,
    },
  }
  clampBufferModalState(state)
}

export function selectedBufferModalTarget(state: AppState): BufferModalTarget {
  clampBufferModalState(state)
  if (state.bufferModal.focus === "prompt") {
    return { kind: "prompt" }
  }
  const items = bufferModalItems(state, state.bufferModal.activeCategory)
  const path = items[state.bufferModal.cursors[state.bufferModal.activeCategory]]
  return path ? { kind: "concept", path } : { kind: "prompt" }
}

export function moveBufferModalCursor(state: AppState, delta: number): boolean {
  clampBufferModalState(state)
  if (state.bufferModal.focus === "prompt") {
    if (delta <= 0) {
      return false
    }
    const items = bufferModalItems(state, state.bufferModal.activeCategory)
    if (items.length === 0) {
      return false
    }
    state.bufferModal.focus = "categories"
    state.bufferModal.cursors[state.bufferModal.activeCategory] = 0
    return true
  }
  const category = state.bufferModal.activeCategory
  const items = bufferModalItems(state, category)
  if (items.length === 0) {
    state.bufferModal.focus = "prompt"
    return true
  }
  const previous = state.bufferModal.cursors[category]
  const next = previous + delta
  if (next < 0) {
    state.bufferModal.focus = "prompt"
    return true
  }
  state.bufferModal.cursors[category] = Math.max(0, Math.min(next, items.length - 1))
  return state.bufferModal.cursors[category] !== previous
}

export function moveBufferModalCategory(state: AppState, delta: number): boolean {
  const categories = bufferModalCategories()
  const previousIndex = categories.indexOf(state.bufferModal.activeCategory)
  const nextIndex = Math.max(0, Math.min(previousIndex + delta, categories.length - 1))
  if (nextIndex === previousIndex) {
    return false
  }
  state.bufferModal.activeCategory = categories[nextIndex]
  clampBufferModalState(state)
  return true
}
