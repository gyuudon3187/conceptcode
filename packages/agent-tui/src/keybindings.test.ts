import { describe, expect, test } from "bun:test"

import { confirmOrCancelCommand, inspectorCommand, keepShellListSelectionVisible, moveShellListSelection, sessionModalCommand, sessionModalVisibleRowCount, sharedFocusCommand } from "./keybindings"
import type { ShellListNavigationState } from "./types"

describe("agent-tui keybinding helpers", () => {
  test("session modal row count adapts to layout and viewport", () => {
    expect(sessionModalVisibleRowCount("wide", 24)).toBe(3)
    expect(sessionModalVisibleRowCount("narrow", 12)).toBe(1)
  })

  test("selection visibility clamps scroll window", () => {
    const state: ShellListNavigationState = { selectedIndex: 7, scrollTop: 0 }
    keepShellListSelectionVisible(state, 10, 3)
    expect(state).toEqual({ selectedIndex: 7, scrollTop: 5 })
  })

  test("selection movement wraps around in both directions", () => {
    const state: ShellListNavigationState = { selectedIndex: 0, scrollTop: 0 }
    expect(moveShellListSelection(state, 4, -1, 2)).toBe(true)
    expect(state).toEqual({ selectedIndex: 3, scrollTop: 2 })

    expect(moveShellListSelection(state, 4, 2, 2)).toBe(true)
    expect(state).toEqual({ selectedIndex: 1, scrollTop: 1 })
  })

  test("command classifiers stay generic", () => {
    expect(confirmOrCancelCommand({ name: "escape" } as never)).toEqual({ kind: "cancel" })
    expect(confirmOrCancelCommand({ name: "return" } as never)).toEqual({ kind: "confirm" })
    expect(sessionModalCommand({ name: "d" } as never)).toEqual({ kind: "delete" })
    expect(inspectorCommand({ name: "pagedown" } as never, 5)).toEqual({ kind: "scroll", delta: 5 })
    expect(sharedFocusCommand({ name: "tab", shift: true } as never)).toEqual({ kind: "toggleFocus" })
  })
})
