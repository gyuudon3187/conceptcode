# Proposed `src/` Architecture

This document describes a proposed target layout for the runtime code under `src/`.

The current codebase already has the rough shape of these boundaries, but the split between `src/` and `src/app/` is not yet fully consistent. The goal of this proposal is to make file placement communicate responsibility more clearly.

For a concrete migration checklist, see `docs/src_refactor_stages.md`.

## Goals

- Make directory names reflect responsibility rather than history.
- Keep `src/index.ts` as a thin composition root.
- Group prompt-first behavior together, since prompt authoring is central to the product.
- Keep stable concept-graph and state logic separate from UI rendering and platform integration.
- Make future refactors incremental rather than requiring a large one-time rewrite.

## Proposed Tree

```text
src/
  index.ts

  app/
    init.ts
    keybindings.ts
    workspace.ts

  core/
    model.ts
    state.ts
    types.ts

  ui/
    view.ts
    snippet.ts

  prompt/
    editor.ts
    thread.ts
    payload.ts

  sessions/
    store.ts
    commands.ts

  concepts/
    drafts.ts

  platform/
    chat.ts
    editor.ts
    clipboard.ts
```

## Directory Rationale

### `src/index.ts`

`src/index.ts` should remain the bootstrap and composition root.

It is the right place to:

- parse startup inputs that have already been modeled elsewhere
- wire together controllers, renderers, and state
- own process-level startup and shutdown behavior

It should avoid becoming the home of feature logic. If a block can be named as a reusable behavior, it probably belongs in one of the directories below.

### `src/app/`

`src/app/` should mean application orchestration for the running TUI.

Files here coordinate multiple subsystems but do not define the low-level rules of those subsystems. This is the correct home for:

- initial app-state assembly
- keyboard routing across features
- workspace-level focus and pane transition orchestration

This directory should stay thin. If a file mostly belongs to one feature area such as prompt editing or sessions, it should live with that feature instead of here.

### `src/core/`

`src/core/` should contain the stable conceptual foundations of the app.

This is the right place for:

- concept graph loading and normalization
- shared application and schema types
- navigation and layout state helpers that are not tied to rendering

The purpose of `core/` is to give the rest of the codebase a dependable center of gravity. It should avoid importing from rendering, provider transport, or OS integration layers.

### `src/ui/`

`src/ui/` should contain rendering logic.

This is the right home for:

- composing TUI panes and overlays
- snippet and subtree previews
- presentation-only helpers such as colors, truncation, and render-specific formatting

The main benefit of this directory is that it makes UI work legible: if a change is about what the user sees, it should mostly land here rather than being scattered across unrelated files.

### `src/prompt/`

`src/prompt/` should group the prompt-first workflow.

This area owns:

- prompt editor behavior
- alias and file reference suggestions
- prompt submission flow and streaming thread coordination
- effective prompt construction and token accounting

This directory is especially important in this repo because prompt authoring is not a side feature. It is a central product surface.

### `src/sessions/`

`src/sessions/` should hold session persistence and session-oriented workflows.

The split inside this directory should be:

- `store.ts`: persistence, normalization, loading, saving
- `commands.ts`: app-facing session actions such as create, switch, and flush

This distinction keeps disk-format concerns separate from runtime interaction flows.

### `src/concepts/`

`src/concepts/` should hold concept-editing behaviors that operate on the in-memory concept graph.

The immediate use is draft concept creation and removal, but the directory name leaves room for future concept-focused features such as:

- graph editing flows
- concept insertion strategies
- validation or editing helpers

Using `concepts/` is clearer than leaving this logic in a generic `app/` bucket.

### `src/platform/`

`src/platform/` should hold boundaries to the outside world.

This includes:

- chat transport and provider integration
- clipboard process integration
- external editor invocation

The naming matters here: these files are not about the app's conceptual model, and they are not rendering logic. They are adapters to external systems.

## Import Direction

To keep the structure clear over time, imports should generally flow inward toward the more stable layers.

Recommended direction:

- `index.ts` and `app/` may import from any of the other directories
- `ui/` may import from `core/` and feature directories when needed for rendering
- `prompt/`, `sessions/`, and `concepts/` may import from `core/` and `platform/`
- `core/` should not import from `ui/`, `app/`, or `platform/`

This is a guideline rather than a hard framework rule, but it helps prevent the directory structure from collapsing back into a mixed root.

## Mapping From The Current Layout

If the repo adopts this structure, the current files would map roughly like this:

- `src/model.ts` -> `src/core/model.ts`
- `src/state.ts` -> `src/core/state.ts`
- `src/types.ts` -> `src/core/types.ts`
- `src/view.ts` -> `src/ui/view.ts`
- `src/snippet.ts` -> `src/ui/snippet.ts`
- `src/chat.ts` -> `src/platform/chat.ts`
- `src/session.ts` -> `src/sessions/store.ts`
- `src/app/sessions.ts` -> `src/sessions/commands.ts`
- `src/app/prompt-editor.ts` -> `src/prompt/editor.ts`
- `src/app/prompt-thread.ts` -> `src/prompt/thread.ts`
- `src/clipboard.ts` -> mostly `src/prompt/payload.ts`, with process-copy code split into `src/platform/clipboard.ts`
- `src/app/concepts.ts` -> `src/concepts/drafts.ts`
- `src/app/platform.ts` -> split between `src/platform/editor.ts` and `src/platform/clipboard.ts`

## Incremental Refactor Order

This proposal is intended to support an incremental migration.

Recommended order:

1. Move `model.ts`, `state.ts`, and `types.ts` into `src/core/`.
2. Move `chat.ts` into `src/platform/`.
3. Move prompt-related files into `src/prompt/`.
4. Move session-related files into `src/sessions/`.
5. Move `view.ts` and `snippet.ts` into `src/ui/`.
6. Split `src/clipboard.ts` and `src/app/platform.ts` along prompt-vs-platform responsibilities.
7. Leave `src/app/` as the thin orchestration layer after the moves settle.

## Non-Goals

This proposal does not assume:

- a large rewrite
- a strict framework-style layering system
- that every file must be split immediately

The main point is to give the repo a directory structure whose names explain why code lives where it does.
