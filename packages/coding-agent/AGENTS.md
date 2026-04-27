# AGENTS.md

## Scope

These instructions apply within `packages/coding-agent/` and its subdirectories.

## Package purpose

`coding-agent` is the extracted reusable coding-agent package from `ConceptCode`.

This package owns generic coding-agent concerns such as:

- agent message, tool, loop, and streaming contracts
- step-based agent control flow
- host-injected tool execution contracts
- optional helpers for registering host-defined tools into executors
- reusable OS-aware host adapter helpers when they are app-agnostic
- provider-agnostic model adapter interfaces

This package does not own app-specific concerns such as:

- TUI rendering or prompt-thread presentation
- ConceptCode concept-graph semantics
- app transport event shapes outside the package boundary
- app session storage, prompt parsing, or local UI state

## Boundary rules

- Do not import from the repo root `src/` tree or other ConceptCode-specific modules.
- Keep exported APIs host-app friendly and provider-agnostic.
- Prefer generic coding-agent terminology over ConceptCode-specific naming.
- Keep the core loop independent from direct filesystem access or host-specific runtime behavior.
- Keep reusable host adapters separated from the core loop so future OS support can grow without entangling orchestration types.

## Change guidance

- Prefer small boundary-tightening changes over broad package redesigns.
- Keep docs and tests in sync when changing exported package behavior.
- Prefer generic tool registration and execution contracts over package-owned built-in tools.
- When shaping tool metadata, leave room for host-defined validation or authorization policy.
- When adding OS-specific adapters, gate them behind explicit OS detection and keep unsupported platforms no-op by default until implemented.
- When adding streaming behavior, preserve a clean boundary between package-owned agent events and host-app transport adaptation.

## Current known boundaries

- `src/platform/coding-agent.ts` in the app is the current transport bridge and should remain outside this package unless the host boundary becomes genuinely reusable.
- `createToolExecutor()` is a convenience helper, not a substitute for host-specific execution policy.
- `coding-agent/host-adapter` is the current home for reusable local host capability detection and OS dispatch, with shared cross-OS file tools such as `read_file` and `edit` under `src/host-adapter/filesystem.ts` and Linux-specific wrappers isolated under `src/host-adapter/linux.ts`.
- The current streaming model is a dummy scaffold; real provider integration should fit the existing package contracts rather than leaking provider-specific shapes through the app.
