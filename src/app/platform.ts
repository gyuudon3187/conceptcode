import type { AppState } from "../core/types"

export function clearCtrlCExitState(state: AppState): void {
  state.pendingCtrlCExit = false
  if (state.ctrlCExitTimeout) {
    clearTimeout(state.ctrlCExitTimeout)
    state.ctrlCExitTimeout = null
  }
}
