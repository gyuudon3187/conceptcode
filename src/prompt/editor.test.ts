import { describe, expect, test } from "bun:test"

import type { AppState } from "../core/types"
import { acceptPromptSuggestion, allFileSuggestions, refreshPromptSuggestion } from "./editor"

function createPromptState(initialText: string): AppState {
  const renderable = {
    plainText: initialText,
    cursorOffset: initialText.length,
    focused: true,
    setText(nextText: string) {
      this.plainText = nextText
    },
    focus() {
      this.focused = true
    },
  }
  return {
    nodes: new Map(),
    projectFiles: ["README.md", "src/app.ts", "src/prompt/editor.ts", "src/prompt/references.ts", "src/ui/view.ts"],
    projectDirectories: ["src", "src/prompt", "src/ui"],
    uiMode: "build",
    sessions: [{ id: "session-1", title: "Test", messages: [{ text: initialText, role: "user", status: "complete" }], draftPromptText: initialText, createdAt: "", updatedAt: "" }],
    activeSessionId: "session-1",
    editorModal: {
      target: { kind: "prompt" },
      renderable,
      promptSuggestion: null,
      visibleLineCount: 1,
      promptDraftIndex: 0,
    },
  } as unknown as AppState
}

describe("prompt file suggestions", () => {
  test("scopes nested queries to a selected directory and ranks descendants", () => {
    const state = createPromptState("")

    expect(allFileSuggestions(state, "src/").slice(0, 4)).toEqual([
      "&src/ui",
      "&src/app.ts",
      "&src/prompt",
      "&src/ui/view.ts",
    ])
    expect(allFileSuggestions(state, "src/pro").slice(0, 2)).toEqual([
      "&src/prompt",
      "&src/prompt/editor.ts",
    ])
  })

  test("keeps prompt suggestions active after accepting a directory", () => {
    const state = createPromptState("&sr")

    refreshPromptSuggestion(state)
    expect(state.editorModal?.promptSuggestion?.query).toBe("sr")

    const accepted = acceptPromptSuggestion(state)

    expect(accepted).toBe(true)
    expect(state.editorModal?.renderable.plainText).toBe("&src/")
    expect(state.editorModal?.promptSuggestion?.prefix).toBe("&")
    expect(state.editorModal?.promptSuggestion?.query).toBe("src/")

    const descendantSuggestions = allFileSuggestions(state, state.editorModal?.promptSuggestion?.query ?? "")
    expect(descendantSuggestions.slice(0, 3)).toEqual([
      "&src/ui",
      "&src/app.ts",
      "&src/prompt",
    ])
  })

  test("continues fuzzy search inside a selected directory", () => {
    const state = createPromptState("&src/pro")

    refreshPromptSuggestion(state)

    expect(state.editorModal?.promptSuggestion?.query).toBe("src/pro")
    expect(allFileSuggestions(state, "src/pro").slice(0, 3)).toEqual([
      "&src/prompt",
      "&src/prompt/editor.ts",
      "&src/prompt/references.ts",
    ])
  })
})
