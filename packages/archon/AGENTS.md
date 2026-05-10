# AGENTS.md

## Scope

These instructions apply within `packages/archon/` and its subdirectories.

## Package purpose

`archon` is the primary implementation package for the Workflows feature.

This package owns:

- Archon workflow and command structural types
- workflow discovery, parsing, serialization, and validation
- Archon-specific selection and dirty-state helpers
- Archon CRUD state transitions that do not require shell or filesystem access
- Archon modal state updates and modal rendering
- Archon feature-buffer semantics for command body editing
- save-plan generation as structural write or delete intents
- Archon primary-pane and support-pane rendering

This package does not own:

- filesystem writes, deletes, mkdirs, or reload orchestration
- OpenTUI renderer lifecycle or textarea hosting
- app-wide confirm modal lifecycle
- global shell keybinding plumbing
- primary-feature registration policy in the root app

## Boundary guidance

- Prefer moving Archon-specific behavior here before adding more logic to `src/archon/` or other root files.
- Keep this package host-friendly: return structural state, renderables, or file-operation plans rather than reaching into root shell concerns.
- Treat `src/archon/` as the adapter layer for disk I/O, redraw timing, and app-shell integration.
- When a root file mirrors logic that could be pure Archon behavior, move the logic here and leave a thin wrapper in root.

## Current package shape

- `types.ts` defines Archon state, modal state, render-color contracts, and workflow or command structures.
- `state.ts` owns Archon-local selection, dirty-state, pending-delete, submode, and catalog replacement helpers.
- `feature.ts` owns Archon CRUD transitions, modal input handling, feature-buffer application, and save-plan building.
- `render.ts` owns read-only catalog rendering plus Archon-owned overlay rendering for metadata and node modals.
- `workflows.ts`, `commands.ts`, `discovery.ts`, and `validate.ts` own file-format behavior.

## Change guidance

- Preserve the conservative v1 policy of avoiding lossy workflow saves; unsupported workflow shapes should remain read-only unless safe pass-through is clearly implemented.
- Keep save planning separate from actual filesystem execution.
- Keep command body editing generic through the feature-buffer contract rather than reintroducing Archon-specific editor hosting in root.
- Prefer adding generic host seams in root only when Archon truly needs them and the seam is likely reusable by other features.
