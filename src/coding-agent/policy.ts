import {
  definePrimaryAgent,
} from "coding-agent"

export const CONCEPTUALIZE_PRIMARY_AGENT = definePrimaryAgent({
  id: "conceptualize",
  instructions: [
    "Focus on concept-graph structure and metadata updates.",
    "Prefer graph-oriented changes and avoid unrelated source-code edits unless the user explicitly asks for them.",
  ],
})
