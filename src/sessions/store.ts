import { createFileChatSessionStore } from "agent-chat"
import { resolve } from "node:path"

import type { ChatSession, ChatSessionSummary, PromptMessage, SessionStoreIndex, UiMode } from "../core/types"

const sessionStore = createFileChatSessionStore<UiMode, PromptMessage, { graphPath: string }, {}, { graphPath: string }>({
  storageNamespace: "conceptcode",
  createDraftMessage: () => ({ text: "", role: "user", status: "complete" }),
  createSessionFields: (graphPath) => ({ graphPath }),
  createIndexFields: (graphPath): Pick<SessionStoreIndex, "graphPath"> => ({ graphPath: resolve(graphPath) }),
})

export const {
  createEmptySession,
  createNamedSession,
  activeSession,
  syncSessionMetadata,
  loadSessions,
  saveSessions,
  sessionActivityAt,
} = sessionStore
