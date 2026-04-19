---
title: Improve Cross-Level Orientation
status: proposed
type: ui-feature
priority: 3
sources:
  - url: https://arxiv.org/html/2504.04553v3
    label: Understanding Codebase like a Professional! Human-AI Collaboration for Code Comprehension
    relevance: primary
    focus:
      - RQ1 results on hierarchical understanding flow from global overview to local modules to detailed implementation checks.
      - Design Opportunity 3 on representations connecting multiple abstraction layers.
      - Design Opportunity 4 on continuity of understanding and reducing interruptions in ongoing reasoning.
      - Evaluation result that structured maps reduced time spent reading LLM responses and increased reliance on navigable structure.
related_notes:
  - plans/ui-roadmap-short-term.md
  - plans/concept-graph-generation-improvements.md
---

# Improve Cross-Level Orientation

## Summary

Make ancestry and nearby context more visible while browsing concepts and composing prompts.

## Why it matters

Stable concept paths only help if users can stay oriented across hierarchy levels while browsing and selecting context. In `ConceptCode`, the concept graph is the main interaction surface, so losing parent-child context directly reduces the usefulness of the graph as a prompt-composition tool.

This ticket matters because it turns better graph structure into practical navigation value. If users can see where they are, what sits nearby, and whether they are looking at a broad parent or a promptable leaf, they can make better context choices with less manual searching.

## Research grounding

The CodeMap paper argues that code understanding follows a global-to-local hierarchical flow and that tools should support movement across abstraction levels without breaking reasoning continuity. That maps cleanly to `ConceptCode`, whose graph structure is already intended to carry that overview-to-detail flow.

The relevant design implication is not to build a heavy visualization system, but to keep orientation cues close to the current concept so users can navigate and compose prompts without falling back to raw file exploration.

## Scope

- add a compact breadcrumb or ancestry line
- add a lightweight `Nearby` section
- surface parent, siblings, children when few, and `related_paths`
- help users distinguish broad parents from promptable leaves

## Implementation notes

- Keep orientation cues close to the browsing and prompting flow rather than hiding them in a separate mode.
- Prefer derived labels based on graph depth and child count over new persisted graph properties.
- The `Nearby` section should remain an orientation aid, not become a second full navigator.
- Preserve emphasis on concept paths and graph structure rather than code-layout mirroring.

## Acceptance criteria

- users can see where the current concept sits in the graph more easily
- nearby navigational options reduce unnecessary scrolling and searching
- orientation aids help users judge whether to reference the current node or a nearby one
- orientation aids do not become a second heavy navigator

## Out of scope

- full graphical map rendering
- new graph metadata added only for orientation display
- automatic context inclusion based on nearby nodes

## Uncertainties

- The best amount of nearby context may vary based on terminal size and graph breadth.
- Reverse-neighbor style navigation may be better deferred unless the existing data model already exposes it cheaply.
