import type { ResolvedScopedContext } from "./context-files"
import { renderScopedContextBlock } from "./context-files"
import { applyPrimaryAgentToMessages, type CodingAgentPrimaryAgent } from "./primary-agents"
import type { CodingAgentMessage } from "./types"

export type UserAssistantTextMessage = {
  role: "user" | "assistant"
  text: string
}

type BuildCodingAgentMessagesInput = {
  messages: UserAssistantTextMessage[]
  primaryAgent?: CodingAgentPrimaryAgent
  scopedContext?: ResolvedScopedContext | null
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

export function toCodingAgentMessages(input: BuildCodingAgentMessagesInput): CodingAgentMessage[] {
  const messages = input.messages.map((message) => ({
    role: message.role,
    content: message.text,
  }))
  const contextBlock = input.scopedContext ? renderScopedContextBlock(input.scopedContext) : ""
  const contextualMessages = injectScopedContext(messages, contextBlock)
  return input.primaryAgent ? applyPrimaryAgentToMessages(contextualMessages, input.primaryAgent) : contextualMessages
}
