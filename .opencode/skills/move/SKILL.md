---
name: move
description: Move an existing concept subtree with path-ripple preflight and confirmation
compatibility: opencode
metadata:
  audience: maintainers
  domain: concept-graph
  workflow: conceptualize-move
  mode: conceptualize
---

# Move

Use this skill in conceptualize mode to move an existing concept under a different parent.

## Invocation

```text
/move @root.some.concept @root.other_parent
/move @domain.some.concept @domain.other_parent
```

- The source concept path must already exist.
- The destination parent path must already exist.
- The destination must not create a sibling collision.
- The destination must not be the concept itself or any descendant of that concept.

## Validation and execution

- Use the TypeScript scripts at `src/graph/move-concept-preflight.ts` and `src/graph/move-concept.ts`.
- Run move preflight before mutation and report the impact.
- The preflight must report whether the concept exists, direct child count, descendant count, subtree path rewrites, and `related_paths` rewrites across both namespaces.
- Moves always require explicit confirmation after preflight.
- After confirmation, the script removes the concept from its current parent, attaches it under the destination parent with the same child key, and rewrites descendant paths plus `related_paths` references.

## Constraints

- Do not move `root` or `domain`.
- Do not move a concept into its own descendant.
- Do not skip the confirmation step after preflight.
- Report the old path, new path, subtree impact, and rewritten references.
