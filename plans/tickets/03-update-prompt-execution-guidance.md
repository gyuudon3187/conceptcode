---
title: Update Prompt Execution Guidance
status: proposed
type: prompt-policy
priority: 3
blockers:
  - 01-strengthen-generation-hierarchy-policy.md
  - 02-define-sparse-graph-metadata-policy.md
sources:
  - url: https://arxiv.org/html/2604.00436v1
    label: Programming by Chat: A Large-Scale Behavioral Analysis of 11,579 Real-World AI-Assisted IDE Sessions
    relevance: primary
    focus:
      - Abstract and high-level findings on conversational programming as progressive specification.
      - Finding 5 on persistent artifacts such as TODO, progress, and carry-over documents as external memory.
      - Finding 6 on information injection, behavior specification, hard constraints, and intervention conditions.
      - Finding 11 and related discussion on opening turns establishing scope, context, and constraints.
  - url: https://arxiv.org/abs/2410.04596
    label: Need Help? Designing Proactive AI Assistants for Programming
    relevance: secondary
    focus:
      - Abstract-level framing on proactive assistants using programming context as a shared workspace.
      - Design considerations for when proactive use of context helps productivity and user experience.
related_notes:
  - plans/concept-graph-generation-improvements.md
---

# Update Prompt Execution Guidance

## Summary

Update `prompts/AGENTS.md` so prompt-execution guidance reinforces hierarchy quality, promptable leaves, sparse metadata, and graph-bloat avoidance during concept-graph generation work.

## Why it matters

The generation prompt is only part of the workflow. Prompt-execution guidance should also shape how runs begin, how context is framed, and how execution boundaries are established so graph-generation sessions stay aligned with the intended policy.

## Research grounding

Programming-by-chat research strongly supports treating execution guidance as a way to manage collaboration, not just wording style. The most relevant findings are that sessions work as progressive specification, developers rely on persistent artifacts and injected context, and opening turns disproportionately establish scope, constraints, and allowed behavior. That maps directly to prompt guidance for concept-graph generation work.

## Scope

Likely files:

- `prompts/AGENTS.md`

## Implementation notes

Add or revise guidance so it clearly emphasizes:

- hierarchy quality as the primary concern
- promptable concept leaves over exhaustive decomposition
- sparse, high-value metadata only
- avoiding graph bloat and low-value nodes
- front-loading scope, context, and execution boundaries in prompt runs
- preserving the existing multi-pass workflow shape

Ensure the guidance can support hard constraints and intervention conditions when appropriate, such as separating analysis decisions from later enrichment decisions.

## Acceptance criteria

- `prompts/AGENTS.md` clearly reinforces the hierarchy policy
- `prompts/AGENTS.md` clearly reinforces the sparse metadata policy
- prompt-execution guidance front-loads task framing, context, and boundaries
- prompt-execution guidance does not encourage collapsing conceptual generation and anchor enrichment into one pass

## Out of scope

- editing command wrappers
- editing docs outside prompt guidance
