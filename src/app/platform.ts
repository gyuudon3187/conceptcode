import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { copyToClipboard } from "../clipboard"
import { currentPath } from "../state"
import type { AppState } from "../types"

export async function openExternalEditor(initialText: string): Promise<string> {
  const editor = process.env.EDITOR?.trim()
  if (!editor) throw new Error("EDITOR is not set")
  const tempDir = await mkdtemp(join(tmpdir(), "conceptcode-"))
  const tempFile = join(tempDir, "buffer-note.txt")
  await writeFile(tempFile, initialText, "utf8")
  const [command, ...args] = editor.split(/\s+/)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args, tempFile], { stdio: "inherit" })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0 || code === null) resolve()
      else reject(new Error(`${editor} exited with code ${code}`))
    })
  })
  const nextText = await readFile(tempFile, "utf8")
  await rm(tempDir, { recursive: true, force: true })
  return nextText
}

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
