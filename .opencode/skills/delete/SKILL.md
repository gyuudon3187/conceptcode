---
name: delete
description: Delete an existing concept and remove related-path references through a TypeScript graph update script
compatibility: opencode
metadata:
  audience: maintainers
  domain: concept-graph
  workflow: conceptualize-delete
  mode: conceptualize
---

# Delete

Use this skill in conceptualize mode to remove an existing concept from the concept graph.

## Invocation

```text
/delete @root.some.concept
/delete @domain.some.concept
```

- The command requires an existing concept path.
- If the concept path does not exist, stop and report that clearly.

## Validation and execution

- Use the TypeScript script at `src/graph/delete-concept.ts`.
- Run delete preflight before mutation and report the impact.
- The preflight must report whether the concept exists, direct child count, descendant count, inbound `related_paths` reference count, referencing paths, referencing namespaces, and whether subtree deletion will occur.
- Destructive graph operations always require explicit confirmation after preflight.
- After confirmation, the script removes the concept from its parent's `children` object, deleting the entire descendant subtree.
- It also removes all instances of that path from every concept's `related_paths` field under both `root` and `domain`.

## Constraints

- Do not run without an explicit existing concept path.
- Do not silently delete `root` or `domain`.
- Do not skip the confirmation step after preflight.
- Report the deleted path, subtree impact, and any cleaned `related_paths` references.
