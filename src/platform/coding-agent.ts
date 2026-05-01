import {
  createAgentFactory,
  createHostStreamingCodingAgentModel,
  type CodingAgentResponseChunk,
  type CodingAgentStreamingModel,
} from "coding-agent"
import type { ChatStreamEvent, ChatTransport, ChatTurnRequest } from "agent-chat"
import { resolve } from "node:path"

import type { UiMode } from "../core/types"
import { resolvePromptScopedContext } from "../coding-agent/context"
import { CONCEPTUALIZE_PRIMARY_AGENT } from "../coding-agent/policy"

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

export function createCodingAgentChatTransport(options: CodingAgentChatTransportOptions | (() => Promise<CodingAgentStreamingModel>) = {}): ChatTransport<UiMode> {
  const resolvedOptions = typeof options === "function" ? { modelFactory: options } : options
  const workspaceRoot = resolve(resolvedOptions.workspaceRoot ?? process.cwd())
  const cwd = resolve(resolvedOptions.cwd ?? workspaceRoot)
  const modelFactory = resolvedOptions.modelFactory ?? (() => createHostStreamingCodingAgentModel({ workspaceRoot, cwd }))
  const agentFactory = createAgentFactory<UiMode>({
    workspaceRoot,
    cwd,
    modelFactory,
    primaryAgents: [CONCEPTUALIZE_PRIMARY_AGENT],
    prepareTurn: async ({ prompt, primaryAgentId }) => {
      const context = await resolvePromptScopedContext(prompt, workspaceRoot, cwd)
      return {
        primaryAgentId,
        scopedContext: context.scopedContext,
      }
    },
  })
  const agent = agentFactory.createCodingAgent({ defaultPrimaryAgentId: "plan" })
  return {
    async *streamTurn(request: ChatTurnRequest<UiMode>): AsyncIterable<ChatStreamEvent> {
      const { events } = await agent.stream({
        messages: request.messages,
        primaryAgentId: request.primaryAgentId,
      })
      yield *streamCodingAgentEvents(events)
    },
  }
}
