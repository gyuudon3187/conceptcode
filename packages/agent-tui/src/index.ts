export { COLORS } from "./theme"
export {
  findPromptReferenceAt,
  findPromptReferenceEndingAt,
  findPromptReferenceStartingAt,
  parsePromptReferences,
  resolvePromptReferences,
} from "./prompt"
export type {
  PromptReferenceMatch,
  PromptReferenceResolver,
  PromptReferenceResolverMap,
  PromptReferenceSpec,
  ResolvedPromptReference,
  ResolvedPromptReferences,
} from "./prompt"
export {
  textNodesForChunks,
  truncateSingleLine,
  truncateFromStart,
  promptPreviewLines,
  highlightPromptReferenceChunks,
} from "./text"
export {
  rightAlignedLeft,
  interpolateValue,
  delayedProgress,
  revealAfter,
  acceleratedProgress,
  blendProgress,
  interpolateVerticalStack,
  interpolateBottomRightAnchoredRect,
  interpolateTopRightAnchoredRectWithIndependentHeightProgress,
  wideWorkspaceGeometryForRatio,
} from "./layout/geometry"
export { renderWorkspaceFrame } from "./render/frame"
export { renderInspectorOverlay } from "./render/inspector"
export { renderOverlayBackdrop, renderOverlayCard } from "./render/overlay"
export { createScrollBox } from "./render/scroll"
export { renderSessionModal } from "./render/session-modal"
export {
  sessionModalVisibleRowCount,
  keepShellListSelectionVisible,
  moveShellListSelection,
  confirmOrCancelCommand,
  sessionModalCommand,
  inspectorCommand,
  sharedFocusCommand,
} from "./keybindings"
export type {
  LayoutMode,
  UiLayoutConfig,
  WorkspaceFocus,
  WorkspaceTransitionState,
  ShellViewportState,
  ShellWorkspaceState,
  ShellWorkspaceControllerState,
  ShellWorkspaceControllerDeps,
  ShellWorkspaceTransitionViewState,
  ShellFramePaneDescriptor,
  ShellOverlayLayout,
  ShellSessionListItem,
  ShellSessionModalViewModel,
  ShellInspectorLegendItem,
  ShellInspectorViewModel,
  ShellListNavigationState,
  ShellKeyCommand,
  ShellWorkspaceFrameViewModel,
} from "./types"
