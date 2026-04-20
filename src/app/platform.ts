import { currentPath } from "../core/state"
import type { AppState } from "../core/types"
import { copyToClipboard } from "../platform/clipboard"

export function clearCtrlCExitState(state: AppState): void {
  state.pendingCtrlCExit = false
  if (state.ctrlCExitTimeout) {
    clearTimeout(state.ctrlCExitTimeout)
    state.ctrlCExitTimeout = null
  }
}

type CopyWithStatusDeps = {
  draw: () => void
}

export async function copyWithStatus(state: AppState, payload: string, _successMessage: string, deps: CopyWithStatusDeps): Promise<void> {
  const result = await copyToClipboard(payload)
  if (!result.ok) {
    state.confirmModal = {
      kind: "remove-draft",
      title: "Clipboard Error",
      message: [result.message],
      confirmLabel: "dismisses this message",
      path: currentPath(state),
    }
    deps.draw()
  }
}
