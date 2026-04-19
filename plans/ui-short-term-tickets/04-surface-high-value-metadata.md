---
title: Surface High-Value Metadata
status: proposed
type: ui-feature
priority: 4
sources:
  - url: ../sources/Generative AI and the social fabric of organizations - Reza M Baygi, Marleen Huysman, 2025.pdf
    label: Generative AI and the social fabric of organizations
    relevance: primary
    focus:
      - Shared transparency and verification practices such as provenance tags and prompt histories.
      - Laissez-faire versus cultivation framing supporting inspectable rather than opaque interpretation.
      - Resource-flow discussion around trust and expertise that supports surfacing decision-relevant metadata.
  - url: https://arxiv.org/pdf/2311.06305
    label: A Systematic Review on Fostering Appropriate Trust in Human-AI Interaction
    relevance: secondary
    focus:
      - Capability-alignment framing supporting selective surfacing of metadata when it improves verification and applicability judgment.
related_notes:
  - plans/ui-roadmap-short-term.md
  - plans/concept-graph-generation-improvements.md
---

# Surface High-Value Metadata

## Summary

Render `why_it_exists`, `state_predicate`, and `related_paths` more deliberately in details and prompt-adjacent UI surfaces.

## Why it matters

These metadata fields only matter if they improve user decisions. In `ConceptCode`, their value is not decorative; it is helping users decide whether a concept is relevant, why it matters, and what adjacent context might also be needed.

This ticket matters because selective metadata is one of the main ways the graph can become more semantically useful without becoming bloated. If surfaced at the right moments, these fields reduce ambiguity during prompt selection and verification.

## Research grounding

The Baygi and Huysman paper argues for transparency and verification practices that keep AI-mediated work inspectable rather than opaque. In `ConceptCode`, surfacing high-value concept metadata is a direct analog: it gives the user more visible reasons and conditions for including a concept in context.

Appropriate-trust research supports selective, decision-relevant disclosure rather than flooding the user with all available detail. That fits the project’s sparse-metadata philosophy well.

## Scope

- distinguish `summary` from `why_it_exists`
- render `state_predicate` as an applicability cue
- make `related_paths` actionable as quick navigation targets

## Implementation notes

- Treat `summary` as what a concept is and `why_it_exists` as why that unit matters or what responsibility it owns.
- Render `state_predicate` in places where the user is deciding whether a concept belongs in the current prompt context.
- Make `related_paths` easy to inspect in place, but visually distinct from structural children.
- Surface metadata where it changes decisions, not everywhere by default.

## Acceptance criteria

- metadata appears at moments where it reduces ambiguity
- metadata presentation improves promptability and verification without adding UI clutter
- `related_paths` can be inspected without confusing them with the tree structure

## Out of scope

- displaying every optional field equally
- adding new metadata fields for UI convenience
- large explanatory panels that overwhelm the browsing flow

## Uncertainties

- The right prompt-adjacent locations for each field may depend on how the context pane rewrite lands.
- Some concept types may benefit more from `why_it_exists` than others, so visual emphasis may need to remain selective.
