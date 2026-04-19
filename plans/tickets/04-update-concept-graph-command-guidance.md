---
title: Update Concept-Graph Command Guidance
status: proposed
type: workflow-policy
priority: 4
blockers:
  - 01-strengthen-generation-hierarchy-policy.md
  - 02-define-sparse-graph-metadata-policy.md
  - 03-update-prompt-execution-guidance.md
sources:
  - url: https://arxiv.org/html/2604.00436v1
    label: Programming by Chat: A Large-Scale Behavioral Analysis of 11,579 Real-World AI-Assisted IDE Sessions
    relevance: primary
    focus:
      - High-level finding that developers manage collaboration through context injection and behavioral constraints.
      - Finding 6 examples covering resource injection, hard limits, handoff conditions, and selective open-ended delegation.
      - Continuation-driven delegation archetype distinguishing initial setup constraints from follow-on execution commands.
      - Discussion of context management as a teachable skill rather than an implicit habit.
related_notes:
  - plans/concept-graph-generation-improvements.md
---

# Update Concept-Graph Command Guidance

## Summary

Revise `.opencode/commands/concept-graph.md` so the command wrapper reflects the improved hierarchy policy, sparse metadata policy, and explicit scoping and constraint behavior for the concept-graph workflow.

## Why it matters

The command wrapper operationalizes the workflow. If it does not reflect the intended scope, context, and behavior constraints, users and agents may continue generating graphs with weak decomposition, inconsistent metadata usage, or unclear boundaries between setup and follow-on execution.

## Research grounding

Programming-by-chat research suggests that command-oriented workflows benefit from explicit context injection, behavior specification, and clear handoff conditions. That is directly relevant to concept-graph command guidance, which should make graph generation feel explicit and teachable rather than implicit or ad hoc.

## Scope

Likely files:

- `.opencode/commands/concept-graph.md`

## Implementation notes

Update the command instructions so they emphasize:

- useful prompt targets
- deliberate context composition
- reduced downstream verification burden
- explicit scope and allowed-action framing for each pass
- clear distinction between initial setup constraints and follow-on execution
- keeping conceptual graph generation separate from `loc` enrichment and kind-definition generation

Make sure the wrapper’s wording stays aligned with the revised prompt and prompt-specific AGENTS guidance.

## Acceptance criteria

- the command wrapper reflects the updated hierarchy guidance
- the command wrapper reflects the sparse metadata policy
- the command wrapper clearly communicates scope and behavior constraints
- the command wrapper still preserves the three-pass workflow

## Out of scope

- changing the implementation of the generation pipeline itself
