---
title: Make Graph Maintenance Actionable
status: proposed
type: future-design
priority: 5
sources:
  - url: ../sources/Generative AI and the social fabric of organizations - Reza M Baygi, Marleen Huysman, 2025.pdf
    label: Generative AI and the social fabric of organizations
    relevance: primary
    focus:
      - Shared transparency and verification practices such as provenance tags, prompt histories, and shared logs.
      - Oracle-like warning against treating AI as authoritative while weaknesses remain hidden.
      - Social-fabric framing supporting team-visible and actionable maintenance practices.
  - url: ../sources/3772318.3791176.pdf
    label: When Help Hurts - Verification Load and Fatigue with AI Coding Assistants
    relevance: secondary
    focus:
      - Verification burden framing showing how weak structure and weak anchors increase downstream burden.
      - Repeated-use burden and conclusion supporting better packaging of review and remediation work.
related_notes:
  - plans/ui-roadmap-medium-term.md
  - plans/tickets/07-design-graph-quality-review-mode.md
---

# Make Graph Maintenance Actionable

## Summary

Add UI surfaces that help users notice graph-quality issues and jump into concept-graph maintenance workflows when needed.

## Why it matters

The graph is the source of truth for `ConceptCode`. If graph structure or metadata is weak, prompt quality and verification quality suffer downstream. That makes graph maintenance a product concern, not just a content-editing concern.

This ticket matters because it would help users notice when prompt friction is really graph weakness and route them toward repair. That keeps graph quality connected to real usage rather than treating maintenance as a separate admin task.

## Research grounding

The Baygi and Huysman paper argues that weak, hidden AI-mediated practices can degrade trust and other organizational resource flows unless they are made inspectable and cultivated deliberately. In `ConceptCode`, graph-quality issues are one of the hidden upstream causes of weak prompting and verification, so making them visible is product-relevant.

`When Help Hurts` reinforces that poor packaging and weak review structure increase downstream verification burden. For `ConceptCode`, graph-maintenance affordances can reduce that burden earlier in the pipeline.

## Scope

- lightweight graph-quality review surface
- actionable links from issues to affected concepts
- connection from detected issues to conceptualize or edit flows
- distinction between graph weakness, anchor weakness, and prompt-choice weakness

## Implementation notes

- Keep issue presentation maintenance-oriented rather than judgment-heavy.
- Link every surfaced issue to an obvious next action where possible.
- Distinguish graph-structure problems from missing-source or prompt-choice problems so users can remediate the right layer.
- Treat this as a future-friendly bridge into graph-improvement workflows, not as an always-on quality dashboard.

## Acceptance criteria

- graph maintenance becomes part of normal usage rather than a separate admin activity
- issue presentation remains maintenance-oriented rather than judgment-heavy
- surfaced issues help users differentiate graph, anchor, and prompt-choice problems

## Out of scope

- formal numeric graph-quality scoring
- mandatory maintenance workflow before prompting
- large moderation or admin systems unrelated to active graph use

## Uncertainties

- It is still somewhat uncertain how often users will engage with graph maintenance from the UI versus from direct editing flows.
- The initial issue taxonomy should probably stay small to avoid over-claiming automated diagnosis quality.
