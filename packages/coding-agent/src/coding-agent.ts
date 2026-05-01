import { createFileChatSessionStore, latestUserText, type PromptMessage } from "agent-chat"
import { randomUUID } from "node:crypto"
import { resolve } from "node:path"

import { toCodingAgentMessages, type UserAssistantTextMessage } from "./chat-messages"
import type { ResolvedScopedContext } from "./context-files"
import { createHostStreamingCodingAgentModel } from "./host-adapter"
import { BUILD_PRIMARY_AGENT, PLAN_PRIMARY_AGENT, type CodingAgentPrimaryAgent } from "./primary-agents"
import type { CodingAgentMessage, CodingAgentResponseChunk, CodingAgentStreamingModel } from "./types"

export type CodingAgentSessionMessage<TAgentId extends string = string> = PromptMessage<TAgentId, string>

export type PrepareCodingAgentTurnInput<TAgentId extends string = string> = {
  prompt: string
  primaryAgentId: TAgentId
  messages: UserAssistantTextMessage[]
  sessionId?: string
}

export type PreparedCodingAgentTurn<TAgentId extends string = string> = {
  primaryAgentId?: TAgentId
  scopedContext?: ResolvedScopedContext | null
  systemPrompt?: string
}

export type StreamCodingAgentInput<TAgentId extends string = string> = {
  prompt?: string
  sessionId?: string
  primaryAgentId?: TAgentId
  messages?: UserAssistantTextMessage[]
}

export type StreamCodingAgentResult = {
  sessionId: string
  events: AsyncIterable<CodingAgentResponseChunk>
}

export type RunCodingAgentResult = {
  sessionId: string
  finalMessage: string
}

export type CreateAgentFactoryOptions<TAgentId extends string = string> = {
  workspaceRoot?: string
  cwd?: string
  storageNamespace?: string
  modelFactory?: () => Promise<CodingAgentStreamingModel>
  primaryAgents?: CodingAgentPrimaryAgent[]
  prepareTurn?: (input: PrepareCodingAgentTurnInput<TAgentId>) => Promise<PreparedCodingAgentTurn<TAgentId>> | PreparedCodingAgentTurn<TAgentId>
}

export type CreateCodingAgentOptions<TAgentId extends string = string> = {
  defaultPrimaryAgentId: TAgentId
  sessionBucketKey?: string
  systemPrompt?: string
}

export type CreateConfiguredCodingAgentOptions<TAgentId extends string = string> = CreateAgentFactoryOptions<TAgentId> & CreateCodingAgentOptions<TAgentId>

export type CodingAgentInstance<TAgentId extends string = string> = {
  stream: (input: StreamCodingAgentInput<TAgentId> | string, maybeSessionId?: string) => Promise<StreamCodingAgentResult>
  run: (input: StreamCodingAgentInput<TAgentId> | string, maybeSessionId?: string) => Promise<RunCodingAgentResult>
}

export type CodingAgentFactory<TAgentId extends string = string> = {
  createCodingAgent: (options: CreateCodingAgentOptions<TAgentId>) => CodingAgentInstance<TAgentId>
}

type StoredSession<TAgentId extends string> = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  draftPromptText: string
  lastMode: TAgentId
  messages: CodingAgentSessionMessage<TAgentId>[]
}

function createDraftMessage<TAgentId extends string>(): CodingAgentSessionMessage<TAgentId> {
  return { text: "", role: "user", status: "complete" }
}

function committedMessages<TAgentId extends string>(messages: CodingAgentSessionMessage<TAgentId>[]): UserAssistantTextMessage[] {
  return messages
    .filter((message) => (message.role === "user" || message.role === "assistant") && message.text.trim().length > 0)
    .map((message) => ({ role: message.role, text: message.text }))
}

function buildModelMessages<TAgentId extends string>(
  messages: UserAssistantTextMessage[],
  prepared: PreparedCodingAgentTurn<TAgentId>,
  primaryAgent: CodingAgentPrimaryAgent | undefined,
  systemPrompt: string | undefined,
): CodingAgentMessage[] {
  const codingMessages = toCodingAgentMessages({
    messages,
    primaryAgent,
    scopedContext: prepared.scopedContext ?? undefined,
  })
  const combinedSystemPrompt = [systemPrompt?.trim(), prepared.systemPrompt?.trim()].filter(Boolean).join("\n\n")
  return combinedSystemPrompt ? [{ role: "system", content: combinedSystemPrompt }, ...codingMessages] : codingMessages
}

function createPrimaryAgentRegistry<TAgentId extends string>(primaryAgents: CodingAgentPrimaryAgent[]): Map<TAgentId, CodingAgentPrimaryAgent> {
  return new Map(primaryAgents.map((agent) => [agent.id as TAgentId, agent]))
}

function resolvePrimaryAgent<TAgentId extends string>(
  registry: Map<TAgentId, CodingAgentPrimaryAgent>,
  primaryAgentId: TAgentId,
): CodingAgentPrimaryAgent | undefined {
  return registry.get(primaryAgentId)
}

function submittedPrompt(input: StreamCodingAgentInput<string>): string {
  if (typeof input.prompt === "string" && input.prompt.trim()) {
    return input.prompt.trim()
  }
  return latestUserText(input.messages ?? [])
}

function sessionAssistantMessage<TAgentId extends string>(session: StoredSession<TAgentId>, messageId: string) {
  return session.messages.find((message) => message.id === messageId && message.role === "assistant")
}

function appendPromptToSession<TAgentId extends string>(session: StoredSession<TAgentId>, prompt: string, primaryAgentId: TAgentId): void {
  const submittedAt = new Date().toISOString()
  const userMessageId = `msg_${randomUUID()}`
  const assistantMessageId = `msg_${randomUUID()}`
  const draftMessageId = `msg_${randomUUID()}`
  const lastMessage = session.messages.at(-1)
  const draftIndex = lastMessage?.role === "user" && !lastMessage.id ? session.messages.length - 1 : session.messages.length
  if (draftIndex === session.messages.length) {
    session.messages.push(createDraftMessage())
  }
  session.messages[draftIndex] = {
    id: userMessageId,
    text: prompt,
    role: "user",
    createdAt: submittedAt,
    mode: primaryAgentId,
    status: "complete",
  }
  session.messages = [
    ...session.messages.slice(0, draftIndex + 1),
    { id: assistantMessageId, text: "", role: "assistant", createdAt: submittedAt, status: "streaming", provider: "coding-agent" },
    { id: draftMessageId, text: "", role: "user", status: "complete" },
  ]
  session.draftPromptText = ""
  session.lastMode = primaryAgentId
}

async function collectEvents(events: AsyncIterable<CodingAgentResponseChunk>): Promise<string> {
  let finalMessage = ""
  for await (const event of events) {
    if (event.type === "response.output_text.delta") {
      finalMessage += event.delta
      continue
    }
    if (event.type === "response.error") {
      throw new Error(event.error)
    }
  }
  return finalMessage
}

export function createAgentFactory<TAgentId extends string = string>(options: CreateAgentFactoryOptions<TAgentId>): CodingAgentFactory<TAgentId> {
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd())
  const cwd = resolve(options.cwd ?? workspaceRoot)
  const storageNamespace = options.storageNamespace ?? "coding-agent"
  const modelFactory = options.modelFactory ?? (() => createHostStreamingCodingAgentModel({ workspaceRoot, cwd }))
  const prepareTurn = options.prepareTurn ?? (() => ({}) as PreparedCodingAgentTurn<TAgentId>)
  const primaryAgentRegistry = createPrimaryAgentRegistry<TAgentId>([
    PLAN_PRIMARY_AGENT,
    BUILD_PRIMARY_AGENT,
    ...(options.primaryAgents ?? []),
  ])
  const sessionStore = createFileChatSessionStore<TAgentId, CodingAgentSessionMessage<TAgentId>, {}, {}, {}>({
    storageNamespace,
    createDraftMessage,
    createSessionFields: () => ({}),
    createIndexFields: () => ({}),
  })

  return {
    createCodingAgent(agentOptions) {
      const bucketKey = resolve(agentOptions.sessionBucketKey ?? workspaceRoot)
      async function loadSession(primaryAgentId: TAgentId, sessionId?: string): Promise<{ session: StoredSession<TAgentId>; sessions: StoredSession<TAgentId>[] }> {
        const { sessions, activeSessionId } = await sessionStore.loadSessions(bucketKey, primaryAgentId)
        if (!sessionId) {
          const session = sessionStore.activeSession({ sessions, activeSessionId })
          return { session, sessions }
        }
        const session = sessions.find((candidate) => candidate.id === sessionId)
        if (!session) {
          throw new Error(`Unknown coding-agent session: ${sessionId}`)
        }
        return { session, sessions }
      }

      async function saveSession(session: StoredSession<TAgentId>, sessions: StoredSession<TAgentId>[]): Promise<void> {
        await sessionStore.saveSessions(bucketKey, sessions, session.id)
      }

      async function stream(input: StreamCodingAgentInput<TAgentId> | string, maybeSessionId?: string): Promise<StreamCodingAgentResult> {
        const normalizedInput = typeof input === "string" ? { prompt: input, sessionId: maybeSessionId } : input
        const primaryAgentId = normalizedInput.primaryAgentId ?? agentOptions.defaultPrimaryAgentId
        const prompt = submittedPrompt(normalizedInput)
        if (!prompt) {
          throw new Error("Coding agent run requires a non-empty prompt")
        }

        const persisted = !normalizedInput.messages
        const loaded = persisted ? await loadSession(primaryAgentId, normalizedInput.sessionId) : null
        const session = loaded?.session
        const sessions = loaded?.sessions

        if (session && sessions) {
          appendPromptToSession(session, prompt, primaryAgentId)
          await saveSession(session, sessions)
        }

        const conversationMessages = session ? committedMessages(session.messages) : (normalizedInput.messages ?? [{ role: "user", text: prompt }])
        const prepared = await prepareTurn({
          prompt,
          primaryAgentId,
          messages: conversationMessages,
          sessionId: session?.id ?? normalizedInput.sessionId,
        })
        const resolvedPrimaryAgentId = prepared.primaryAgentId ?? primaryAgentId
        const modelMessages = buildModelMessages(
          conversationMessages,
          prepared,
          resolvePrimaryAgent(primaryAgentRegistry, resolvedPrimaryAgentId),
          agentOptions.systemPrompt,
        )
        const model = await modelFactory()
        const events = model.run(modelMessages)

        if (!session || !sessions) {
          return {
            sessionId: normalizedInput.sessionId ?? `session_${randomUUID()}`,
            events,
          }
        }

        const wrappedEvents = (async function* (): AsyncIterable<CodingAgentResponseChunk> {
          for await (const event of events) {
            if (event.type === "response.created") {
              const assistantMessage = sessionAssistantMessage(session, event.messageId) ?? session.messages.find((message) => message.role === "assistant" && message.status === "streaming")
              if (assistantMessage) {
                assistantMessage.id = event.messageId
                assistantMessage.provider = event.provider
                assistantMessage.status = "streaming"
              }
              await saveSession(session, sessions)
            } else if (event.type === "response.output_text.delta") {
              const assistantMessage = sessionAssistantMessage(session, event.messageId)
              if (assistantMessage) {
                assistantMessage.text = `${assistantMessage.text}${event.delta}`
                assistantMessage.status = "streaming"
              }
            } else if (event.type === "response.completed") {
              const assistantMessage = sessionAssistantMessage(session, event.messageId)
              if (assistantMessage) {
                assistantMessage.status = "complete"
              }
              await saveSession(session, sessions)
            } else if (event.type === "response.error") {
              const assistantMessage = sessionAssistantMessage(session, event.messageId)
              if (assistantMessage) {
                assistantMessage.text = assistantMessage.text || `Error: ${event.error}`
                assistantMessage.status = "error"
              }
              await saveSession(session, sessions)
            }
            yield event
          }
        })()

        return { sessionId: session.id, events: wrappedEvents }
      }

      async function run(input: StreamCodingAgentInput<TAgentId> | string, maybeSessionId?: string): Promise<RunCodingAgentResult> {
        const result = await stream(input, maybeSessionId)
        return {
          sessionId: result.sessionId,
          finalMessage: await collectEvents(result.events),
        }
      }

      return { stream, run }
    },
  }
}

export function createCodingAgent<TAgentId extends string = string>(options: CreateConfiguredCodingAgentOptions<TAgentId>): CodingAgentInstance<TAgentId> {
  const factory = createAgentFactory<TAgentId>(options)
  return factory.createCodingAgent(options)
}
