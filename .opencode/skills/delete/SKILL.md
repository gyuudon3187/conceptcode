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
```

- The command requires an existing concept path.
- If the concept path does not exist, stop and report that clearly.

## Validation and execution

- Use the TypeScript script at `src/graph/delete-concept.ts`.
- The script verifies that the concept exists.
- It removes the concept from its parent's `children` object.
- It also removes all instances of that path from every concept's `related_paths` field.

## Constraints

- Do not run without an explicit existing concept path.
- Do not silently delete `root`.
- Report the deleted path and any cleaned `related_paths` references.
