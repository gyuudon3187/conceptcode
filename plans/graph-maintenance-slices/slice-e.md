# Slice E: Merge, Split, Final Docs, And Stabilization

## Goal
Add advanced restructuring workflows for consolidating or decomposing concepts, then finish the documentation and verification pass so the full graph-maintenance skill set is coherent and test-backed.

## Included Milestones
- Milestone 8: advanced restructuring skills
- Milestone 9: docs, prompt integration, and examples
- Milestone 10: verification and stabilization

## Locked Decisions
- `merge` uses an explicit survivor concept
- Default merge conflict policy: survivor wins unless explicitly overridden
- `split` preserves the original concept as an umbrella parent by default
- `merge` and `split` always require preflight plus confirmation
- These operations should be explicit, not magical

## Scope
- Implement `merge`
- Implement `split`
- Add their skills
- Complete docs, prompt descriptions, and examples
- Complete focused tests and stabilization

## Out Of Scope
- New graph operations beyond the agreed set
- Broad UI redesign

## Required Behavior
- `merge`
  - validate both paths exist
  - preflight reports:
    - survivor path
    - removed path
    - field conflicts
    - child collisions
    - rewrite counts
  - mutation rewrites references and removes merged-away concept
- `split`
  - validate target exists
  - require explicit proposed new paths
  - preflight reports redistribution plan
  - default behavior preserves original concept as umbrella parent
- Final docs and examples must reflect:
  - `implemented`
  - current skill set
  - current contracts
  - current warning/confirmation rules

## Likely Files
- `.opencode/skills/merge/SKILL.md`
- `.opencode/skills/split/SKILL.md`
- new `src/graph/merge-concepts.ts`
- new `src/graph/merge-concepts-preflight.ts`
- new `src/graph/split-concept.ts`
- new `src/graph/split-concept-preflight.ts`
- `docs/json_schema.md`
- examples under `examples/`
- `src/prompt/editor.ts`
- test files for graph operations

## Acceptance Criteria
- `merge` preflight reports conflicts and impact before mutation
- `merge` rewrites references and removes the losing concept correctly
- `split` produces the requested structure without orphaned references
- All skill docs match actual behavior
- Examples and schema docs are up to date
- Tests cover the new operations and critical regressions

## Verification
- `bun run typecheck`
- Add or run focused tests for:
  - merge with inbound references
  - merge child collision handling
  - split preserving umbrella parent
  - split collision rejection
  - final validate pass on representative graphs

## Known Risks
- Merge semantics can become ambiguous when fields and children conflict
- Split semantics can become hard to reason about without explicit user input
- This slice may be too large and can be split into:
  - E1: merge
  - E2: split plus final polish
