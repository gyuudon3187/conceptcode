import type {
  CodingAgentTool,
  CodingAgentToolCall,
  CodingAgentToolDefinition,
  CodingAgentToolExecutor,
  CodingAgentToolResult,
} from "./types"

function toolMap(tools: CodingAgentTool[]): Map<string, CodingAgentTool> {
  return new Map(tools.map((tool) => [tool.name, tool]))
}

function toolDefinitions(tools: CodingAgentTool[]): CodingAgentToolDefinition[] {
  return tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
}

export function createToolExecutor(tools: CodingAgentTool[]): CodingAgentToolExecutor {
  const toolsByName = toolMap(tools)

  return {
    listTools() {
      return toolDefinitions(tools)
    },
    async runTool(call: CodingAgentToolCall): Promise<CodingAgentToolResult> {
      const tool = toolsByName.get(call.toolName)
      if (!tool) {
        return {
          toolName: call.toolName,
          output: `Unknown tool: ${call.toolName}`,
          isError: true,
        }
      }
      return tool.run(call.input)
    },
  }
}
