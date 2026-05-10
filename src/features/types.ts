import type { CliRenderer, KeyEvent } from "@opentui/core"
import type { PromptReferenceMatch, PromptReferenceSpec } from "agent-tui/prompt"
import type { Renderable, VNode, ScrollBoxRenderable } from "@opentui/core"

import type { AppState, BufferModalTarget, ConfirmModalState, EditorModalState, InspectorKind, PromptSuggestionProvider } from "../core/types"

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

export type FeatureBrowserCommandDeps = {
  renderer: () => CliRenderer
  draw: () => void
  copyWithStatus: (payload: string) => Promise<void>
  openBufferEditor: (target: Exclude<BufferModalTarget, { kind: "prompt" }>, initialText: string) => void
  openInspector: (kind: InspectorKind) => void
  openScopedContextModal: () => Promise<void>
  cycleConceptNamespaceMode: (state: AppState) => void
  pageSize: (layoutMode: AppState["layoutMode"]) => number
  buildPromptEditorDeps: () => {
    redraw: () => void
    refreshPromptTokenBreakdown: () => void
    refreshPromptScroll: () => void
    schedulePromptScrollSync: (reason: string) => void
    refreshPromptPaneTarget: () => void
  }
}

export type FeatureModalCommandDeps = {
  draw: () => void
}

export type FeatureConfirmCommandDeps = {
  draw: () => void
  closeConfirmModal: () => void
}

export type AppFeature = {
  id: string
  tabLabel?: string
  primaryPaneTitle?: (state: AppState) => string
  renderPrimaryPaneList?: (state: AppState) => Renderable | VNode<any, any[]>
  renderPrimaryPaneContent?: (state: AppState, listScroll: ScrollBoxRenderable) => Renderable | VNode<any, any[]>
  renderConceptsWorkspaceSupportTop?: (state: AppState) => Renderable | VNode<any, any[]>
  renderFeatureOverlays?: (state: AppState) => Array<Renderable | VNode<any, any[]>>
  browseHelpText?: string
  browseFooterHint?: (state: AppState) => string
  handleBrowserKey?: (state: AppState, key: KeyEvent, deps: FeatureBrowserCommandDeps) => boolean | Promise<boolean>
  handleModalKey?: (state: AppState, key: KeyEvent, deps: FeatureModalCommandDeps) => boolean | Promise<boolean>
  handleConfirmModal?: (state: AppState, modal: ConfirmModalState, deps: FeatureConfirmCommandDeps) => boolean | Promise<boolean>
  applyEditorText?: (state: AppState, editor: EditorModalState) => boolean
  promptReferenceSpecs?: PromptReferenceSpec<string>[]
  createPromptSuggestionProvider?: (state: AppState) => PromptSuggestionProvider
  createPromptResolvers?: (context: FeaturePromptResolverContext) => Record<string, FeaturePromptResolver>
}
