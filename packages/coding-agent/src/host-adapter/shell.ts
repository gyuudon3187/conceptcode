import type { ShellToolInput, ToolContext, ToolDef, ToolResult } from "../types"
import { discoverShell } from "./binaries"
import { displayWorkspacePath, normalizeWorkspacePath } from "./path-utils"

type ShellRunResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  durationMs: number
  truncated: boolean
}

function truncateText(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.byteLength(text, "utf8")
  if (bytes <= maxBytes) {
    return { text, truncated: false }
  }
  let end = text.length
  while (end > 0 && Buffer.byteLength(text.slice(0, end), "utf8") > maxBytes) {
    end -= 1
  }
  return { text: `${text.slice(0, end)}\n... output truncated ...`, truncated: true }
}

async function runShellCommand(input: ShellToolInput, cwd: string, ctx: ToolContext): Promise<ShellRunResult> {
  const shell = await discoverShell(ctx)
  const startedAt = Date.now()
  const proc = Bun.spawn([shell.binary, ...shell.argsFor(input.command)], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  let timedOut = false
  const timeoutMs = Math.min(input.timeoutMs ?? 15_000, 120_000)
  const timer = setTimeout(() => {
    timedOut = true
    proc.kill()
  }, timeoutMs)

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    const combined = `${stdout}${stderr}`
    const maxBytes = Math.min(ctx.limits.shellBytesDefault, ctx.limits.shellBytesMax)
    const truncatedOutput = truncateText(combined, maxBytes)
    const stdoutPart = truncatedOutput.text.slice(0, Math.min(stdout.length, truncatedOutput.text.length))
    const stderrPart = truncatedOutput.text.slice(stdoutPart.length)
    return {
      stdout: stdoutPart,
      stderr: stderrPart,
      exitCode: timedOut ? null : exitCode,
      timedOut,
      durationMs: Date.now() - startedAt,
      truncated: truncatedOutput.truncated,
    }
  } finally {
    clearTimeout(timer)
  }
}

export function createShellTool(): ToolDef<Record<string, unknown>, Record<string, unknown>> {
  return {
    id: "shell",
    description: "Run a structured shell command as an escape hatch for tests, builds, git, and project scripts",
    schema: {
      type: "object",
      properties: {
        command: { type: "string" },
        cwd: { type: "string" },
        timeoutMs: { type: "number" },
        description: { type: "string" },
      },
      required: ["command"],
    },
    async getPathIntents(input, ctx) {
      const cwd = await normalizeWorkspacePath(ctx, typeof input.cwd === "string" ? input.cwd : ".", "list")
      return [{ path: cwd, action: "list" }]
    },
    async execute(input, ctx): Promise<ToolResult<Record<string, unknown>>> {
      const shellInput: ShellToolInput = {
        command: String(input.command ?? ""),
        cwd: typeof input.cwd === "string" ? input.cwd : undefined,
        timeoutMs: typeof input.timeoutMs === "number" ? input.timeoutMs : undefined,
        description: typeof input.description === "string" ? input.description : undefined,
      }
      if (!shellInput.command.trim()) {
        throw new Error("Missing required field: command")
      }
      const cwd = await normalizeWorkspacePath(ctx, shellInput.cwd ?? ".", "list")
      const decision = await ctx.permissions.checkShell(shellInput, cwd, ctx)
      if (!decision.allowed) {
        throw new Error(decision.reason)
      }
      const result = await runShellCommand(shellInput, cwd, ctx)
      const text = [
        `$ ${shellInput.command}`,
        result.stdout.trimEnd(),
        result.stderr.trimEnd(),
        result.timedOut ? `Timed out after ${shellInput.timeoutMs ?? 15_000}ms.` : `Exit code: ${result.exitCode ?? "null"}`,
      ].filter(Boolean).join("\n")
      return {
        text,
        metadata: {
          command: shellInput.command,
          cwd: displayWorkspacePath(ctx, cwd),
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          timedOut: result.timedOut,
          truncated: result.truncated,
        },
      }
    },
  }
}
