import { currentPath } from "../core/state"
import type { AppState } from "../core/types"
import { copyToClipboard } from "../platform/clipboard"

type CopyWithStatusDeps = {
  draw: () => void
}

export async function copyWithStatus(state: AppState, payload: string, deps: CopyWithStatusDeps): Promise<void> {
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
