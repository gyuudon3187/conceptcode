import { ToolRegistry, createToolRegistry } from "./tool-registry"
import type { CodingAgentTool, CodingAgentToolExecutor, ToolContext, ToolDef } from "./types"

function isToolDef(value: CodingAgentTool | ToolDef): value is ToolDef {
  return typeof (value as ToolDef).execute === "function"
}

function fromLegacyTool(tool: CodingAgentTool): ToolDef {
  return {
    id: tool.name,
    description: tool.description,
    schema: tool.inputSchema ?? { type: "object" },
    async execute(input) {
      const result = await tool.run(input)
      return {
        text: result.output,
        metadata: { ...(result.metadata ?? {}), legacy: true },
      }
    },
  }
}

export function createToolExecutor(tools: readonly ToolDef[] | readonly CodingAgentTool[], ctx?: ToolContext): CodingAgentToolExecutor {
  if (!ctx) {
    if (tools.some((tool) => isToolDef(tool))) {
      throw new Error("createToolExecutor requires a ToolContext when registering ToolDef instances")
    }
    const legacyTools = tools as readonly CodingAgentTool[]
    const registry = new Map(legacyTools.map((tool) => [tool.name, tool]))
    return {
      listTools() {
        return legacyTools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        }))
      },
      async runTool(call) {
        const tool = registry.get(call.toolName)
        if (!tool) {
          return { toolName: call.toolName, output: `Unknown tool: ${call.toolName}`, isError: true }
        }
        return tool.run(call.input)
      },
    }
  }

  const normalized = tools.map((tool) => (isToolDef(tool) ? tool : fromLegacyTool(tool)))
  return createToolRegistry(normalized, ctx).toExecutor()
}

export { ToolRegistry, createToolRegistry }
