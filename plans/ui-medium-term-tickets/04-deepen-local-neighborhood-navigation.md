---
title: Deepen Local Neighborhood Navigation
status: proposed
type: ui-feature
priority: 4
sources:
  - url: https://arxiv.org/html/2504.04553v3
    label: Understanding Codebase like a Professional! Human-AI Collaboration for Code Comprehension
    relevance: primary
    focus:
      - Local and detailed level understanding focused on important variables, key functions, call relationships, and dependency order.
      - Design Opportunity 3 on representing information across multiple abstraction layers.
      - Evaluation result supporting reduced dependence on raw explanation text through structured navigation.
      - Support for identifying which parts deserve attention.
related_notes:
  - plans/ui-roadmap-medium-term.md
---

# Deepen Local Neighborhood Navigation

## Summary

Improve movement around the current concept and current working set without introducing a heavyweight full graph visualization.

## Why it matters

Many `ConceptCode` tasks depend on nearby context rather than globally broad context. Users often need to answer questions like what sits next to this concept, what broader unit contains it, and what related node is likely relevant to the current task.

This ticket matters because it makes graph adjacency more practically useful. Better neighborhood navigation reduces fallback to manual searching and oversized parent selection.

## Research grounding

The CodeMap paper supports structured movement across abstraction levels and focused inspection of nearby important elements instead of forcing users into flat explanation reading. `ConceptCode` can apply that lesson at the concept-neighborhood level.

The relevant product implication is to strengthen local conceptual movement without turning the TUI into a general-purpose map explorer.

## Scope

- richer local neighborhood view
- task-aware prioritization near the current working set
- cues about balance between broad parents and tiny leaves

## Implementation notes

- Prefer local, task-aware relevance over displaying the whole neighborhood equally.
- Keep neighborhood views focused on helping users choose adjacent context or navigate quickly.
- Avoid over-investing in graph rendering complexity when list- or panel-based affordances may be enough.
- Reuse existing graph structure and `related_paths` rather than introducing synthetic adjacency fields.

## Acceptance criteria

- users can understand nearby conceptual structure more efficiently
- the feature improves local movement without becoming a full graphical map system
- neighborhood cues help users avoid unbalanced context choices

## Out of scope

- full graph visualization as the main interaction model
- new stored graph relationships created only for this view
- automatic neighborhood expansion into prompt context

## Uncertainties

- Task-aware prioritization may depend on earlier working-set support landing first.
- Reverse or inferred neighborhood relations may need a later pass if they are not already easy to derive from current data.
