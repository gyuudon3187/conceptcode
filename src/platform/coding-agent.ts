import {
  applyPrimaryAgentToMessages,
  BUILD_PRIMARY_AGENT,
  createLocalFileSystemBackend,
  createHostStreamingCodingAgentModel,
  definePrimaryAgent,
  PLAN_PRIMARY_AGENT,
  renderScopedContextBlock,
  resolveScopedContextFiles,
  type CodingAgentMessage,
  type CodingAgentPrimaryAgent,
  type CodingAgentStreamingModel,
} from "coding-agent"
import { resolve } from "node:path"

import type { ChatStreamEvent, ChatTransport, ChatTurnRequest } from "../core/types"

const CONCEPTUALIZE_PRIMARY_AGENT = definePrimaryAgent({
  id: "conceptualize",
  instructions: [
    "Focus on concept-graph structure and metadata updates.",
    "Prefer graph-oriented changes and avoid unrelated source-code edits unless the user explicitly asks for them.",
  ],
})

function primaryAgentForId(primaryAgentId: ChatTurnRequest["primaryAgentId"]): CodingAgentPrimaryAgent {
  if (primaryAgentId === "plan") return PLAN_PRIMARY_AGENT
  if (primaryAgentId === "build") return BUILD_PRIMARY_AGENT
  return CONCEPTUALIZE_PRIMARY_AGENT
}

function latestUserText(messages: Array<{ role: "user" | "assistant"; text: string }>): string {
  return [...messages].reverse().find((message) => message.role === "user")?.text.trim() ?? ""
}

function referencedFilePaths(text: string): string[] {
  return [...new Set([...text.matchAll(/&([^\s@&]+)/g)].map((match) => match[1]).filter(Boolean))]
}

type CodingAgentChatTransportOptions = {
  modelFactory?: () => Promise<CodingAgentStreamingModel>
  workspaceRoot?: string
  cwd?: string
}

async function scopedContextForRequest(request: ChatTurnRequest, workspaceRoot: string, cwd: string) {
  return resolveScopedContextFiles({
    workspaceRoot,
    cwd,
    activePaths: referencedFilePaths(latestUserText(request.messages)),
    fs: createLocalFileSystemBackend(),
  })
}

async function scopedContextBlockForRequest(request: ChatTurnRequest, workspaceRoot: string, cwd: string): Promise<string> {
  const context = await scopedContextForRequest(request, workspaceRoot, cwd)
  return renderScopedContextBlock(context)
}

function isMemoryCommand(text: string): boolean {
  return /^\/memory(?:\s+.*)?$/i.test(text.trim())
}

function renderMemoryResponse(request: ChatTurnRequest, context: Awaited<ReturnType<typeof scopedContextForRequest>>, cwd: string, workspaceRoot: string): string {
  const lines = [
    "Scoped context memory for this coding-agent run.",
    `Workspace root: ${workspaceRoot}`,
    `Current working directory: ${cwd}`,
  ]

  const activePaths = referencedFilePaths(latestUserText(request.messages))
  lines.push(activePaths.length > 0 ? `Active file references: ${activePaths.join(", ")}` : "Active file references: none")

  if (context.eagerFiles.length > 0) {
    lines.push("", "Loaded context files:")
    for (const file of context.eagerFiles) {
      lines.push(`- ${file.path}`)
    }
  } else {
    lines.push("", "Loaded context files: none")
  }

  if (context.lazyFiles.length > 0) {
    lines.push("", "Available lazy context files:")
    for (const file of context.lazyFiles) {
      lines.push(`- ${file.path}: ${file.description}`)
    }
  } else {
    lines.push("", "Available lazy context files: none")
  }

  return `${lines.join("\n").trim()}\n`
}

async function* streamSyntheticResponse(text: string, provider: string): AsyncIterable<ChatStreamEvent> {
  const responseId = `resp_${crypto.randomUUID()}`
  const messageId = `msg_${crypto.randomUUID()}`
  yield { type: "response.created", responseId, messageId, role: "assistant", provider }
  const chunks = text.match(/\S+\s*/g) ?? [text]
  for (const chunk of chunks) {
    yield { type: "response.output_text.delta", responseId, messageId, delta: chunk }
  }
  yield { type: "response.completed", responseId, messageId }
}

function injectScopedContext(messages: CodingAgentMessage[], contextBlock: string): CodingAgentMessage[] {
  if (!contextBlock) return messages
  const latestUserIndex = messages.map((message) => message.role).lastIndexOf("user")
  return messages.map((message, index) => ({
    role: message.role,
    content: message.role === "user" && index === latestUserIndex
      ? `${contextBlock}\n\n[USER REQUEST]\n\n${message.content}`
      : message.content,
  }))
}

async function toCodingAgentMessages(request: ChatTurnRequest, workspaceRoot: string, cwd: string): Promise<CodingAgentMessage[]> {
  const messages = request.messages.map((message) => ({
    role: message.role,
    content: message.text,
  }))
  const contextBlock = await scopedContextBlockForRequest(request, workspaceRoot, cwd)
  return applyPrimaryAgentToMessages(injectScopedContext(messages, contextBlock), primaryAgentForId(request.primaryAgentId))
}

export function createCodingAgentChatTransport(options: CodingAgentChatTransportOptions | (() => Promise<CodingAgentStreamingModel>) = {}): ChatTransport {
  const resolvedOptions = typeof options === "function" ? { modelFactory: options } : options
  const workspaceRoot = resolve(resolvedOptions.workspaceRoot ?? process.cwd())
  const cwd = resolve(resolvedOptions.cwd ?? workspaceRoot)
  const modelFactory = resolvedOptions.modelFactory ?? (() => createHostStreamingCodingAgentModel({ workspaceRoot, cwd }))
  return {
    async *streamTurn(request: ChatTurnRequest): AsyncIterable<ChatStreamEvent> {
      const latestPrompt = latestUserText(request.messages)
      if (isMemoryCommand(latestPrompt)) {
        const context = await scopedContextForRequest(request, workspaceRoot, cwd)
        yield *streamSyntheticResponse(renderMemoryResponse(request, context, cwd, workspaceRoot), "coding-agent-memory")
        return
      }
      const messages = await toCodingAgentMessages(request, workspaceRoot, cwd)
      const model = await modelFactory()
      for await (const event of model.run(messages)) {
        if (event.type === "response.created") {
          yield { type: event.type, responseId: event.responseId, messageId: event.messageId, role: "assistant", provider: event.provider }
          continue
        }
        if (event.type === "response.output_text.delta") {
          yield event
          continue
        }
        if (event.type === "response.completed") {
          yield event
          continue
        }
        yield event
      }
    },
  }
}
