# Slice A: Contracts, Graph Utilities, Create/Delete Fixes

## Goal
Align the current concept-graph contracts with intended behavior, add shared graph-analysis helpers, and fix the most important correctness gaps in `create` and `delete`.

## Included Milestones
- Milestone 1: lock contracts and wording
- Milestone 2: shared graph analysis foundation
- Milestone 3: baseline script correctness fixes

## Locked Decisions
- Replace `not_yet_implemented` with `implemented`
- `implemented` is allowed only on `root` concepts
- Default new `root` concepts to `implemented: false`
- `domain` concepts must reject `implemented`, `loc`, `exploration_coverage`, and `summary_confidence`
- Reject known cross-namespace kind mismatches
- Warn on unknown kinds
- Allow missing `kind`
- Destructive graph operations always require confirmation
- Deleting a concept deletes its entire descendant subtree
- `/consolidate` is inspection-driven graph enrichment
- `/elaborate` is verification of a user-provided explanation

## Scope
- Update schema and skill wording to match the locked decisions
- Add shared read-only graph-analysis helpers
- Fix `src/graph/create-concept.ts`
- Fix `src/graph/delete-concept.ts`
- Add delete preflight support
- Update slash descriptions if they are now inaccurate

## Out Of Scope
- `validate`
- `rename`
- `move`
- `merge`
- `split`
- `link`
- `anchor`
- New UI flows beyond minimal copy changes

## Required Behavior
- `create`
  - target path must not exist
  - all segments left of the final segment must exist
  - final segment must already be written in stable child-key form
  - require non-empty `summary`
  - reject inline `children`
  - default `implemented: false` for `root`
  - reject `implemented` on `domain`
- `delete`
  - preflight must run before mutation
  - always require confirmation after preflight
  - preflight must report subtree and inbound-reference impact
  - mutation must remove `related_paths` references under both `root` and `domain`

## Likely Files
- `docs/json_schema.md`
- `.opencode/skills/create/SKILL.md`
- `.opencode/skills/delete/SKILL.md`
- `.opencode/skills/consolidate/SKILL.md`
- `.opencode/skills/elaborate/SKILL.md`
- `src/graph/create-concept.ts`
- `src/graph/delete-concept.ts`
- `src/graph/mutate.ts`
- or new `src/graph/analyze.ts`
- `src/prompt/editor.ts`

## Acceptance Criteria
- No remaining contract text refers to `not_yet_implemented`
- `implemented` is documented and enforced as root-only
- `create` behavior matches the documented contract
- `delete` preflight reports:
  - target existence
  - direct child count
  - descendant count
  - inbound `related_paths` reference count
  - referencing paths
  - referencing namespaces
  - subtree deletion flag
- `delete` removes matching `related_paths` references from both namespaces
- Existing skill docs match script behavior

## Verification
- `bun run typecheck`
- Add or run focused tests for:
  - `create` root default `implemented: false`
  - `create` domain forbidden metadata rejection
  - `create` inline `children` rejection
  - `delete` preflight output
  - `delete` cross-namespace `related_paths` cleanup

## Known Risks
- Missing docs/examples may still reference the old field name
- Delete cleanup can appear fixed while still missing one namespace path traversal case
