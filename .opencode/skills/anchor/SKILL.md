---
name: anchor
description: Add or refine a impl concept source anchor, exploration coverage, and narrowly warranted summary updates
compatibility: opencode
metadata:
  audience: maintainers
  domain: concept-graph
  workflow: conceptualize-anchor
  mode: conceptualize
---

# Anchor

Use this skill in conceptualize mode to add or refine a source anchor for an existing `impl` concept after direct inspection.

## Invocation

```text
/anchor @impl.some.concept <file and line evidence>
```

- The command requires exactly one existing `impl` concept.
- Do not use this skill for `domain` concepts.
- The source evidence must be concrete enough to support a compact `loc`.

## What I do

- Add or refine `loc`.
- Update `exploration_coverage` conservatively.
- Refine `summary` only when direct inspection clearly improves it.
- Optionally update `summary_confidence` when the inspected evidence justifies it.

## Boundaries

- Use `/consolidate` when the task expands into broader impl-concept enrichment or child planning.
- Use `/elaborate` when the main task is checking a user-provided explanation.
- Use `/link` when the change is only about `related_paths` navigation.
- Use `/create` when the needed concept does not exist yet.

## Constraints

- `anchor` is impl-only.
- Keep the update narrow and evidence-backed.
- Do not drift into full consolidation.
