# AGENTS.md

## Scope

These instructions apply repo-wide unless a deeper `AGENTS.md` overrides them.

## Project purpose

`setsumei` is a tool for representing software and related systems as hierarchical concept graphs and browsing those graphs in a TUI.

The project is not limited to TUIs or to source code modules. It should work well for:

- applications
- libraries
- CLIs
- workflows
- data pipelines
- architecture overviews
- state machines
- data models

The core idea is that a human or LLM can refer to a concept by a stable derived path like `root.views.merge_view.pending_selection` instead of relying on vague natural-language descriptions.

## Product invariants

- The JSON concept graph is the source of truth.
- Stable concept paths come from object keys under `children`, so those keys are user-facing and should stay stable when possible.
- Treat the JSON schema as user-facing and long-lived; avoid breaking changes unless clearly necessary.
- Concepts may describe views, workflows, controls, regions, data models, behaviors, transitions, or any other useful abstraction.
- Clipboard export should favor a low-friction agent-inference workflow, with the copied prompt explaining how to interpret available concept fields and optional anchors.

## Guidance for agents working here

- Preserve stable child keys and therefore stable derived paths whenever possible.
- Prefer a good concept graph over uncertain source anchors.
- Prefer a concept-graph-first workflow and add source anchors in a later enrichment pass when needed.
- Favor plain text formats that paste cleanly into LLM chats.
- Apply more specific local `AGENTS.md` guidance when working inside subdirectories such as `src/` or `prompts/`.

## Repository conventions

- Package code lives in `src/`.
- Example concept graphs live in `examples/`.
- User and developer documentation lives in `docs/`.
- Reusable prompt material for concept-graph creation lives in `prompts/`.
- Command wrappers and reusable invocation text live in `commands/`.

## Schema reference

- Canonical schema guidance lives in `docs/json_schema.md`.
- Keep the top-level graph shape consistent with the canonical schema and schema version.
- `source_file` is graph-level context, while `loc.file` is concept-level truth for a specific anchor.
- Use optional fields such as `why_it_exists`, `loc`, `related_paths`, `aliases`, and `state_predicate` only when they add real value.

## Concept-graph workflow

- It is acceptable to create the main concept graph and enrich source anchors in separate passes.
- When enriching anchors later, preserve the existing hierarchy and stable concept paths unless the original graph is clearly wrong.

## Prompt-generation goal

This repository should help generate concept graphs that are:

- accurate enough to anchor code discussions
- small enough to browse comfortably
- rich enough to help an LLM find the right implementation anchors
