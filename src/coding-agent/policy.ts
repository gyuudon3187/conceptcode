import {
  BUILD_PRIMARY_AGENT,
  definePrimaryAgent,
  PLAN_PRIMARY_AGENT,
  type CodingAgentPrimaryAgent,
} from "coding-agent"

import type { ChatTurnRequest } from "../core/types"

export const CONCEPTUALIZE_PRIMARY_AGENT = definePrimaryAgent({
  id: "conceptualize",
  instructions: [
    "Focus on concept-graph structure and metadata updates.",
    "Prefer graph-oriented changes and avoid unrelated source-code edits unless the user explicitly asks for them.",
  ],
})

export function primaryAgentForMode(primaryAgentId: ChatTurnRequest["primaryAgentId"]): CodingAgentPrimaryAgent {
  if (primaryAgentId === "plan") return PLAN_PRIMARY_AGENT
  if (primaryAgentId === "build") return BUILD_PRIMARY_AGENT
  return CONCEPTUALIZE_PRIMARY_AGENT
}
