---
title: Add Mode-Specific Defaults
status: proposed
type: ui-feature
priority: 6
blockers:
  - 01-build-verification-workflow.md
sources:
  - url: ../sources/3772318.3791176.pdf
    label: When Help Hurts - Verification Load and Fatigue with AI Coding Assistants
    relevance: primary
    focus:
      - RQ1 and mode-by-task findings on different interface modes performing better at different complexity levels.
      - Complexity thresholds and expertise guidance supporting task- or stage-specific defaults.
      - Actionable design guidance such as adaptive mode orchestration, transparency on demand, and verification-aware packaging.
      - Conclusion and deployment guidance on when to prefer different modes.
  - url: ../sources/2604.00436v1.pdf
    label: Programming by Chat - A Large-Scale Behavioral Analysis of 11,579 Real-World AI-Assisted IDE Sessions
    relevance: secondary
    focus:
      - Session archetypes and progressive specification showing that IDE-native conversational work is task- and stage-dependent.
      - Managing an opaque collaborator through constraints and context refresh, supporting workflow-sensitive defaults.
related_notes:
  - plans/ui-roadmap-medium-term.md
---

# Add Mode-Specific Defaults

## Summary

Strengthen mode-specific context, suggestion, and verification behavior for `plan`, `build`, and `conceptualize`.

## Why it matters

If different modes in `ConceptCode` consistently imply different context-composition and verification needs, the UI should be able to bias itself toward the right defaults instead of presenting the same interaction framing every time.

This could improve fit between task stage and UI behavior. For example, a planning-oriented mode may benefit from broader structural context and lighter execution cues, while a build-oriented mode may benefit from stronger verification emphasis.

## Research grounding

`When Help Hurts` supports the idea that different interaction modes and task stages call for different verification and transparency behavior. `Programming by Chat` also shows that conversational programming spans recurring archetypes rather than one uniform interaction style.

That makes mode-sensitive defaults plausible for `ConceptCode`, provided they reflect real differences in how the product is used.

## Scope

- tailor emphasis by mode
- tailor warnings and suggestions by mode
- reduce mismatch between task stage and review surface

## Implementation notes

- Start with lightweight default differences rather than deeply divergent mode logic.
- Preserve the same explicit-context model across modes.
- Prefer changing emphasis and ordering before adding mode-exclusive capabilities.
- Build only on behavior that earlier roadmap work proves useful.

## Acceptance criteria

- modes produce meaningfully different context and verification behavior
- mode behavior stays aligned with the project’s explicit-context model
- defaults reduce obvious mismatch between task stage and review emphasis

## Out of scope

- large, mode-specific UI forks
- hidden automation in some modes but not others
- policy complexity not supported by observed usage patterns

## Uncertainties

- This remains the least certain UI ticket in the set.
- The repo’s current evidence does not yet fully prove that `plan`, `build`, and `conceptualize` are distinct enough to justify substantial differentiated defaults.
- This ticket may need re-scoping after earlier verification and working-set work clarifies real mode differences.
