import type { KeyEvent } from "@opentui/core"

import type { LayoutMode, ShellKeyCommand, ShellListNavigationState } from "../core/types"

export function sessionModalVisibleRowCount(layoutMode: LayoutMode, viewportHeight: number): number {
  const topMargin = layoutMode === "wide" ? 5 : 3
  const modalHeight = Math.max(8, viewportHeight - topMargin - topMargin)
  const contentHeight = Math.max(1, modalHeight - 6)
  return Math.max(1, Math.floor((contentHeight + 1) / 3))
}

export function keepShellListSelectionVisible(state: ShellListNavigationState, itemCount: number, visibleRowCount: number): void {
  const maxStart = Math.max(0, itemCount - visibleRowCount)
  if (state.selectedIndex < state.scrollTop) {
    state.scrollTop = state.selectedIndex
    return
  }
  if (state.selectedIndex >= state.scrollTop + visibleRowCount) {
    state.scrollTop = state.selectedIndex - visibleRowCount + 1
  }
  state.scrollTop = Math.max(0, Math.min(state.scrollTop, maxStart))
}

export function moveShellListSelection(state: ShellListNavigationState, itemCount: number, delta: number, visibleRowCount: number): boolean {
  if (itemCount <= 0 || delta === 0) return false
  state.selectedIndex = (state.selectedIndex + delta % itemCount + itemCount) % itemCount
  keepShellListSelectionVisible(state, itemCount, visibleRowCount)
  return true
}

export function confirmOrCancelCommand(key: KeyEvent): ShellKeyCommand | null {
  if (key.name === "escape" || (key.ctrl && key.name === "q")) {
    return { kind: "cancel" }
  }
  if (key.name === "return") {
    return { kind: "confirm" }
  }
  return null
}

export function sessionModalCommand(key: KeyEvent): ShellKeyCommand | null {
  if (key.name === "escape" || (key.ctrl && key.name === "q")) return { kind: "cancel" }
  if (key.name === "j" || key.name === "down") return { kind: "move", delta: 1 }
  if (key.name === "k" || key.name === "up") return { kind: "move", delta: -1 }
  if (key.name === "n") return { kind: "create" }
  if (key.name === "d") return { kind: "delete" }
  if (key.name === "return") return { kind: "confirm" }
  return null
}

export function inspectorCommand(key: KeyEvent, scrollDelta: number): ShellKeyCommand | null {
  if (key.name === "escape" || key.name === "q") return { kind: "cancel" }
  if (key.name === "pageup") return { kind: "scroll", delta: -scrollDelta }
  if (key.name === "pagedown") return { kind: "scroll", delta: scrollDelta }
  return null
}

export function sharedFocusCommand(key: KeyEvent): ShellKeyCommand | null {
  if (key.shift && key.name === "tab") return { kind: "toggleFocus" }
  return null
}
