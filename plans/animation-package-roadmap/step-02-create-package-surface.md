---
title: Animation Package Roadmap Step 02 - Create Package Surface
status: proposed
type: package-extraction
priority: 2
blockers:
  - step-01-audit-and-boundary.md
related_notes:
  - plans/animation-package-roadmap/README.md
  - packages/agent-tui/README.md
  - packages/agent-tui/AGENTS.md
---

# Step 02 - Create Package Surface

## Summary

Create the initial reusable animation module inside `packages/agent-tui` and expose it as `agent-tui/animation`.

This step establishes the public surface before the app is migrated to use it.

## Why it matters

A stable package surface should exist before app-level imports are redirected. That keeps the migration controlled and makes the intended boundary explicit in the package itself.

## Scope

Add a new package module:

- `packages/agent-tui/src/animation.ts`

Update exports so consumers can import it through:

- `agent-tui/animation`

Also decide whether the top-level `agent-tui` index should re-export animation helpers for convenience.

Recommended default:

- yes, top-level re-exports are allowed
- but `agent-tui/animation` should remain the primary explicit module boundary

## Intended contents

The initial module should expose the package-owned stateless animation helpers identified in Step 01.

At minimum it should include:

- progress helpers
- interpolation helpers
- stack geometry helpers

The implementation may initially re-export existing helpers from current internal files rather than moving all code immediately, if that keeps churn lower.

## Implementation notes

- Prefer a small, clean public surface over a perfect internal rearrangement.
- It is acceptable for `animation.ts` to depend on `layout/geometry.ts` initially.
- Do not force a large internal package file split yet unless it clearly improves readability without adding churn.
- Update `packages/agent-tui/package.json` exports.
- Update `packages/agent-tui/src/index.ts` if top-level re-exports are part of the design.

## Implementation notes from 2026-04-26

Implemented `packages/agent-tui/src/animation.ts` as a thin boundary module that currently re-exports the existing package-owned stateless animation helpers from `./layout/geometry`.

Export decision:

- Added the explicit public subpath `agent-tui/animation` via `packages/agent-tui/package.json`.
- Left the existing top-level `agent-tui` exports unchanged instead of adding duplicate convenience aliases.

Reasoning: the repo already exposes these helpers from the package root through `src/index.ts`, so adding a dedicated explicit subpath establishes the intended long-term boundary without creating a second parallel set of root-level names. This keeps Step 02 small and avoids premature import churn before Step 03 migrates app usage.

Step 03 follow-up:

- Move `interpolatePinnedEnter` and `stackRemainderBelow` into the package surface and then update app imports to use `agent-tui/animation`.

## Acceptance criteria

- `agent-tui/animation` exists as a public package export.
- The exported names cover the current package-owned animation primitives from Step 01.
- The package still typechecks.
- No ConceptCode app-specific code has been moved into the package in this step.

## Out of scope

- Full app migration
- Removing app-local duplicate helpers
- Broad package docs updates beyond what is needed to keep exports coherent
- Higher-level transition orchestrators
