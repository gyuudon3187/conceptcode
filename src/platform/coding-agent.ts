import { createHostStreamingCodingAgentModel, type CodingAgentMessage, type CodingAgentStreamingModel } from "coding-agent"

import type { ChatStreamEvent, ChatTransport, ChatTurnRequest } from "../core/types"

function toCodingAgentMessages(request: ChatTurnRequest): CodingAgentMessage[] {
  return request.messages.map((message) => ({
    role: message.role,
    content: message.text,
  }))
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
