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
    const registry = new Map(tools.map((tool) => [isToolDef(tool) ? tool.id : tool.name, tool]))
    return {
      listTools() {
        return tools.map((tool) => ({
          name: isToolDef(tool) ? tool.id : tool.name,
          description: tool.description,
          inputSchema: isToolDef(tool) ? tool.schema : tool.inputSchema,
        }))
      },
      async runTool(call) {
        const tool = registry.get(call.toolName)
        if (!tool) {
          return { toolName: call.toolName, output: `Unknown tool: ${call.toolName}`, isError: true }
        }
        if (isToolDef(tool)) {
          const result = await tool.execute(call.input, {
            workspaceRoot: ".",
            cwd: ".",
            fs: undefined as never,
            permissions: undefined as never,
            audit: { log() {} },
            environment: {},
            mode: "autonomous",
            limits: {
              fileLinesDefault: 250,
              fileLinesMax: 2000,
              dirEntriesDefault: 200,
              dirEntriesMax: 2000,
              searchResultsDefault: 200,
              searchResultsMax: 2000,
              shellBytesDefault: 16_000,
              shellBytesMax: 64_000,
              treeEntriesDefault: 200,
              treeEntriesMax: 2_000,
            },
          })
          return { toolName: tool.id, output: result.text, metadata: result.metadata }
        }
        return tool.run(call.input)
      },
    }
  }

  const normalized = tools.map((tool) => (isToolDef(tool) ? tool : fromLegacyTool(tool)))
  return createToolRegistry(normalized, ctx).toExecutor()
}

export { ToolRegistry, createToolRegistry }
