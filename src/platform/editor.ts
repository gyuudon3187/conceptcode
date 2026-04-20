import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

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
