---
title: Review Schema And Doc Ripple
status: proposed
type: docs
priority: 6
blockers:
  - 01-strengthen-generation-hierarchy-policy.md
  - 02-define-sparse-graph-metadata-policy.md
  - 03-update-prompt-execution-guidance.md
  - 04-update-concept-graph-command-guidance.md
  - 05-document-three-pass-generation-boundary.md
sources:
  - url: https://journals.sagepub.com/doi/10.1177/14761270251385456
    label: Generative AI and the social fabric of organizations
    relevance: primary
    focus:
      - Framing on longer-term, collective, and indirect implications of GenAI for work practices.
      - Shared transparency and verification practices such as provenance tags, prompt histories, review structures, and prompt libraries.
      - Shift from authorship-centered trust to process visibility and credibility.
      - Warning against isolated personalized AI lanes or AI islands.
related_notes:
  - plans/concept-graph-generation-improvements.md
---

# Review Schema And Doc Ripple

## Summary

Review whether the updated generation policy should ripple into repository documentation, especially schema guidance and user-facing descriptions of concept-graph generation behavior.

## Why it matters

If prompt and command guidance change materially, the written docs should not silently drift. Future sessions should be able to recover the intended graph policy from the docs without needing earlier conversation history.

## Research grounding

The STS rationale is that local task changes can have longer-term collective effects on work practices. Documentation ripple review is therefore not just hygiene. It helps keep concept-graph generation legible, inspectable, and transferable across collaborators rather than turning into a private workflow known only to one session or one user.

## Scope

Files to review:

- `docs/json_schema.md`
- `README.md`
- `prompts/clipboard_preamble.md`
- `prompts/clipboard_preamble_conceptualize.md`
- root `AGENTS.md`

## Implementation notes

Check whether docs should clarify:

- that hierarchy quality is prioritized over broad field expansion
- that `why_it_exists`, `state_predicate`, and `related_paths` are selective optional fields
- that `loc` remains a separate enrichment pass
- that the graph is intended to support promptable conceptual references and selective context composition

Use the repo’s doc-ripple workflow if the earlier prompt changes are material enough to warrant it.

## Acceptance criteria

- the relevant docs have been reviewed for policy drift
- any required doc updates are identified or implemented
- no docs are changed unnecessarily if current wording is already sufficient
- the resulting docs preserve shared and transferable understanding of the workflow

## Out of scope

- introducing new product claims unrelated to the graph-generation policy
