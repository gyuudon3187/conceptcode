---
title: Document Three-Pass Generation Boundary
status: proposed
type: workflow-policy
priority: 5
blockers:
  - 01-strengthen-generation-hierarchy-policy.md
  - 03-update-prompt-execution-guidance.md
  - 04-update-concept-graph-command-guidance.md
related_notes:
  - plans/concept-graph-generation-improvements.md
---

# Document Three-Pass Generation Boundary

## Summary

Make the protected three-pass workflow boundary explicit across the relevant guidance: conceptual graph generation first, anchor enrichment with `loc` second, and kind-definition generation third.

## Why it matters

This boundary is an important internal policy, not just an implementation detail. Preserving it keeps the main pass focused on conceptual structure and reduces pressure to guess anchors or other details too early.

## Research grounding

This ticket is primarily grounded in the project’s own roadmap and workflow design rather than a specific external research source. Its role is to protect the conceptual discipline established by the earlier tickets.

## Scope

Likely files:

- `prompts/generate_concept_graph.md`
- `prompts/AGENTS.md`
- `.opencode/commands/concept-graph.md`

## Implementation notes

Add concise wording that the intended workflow remains:

1. conceptual graph generation
2. anchor enrichment with `loc`
3. kind-definition generation

The wording should explain why the split exists:

- the first pass should optimize for conceptual hierarchy quality
- later passes should enrich rather than distort the structure
- merging passes would increase pressure to guess and reduce graph quality

## Acceptance criteria

- the relevant prompt or command guidance explicitly preserves the three-pass split
- the guidance explains why the split exists
- the wording treats the split as a quality boundary rather than a temporary implementation quirk

## Out of scope

- changes to anchor enrichment prompts themselves
- redesigning the three-pass workflow
