---
title: Concept Graph Tickets Index
status: reference
type: docs
related_notes:
  - plans/concept-graph-generation-improvements.md
---

# Concept Graph Tickets Index

This index summarizes the concept-graph generation tickets, their relative priority, and their main dependencies.

## Ticket summary

| Priority | Filename | Type | Blockers |
| --- | --- | --- | --- |
| 1 | `01-strengthen-generation-hierarchy-policy.md` | `prompt-policy` | none |
| 2 | `02-define-sparse-graph-metadata-policy.md` | `prompt-policy` | `01-strengthen-generation-hierarchy-policy.md` |
| 3 | `03-update-prompt-execution-guidance.md` | `prompt-policy` | `01-strengthen-generation-hierarchy-policy.md`, `02-define-sparse-graph-metadata-policy.md` |
| 4 | `04-update-concept-graph-command-guidance.md` | `workflow-policy` | `01-strengthen-generation-hierarchy-policy.md`, `02-define-sparse-graph-metadata-policy.md`, `03-update-prompt-execution-guidance.md` |
| 5 | `05-document-three-pass-generation-boundary.md` | `workflow-policy` | `01-strengthen-generation-hierarchy-policy.md`, `03-update-prompt-execution-guidance.md`, `04-update-concept-graph-command-guidance.md` |
| 6 | `06-review-schema-and-doc-ripple.md` | `docs` | `01-strengthen-generation-hierarchy-policy.md`, `02-define-sparse-graph-metadata-policy.md`, `03-update-prompt-execution-guidance.md`, `04-update-concept-graph-command-guidance.md`, `05-document-three-pass-generation-boundary.md` |
| 7 | `07-design-graph-quality-review-mode.md` | `future-design` | `01-strengthen-generation-hierarchy-policy.md`, `02-define-sparse-graph-metadata-policy.md` |

## Suggested execution order

1. `01-strengthen-generation-hierarchy-policy.md`
2. `02-define-sparse-graph-metadata-policy.md`
3. `03-update-prompt-execution-guidance.md`
4. `04-update-concept-graph-command-guidance.md`
5. `05-document-three-pass-generation-boundary.md`
6. `06-review-schema-and-doc-ripple.md`
7. `07-design-graph-quality-review-mode.md`

## Notes

- `07-design-graph-quality-review-mode.md` is optional follow-up work and does not need to block the main prompt and command improvements.
- `06-review-schema-and-doc-ripple.md` should generally happen after the prompt and workflow policy tickets settle so documentation reflects stable decisions rather than interim wording.
