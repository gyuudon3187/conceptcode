import type { PromptReferenceMatch } from "agent-tui/prompt"
import { applyFeatureBufferText, handleArchonModalKey, renderArchonPrimaryPane, renderArchonSupportTopPane, renderFeatureOverlays } from "archon"
import { renderDetailsPane, renderPromptBudgetPane } from "../conceptcode-ui/panes"
import { renderSymphonyPrimaryPane, renderSymphonySupportTopPane } from "symphony"
import type { AppState } from "../core/types"
import { archonState } from "../core/state"
import { COLORS } from "../ui/theme"
import { renderConceptList } from "../ui/concepts-list"
import { handleArchonBrowserKey } from "../archon/browser"
import { deleteArchonItem, showArchonError } from "../archon/commands"

import {
  CONCEPT_CODE_PROMPT_REFERENCE_SPECS,
  createConceptCodePromptResolvers,
  createConceptCodePromptSuggestionProvider,
} from "conceptcode/prompt"
import { handleConceptCodeBrowserKey } from "./conceptcode"

import type { AppFeature } from "./types"

export const ACTIVE_FEATURES: AppFeature[] = [
  {
    id: "conceptcode",
    tabLabel: "Concepts",
    primaryPaneTitle: () => "Concepts",
    renderPrimaryPaneList: (state) => renderConceptList(state),
    renderPrimaryPaneContent: (state, listScroll) => (state.conceptNavigationFocused ? listScroll : renderPromptBudgetPane(state)),
    renderConceptsWorkspaceSupportTop: (state) => renderDetailsPane(state),
    browseHelpText: "Browse: j/k move  h/l back/open  [/] feature  i prompt  Enter summary  Ctrl+S sessions  s/t/m inspect  Ctrl+M scoped context  y copy  p path  q quit",
    browseFooterHint: (state) => state.conceptNavigationFocused ? "Tab namespace, Shift+Tab focus" : "Tab focus",
    handleBrowserKey: handleConceptCodeBrowserKey,
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
    id: "archon",
    tabLabel: "Workflows",
    primaryPaneTitle: () => "Workflows",
    renderPrimaryPaneList: (state) => renderArchonPrimaryPane(archonState(state), COLORS),
    renderPrimaryPaneContent: (_state, listScroll) => listScroll,
    renderConceptsWorkspaceSupportTop: (state) => renderArchonSupportTopPane(archonState(state), COLORS),
    renderFeatureOverlays: (state) => renderFeatureOverlays(state.archon, state.layoutMode, COLORS),
    browseHelpText: "Browse: j/k move  l enter workflow nodes  h back  n create item or node  e edit item or node  Enter edit command body or workflow node  Shift+J/K move node  d delete  s save  [/] feature  Shift+Tab focus  q quit",
    browseFooterHint: (state) => `${state.archon.dirtyPaths.length > 0 ? `${state.archon.dirtyPaths.length} dirty  ` : ""}Tab workflows/commands, Shift+Tab focus`,
    handleBrowserKey: handleArchonBrowserKey,
    handleModalKey: (state, key, deps) => {
      const handled = handleArchonModalKey(state.archon, key)
      if (handled) deps.draw()
      return handled
    },
    handleConfirmModal: async (state, modal, deps) => {
      if (modal.kind !== "archon-delete") return false
      try {
        await deleteArchonItem(state, modal.targetPath, modal.targetType, modal.targetNodeId)
      } catch (error) {
        showArchonError(state, error)
      }
      deps.closeConfirmModal()
      deps.draw()
      return true
    },
    applyEditorText: (state, editor) => editor.target.kind === "feature-buffer" ? applyFeatureBufferText(state.archon, editor.target, editor.renderable.plainText) : false,
  },
  {
    id: "symphony",
    tabLabel: "Tasks",
    primaryPaneTitle: () => "Tasks",
    renderPrimaryPaneContent: (state) => renderSymphonyPrimaryPane(state),
    renderConceptsWorkspaceSupportTop: () => renderSymphonySupportTopPane(),
    browseHelpText: "Browse: [/] feature  Shift+Tab focus  q quit",
    browseFooterHint: () => "Shift+Tab focus",
  },
]

export function primaryPaneFeatures(): AppFeature[] {
  return ACTIVE_FEATURES.filter((feature) => feature.primaryPaneTitle && feature.renderPrimaryPaneContent)
}

export function featureById(featureId: string): AppFeature | null {
  return ACTIVE_FEATURES.find((feature) => feature.id === featureId) ?? null
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
