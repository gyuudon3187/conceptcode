import {
  createHostStreamingCodingAgentModel,
  toCodingAgentMessages,
  type CodingAgentResponseChunk,
  type CodingAgentStreamingModel,
} from "coding-agent"
import type { ChatStreamEvent, ChatTransport, ChatTurnRequest } from "agent-chat"
import { resolve } from "node:path"

import type { UiMode } from "../core/types"
import { resolveRequestScopedContext, type RequestScopedContext } from "../coding-agent/context"
import { primaryAgentForMode } from "../coding-agent/policy"

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

async function* streamModelTurn(request: ChatTurnRequest<UiMode>, context: RequestScopedContext, modelFactory: () => Promise<CodingAgentStreamingModel>): AsyncIterable<ChatStreamEvent> {
  const model = await modelFactory()
  yield *streamCodingAgentEvents(model.run(toCodingAgentMessages({
    messages: request.messages,
    scopedContext: context.scopedContext,
    primaryAgent: primaryAgentForMode(request.primaryAgentId),
  })))
}

export function createCodingAgentChatTransport(options: CodingAgentChatTransportOptions | (() => Promise<CodingAgentStreamingModel>) = {}): ChatTransport<UiMode> {
  const resolvedOptions = typeof options === "function" ? { modelFactory: options } : options
  const workspaceRoot = resolve(resolvedOptions.workspaceRoot ?? process.cwd())
  const cwd = resolve(resolvedOptions.cwd ?? workspaceRoot)
  const modelFactory = resolvedOptions.modelFactory ?? (() => createHostStreamingCodingAgentModel({ workspaceRoot, cwd }))
  return {
    async *streamTurn(request: ChatTurnRequest<UiMode>): AsyncIterable<ChatStreamEvent> {
      const context = await resolveRequestScopedContext(request, workspaceRoot, cwd)
      yield *streamModelTurn(request, context, modelFactory)
    },
  }
}
