import {
  createHostStreamingCodingAgentModel,
  streamTextResponse,
  type CodingAgentResponseChunk,
  type CodingAgentStreamingModel,
} from "coding-agent"
import { resolve } from "node:path"

import type { ChatStreamEvent, ChatTransport, ChatTurnRequest } from "../core/types"
import { isMemoryCommand, renderMemoryResponse, resolveRequestScopedContext, type RequestScopedContext } from "../coding-agent/context"
import { toCodingAgentMessages } from "../coding-agent/messages"

type CodingAgentChatTransportOptions = {
  modelFactory?: () => Promise<CodingAgentStreamingModel>
  workspaceRoot?: string
  cwd?: string
}

function toChatStreamEvent(event: CodingAgentResponseChunk): ChatStreamEvent {
  if (event.type === "response.created") {
    return { ...event, role: "assistant" }
  }
  return event
}

async function* streamCodingAgentEvents(events: AsyncIterable<CodingAgentResponseChunk>): AsyncIterable<ChatStreamEvent> {
  for await (const event of events) {
    yield toChatStreamEvent(event)
  }
}

async function* streamMemoryTurn(context: RequestScopedContext, cwd: string, workspaceRoot: string): AsyncIterable<ChatStreamEvent> {
  yield *streamCodingAgentEvents(streamTextResponse(renderMemoryResponse(context, cwd, workspaceRoot), "coding-agent-memory"))
}

async function* streamModelTurn(request: ChatTurnRequest, context: RequestScopedContext, modelFactory: () => Promise<CodingAgentStreamingModel>): AsyncIterable<ChatStreamEvent> {
  const model = await modelFactory()
  yield *streamCodingAgentEvents(model.run(toCodingAgentMessages(request, context)))
}

export function createCodingAgentChatTransport(options: CodingAgentChatTransportOptions | (() => Promise<CodingAgentStreamingModel>) = {}): ChatTransport {
  const resolvedOptions = typeof options === "function" ? { modelFactory: options } : options
  const workspaceRoot = resolve(resolvedOptions.workspaceRoot ?? process.cwd())
  const cwd = resolve(resolvedOptions.cwd ?? workspaceRoot)
  const modelFactory = resolvedOptions.modelFactory ?? (() => createHostStreamingCodingAgentModel({ workspaceRoot, cwd }))
  return {
    async *streamTurn(request: ChatTurnRequest): AsyncIterable<ChatStreamEvent> {
      const context = await resolveRequestScopedContext(request, workspaceRoot, cwd)
      if (isMemoryCommand(context.latestPrompt)) {
        yield *streamMemoryTurn(context, cwd, workspaceRoot)
        return
      }
      yield *streamModelTurn(request, context, modelFactory)
    },
  }
}
