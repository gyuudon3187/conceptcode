# Concept Graph Maintenance

This document explains the durable approach for maintaining ConceptCode concept graphs. It is intended as a high-signal orientation guide for future editing sessions, not as a planning or milestone tracker.

## Purpose

The concept graph is a stable, user-facing representation of implementation concepts and domain concepts.

Its main purpose is to let humans and agents refer to concepts by stable derived paths such as `impl.views.merge_view.pending_selection` or `domain.business_rules.refund_policy` instead of relying on vague natural-language descriptions.

The graph may intentionally get ahead of the implementation. This is expected. A concept can exist in the graph before the corresponding implementation is complete.

## Core Invariants

- The JSON concept graph is the source of truth.
- Stable concept paths are derived from object keys under `children`.
- Those child keys are user-facing and should stay stable whenever possible.
- `impl` is for implementation-backed concepts.
- `domain` is for non-code domain concepts.
- `implemented`, `loc`, `exploration_coverage`, and `summary_confidence` are restricted to `impl` concepts.
- `domain` concepts must not use implementation-only metadata.
- Cross-namespace `related_paths` are allowed when they add real navigational value.
- New `impl` concepts should default to `implemented: false` unless there is clear evidence to set `implemented: true`.

## Maintenance Philosophy

- Prefer small, local graph edits over broad speculative rewrites.
- Preserve stable child keys unless there is a concrete reason to restructure the graph.
- Prefer graph-first creation and anchor enrichment in a later pass when needed.
- Use explicit graph operations for restructuring instead of ad hoc manual path edits.
- Treat destructive or ripple-heavy changes as approval-required workflows.
- Prefer a good concept graph over uncertain or weak source anchors.

## Skill Map

- `create`
  - Add exactly one new concept under an existing parent path.
  - This is a creation-only workflow.
  - Do not use inline `children`; `create` starts the new concept with an empty `children` object.
  - Use this when the concept is missing from the graph.

- `consolidate`
  - Improve a `impl` concept after direct inspection of the implementation.
  - Use this to enrich summaries and related metadata from evidence.

- `elaborate`
  - Verify a user-provided explanation against the best available evidence.
  - Use this when the user already has a theory that needs checking.

- `anchor`
  - Add or refine `loc` for a `impl` concept.
  - Keep this workflow narrow: update `exploration_coverage` conservatively, optionally update `summary_confidence`, and refine `summary` only when direct inspection clearly improves it.
  - Use this when the graph structure is already present and the main missing piece is source anchoring.

- `link`
  - Add, remove, or normalize `related_paths`.
  - Keep `related_paths` sparse and meaningful; reciprocal links are optional, not automatic.
  - Use this when navigational links need cleanup without broader concept rewriting.

- `validate`
  - Run a read-only audit of graph quality and schema compliance.
  - Use this before or after larger maintenance work.
  - Treat it as the default read-only preflight for graph-quality issues and use its findings to choose the follow-up maintenance skill.

- `rename`
  - Rename a concept key while handling path ripple safely.
  - Use this when the concept identity and parent are still correct, but the leaf path segment is wrong.
  - Use this instead of manually editing a child key.

- `move`
  - Move a concept subtree to a different parent.
  - Preserve the child key and concept identity while changing the parent path.
  - Use this when the hierarchy is wrong but the concept identity should be preserved.

- `merge`
  - Merge overlapping concepts into one canonical concept.
  - Use an explicit survivor path; default to survivor-wins when metadata conflicts unless the user has a clear reason to override specific fields.
  - Do not use `merge` when child-key collisions remain unresolved between the two concepts.
  - Use this when the graph has duplicate or near-duplicate concepts.

- `split`
  - Decompose an overloaded concept into more precise concepts.
  - Use this when one concept is trying to represent too many distinct ideas.
  - Preserve the original concept as an umbrella parent by default; do not use `split` to guess or silently replace the original structure.

- `delete`
  - Remove a concept and its entire descendant subtree.
  - Run preflight before mutation and review inbound `related_paths` references across both `impl` and `domain`.
  - Use `delete` when the concept should disappear entirely, not when another concept should absorb its meaning, links, or descendants.
  - Use this only when the concept should no longer exist in the graph.

## Recommended Workflows

### Add a new concept

- `create -> consolidate`
- `create -> anchor`
- `create -> link`

Use `create` when the concept is missing. Follow with `consolidate` if the concept needs summary enrichment, `anchor` if it needs source location metadata, or `link` if it needs navigation improvements.

### Improve an existing implementation concept

- `validate -> consolidate`
- `validate -> anchor`

Use `validate` first when graph quality is uncertain. Use `consolidate` for understanding-driven enrichment and `anchor` when the main missing value is source anchoring.

If the anchoring work expands into broader impl-concept enrichment or low-coverage child planning, switch from `anchor` to `consolidate`.

### Check whether an explanation is correct

- `elaborate`

Use `elaborate` when the user provides an explanation and wants it checked against the code or graph evidence.

### Clean up navigation

- `validate -> link`

Use `link` when the main problem is missing, weak, duplicate, or stale `related_paths`.

Do not use `link` or `anchor` for structural decomposition or consolidation; once concept boundaries need to change, switch to an explicit restructuring workflow.

### Restructure the graph safely

- `validate -> rename`
- `validate -> move`
- `validate -> merge`
- `validate -> split`

Run `validate` first when possible, then use the explicit restructuring skill that matches the intended change.

### Remove a concept

- `validate -> delete`

Use `delete` only when the concept and its subtree should be removed entirely.

## Kind Policy

- Kinds should fit the namespace they appear in.
- Known cross-namespace kind mismatches are invalid.
- Unknown kinds are warnings, not automatic hard failures.
- Missing `kind` is allowed.
- Prefer kinds that are already established in the graph or documented schema guidance.

## Path Ripple Policy

Because concept paths are derived from child keys, path changes can ripple widely.

- Do not rename or move concepts by hand.
- Use `rename` for key changes.
- Use `move` for parent changes.
- Ripple-heavy operations must update descendant paths and all affected `related_paths` references.
- Review preflight output before applying any operation that changes paths.
- Treat `rename` and `move` as two-step workflows: preflight first, explicit confirmation second.
- For `merge` and `split`, require explicit user decisions for survivor choice, redistribution, and conflict handling; do not guess those outcomes.

`rename` is the main fix for key-change ripple. `move` handles parent-path ripple. `merge` and `split` may also trigger path or reference updates and should be treated with the same care.

For `merge`, review not only path rewrites but also field conflicts and child collisions before confirming. Merging is only safe when one canonical survivor is clear.

## Destructive And Approval-Required Operations

Treat these operations as approval-required:

- `delete`
- `rename`
- `move`
- `merge`
- `split`

These operations should be preceded by preflight review when available.

`delete` is especially important to review carefully because deleting a concept deletes its entire descendant subtree and removes matching `related_paths` references.

When preflight is available, review not only subtree size but also inbound references from both namespaces before confirming the operation.

## Practical Editing Rules

- Prefer the smallest correct graph edit.
- Do not guess weak anchors.
- Do not add metadata only because the field exists; add it when it improves navigation or understanding.
- Keep child keys machine-stable because they become user-facing path segments; suspicious keys are a maintenance smell even when the graph still parses.
- When removing or restructuring concepts, audit `related_paths` across both namespaces, not just within the target concept's namespace.
- Reject restructuring edits that would create sibling path collisions or move a concept into its own descendant.
- For `split`, each moved child should be assigned explicitly and at most once; leaving some children untouched is valid, but silently duplicating or dropping subtrees is not.
- `related_paths` should point only to existing concept paths; broken links are graph-integrity issues, not just cosmetic cleanup.
- Keep `summary_confidence` conservative.
- Treat `exploration_coverage` and `summary_confidence` as bounded `0.0` to `1.0` impl-only metrics.
- `summary_confidence` should usually not exceed `exploration_coverage`.
- Missing child coverage in `impl` concepts is a signal that parent consolidation may be premature.

## Briefing Future Sessions

For future graph-maintenance sessions, provide this document together with the relevant task-specific context.

Useful instruction pattern:

`Read docs/concept_graph_maintenance.md and the relevant skill docs before making graph changes. Preserve stable paths, prefer explicit graph operations for restructuring, and treat destructive or ripple-heavy edits as approval-required.`

If the work is part of a previously planned execution slice, also provide the relevant file under `plans/graph-maintenance-slices/`.
