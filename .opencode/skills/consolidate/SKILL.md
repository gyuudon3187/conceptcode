---
name: consolidate
description: Explore a required concept path, update concept metadata, and plan low-coverage child updates before applying them
compatibility: opencode
metadata:
  audience: maintainers
  domain: concept-graph
  workflow: conceptualize-consolidation
  mode: conceptualize
---

# Consolidate

Use this skill in conceptualize mode to improve a concept graph entry after directly inspecting the implementation behind a concept.

## Invocation

```text
/consolidate @root.some.concept
```

- The command requires exactly one target concept reference.
- Do not run this skill without an explicit concept path.
- If the user does not provide a concept path, ask for one instead of guessing.

## What I do

- Inspect the code underlying the target concept.
- Update the target concept's `summary` when the current summary is incomplete, vague, or wrong.
- Update related concept metadata such as `related_paths` when direct inspection shows it would materially improve navigation.
- Update `exploration_coverage` and `summary_confidence` conservatively for each concept changed.

## Coverage-first rule

- Treat `exploration_coverage` as the main planning metric.
- If the target concept has any child concept with `exploration_coverage < 0.9`, stop before making graph edits to the parent and create a plan to update those low-coverage children first.
- Present that plan to the user and require approval before continuing.
- After the user approves, update the low-coverage children first, then return to the parent concept.

## Scoring guidance

- Keep both `exploration_coverage` and `summary_confidence` in the `0.0` to `1.0` range.
- Use conservative bucketed scores:
  - `0.2`: light skim
  - `0.4`: limited direct inspection
  - `0.6`: main implementation inspected
  - `0.8`: main implementation plus key interactions inspected
  - `0.9`: thorough inspection
  - `1.0`: unusually exhaustive coverage within reasonable scope
- `summary_confidence` should usually not exceed `exploration_coverage`.

## Constraints

- Preserve stable keys under `children` whenever possible.
- Prefer minimal, local concept-graph edits.
- Do not edit implementation code as part of this skill.
- Omit weak anchors rather than guessing.
- Use `related_paths` only when they add real navigational value.

## Expected behavior

1. Resolve the target concept path.
2. Inspect the target concept and its nearby implementation evidence.
3. Check child concepts for `exploration_coverage < 0.9`.
4. If any child is below threshold, produce an approval-required child-update plan.
5. After approval, update low-coverage children.
6. Update the target concept.
7. Return a concrete graph diff or implementation-ready graph edit summary.
