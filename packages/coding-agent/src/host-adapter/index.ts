import { runReactCodingAgent } from "../react-loop"
import { createToolExecutor } from "../tool-executor"
import type {
  CodingAgentMessage,
  CodingAgentResponseChunk,
  CodingAgentStreamingModel,
  CodingAgentTool,
  CodingAgentToolExecutor,
} from "../types"
import { createEditFileTool, createReadFileTool } from "./filesystem"
import { createCapabilitySummary, createHostStepModel, delay, latestUserPrompt } from "./shared"
import { createLinuxHostTools, detectLinuxCapabilities } from "./linux"

export type CodingAgentHostOs = NodeJS.Platform

export type CodingAgentHostEnvironment = {
  workspaceRoot: string
  os?: CodingAgentHostOs
}

type HostToolCapability = "bash" | "find" | "glob"

function detectedOs(environment: CodingAgentHostEnvironment): CodingAgentHostOs {
  return environment.os ?? process.platform
}

export async function detectHostToolCapabilities(environment: CodingAgentHostEnvironment): Promise<Set<HostToolCapability>> {
  const os = detectedOs(environment)
  if (os === "linux") {
    return detectLinuxCapabilities()
  }
  return new Set()
}

export async function createHostTools(environment: CodingAgentHostEnvironment): Promise<CodingAgentTool[]> {
  const tools: CodingAgentTool[] = [
    createReadFileTool(environment),
    createEditFileTool(environment),
  ]
  if (detectedOs(environment) === "linux") {
    tools.push(...await createLinuxHostTools(environment))
  }
  return tools
}

export async function createHostToolExecutor(environment: CodingAgentHostEnvironment): Promise<CodingAgentToolExecutor> {
  return createToolExecutor(await createHostTools(environment))
}

export async function createHostStreamingCodingAgentModel(environment: CodingAgentHostEnvironment): Promise<CodingAgentStreamingModel> {
  const os = detectedOs(environment)
  const tools = await createHostTools(environment)
  const capabilitySummary = createCapabilitySummary(tools, os)
  const toolExecutor = createToolExecutor(tools)
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
          "Use available tools when the user explicitly asks to run a command, find a file, or match a glob pattern.",
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
