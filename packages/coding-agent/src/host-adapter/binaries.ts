import type { ToolContext } from "../types"

export type RipgrepBinary = {
  path: string
  source: "managed" | "system"
}

export type ShellSpec = {
  binary: string
  argsFor(command: string): string[]
}

export async function binaryExists(binary: string): Promise<boolean> {
  const checker = process.platform === "win32" ? ["where", binary] : ["which", binary]
  const proc = Bun.spawn(checker, { stdout: "ignore", stderr: "ignore" })
  return (await proc.exited) === 0
}

export async function discoverRipgrep(ctx: ToolContext): Promise<RipgrepBinary | null> {
  const managed = ctx.environment.managedBinaries?.rg
  if (managed && await binaryExists(managed)) {
    return { path: managed, source: "managed" }
  }
  if (ctx.environment.allowSystemBinaries !== false && await binaryExists("rg")) {
    return { path: "rg", source: "system" }
  }
  return null
}

export async function discoverShell(ctx: ToolContext): Promise<ShellSpec> {
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
