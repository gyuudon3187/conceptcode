# Coding-Agent Boundary Handoff

## Intent

`ConceptCode`'s `src/` tree should own concept-graph-specific product behavior, not generic coding-agent chat/session infrastructure.

## Target package ownership

### `src/`

- Concept graph semantics
- ConceptCode prompt reference meanings
- ConceptCode-specific agent policy such as `conceptualize`
- App state that is specifically about the concept graph UI
- Thin app wiring around reusable packages

### `packages/coding-agent`

- Generic coding-agent runtime concerns
- Message adaptation from chat turns into coding-agent messages
- Scoped-context resolution/helpers that are not ConceptCode-specific
- Provider-agnostic streaming model contracts
- Generic scoped-context data structures/formatting helpers

### `packages/agent-chat`

- Generic chat/session/message types
- Generic chat transport/request/event types
- Generic file-backed session persistence
- Generic message/session normalization rules

### `packages/agent-tui`

- Generic TUI shell/rendering/layout primitives only
- No ConceptCode-specific semantics
- No session persistence

## Already extracted

- Generic chat/session model moved from `src/core/types.ts` to `packages/agent-chat`
- Generic file-backed session store moved from `src/sessions/store.ts` into `packages/agent-chat`
- Generic chat-to-coding-agent message adaptation moved from `src/coding-agent/messages.ts` to `packages/coding-agent/src/chat-messages.ts`
- App-local types in `src/core/types.ts` now wrap generic package types with ConceptCode-specific fields like `UiMode` and `graphPath`

## Likely follow-up refactors in `src/coding-agent`

### `src/coding-agent/context.ts`

Still mixes generic scoped-context workflow with ConceptCode prompt reference resolution.

Likely split:

- generic helper in `packages/coding-agent` that accepts resolved active paths or a resolver callback
- ConceptCode-specific adapter in `src/`

### `src/coding-agent/overlay-view.ts`

Currently app-local, but mostly generic text formatting for scoped-context trees.

Possible destinations:

- `packages/coding-agent` if it stays a plain-text formatter
- `packages/agent-tui` if it becomes a shell/view-model helper

### `src/coding-agent/overlay.ts`

Mostly app wiring today. Probably should stay thin and app-local unless a reusable modal contract emerges.

### `src/platform/coding-agent.ts`

Better now, but still app-owned transport wiring. Keep it app-local unless a host-app-neutral transport adapter clearly emerges.

## Key rule for future refactors

If a type or helper still makes sense for a non-ConceptCode coding-agent app, it probably should not live in `src/`.

## Things that should stay app-local

- `resolveConceptCodePromptReferences`
- `@concept`, `&file`, `/command` semantics
- `UiMode` as ConceptCode product behavior
- `conceptualize` primary-agent policy
- Anything directly coupled to concept graph nodes, graph payloads, or concept UI state

## Suggested next-session prompt

```md
Continue tightening package boundaries around `src/coding-agent`.

Intent:
- `src/` should only own ConceptCode-specific concept-graph behavior and thin app wiring.
- `packages/coding-agent` should own generic coding-agent runtime/message/scoped-context concerns.
- `packages/agent-chat` should own generic chat/session/storage concerns.
- `packages/agent-tui` should own generic TUI shell concerns only.

Please inspect `src/coding-agent/*` and nearby call sites, especially:
- `src/coding-agent/context.ts`
- `src/coding-agent/overlay-view.ts`
- `src/coding-agent/overlay.ts`
- `src/platform/coding-agent.ts`

Goal:
- move any remaining generic logic out of `src/coding-agent`
- keep ConceptCode-specific prompt reference semantics and app state wiring in `src/`
- prefer small boundary-tightening changes over broad redesign

Please start by mapping what is still generic vs ConceptCode-specific before editing.
```
