import type { CodingAgentTool, CodingAgentToolCall, CodingAgentToolDefinition, CodingAgentToolExecutor, CodingAgentToolInput, CodingAgentToolResult, JsonSchema, ToolAuditEntry, ToolContext, ToolDef, ToolPermissionDecision } from "./types"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function truncateAuditValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 300 ? `${value.slice(0, 300)}...` : value
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(truncateAuditValue)
  }
  if (isRecord(value)) {
    return redactArguments(value)
  }
  return value
}

function redactArguments(value: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (/(secret|token|password|api[_-]?key|authorization)/i.test(key)) {
      redacted[key] = "[REDACTED]"
      continue
    }
    redacted[key] = truncateAuditValue(entry)
  }
  return redacted
}

function schemaType(value: unknown): string {
  if (Array.isArray(value)) {
    return "array"
  }
  if (value === null) {
    return "null"
  }
  return typeof value
}

function validateSchema(schema: JsonSchema, input: unknown, path = "input"): string[] {
  const expectedType = typeof schema.type === "string" ? schema.type : undefined
  if (expectedType === "object") {
    if (!isRecord(input)) {
      return [`${path} must be an object`]
    }
    const errors: string[] = []
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : []
    for (const key of required) {
      if (!(key in input)) {
        errors.push(`${path}.${key} is required`)
      }
    }
    const properties = isRecord(schema.properties) ? schema.properties : {}
    for (const [key, value] of Object.entries(input)) {
      const propertySchema = properties[key]
      if (!isRecord(propertySchema)) {
        continue
      }
      errors.push(...validateSchema(propertySchema, value, `${path}.${key}`))
    }
    return errors
  }
  if (expectedType === "array") {
    if (!Array.isArray(input)) {
      return [`${path} must be an array`]
    }
    const itemSchema = isRecord(schema.items) ? schema.items : null
    if (!itemSchema) {
      return []
    }
    return input.flatMap((item, index) => validateSchema(itemSchema, item, `${path}[${index}]`))
  }
  if (expectedType && schemaType(input) !== expectedType) {
    return [`${path} must be a ${expectedType}`]
  }
  return []
}

function toolDefinitions(tools: readonly ToolDef[]): CodingAgentToolDefinition[] {
  return tools.map((tool) => ({ name: tool.id, description: tool.description, inputSchema: tool.schema }))
}

function errorResult(toolName: string, message: string, metadata: Record<string, unknown> = {}): CodingAgentToolResult {
  return {
    toolName,
    output: message,
    isError: true,
    metadata,
  }
}

async function logAudit(ctx: ToolContext, entry: ToolAuditEntry): Promise<void> {
  await ctx.audit.log(entry)
}

function createAuditEntry(
  toolId: string,
  input: CodingAgentToolInput,
  permission: ToolPermissionDecision,
  extras: Partial<ToolAuditEntry>,
): ToolAuditEntry {
  return {
    toolId,
    arguments: redactArguments(input),
    normalizedPaths: extras.normalizedPaths ?? [],
    permission,
    filesRead: extras.filesRead ?? [],
    filesWritten: extras.filesWritten ?? [],
    command: extras.command,
    exitCode: extras.exitCode,
    error: extras.error,
    durationMs: extras.durationMs ?? 0,
    truncated: extras.truncated ?? false,
    timestamp: new Date().toISOString(),
  }
}

function validateToolInput(tool: ToolDef, input: CodingAgentToolInput): string[] {
  return validateSchema(tool.schema, input)
}

async function authorizeToolCall(tool: ToolDef, ctx: ToolContext): Promise<ToolPermissionDecision> {
  return ctx.permissions.checkTool(tool.id, ctx)
}

async function authorizePathIntents(tool: ToolDef, input: CodingAgentToolInput, ctx: ToolContext): Promise<{
  permission: ToolPermissionDecision | null
  normalizedPaths: string[]
  filesRead: string[]
  filesWritten: string[]
}> {
  const normalizedPaths: string[] = []
  const filesRead: string[] = []
  const filesWritten: string[] = []
  const pathIntents = tool.getPathIntents ? await tool.getPathIntents(input, ctx) : []
  for (const intent of pathIntents) {
    const decision = await ctx.permissions.checkPath(intent.action, intent.path, ctx)
    normalizedPaths.push(intent.path)
    if (!decision.allowed) {
      return { permission: decision, normalizedPaths, filesRead, filesWritten }
    }
    if (intent.action === "read" || intent.action === "list" || intent.action === "stat") {
      filesRead.push(intent.path)
    }
    if (intent.action === "write" || intent.action === "delete") {
      filesWritten.push(intent.path)
    }
  }
  return { permission: null, normalizedPaths, filesRead, filesWritten }
}

async function executeWithLogging(
  tool: ToolDef,
  input: CodingAgentToolInput,
  ctx: ToolContext,
): Promise<CodingAgentToolResult> {
  const startedAt = Date.now()
  const basePermission = await authorizeToolCall(tool, ctx)

  if (!basePermission.allowed) {
    const durationMs = Date.now() - startedAt
    await logAudit(ctx, createAuditEntry(tool.id, input, basePermission, { durationMs }))
    return errorResult(tool.id, `Permission denied for ${tool.id}: ${basePermission.reason}`, { permission: basePermission })
  }

  const validationErrors = validateToolInput(tool, input)
  if (validationErrors.length > 0) {
    const durationMs = Date.now() - startedAt
    await logAudit(ctx, createAuditEntry(tool.id, input, basePermission, { error: validationErrors.join("; "), durationMs }))
    return errorResult(tool.id, `Invalid arguments for ${tool.id}: ${validationErrors.join("; ")}`)
  }

  try {
    const pathAuthorization = await authorizePathIntents(tool, input, ctx)
    if (pathAuthorization.permission) {
      const durationMs = Date.now() - startedAt
      await logAudit(ctx, createAuditEntry(tool.id, input, pathAuthorization.permission, {
        normalizedPaths: pathAuthorization.normalizedPaths,
        filesRead: pathAuthorization.filesRead,
        filesWritten: pathAuthorization.filesWritten,
        durationMs,
      }))
      return errorResult(tool.id, `Permission denied for ${tool.id}: ${pathAuthorization.permission.reason}`, { permission: pathAuthorization.permission })
    }

    const result = await tool.execute(input, ctx)
    const durationMs = Date.now() - startedAt
    const metadata = isRecord(result.metadata) ? result.metadata : {}
    await logAudit(ctx, createAuditEntry(tool.id, input, basePermission, {
      normalizedPaths: pathAuthorization.normalizedPaths,
      filesRead: pathAuthorization.filesRead,
      filesWritten: pathAuthorization.filesWritten,
      command: typeof metadata.command === "string" ? metadata.command : undefined,
      exitCode: typeof metadata.exitCode === "number" || metadata.exitCode === null ? (metadata.exitCode as number | null) : undefined,
      durationMs,
      truncated: Boolean(metadata.truncated),
    }))
    return {
      toolName: tool.id,
      output: result.text,
      metadata: { ...metadata, durationMs },
    }
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const message = error instanceof Error ? error.message : String(error)
    await logAudit(ctx, createAuditEntry(tool.id, input, basePermission, { error: message, durationMs }))
    return errorResult(tool.id, `Tool ${tool.id} failed: ${message}`, { durationMs })
  }
}

export class ToolRegistry {
  private readonly toolsById: Map<string, ToolDef>

  constructor(private readonly tools: readonly ToolDef[], private readonly ctx: ToolContext) {
    this.toolsById = new Map(tools.map((tool) => [tool.id, tool]))
  }

  listTools(): CodingAgentToolDefinition[] {
    return toolDefinitions(this.tools)
  }

  async runTool(call: CodingAgentToolCall): Promise<CodingAgentToolResult> {
    const tool = this.toolsById.get(call.toolName)
    if (!tool) {
      return errorResult(call.toolName, `Unknown tool: ${call.toolName}`)
    }
    return executeWithLogging(tool, call.input, this.ctx)
  }

  toExecutor(): CodingAgentToolExecutor {
    return {
      listTools: () => this.listTools(),
      runTool: (call) => this.runTool(call),
    }
  }

  toLegacyTools(): CodingAgentTool[] {
    return this.tools.map((tool) => ({
      name: tool.id,
      description: tool.description,
      inputSchema: tool.schema,
      run: async (input) => this.runTool({ toolName: tool.id, input }),
    }))
  }
}

export function createToolRegistry(tools: readonly ToolDef[], ctx: ToolContext): ToolRegistry {
  return new ToolRegistry(tools, ctx)
}
