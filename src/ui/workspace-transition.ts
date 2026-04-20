import { appendFile } from "node:fs/promises"
import { join } from "node:path"

import { Box, type Renderable, ScrollBoxRenderable, type VNode } from "@opentui/core"

import type { AppState, WorkspaceFocus } from "../core/types"
import { COLORS } from "./theme"

export type PaneRect = { left: number; top: number; width: number; height: number }

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

type WideWorkspaceGeometry = {
  frameLeft: number
  frameTop: number
  frameWidth: number
  frameHeight: number
  promptPaneWidth: number
  sidebarWidth: number
  supportHeight: number
  previewHeight: number
}

export function rightAlignedLeft(containerWidth: number, paneWidth: number): number {
  return containerWidth - paneWidth
}

export function interpolateValue(from: number, to: number, progress: number): number {
  return Math.round(from + (to - from) * progress)
}

export function delayedProgress(progress: number, delayFraction: number): number {
  if (progress <= delayFraction) return 0
  return Math.min(1, (progress - delayFraction) / (1 - delayFraction))
}

export function revealAfter(progress: number, delayFraction: number): boolean {
  return progress > delayFraction
}

export function acceleratedProgress(progress: number, factor: number): number {
  return Math.min(1, progress * factor)
}

export function blendProgress(progress: number, start: number, end: number): number {
  if (progress <= start) return 0
  if (progress >= end) return 1
  return (progress - start) / (end - start)
}

export function interpolateVerticalStack(topFrom: PaneRect, bottomFrom: PaneRect, topTo: PaneRect, bottomTo: PaneRect, progress: number, gap: number): { topRect: PaneRect; bottomRect: PaneRect } {
  const topLeft = interpolateValue(topFrom.left, topTo.left, progress)
  const topWidth = interpolateValue(topFrom.width, topTo.width, progress)
  const bottomLeft = interpolateValue(bottomFrom.left, bottomTo.left, progress)
  const bottomWidth = interpolateValue(bottomFrom.width, bottomTo.width, progress)
  const columnTop = interpolateValue(topFrom.top, topTo.top, progress)
  const columnBottom = interpolateValue(bottomFrom.top + bottomFrom.height, bottomTo.top + bottomTo.height, progress)
  const topHeight = Math.max(3, interpolateValue(topFrom.height, topTo.height, progress))
  const bottomTop = columnTop + topHeight + gap
  const bottomHeight = Math.max(3, columnBottom - bottomTop)
  return {
    topRect: { left: topLeft, top: columnTop, width: topWidth, height: topHeight },
    bottomRect: { left: bottomLeft, top: bottomTop, width: bottomWidth, height: bottomHeight },
  }
}

export function interpolateBottomRightAnchoredRect(from: PaneRect, to: PaneRect, progress: number): PaneRect {
  const width = Math.max(8, Math.round(from.width + (to.width - from.width) * progress))
  const height = Math.max(3, Math.round(from.height + (to.height - from.height) * progress))
  const fromRight = from.left + from.width
  const toRight = to.left + to.width
  const right = Math.round(fromRight + (toRight - fromRight) * progress)
  const fromBottom = from.top + from.height
  const toBottom = to.top + to.height
  const bottom = Math.round(fromBottom + (toBottom - fromBottom) * progress)
  return {
    left: right - width,
    top: bottom - height,
    width,
    height,
  }
}

export function interpolateTopRightAnchoredRectWithIndependentHeightProgress(from: PaneRect, to: PaneRect, progress: number, heightProgress: number): PaneRect {
  const width = Math.max(8, Math.round(from.width + (to.width - from.width) * progress))
  const height = Math.max(3, Math.round(from.height + (to.height - from.height) * heightProgress))
  const fromRight = from.left + from.width
  const toRight = to.left + to.width
  const right = Math.round(fromRight + (toRight - fromRight) * progress)
  const top = Math.round(from.top + (to.top - from.top) * progress)
  return {
    left: right - width,
    top,
    width,
    height,
  }
}

function wideWorkspaceGeometryForRatio(state: AppState, promptPaneRatio: number): WideWorkspaceGeometry | null {
  if (state.layoutMode !== "wide") return null
  const config = state.uiLayoutConfig
  const viewportWidth = process.stdout.columns || 120
  const viewportHeight = process.stdout.rows || 36
  const rootPadding = config.rootPadding
  const frameInnerWidth = Math.max(config.minFrameWidth, viewportWidth - config.viewportHorizontalInset)
  const frameHeight = Math.max(config.minFrameHeight, viewportHeight - (rootPadding * 2))
  const promptPaneWidth = Math.max(config.minPromptPaneWidth, Math.floor((frameInnerWidth - config.interPaneGap) * promptPaneRatio))
  const sidebarWidth = Math.max(config.minSidebarWidth, frameInnerWidth - config.interPaneGap - promptPaneWidth)
  const supportHeight = config.supportHeight
  const previewHeight = Math.max(config.minPreviewHeight, frameHeight - supportHeight - config.interPaneGap)
  return {
    frameLeft: rootPadding,
    frameTop: rootPadding,
    frameWidth: frameInnerWidth,
    frameHeight,
    promptPaneWidth,
    sidebarWidth,
    supportHeight,
    previewHeight,
  }
}

export function wideWorkspaceGeometry(state: AppState): WideWorkspaceGeometry | null {
  return wideWorkspaceGeometryForRatio(state, state.promptPaneRatio)
}

export function workspaceRects(state: AppState): WorkspaceRects | null {
  return workspaceRectsForRatio(state, state.promptPaneRatio)
}

export function workspaceRectsForRatio(state: AppState, promptPaneRatio: number): WorkspaceRects | null {
  const geometry = wideWorkspaceGeometryForRatio(state, promptPaneRatio)
  if (!geometry) return null
  const rowGap = state.uiLayoutConfig.interPaneGap
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

const DEBUG_WORKSPACE_TRANSITION = true
const WORKSPACE_DEBUG_LOG_PATH = join(process.cwd(), "workspace-transition-debug.log")

async function appendWorkspaceDebugLog(event: string, payload: Record<string, unknown>): Promise<void> {
  if (!DEBUG_WORKSPACE_TRANSITION) return
  const line = `${JSON.stringify({ ts: new Date().toISOString(), event, ...payload })}\n`
  try {
    await appendFile(WORKSPACE_DEBUG_LOG_PATH, line, "utf8")
  } catch {
  }
}

function renderAnimatedPane(rect: PaneRect, child: Renderable | VNode<any, any[]>, borderColor: string, title?: string): Renderable | VNode<any, any[]> {
  return Box(
    { position: "absolute", left: rect.left, top: rect.top, width: rect.width, height: rect.height, borderStyle: "rounded", borderColor, title, padding: 1, backgroundColor: COLORS.panel, flexDirection: "column" },
    child,
  )
}

type TransitionWorkspaceNodes = WorkspaceRects & {
  sessionNode: Renderable | VNode<any, any[]>
  contextNode: Renderable | VNode<any, any[]>
  conceptPreviewNode: Renderable | VNode<any, any[]>
  detailsNode: Renderable | VNode<any, any[]>
  conceptsNode: Renderable | VNode<any, any[]>
}

type TransitionPaneRenderer = (state: AppState, focus: WorkspaceFocus, rects: WorkspaceRects, listScroll: ScrollBoxRenderable, mainScroll: ScrollBoxRenderable, promptScroll: ScrollBoxRenderable | null) => TransitionWorkspaceNodes | null

export function renderWorkspaceTransitionOverlay(
  state: AppState,
  listScroll: ScrollBoxRenderable,
  mainScroll: ScrollBoxRenderable,
  promptScroll: ScrollBoxRenderable | null,
  renderTransitionPaneContentWithRects: TransitionPaneRenderer,
): Array<Renderable | VNode<any, any[]>> {
  const transition = state.workspaceTransition
  if (!transition) return []
  const config = state.uiLayoutConfig
  const collapsedWorkspaceRects = workspaceRectsForRatio(state, state.uiLayoutConfig.collapsedPromptRatio)
  const conceptsToSessionTransitionSourceRects = workspaceRectsForRatio(state, state.uiLayoutConfig.conceptsToSessionTransitionCollapsedPromptRatio)
  const expandedWorkspaceRects = workspaceRectsForRatio(state, state.uiLayoutConfig.expandedPromptRatio)
  const conceptsToSessionTransitionRects = workspaceRectsForRatio(state, state.uiLayoutConfig.conceptsToSessionTransitionExpandedPromptRatio)
  if (!collapsedWorkspaceRects || !conceptsToSessionTransitionSourceRects || !expandedWorkspaceRects || !conceptsToSessionTransitionRects) return []
  const fromRects = transition.from === "concepts" && transition.to === "session"
    ? conceptsToSessionTransitionSourceRects
    : (transition.from === "concepts" ? collapsedWorkspaceRects : expandedWorkspaceRects)
  const toRects = transition.from === "concepts" && transition.to === "session"
    ? conceptsToSessionTransitionRects
    : (transition.to === "concepts" ? collapsedWorkspaceRects : expandedWorkspaceRects)
  const fromWorkspace = renderTransitionPaneContentWithRects(state, transition.from, fromRects, listScroll, mainScroll, promptScroll)
  const toWorkspace = renderTransitionPaneContentWithRects(state, transition.to, toRects, listScroll, mainScroll, promptScroll)
  if (!fromWorkspace || !toWorkspace) return []
  const progress = transition.progress
  if (transition.from === "concepts" && transition.to === "session") {
    const conceptsToSessionRightStackStartWidth = Math.max(
      config.minPaneWidth,
      Math.min(fromWorkspace.frameWidth, Math.round(toWorkspace.details.width * config.conceptsToSessionRightStackStartWidthRatio)),
    )
    const conceptsMiniTarget: PaneRect = {
      left: 0,
      top: toWorkspace.conceptPreview.top,
      width: toWorkspace.conceptPreview.width,
      height: toWorkspace.conceptPreview.height,
    }
    const contextPinnedTarget: PaneRect = {
      left: 0,
      top: toWorkspace.context.top,
      width: toWorkspace.context.width,
      height: toWorkspace.context.height,
    }
    const sessionEnterStart: PaneRect = {
      left: rightAlignedLeft(fromWorkspace.frameWidth, conceptsToSessionRightStackStartWidth),
      top: fromWorkspace.frameHeight - conceptsMiniTarget.height,
      width: conceptsToSessionRightStackStartWidth,
      height: conceptsMiniTarget.height,
    }
    const detailsSourceRect: PaneRect = {
      left: rightAlignedLeft(fromWorkspace.frameWidth, conceptsToSessionRightStackStartWidth),
      top: fromWorkspace.details.top,
      width: conceptsToSessionRightStackStartWidth,
      height: fromWorkspace.details.height,
    }
    const detailsExitTarget: PaneRect = { left: rightAlignedLeft(fromWorkspace.frameWidth, config.transitionChipWidth), top: 0, width: config.transitionChipWidth, height: config.transitionChipHeight }
    const rightStackProgress = acceleratedProgress(progress, config.workspaceTransitionAcceleration)
    const detailsHeightProgress = acceleratedProgress(rightStackProgress, config.conceptsToSessionDetailsHeightAcceleration)
    const detailsRect = interpolateTopRightAnchoredRectWithIndependentHeightProgress(detailsSourceRect, detailsExitTarget, rightStackProgress, detailsHeightProgress)
    const detailsVisibleProgress = blendProgress(rightStackProgress, config.workspaceTransitionFadeStart, config.workspaceTransitionFadeEnd)
    const showDetailsPane = detailsVisibleProgress < 1
    const sessionRectWithSoloGrowth = interpolateBottomRightAnchoredRect(sessionEnterStart, toWorkspace.session, rightStackProgress)
    const contextEnterStart: PaneRect = { left: 0, top: 0, width: config.transitionChipWidth, height: config.transitionChipHeight }
    const leftStackProgress = acceleratedProgress(progress, config.workspaceTransitionAcceleration)
    const contextDelay = config.workspaceTransitionStaggerDelay
    const contextProgress = delayedProgress(leftStackProgress, contextDelay)
    const showContextPane = revealAfter(leftStackProgress, contextDelay)
    const conceptsAnimatedRect = interpolateBottomRightAnchoredRect(fromWorkspace.concepts, conceptsMiniTarget, leftStackProgress)
    const contextHeight = Math.max(3, interpolateValue(contextEnterStart.height, contextPinnedTarget.height, contextProgress))
    const contextWidth = interpolateValue(contextEnterStart.width, contextPinnedTarget.width, contextProgress)
    const contextLeft = interpolateValue(contextEnterStart.left, contextPinnedTarget.left, contextProgress)
    const contextRect: PaneRect = {
      left: contextLeft,
      top: contextPinnedTarget.top,
      width: contextWidth,
      height: contextHeight,
    }
    const conceptsRectWithSharedGap = showContextPane
      ? {
          left: conceptsAnimatedRect.left,
          top: contextRect.top + contextRect.height + 1,
          width: conceptsAnimatedRect.width,
          height: Math.max(config.minPaneHeight, fromWorkspace.frameHeight - (contextRect.top + contextRect.height + config.interPaneGap)),
        }
      : conceptsAnimatedRect
    if (!transition.loggedFirstFrame) {
      transition.loggedFirstFrame = true
      void appendWorkspaceDebugLog("transition_first_frame", {
        from: transition.from,
        to: transition.to,
        progress,
        viewportWidth: process.stdout.columns || 120,
        viewportHeight: process.stdout.rows || 36,
        concepts: {
          from: fromWorkspace.concepts,
          miniTarget: conceptsMiniTarget,
          current: conceptsRectWithSharedGap,
        },
        session: {
          from: sessionEnterStart,
          target: toWorkspace.session,
          current: sessionRectWithSoloGrowth,
        },
        details: {
          from: fromWorkspace.details,
          exitTarget: detailsExitTarget,
          current: detailsRect,
        },
        context: {
          enterStart: contextEnterStart,
          target: contextPinnedTarget,
          current: contextRect,
        },
      })
    }
    return [
      Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#111417cc" }),
      Box(
        { position: "absolute", top: fromWorkspace.frameTop, left: fromWorkspace.frameLeft, width: fromWorkspace.frameWidth, height: fromWorkspace.frameHeight },
        renderAnimatedPane(sessionRectWithSoloGrowth, fromWorkspace.sessionNode, COLORS.borderActive, progress > 0.35 ? "Session" : undefined),
        ...(showDetailsPane ? [renderAnimatedPane(detailsRect, fromWorkspace.detailsNode, COLORS.border, progress > 0.7 ? undefined : "Details")] : []),
        renderAnimatedPane(conceptsRectWithSharedGap, fromWorkspace.conceptsNode, COLORS.borderActive, "Concepts"),
        ...(showContextPane ? [renderAnimatedPane(contextRect, toWorkspace.contextNode, COLORS.border, progress > 0.45 ? "Context" : undefined)] : []),
      ),
    ]
  }
  const sessionMiniTarget: PaneRect = {
    left: rightAlignedLeft(fromWorkspace.frameWidth, toWorkspace.session.width),
    top: fromWorkspace.frameHeight - toWorkspace.conceptPreview.height,
    width: toWorkspace.session.width,
    height: toWorkspace.conceptPreview.height,
  }
  const conceptsPinnedTarget: PaneRect = {
    left: 0,
    top: toWorkspace.concepts.top,
    width: toWorkspace.context.width,
    height: toWorkspace.concepts.height,
  }
  const contextExitTarget: PaneRect = { left: 0, top: 0, width: config.transitionChipWidth, height: config.transitionChipHeight }
  const leftStackProgress = acceleratedProgress(progress, config.workspaceTransitionAcceleration)
  const leftStack = interpolateVerticalStack(fromWorkspace.context, fromWorkspace.conceptPreview, contextExitTarget, conceptsPinnedTarget, leftStackProgress, config.interPaneGap)
  const contextRect = leftStack.topRect
  const conceptRect = leftStack.bottomRect
  const contextVisibleProgress = blendProgress(leftStackProgress, config.workspaceTransitionFadeStart, config.workspaceTransitionFadeEnd)
  const showContextPane = contextVisibleProgress < 1
  const conceptSoloBlend = blendProgress(leftStackProgress, 0.72, 0.9)
  const conceptSoloTop = interpolateValue(fromWorkspace.conceptPreview.top, conceptsPinnedTarget.top, leftStackProgress)
  const conceptBottom = interpolateValue(fromWorkspace.conceptPreview.top + fromWorkspace.conceptPreview.height, conceptsPinnedTarget.top + conceptsPinnedTarget.height, leftStackProgress)
  const maxConceptTopWhileContextVisible = contextRect.top + contextRect.height + config.interPaneGap
  const blendedConceptTop = interpolateValue(conceptRect.top, conceptSoloTop, conceptSoloBlend)
  const clampedConceptTop = Math.max(blendedConceptTop, maxConceptTopWhileContextVisible)
  const finalConceptTop = interpolateValue(clampedConceptTop, conceptSoloTop, contextVisibleProgress)
  const conceptRectWithSoloGrowth: PaneRect = {
    left: conceptRect.left,
    top: finalConceptTop,
    width: conceptRect.width,
    height: Math.max(config.minPaneHeight, conceptBottom - finalConceptTop),
  }
  const detailsEnterStart: PaneRect = { left: rightAlignedLeft(fromWorkspace.frameWidth, config.transitionChipWidth), top: 0, width: config.transitionChipWidth, height: config.transitionChipHeight }
  const detailsPinnedTarget: PaneRect = {
    left: rightAlignedLeft(fromWorkspace.frameWidth, toWorkspace.session.width),
    top: toWorkspace.details.top,
    width: toWorkspace.session.width,
    height: toWorkspace.details.height,
  }
  const rightStackProgress = acceleratedProgress(progress, config.workspaceTransitionAcceleration)
  const detailsDelay = config.workspaceTransitionStaggerDelay
  const detailsProgress = delayedProgress(rightStackProgress, detailsDelay)
  const showDetailsPane = revealAfter(rightStackProgress, detailsDelay)
  const sessionRect = interpolateBottomRightAnchoredRect(fromWorkspace.session, sessionMiniTarget, rightStackProgress)
  const detailsHeight = Math.max(config.minPaneHeight, interpolateValue(detailsEnterStart.height, detailsPinnedTarget.height, detailsProgress))
  const detailsWidth = interpolateValue(detailsEnterStart.width, detailsPinnedTarget.width, detailsProgress)
  const detailsLeft = interpolateValue(detailsEnterStart.left, detailsPinnedTarget.left, detailsProgress)
  const detailsRect: PaneRect = {
    left: detailsLeft,
    top: detailsPinnedTarget.top,
    width: detailsWidth,
    height: detailsHeight,
  }
  const sessionRectWithSharedGap: PaneRect = showDetailsPane
    ? {
        left: sessionRect.left,
        top: detailsRect.top + detailsRect.height + 1,
        width: sessionRect.width,
        height: Math.max(config.minPaneHeight, (fromWorkspace.frameHeight) - (detailsRect.top + detailsRect.height + config.interPaneGap)),
      }
    : sessionRect
  if (!transition.loggedFirstFrame) {
    transition.loggedFirstFrame = true
    const sessionFromRight = fromWorkspace.session.left + fromWorkspace.session.width
    const sessionTargetRight = sessionMiniTarget.left + sessionMiniTarget.width
    const detailsStartRight = detailsEnterStart.left + detailsEnterStart.width
    const detailsTargetRight = detailsPinnedTarget.left + detailsPinnedTarget.width
    const detailsCurrentRight = detailsRect.left + detailsRect.width
    void appendWorkspaceDebugLog("transition_first_frame", {
      from: transition.from,
      to: transition.to,
      progress,
      viewportWidth: process.stdout.columns || 120,
      viewportHeight: process.stdout.rows || 36,
      outerFrame: { left: fromWorkspace.frameLeft, top: fromWorkspace.frameTop, width: fromWorkspace.frameWidth, height: fromWorkspace.frameHeight },
      innerCanvas: { left: fromWorkspace.frameLeft + fromWorkspace.canvasLeft, top: fromWorkspace.frameTop + fromWorkspace.canvasTop, width: fromWorkspace.canvasWidth, height: fromWorkspace.canvasHeight },
      overlayContainer: { top: fromWorkspace.frameTop, left: fromWorkspace.frameLeft, width: fromWorkspace.frameWidth, height: fromWorkspace.frameHeight },
      frameRightEdge: fromWorkspace.frameLeft + fromWorkspace.frameWidth,
      canvasRightEdge: fromWorkspace.frameLeft + fromWorkspace.canvasLeft + fromWorkspace.canvasWidth,
      session: {
        liveOuter: {
          left: fromWorkspace.frameLeft + fromWorkspace.session.left,
          top: fromWorkspace.frameTop + fromWorkspace.session.top,
          width: fromWorkspace.session.width,
          height: fromWorkspace.session.height,
        },
        animatedOuter: {
          left: fromWorkspace.frameLeft + sessionRect.left,
          top: fromWorkspace.frameTop + sessionRect.top,
          width: sessionRectWithSharedGap.width,
          height: sessionRectWithSharedGap.height,
        },
        from: fromWorkspace.session,
        target: sessionMiniTarget,
        current: sessionRectWithSharedGap,
        rightEdges: {
          from: sessionFromRight,
          target: sessionTargetRight,
          current: sessionRectWithSharedGap.left + sessionRectWithSharedGap.width,
          liveOuter: fromWorkspace.frameLeft + fromWorkspace.session.left + fromWorkspace.session.width,
          animatedOuter: fromWorkspace.frameLeft + sessionRectWithSharedGap.left + sessionRectWithSharedGap.width,
        },
        distanceToFrameRight: {
          liveOuter: (fromWorkspace.frameLeft + fromWorkspace.frameWidth) - (fromWorkspace.frameLeft + fromWorkspace.session.left + fromWorkspace.session.width),
          animatedOuter: (fromWorkspace.frameLeft + fromWorkspace.frameWidth) - (fromWorkspace.frameLeft + sessionRectWithSharedGap.left + sessionRectWithSharedGap.width),
        },
        distanceToCanvasRight: {
          liveOuter: (fromWorkspace.frameLeft + fromWorkspace.canvasLeft + fromWorkspace.canvasWidth) - (fromWorkspace.frameLeft + fromWorkspace.session.left + fromWorkspace.session.width),
          animatedOuter: (fromWorkspace.frameLeft + fromWorkspace.canvasLeft + fromWorkspace.canvasWidth) - (fromWorkspace.frameLeft + sessionRectWithSharedGap.left + sessionRectWithSharedGap.width),
        },
      },
      details: {
        liveOuter: {
          left: fromWorkspace.frameLeft + detailsPinnedTarget.left,
          top: fromWorkspace.frameTop + detailsPinnedTarget.top,
          width: detailsPinnedTarget.width,
          height: detailsPinnedTarget.height,
        },
        animatedOuter: {
          left: fromWorkspace.frameLeft + detailsRect.left,
          top: fromWorkspace.frameTop + detailsRect.top,
          width: detailsRect.width,
          height: detailsRect.height,
        },
        start: detailsEnterStart,
        target: detailsPinnedTarget,
        current: detailsRect,
        rightEdges: {
          start: detailsStartRight,
          target: detailsTargetRight,
          current: detailsCurrentRight,
          liveOuter: fromWorkspace.frameLeft + detailsPinnedTarget.left + detailsPinnedTarget.width,
          animatedOuter: fromWorkspace.frameLeft + detailsRect.left + detailsRect.width,
        },
        distanceToFrameRight: {
          liveOuter: (fromWorkspace.frameLeft + fromWorkspace.frameWidth) - (fromWorkspace.frameLeft + detailsPinnedTarget.left + detailsPinnedTarget.width),
          animatedOuter: (fromWorkspace.frameLeft + fromWorkspace.frameWidth) - (fromWorkspace.frameLeft + detailsRect.left + detailsRect.width),
        },
        distanceToCanvasRight: {
          liveOuter: (fromWorkspace.frameLeft + fromWorkspace.canvasLeft + fromWorkspace.canvasWidth) - (fromWorkspace.frameLeft + detailsPinnedTarget.left + detailsPinnedTarget.width),
          animatedOuter: (fromWorkspace.frameLeft + fromWorkspace.canvasLeft + fromWorkspace.canvasWidth) - (fromWorkspace.frameLeft + detailsRect.left + detailsRect.width),
        },
      },
    })
  }
  return [
    Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#111417cc" }),
    Box(
      { position: "absolute", top: fromWorkspace.frameTop, left: fromWorkspace.frameLeft, width: fromWorkspace.frameWidth, height: fromWorkspace.frameHeight },
      renderAnimatedPane(sessionRectWithSharedGap, fromWorkspace.sessionNode, COLORS.borderActive, "Session"),
      ...(showContextPane ? [renderAnimatedPane(contextRect, fromWorkspace.contextNode, COLORS.border, progress > 0.7 ? undefined : "Context")] : []),
      renderAnimatedPane(conceptRectWithSoloGrowth, toWorkspace.conceptsNode, transition.to === "concepts" ? COLORS.borderActive : COLORS.border, progress > 0.35 ? "Concepts" : undefined),
      ...(showDetailsPane ? [renderAnimatedPane(detailsRect, toWorkspace.detailsNode, COLORS.border, progress > 0.45 ? "Details" : undefined)] : []),
    ),
  ]
}
