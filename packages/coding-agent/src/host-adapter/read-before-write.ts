import type { ToolContext } from "../types"
import { sha256 } from "./hash-file-content"

export const READ_BEFORE_WRITE_ERROR = "Write denied: file must be read before it can be modified."
export const WRITE_CHANGED_SINCE_READ_ERROR = "Write denied: file changed since it was read."
export const WRITE_TARGET_ALREADY_EXISTS_ERROR = "Write denied: file appeared before it could be created."

export function markFileRead(ctx: ToolContext, path: string, snapshot: { sha256: string; size: number }): void {
  ctx.readState.fileSnapshots.set(path, snapshot)
}

export function getReadSnapshot(ctx: ToolContext, path: string): { sha256: string; size: number } | undefined {
  return ctx.readState.fileSnapshots.get(path)
}

export async function assertReadBeforeModify(ctx: ToolContext, path: string): Promise<void> {
  if (!(await ctx.fs.exists(path))) {
    return
  }
  const snapshot = getReadSnapshot(ctx, path)
  if (!snapshot) {
    throw new Error(READ_BEFORE_WRITE_ERROR)
  }
  const current = await ctx.fs.readFile(path)
  if (current.byteLength !== snapshot.size || sha256(current) !== snapshot.sha256) {
    throw new Error(WRITE_CHANGED_SINCE_READ_ERROR)
  }
}
