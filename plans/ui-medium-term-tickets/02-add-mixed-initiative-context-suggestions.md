---
title: Add Mixed-Initiative Context Suggestions
status: proposed
type: ui-feature
priority: 2
blockers:
  - 01-build-verification-workflow.md
sources:
  - url: https://arxiv.org/abs/2410.04596
    label: Need Help? Designing Proactive AI Assistants for Programming
    relevance: primary
    focus:
      - Abstract on programming context as a shared workspace enabling more relevant proactive suggestions.
      - Proactive suggestion framing supporting visible, interactional suggestion flows.
  - url: ../sources/2604.00436v1.pdf
    label: Programming by Chat - A Large-Scale Behavioral Analysis of 11,579 Real-World AI-Assisted IDE Sessions
    relevance: secondary
    focus:
      - Finding 6 on context injection and behavioral constraints supporting user-controlled context editing.
      - Finding 5 on persistent artifacts supporting inspectable and revisable suggestions.
  - url: ../sources/Generative AI and the social fabric of organizations - Reza M Baygi, Marleen Huysman, 2025.pdf
    label: Generative AI and the social fabric of organizations
    relevance: tertiary
    focus:
      - Transparency and provenance practices supporting visible suggestion rationales and accountable context boundaries.
related_notes:
  - plans/ui-roadmap-medium-term.md
---

# Add Mixed-Initiative Context Suggestions

## Summary

Suggest nearby or structurally relevant concepts without automatically expanding prompt context.

## Why it matters

`ConceptCode` should help users discover likely relevant adjacent context, not just reflect whatever they already typed. But it must do so without undermining the project’s explicit-context model.

This ticket matters because it can increase the usefulness of the graph as a context-discovery surface while keeping the human as the editor of the working set. If done opaquely, it would cut against one of the project’s main strengths.

## Research grounding

The proactive-assistant work supports visible mixed-initiative suggestion flows grounded in a shared programming workspace. In `ConceptCode`, the graph is that shared workspace, so it is reasonable to suggest nearby concepts from structure.

`Programming by Chat` strengthens the need for user-controlled boundaries: developers actively inject context and set constraints when steering AI behavior. Suggestions in `ConceptCode` should respect that same pattern by remaining explicit and revisable.

## Scope

- suggest nearby concepts from parent, child, sibling, and `related_paths` structure
- label each suggestion with a clear reason
- let users explicitly accept or reject suggestions
- keep suggestions separate from direct references

## Implementation notes

- Keep suggested items visibly separate from the user’s actual working set.
- Every suggestion should include a reason label that explains why it appears.
- Rejected suggestions should stay dismissed for the current composition cycle.
- Favor structural and semantic traceability over aggressive recall.

## Acceptance criteria

- suggestions remain visible, interpretable, and user-controlled
- hidden auto-expansion is avoided
- users can tell why each suggestion appeared

## Out of scope

- silent inclusion of suggested context
- opaque relevance ranking with no provenance
- replacing explicit prompt references as the primary interaction model

## Uncertainties

- The best suggestion sources may need tuning so the UI stays helpful rather than noisy.
- Some rationale labels, such as `same local cluster`, may need clearer repo-specific definition before implementation.
