# agent-tui

Reusable OpenTUI shell primitives extracted from `ConceptCode`.

## Scope

This package owns generic shell concerns only:

- theme tokens
- text helpers
- layout geometry helpers
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
- keep persistence, command semantics, and domain-specific preview generation outside this package
