# AGENTS.md

## Project purpose

`setsumei` is a standalone tool for representing programs as hierarchical concept graphs and browsing those graphs in a TUI.

The project is not limited to TUIs. It should be usable for:

- applications
- libraries
- CLIs
- workflows
- data pipelines
- architecture overviews
- state machines
- data models

The central idea is that a human or LLM can refer to a concept by a stable path like `root.views.merge_view.pending_selection` instead of relying on vague natural-language descriptions.

## Key product ideas

- The JSON concept graph is the source of truth.
- Each concept has a stable `path`.
- Concepts may describe views, workflows, controls, regions, data models, behaviors, transitions, or any other useful abstraction.
- The browser should optimize for quick inspection and easy clipboard export for LLM prompts.
- Default clipboard export should stay concise.
- Richer context should remain available on demand.

## Guidance for agents working here

- Prefer changes that make the tool more generic rather than more tied to one codebase.
- Preserve stable paths in concept graphs whenever possible.
- Treat the JSON schema as user-facing and long-lived; avoid breaking changes unless clearly necessary.
- Keep clipboard payloads compact by default.
- Keep the browser responsive; avoid blocking subprocess behavior.
- Favor plain text formats that paste cleanly into LLM chats.

## Repository conventions

- Package code lives in `setsumei/`.
- Example concept graphs live in `examples/`.
- User and developer documentation lives in `docs/`.
- Reusable prompt/command material for concept-graph creation lives in `prompts/`.

## Development environment

- This repo provides `bun` through the Nix flake in `flake.nix`.
- When `bun` is not available directly on `PATH`, run Bun commands through the dev shell, for example `nix develop -c bun run typecheck`.
- `.envrc` uses `use flake`, so `direnv` may also make `bun` available automatically in some shells.

## Concept graph expectations

Expected top-level shape:

```json
{
  "schema_version": 1,
  "source_file": "path/to/source.py",
  "interpretation_hint": {},
  "root": {
    "title": "...",
    "kind": "module",
    "summary": "...",
    "children": {}
  }
}
```

Useful optional concept fields include:

- `summary`
- `why_it_exists`
- `code_refs`
- `related_paths`
- `aliases`
- `state_predicate`
- `children`

## Prompt-generation goal

This repository should help generate concept graphs that are:

- accurate enough to anchor code discussions
- small enough to browse comfortably
- rich enough to help an LLM find the right implementation anchors
