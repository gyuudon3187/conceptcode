---
name: create
description: Create a new concept under an existing parent path through a TypeScript graph update script
compatibility: opencode
metadata:
  audience: maintainers
  domain: concept-graph
  workflow: conceptualize-create
  mode: conceptualize
---

# Create

Use this skill in conceptualize mode to add a new concept to the concept graph.

## Invocation

```text
/create @root.existing.parent.new_concept <concept fields>
```

- The provided path must name a concept that does not yet exist.
- Every path segment to the left of the rightmost segment must already exist in the concept graph.
- The rightmost segment must already be a stable child key string.
- The user must provide at least a `summary`.
- Any other concept-graph metadata field may also be provided.

## Validation and execution

- Validate the requested path with the TypeScript script at `src/graph/create-concept.ts`.
- That script verifies that the full target path does not exist yet and that the parent path does exist.
- Parse the user-provided fields into concept-graph metadata and pass them to that script as JSON.
- Always create the concept with `not_yet_implemented: false` by default.

## After creation

- Inspect the new concept's parent context and nearby code.
- Suggest:
  - metadata that could be added or refined
  - related concepts that the new concept should reference via `related_paths`
  - other concepts that should add the new concept to their own `related_paths`

## Constraints

- Preserve stable existing child keys.
- Do not guess required fields that the user did not provide, except for safe defaults such as `not_yet_implemented: false`.
- Keep suggestions separate from the actual creation update.
