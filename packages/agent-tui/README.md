# agent-tui

Reusable OpenTUI shell primitives extracted from `ConceptCode`.

## Scope

This package owns generic shell concerns only:

- theme tokens
- text helpers
- layout geometry helpers
- animation primitives
- workspace frame composition
- overlay primitives
- inspector chrome
- session modal rendering
- shell key routing helpers
- scroll-box creation

It does not own app/domain concerns such as concept graphs, prompt semantics, session persistence, or preview/content generation.

## Main exports

- `agent-tui/types`
- `agent-tui/theme`
- `agent-tui/text`
- `agent-tui/layout/geometry`
- `agent-tui/animation`
- `agent-tui/render/frame`
- `agent-tui/render/overlay`
- `agent-tui/render/inspector`
- `agent-tui/render/session-modal`
- `agent-tui/render/scroll`
- `agent-tui/keybindings`

## Expected integration style

Host apps should:

- provide shell-facing view models from app state
- inject app-owned pane content and overlay content at the rendering boundary
- import reusable progress shaping and rect interpolation helpers from `agent-tui/animation`
- keep persistence, command semantics, and domain-specific preview generation outside this package

## Boundary audit

- `packages/agent-tui/src/` imports only package-local modules and `@opentui/core`.
- The package does not import from `src/` or other ConceptCode-specific modules.
- The package surface stays shell-oriented: layout math, stateless animation primitives, key routing, overlay/frame renderers, inspector chrome, session modal rendering, theme/text helpers, and shell-facing view-model types.
- `agent-tui/animation` is the explicit entrypoint for reusable progress helpers, rect interpolation helpers, and stack transition geometry helpers.
- Host apps still own domain semantics and callbacks, including prompt suggestion meaning, concept preview generation, session persistence, application shutdown policy, workspace-specific transition orchestration, and pane rendering.

## Test coverage

- `packages/agent-tui/src/geometry.test.ts` covers wide-layout geometry, reusable animation primitives, and transition interpolation helpers.
- `packages/agent-tui/src/keybindings.test.ts` covers session modal viewport sizing, wraparound list navigation, selection visibility, and generic command classification.

## Known follow-up work

- `src/ui/workspace-transition.ts` remains app-local because workspace-specific transition orchestration and pane body rendering still cross the app boundary through callbacks.
- `src/core/types.ts` still re-exports shell-focused types from `agent-tui/types` for compatibility with existing app imports.
- A later extraction pass could further separate prompt-editor token grammar if reusable editor semantics become a goal.
