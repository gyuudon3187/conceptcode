export type ChatRole = "user" | "assistant"

export type ChatMessageStatus = "streaming" | "complete" | "error"

export type PromptMessage<TMode extends string = string, TProvider extends string = string> = {
  id?: string
  text: string
  role: ChatRole
  createdAt?: string
  mode?: TMode
  status?: ChatMessageStatus
  provider?: TProvider
}

export type ChatSession<
  TMode extends string = string,
  TMessage extends PromptMessage<TMode> = PromptMessage<TMode>,
  TSessionFields extends object = {},
> = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  draftPromptText: string
  lastMode: TMode
  messages: TMessage[]
} & TSessionFields

export type ChatSessionSummary<TMode extends string = string, TSummaryFields extends object = {}> = {
  id: string
  title: string
  updatedAt: string
  messageCount: number
  lastMode: TMode
} & TSummaryFields

export type SessionStoreIndex<
  TMode extends string = string,
  TSummaryFields extends object = {},
  TIndexFields extends object = {},
> = {
  schemaVersion: 1
  activeSessionId: string | null
  sessions: Array<ChatSessionSummary<TMode, TSummaryFields>>
} & TIndexFields

export type ChatTurnMessage = {
  role: ChatRole
  text: string
}

export type ChatStreamEvent =
  | { type: "response.created"; responseId: string; messageId: string; role: "assistant"; provider: string }
  | { type: "response.output_text.delta"; responseId: string; messageId: string; delta: string }
  | { type: "response.completed"; responseId: string; messageId: string }
  | { type: "response.error"; responseId: string; messageId: string; error: string }

export type ChatTurnRequest<TAgentId extends string = string, TMessage extends ChatTurnMessage = ChatTurnMessage> = {
  messages: TMessage[]
  primaryAgentId: TAgentId
}

export type ChatTransport<
  TAgentId extends string = string,
  TMessage extends ChatTurnMessage = ChatTurnMessage,
  TEvent extends ChatStreamEvent = ChatStreamEvent,
> = {
  streamTurn: (request: ChatTurnRequest<TAgentId, TMessage>) => AsyncIterable<TEvent>
}

export function latestUserText<TMessage extends { role: string; text: string }>(messages: TMessage[]): string {
  return [...messages].reverse().find((message) => message.role === "user")?.text.trim() ?? ""
}
