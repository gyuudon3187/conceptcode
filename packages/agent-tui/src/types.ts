import type { RGBA, Timeline } from "@opentui/core"

export type LayoutMode = "wide" | "narrow"

export type UiLayoutConfig = {
  collapsedPromptRatio: number
  conceptsToSessionTransitionCollapsedPromptRatio: number
  expandedPromptRatio: number
  conceptsToSessionTransitionExpandedPromptRatio: number
  conceptsToSessionRightStackStartWidthRatio: number
  conceptsToSessionDetailsHeightAcceleration: number
  promptAnimationEpsilon: number
  promptAnimationStepMs: number
  promptAnimationLerp: number
  workspaceTransitionStepMs: number
  workspaceTransitionDurationMs: number
  workspaceTransitionAcceleration: number
  workspaceTransitionEndEasePower: number
  workspaceTransitionStaggerDelay: number
  workspaceTransitionFadeStart: number
  workspaceTransitionFadeEnd: number
  viewportHorizontalInset: number
  rootPadding: number
  interPaneGap: number
  minFrameWidth: number
  minFrameHeight: number
  minPromptPaneWidth: number
  minSidebarWidth: number
  supportHeight: number
  minPreviewHeight: number
  minPaneWidth: number
  minPaneHeight: number
  transitionChipWidth: number
  transitionChipHeight: number
}

export type WorkspaceFocus = "session" | "concepts"

export type WorkspaceTransitionState = {
  from: WorkspaceFocus
  to: WorkspaceFocus
  progress: number
  startedAt: number
  loggedFirstFrame?: boolean
}

export type ShellViewportState = {
  width: number
  height: number
}

export type ShellWorkspaceState = {
  layoutMode: LayoutMode
  uiLayoutConfig: UiLayoutConfig
  conceptNavigationFocused: boolean
  startupDrawComplete: boolean
  promptPaneRatio: number
  promptPaneTargetRatio: number
  promptPaneMode: "collapsed" | "expanded"
  workspaceTransition: WorkspaceTransitionState | null
}

export type ShellWorkspaceControllerState = ShellWorkspaceState & {
  editorModal: { target: { kind: string }; renderable: { blur: () => void; focus: () => void } } | null
  promptPaneAnimationTimeout: ReturnType<typeof setTimeout> | null
  workspaceTransitionTimeout: ReturnType<typeof setTimeout> | null
  workspaceTransitionTimeline: Timeline | null
}

export type ShellWorkspaceControllerDeps = {
  shellState: ShellWorkspaceControllerState
  redraw: () => void
  openPromptEditor: () => void
  applyPromptEditorText: () => void
  getViewport: () => ShellViewportState
}

export type ShellWorkspaceTransitionViewState = {
  layoutMode: LayoutMode
  uiLayoutConfig: UiLayoutConfig
  promptPaneRatio: number
  workspaceTransition: WorkspaceTransitionState | null
}

export type ShellFramePaneDescriptor = {
  key: string
  title?: string
  borderColor?: string
  shellFrame?: boolean
  content: unknown
}

export type ShellOverlayLayout = {
  top: number | `${number}%`
  left: number | `${number}%`
  width: number | `${number}%`
  height?: number | `${number}%`
  marginLeft?: number
}

export type ShellSessionListItem = {
  id: string
  title: string
  subtitle: string
  badge: {
    label: string
    color: string
  }
  selected: boolean
}

export type ShellSessionModalViewModel = {
  layout: ShellOverlayLayout & {
    height: number
  }
  title: string
  items: ShellSessionListItem[]
  footerHint: string
}

export type ShellInspectorLegendItem = {
  label: string
  color: RGBA
}

export type ShellInspectorViewModel = {
  layout: ShellOverlayLayout
  title: string
  closeHint: string
  legendItems: ShellInspectorLegendItem[]
}

export type ShellListNavigationState = {
  selectedIndex: number
  scrollTop: number
}

export type ShellKeyCommand =
  | { kind: "cancel" }
  | { kind: "confirm" }
  | { kind: "move"; delta: number }
  | { kind: "create" }
  | { kind: "delete" }
  | { kind: "scroll"; delta: number }
  | { kind: "toggleFocus" }

export type ShellWorkspaceFrameViewModel = {
  layoutMode: LayoutMode
  conceptNavigationFocused: boolean
  promptPaneFocused: boolean
  promptPaneWidth: number | null
  sidebarWidth: number | null
  supportHeight: number
  previewHeight: number
}
