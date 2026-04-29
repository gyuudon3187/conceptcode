import type { ToolContext } from "../types"

export const READ_BEFORE_WRITE_ERROR = "Write denied: file must be read before it can be modified."

export function markFileRead(ctx: ToolContext, path: string): void {
  ctx.readState.filesReadThisRun.add(path)
}

export async function assertReadBeforeModify(ctx: ToolContext, path: string): Promise<void> {
  if (!(await ctx.fs.exists(path))) {
    return
  }
  if (!ctx.readState.filesReadThisRun.has(path)) {
    throw new Error(READ_BEFORE_WRITE_ERROR)
  }
}
