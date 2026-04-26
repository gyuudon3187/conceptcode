# Animation Package Roadmap

This directory breaks the animation-package extraction work into bounded implementation steps so future sessions can execute one step at a time with minimal prior conversation context.

The current intended package target is `packages/agent-tui`, with a new public module boundary at `agent-tui/animation`.

This roadmap is written so a future agent can be told to implement "the next step" by reading this `README.md` plus the first not-yet-complete step file listed in the Step Status section.

## Overall Goal

Extract reusable animation and transition primitives from app-local UI code into a reusable package surface that can be used by ConceptCode now and by other OpenTUI-style projects later.

The package should own stateless, host-app-friendly animation helpers such as:

- progress shaping helpers
- rect interpolation helpers
- stack transition geometry helpers

The app should continue to own:

- transition orchestration
- pane-specific semantics
- rendering of app-specific pane bodies
- app-specific debug payloads
- workspace-specific layout policy

## Execution Model

Use one focused implementation session per step.

For each step:

1. Read this `README.md`.
2. Check the Step Status section and select the first step marked `[ ]`.
3. Read the corresponding step file before making changes.
4. Stay within that step's scope.
5. Implement the step completely, including tests and docs updates required by that step.
6. At the end of the session, update this `README.md`:
   - mark the step as `[x]` if complete
   - mark it as `[-]` if partially complete
   - add a short factual note if needed
7. If the implementation materially changes later steps, update the relevant step file or add a short note under the step in this `README.md`.

## Session Instruction Template

When starting a new implementation session, give instructions similar to:

`Implement the next step in plans/animation-package-roadmap/README.md. Read that README first, identify the first incomplete step, then read the corresponding step file and stay within its scope. When finished, update the step checkbox in the README and add a short note if the step changed later work.`

## Checkbox Rules

Use the checkboxes as follows:

- `[ ]` not started
- `[-]` in progress or partially complete
- `[x]` complete and reviewed well enough to build on

When a step finishes:

1. Mark its status checkbox.
2. Optionally add a short dated note describing what landed.
3. If a step was only partially completed, mark it `[-]` and list the remaining work briefly.
4. If a later step needs to change because of the implementation, add a short note here and update the later step file if necessary.

Keep notes short and factual.

## Package Direction

The intended near-term public surface is:

- `agent-tui/animation`
- existing `agent-tui/layout/geometry` remains available

The intended boundary is:

Package-owned:

- stateless progress helpers
- stateless interpolation helpers
- stateless transition geometry helpers
- package-local tests and docs for those helpers

App-owned:

- workspace rect selection policy
- transition branch orchestration
- pane rendering
- app-specific debug logging and payload shape

Do not extract ConceptCode-specific workspace semantics into the package unless a later step explicitly says to do so.

## Step Order

1. Step 01: Audit and boundary classification
2. Step 02: Create the package surface
3. Step 03: Migrate current helpers and remove app-local duplicates
4. Step 04: Expand tests
5. Step 05: Update docs and package boundary notes
6. Step 06: Evaluate whether any higher-level transition helpers should be extracted

This order is deliberate:

- Step 01 defines the boundary clearly before moving code.
- Step 02 establishes the reusable public surface before app migration.
- Step 03 performs the actual app-to-package migration.
- Step 04 ensures the extracted behavior is protected with package-local tests.
- Step 05 makes the new boundary durable for future contributors.
- Step 06 is intentionally last so it can build on the stabilized lower-level surface rather than guessing too early.

## Step Status

- [x] Step 01: `step-01-audit-and-boundary.md`
  - Scope: classify current animation-related code into package-owned primitives, app-owned orchestration, and UI-only rendering helpers.
  - 2026-04-26: Classified current helpers and confirmed `agent-tui/animation` as the intended new module boundary.

- [x] Step 02: `step-02-create-package-surface.md`
  - Scope: add the new `agent-tui/animation` module and public exports without yet forcing broad app-level restructuring.
  - 2026-04-26: Added `packages/agent-tui/src/animation.ts` and the `agent-tui/animation` export path as a thin boundary over existing helpers.

- [x] Step 03: `step-03-migrate-current-helpers.md`
  - Scope: move current reusable helpers into the package surface, update app imports, and remove local duplicate helper files.
  - 2026-04-26: Moved `interpolatePinnedEnter` and `stackRemainderBelow` into `agent-tui/animation`, updated app imports, and deleted `src/ui/workspace-transition-geometry.ts`.

- [x] Step 04: `step-04-expand-tests.md`
  - Scope: add or expand package-local tests for the extracted animation helpers and any affected existing helpers.
  - 2026-04-26: Added direct package-local coverage for `interpolatePinnedEnter`, `stackRemainderBelow`, and basic progress-helper behavior.

- [x] Step 05: `step-05-update-docs-and-boundaries.md`
  - Scope: update package docs, package AGENTS guidance, and any repo-level notes that describe the old boundary.
  - 2026-04-26: Updated package README and package-local AGENTS guidance to document `agent-tui/animation` and the still-app-local transition orchestration boundary.

- [x] Step 06: `step-06-evaluate-next-extractions.md`
  - Scope: evaluate whether any higher-level transition planning helpers should also move into the package, without forcing extraction if the abstraction is still app-specific.
  - 2026-04-26: Evaluated the next transition-helper layer and kept it app-local; current planners still encode ConceptCode workspace semantics and are not package-worthy yet.

## Notes For Future Sessions

- Treat this `README.md` as the source of truth for execution order and progress.
- Treat each step file as the detailed execution brief for that step.
- Do not skip ahead unless an earlier step is already complete.
- If a step reveals that a later step should be split further, add a short note here before starting the next step.
- Favor small boundary-tightening changes over a broad animation-framework redesign.
