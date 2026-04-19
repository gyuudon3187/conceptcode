---
title: Build Verification Workflow
status: proposed
type: ui-feature
priority: 1
sources:
  - url: ../sources/3772318.3791176.pdf
    label: When Help Hurts - Verification Load and Fatigue with AI Coding Assistants
    relevance: primary
    focus:
      - Sections 2.2 through 2.4 framing verification as a behavioral, cross-mode construct involving failures, churn, pauses, and switches.
      - Interface-level contributions such as adaptive mode orchestration, transparency on demand, and verification-aware packaging.
      - Verification-load composite as an operational basis for segmented review.
      - Conclusion recommending coupling outputs with checks, evidence, and intervention points.
  - url: https://arxiv.org/pdf/2311.06305
    label: A Systematic Review on Fostering Appropriate Trust in Human-AI Interaction
    relevance: secondary
    focus:
      - Appropriate-trust framework supporting structured interventions that help users inspect support rather than just accelerate acceptance.
  - url: ../sources/2604.00436v1.pdf
    label: Programming by Chat - A Large-Scale Behavioral Analysis of 11,579 Real-World AI-Assisted IDE Sessions
    relevance: tertiary
    focus:
      - Findings that developers delegate diagnosis, comprehension, and validation to AI.
      - Findings that developers actively manage context, artifacts, and boundaries in IDE-native collaboration.
related_notes:
  - plans/ui-roadmap-medium-term.md
  - plans/ui-roadmap-short-term.md
---

# Build Verification Workflow

## Summary

Add a more explicit verification-oriented panel or mode around chosen context and later agent output.

## Why it matters

Short-term UI work makes context easier to choose and lightly inspect. The next higher-value step is helping users verify whether their chosen context is sufficient, grounded, and appropriately scoped for the task they are asking an agent to perform.

This matters to `ConceptCode` because the product is not just a graph browser. It is a graph-centered environment for deliberate context selection and selective verification. A stronger verification workflow makes that second half explicit.

## Research grounding

`When Help Hurts` supports segmented review and verification-aware packaging rather than one large undifferentiated checking effort. That maps directly to a dedicated verification surface in `ConceptCode`.

`Programming by Chat` shows that developers delegate diagnosis, comprehension, and validation to assistants. That increases the need for a UI that separates what context was chosen, what evidence was available, and what should still be checked by the user.

## Scope

- add structured sections such as `Scope`, `Anchors`, `Claims / Questions`, and `Checks`
- separate chosen context from assistant output more clearly
- support selective follow-up inspection actions

## Implementation notes

- Keep verification staged and structured rather than turning it into a large dashboard.
- Preserve the distinction between chosen context, assistant output, and evidence available from the graph or source anchors.
- Provide low-friction follow-up actions that let the user inspect a weak point immediately.
- Build on the short-term pre-send and quality-cue foundations rather than duplicating them.

## Acceptance criteria

- verification becomes more staged and less undifferentiated
- users can inspect chosen context, available evidence, and likely checks separately
- selective follow-up inspection is easier than broad manual exploration

## Out of scope

- deep semantic parsing of every prompt
- full post-response auditing automation
- hidden context expansion as part of verification

## Uncertainties

- The boundary between a `panel` and a dedicated `mode` should follow the existing TUI interaction model rather than force a large navigation change.
- The `Claims / Questions` section may need to start as a lightweight summary rather than a fully inferred task model.
