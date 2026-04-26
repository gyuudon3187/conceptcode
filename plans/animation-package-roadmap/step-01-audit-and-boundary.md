---
title: Animation Package Roadmap Step 01 - Audit and Boundary Classification
status: proposed
type: package-extraction
priority: 1
blockers: []
related_notes:
  - plans/animation-package-roadmap/README.md
  - packages/agent-tui/README.md
  - packages/agent-tui/AGENTS.md
---

# Step 01 - Audit and Boundary Classification

## Summary

Audit the current animation-related code and classify each relevant function into one of three buckets:

- package-owned primitive
- app-owned orchestration
- UI/render-only helper

This step establishes the extraction boundary before any code movement.

## Why it matters

The biggest risk in this roadmap is over-extracting ConceptCode-specific workspace semantics into a reusable package surface.

A clean classification pass keeps the package generic and host-app-friendly, while preventing a vague "animation framework" from forming around one app's current transition behavior.

## Scope

Read and classify relevant code in:

- `src/ui/workspace-transition.ts`
- `src/ui/workspace-transition-geometry.ts` if it still exists
- `packages/agent-tui/src/layout/geometry.ts`
- `packages/agent-tui/src/index.ts`
- `packages/agent-tui/package.json`
- `packages/agent-tui/README.md`
- `packages/agent-tui/AGENTS.md`

Produce a short classification note in this step file or update this file's implementation notes during the implementation session.

## Required classification output

Classify at least these functions:

Likely package-owned primitives:

- `interpolateValue`
- `delayedProgress`
- `revealAfter`
- `acceleratedProgress`
- `blendProgress`
- `interpolateVerticalStack`
- `interpolateBottomRightAnchoredRect`
- `interpolateTopRightAnchoredRectWithIndependentHeightProgress`
- `interpolatePinnedEnter`
- `stackRemainderBelow`

Likely app-owned orchestration:

- `renderWorkspaceTransitionOverlay`
- `renderConceptsToSessionOverlay`
- `renderSessionToConceptsOverlay`
- `computeSessionToConceptsLeftStack`
- `computeSessionToConceptsRightStack`
- `resolveTransitionWorkspaceRects`

Likely UI/render-only:

- `renderAnimatedPane`
- `renderTransitionOverlayFrame`

If the implementation finds better classifications, record them clearly and briefly.

## Implementation notes

- Prefer documenting the classification in a way later steps can follow directly.
- Do not introduce a new package abstraction in this step beyond what is needed to record the boundary.
- If the current package docs already contain a stale boundary statement, note it here for Step 05 rather than fixing it in this step unless the step naturally includes a narrow docs adjustment.

## Implementation notes from 2026-04-26

Confirmed the intended public module name should remain `agent-tui/animation`.

Current code locations reviewed:

- `src/ui/workspace-transition.ts`
- `src/ui/workspace-transition-geometry.ts`
- `packages/agent-tui/src/layout/geometry.ts`
- `packages/agent-tui/src/index.ts`
- `packages/agent-tui/package.json`
- `packages/agent-tui/README.md`
- `packages/agent-tui/AGENTS.md`

Package-owned primitives:

- `interpolateValue`
- `delayedProgress`
- `revealAfter`
- `acceleratedProgress`
- `blendProgress`
- `interpolateVerticalStack`
- `interpolateBottomRightAnchoredRect`
- `interpolateTopRightAnchoredRectWithIndependentHeightProgress`
- `interpolatePinnedEnter`
- `stackRemainderBelow`

Reasoning: all ten helpers are stateless geometry or progress helpers with no dependency on app state, pane body rendering, debug payloads, or ConceptCode-specific workspace semantics. Eight already live under `packages/agent-tui/src/layout/geometry.ts`; the remaining two currently live in `src/ui/workspace-transition-geometry.ts` and are suitable Step 03 migration targets after Step 02 creates the new package module boundary.

App-owned orchestration:

- `renderWorkspaceTransitionOverlay`
- `renderConceptsToSessionOverlay`
- `renderSessionToConceptsOverlay`
- `computeSessionToConceptsLeftStack`
- `computeSessionToConceptsRightStack`
- `resolveTransitionWorkspaceRects`

Reasoning: these functions encode ConceptCode workspace policy, transition branching, pane timing choices, title visibility thresholds, debug payload shape, and app callback wiring. They compose primitives, but the orchestration remains specific to the host app's concepts-vs-session workspace model.

UI/render-only helpers:

- `renderAnimatedPane`
- `renderTransitionOverlayFrame`

Reasoning: these are OpenTUI rendering helpers that wrap already-decided rects into visual nodes. They are not generic animation math, and they also do not establish transition policy. Keeping them app-local avoids creating a mixed render-plus-animation package surface prematurely.

Open questions and follow-up notes:

- `packages/agent-tui/src/index.ts` currently re-exports the existing interpolation helpers from `./layout/geometry`. Step 02 should add a new `./animation` entry point without forcing broad import churn yet.
- `packages/agent-tui/package.json` does not yet export `./animation`; Step 02 should add that subpath.
- `packages/agent-tui/README.md` and `packages/agent-tui/AGENTS.md` currently describe interpolation helpers as part of layout/geometry. Step 05 should update those boundary notes once the new module exists.
- `src/ui/workspace-transition.ts` should remain app-local even after helper extraction because it still depends on app-rendered pane content and workspace-specific transition policy.

## Acceptance criteria

- The relevant current helpers have been classified into package-owned, app-owned, and UI/render-only groups.
- The intended new public module name is confirmed as `agent-tui/animation` unless a strong repo-local reason suggests otherwise.
- Any ambiguity or open questions discovered during the audit are recorded briefly for later steps.
- The result is clear enough that Step 02 can create the new package surface without redoing the analysis.

## Out of scope

- Moving code
- Adding exports
- Deleting files
- Large docs rewrites
- Introducing high-level transition planners
