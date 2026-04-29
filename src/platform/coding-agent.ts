import {
  applyPrimaryAgentToMessages,
  BUILD_PRIMARY_AGENT,
  createHostStreamingCodingAgentModel,
  definePrimaryAgent,
  PLAN_PRIMARY_AGENT,
  type CodingAgentMessage,
  type CodingAgentPrimaryAgent,
  type CodingAgentStreamingModel,
} from "coding-agent"

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

function toCodingAgentMessages(request: ChatTurnRequest): CodingAgentMessage[] {
  const messages = request.messages.map((message) => ({
    role: message.role,
    content: message.text,
  }))
  return applyPrimaryAgentToMessages(messages, primaryAgentForId(request.primaryAgentId))
}

export function createCodingAgentChatTransport(modelFactory: () => Promise<CodingAgentStreamingModel> = () => createHostStreamingCodingAgentModel({ workspaceRoot: process.cwd() })): ChatTransport {
  return {
    async *streamTurn(request: ChatTurnRequest): AsyncIterable<ChatStreamEvent> {
      const model = await modelFactory()
      for await (const event of model.run(toCodingAgentMessages(request))) {
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
