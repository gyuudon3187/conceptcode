---
title: Animation Package Roadmap Step 03 - Migrate Current Helpers
status: proposed
type: package-extraction
priority: 3
blockers:
  - step-02-create-package-surface.md
related_notes:
  - plans/animation-package-roadmap/README.md
  - src/ui/workspace-transition.ts
---

# Step 03 - Migrate Current Helpers

## Summary

Move the currently app-local reusable animation helpers into the new package surface, update app imports to use `agent-tui/animation`, and remove local duplicate helper files that are no longer needed.

## Why it matters

This step is where the package boundary becomes real. The app should stop owning generic animation primitives once the package surface exists.

## Scope

Migrate the current reusable local helpers into `packages/agent-tui` and update ConceptCode to consume them from the package.

The current known local helper file is:

- `src/ui/workspace-transition-geometry.ts`

If that file still exists and all of its contents are genuinely package-worthy after Step 01, remove it after migration.

Update app imports so animation primitives come from:

- `agent-tui/animation`

Keep layout-only imports in:

- `agent-tui/layout/geometry`

## Implementation notes

- Preserve behavior exactly unless a small bug fix is clearly necessary and tightly scoped.
- Keep `workspace-transition.ts` focused on transition orchestration and rendering.
- Do not extract `renderAnimatedPane`, `renderTransitionOverlayFrame`, or workspace-specific transition planners into the package.
- If any helper turns out not to be generic enough, keep it app-local and note why briefly.

## Implementation notes from 2026-04-26

Migrated the remaining app-local generic helpers into `packages/agent-tui/src/animation.ts`:

- `interpolatePinnedEnter`
- `stackRemainderBelow`

Updated `src/ui/workspace-transition.ts` to import generic animation primitives from `agent-tui/animation` while keeping layout-only helpers in `agent-tui/layout/geometry`.

Removed the now-obsolete duplicate file:

- `src/ui/workspace-transition-geometry.ts`

Behavior was preserved. `workspace-transition.ts` still owns only app-specific transition orchestration, workspace policy, pane timing, debug payload shape, and rendering helpers.

## Acceptance criteria

- ConceptCode imports generic animation helpers from `agent-tui/animation`.
- App-local duplicate generic animation helper code has been removed where appropriate.
- `workspace-transition.ts` still contains only app-specific orchestration and rendering concerns.
- The repo typechecks after the migration.

## Out of scope

- Large reorganization of app transition orchestration
- New high-level transition APIs
- Major behavior changes
