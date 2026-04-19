---
title: Define Sparse Graph Metadata Policy
status: proposed
type: prompt-policy
priority: 2
blockers:
  - 01-strengthen-generation-hierarchy-policy.md
sources:
  - url: https://journals.sagepub.com/doi/10.1177/14761270251385456
    label: Generative AI and the social fabric of organizations
    relevance: primary
    focus:
      - Framing on unpredictable plausibility and hyper-personalizability as reasons to avoid turning local AI-assisted judgments into durable shared metadata.
      - Oracle warning against treating GenAI outputs as infallible enough to justify overcommitted persistent traces.
      - Siren and hyper-personalization discussion supporting preservation of broadly shareable rather than idiosyncratic metadata.
      - Shared transparency and verification practices such as provenance tags, prompt histories, and shared logs as a guide for what should become durable metadata.
  - url: https://arxiv.org/pdf/2311.06305
    label: A Systematic Review on Fostering Appropriate Trust in Human-AI Interaction
    relevance: secondary
    focus:
      - Appropriate trust framing as alignment between perceived and actual system performance or reliability.
      - Interventions such as on-demand explanation and other trust-calibrating mechanisms that support selective rather than automatic metadata use.
related_notes:
  - plans/concept-graph-generation-improvements.md
---

# Define Sparse Graph Metadata Policy

## Summary

Refine graph-generation guidance so existing optional fields are used more deliberately, especially `why_it_exists`, `state_predicate`, and `related_paths`, while explicitly avoiding volatile task-specific metadata in the concept graph.

## Why it matters

The roadmap’s main conclusion is that hierarchy quality matters most, but a small amount of well-chosen metadata can improve verification and promptability when structure alone is insufficient.

This ticket converts that conclusion into an explicit policy about what deserves durable representation in the graph.

## Research grounding

The STS argument here is that AI workflows can make unstable or highly personalized judgments look more solid than they are. That supports a sparse metadata policy: preserve metadata that is broadly shareable, inspectable, and tied to stable conceptual questions, not every local judgment or workflow convenience. The trust-calibration literature reinforces the same point from another angle: metadata should be added selectively when it improves calibrated understanding, not accumulated automatically.

## Scope

Likely files:

- `prompts/generate_concept_graph.md`
- `docs/json_schema.md`

## Implementation notes

Add guidance that:

- keeps `why_it_exists` optional and sparse
- uses `why_it_exists` when title and summary do not sufficiently explain purpose
- keeps `state_predicate` optional and limited to state- or mode-dependent concepts
- keeps `related_paths` sparse and reserved for high-value cross-hierarchy jumps

Also explicitly warn against adding or overusing fields like:

- `confidence`
- `importance`
- `verification_status`
- `review_priority`
- `prompt_relevance`
- token-budget fields

Tie the policy back to a stable-question rule: metadata belongs in the graph when it answers durable conceptual questions, not temporary workflow questions.

## Acceptance criteria

- the generation prompt includes explicit criteria for when to use `why_it_exists`
- the generation prompt includes explicit criteria for when to use `state_predicate`
- the generation prompt includes explicit criteria for when to use `related_paths`
- the guidance explicitly discourages volatile review or ranking metadata
- the policy language is compatible with existing schema fields rather than implying new ones

## Out of scope

- adding new graph fields
- changing the JSON schema shape
