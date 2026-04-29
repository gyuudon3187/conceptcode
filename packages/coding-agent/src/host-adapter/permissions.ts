import { isAbsolute, relative, resolve, sep } from "node:path"

import type {
  PermissionPolicy,
  ShellPermissionDecision,
  ShellToolInput,
  ToolContext,
  ToolMode,
  ToolPathAction,
  ToolPermissionDecision,
} from "../types"

const READ_ONLY_TOOLS = new Set(["read_file", "read_many", "list_dir", "tree", "glob", "grep", "stat"])
const WRITE_TOOLS = new Set(["write_file", "edit_file", "apply_patch"])
const SAFE_READ_ONLY_COMMANDS = new Set(["pwd", "which", "git", "ls", "dir", "type", "Get-ChildItem"])
const SAFE_BUILD_COMMANDS = new Set(["npm", "pnpm", "yarn", "bun", "cargo", "go", "pytest", "jest", "vitest", "make", "just"])

function allowedInMode(mode: ToolMode, toolId: string): boolean {
  if (mode === "autonomous") {
    return true
  }
  if (mode === "read-only") {
    return READ_ONLY_TOOLS.has(toolId)
  }
  if (mode === "build-edit") {
    return true
  }
  return false
}

function deny(reason: string, requiresApproval = false): ToolPermissionDecision {
  return { allowed: false, reason, requiresApproval }
}

function allow(reason: string): ToolPermissionDecision {
  return { allowed: true, reason }
}

function shellAllow(reason: string, commandClass: ShellPermissionDecision["commandClass"]): ShellPermissionDecision {
  return { allowed: true, reason, commandClass }
}

function shellDeny(reason: string, commandClass: ShellPermissionDecision["commandClass"], requiresApproval = false): ShellPermissionDecision {
  return { allowed: false, reason, commandClass, requiresApproval }
}

function classifyShellCommand(command: string): ShellPermissionDecision["commandClass"] {
  const normalized = command.trim()
  if (/(^|\s)(rm|mv|chmod|chown|sudo)(\s|$)/.test(normalized)) {
    return "destructive"
  }
  if (/git\s+reset\s+--hard|git\s+clean\b|docker\s+system\s+prune\b/.test(normalized)) {
    return "destructive"
  }
  if (/(python|node|perl|ruby|sh|bash|powershell|pwsh)\s+(-c|-e|--command)\b/i.test(normalized)) {
    return "destructive"
  }
  const head = normalized.split(/\s+/)[0] ?? ""
  if (SAFE_READ_ONLY_COMMANDS.has(head)) {
    if (/git\s+(status|diff|log|show)\b/.test(normalized) || head !== "git") {
      return "read-only"
    }
  }
  if (SAFE_BUILD_COMMANDS.has(head)) {
    return "build"
  }
  return "unknown"
}

function commandTouchesGlobalConfig(command: string): boolean {
  return /(--global\b|-g\b|git\s+config\s+--global\b|npm\s+config\b|pnpm\s+config\b|yarn\s+config\b)/.test(command)
}

function pathWithin(base: string, candidate: string): boolean {
  const rel = relative(base, candidate)
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
}

export type DefaultPermissionPolicyOptions = {
  mode: ToolMode
  allowExternalPaths?: boolean
}

export class DefaultPermissionPolicy implements PermissionPolicy {
  constructor(private readonly options: DefaultPermissionPolicyOptions) {}

  checkTool(toolId: string): ToolPermissionDecision {
    if (!allowedInMode(this.options.mode, toolId)) {
      return deny(`Tool ${toolId} is not allowed in ${this.options.mode} mode`, this.options.mode !== "autonomous")
    }
    if (this.options.mode === "read-only" && WRITE_TOOLS.has(toolId)) {
      return deny(`Tool ${toolId} requires write access`, true)
    }
    if (this.options.mode === "read-only" && toolId === "shell") {
      return deny("Shell access requires approval in read-only mode", true)
    }
    return allow(`Tool ${toolId} allowed in ${this.options.mode} mode`)
  }

  checkPath(action: ToolPathAction, path: string, ctx: ToolContext): ToolPermissionDecision {
    if (this.options.allowExternalPaths) {
      return allow(`${action} path allowed by external-path policy`)
    }
    const workspacePath = isAbsolute(ctx.workspaceRoot) ? ctx.workspaceRoot : resolve(ctx.workspaceRoot)
    const candidate = isAbsolute(path) ? path : resolve(path)
    if (!pathWithin(workspacePath, candidate)) {
      return deny(`Path is outside the workspace: ${path}`, true)
    }
    if (this.options.mode === "read-only" && (action === "write" || action === "delete")) {
      return deny(`Path action ${action} is not allowed in read-only mode`, true)
    }
    return allow(`${action} allowed for ${path}`)
  }

  checkShell(input: ShellToolInput, cwd: string): ShellPermissionDecision {
    const commandClass = classifyShellCommand(input.command)
    if (commandTouchesGlobalConfig(input.command)) {
      return shellDeny("Shell command may alter global or user configuration", "destructive", true)
    }
    if (commandClass === "destructive") {
      return shellDeny("Destructive shell command requires approval", commandClass, true)
    }
    if (this.options.mode === "read-only") {
      return commandClass === "read-only"
        ? shellAllow("Read-only shell command allowed", commandClass)
        : shellDeny("Shell command requires approval in read-only mode", commandClass, true)
    }
    if (this.options.mode === "build-edit") {
      if (commandClass === "read-only" || commandClass === "build") {
        return shellAllow(`Shell command allowed in ${this.options.mode} mode`, commandClass)
      }
      return shellDeny("Unknown shell command requires approval in build-edit mode", commandClass, true)
    }
    return shellAllow("Shell command allowed in autonomous mode", commandClass)
  }
}

export function classifyShellToolCommand(command: string): ShellPermissionDecision["commandClass"] {
  return classifyShellCommand(command)
}
