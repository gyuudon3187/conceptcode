---
name: link
description: Add, remove, or normalize sparse related_paths links between existing concepts
compatibility: opencode
metadata:
  audience: maintainers
  domain: concept-graph
  workflow: conceptualize-link
  mode: conceptualize
---

# Link

Use this skill in conceptualize mode to maintain focused navigational links through `related_paths`.

## Invocation

```text
/link add @impl.some.concept @impl.other.concept
/link remove @impl.some.concept @domain.related.policy
/link normalize @impl.some.concept
```

- The first concept is the concept being edited.
- All referenced target paths must already exist.
- Reciprocal links are optional and should not be added automatically.

## What I do

- Add one or more valid `related_paths` entries.
- Remove one or more `related_paths` entries.
- Normalize an existing `related_paths` array by removing duplicates and non-string noise.

## Boundaries

- Use `/create` to add a missing concept instead of linking to a path that does not exist.
- Use `/anchor` to add or refine `loc` and `exploration_coverage` for a impl concept.
- Use `/consolidate` for inspection-driven metadata enrichment that may touch multiple related fields.
- Use `/elaborate` when the main task is verifying a user explanation and updating the summary.

## Constraints

- Keep `related_paths` sparse and meaningful.
- Do not create reciprocal links automatically.
- Do not guess missing paths.
