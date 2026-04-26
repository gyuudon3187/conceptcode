---
title: Animation Package Roadmap Step 05 - Update Docs and Boundaries
status: proposed
type: docs
priority: 5
blockers:
  - step-04-expand-tests.md
related_notes:
  - plans/animation-package-roadmap/README.md
  - packages/agent-tui/README.md
  - packages/agent-tui/AGENTS.md
---

# Step 05 - Update Docs and Boundaries

## Summary

Update package docs and boundary guidance so the new animation surface is clearly documented and future contributors know what belongs in the package versus the app.

## Why it matters

A reusable package boundary is not durable unless the docs and local agent guidance describe it accurately.

## Scope

Update:

- `packages/agent-tui/README.md`
- `packages/agent-tui/AGENTS.md`

Optionally update other nearby notes only if they are now misleading because of the extraction.

The docs should explain:

- that `agent-tui` now owns reusable animation primitives in addition to layout geometry
- that `agent-tui/animation` is the package entrypoint for those helpers
- that ConceptCode still owns workspace-specific transition orchestration and pane rendering

## Implementation notes

- Keep the documentation specific and factual.
- Do not oversell the package as a general-purpose animation framework.
- Keep the package boundary OpenTUI-oriented unless there is a strong concrete reason to widen it.
- If `workspace-transition.ts` is still app-local, say so clearly.

## Implementation notes from 2026-04-26

Updated `packages/agent-tui/README.md` to reflect the extracted animation boundary:

- added `animation primitives` to package scope
- documented `agent-tui/animation` as a main export
- clarified that host apps should import reusable progress and interpolation helpers from that entrypoint
- clarified that workspace-specific transition orchestration and pane rendering remain app-owned
- updated the package test coverage note to include reusable animation primitives

Updated `packages/agent-tui/AGENTS.md` to reflect the same boundary:

- split `layout and interpolation helpers` into layout helpers plus stateless animation primitives
- explicitly named `agent-tui/animation` as the package surface for those primitives
- updated change guidance so animation changes are expected to carry package-local tests
- replaced the stale note that only lower-level geometry helpers were package-owned

No broader repo-wide docs were changed in this step because the stale statements identified during the audit were localized to the package README and package-local agent guidance.

## Acceptance criteria

- The package README reflects the new animation surface.
- The package AGENTS guidance reflects the updated boundary.
- There are no obviously stale statements claiming only lower-level geometry helpers are package-owned if that is no longer true.

## Out of scope

- Marketing-style docs
- New external documentation sites
- Broad repo-wide docs cleanup unless directly needed
