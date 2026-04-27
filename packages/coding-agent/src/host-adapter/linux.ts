import type { CodingAgentTool } from "../types"
import type { CodingAgentHostEnvironment } from "./index"

type LinuxToolCapability = "bash" | "find" | "glob"

type CommandResult = {
  stdout: string
  stderr: string
  exitCode: number
}

async function binaryExists(binaryName: string): Promise<boolean> {
  const proc = Bun.spawn(["which", binaryName], {
    stdout: "ignore",
    stderr: "ignore",
  })
  return (await proc.exited) === 0
}

export async function detectLinuxCapabilities(): Promise<Set<LinuxToolCapability>> {
  const [bashAvailable, findAvailable] = await Promise.all([
    binaryExists("bash"),
    binaryExists("find"),
  ])
  const capabilities = new Set<LinuxToolCapability>()
  if (bashAvailable) {
    capabilities.add("bash")
  }
  if (findAvailable) {
    capabilities.add("find")
    capabilities.add("glob")
  }
  return capabilities
}

async function runCommand(command: string[], cwd: string, timeoutMs = 15_000): Promise<CommandResult> {
  const proc = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })

  const timeout = setTimeout(() => {
    proc.kill()
  }, timeoutMs)

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    return { stdout, stderr, exitCode }
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeOutput(result: CommandResult): string {
  const sections = [result.stdout.trimEnd(), result.stderr.trimEnd()].filter(Boolean)
  if (sections.length === 0) {
    return result.exitCode === 0 ? "Command completed with no output." : `Command failed with exit code ${result.exitCode}.`
  }
  return sections.join("\n")
}

function createLinuxBashTool(environment: CodingAgentHostEnvironment): CodingAgentTool {
  return {
    name: "bash",
    description: "Run a shell command inside the workspace using the host bash binary",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string" },
        workdir: { type: "string" },
        timeoutMs: { type: "number" },
      },
      required: ["command"],
    },
    async run(input) {
      const command = typeof input.command === "string" ? input.command.trim() : ""
      if (!command) {
        return { toolName: "bash", output: "Missing required field: command", isError: true }
      }
      const workdir = typeof input.workdir === "string" && input.workdir.trim() ? input.workdir.trim() : environment.workspaceRoot
      const timeoutMs = typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs) ? input.timeoutMs : 15_000
      const result = await runCommand(["bash", "-lc", command], workdir, timeoutMs)
      return {
        toolName: "bash",
        output: normalizeOutput(result),
        isError: result.exitCode !== 0,
      }
    },
  }
}

function createLinuxFindTool(environment: CodingAgentHostEnvironment): CodingAgentTool {
  return {
    name: "find",
    description: "Run the host find binary inside the workspace",
    inputSchema: {
      type: "object",
      properties: {
        args: { type: "array", items: { type: "string" } },
        workdir: { type: "string" },
      },
    },
    async run(input) {
      const args = Array.isArray(input.args) ? input.args.filter((value): value is string => typeof value === "string") : ["."]
      const workdir = typeof input.workdir === "string" && input.workdir.trim() ? input.workdir.trim() : environment.workspaceRoot
      const result = await runCommand(["find", ...args], workdir)
      return {
        toolName: "find",
        output: normalizeOutput(result),
        isError: result.exitCode !== 0,
      }
    },
  }
}

function createLinuxGlobTool(environment: CodingAgentHostEnvironment): CodingAgentTool {
  return {
    name: "glob",
    description: "Match paths using the host shell globbing rules",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        workdir: { type: "string" },
      },
      required: ["pattern"],
    },
    async run(input) {
      const pattern = typeof input.pattern === "string" ? input.pattern.trim() : ""
      if (!pattern) {
        return { toolName: "glob", output: "Missing required field: pattern", isError: true }
      }
      const workdir = typeof input.workdir === "string" && input.workdir.trim() ? input.workdir.trim() : environment.workspaceRoot
      const script = `shopt -s globstar nullglob dotglob; printf '%s\n' ${pattern}`
      const result = await runCommand(["bash", "-lc", script], workdir)
      return {
        toolName: "glob",
        output: normalizeOutput(result),
        isError: result.exitCode !== 0,
      }
    },
  }
}

export async function createLinuxHostTools(environment: CodingAgentHostEnvironment): Promise<CodingAgentTool[]> {
  const capabilities = await detectLinuxCapabilities()
  const tools: CodingAgentTool[] = []
  if (capabilities.has("bash")) {
    tools.push(createLinuxBashTool(environment))
  }
  if (capabilities.has("find")) {
    tools.push(createLinuxFindTool(environment))
  }
  if (capabilities.has("glob") && capabilities.has("bash")) {
    tools.push(createLinuxGlobTool(environment))
  }
  return tools
}
