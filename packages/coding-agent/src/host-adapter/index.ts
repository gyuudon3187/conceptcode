import { resolve } from "node:path"

import { runReactCodingAgent } from "../react-loop"
import { createToolRegistry } from "../tool-executor"
import type {
  CodingAgentMessage,
  CodingAgentResponseChunk,
  CodingAgentStreamingModel,
  CodingAgentTool,
  CodingAgentToolExecutor,
  FileSystemBackend,
  PermissionPolicy,
  ToolAuditSink,
  ToolContext,
  ToolDef,
  ToolMode,
  ToolOutputLimits,
} from "../types"
import { InMemoryToolAuditSink, NoopToolAuditSink } from "./audit"
import { createLocalFileSystemBackend } from "./filesystem"
import { createNativeFileTools } from "./native-tools"
import { DefaultPermissionPolicy } from "./permissions"
import { createGlobTool, createGrepTool } from "./search"
import { createShellTool } from "./shell"
import { createCapabilitySummary, createHostStepModel, delay, latestUserPrompt } from "./shared"

export type CodingAgentHostOs = NodeJS.Platform

export type CodingAgentHostEnvironment = {
  workspaceRoot: string
  cwd?: string
  os?: CodingAgentHostOs
  mode?: ToolMode
  filesystem?: FileSystemBackend
  permissions?: PermissionPolicy
  audit?: ToolAuditSink
  signal?: AbortSignal
  managedBinaries?: {
    rg?: string
  }
  shellPreference?: string[]
  allowSystemBinaries?: boolean
}

type HostToolCapability =
  | "read_file"
  | "read_many"
  | "list_dir"
  | "tree"
  | "write_file"
  | "edit_file"
  | "apply_patch"
  | "stat"
  | "glob"
  | "grep"
  | "shell"

const DEFAULT_LIMITS: ToolOutputLimits = {
  fileLinesDefault: 250,
  fileLinesMax: 2000,
  dirEntriesDefault: 200,
  dirEntriesMax: 2000,
  searchResultsDefault: 200,
  searchResultsMax: 2000,
  shellBytesDefault: 16_000,
  shellBytesMax: 64_000,
  treeEntriesDefault: 200,
  treeEntriesMax: 2000,
}

function detectedOs(environment: CodingAgentHostEnvironment): CodingAgentHostOs {
  return environment.os ?? process.platform
}

function createToolContext(environment: CodingAgentHostEnvironment): ToolContext {
  const workspaceRoot = resolve(environment.workspaceRoot)
  return {
    workspaceRoot,
    cwd: resolve(environment.cwd ?? environment.workspaceRoot),
    fs: environment.filesystem ?? createLocalFileSystemBackend(),
    permissions: environment.permissions ?? new DefaultPermissionPolicy({ mode: environment.mode ?? "build-edit" }),
    audit: environment.audit ?? new NoopToolAuditSink(),
    readState: {
      fileSnapshots: new Map<string, { sha256: string; size: number }>(),
    },
    signal: environment.signal,
    environment: {
      managedBinaries: environment.managedBinaries,
      shellPreference: environment.shellPreference,
      allowSystemBinaries: environment.allowSystemBinaries,
    },
    mode: environment.mode ?? "build-edit",
    capabilities: undefined,
    limits: DEFAULT_LIMITS,
  }
}

function createBuiltInToolDefs(): Array<ToolDef<Record<string, unknown>, Record<string, unknown>>> {
  return [
    ...createNativeFileTools(),
    createGlobTool(),
    createGrepTool(),
    createShellTool() as unknown as ToolDef<Record<string, unknown>, Record<string, unknown>>,
  ]
}

export async function detectHostToolCapabilities(_environment: CodingAgentHostEnvironment): Promise<Set<HostToolCapability>> {
  return new Set(createBuiltInToolDefs().map((tool) => tool.id as HostToolCapability))
}

export async function createHostToolRegistry(environment: CodingAgentHostEnvironment) {
  const ctx = createToolContext(environment)
  return createToolRegistry(createBuiltInToolDefs(), ctx)
}

export async function createHostTools(environment: CodingAgentHostEnvironment): Promise<CodingAgentTool[]> {
  return (await createHostToolRegistry(environment)).toLegacyTools()
}

export async function createHostToolExecutor(environment: CodingAgentHostEnvironment): Promise<CodingAgentToolExecutor> {
  return (await createHostToolRegistry(environment)).toExecutor()
}

export async function createHostStreamingCodingAgentModel(environment: CodingAgentHostEnvironment): Promise<CodingAgentStreamingModel> {
  const os = detectedOs(environment)
  const registry = await createHostToolRegistry(environment)
  const tools = registry.listTools()
  const capabilitySummary = createCapabilitySummary(tools, os)
  const toolExecutor = registry.toExecutor()
  const model = createHostStepModel(tools, capabilitySummary)

  return {
    async *run(messages: CodingAgentMessage[]): AsyncIterable<CodingAgentResponseChunk> {
      const responseId = `resp_${crypto.randomUUID()}`
      const messageId = `msg_${crypto.randomUUID()}`
      yield { type: "response.created", responseId, messageId, provider: `coding-agent-host-${os}` }
      const text = (await runReactCodingAgent({
        systemPrompt: [
          "You are a local host-backed coding agent.",
          capabilitySummary,
          "Prefer native file and search tools. Use shell only for builds, tests, package managers, git, or project-specific commands.",
        ].join("\n"),
        userPrompt: latestUserPrompt(messages),
        model,
        toolExecutor,
        maxSteps: 2,
      })).finalMessage
      const chunks = text.match(/\S+\s*/g) ?? [text]
      for (const chunk of chunks) {
        await delay(35)
        yield { type: "response.output_text.delta", responseId, messageId, delta: chunk }
      }
      await delay(20)
      yield { type: "response.completed", responseId, messageId }
    },
  }
}

export { DefaultPermissionPolicy, InMemoryToolAuditSink, NoopToolAuditSink, createLocalFileSystemBackend, createToolContext }
