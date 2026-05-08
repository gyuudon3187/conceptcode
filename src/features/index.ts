import type { PromptReferenceMatch } from "agent-tui/prompt"
import { renderDetailsPane, renderPromptBudgetPane } from "../conceptcode-ui/panes"
import { renderSymphonyPrimaryPane, renderSymphonySupportTopPane } from "symphony"
import type { AppState } from "../core/types"

import {
  CONCEPT_CODE_PROMPT_REFERENCE_SPECS,
  createConceptCodePromptResolvers,
  createConceptCodePromptSuggestionProvider,
} from "conceptcode/prompt"

import type { AppFeature } from "./types"

export const ACTIVE_FEATURES: AppFeature[] = [
  {
    id: "conceptcode",
    primaryPaneTitle: () => "Concepts",
    renderPrimaryPaneContent: (state, listScroll) => (state.conceptNavigationFocused ? listScroll : renderPromptBudgetPane(state)),
    renderConceptsWorkspaceSupportTop: (state) => renderDetailsPane(state),
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
  {
    id: "symphony",
    primaryPaneTitle: () => "Symphony",
    renderPrimaryPaneContent: (state) => renderSymphonyPrimaryPane(state),
    renderConceptsWorkspaceSupportTop: () => renderSymphonySupportTopPane(),
  },
]

export function primaryPaneFeatures(): AppFeature[] {
  return ACTIVE_FEATURES.filter((feature) => feature.primaryPaneTitle && feature.renderPrimaryPaneContent)
}

export function enabledPrimaryPaneFeatures(state: Pick<AppState, "enabledPrimaryFeatureIds">): AppFeature[] {
  const enabledIds = new Set(state.enabledPrimaryFeatureIds)
  return primaryPaneFeatures().filter((feature) => enabledIds.has(feature.id))
}

export function activePrimaryPaneFeature(state: Pick<AppState, "enabledPrimaryFeatureIds" | "activePrimaryFeatureId">): AppFeature {
  const enabled = enabledPrimaryPaneFeatures(state)
  const active = enabled.find((feature) => feature.id === state.activePrimaryFeatureId)
  return active ?? enabled[0] ?? ACTIVE_FEATURES[0]!
}

export function nextPrimaryFeatureId(state: Pick<AppState, "enabledPrimaryFeatureIds" | "activePrimaryFeatureId">, delta: number): string | null {
  const enabled = enabledPrimaryPaneFeatures(state)
  if (enabled.length <= 1) return null
  const currentIndex = Math.max(0, enabled.findIndex((feature) => feature.id === state.activePrimaryFeatureId))
  const nextIndex = (currentIndex + delta % enabled.length + enabled.length) % enabled.length
  return enabled[nextIndex]?.id ?? null
}
