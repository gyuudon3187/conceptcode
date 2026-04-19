---
title: Design Graph-Quality Review Mode
status: proposed
type: future-design
priority: 7
blockers:
  - 01-strengthen-generation-hierarchy-policy.md
  - 02-define-sparse-graph-metadata-policy.md
sources:
  - url: ../sources/3772318.3791176.pdf
    label: Verification Load and Fatigue with AI Coding Assistants
    relevance: primary
    focus:
      - Title and abstract-level framing of verification load and fatigue as a first-class problem in AI coding assistance.
  - url: https://arxiv.org/pdf/2311.06305
    label: A Systematic Review on Fostering Appropriate Trust in Human-AI Interaction
    relevance: secondary
    focus:
      - Appropriate trust and trust-calibration framing for selective rather than broad undifferentiated checking.
      - Interventions during decision-making such as on-demand explanation and other mechanisms that can slow premature acceptance.
      - Distinction between perceived and demonstrated trust.
  - url: https://arxiv.org/html/2504.04553v3
    label: Understanding Codebase like a Professional! Human-AI Collaboration for Code Comprehension
    relevance: tertiary
    focus:
      - Reduction in reading and interpreting raw LLM responses through structured hierarchical review.
      - Multi-level structural review as a way to replace flat inspection with selective movement across abstraction levels.
related_notes:
  - plans/concept-graph-generation-improvements.md
---

# Design Graph-Quality Review Mode

## Summary

Define a future critique or review flow for generated concept graphs that supports staged verification, selective checking, and trust calibration before the graph is treated as good enough for downstream UI use.

## Why it matters

The roadmap treats this as optional follow-up work, but it is a natural next step if the team wants a repeatable way to evaluate graph quality without relying on one broad undifferentiated inspection pass.

## Research grounding

Verification-fatigue and trust-calibration research together suggest that review should help users check the right things at the right level of abstraction rather than read everything flatly. CodeMap provides a supporting example that hierarchical structural review can reduce reliance on raw LLM prose and improve purposeful exploration.

## Scope

This is a design and planning ticket, not necessarily an implementation ticket.

Possible touchpoints:

- future prompt workflows
- future slash commands
- future documentation describing graph-quality checks

## Implementation notes

Define a review checklist or review-mode proposal that can identify issues such as:

- overly broad nodes
- missing useful leaves
- behaviors attached too high in the hierarchy
- fake grouping buckets
- overuse or underuse of `related_paths`
- nodes that would benefit from `why_it_exists`
- stateful concepts missing `state_predicate`

Prefer a light review workflow that supports staged and selective checking without expanding the schema with volatile review metadata.

## Acceptance criteria

- there is a concrete proposal for a graph-quality review flow or checklist
- the proposal is aligned with the hierarchy and sparse metadata policies
- the proposal supports selective review instead of broad undifferentiated checking
- the proposal does not require adding volatile metadata to the graph

## Out of scope

- implementing a full automatic linting system unless separately planned
