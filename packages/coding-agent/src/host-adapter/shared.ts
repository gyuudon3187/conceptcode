import type {
  CodingAgentMessage,
  CodingAgentModel,
  CodingAgentModelTurn,
  CodingAgentToolDefinition,
  CodingAgentToolCall,
} from "../types"

export function latestUserPrompt(messages: CodingAgentMessage[]): string {
  return [...messages].reverse().find((message) => message.role === "user")?.content.trim() ?? ""
}

function latestToolMessage(messages: CodingAgentMessage[]): CodingAgentMessage | null {
  return [...messages].reverse().find((message) => message.role === "tool") ?? null
}

function latestAssistantMessage(messages: CodingAgentMessage[]): CodingAgentMessage | null {
  return [...messages].reverse().find((message) => message.role === "assistant") ?? null
}

function extractQuotedValues(prompt: string): string[] {
  return [...prompt.matchAll(/"([^"]+)"|'([^']+)'/g)].map((match) => match[1] ?? match[2]).filter(Boolean)
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createCapabilitySummary(tools: CodingAgentToolDefinition[], os: NodeJS.Platform): string {
  if (tools.length === 0) {
    return `No host tools are available for ${os}.`
  }
  return `Available host tools on ${os}: ${tools.map((tool) => tool.name).join(", ")}.`
}

function chooseToolCall(prompt: string, tools: CodingAgentToolDefinition[]): CodingAgentToolCall | null {
  const normalizedPrompt = prompt.trim()
  if (!normalizedPrompt) {
    return null
  }

  const availableTools = new Set(tools.map((tool) => tool.name))
  const quotedValues = extractQuotedValues(normalizedPrompt)
  const firstQuotedValue = quotedValues[0]

  if (availableTools.has("edit_file") && /\bedit\b|\breplace\b|\bchange\b|\bpatch\b/i.test(normalizedPrompt) && quotedValues.length >= 3) {
    return { toolName: "edit_file", input: { path: quotedValues[0], old: quotedValues[1], new: quotedValues[2] } }
  }
  if (availableTools.has("read_file") && /\bread\b|\bopen\b|\bshow\b|\binspect\b/i.test(normalizedPrompt) && firstQuotedValue) {
    return { toolName: "read_file", input: { path: firstQuotedValue } }
  }
  if (availableTools.has("list_dir") && /\blist\b|\bdirectory\b|\bfolder\b/i.test(normalizedPrompt)) {
    return { toolName: "list_dir", input: { path: firstQuotedValue ?? "." } }
  }
  if (availableTools.has("glob") && /\bglob\b|\bpattern\b|\*\*/i.test(normalizedPrompt) && firstQuotedValue) {
    return { toolName: "glob", input: { pattern: firstQuotedValue } }
  }
  if (availableTools.has("grep") && /\bgrep\b|\bsearch\b|\bmatch\b/i.test(normalizedPrompt) && firstQuotedValue) {
    return { toolName: "grep", input: { pattern: firstQuotedValue } }
  }
  if (availableTools.has("shell") && /\bshell\b|\bcommand\b|\brun\b|\btest\b|\bbuild\b/i.test(normalizedPrompt)) {
    const command = firstQuotedValue ?? normalizedPrompt.replace(/^run\s+/i, "").trim()
    if (command) {
      return { toolName: "shell", input: { command } }
    }
  }

  return null
}

export function createHostStepModel(tools: CodingAgentToolDefinition[], capabilitySummary: string): CodingAgentModel {
  return {
    async complete(messages: CodingAgentMessage[]): Promise<CodingAgentModelTurn> {
      const prompt = latestUserPrompt(messages)
      const toolMessage = latestToolMessage(messages)
      const assistantMessage = latestAssistantMessage(messages)

      if (toolMessage && assistantMessage?.content.startsWith("Running tool:")) {
        return {
          message: [`Tool ${toolMessage.toolName ?? "unknown"} completed.`, toolMessage.content].join("\n"),
          toolCalls: [],
          done: true,
        }
      }

      const toolCall = chooseToolCall(prompt, tools)
      if (toolCall) {
        return { message: `Running tool: ${toolCall.toolName}`, toolCalls: [toolCall], done: false }
      }

      return {
        message: [
          "Coding-agent host runtime ready.",
          capabilitySummary,
          prompt ? `Latest prompt: ${prompt}` : "Latest prompt was empty.",
          "No tool call was inferred from the current prompt.",
          tools.length > 0
            ? 'Try explicit requests like: read "src/index.ts", list ".", edit "src/index.ts" "old" "new", grep "createToolExecutor", glob "src/**/*.ts", or run "bun test".'
            : "No host tools are currently available.",
        ].join("\n"),
        toolCalls: [],
        done: true,
      }
    },
  }
}
