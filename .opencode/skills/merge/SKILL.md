---
name: merge
description: Merge two existing concepts into an explicit survivor with preflight and confirmation
compatibility: opencode
metadata:
  audience: maintainers
  domain: concept-graph
  workflow: conceptualize-merge
  mode: conceptualize
---

# Merge

Use this skill in conceptualize mode to consolidate two overlapping concepts into one explicit survivor.

## Invocation

```text
/merge @root.survivor @root.removed
/merge @domain.survivor @domain.removed
```

- The first concept path is always the survivor.
- The second concept path is the concept that will be removed after merge.
- Both concept paths must already exist.
- The paths must be distinct.

## Validation and execution

- Use the TypeScript scripts at `src/graph/merge-concepts-preflight.ts` and `src/graph/merge-concepts.ts`.
- Run merge preflight before mutation and report the impact.
- The preflight must report the survivor path, removed path, field conflicts, child collisions, subtree rewrite count, and `related_paths` rewrites across both namespaces.
- Merges always require explicit confirmation after preflight.
- Default conflict policy is survivor-wins unless the user explicitly requests field overrides.
- After confirmation, the script keeps survivor metadata by default, fills missing survivor fields from the removed concept, rewrites references from the removed path to the survivor path, moves non-colliding children onto the survivor, and deletes the removed concept.

## Constraints

- Do not skip the confirmation step after preflight.
- Do not proceed when child collisions exist; surface them for manual resolution first.
- Report any survivor-vs-removed field conflicts clearly before mutation.
