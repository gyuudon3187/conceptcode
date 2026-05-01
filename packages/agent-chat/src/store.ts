import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises"
import { createHash, randomUUID } from "node:crypto"
import { basename, join, resolve } from "node:path"

import type { ChatSession, ChatSessionSummary, PromptMessage, SessionStoreIndex } from "./types"

const SESSION_SCHEMA_VERSION = 1

type FileChatSessionStoreOptions<
  TMode extends string,
  TMessage extends PromptMessage<TMode>,
  TSessionFields extends object,
  TSummaryFields extends object,
  TIndexFields extends object,
> = {
  storageNamespace: string
  createDraftMessage: () => TMessage
  createSessionFields: (bucketKey: string) => TSessionFields
  createSummaryFields?: (session: ChatSession<TMode, TMessage, TSessionFields>) => TSummaryFields
  createIndexFields: (bucketKey: string) => TIndexFields
  titleFromMessages?: (messages: TMessage[]) => string
}

type FileChatSessionStore<
  TMode extends string,
  TMessage extends PromptMessage<TMode>,
  TSessionFields extends object,
  TSummaryFields extends object,
  TIndexFields extends object,
> = {
  createEmptySession: (bucketKey: string, mode: TMode) => ChatSession<TMode, TMessage, TSessionFields>
  createNamedSession: (bucketKey: string, mode: TMode, baseTitle?: string) => ChatSession<TMode, TMessage, TSessionFields>
  activeSession: (state: { sessions: Array<ChatSession<TMode, TMessage, TSessionFields>>; activeSessionId: string }) => ChatSession<TMode, TMessage, TSessionFields>
  syncSessionMetadata: (session: ChatSession<TMode, TMessage, TSessionFields>) => void
  loadSessions: (bucketKey: string, defaultMode: TMode) => Promise<{ sessions: Array<ChatSession<TMode, TMessage, TSessionFields>>; activeSessionId: string }>
  saveSessions: (bucketKey: string, sessions: Array<ChatSession<TMode, TMessage, TSessionFields>>, activeSessionId: string) => Promise<void>
  sessionActivityAt: (session: ChatSession<TMode, TMessage, TSessionFields>) => string
}

function nowIso(): string {
  return new Date().toISOString()
}

function defaultTitleFromMessages<TMode extends string, TMessage extends PromptMessage<TMode>>(messages: TMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === "user" && message.text.trim())?.text.trim() ?? ""
  if (!firstUserMessage) return "New session"
  const compact = firstUserMessage.replace(/\s+/g, " ").trim()
  return compact.length <= 48 ? compact : `${compact.slice(0, 45)}...`
}

function lastCommittedMessageTimestamp<TMode extends string, TMessage extends PromptMessage<TMode>, TSessionFields extends object>(session: ChatSession<TMode, TMessage, TSessionFields>): string | null {
  const committedMessages = session.messages.filter((message) => message.id && message.text.trim())
  const latestMessage = committedMessages.at(-1)
  return latestMessage?.createdAt ?? null
}

function normalizeMessage<TMode extends string, TMessage extends PromptMessage<TMode>>(message: TMessage): TMessage {
  return {
    ...message,
    status: message.status === "streaming" ? "error" : (message.status ?? "complete"),
  }
}

function ensureDraftMessage<TMode extends string, TMessage extends PromptMessage<TMode>>(messages: TMessage[], createDraftMessage: () => TMessage): TMessage[] {
  if (messages.length === 0) return [createDraftMessage()]
  const last = messages.at(-1)
  if (!last || last.role !== "user") return [...messages, createDraftMessage()]
  return messages
}

function normalizeMessages<TMode extends string, TMessage extends PromptMessage<TMode>>(messages: TMessage[], createDraftMessage: () => TMessage): TMessage[] {
  return ensureDraftMessage(messages.map((message) => normalizeMessage(message)), createDraftMessage)
}

function isSessionEmpty<TMode extends string, TMessage extends PromptMessage<TMode>, TSessionFields extends object>(session: ChatSession<TMode, TMessage, TSessionFields>): boolean {
  const meaningfulMessages = session.messages.filter((message) => message.text.trim())
  return meaningfulMessages.length === 0 && session.draftPromptText.trim().length === 0
}

function hasCommittedConversation<TMode extends string, TMessage extends PromptMessage<TMode>, TSessionFields extends object>(session: ChatSession<TMode, TMessage, TSessionFields>): boolean {
  return session.messages.some((message) => message.text.trim().length > 0 && message.id)
}

function readJsonFile<T>(path: string): Promise<T | null> {
  return readFile(path, "utf8")
    .then((text) => JSON.parse(text) as T)
    .catch(() => null)
}

export function createFileChatSessionStore<
  TMode extends string,
  TMessage extends PromptMessage<TMode>,
  TSessionFields extends object = {},
  TSummaryFields extends object = {},
  TIndexFields extends object = {},
>(options: FileChatSessionStoreOptions<TMode, TMessage, TSessionFields, TSummaryFields, TIndexFields>): FileChatSessionStore<TMode, TMessage, TSessionFields, TSummaryFields, TIndexFields> {
  const titleFromMessages = options.titleFromMessages ?? defaultTitleFromMessages<TMode, TMessage>

  function sessionRootDir(bucketKey: string): string {
    const absoluteBucketKey = resolve(bucketKey)
    const digest = createHash("sha1").update(absoluteBucketKey).digest("hex").slice(0, 12)
    return join(process.cwd(), `.${options.storageNamespace}`, "sessions", digest)
  }

  function sessionFilePath(bucketKey: string, sessionId: string): string {
    return join(sessionRootDir(bucketKey), `${sessionId}.json`)
  }

  function indexFilePath(bucketKey: string): string {
    return join(sessionRootDir(bucketKey), "index.json")
  }

  function summarizeSession(session: ChatSession<TMode, TMessage, TSessionFields>): ChatSessionSummary<TMode, TSummaryFields> {
    const summaryFields = options.createSummaryFields?.(session) ?? ({} as TSummaryFields)
    return {
      id: session.id,
      title: session.title,
      updatedAt: lastCommittedMessageTimestamp(session) ?? session.updatedAt,
      messageCount: session.messages.filter((message) => message.text.trim()).length,
      lastMode: session.lastMode,
      ...summaryFields,
    }
  }

  function createEmptySession(bucketKey: string, mode: TMode): ChatSession<TMode, TMessage, TSessionFields> {
    const timestamp = nowIso()
    return {
      id: `session_${randomUUID()}`,
      title: "New session",
      createdAt: timestamp,
      updatedAt: timestamp,
      draftPromptText: "",
      lastMode: mode,
      messages: [options.createDraftMessage()],
      ...options.createSessionFields(bucketKey),
    }
  }

  function activeSession(state: { sessions: Array<ChatSession<TMode, TMessage, TSessionFields>>; activeSessionId: string }): ChatSession<TMode, TMessage, TSessionFields> {
    const session = state.sessions.find((candidate) => candidate.id === state.activeSessionId)
    if (!session) throw new Error(`Active session not found: ${state.activeSessionId}`)
    return session
  }

  function syncSessionMetadata(session: ChatSession<TMode, TMessage, TSessionFields>): void {
    session.messages = normalizeMessages(session.messages, options.createDraftMessage)
    session.draftPromptText = session.messages.at(-1)?.role === "user" ? (session.messages.at(-1)?.text ?? "") : session.draftPromptText
    session.title = titleFromMessages(session.messages)
    session.updatedAt = lastCommittedMessageTimestamp(session) ?? session.updatedAt
  }

  function normalizeSession(raw: Partial<ChatSession<TMode, TMessage, TSessionFields>>, bucketKey: string, defaultMode: TMode): ChatSession<TMode, TMessage, TSessionFields> {
    const rawMessages = Array.isArray(raw.messages) ? raw.messages : []
    return {
      id: raw.id || `session_${randomUUID()}`,
      title: raw.title?.trim() || titleFromMessages(rawMessages),
      createdAt: raw.createdAt || nowIso(),
      updatedAt: raw.updatedAt || nowIso(),
      draftPromptText: typeof raw.draftPromptText === "string" ? raw.draftPromptText : rawMessages.at(-1)?.text ?? "",
      lastMode: raw.lastMode ?? defaultMode,
      messages: normalizeMessages(rawMessages, options.createDraftMessage),
      ...(raw as TSessionFields),
      ...options.createSessionFields(bucketKey),
    }
  }

  async function loadSessions(bucketKey: string, defaultMode: TMode): Promise<{ sessions: Array<ChatSession<TMode, TMessage, TSessionFields>>; activeSessionId: string }> {
    const root = sessionRootDir(bucketKey)
    await mkdir(root, { recursive: true })
    const index = await readJsonFile<SessionStoreIndex<TMode, TSummaryFields, TIndexFields>>(indexFilePath(bucketKey))
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    const rawSessions = await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "index.json")
      .map(async (entry) => readJsonFile<Partial<ChatSession<TMode, TMessage, TSessionFields>>>(join(root, entry.name))))
    const sessions = rawSessions
      .filter((session) => session !== null)
      .map((session) => normalizeSession(session, bucketKey, defaultMode))
      .sort((left, right) => (lastCommittedMessageTimestamp(right) ?? right.updatedAt).localeCompare(lastCommittedMessageTimestamp(left) ?? left.updatedAt))

    const indexedSession = index?.activeSessionId ? sessions.find((session) => session.id === index.activeSessionId) : null
    if (sessions.length === 0) {
      const session = createEmptySession(bucketKey, defaultMode)
      await saveSessions(bucketKey, [session], session.id)
      return { sessions: [session], activeSessionId: session.id }
    }

    const reusableEmptySession = sessions.find((session) => isSessionEmpty(session))
    if (reusableEmptySession) {
      return { sessions, activeSessionId: reusableEmptySession.id }
    }

    if (indexedSession) {
      return { sessions, activeSessionId: indexedSession.id }
    }

    const freshSession = createEmptySession(bucketKey, defaultMode)
    const nextSessions = [freshSession, ...sessions]
    await saveSessions(bucketKey, nextSessions, freshSession.id)
    return { sessions: nextSessions, activeSessionId: freshSession.id }
  }

  async function saveSessions(bucketKey: string, sessions: Array<ChatSession<TMode, TMessage, TSessionFields>>, activeSessionId: string): Promise<void> {
    const root = sessionRootDir(bucketKey)
    await mkdir(root, { recursive: true })
    const persistedSessions = sessions.filter((session) => hasCommittedConversation(session) || isSessionEmpty(session))
    const persistedIds = new Set(persistedSessions.map((session) => session.id))
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "index.json")
      .filter((entry) => !persistedIds.has(entry.name.replace(/\.json$/, "")))
      .map((entry) => unlink(join(root, entry.name)).catch(() => undefined)))
    await Promise.all(persistedSessions.map(async (session) => {
      const nextSession = structuredClone(session)
      syncSessionMetadata(nextSession)
      await writeFile(sessionFilePath(bucketKey, nextSession.id), `${JSON.stringify(nextSession, null, 2)}\n`, "utf8")
    }))
    const fallbackActiveSessionId = persistedSessions.find((session) => session.id === activeSessionId)?.id ?? persistedSessions[0]?.id ?? null
    const index: SessionStoreIndex<TMode, TSummaryFields, TIndexFields> = {
      schemaVersion: SESSION_SCHEMA_VERSION,
      activeSessionId: fallbackActiveSessionId,
      sessions: persistedSessions.map((session) => summarizeSession(session)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      ...options.createIndexFields(bucketKey),
    }
    await writeFile(indexFilePath(bucketKey), `${JSON.stringify(index, null, 2)}\n`, "utf8")
  }

  function sessionActivityAt(session: ChatSession<TMode, TMessage, TSessionFields>): string {
    return lastCommittedMessageTimestamp(session) ?? session.updatedAt
  }

  function createNamedSession(bucketKey: string, mode: TMode, baseTitle?: string): ChatSession<TMode, TMessage, TSessionFields> {
    const session = createEmptySession(bucketKey, mode)
    session.title = baseTitle?.trim() || `New session (${basename(bucketKey)})`
    return session
  }

  return {
    createEmptySession,
    createNamedSession,
    activeSession,
    syncSessionMetadata,
    loadSessions,
    saveSessions,
    sessionActivityAt,
  }
}
