import { resolve } from "node:path"

import type { AppState } from "../core/types"
import { activeSession } from "../sessions/store"
import { resolvePromptScopedContext } from "./context"

function currentPromptText(state: AppState): string {
  if (state.editorModal?.target.kind === "prompt") {
    return state.editorModal.renderable.plainText
  }
  return activeSession(state).draftPromptText
}

export async function openScopedContextModal(state: AppState, options?: { workspaceRoot?: string; cwd?: string }): Promise<void> {
  const workspaceRoot = resolve(options?.workspaceRoot ?? process.cwd())
  const cwd = resolve(options?.cwd ?? workspaceRoot)
  const prompt = currentPromptText(state)
  const context = await resolvePromptScopedContext(prompt, workspaceRoot, cwd)
  if (state.editorModal?.target.kind === "prompt") {
    state.editorModal.renderable.blur()
  }
  state.scopedContextModal = {
    activePaths: context.activePaths,
    contextDirectories: context.scopedContext.contextDirectories,
    tree: context.scopedContextTree,
    scrollTop: 0,
  }
}

export function closeScopedContextModal(state: AppState): void {
  state.scopedContextModal = null
  if (state.editorModal?.target.kind === "prompt") {
    state.editorModal.renderable.focus()
  }
}
