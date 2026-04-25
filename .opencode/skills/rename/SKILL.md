---
name: rename
description: Rename an existing concept key with path-ripple preflight and confirmation
compatibility: opencode
metadata:
  audience: maintainers
  domain: concept-graph
  workflow: conceptualize-rename
  mode: conceptualize
---

# Rename

Use this skill in conceptualize mode to rename an existing concept by changing its child key.

## Invocation

```text
/rename @impl.some.parent.old_key new_key
/rename @domain.some.parent.old_key new_key
```

- The source concept path must already exist.
- The new key must already be a stable child key string.
- The new key must not collide with an existing sibling.

## Validation and execution

- Use the TypeScript scripts at `src/graph/rename-concept-preflight.ts` and `src/graph/rename-concept.ts`.
- Run rename preflight before mutation and report the impact.
- The preflight must report whether the concept exists, direct child count, descendant count, subtree path rewrites, and `related_paths` rewrites across both namespaces.
- Renames always require explicit confirmation after preflight.
- After confirmation, the script renames the child key, preserves the subtree, and rewrites descendant paths plus `related_paths` references.
- Optionally add the old leaf name to `aliases` only when the user explicitly asks for that behavior.

## Constraints

- Do not rename `impl` or `domain`.
- Do not skip the confirmation step after preflight.
- Report the old path, new path, subtree impact, and rewritten references.
