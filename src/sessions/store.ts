import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises"
import { createHash, randomUUID } from "node:crypto"
import { basename, join, resolve } from "node:path"

import type { ChatSession, ChatSessionSummary, PromptMessage, SessionStoreIndex, UiMode } from "../core/types"

const SESSION_SCHEMA_VERSION = 1

function nowIso(): string {
  return new Date().toISOString()
}

function sessionTitleFromMessages(messages: PromptMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === "user" && message.text.trim())?.text.trim() ?? ""
  if (!firstUserMessage) {
    return "New session"
  }
  const compact = firstUserMessage.replace(/\s+/g, " ").trim()
  return compact.length <= 48 ? compact : `${compact.slice(0, 45)}...`
}

function ensureDraftMessage(messages: PromptMessage[]): PromptMessage[] {
  if (messages.length === 0) return [{ text: "", role: "user", status: "complete" }]
  const last = messages.at(-1)
  if (!last || last.role !== "user") {
    return [...messages, { text: "", role: "user", status: "complete" }]
  }
  return messages
}

function normalizeMessages(messages: PromptMessage[]): PromptMessage[] {
  return ensureDraftMessage(messages.map((message) => ({
    ...message,
    status: message.status === "streaming" ? "error" : (message.status ?? "complete"),
  })))
}

function isSessionEmpty(session: ChatSession): boolean {
  const meaningfulMessages = session.messages.filter((message) => message.text.trim())
  return meaningfulMessages.length === 0 && session.draftPromptText.trim().length === 0
}

function hasCommittedConversation(session: ChatSession): boolean {
  return session.messages.some((message) => message.text.trim().length > 0 && message.id)
}

function summarizeSession(session: ChatSession): ChatSessionSummary {
  return {
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
    messageCount: session.messages.filter((message) => message.text.trim()).length,
    lastMode: session.lastMode,
  }
}

export function createEmptySession(graphPath: string, mode: UiMode): ChatSession {
  const timestamp = nowIso()
  return {
    id: `session_${randomUUID()}`,
    title: "New session",
    createdAt: timestamp,
    updatedAt: timestamp,
    graphPath,
    draftPromptText: "",
    lastMode: mode,
    messages: [{ text: "", role: "user", status: "complete" }],
  }
}

export function activeSession(state: { sessions: ChatSession[]; activeSessionId: string }): ChatSession {
  const session = state.sessions.find((candidate) => candidate.id === state.activeSessionId)
  if (!session) {
    throw new Error(`Active session not found: ${state.activeSessionId}`)
  }
  return session
}

export function syncSessionMetadata(session: ChatSession): void {
  session.messages = normalizeMessages(session.messages)
  session.draftPromptText = session.messages.at(-1)?.role === "user" ? (session.messages.at(-1)?.text ?? "") : session.draftPromptText
  session.title = sessionTitleFromMessages(session.messages)
  session.updatedAt = nowIso()
}

function sessionRootDir(jsonPath: string): string {
  const absoluteJsonPath = resolve(jsonPath)
  const digest = createHash("sha1").update(absoluteJsonPath).digest("hex").slice(0, 12)
  return join(process.cwd(), ".conceptcode", "sessions", digest)
}

function sessionFilePath(jsonPath: string, sessionId: string): string {
  return join(sessionRootDir(jsonPath), `${sessionId}.json`)
}

function indexFilePath(jsonPath: string): string {
  return join(sessionRootDir(jsonPath), "index.json")
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T
  } catch {
    return null
  }
}

function normalizeSession(raw: ChatSession, graphPath: string): ChatSession {
  return {
    ...raw,
    graphPath,
    messages: normalizeMessages(raw.messages ?? []),
    draftPromptText: typeof raw.draftPromptText === "string" ? raw.draftPromptText : raw.messages?.at(-1)?.text ?? "",
    lastMode: raw.lastMode ?? "plan",
    title: raw.title?.trim() || sessionTitleFromMessages(raw.messages ?? []),
    createdAt: raw.createdAt || nowIso(),
    updatedAt: raw.updatedAt || nowIso(),
  }
}

export async function loadSessions(jsonPath: string, defaultMode: UiMode): Promise<{ sessions: ChatSession[]; activeSessionId: string }> {
  const root = sessionRootDir(jsonPath)
  await mkdir(root, { recursive: true })
  const index = await readJsonFile<SessionStoreIndex>(indexFilePath(jsonPath))
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const sessions = (await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "index.json")
    .map(async (entry) => readJsonFile<ChatSession>(join(root, entry.name)))))
    .filter((session): session is ChatSession => Boolean(session))
    .map((session) => normalizeSession(session, jsonPath))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

  if (sessions.length === 0) {
    const session = createEmptySession(jsonPath, defaultMode)
    await saveSessions(jsonPath, [session], session.id)
    return { sessions: [session], activeSessionId: session.id }
  }

  const reusableEmptySession = sessions.find((session) => isSessionEmpty(session))
  if (reusableEmptySession) {
    return { sessions, activeSessionId: reusableEmptySession.id }
  }

  const freshSession = createEmptySession(jsonPath, defaultMode)
  const nextSessions = [freshSession, ...sessions]
  await saveSessions(jsonPath, nextSessions, freshSession.id)
  return { sessions: nextSessions, activeSessionId: freshSession.id }

}

export async function saveSessions(jsonPath: string, sessions: ChatSession[], activeSessionId: string): Promise<void> {
  const root = sessionRootDir(jsonPath)
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
    await writeFile(sessionFilePath(jsonPath, nextSession.id), `${JSON.stringify(nextSession, null, 2)}\n`, "utf8")
  }))
  const fallbackActiveSessionId = persistedSessions.find((session) => session.id === activeSessionId)?.id ?? persistedSessions[0]?.id ?? null
  const index: SessionStoreIndex = {
    schemaVersion: SESSION_SCHEMA_VERSION,
    graphPath: resolve(jsonPath),
    activeSessionId: fallbackActiveSessionId,
    sessions: persistedSessions.map((session) => summarizeSession(session)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  }
  await writeFile(indexFilePath(jsonPath), `${JSON.stringify(index, null, 2)}\n`, "utf8")
}

export function createNamedSession(graphPath: string, mode: UiMode, baseTitle?: string): ChatSession {
  const session = createEmptySession(graphPath, mode)
  if (baseTitle?.trim()) {
    session.title = baseTitle.trim()
  } else {
    session.title = `New session (${basename(graphPath)})`
  }
  return session
}
