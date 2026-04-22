# Slice D: Link And Anchor Workflows

## Goal
Add focused graph-maintenance workflows for navigational linking and implementation anchor enrichment without introducing heavy restructuring.

## Included Milestones
- Milestone 7: navigation and enrichment skills

## Locked Decisions
- `link` should keep `related_paths` sparse and meaningful
- Reciprocal links are optional, not automatic
- `anchor` is root-only
- `anchor` may update `loc` and `exploration_coverage`
- `anchor` may refine summary only when direct inspection clearly improves it

## Scope
- Implement `link`
- Implement `anchor`
- Add skill definitions for both
- Ensure their boundaries relative to `create`, `consolidate`, and `elaborate` are explicit

## Out Of Scope
- `merge`
- `split`
- Additional restructuring features
- Large UI changes

## Required Behavior
- `link`
  - validate all referenced paths exist
  - support add/remove/normalize operations
  - avoid duplicate links
- `anchor`
  - root-only
  - validate source evidence
  - add or refine `loc`
  - update `exploration_coverage`
  - refine summary only when warranted

## Likely Files
- `.opencode/skills/link/SKILL.md`
- `.opencode/skills/anchor/SKILL.md`
- new `src/graph/link-related-paths.ts`
- new `src/graph/anchor-concept.ts`
- `src/graph/analyze.ts`
- `docs/json_schema.md`
- `src/prompt/editor.ts`

## Acceptance Criteria
- `link` can add and remove valid `related_paths`
- `link` avoids duplicates
- `anchor` rejects domain concepts
- `anchor` updates `loc` and coverage correctly for root concepts
- Skill docs clearly distinguish:
  - `create`
  - `consolidate`
  - `elaborate`
  - `anchor`
  - `link`

## Verification
- `bun run typecheck`
- Add or run focused tests for:
  - link add
  - link remove
  - link duplicate normalization
  - anchor root success
  - anchor domain rejection

## Known Risks
- `anchor` can drift into full consolidation if its scope is not kept narrow
- `link` can create graph noise if reciprocal behavior becomes too automatic
