---
name: split
description: Split an overloaded concept into explicit child groupings with preflight and confirmation
compatibility: opencode
metadata:
  audience: maintainers
  domain: concept-graph
  workflow: conceptualize-split
  mode: conceptualize
---

# Split

Use this skill in conceptualize mode to decompose an overloaded concept into clearer sub-concepts without deleting the original umbrella parent.

## Invocation

```text
/split @root.some.concept new_group:child_a,child_b other_group:child_c
/split @domain.some.concept concept_slice:rule_a,rule_b
```

- The source concept path must already exist.
- Every proposed target must include an explicit new child key and one or more existing child keys to move under it.
- The target child keys must not already exist under the source concept.
- Each moved child may appear in only one target.

## Validation and execution

- Use the TypeScript scripts at `src/graph/split-concept-preflight.ts` and `src/graph/split-concept.ts`.
- Run split preflight before mutation and report the redistribution plan.
- The preflight must report whether the concept exists, the requested target count, the requested moved-child count, untouched child keys, target-by-target subtree rewrites, and `related_paths` rewrites across both namespaces.
- Splits always require explicit confirmation after preflight.
- Default behavior preserves the original concept as an umbrella parent and creates new child concepts beneath it.
- After confirmation, the script creates the requested target concepts, moves the assigned children into them, rewrites descendant paths plus `related_paths` references, and keeps the source concept in place.

## Constraints

- Do not skip the confirmation step after preflight.
- Do not guess redistribution targets; require explicit proposed new paths and child assignments.
- Do not silently duplicate or drop child subtrees.
- Keep the resulting structure explicit and reviewable.
