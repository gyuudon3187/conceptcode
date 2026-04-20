# `src/` Refactor Stages

This document turns the proposed `src/` architecture into a concrete staged checklist.

The intent is to make the refactor low-risk:

- move files in small batches
- preserve behavior at each step
- update imports immediately after each move
- avoid mixing structural moves with unrelated logic changes

## Refactor Principles

- Prefer rename-and-rewire steps before code splitting.
- Keep each stage small enough to verify with `bun run typecheck` or `bun run check`.
- Do not change user-facing behavior unless a stage explicitly says so.
- Keep `src/index.ts` as the composition root throughout the migration.
- Delay deeper internal splits until the directory names are already meaningful.

## Stage 0: Baseline

Goal: capture the current architecture documents before moving code.

Checklist:

- [x] Add `docs/src_architecture_proposal.md`.
- [x] Link the proposal from `README.md`.
- [ ] Confirm the repo passes `bun run typecheck` before refactoring.

## Stage 1: Create Stable Foundations In `core/`

Goal: move the most stable shared modules first.

Moves:

- [x] `src/model.ts` -> `src/core/model.ts`
- [x] `src/state.ts` -> `src/core/state.ts`
- [x] `src/types.ts` -> `src/core/types.ts`

Import updates:

- update all `./model`, `./state`, and `./types` imports
- update all `../model`, `../state`, and `../types` imports from subdirectories

Expected benefits:

- establishes a clear home for graph loading, shared types, and navigation helpers
- makes later moves easier because many modules already depend on these files

Verification:

- run `bun run typecheck`
- smoke-check startup paths that load a concept graph

## Stage 2: Move External Boundaries Into `platform/`

Goal: separate provider and OS integration from core app logic.

Moves:

- [x] `src/chat.ts` -> `src/platform/chat.ts`

Partial moves:

- [x] move external editor logic from `src/app/platform.ts` into `src/platform/editor.ts`
- [x] move process clipboard integration from `src/clipboard.ts` and `src/app/platform.ts` into `src/platform/clipboard.ts`

Likely exports after this stage:

- `openExternalEditor` from `src/platform/editor.ts`
- `copyToClipboard` from `src/platform/clipboard.ts`
- `copyWithStatus` may remain temporarily in `src/app/platform.ts` if it still mainly coordinates app state

Expected benefits:

- makes external-system boundaries explicit
- reduces confusion between platform adapters and feature logic

Verification:

- run `bun run typecheck`
- smoke-test prompt submission through the dummy chat server
- smoke-test clipboard export and external editor invocation

## Stage 3: Consolidate Prompt Workflow Into `prompt/`

Goal: group prompt-first behavior into one feature area.

Moves:

- [x] `src/app/prompt-editor.ts` -> `src/prompt/editor.ts`
- [x] `src/app/prompt-thread.ts` -> `src/prompt/thread.ts`
- [x] move prompt payload construction from `src/clipboard.ts` into `src/prompt/payload.ts`

What should live in `src/prompt/payload.ts`:

- referenced concept parsing
- referenced file parsing
- effective prompt construction
- token breakdown calculation
- prompt-oriented rendering helpers currently embedded in `src/clipboard.ts`

What should not stay there long term:

- process spawning or clipboard command integration

Expected benefits:

- makes prompt editing, submission, and payload construction readable as one subsystem
- reduces the current mismatch where prompt logic is split between `src/app/` and `src/clipboard.ts`

Verification:

- run `bun run typecheck`
- smoke-test prompt editing and alias suggestions
- smoke-test message submission and token breakdown refresh

## Stage 4: Consolidate Session Logic Into `sessions/`

Goal: separate persistence from app-facing session commands.

Moves:

- [x] `src/session.ts` -> `src/sessions/store.ts`
- [x] `src/app/sessions.ts` -> `src/sessions/commands.ts`

Expected split:

- `store.ts`: load, save, normalize, metadata, session file layout
- `commands.ts`: create, switch, flush, open/close session modal helpers if they remain session-specific

Expected benefits:

- makes disk persistence concerns easier to find
- keeps session workflows from being buried in `app/`

Verification:

- run `bun run typecheck`
- smoke-test session creation, switching, and persistence

## Stage 5: Move Concept-Draft Logic Into `concepts/`

Goal: give concept-editing behavior a named home.

Moves:

- [x] `src/app/concepts.ts` -> `src/concepts/drafts.ts`

Scope for this stage:

- draft concept creation
- draft concept removal
- create-concept modal key handling

Expected benefits:

- removes another feature-specific file from the generic `app/` bucket
- leaves room for future concept-editing features without forcing them into `app/`

Verification:

- run `bun run typecheck`
- smoke-test create/remove draft concept flows

## Stage 6: Move Rendering Into `ui/`

Goal: make rendering concerns easy to identify and edit.

Moves:

- [x] `src/view.ts` -> `src/ui/view.ts`
- [x] `src/snippet.ts` -> `src/ui/snippet.ts`

Expected benefits:

- creates a clear rendering layer
- makes visual/layout work more discoverable

Verification:

- run `bun run typecheck`
- smoke-test main layout, inspectors, prompt pane, and modal rendering

## Stage 7: Reduce `app/` To A Thin Orchestration Layer

Goal: make `src/app/` mean only runtime coordination.

Files expected to remain:

- `src/app/init.ts`
- `src/app/keybindings.ts`
- `src/app/workspace.ts`
- [x] `src/app/platform.ts`
- [x] `src/app/clipboard.ts`

Possible cleanup tasks:

- remove `src/app/platform.ts` if its responsibilities have fully moved elsewhere
- rename helpers inside `keybindings.ts` if they still reference pre-move file names
- simplify imports in `src/index.ts` now that features have clearer homes

Expected benefits:

- gives `app/` a crisp meaning instead of being a partial catch-all
- makes future file placement decisions easier

Verification:

- run `bun run typecheck`
- run `bun run check`

## Stage 8: Split Large Files After The Moves Settle

Goal: improve internal cohesion only after the directory structure is clear.

Recommended follow-up splits:

- split `src/ui/view.ts` into smaller rendering modules such as:
  - `theme.ts`
  - `panes.ts`
  - `inspector.ts`
  - `modals.ts`
- split `src/prompt/payload.ts` into:
  - `references.ts`
  - `token-breakdown.ts`
  - `clipboard-payload.ts`

Why this is later:

- file moves are easier to review when not mixed with heavy internal rewrites
- once files are in the right directories, the right split points become clearer

Verification:

- run `bun run typecheck`
- run `bun run check`

## Dependency Notes

As the refactor progresses, these dependency rules should become easier to maintain:

- `src/core/` should not depend on `src/ui/`, `src/app/`, or `src/platform/`
- `src/platform/` should expose boundary adapters without owning app state
- `src/prompt/`, `src/sessions/`, and `src/concepts/` may depend on `src/core/`
- `src/app/` may coordinate all of the above
- `src/ui/` may depend on `src/core/` and feature modules for data needed to render

## Suggested Execution Plan

If the refactor is done over multiple sessions, a good batching plan is:

1. Stage 1
2. Stage 2
3. Stage 3 and Stage 4
4. Stage 5 and Stage 6
5. Stage 7 and Stage 8

That order gets the directory structure into a readable state early, while keeping the higher-risk file splits until later.
