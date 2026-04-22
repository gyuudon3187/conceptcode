---
name: validate
description: Run a read-only concept-graph audit through a TypeScript validation script
compatibility: opencode
metadata:
  audience: maintainers
  domain: concept-graph
  workflow: conceptualize-validate
  mode: conceptualize
---

# Validate

Use this skill in conceptualize mode to audit a concept graph without changing it.

## Invocation

```text
/validate &path/to/graph.json
```

- The command requires a graph file path.
- This workflow is read-only.

## Validation scope

- Use the TypeScript script at `src/graph/validate-graph.ts`.
- The script must report findings for:
  - broken `related_paths`
  - forbidden domain-only metadata violations
  - known cross-namespace kind mismatches
  - unknown kinds
  - invalid or suspicious score usage
  - `summary_confidence > exploration_coverage`
  - missing summaries
  - suspicious child keys

## Output requirements

- Report each finding with:
  - severity
  - affected concept path
  - affected field names
  - short explanation
  - suggested follow-up skill when useful
- Treat known root/domain kind mismatches as errors.
- Treat unknown kinds as warnings.
- Allow missing `kind`.

## Constraints

- Do not mutate the graph during validation.
- Keep recommendations aligned with available graph-maintenance skills such as `/consolidate`, `/elaborate`, `/link`, and `/move`.
