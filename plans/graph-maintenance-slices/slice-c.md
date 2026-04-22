# Slice C: Path-Ripple Foundation, Rename, And Move

## Goal
Add a shared path-rewrite engine and use it to implement safe `rename` and `move` operations with preflight impact summaries and confirmation.

## Included Milestones
- Milestone 5: path-ripple foundation
- Milestone 6: core restructuring skills

## Locked Decisions
- `rename` is the primary workflow for key/path ripple caused by child-key changes
- `rename` may optionally add an old leaf name to `aliases`, but default is off
- `move` cannot move a concept into its own descendant
- `rename` and `move` always require confirmation after preflight
- Path ripple must update descendant paths and `related_paths` references across both namespaces

## Scope
- Implement shared path rewrite helpers
- Implement `rename` preflight and mutation
- Implement `move` preflight and mutation
- Add `rename` and `move` skills
- Update prompt slash descriptions

## Out Of Scope
- `merge`
- `split`
- `link`
- `anchor`
- Large UI changes beyond command descriptions

## Required Behavior
- Shared path rewrite support for:
  - exact path replacement
  - subtree prefix replacement
  - namespace-wide `related_paths` updates
- `rename`
  - validate target exists
  - validate new child key format
  - reject collisions
  - preflight reports impacted subtree paths and reference rewrites
- `move`
  - validate target exists
  - validate destination parent exists
  - reject collisions
  - reject moving into own descendant
  - preflight reports subtree and reference rewrites

## Likely Files
- `.opencode/skills/rename/SKILL.md`
- `.opencode/skills/move/SKILL.md`
- new `src/graph/rewrite-paths.ts`
- new `src/graph/rename-concept.ts`
- new `src/graph/rename-concept-preflight.ts`
- new `src/graph/move-concept.ts`
- new `src/graph/move-concept-preflight.ts`
- `src/graph/analyze.ts`
- `src/prompt/editor.ts`

## Acceptance Criteria
- Renaming a concept rewrites descendant and `related_paths` references correctly
- Moving a concept rewrites descendant and `related_paths` references correctly
- `root` and `domain` references are both updated
- Preflight output is concrete enough for safe confirmation
- `move` rejects cycles
- `rename` rejects invalid keys and sibling collisions

## Verification
- `bun run typecheck`
- Add or run focused tests for:
  - leaf rename with inbound references
  - subtree rename with descendant reference rewrites
  - move to new parent
  - move cycle rejection
  - rename collision rejection
  - move collision rejection

## Known Risks
- Prefix-rewrite bugs can silently corrupt paths
- Exact-path and descendant-path rewrites must not over-match unrelated paths
