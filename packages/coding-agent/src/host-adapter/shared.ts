import type {
  CodingAgentMessage,
  CodingAgentModel,
  CodingAgentModelTurn,
  CodingAgentTool,
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

function extractQuotedValue(prompt: string): string | null {
  const quotedMatch = prompt.match(/"([^"]+)"|'([^']+)'/)
  return quotedMatch?.[1] ?? quotedMatch?.[2] ?? null
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createCapabilitySummary(tools: CodingAgentTool[], os: NodeJS.Platform): string {
  if (tools.length === 0) {
    return `No host tools are available for ${os}.`
  }
  return `Available host tools on ${os}: ${tools.map((tool) => tool.name).join(", ")}.`
}

function chooseToolCall(prompt: string, tools: CodingAgentTool[]): CodingAgentToolCall | null {
  const normalizedPrompt = prompt.trim()
  if (!normalizedPrompt) {
    return null
  }

  const availableTools = new Set(tools.map((tool) => tool.name))
  const quotedValue = extractQuotedValue(normalizedPrompt)

  if (availableTools.has("edit") && /\bedit\b|\breplace\b|\bchange\b|\bpatch\b/i.test(normalizedPrompt)) {
    const quotedValues = [...normalizedPrompt.matchAll(/"([^"]+)"|'([^']+)'/g)].map((match) => match[1] ?? match[2]).filter(Boolean)
    if (quotedValues.length >= 3) {
      return {
        toolName: "edit",
        input: {
          filePath: quotedValues[0],
          oldText: quotedValues[1],
          newText: quotedValues[2],
        },
      }
    }
  }

  if (availableTools.has("read_file") && /\bread\b|\bopen\b|\bshow\b|\binspect\b/i.test(normalizedPrompt) && quotedValue) {
    return { toolName: "read_file", input: { filePath: quotedValue } }
  }

  if (availableTools.has("glob") && /\bglob\b|\bpattern\b|\*\*/i.test(normalizedPrompt) && quotedValue) {
    return { toolName: "glob", input: { pattern: quotedValue } }
  }

  if (availableTools.has("find") && /\bfind\b|\blocate\b|\bwhere\b/i.test(normalizedPrompt)) {
    const nameMatch = normalizedPrompt.match(/(?:named?|called)\s+([\w.*-]+)/i)
    const namePattern = quotedValue ?? nameMatch?.[1]
    const args = namePattern ? [".", "-name", namePattern] : ["."]
    return { toolName: "find", input: { args } }
  }

  if (availableTools.has("bash") && /\bbash\b|\bshell\b|\bcommand\b|\brun\b/i.test(normalizedPrompt)) {
    const command = quotedValue ?? normalizedPrompt.replace(/^run\s+/i, "").trim()
    if (command) {
      return { toolName: "bash", input: { command } }
    }
  }

  return null
}

export function createHostStepModel(tools: CodingAgentTool[], capabilitySummary: string): CodingAgentModel {
  return {
    async complete(messages: CodingAgentMessage[]): Promise<CodingAgentModelTurn> {
      const prompt = latestUserPrompt(messages)
      const toolMessage = latestToolMessage(messages)
      const assistantMessage = latestAssistantMessage(messages)

      if (toolMessage && assistantMessage?.content.startsWith("Running tool:")) {
        return {
          message: [
            `Tool ${toolMessage.toolName ?? "unknown"} completed.`,
            toolMessage.content,
          ].join("\n"),
          toolCalls: [],
          done: true,
        }
      }

      const toolCall = chooseToolCall(prompt, tools)
      if (toolCall) {
        return {
          message: `Running tool: ${toolCall.toolName}`,
          toolCalls: [toolCall],
          done: false,
        }
      }

      return {
        message: [
          "Coding-agent host runtime ready.",
          capabilitySummary,
          prompt ? `Latest prompt: ${prompt}` : "Latest prompt was empty.",
          "No tool call was inferred from the current prompt.",
          tools.length > 0 ? `Try explicit requests like: read \"src/index.ts\", edit \"src/index.ts\" \"old text\" \"new text\", run \"pwd\", find \"package.json\", or glob \"src/**/*.ts\".` : "No host tools are currently available.",
        ].join("\n"),
        toolCalls: [],
        done: true,
      }
    },
  }
}
