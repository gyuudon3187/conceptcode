import { describe, expect, test } from "bun:test"

import { interpolateBottomRightAnchoredRect, interpolateTopRightAnchoredRectWithIndependentHeightProgress, interpolateVerticalStack, wideWorkspaceGeometryForRatio } from "./layout/geometry"
import type { PaneRect } from "./layout/geometry"
import type { UiLayoutConfig } from "./types"

const layoutConfig: UiLayoutConfig = {
  collapsedPromptRatio: 0.34,
  conceptsToSessionTransitionCollapsedPromptRatio: 0.4,
  expandedPromptRatio: 0.6,
  conceptsToSessionTransitionExpandedPromptRatio: 0.72,
  conceptsToSessionRightStackStartWidthRatio: 0.45,
  conceptsToSessionDetailsHeightAcceleration: 1.2,
  promptAnimationEpsilon: 0.001,
  promptAnimationStepMs: 16,
  promptAnimationLerp: 0.2,
  workspaceTransitionStepMs: 16,
  workspaceTransitionDurationMs: 180,
  workspaceTransitionAcceleration: 1.2,
  workspaceTransitionEndEasePower: 2,
  workspaceTransitionStaggerDelay: 0.12,
  workspaceTransitionFadeStart: 0.1,
  workspaceTransitionFadeEnd: 0.9,
  viewportHorizontalInset: 6,
  rootPadding: 2,
  interPaneGap: 1,
  minFrameWidth: 60,
  minFrameHeight: 20,
  minPromptPaneWidth: 18,
  minSidebarWidth: 20,
  supportHeight: 8,
  minPreviewHeight: 10,
  minPaneWidth: 12,
  minPaneHeight: 3,
  transitionChipWidth: 12,
  transitionChipHeight: 3,
}

describe("agent-tui geometry helpers", () => {
  test("wide workspace geometry respects viewport and ratio", () => {
    expect(wideWorkspaceGeometryForRatio("narrow", layoutConfig, 0.4, { width: 120, height: 40 })).toBeNull()

    expect(wideWorkspaceGeometryForRatio("wide", layoutConfig, 0.4, { width: 120, height: 40 })).toEqual({
      frameLeft: 2,
      frameTop: 2,
      frameWidth: 114,
      frameHeight: 36,
      promptPaneWidth: 45,
      sidebarWidth: 68,
      supportHeight: 8,
      previewHeight: 27,
    })
  })

  test("vertical stack interpolation preserves a minimum bottom pane height", () => {
    const topFrom: PaneRect = { left: 0, top: 0, width: 20, height: 6 }
    const bottomFrom: PaneRect = { left: 0, top: 7, width: 20, height: 3 }
    const topTo: PaneRect = { left: 10, top: 0, width: 30, height: 9 }
    const bottomTo: PaneRect = { left: 10, top: 10, width: 30, height: 1 }

    expect(interpolateVerticalStack(topFrom, bottomFrom, topTo, bottomTo, 1, 1)).toEqual({
      topRect: { left: 10, top: 0, width: 30, height: 9 },
      bottomRect: { left: 10, top: 10, width: 30, height: 3 },
    })
  })

  test("anchored rectangle interpolation keeps right and bottom edges stable", () => {
    const from: PaneRect = { left: 10, top: 4, width: 20, height: 8 }
    const to: PaneRect = { left: 30, top: 10, width: 12, height: 4 }

    expect(interpolateBottomRightAnchoredRect(from, to, 0.5)).toEqual({
      left: 20,
      top: 7,
      width: 16,
      height: 6,
    })

    expect(interpolateTopRightAnchoredRectWithIndependentHeightProgress(from, to, 0.5, 1)).toEqual({
      left: 20,
      top: 7,
      width: 16,
      height: 4,
    })
  })
})
