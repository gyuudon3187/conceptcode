---
title: Ticket Structure Guide
status: reference
type: docs
related_notes:
  - plans/concept-graph-generation-improvements.md
---

# Ticket Structure Guide

This directory breaks larger planning documents into standalone tickets that can be discussed or implemented in later sessions without requiring the earlier conversation history.

## Frontmatter fields

Each ticket starts with YAML frontmatter.

Recommended fields:

- `title`: human-readable ticket title
- `status`: current state of the ticket
- `type`: ticket category
- `priority`: integer priority within this ticket set
- `blockers`: optional array of prerequisite ticket filenames
- `sources`: optional array of supporting sources
- `related_notes`: optional array of related repo notes or parent plans

## Field meanings

### `status`

Suggested values:

- `proposed`
- `in_progress`
- `done`
- `reference`

### `type`

Suggested values in this directory:

- `prompt-policy`
- `workflow-policy`
- `docs`
- `future-design`

### `priority`

Priority is relative within this ticket set.

- `1` means highest product value in this roadmap slice
- larger numbers mean lower immediate value

Priority is about expected product value, not implementation ease.

### `blockers`

`blockers` lists ticket filenames that should be completed first.

Use blockers only for real execution dependencies such as:

- policy decisions another ticket establishes
- wording that should be derived from earlier tickets
- workflow boundaries that later docs or commands should reflect

### `sources`

`sources` stores research or other external context that helps explain why the ticket exists.

Each source object may contain:

- `url`: source URL
- `label`: source title
- `relevance`: such as `primary`, `secondary`, or `tertiary`
- `focus`: list of the most relevant source parts for this ticket

The `focus` list should capture the specific sections, findings, or arguments that matter, not just the document title.

### `related_notes`

`related_notes` points to repo-local planning or reference files that provide nearby context.

## Ticket body conventions

Each ticket should usually include these sections:

1. `Summary`
2. `Why it matters`
3. `Research grounding`
4. `Scope`
5. `Implementation notes`
6. `Acceptance criteria`
7. `Out of scope`

## Dependency shape in this set

This ticket set follows a deliberate sequence:

1. define hierarchy policy
2. define sparse metadata policy
3. update prompt-execution guidance
4. update command guidance
5. document the protected three-pass workflow boundary
6. review schema and documentation ripple effects
7. optionally define a future graph-quality review mode

## Notes for future sessions

- Filenames in `blockers` are the source of truth for dependencies.
- Tickets may cite research sources, repo notes, or both.
- The same source can appear in multiple tickets, but each ticket should record only the parts that materially matter to that ticket.
- If a later session splits a ticket further, update filenames and blockers together.
