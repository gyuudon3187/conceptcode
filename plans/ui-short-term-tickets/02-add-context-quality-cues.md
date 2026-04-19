---
title: Add Context Quality Cues
status: proposed
type: ui-feature
priority: 2
blockers:
  - 01-upgrade-context-pane.md
sources:
  - url: https://arxiv.org/pdf/2311.06305
    label: A Systematic Review on Fostering Appropriate Trust in Human-AI Interaction
    relevance: primary
    focus:
      - Definitions and framing of appropriate trust as alignment between perceived and actual system capability.
      - Interventions during decision-making such as on-demand explanation and other mechanisms that direct attention to what needs checking.
      - Framework dimensions around capability, trustworthiness, beliefs, and task requirements for calibrated oversight.
  - url: ../sources/Generative AI and the social fabric of organizations - Reza M Baygi, Marleen Huysman, 2025.pdf
    label: Generative AI and the social fabric of organizations
    relevance: secondary
    focus:
      - Oracle-like warning against treating GenAI as infallible.
      - Shared transparency and verification practices supporting derived, inspectable UI cues rather than durable automatic metadata.
related_notes:
  - plans/ui-roadmap-short-term.md
  - plans/concept-graph-generation-improvements.md
---

# Add Context Quality Cues

## Summary

Show lightweight derived cues that help users judge whether referenced concepts are strong prompt or verification units.

## Why it matters

`ConceptCode` depends on users choosing good prompt units from a concept graph that may vary in semantic richness, anchor coverage, and scope. Users need fast, local signals about whether a selected concept is a good thing to send to an agent.

These cues matter because they reduce blind trust in broad, weak, or poorly anchored nodes without changing the graph schema. They help the user answer a practical question at prompt-composition time: is this concept a strong context unit, or should I inspect something more specific or better grounded?

## Research grounding

Appropriate-trust research supports lightweight decision-time interventions that direct attention toward what needs checking instead of simply accelerating acceptance. That fits `ConceptCode` well because the user is deciding whether a graph node is ready to function as prompt context.

The Baygi and Huysman paper sharpens the risk: if users treat AI and AI-adjacent tooling as oracle-like, opaque prompt choices can quietly degrade trust and verification quality. Derived cues are a small transparency mechanism that helps keep context choice inspectable.

## Scope

- indicate presence or absence of `loc`
- indicate presence of `why_it_exists`, `state_predicate`, and `related_paths`
- distinguish leaf concepts from broader parents
- surface subtle broadness or weak-coverage warnings

## Implementation notes

- Derive all cues from existing graph structure and metadata rather than adding new stored fields.
- Keep cues advisory rather than evaluative scoring.
- Use the cues to support prompt choice and verification choice, not to imply that semantically useful concepts without anchors are invalid.
- Prefer short labels and badges that can be read quickly inside the context flow.

## Acceptance criteria

- cues are derived from existing graph shape and metadata
- cues help users spot weak prompt targets without introducing new graph fields
- warnings remain advisory rather than blocking
- cues can be read quickly inside the context-composition workflow

## Out of scope

- numeric scoring systems for graph quality
- persistent graph annotations created only for UI display
- any policy that treats missing `loc` as a hard error

## Uncertainties

- The threshold for what counts as a `broad` concept may need tuning against real graph sizes in this repo.
- Some cues, such as weak semantic coverage, may remain heuristic unless the project later defines more explicit review policy.
