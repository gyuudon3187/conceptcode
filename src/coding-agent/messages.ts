import {
  applyPrimaryAgentToMessages,
  renderScopedContextBlock,
  type CodingAgentMessage,
} from "coding-agent"

import type { ChatTurnRequest } from "../core/types"
import type { RequestScopedContext } from "./context"
import { primaryAgentForMode } from "./policy"

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

export function toCodingAgentMessages(request: ChatTurnRequest, context: RequestScopedContext): CodingAgentMessage[] {
  const messages = request.messages.map((message) => ({
    role: message.role,
    content: message.text,
  }))
  const contextBlock = renderScopedContextBlock(context.scopedContext)
  return applyPrimaryAgentToMessages(injectScopedContext(messages, contextBlock), primaryAgentForMode(request.primaryAgentId))
}
