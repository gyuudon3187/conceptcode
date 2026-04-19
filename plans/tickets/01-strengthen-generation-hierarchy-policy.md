---
title: Strengthen Generation Hierarchy Policy
status: proposed
type: prompt-policy
priority: 1
sources:
  - url: https://arxiv.org/html/2504.04553v3
    label: Understanding Codebase like a Professional! Human-AI Collaboration for Code Comprehension
    relevance: primary
    focus:
      - Introduction, contributions, and methodology overview on global-to-local hierarchical understanding flow.
      - Stage 2 design opportunities 1 through 4 on aligned extraction, decomposition, structural representation, and analytical scaffolding.
      - Prototype design and key features on interactive switching across hierarchical codebase visualizations.
      - Validation result that structured hierarchy reduced users' reliance on reading and interpreting LLM responses.
related_notes:
  - plans/concept-graph-generation-improvements.md
---

# Strengthen Generation Hierarchy Policy

## Summary

Revise `prompts/generate_concept_graph.md` so concept-graph generation explicitly optimizes for navigable hierarchy, promptable leaves, ownership-based decomposition, shallow meaningful top-level structure, and bounded sibling counts.

## Why it matters

This is the highest-value graph-generation change.

If hierarchy quality improves, the generated graph will better support:

- deliberate context selection
- stable prompt references
- selective verification
- downstream UI features that rely on a strong conceptual decomposition

## Research grounding

The strongest research support comes from CodeMap’s argument that code understanding follows a global-to-local hierarchical flow and that tools should support dynamic decomposition, structural representation, and movement across abstraction levels. That maps directly to a generation policy whose main job is to produce graphs with strong overview-to-detail structure rather than flat topic lists.

## Scope

Likely files:

- `prompts/generate_concept_graph.md`

## Implementation notes

Add or strengthen guidance that tells the model to:

- create concepts that are useful prompt-reference targets, not only documentation headings
- prefer leaves that a human could plausibly mention directly in a prompt
- create a child only when it improves navigation, promptability, or verification relative to the parent
- prefer ownership-based decomposition over taxonomy buckets that merely mirror code layout
- keep the top level shallow and meaningful
- keep sibling lists short enough to browse without long flat scanning
- only introduce intermediate grouping nodes when they are meaningful on their own

Operationalize the policy with concrete anti-patterns to avoid:

- very broad catch-all nodes
- tiny trivia nodes
- fake grouping buckets
- concepts lifted too high when their meaning depends on one parent

The prompt should also explicitly frame the graph as support for:

- global-to-local understanding
- deliberate context selection
- prompt composition
- targeted verification

## Acceptance criteria

- `prompts/generate_concept_graph.md` explicitly frames the graph as support for prompt composition, context selection, and targeted verification
- the prompt includes concrete guidance for promptable leaves, ownership-based decomposition, top-level structure, and sibling-count control
- the prompt includes explicit anti-patterns to avoid
- the guidance clearly prioritizes hierarchy quality over broad field expansion

## Out of scope

- schema changes
- anchor enrichment changes
- UI implementation work
