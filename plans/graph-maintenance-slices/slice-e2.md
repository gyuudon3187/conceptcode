# Slice E2: Split, Final Docs, And Stabilization

## Goal
Add a safe, explicit `split` workflow for decomposing overloaded concepts, then finish the remaining documentation, examples, and verification so the graph-maintenance skill set is coherent and stable.

## Included Milestones
- Milestone 8: advanced restructuring skills (split portion)
- Milestone 9: docs, prompt integration, and examples
- Milestone 10: verification and stabilization

## Locked Decisions
- `split` preserves the original concept as an umbrella parent by default
- `split` always requires preflight plus confirmation
- Split behavior should be explicit, not magical
- Final docs and examples must reflect `implemented`, the current skill set, and current confirmation rules

## Scope
- Implement `split`
- Add split preflight support
- Add the `split` skill
- Complete docs, prompt descriptions, and examples
- Complete focused tests and stabilization

## Out Of Scope
- New graph operations beyond the agreed set
- Broad UI redesign
- Additional merge work beyond any minimal follow-up fixes required for consistency

## Required Behavior
- `split`
  - validate target exists
  - require explicit proposed new paths
  - preflight reports redistribution plan
  - default behavior preserves original concept as umbrella parent
  - mutation must avoid orphaned references
- Final docs and examples must reflect:
  - `implemented`
  - current skill set
  - current contracts
  - current warning and confirmation rules

## Likely Files
- `.opencode/skills/split/SKILL.md`
- new `src/graph/split-concept.ts`
- new `src/graph/split-concept-preflight.ts`
- `docs/json_schema.md`
- examples under `examples/`
- `src/prompt/editor.ts`
- test files for graph operations

## Acceptance Criteria
- `split` preflight reports the requested redistribution plan before mutation
- `split` produces the requested structure without orphaned references
- All skill docs match actual behavior
- Examples and schema docs are up to date
- Tests cover split behavior and critical regressions

## Verification
- `bun run typecheck`
- Add or run focused tests for:
  - split preserving umbrella parent
  - split collision rejection
  - split reference integrity
  - final validate pass on representative graphs

## Known Risks
- Split semantics can become hard to reason about without explicit user input
- Final polish work can sprawl if not kept bounded to agreed documentation and stabilization tasks
