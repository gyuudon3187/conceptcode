import { dirname } from "node:path"

import type { ShellToolInput, ToolContext, ToolDef, ToolResult } from "../types"
import { displayWorkspacePath, normalizeWorkspacePath } from "./path-utils"

type ShellSpec = {
  binary: string
  argsFor(command: string): string[]
}

type ShellRunResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  durationMs: number
  truncated: boolean
}

async function binaryExists(binary: string): Promise<boolean> {
  const checker = process.platform === "win32" ? ["where", binary] : ["which", binary]
  const proc = Bun.spawn(checker, { stdout: "ignore", stderr: "ignore" })
  return (await proc.exited) === 0
}

async function resolveShellSpec(ctx: ToolContext): Promise<ShellSpec> {
  const preferred = ctx.environment.shellPreference ?? []
  const candidates = process.platform === "win32"
    ? [...preferred, "pwsh", "powershell", "cmd"]
    : [...preferred, "bash", "zsh", "sh"]
  for (const candidate of candidates) {
    if (await binaryExists(candidate)) {
      if (candidate === "cmd") {
        return { binary: candidate, argsFor: (command) => ["/d", "/s", "/c", command] }
      }
      if (candidate === "pwsh" || candidate === "powershell") {
        return { binary: candidate, argsFor: (command) => ["-NoProfile", "-Command", command] }
      }
      return { binary: candidate, argsFor: (command) => ["-lc", command] }
    }
  }
  throw new Error("No supported shell was found on this host")
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
  const shell = await resolveShellSpec(ctx)
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
