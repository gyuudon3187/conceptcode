import type { CodingAgentMessage } from "./types"

export type CodingAgentPrimaryAgent = {
  id: string
  instructions: string[]
}

export type CodingAgentPrimaryAgentDefinition = {
  id: string
  instructions: string | string[]
}

const PRIMARY_AGENT_PREFIX = "[PRIMARY AGENT: "
const USER_PROMPT_MARKER = "[USER PROMPT]"

export const PLAN_PRIMARY_AGENT = definePrimaryAgent({
  id: "plan",
  instructions: [
    "Inspect and reason before changing anything.",
    "Do not edit files, apply patches, or run mutating commands unless the user explicitly asks to switch into execution.",
    "Return a concrete implementation plan, likely files, risks, and verification steps.",
  ],
})

export const BUILD_PRIMARY_AGENT = definePrimaryAgent({
  id: "build",
  instructions: [
    "Carry the task through inspection, implementation, and verification when feasible.",
    "Use tools as needed and prefer making the requested change over stopping at analysis.",
  ],
})

export function definePrimaryAgent(definition: CodingAgentPrimaryAgentDefinition): CodingAgentPrimaryAgent {
  const instructionLines = Array.isArray(definition.instructions)
    ? definition.instructions
    : definition.instructions.split("\n")
  return {
    id: definition.id,
    instructions: instructionLines.map((line) => line.trim()).filter((line) => line.length > 0),
  }
}

export function applyPrimaryAgentToMessages(messages: CodingAgentMessage[], agent: CodingAgentPrimaryAgent): CodingAgentMessage[] {
  const latestUserIndex = messages.map((message) => message.role).lastIndexOf("user")
  return messages.map((message, index) => ({
    ...message,
    content: message.role === "user" && index === latestUserIndex
      ? [
          `${PRIMARY_AGENT_PREFIX}${agent.id}]`,
          ...agent.instructions,
          USER_PROMPT_MARKER,
          message.content,
        ].join("\n")
      : message.content,
  }))
}

export function parsePrimaryAgentPrompt(content: string): { agentId: string | null; prompt: string } {
  const normalized = content.trim()
  if (!normalized.startsWith(PRIMARY_AGENT_PREFIX)) {
    return { agentId: null, prompt: normalized }
  }

  const headerEnd = normalized.indexOf("]")
  const promptMarker = `\n${USER_PROMPT_MARKER}\n`
  const markerIndex = normalized.indexOf(promptMarker)
  if (headerEnd < 0 || markerIndex < 0 || markerIndex <= headerEnd) {
    return { agentId: null, prompt: normalized }
  }

  return {
    agentId: normalized.slice(PRIMARY_AGENT_PREFIX.length, headerEnd).trim() || null,
    prompt: normalized.slice(markerIndex + promptMarker.length).trim(),
  }
}
