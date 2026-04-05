# AGENTS.md

## Scope

These instructions apply when working in this directory and its subdirectories.

## Development priorities

- Prefer changes that make the tool more generic rather than more tied to one codebase.
- Preserve stable child keys and derived paths when changing model or editing behavior.
- Treat the JSON schema as user-facing and long-lived; avoid breaking changes unless clearly necessary.
- Keep clipboard payloads compact by default, with richer context available on demand.
- Keep the browser responsive; avoid blocking subprocess behavior.
- Favor plain text formats that paste cleanly into LLM chats.

## Architecture reminders

- `src/index.ts` boots the OpenTUI app and wires keyboard input to state transitions.
- `src/model.ts` loads and normalizes concept graphs.
- `src/state.ts` manages navigation, status, layout mode, and scroll state.
- `src/view.ts` renders the interface and pane layouts.
- `src/clipboard.ts` builds clipboard export payloads and integrates with `wl-copy`.
- `src/types.ts` defines shared application and schema types.

## Development environment

- This repo provides `bun` through the Nix flake in `flake.nix`.
- When `bun` is not available directly on `PATH`, run Bun commands through the dev shell, for example `nix develop -c bun run typecheck`.
- `.envrc` uses `use flake`, so `direnv` may also make `bun` available automatically in some shells.
