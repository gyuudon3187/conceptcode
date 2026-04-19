---
title: Add Lightweight Pre-Send Review
status: proposed
type: ui-feature
priority: 5
blockers:
  - 01-upgrade-context-pane.md
  - 02-add-context-quality-cues.md
sources:
  - url: ../sources/3772318.3791176.pdf
    label: When Help Hurts - Verification Load and Fatigue with AI Coding Assistants
    relevance: primary
    focus:
      - Abstract and introduction framing the balance between assistance and verification burden.
      - Portable verification-load composite and interface contributions such as transparency on demand and verification-aware packaging.
      - Verification burden and security risk discussion on rework, compile and test loops, edits, and clarification cycles.
      - Actionable design guidance and conclusion supporting staged review before acceptance.
  - url: https://arxiv.org/pdf/2311.06305
    label: A Systematic Review on Fostering Appropriate Trust in Human-AI Interaction
    relevance: secondary
    focus:
      - Decision-time interventions such as on-demand explanation that interrupt heuristic acceptance and support calibrated oversight.
  - url: ../sources/2604.00436v1.pdf
    label: Programming by Chat - A Large-Scale Behavioral Analysis of 11,579 Real-World AI-Assisted IDE Sessions
    relevance: tertiary
    focus:
      - Findings on progressive specification and delegated validation.
      - Findings on developers using persistent artifacts and explicit context management to steer AI work.
related_notes:
  - plans/ui-roadmap-short-term.md
  - plans/concept-graph-generation-improvements.md
---

# Add Lightweight Pre-Send Review

## Summary

Add a compact review summary near the prompt flow so users can quickly inspect prompt-context quality before sending.

## Why it matters

`ConceptCode` is strongest when users remain the explicit editors of prompt context. A lightweight pre-send review helps the user inspect what they are about to delegate before commitment, which is especially important in a graph-centered tool where context choice drives output quality.

This ticket matters because it creates a small transparency ritual at the point of send. It should interrupt blind acceptance without introducing a heavyweight workflow.

## Research grounding

`When Help Hurts` argues that verification-aware packaging and transparency on demand can reduce verification burden. A compact pre-send review is a natural application of that idea to prompt-context choice in `ConceptCode`.

`Programming by Chat` reinforces that developers progressively specify tasks and often delegate validation to AI. In `ConceptCode`, that increases the need to make chosen context visible before the user sends it, since poor context choice can silently propagate into the rest of the interaction.

## Scope

- summarize referenced concepts and files
- summarize leaf versus broad-parent balance
- summarize anchor coverage and `why_it_exists` coverage
- flag broad-context risk without blocking submission

## Implementation notes

- Keep the review summary close to the send action so it functions as a last-mile check.
- Surface only the highest-value checks that help the user decide whether to send now or inspect further.
- Prefer summary labels over verbose explanations.
- Keep the feature advisory so users retain control over when to proceed.

## Acceptance criteria

- the prompt flow has a small pause point for selective checking
- broad or weakly grounded context becomes more visible before send
- the feature remains advisory and lightweight
- the review can be understood quickly without opening a full verification view

## Out of scope

- blocking send based on heuristic checks
- a full post-response review workflow
- comprehensive graph scoring or automated remediation

## Uncertainties

- The best trigger for showing the review may depend on the final prompt-flow interaction model.
- The exact summary items may need trimming to keep the review faster than a manual pane inspection.
