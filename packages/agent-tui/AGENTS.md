# AGENTS.md

## Scope

These instructions apply within `packages/agent-tui/` and its subdirectories.

## Package purpose

`agent-tui` is the extracted reusable OpenTUI shell package from `ConceptCode`.

This package owns shell concerns such as:

- shell-facing view-model and layout contracts
- layout and interpolation helpers
- workspace frame composition
- overlay and inspector chrome primitives
- session modal rendering
- generic key-routing helpers
- shell-level theme and text helpers

This package does not own app or domain concerns such as:

- concept-graph semantics
- prompt token semantics like `@concept`, `&file`, or `/command`
- graph-scoped session persistence
- ConceptCode-specific pane body rendering
- snippet, subtree, or metadata preview generation

## Boundary rules

- Do not import from the repo root `src/` tree or other ConceptCode-specific modules.
- Keep exported APIs structural and host-app friendly; prefer narrow view models and callback contracts.
- Avoid adding ConceptCode-flavored names, assumptions, or behaviors to package APIs.
- Keep the package OpenTUI-specific for now; do not generalize away from OpenTUI unless explicitly requested.

## Change guidance

- Prefer small boundary-tightening changes over broad package redesigns.
- When adding types, distinguish clearly between package-owned shell contracts and host-app state wrappers.
- Keep docs and tests in sync when changing exported package behavior.
- Add or extend package-local tests for geometry, routing, or renderer behavior when modifying those surfaces.

## Current known boundaries

- `src/ui/workspace-transition.ts` remains app-local in `ConceptCode`; only the lower-level geometry helpers are package-owned.
- Some app modules still adapt local state into package view models; that adapter layer should stay outside this package.
- Prompt-editor provider boundaries exist in the app, but prompt token parsing/highlighting is still app-local.
