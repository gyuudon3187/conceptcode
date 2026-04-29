import { dirname } from "node:path"

import type { ToolContext } from "../types"

export const TEXT_DECODER = new TextDecoder("utf8", { fatal: false })

export function clamp(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback
  }
  return Math.min(Math.floor(value), max)
}

export function decodeText(buffer: Uint8Array): { text: string; binary: boolean } {
  if (buffer.includes(0)) {
    return { text: "", binary: true }
  }
  return { text: TEXT_DECODER.decode(buffer), binary: false }
}

export function splitLines(text: string): string[] {
  return text.split(/\r?\n/)
}

export function numberedLines(lines: string[], start: number): string {
  return lines.map((line, index) => `${start + index}: ${line}`).join("\n")
}

export async function ensureParentDirectory(ctx: ToolContext, path: string): Promise<void> {
  const parent = dirname(path)
  if (!(await ctx.fs.exists(parent))) {
    await ctx.fs.mkdir(parent, { recursive: true })
  }
}

export function summarizeDiff(oldText: string, newText: string): string {
  const oldLines = splitLines(oldText)
  const newLines = splitLines(newText)
  let start = 0
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
    start += 1
  }
  let oldEnd = oldLines.length - 1
  let newEnd = newLines.length - 1
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd -= 1
    newEnd -= 1
  }
  const removed = oldLines.slice(start, oldEnd + 1)
  const added = newLines.slice(start, newEnd + 1)
  return [
    `Changed around line ${start + 1}.`,
    removed.length > 0 ? `- ${removed.join("\\n- ")}` : "- <no removed lines>",
    added.length > 0 ? `+ ${added.join("\\n+ ")}` : "+ <no added lines>",
  ].join("\n")
}
