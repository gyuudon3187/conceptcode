# Slice B: Kind Validation And Graph Audit

## Goal
Add a read-only graph audit workflow and shared kind validation so graph quality problems can be detected before more advanced restructuring operations are introduced.

## Included Milestones
- Milestone 4: kind validation and graph audit

## Locked Decisions
- Reject known cross-namespace kind mismatches
- Warn on unknown kinds
- Allow missing `kind`
- `validate` is read-only
- `validate` should recommend follow-up skills where useful

## Scope
- Add shared kind validation helpers
- Implement the `validate` graph-audit capability
- Add the `validate` skill
- Update related docs or prompt descriptions as needed

## Out Of Scope
- `rename`
- `move`
- `merge`
- `split`
- `link`
- `anchor`
- New destructive graph operations

## Required Behavior
- Known kind sets must reflect current schema guidance
- `validate` must detect:
  - broken `related_paths`
  - forbidden namespace fields
  - known cross-namespace kind mismatches
  - unknown kinds
  - invalid or suspicious score usage
  - `summary_confidence > exploration_coverage`
  - missing summaries
  - suspicious child keys
- Findings should include:
  - severity
  - affected path
  - affected field(s)
  - short explanation
  - suggested fix skill where possible

## Likely Files
- `docs/json_schema.md`
- `.opencode/skills/validate/SKILL.md`
- `src/graph/analyze.ts`
- or `src/graph/mutate.ts`
- new `src/graph/validate-graph.ts`
- possibly shared kind helper under `src/graph/` or `src/core/`
- `src/prompt/editor.ts`

## Acceptance Criteria
- `validate` runs read-only
- Known kind mismatches are reported as errors
- Unknown kinds are reported as warnings
- Broken `related_paths` are reported with concrete paths
- Score and namespace-field violations are reported correctly
- Skill text matches actual script behavior

## Verification
- `bun run typecheck`
- Add or run focused tests for:
  - root/domain kind mismatch detection
  - unknown kind warning
  - broken `related_paths`
  - forbidden domain metadata
  - `summary_confidence > exploration_coverage`

## Known Risks
- The line between “unknown kind” and “bad kind” must stay consistent with docs
- If finding severity is underspecified, output may become inconsistent across runs
