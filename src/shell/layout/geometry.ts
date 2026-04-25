import type { UiLayoutConfig } from "../../core/types"

export type PaneRect = { left: number; top: number; width: number; height: number }

export type WideWorkspaceGeometry = {
  frameLeft: number
  frameTop: number
  frameWidth: number
  frameHeight: number
  promptPaneWidth: number
  sidebarWidth: number
  supportHeight: number
  previewHeight: number
}

export type GeometryViewport = {
  width: number
  height: number
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

export function wideWorkspaceGeometryForRatio(layoutMode: "wide" | "narrow", config: UiLayoutConfig, promptPaneRatio: number, viewport: GeometryViewport): WideWorkspaceGeometry | null {
  if (layoutMode !== "wide") return null
  const rootPadding = config.rootPadding
  const frameInnerWidth = Math.max(config.minFrameWidth, viewport.width - config.viewportHorizontalInset)
  const frameHeight = Math.max(config.minFrameHeight, viewport.height - (rootPadding * 2))
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
