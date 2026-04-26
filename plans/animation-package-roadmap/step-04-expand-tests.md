---
title: Animation Package Roadmap Step 04 - Expand Tests
status: proposed
type: package-extraction
priority: 4
blockers:
  - step-03-migrate-current-helpers.md
related_notes:
  - plans/animation-package-roadmap/README.md
  - packages/agent-tui/src/geometry.test.ts
---

# Step 04 - Expand Tests

## Summary

Add or expand package-local tests so the extracted animation helpers are covered where they now live.

## Why it matters

Once the app depends on package-owned animation primitives, the behavior needs package-local protection. This step makes the extraction durable and safer for later reuse in other projects.

## Scope

Add or extend tests for the extracted helpers.

At minimum, cover:

- `interpolatePinnedEnter`
- `stackRemainderBelow`

Also review whether existing tests already cover:

- `interpolateValue`
- progress helpers
- existing anchored rect interpolation helpers
- `interpolateVerticalStack`

If the current `geometry.test.ts` becomes too mixed, split tests into a clearer package-local file such as:

- `animation.test.ts`

Prefer the smallest clean structure that keeps tests readable.

## Implementation notes

Test behavior, not implementation detail.

Recommended cases:

- `interpolatePinnedEnter`
  - top stays pinned to target
  - left, width, and height interpolate
  - min-height clamp works
- `stackRemainderBelow`
  - top is anchor bottom plus gap
  - left and width come from base rect
  - height uses remaining frame space
  - min-height clamp works

## Implementation notes from 2026-04-26

Expanded `packages/agent-tui/src/geometry.test.ts` instead of creating a separate `animation.test.ts` file because the existing file already covered math-oriented helper behavior and remained readable after the additions.

Added direct package-local coverage for:

- `interpolatePinnedEnter`
  - target top stays pinned
  - left and width interpolate
  - min-height clamp applies
- `stackRemainderBelow`
  - top is computed from anchor bottom plus gap
  - left and width are inherited from the base rect
  - remaining frame height is used when available
  - min-height clamp applies when space runs short

Also added a small direct test for existing progress helpers:

- `delayedProgress`
- `revealAfter`
- `acceleratedProgress`
- `blendProgress`

Existing anchored-rect and vertical-stack coverage remained in place.

## Acceptance criteria

- The extracted animation helpers have package-local tests.
- The test location and naming are clear enough for future package contributors.
- Existing package tests still pass.

## Out of scope

- Snapshot-heavy UI render tests
- App-level transition orchestration tests unless a narrow regression requires them
- Broader package test redesign
