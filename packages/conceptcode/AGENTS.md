# AGENTS.md

## Scope

These instructions apply within `packages/conceptcode/` and its subdirectories.

## Package purpose

`conceptcode` is the primary implementation package for ConceptCode-specific behavior.

This package owns:

- concept-graph types, navigation, and model semantics
- ConceptCode prompt semantics and slash-command surfaces
- graph mutation and validation scripts
- Concepts-side pane content and concept-specific preview rendering
- ConceptCode clipboard export formatting and runtime prompt preambles
- concept draft and concept-list behavior

This package does not own:

- root shell/workspace composition
- prompt textarea hosting lifecycle
- session persistence
- file-reference `&...` semantics
- external editor or clipboard platform integration
- cross-feature orchestration policy

## Change guidance

- Prefer implementing ConceptCode-specific behavior here instead of in the root `src/` tree.
- Keep package APIs host-friendly and structural when the root shell needs to inject state, theme, or platform adapters.
- Preserve stable concept-path behavior and schema expectations.
- When a root file mirrors this package through a wrapper, update the package first and keep the wrapper minimal.
