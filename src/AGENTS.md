# AGENTS.md

## Scope

These instructions apply when working in this directory and its subdirectories.

## Development priorities

- Prefer changes that make the tool more generic rather than more tied to one codebase.
- Preserve stable child keys and derived paths when changing model or editing behavior.
- Treat the JSON schema as user-facing and long-lived; avoid breaking changes unless clearly necessary.
- Keep current clipboard export payloads compact by default, with concept context driven by prompt references rather than broad selection state.
- Keep the concept-aware interface responsive; avoid blocking subprocess behavior.
- Favor plain text formats that paste cleanly into LLM chats.

## Architecture reminders

- `src/index.ts` boots the OpenTUI app and wires keyboard input to state transitions.
- `src/chat.ts` is the provider-facing streaming transport boundary and the current home of the disposable local dummy SSE chat server.
- `src/model.ts` loads and normalizes concept graphs.
- `src/state.ts` manages navigation, status, layout mode, and scroll state.
- `src/view.ts` renders the prompt-first interface, concept summary surfaces, and inspector overlays.
- `src/clipboard.ts` builds the current clipboard export payload from prompt-referenced concept aliases and integrates with `wl-copy`.
- `src/types.ts` defines shared application and schema types.

## Workspace terminology

In wide layout, the UI has two focus-driven workspace compositions:

- Concepts-side workspace:
  - `state.conceptNavigationFocused === true`
  - The Concepts pane is the dominant pane.
  - The supporting column shows Details on top and Session preview below.

- Session-side workspace:
  - `state.conceptNavigationFocused === false`
  - The Session pane is the dominant pane.
  - The supporting column shows Context on top and Concepts preview below.

Workspace transitions use the same terminology as their `from` and `to` values in `state.workspaceTransition`:

- Concepts-to-Session transition:
  - `from === "concepts"` and `to === "session"`

- Session-to-Concepts transition:
  - `from === "session"` and `to === "concepts"`

When discussing layout tuning, "source" refers to the `from` workspace geometry and "destination" refers to the `to` workspace geometry.

## Streaming integration guidance

- Keep provider-specific wire protocols out of the TUI rendering path when possible; normalize them at the chat transport boundary first.
- Preserve the prompt thread's incremental rendering behavior when changing chat integration so assistant output can appear token-by-token without blocking the UI.
- Prefer minimal provider coupling in `src/index.ts` and `src/view.ts`; transport swapping should mostly happen in `src/chat.ts` and shared event types.
- Keep the dummy chat path disposable and lightweight; it exists to exercise the streaming UI path, not to become a second full provider implementation.
- `src/chat.test.ts` is the smoke test for the streaming transport flow. Extend it when changing stream event sequencing or dummy output behavior.

## Development environment

- This repo provides `bun` through the Nix flake in `flake.nix`.
- When `bun` is not available directly on `PATH`, run Bun commands through the dev shell, for example `nix develop -c bun run typecheck`.
- `.envrc` uses `use flake`, so `direnv` may also make `bun` available automatically in some shells.
