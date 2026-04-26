---
title: Animation Package Roadmap Step 06 - Evaluate Next Extractions
status: proposed
type: future-design
priority: 6
blockers:
  - step-05-update-docs-and-boundaries.md
related_notes:
  - plans/animation-package-roadmap/README.md
  - src/ui/workspace-transition.ts
  - packages/agent-tui/README.md
---

# Step 06 - Evaluate Next Extractions

## Summary

Evaluate whether any higher-level transition helpers should also move into the package now that the lower-level animation primitives are extracted and stable.

This is an evaluation step, not a guaranteed extraction step.

## Why it matters

The lower-level surface may reveal a natural second layer of reusable transition helpers. But extracting too early can hard-code ConceptCode's workspace semantics into a package API that should remain generic.

## Scope

Review whether any app-local helpers now have a genuinely reusable shape.

Possible candidates to evaluate:

- a generic helper that grows a remaining pane around another visible pane
- a generic helper that models a two-pane stack transition
- a host-app-friendly transition geometry contract

Evaluate them against these questions:

- Does the helper encode app-specific pane semantics?
- Can it be expressed without ConceptCode-specific naming?
- Would another OpenTUI app plausibly use the same abstraction?
- Is the resulting API simpler than keeping the logic local?

If the answer is not clearly yes, keep the helper app-local and record that decision briefly.

## Implementation notes

- Prefer a conservative decision.
- It is acceptable for this step to conclude that no further extraction should happen yet.
- If a helper is extracted, keep the API narrow and structural.
- If this step reveals multiple distinct future directions, split them into follow-up plan files rather than forcing them into one implementation step.

## Evaluation result from 2026-04-26

Decision: no further extraction should happen yet.

Helpers evaluated and result:

- `resolveTransitionWorkspaceRects`: keep local
- `renderConceptsToSessionOverlay`: keep local
- `renderSessionToConceptsOverlay`: keep local
- `computeSessionToConceptsLeftStack`: keep local
- `computeSessionToConceptsRightStack`: keep local

Why `resolveTransitionWorkspaceRects` stays local:

- It encodes ConceptCode workspace modes and transition-specific prompt ratios from `UiLayoutConfig`.
- Its branch structure depends on the app's `concepts` and `session` workspace identities.
- Another OpenTUI app would likely have different workspace names, different transition pairs, or no paired-workspace model at all.

Why the overlay renderers stay local:

- `renderConceptsToSessionOverlay` and `renderSessionToConceptsOverlay` mix geometry planning with pane-title reveal timing, border styling, app-specific pane composition, and debug payload shape.
- Their inputs and outputs are tied to ConceptCode's five-pane workspace model: `session`, `context`, `conceptPreview`, `details`, and `concepts`.
- Extracting them now would either preserve ConceptCode-flavored names in the package or introduce a wider abstraction layer that is harder to understand than the current local code.

Why the stack planners stay local:

- `computeSessionToConceptsLeftStack` and `computeSessionToConceptsRightStack` look structurally reusable at first, but they still encode app-specific target selection, fade timing, solo-growth behavior, and assumptions about which pane occupies the top or bottom slot.
- The resulting package API would need several semantic knobs just to reproduce current behavior, which is a sign the abstraction is not yet mature.

Candidate ideas considered but rejected for now:

- A generic helper that grows a remaining pane around another visible pane:
  - already covered well enough by `stackRemainderBelow`; no broader planner API is justified yet.
- A generic two-pane stack transition helper:
  - plausible in theory, but the current implementations still depend on ConceptCode-specific sequencing and target semantics.
- A host-app-friendly transition geometry contract:
  - not yet simpler than the current local `WorkspaceRects` plus app render callback boundary.

Follow-up guidance:

- Re-evaluate extraction only if a second app or a second ConceptCode transition path needs the same planner shape.
- Until then, keep the package focused on stateless primitives and keep workspace transition orchestration in `src/ui/workspace-transition.ts`.

Post-roadmap follow-up note from 2026-04-26:

- A later session attempted to migrate the fixed-duration workspace transition driver in `src/app/workspace.ts` from manual `setTimeout` stepping to `@opentui/core` `Timeline`.
- The experiment regressed runtime behavior: the app rendered the first transition frame and then jumped to completion without visible intermediate animation, so the migration was reverted.
- Re-investigation found the main integration gap: `TimelineEngine.attach()` advances timelines on renderer frame callbacks and requests live mode, but it does not itself call `renderer.requestRender()` on each timeline update.
- In this app's `@opentui/core` usage, that means timeline progress can advance without repainting the app tree unless the controller explicitly redraws from the animation `onUpdate` path.
- A minimal controller-only proof using `Timeline` for `state.workspaceTransition.progress` and calling the app `redraw()` from `onUpdate` restored visible intermediate workspace animation in the live TUI without reintroducing the earlier hang.
- `agent-tui/animation` remains the correct home for stateless rect/progress helpers, while any future `Timeline` adoption should be treated as a separate controller-layer experiment and revalidated in the live TUI before landing.

## Acceptance criteria

- A clear keep-local versus extract-next decision is recorded for the next layer of transition helpers.
- Any extraction done in this step is justified by concrete reuse potential, not hypothetical generality.
- The package boundary remains simpler and more durable after the step, not more abstract and harder to understand.

## Out of scope

- A large redesign of transition orchestration
- Turning `agent-tui` into a framework-level animation system
- Package extraction based only on speculative future reuse
