import { Box, type Renderable, ScrollBoxRenderable, type VNode } from "@opentui/core"
import { COLORS } from "agent-tui/theme"
import {
  acceleratedProgress,
  blendProgress,
  delayedProgress,
  interpolatePinnedEnter,
  interpolateBottomRightAnchoredRect,
  interpolateTopRightAnchoredRectWithIndependentHeightProgress,
  interpolateValue,
  interpolateVerticalStack,
  stackRemainderBelow,
  revealAfter,
} from "agent-tui/animation"
import {
  rightAlignedLeft,
  type PaneRect,
  type WideWorkspaceGeometry,
  wideWorkspaceGeometryForRatio as computeWideWorkspaceGeometryForRatio,
} from "agent-tui/layout/geometry"
import type { ShellViewportState, ShellWorkspaceTransitionViewState, UiLayoutConfig, WorkspaceFocus } from "agent-tui/types"

import type { AppState } from "../core/types"

export { rightAlignedLeft }
export type { PaneRect }

export type WorkspaceRects = {
  session: PaneRect
  context: PaneRect
  conceptPreview: PaneRect
  details: PaneRect
  concepts: PaneRect
  canvasLeft: number
  canvasTop: number
  canvasWidth: number
  canvasHeight: number
  frameLeft: number
  frameTop: number
  frameWidth: number
  frameHeight: number
}

export type ShellWorkspaceLayoutState = Pick<ShellWorkspaceTransitionViewState, "layoutMode" | "uiLayoutConfig" | "promptPaneRatio">

function wideWorkspaceGeometryForRatio(
  shellState: Pick<ShellWorkspaceLayoutState, "layoutMode" | "uiLayoutConfig">,
  promptPaneRatio: number,
  viewport: ShellViewportState,
): WideWorkspaceGeometry | null {
  return computeWideWorkspaceGeometryForRatio(shellState.layoutMode, shellState.uiLayoutConfig, promptPaneRatio, viewport)
}

export function wideWorkspaceGeometry(shellState: ShellWorkspaceLayoutState, viewport: ShellViewportState): WideWorkspaceGeometry | null {
  return wideWorkspaceGeometryForRatio(shellState, shellState.promptPaneRatio, viewport)
}

export function workspaceRects(shellState: ShellWorkspaceLayoutState, viewport: ShellViewportState): WorkspaceRects | null {
  return workspaceRectsForRatio(shellState, shellState.promptPaneRatio, viewport)
}

export function workspaceRectsForRatio(
  shellState: Pick<ShellWorkspaceLayoutState, "layoutMode" | "uiLayoutConfig">,
  promptPaneRatio: number,
  viewport: ShellViewportState,
): WorkspaceRects | null {
  const geometry = wideWorkspaceGeometryForRatio(shellState, promptPaneRatio, viewport)
  if (!geometry) return null
  const rowGap = shellState.uiLayoutConfig.interPaneGap
  const contentTop = 0
  const contentHeight = Math.max(8, geometry.frameHeight)
  const left = 0
  const rightColumnLeft = rightAlignedLeft(geometry.frameWidth, geometry.promptPaneWidth)
  return {
    canvasLeft: 0,
    canvasTop: 0,
    canvasWidth: geometry.frameWidth,
    canvasHeight: geometry.frameHeight,
    frameLeft: geometry.frameLeft,
    frameTop: geometry.frameTop,
    frameWidth: geometry.frameWidth,
    frameHeight: geometry.frameHeight,
    session: { left: rightColumnLeft, top: contentTop, width: geometry.promptPaneWidth, height: contentHeight },
    context: { left, top: contentTop, width: geometry.sidebarWidth, height: geometry.supportHeight },
    conceptPreview: { left, top: contentTop + geometry.supportHeight + rowGap, width: geometry.sidebarWidth, height: geometry.previewHeight },
    details: { left: rightColumnLeft, top: contentTop, width: geometry.sidebarWidth, height: geometry.supportHeight },
    concepts: { left, top: contentTop, width: geometry.promptPaneWidth, height: contentHeight },
  }
}

function renderAnimatedPane(rect: PaneRect, child: Renderable | VNode<any, any[]>, borderColor: string, title?: string): Renderable | VNode<any, any[]> {
  return Box(
    { position: "absolute", left: rect.left, top: rect.top, width: rect.width, height: rect.height, borderStyle: "rounded", borderColor, title, padding: 1, backgroundColor: COLORS.panel, flexDirection: "column" },
    child,
  )
}

type TransitionWorkspacePaneContent = {
  sessionNode: Renderable | VNode<any, any[]>
  contextNode: Renderable | VNode<any, any[]>
  detailsNode: Renderable | VNode<any, any[]>
  conceptsNode: Renderable | VNode<any, any[]>
}

type TransitionPaneRenderer = (state: AppState, focus: WorkspaceFocus, rects: WorkspaceRects, listScroll: ScrollBoxRenderable, mainScroll: ScrollBoxRenderable, promptScroll: ScrollBoxRenderable | null) => TransitionWorkspacePaneContent | null

type ShellWorkspaceTransitionOverlayDeps = {
  shellState: ShellWorkspaceTransitionViewState
  viewport: ShellViewportState
  listScroll: ScrollBoxRenderable
  mainScroll: ScrollBoxRenderable
  promptScroll: ScrollBoxRenderable | null
  renderTransitionPaneContentWithRects: TransitionPaneRenderer
}

type TransitionOverlayContext = {
  transition: NonNullable<ShellWorkspaceTransitionViewState["workspaceTransition"]>
  config: UiLayoutConfig
  fromWorkspaceRects: WorkspaceRects
  toWorkspaceRects: WorkspaceRects
  fromWorkspacePaneContent: TransitionWorkspacePaneContent
  toWorkspacePaneContent: TransitionWorkspacePaneContent
}

type SessionToConceptsLeftStackState = {
  contextRect: PaneRect
  conceptRectWithSoloGrowth: PaneRect
  showContextPane: boolean
  contextExitTarget: PaneRect
  conceptsPinnedTarget: PaneRect
}

type SessionToConceptsRightStackState = {
  sessionRectWithSharedGap: PaneRect
  detailsRect: PaneRect
  showDetailsPane: boolean
  sessionMiniTarget: PaneRect
  detailsEnterStart: PaneRect
  detailsPinnedTarget: PaneRect
}

function transitionChipRect(left: number, config: UiLayoutConfig): PaneRect {
  return { left, top: 0, width: config.transitionChipWidth, height: config.transitionChipHeight }
}

function renderTransitionOverlayFrame(
  frame: Pick<WorkspaceRects, "frameTop" | "frameLeft" | "frameWidth" | "frameHeight">,
  children: Array<Renderable | VNode<any, any[]>>,
): Array<Renderable | VNode<any, any[]>> {
  return [
    Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#111417cc" }),
    Box(
      { position: "absolute", top: frame.frameTop, left: frame.frameLeft, width: frame.frameWidth, height: frame.frameHeight },
      ...children,
    ),
  ]
}

function resolveTransitionWorkspaceRects(
  shellState: ShellWorkspaceTransitionViewState,
  viewport: ShellViewportState,
  transition: NonNullable<ShellWorkspaceTransitionViewState["workspaceTransition"]>,
): { fromRects: WorkspaceRects; toRects: WorkspaceRects } | null {
  const collapsedWorkspaceRects = workspaceRectsForRatio(shellState, shellState.uiLayoutConfig.collapsedPromptRatio, viewport)
  const conceptsToSessionTransitionSourceRects = workspaceRectsForRatio(shellState, shellState.uiLayoutConfig.conceptsToSessionTransitionCollapsedPromptRatio, viewport)
  const expandedWorkspaceRects = workspaceRectsForRatio(shellState, shellState.uiLayoutConfig.expandedPromptRatio, viewport)
  const conceptsToSessionTransitionRects = workspaceRectsForRatio(shellState, shellState.uiLayoutConfig.conceptsToSessionTransitionExpandedPromptRatio, viewport)
  if (!collapsedWorkspaceRects || !conceptsToSessionTransitionSourceRects || !expandedWorkspaceRects || !conceptsToSessionTransitionRects) return null

  const fromRects = transition.from === "concepts" && transition.to === "session"
    ? conceptsToSessionTransitionSourceRects
    : (transition.from === "concepts" ? collapsedWorkspaceRects : expandedWorkspaceRects)
  const toRects = transition.from === "concepts" && transition.to === "session"
    ? conceptsToSessionTransitionRects
    : (transition.to === "concepts" ? collapsedWorkspaceRects : expandedWorkspaceRects)

  return { fromRects, toRects }
}

function renderConceptsToSessionOverlay(context: TransitionOverlayContext): Array<Renderable | VNode<any, any[]>> {
  const { transition, config, fromWorkspaceRects, toWorkspaceRects, fromWorkspacePaneContent, toWorkspacePaneContent } = context
  const progress = transition.progress
  const conceptsToSessionRightStackStartWidth = Math.max(
    config.minPaneWidth,
    Math.min(fromWorkspaceRects.frameWidth, Math.round(toWorkspaceRects.details.width * config.conceptsToSessionRightStackStartWidthRatio)),
  )
  const conceptsMiniTarget: PaneRect = {
    left: 0,
    top: toWorkspaceRects.conceptPreview.top,
    width: toWorkspaceRects.conceptPreview.width,
    height: toWorkspaceRects.conceptPreview.height,
  }
  const contextPinnedTarget: PaneRect = {
    left: 0,
    top: toWorkspaceRects.context.top,
    width: toWorkspaceRects.context.width,
    height: toWorkspaceRects.context.height,
  }
  const sessionEnterStart: PaneRect = {
    left: rightAlignedLeft(fromWorkspaceRects.frameWidth, conceptsToSessionRightStackStartWidth),
    top: fromWorkspaceRects.frameHeight - conceptsMiniTarget.height,
    width: conceptsToSessionRightStackStartWidth,
    height: conceptsMiniTarget.height,
  }
  const detailsSourceRect: PaneRect = {
    left: rightAlignedLeft(fromWorkspaceRects.frameWidth, conceptsToSessionRightStackStartWidth),
    top: fromWorkspaceRects.details.top,
    width: conceptsToSessionRightStackStartWidth,
    height: fromWorkspaceRects.details.height,
  }
  const transitionProgress = acceleratedProgress(progress, config.workspaceTransitionAcceleration)
  const detailsExitTarget = transitionChipRect(rightAlignedLeft(fromWorkspaceRects.frameWidth, config.transitionChipWidth), config)
  const detailsHeightProgress = acceleratedProgress(transitionProgress, config.conceptsToSessionDetailsHeightAcceleration)
  const detailsRect = interpolateTopRightAnchoredRectWithIndependentHeightProgress(detailsSourceRect, detailsExitTarget, transitionProgress, detailsHeightProgress)
  const detailsVisibleProgress = blendProgress(transitionProgress, config.workspaceTransitionFadeStart, config.workspaceTransitionFadeEnd)
  const showDetailsPane = detailsVisibleProgress < 1
  const sessionRectWithSoloGrowth = interpolateBottomRightAnchoredRect(sessionEnterStart, toWorkspaceRects.session, transitionProgress)
  const contextEnterStart = transitionChipRect(0, config)
  const contextDelay = config.workspaceTransitionStaggerDelay
  const contextProgress = delayedProgress(transitionProgress, contextDelay)
  const showContextPane = revealAfter(transitionProgress, contextDelay)
  const conceptsAnimatedRect = interpolateBottomRightAnchoredRect(fromWorkspaceRects.concepts, conceptsMiniTarget, transitionProgress)
  const contextRect = interpolatePinnedEnter(contextEnterStart, contextPinnedTarget, contextProgress, 3)
  const conceptsRectWithSharedGap = showContextPane
    ? stackRemainderBelow(contextRect, conceptsAnimatedRect, fromWorkspaceRects.frameHeight, config.interPaneGap, config.minPaneHeight)
    : conceptsAnimatedRect

  return renderTransitionOverlayFrame(fromWorkspaceRects, [
    renderAnimatedPane(sessionRectWithSoloGrowth, fromWorkspacePaneContent.sessionNode, COLORS.borderActive, progress > 0.35 ? "Session" : undefined),
    ...(showDetailsPane ? [renderAnimatedPane(detailsRect, fromWorkspacePaneContent.detailsNode, COLORS.border, progress > 0.7 ? undefined : "Details")] : []),
    renderAnimatedPane(conceptsRectWithSharedGap, fromWorkspacePaneContent.conceptsNode, COLORS.borderActive, "Concepts"),
    ...(showContextPane ? [renderAnimatedPane(contextRect, toWorkspacePaneContent.contextNode, COLORS.border, progress > 0.45 ? "Context" : undefined)] : []),
  ])
}

function planSessionToConceptsLeftStack(context: TransitionOverlayContext): SessionToConceptsLeftStackState {
  const { transition, config, fromWorkspaceRects, toWorkspaceRects } = context
  const progress = transition.progress
  const conceptsPinnedTarget: PaneRect = {
    left: 0,
    top: toWorkspaceRects.concepts.top,
    width: toWorkspaceRects.context.width,
    height: toWorkspaceRects.concepts.height,
  }
  const contextExitTarget = transitionChipRect(0, config)
  const transitionProgress = acceleratedProgress(progress, config.workspaceTransitionAcceleration)
  const leftStack = interpolateVerticalStack(fromWorkspaceRects.context, fromWorkspaceRects.conceptPreview, contextExitTarget, conceptsPinnedTarget, transitionProgress, config.interPaneGap)
  const contextRect = leftStack.topRect
  const conceptRect = leftStack.bottomRect
  const contextVisibleProgress = blendProgress(transitionProgress, config.workspaceTransitionFadeStart, config.workspaceTransitionFadeEnd)
  const showContextPane = contextVisibleProgress < 1
  const conceptSoloBlend = blendProgress(transitionProgress, 0.72, 0.9)
  const conceptSoloTop = interpolateValue(fromWorkspaceRects.conceptPreview.top, conceptsPinnedTarget.top, transitionProgress)
  const conceptBottom = interpolateValue(fromWorkspaceRects.conceptPreview.top + fromWorkspaceRects.conceptPreview.height, conceptsPinnedTarget.top + conceptsPinnedTarget.height, transitionProgress)
  const maxConceptTopWhileContextVisible = contextRect.top + contextRect.height + config.interPaneGap
  const blendedConceptTop = interpolateValue(conceptRect.top, conceptSoloTop, conceptSoloBlend)
  const clampedConceptTop = Math.max(blendedConceptTop, maxConceptTopWhileContextVisible)
  const finalConceptTop = interpolateValue(clampedConceptTop, conceptSoloTop, contextVisibleProgress)

  return {
    contextRect,
    conceptRectWithSoloGrowth: {
      left: conceptRect.left,
      top: finalConceptTop,
      width: conceptRect.width,
      height: Math.max(config.minPaneHeight, conceptBottom - finalConceptTop),
    },
    showContextPane,
    contextExitTarget,
    conceptsPinnedTarget,
  }
}

function planSessionToConceptsRightStack(context: TransitionOverlayContext): SessionToConceptsRightStackState {
  const { transition, config, fromWorkspaceRects, toWorkspaceRects } = context
  const progress = transition.progress
  const sessionMiniTarget: PaneRect = {
    left: rightAlignedLeft(fromWorkspaceRects.frameWidth, toWorkspaceRects.session.width),
    top: fromWorkspaceRects.frameHeight - toWorkspaceRects.conceptPreview.height,
    width: toWorkspaceRects.session.width,
    height: toWorkspaceRects.conceptPreview.height,
  }
  const detailsEnterStart = transitionChipRect(rightAlignedLeft(fromWorkspaceRects.frameWidth, config.transitionChipWidth), config)
  const detailsPinnedTarget: PaneRect = {
    left: rightAlignedLeft(fromWorkspaceRects.frameWidth, toWorkspaceRects.session.width),
    top: toWorkspaceRects.details.top,
    width: toWorkspaceRects.session.width,
    height: toWorkspaceRects.details.height,
  }
  const transitionProgress = acceleratedProgress(progress, config.workspaceTransitionAcceleration)
  const detailsDelay = config.workspaceTransitionStaggerDelay
  const detailsProgress = delayedProgress(transitionProgress, detailsDelay)
  const showDetailsPane = revealAfter(transitionProgress, detailsDelay)
  const sessionRect = interpolateBottomRightAnchoredRect(fromWorkspaceRects.session, sessionMiniTarget, transitionProgress)
  const detailsRect = interpolatePinnedEnter(detailsEnterStart, detailsPinnedTarget, detailsProgress, config.minPaneHeight)

  return {
    sessionRectWithSharedGap: showDetailsPane
      ? stackRemainderBelow(detailsRect, sessionRect, fromWorkspaceRects.frameHeight, config.interPaneGap, config.minPaneHeight)
      : sessionRect,
    detailsRect,
    showDetailsPane,
    sessionMiniTarget,
    detailsEnterStart,
    detailsPinnedTarget,
  }
}

function renderSessionToConceptsOverlay(context: TransitionOverlayContext): Array<Renderable | VNode<any, any[]>> {
  const { transition, fromWorkspaceRects, fromWorkspacePaneContent, toWorkspacePaneContent } = context
  const progress = transition.progress
  const leftStack = planSessionToConceptsLeftStack(context)
  const rightStack = planSessionToConceptsRightStack(context)

  return renderTransitionOverlayFrame(fromWorkspaceRects, [
    renderAnimatedPane(rightStack.sessionRectWithSharedGap, fromWorkspacePaneContent.sessionNode, COLORS.borderActive, "Session"),
    ...(leftStack.showContextPane ? [renderAnimatedPane(leftStack.contextRect, fromWorkspacePaneContent.contextNode, COLORS.border, progress > 0.7 ? undefined : "Context")] : []),
    renderAnimatedPane(leftStack.conceptRectWithSoloGrowth, toWorkspacePaneContent.conceptsNode, transition.to === "concepts" ? COLORS.borderActive : COLORS.border, progress > 0.35 ? "Concepts" : undefined),
    ...(rightStack.showDetailsPane ? [renderAnimatedPane(rightStack.detailsRect, toWorkspacePaneContent.detailsNode, COLORS.border, progress > 0.45 ? "Details" : undefined)] : []),
  ])
}

export function renderWorkspaceTransitionOverlay(
  state: AppState,
  deps: ShellWorkspaceTransitionOverlayDeps,
): Array<Renderable | VNode<any, any[]>> {
  const { shellState, viewport, listScroll, mainScroll, promptScroll, renderTransitionPaneContentWithRects } = deps
  const transition = shellState.workspaceTransition
  if (!transition) return []
  const config: UiLayoutConfig = shellState.uiLayoutConfig
  const rects = resolveTransitionWorkspaceRects(shellState, viewport, transition)
  if (!rects) return []
  const { fromRects: fromWorkspaceRects, toRects: toWorkspaceRects } = rects
  const fromWorkspacePaneContent = renderTransitionPaneContentWithRects(state, transition.from, fromWorkspaceRects, listScroll, mainScroll, promptScroll)
  const toWorkspacePaneContent = renderTransitionPaneContentWithRects(state, transition.to, toWorkspaceRects, listScroll, mainScroll, promptScroll)
  if (!fromWorkspacePaneContent || !toWorkspacePaneContent) return []

  const overlayContext: TransitionOverlayContext = {
    transition,
    config,
    fromWorkspaceRects,
    toWorkspaceRects,
    fromWorkspacePaneContent,
    toWorkspacePaneContent,
  }

  if (transition.from === "concepts" && transition.to === "session") {
    return renderConceptsToSessionOverlay(overlayContext)
  }
  return renderSessionToConceptsOverlay(overlayContext)
}
