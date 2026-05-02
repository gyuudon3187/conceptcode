import type { PromptReferenceMatch } from "agent-tui/prompt"

import {
  CONCEPT_CODE_PROMPT_REFERENCE_SPECS,
  createConceptCodePromptResolvers,
  createConceptCodePromptSuggestionProvider,
} from "conceptcode/prompt"

import type { AppFeature } from "./types"

export const ACTIVE_FEATURES: AppFeature[] = [
  {
    id: "conceptcode",
    promptReferenceSpecs: CONCEPT_CODE_PROMPT_REFERENCE_SPECS,
    createPromptSuggestionProvider: (state) => {
      const provider = createConceptCodePromptSuggestionProvider(state)
      return {
        suggestions: ({ prefix, query, mode }) => (prefix === "@" || prefix === "/" ? provider.suggestions({ prefix, query, mode }) : []),
        isResolvedValue: ({ prefix, query, value }) => (prefix === "@" || prefix === "/") && (provider.isResolvedValue?.({ prefix, query, value }) ?? false),
        acceptTrailingText: ({ prefix, value, suffix }) => ((prefix === "@" || prefix === "/") ? provider.acceptTrailingText?.({ prefix, value, suffix }) : "") ?? "",
      }
    },
    createPromptResolvers: (context) => {
      const resolvers = createConceptCodePromptResolvers({ conceptPaths: context.conceptPaths ?? undefined })
      return {
        concept: (match) => resolvers.concept?.(match as PromptReferenceMatch<"concept">, { conceptPaths: context.conceptPaths }),
        slash: (match) => resolvers.slash?.(match as PromptReferenceMatch<"slash">, { conceptPaths: context.conceptPaths }),
      }
    },
  },
]
