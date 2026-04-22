# Graph Maintenance Slice Plan

This directory breaks the concept-graph maintenance work into bounded execution slices so each implementation session can stay focused, reviewable, and low on context bloat.

For durable maintenance guidance that explains the long-lived operating model for concept-graph edits, see `docs/concept_graph_maintenance.md`.

## Overall Approach

Use one fresh implementation session per slice.

For each slice:

1. Start a new session.
2. Tell the agent to read `docs/concept_graph_maintenance.md`, this `README.md`, and the specific slice file before making changes.
3. Ask the agent to stay within the scope of that slice only.
4. After implementation, review the diff and verification results.
5. Update the checkboxes in this file before starting the next slice.

This approach is intended to:

- keep session context narrow
- reduce the chance of stale assumptions leaking into later work
- make each change set easier to review and test
- let later sessions quickly understand what is already complete

## Session Instructions

When starting a new session for one of these slices, give instructions similar to:

`Implement Slice A according to docs/concept_graph_maintenance.md, plans/graph-maintenance-slices/README.md, and plans/graph-maintenance-slices/slice-a.md. Read all three files first. Stay within the slice scope. Before editing, check which slices are already marked complete in the README and avoid redoing completed work except where the slice explicitly depends on it.`

For later slices, replace `Slice A` and the slice path accordingly.

## Checkbox Update Rules

Update this file at the end of each implementation session.

Use the checkboxes as follows:

- `[ ]` not started
- `[-]` in progress or partially complete
- `[x]` complete and reviewed well enough to build on

When a slice finishes:

1. Mark its status checkbox.
2. Optionally add a short dated note describing what landed.
3. If the implementation materially changed the plan for later slices, add a brief note under the relevant slice.
4. If a slice was only partially completed, mark it `[-]` and list the remaining work.

Try to keep notes short and factual so future sessions can scan them quickly.

## Recommended Execution Order

1. Slice A
2. Slice B
3. Slice C
4. Slice D
5. Slice E1
6. Slice E2

This order follows the dependency structure:

- Slice A fixes current contracts and script mismatches
- Slice B adds validation before heavier graph edits
- Slice C adds the path-ripple foundation for restructuring
- Slice D adds focused maintenance workflows
- Slice E1 and E2 handle the most complex restructuring work last

## Slice Status

- [x] Slice A: `slice-a.md`
  - Scope: contracts, shared graph utilities, create/delete fixes
  - Notes:
  - 2026-04-23: Added shared delete preflight analysis, aligned `implemented` contracts, fixed create validation/defaults, and cleaned delete references under both namespaces.

- [x] Slice B: `slice-b.md`
  - Scope: kind validation and graph audit
  - Notes:
  - 2026-04-23: Added shared kind validation and read-only graph audit with findings for broken links, namespace violations, score issues, missing summaries, and suspicious keys; wired `/validate` skill and prompt suggestion.

- [x] Slice C: `slice-c.md`
  - Scope: path-ripple foundation, rename, and move
  - Notes:
  - 2026-04-23: Added shared path rewrite helpers, rename/move preflight and mutation scripts, conceptualize skills, prompt suggestions, and focused tests for rewrite, collision, and cycle guards.

- [x] Slice D: `slice-d.md`
  - Scope: link and anchor workflows
  - Notes:
  - 2026-04-23: Added `link` and `anchor` graph scripts, conceptualize skills, prompt suggestions, schema guidance, and focused tests for related-path add/remove/normalize plus root-only anchor behavior.

- [x] Slice E1: `slice-e1.md`
  - Scope: merge workflow
  - Notes:
  - 2026-04-23: Added merge preflight and mutation scripts with survivor-wins defaults, child-collision blocking, path and related-path rewrites, conceptualize skill wiring, prompt suggestion, and focused merge tests.

- [x] Slice E2: `slice-e2.md`
  - Scope: split, final docs, and stabilization
  - Notes:
  - 2026-04-23: Added split preflight and mutation scripts, conceptualize skill and prompt suggestion wiring, schema/example updates, focused split tests, and representative validate coverage.

## Notes For Future Sessions

- Treat the slice files as the detailed execution brief.
- Treat this `README.md` as the cross-session progress tracker.
- If a later slice needs a small follow-up fix in an earlier slice's code, keep that fix tightly scoped and note it here.
- If a slice reveals that a later slice should be split further, add a brief note here before starting the next session.
