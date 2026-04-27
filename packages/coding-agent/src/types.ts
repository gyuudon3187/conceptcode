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

export type CodingAgentToolResult = {
  toolName: string
  output: string
  isError?: boolean
}

export type CodingAgentToolDefinition = {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
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
