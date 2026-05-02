import type { PromptReferenceMatch, PromptReferenceSpec } from "agent-tui/prompt"

import type { AppState, PromptSuggestionProvider } from "../core/types"

export type FeaturePromptResolverContext = {
  text: string
  cwd: string
  workspaceRoot: string
  conceptPaths: Set<string> | null
  projectFiles: Set<string> | null
  projectDirectories: Set<string> | null
}

export type FeaturePromptReferenceResult = {
  kind: string
}

export type FeaturePromptResolver = (
  match: PromptReferenceMatch<string>,
  context: FeaturePromptResolverContext,
) => FeaturePromptReferenceResult | null | undefined | Promise<FeaturePromptReferenceResult | null | undefined>

export type AppFeature = {
  id: string
  promptReferenceSpecs?: PromptReferenceSpec<string>[]
  createPromptSuggestionProvider?: (state: AppState) => PromptSuggestionProvider
  createPromptResolvers?: (context: FeaturePromptResolverContext) => Record<string, FeaturePromptResolver>
}
