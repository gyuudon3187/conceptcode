export type JsonSchema = Record<string, unknown>

export type CodingAgentRole = "system" | "user" | "assistant" | "tool"

export type CodingAgentMessage = {
  role: CodingAgentRole
  content: string
  toolName?: string
}

export type CodingAgentToolInput = Record<string, unknown>

export type CodingAgentToolCall = {
  toolName: string
  input: CodingAgentToolInput
}

export type ToolMode = "read-only" | "build-edit" | "autonomous"

export type ToolResult<TMeta extends Record<string, unknown> = Record<string, unknown>> = {
  text: string
  metadata: TMeta & {
    truncated?: boolean
    durationMs?: number
  }
}

export type ToolPathAction = "read" | "write" | "list" | "stat" | "delete"

export type ToolPathIntent = {
  path: string
  action: ToolPathAction
}

export type ToolPermissionDecision = {
  allowed: boolean
  reason: string
  requiresApproval?: boolean
}

export type ShellToolInput = {
  command: string
  cwd?: string
  timeoutMs?: number
  description?: string
}

export type ShellPermissionDecision = ToolPermissionDecision & {
  commandClass: "read-only" | "build" | "destructive" | "unknown"
}

export type ToolAuditEntry = {
  toolId: string
  arguments: Record<string, unknown>
  normalizedPaths: string[]
  permission: ToolPermissionDecision
  filesRead: string[]
  filesWritten: string[]
  command?: string
  exitCode?: number | null
  error?: string
  durationMs: number
  truncated: boolean
  timestamp: string
}

export interface ToolAuditSink {
  log(entry: ToolAuditEntry): void | Promise<void>
}

export type DirEntryInfo = {
  name: string
  isFile: boolean
  isDirectory: boolean
  isSymbolicLink: boolean
}

export type FileStat = {
  isFile: boolean
  isDirectory: boolean
  isSymbolicLink: boolean
  size: number
  mtimeMs: number
}

export interface FileSystemBackend {
  readFile(path: string): Promise<Uint8Array>
  writeFile(path: string, data: Uint8Array | string): Promise<void>
  readDir(path: string): Promise<DirEntryInfo[]>
  stat(path: string): Promise<FileStat>
  exists(path: string): Promise<boolean>
  realPath(path: string): Promise<string>
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
  remove(path: string, options?: { recursive?: boolean }): Promise<void>
  rename(from: string, to: string): Promise<void>
}

export interface PermissionPolicy {
  checkTool(toolId: string, ctx: ToolContext): Promise<ToolPermissionDecision> | ToolPermissionDecision
  checkPath(action: ToolPathAction, path: string, ctx: ToolContext): Promise<ToolPermissionDecision> | ToolPermissionDecision
  checkShell(input: ShellToolInput, cwd: string, ctx: ToolContext): Promise<ShellPermissionDecision> | ShellPermissionDecision
}

export type ToolEnvironment = {
  managedBinaries?: {
    rg?: string
  }
  shellPreference?: string[]
  allowSystemBinaries?: boolean
}

export type ToolOutputLimits = {
  fileLinesDefault: number
  fileLinesMax: number
  dirEntriesDefault: number
  dirEntriesMax: number
  searchResultsDefault: number
  searchResultsMax: number
  shellBytesDefault: number
  shellBytesMax: number
  treeEntriesDefault: number
  treeEntriesMax: number
}

export type ToolContext = {
  workspaceRoot: string
  cwd: string
  fs: FileSystemBackend
  permissions: PermissionPolicy
  audit: ToolAuditSink
  readState: {
    filesReadThisRun: Set<string>
  }
  signal?: AbortSignal
  environment: ToolEnvironment
  mode: ToolMode
  capabilities?: Set<string>
  limits: ToolOutputLimits
}

export type ToolDef<Input = CodingAgentToolInput, TMeta extends Record<string, unknown> = Record<string, unknown>> = {
  id: string
  description: string
  schema: JsonSchema
  execute(input: Input, ctx: ToolContext): Promise<ToolResult<TMeta>>
  getPathIntents?: (input: Input, ctx: ToolContext) => Promise<ToolPathIntent[]> | ToolPathIntent[]
}

export type CodingAgentToolResult = {
  toolName: string
  output: string
  isError?: boolean
  metadata?: Record<string, unknown>
}

export type CodingAgentToolDefinition = {
  name: string
  description: string
  inputSchema?: JsonSchema
}

export type CodingAgentTool = CodingAgentToolDefinition & {
  run: (input: CodingAgentToolInput) => Promise<CodingAgentToolResult>
}

export type CodingAgentToolExecutor = {
  listTools: () => CodingAgentToolDefinition[]
  runTool: (call: CodingAgentToolCall) => Promise<CodingAgentToolResult>
}

export type CodingAgentModelTurn = {
  message: string
  toolCalls: CodingAgentToolCall[]
  done: boolean
}

export type CodingAgentModel = {
  complete: (messages: CodingAgentMessage[]) => Promise<CodingAgentModelTurn>
}

export type CodingAgentResponseChunk =
  | { type: "response.created"; responseId: string; messageId: string; provider: string }
  | { type: "response.output_text.delta"; responseId: string; messageId: string; delta: string }
  | { type: "response.completed"; responseId: string; messageId: string }
  | { type: "response.error"; responseId: string; messageId: string; error: string }

export type CodingAgentStreamingModel = {
  run: (messages: CodingAgentMessage[]) => AsyncIterable<CodingAgentResponseChunk>
}

export type CodingAgentRunOptions = {
  systemPrompt: string
  userPrompt: string
  model: CodingAgentModel
  toolExecutor: CodingAgentToolExecutor
  maxSteps?: number
}

export type CodingAgentStep =
  | { type: "assistant"; content: string }
  | { type: "tool"; toolName: string; input: CodingAgentToolInput; output: string }

export type CodingAgentRunResult = {
  steps: CodingAgentStep[]
  finalMessage: string
}
