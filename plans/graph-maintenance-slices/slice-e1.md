# Slice E1: Merge Workflow

## Goal
Add a safe, explicit `merge` workflow for consolidating overlapping concepts into one canonical survivor, with preflight conflict reporting, confirmation, and correct path/reference rewrites.

## Included Milestones
- Milestone 8: advanced restructuring skills (merge portion)

## Locked Decisions
- `merge` uses an explicit survivor concept
- Default merge conflict policy: survivor wins unless explicitly overridden
- `merge` always requires preflight plus confirmation
- Merge behavior should be explicit, not magical
- Path and `related_paths` ripple must be updated correctly across both namespaces

## Scope
- Implement `merge`
- Add merge preflight support
- Add the `merge` skill
- Add focused tests for merge behavior

## Out Of Scope
- `split`
- Final docs and examples beyond what is needed to document `merge`
- Broad stabilization or unrelated refactors

## Required Behavior
- Validate both concept paths exist
- Preflight must report:
  - survivor path
  - removed path
  - field conflicts
  - child collisions
  - rewrite counts
- Mutation must:
  - merge metadata conservatively
  - rewrite references to the removed concept
  - remove the merged-away concept
- If conflicts need explicit resolution beyond survivor-wins defaults, surface them clearly before mutation

## Likely Files
- `.opencode/skills/merge/SKILL.md`
- new `src/graph/merge-concepts.ts`
- new `src/graph/merge-concepts-preflight.ts`
- `src/graph/analyze.ts`
- `src/graph/rewrite-paths.ts`
- test files for graph operations
- `src/prompt/editor.ts`

## Acceptance Criteria
- `merge` preflight reports conflicts and impact before mutation
- `merge` rewrites references and removes the losing concept correctly
- Child collisions are surfaced clearly
- Skill text matches actual script behavior

## Verification
- `bun run typecheck`
- Add or run focused tests for:
  - merge with inbound references
  - merge child collision handling
  - merge survivor-wins default behavior

## Known Risks
- Merge semantics can become ambiguous when metadata or children conflict
- Reference rewrites must avoid over-matching unrelated paths
