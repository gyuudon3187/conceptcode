---
title: UI Short-Term Ticket Structure Guide
status: reference
type: docs
related_notes:
  - plans/ui-roadmap-short-term.md
---

# UI Short-Term Ticket Structure Guide

This directory breaks `plans/ui-roadmap-short-term.md` into standalone tickets that can be discussed or implemented later without requiring the original planning session.

The same frontmatter conventions used in `plans/tickets/` apply here:

- `title`
- `status`
- `type`
- `priority`
- `blockers`
- `sources`
- `related_notes`

Suggested ticket types for this directory:

- `ui-feature`
- `ui-policy`
- `docs`

Short-term UI tickets should usually focus on small-to-medium TUI-native improvements that:

- improve context selection
- improve orientation across the graph
- surface high-value metadata more clearly
- add lightweight verification support

They should generally avoid:

- major architectural rewrites
- hidden automatic context expansion
- heavyweight review dashboards
- new graph fields introduced only for UI convenience
