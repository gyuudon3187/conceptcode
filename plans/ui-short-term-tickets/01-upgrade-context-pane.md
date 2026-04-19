---
title: Upgrade Context Pane
status: proposed
type: ui-feature
priority: 1
sources:
  - url: https://arxiv.org/html/2604.00436v1
    label: Programming by Chat - A Large-Scale Behavioral Analysis of 11,579 Real-World AI-Assisted IDE Sessions
    relevance: primary
    focus:
      - Abstract and key findings on developers actively managing collaboration through context injection, constraints, and persistent artifacts.
      - Finding 5 on externalizing state into artifacts such as progress documents.
      - Finding 6 and Section 6.3 on injecting missing context and imposing behavioral constraints.
      - Finding 10 on starting new chats to refresh context while preserving continuity.
  - url: https://arxiv.org/abs/2410.04596
    label: Need Help? Designing Proactive AI Assistants for Programming
    relevance: secondary
    focus:
      - Abstract framing of programming context as a shared workspace and support for visible suggestion integration.
related_notes:
  - plans/ui-roadmap-short-term.md
  - plans/concept-graph-generation-improvements.md
---

# Upgrade Context Pane

## Summary

Turn the current `Context` pane into a stronger context-composition and verification surface.

## Why it matters

This is the highest-value short-term UI change because the context pane is the clearest place where `ConceptCode` can make graph-based prompt composition visible and inspectable.

The product’s core value is not hidden retrieval. It is helping a user choose, inspect, and verify a graph-derived working set using stable concept paths and explicit references. A stronger context pane makes that model legible in day-to-day use.

If this pane remains thin, users still have to mentally reconstruct what context they are sending and why. If it becomes a real context-composition surface, the graph becomes a practical collaboration tool rather than just a browser.

## Research grounding

`Programming by Chat` shows that conversational programming works as progressive specification and that developers actively manage AI collaboration through context injection, persistent artifacts, and behavioral constraints. That maps directly to `ConceptCode`: the UI should expose prompt context as a managed working set, not as a side effect that users must infer from prompt text.

The proactive-assistant work reinforces the idea of programming context as a shared workspace. In `ConceptCode`, the `Context` pane is the most natural place to make that shared workspace visible without taking control away from the user.

## Scope

- split the pane into `Selection` and `Verification` sections
- keep explicit referenced concepts and files clearly separated
- show token contribution per referenced item
- show a compact current-selection semantic reminder when applicable

## Implementation notes

- Treat this pane as the visible working memory for prompt composition.
- Keep direct references clearly separated from any later supporting or suggested context.
- Reuse existing prompt-state and token accounting logic rather than introducing a second context model.
- Keep the layout compact enough for narrow terminals and avoid verbose explanatory copy.
- Favor small structural cues and labels over large descriptive blocks.

## Acceptance criteria

- the pane distinguishes selection state from verification state
- the current selection can be understood quickly without leaving the pane
- the pane makes graph-derived prompt context more inspectable before send
- the layout remains compact and TUI-native

## Out of scope

- hidden automatic context expansion
- a full verification workflow or dedicated verification mode
- new graph fields introduced only for this pane

## Uncertainties

- The exact split between `Selection` and `Verification` may need to follow the existing TUI layout constraints.
- The right level of detail for the current-selection summary depends on how much horizontal space the terminal layout usually has.
