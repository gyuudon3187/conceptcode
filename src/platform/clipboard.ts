import { spawn } from "node:child_process"

export function copyToClipboard(text: string): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn("wl-copy", ["--foreground"], { stdio: ["pipe", "ignore", "pipe"] })
    let stderr = ""
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk)
    })
    child.on("error", () => {
      resolvePromise({ ok: false, message: "wl-copy not found on PATH" })
    })
    child.on("close", (code) => {
      if (code === 0 || code === null) {
        resolvePromise({ ok: true, message: "Copied to clipboard" })
      } else {
        resolvePromise({ ok: false, message: `wl-copy failed: ${stderr.trim() || `exit code ${code}`}` })
      }
    })
    child.stdin.end(text)
  })
}
