export {
  interpolateValue,
  delayedProgress,
  revealAfter,
  acceleratedProgress,
  blendProgress,
  interpolateVerticalStack,
  interpolateBottomRightAnchoredRect,
  interpolateTopRightAnchoredRectWithIndependentHeightProgress,
} from "./layout/geometry"

export type { PaneRect } from "./layout/geometry"

import { interpolateValue, type PaneRect } from "./layout/geometry"

export function stackRemainderBelow(
  anchorRect: PaneRect,
  baseRect: PaneRect,
  frameHeight: number,
  gap: number,
  minHeight: number,
): PaneRect {
  const top = anchorRect.top + anchorRect.height + gap
  return {
    left: baseRect.left,
    top,
    width: baseRect.width,
    height: Math.max(minHeight, frameHeight - top),
  }
}

export function interpolatePinnedEnter(
  startRect: PaneRect,
  targetRect: PaneRect,
  progress: number,
  minHeight: number,
): PaneRect {
  return {
    left: interpolateValue(startRect.left, targetRect.left, progress),
    top: targetRect.top,
    width: interpolateValue(startRect.width, targetRect.width, progress),
    height: Math.max(minHeight, interpolateValue(startRect.height, targetRect.height, progress)),
  }
}
