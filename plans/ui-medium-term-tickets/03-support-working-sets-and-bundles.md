---
title: Support Working Sets And Bundles
status: proposed
type: ui-feature
priority: 3
blockers:
  - 02-add-mixed-initiative-context-suggestions.md
sources:
  - url: ../sources/2604.00436v1.pdf
    label: Programming by Chat - A Large-Scale Behavioral Analysis of 11,579 Real-World AI-Assisted IDE Sessions
    relevance: primary
    focus:
      - Finding 5 on externalizing intent into persistent artifacts.
      - Finding 6 on context injection and explicit behavioral constraints supporting include and exclude control.
      - Finding 10 on refreshing chats while preserving continuity, supporting reusable bundles over private thread state.
  - url: ../sources/Generative AI and the social fabric of organizations - Reza M Baygi, Marleen Huysman, 2025.pdf
    label: Generative AI and the social fabric of organizations
    relevance: secondary
    focus:
      - Shared transparency and verification practices such as prompt histories and provenance tags.
      - Social-fabric framing supporting transferable and inspectable bundles rather than individual-only workflows.
related_notes:
  - plans/ui-roadmap-medium-term.md
---

# Support Working Sets And Bundles

## Summary

Make the current task working set a first-class object of interaction and support lightweight reusable bundles for recurring tasks.

## Why it matters

Prompting is progressive and iterative, not one-shot. Users often build context over several turns, refine it, and return to related tasks later. `ConceptCode` should preserve that graph-centered task state more explicitly than relying on raw prompt text or chat history alone.

This ticket matters because it turns context composition into a durable interaction object. That gives users continuity across subtasks and sessions while keeping the context set inspectable.

## Research grounding

`Programming by Chat` shows that developers externalize intent into persistent artifacts and restart sessions while preserving continuity. Working sets and bundles are a natural `ConceptCode` analog to that pattern.

The Baygi and Huysman paper supports inspectable, shared work practices over private opaque workflows. That suggests bundles should remain transparent and editable rather than turning into hidden saved prompts.

## Scope

- session-local working sets
- named lightweight bundles
- inspectable and editable membership
- rough token-cost visibility

## Implementation notes

- Keep direct references, accepted suggestions, and manually added items distinguishable.
- Treat bundles as inspectable context sets rather than serialized prompt text.
- Favor lightweight creation and editing flows so bundles remain convenient rather than heavyweight project artifacts.
- Rough token cost should stay visible so reuse does not hide prompt-size growth.

## Acceptance criteria

- users can preserve and inspect context sets without turning them into opaque saved prompts
- direct and supporting context remain distinguishable
- users can see rough bundle cost before reuse

## Out of scope

- opaque saved prompts with hidden expansion rules
- heavy project-wide artifact management
- replacing explicit per-task context editing with bundle defaults alone

## Uncertainties

- It is still somewhat unclear how durable bundles should be by default: session-local first is safest.
- Bundle sharing semantics may need follow-up design if the project later wants multi-user or team-visible workflows.
