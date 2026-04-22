# `src/index.ts` Refactor Roadmap

## Purpose

This roadmap is meant to be usable by a new session with no prior conversation context.

The goal is to continue shrinking `src/index.ts` from a feature-heavy file into a composition/bootstrap entrypoint without changing current TUI behavior.

The intended end state is:

1. `src/index.ts` mostly wires together controllers, state, renderer, and startup flow.
2. Feature behavior lives in focused modules under `src/app/`.
3. Existing keyboard behavior, prompt scrolling, streaming, workspace transitions, and modal behavior remain unchanged unless a step explicitly says otherwise.

## Current State

As of this roadmap, these extractions have already been completed:

1. `src/app/init.ts`
   - arg parsing
   - project file discovery
   - initial app state creation
   - default UI layout config

2. `src/app/sessions.ts`
   - session modal helpers
   - session persistence
   - session switching and creation flows

3. `src/app/concepts.ts`
   - create-concept modal behavior
   - draft concept insertion/removal
   - kind filtering/matching for create flow

4. `src/app/prompt-editor.ts`
   - prompt editor open/focus behavior
   - alias and file autocomplete
   - prompt draft syncing
   - prompt alias highlighting and selection
   - summary editor opening

5. `src/app/prompt-thread.ts`
   - prompt thread scroll ownership and animation
   - prompt token breakdown refresh
   - assistant streaming updates
   - prompt submission flow

## Current `src/index.ts` Responsibilities

`src/index.ts` still owns these main concerns:

1. workspace and prompt-pane animation
2. renderer lifecycle and startup wiring
3. modal coordination
4. keybinding dispatch
5. platform/process helpers like external editor launch and clipboard status handling

## Current Important Seams

A new session should understand these existing seams before editing:

1. Prompt editor integration goes through `buildPromptEditorDeps(...)`.
   - This adapter currently connects `src/index.ts` to `src/app/prompt-editor.ts` and `src/app/prompt-thread.ts`.

2. Prompt thread behavior is owned by `createPromptThreadController()`.
   - `src/index.ts` creates one controller instance inside `main()`.
   - The controller owns prompt scroll renderable state and streaming/scroll update behavior.

3. Workspace behavior still relies on in-file local helpers and one cross-cutting variable:
   - `refreshPromptPaneTarget`
   - this is still a mutable top-level callback in `src/index.ts`

4. Keybinding behavior still directly dispatches many actions inside `bindKeyHandler()`.
   - This is currently one of the largest remaining maintenance hotspots.

## Constraints And Invariants

Preserve these while continuing the refactor:

1. Do not intentionally change keyboard shortcuts.
2. Do not change prompt scroll behavior.
3. Do not change workspace transition timing or geometry unless the task explicitly becomes behavior-changing.
4. Do not break the prompt streaming flow.
5. Keep the prompt thread incrementally rendering during assistant output.
6. Avoid adding new global mutable state.
7. Prefer small dependency/controller objects over many positional callback arguments.
8. Keep changes minimal and extraction-focused.

## Remaining Refactor Steps

### Step 1: Extract workspace and prompt-pane behavior

Target file:

1. `src/app/workspace.ts`

Primary goal:

1. move workspace transition and prompt-pane animation logic out of `src/index.ts`

Functions/behavior to move:

1. `easeOutPower`
2. `appendWorkspaceDebugLog`
3. `desiredPromptPaneRatio`
4. `stopPromptPaneAnimation`
5. `stopWorkspaceTransition`
6. `finishWorkspaceTransition`
7. `startWorkspaceTransition`
8. `animatePromptPane`
9. `refreshPromptPaneTarget` support wiring
10. `togglePaneFocus`
11. `focusPromptPane`

Recommended shape:

1. create a workspace controller that owns transition and prompt-pane animation coordination
2. avoid keeping raw animation state in `index.ts` except where it already lives on `state`
3. expose a narrow API back to `index.ts`, for example:
   - `refreshPromptPaneTarget()`
   - `togglePaneFocus(...)`
   - `focusPromptPane(...)`
   - maybe `mount()` or `onResize()` if useful

Success criteria:

1. `src/index.ts` no longer implements workspace transition internals directly
2. `refreshPromptPaneTarget` is no longer a loose mutable top-level callback in `src/index.ts`
3. wide-layout transitions still behave exactly the same
4. `bun run typecheck` passes

Risks:

1. this logic is tightly coupled to renderer focus, editor modal state, and prompt-pane sizing
2. change only structure, not behavior

### Step 2: Extract keybinding dispatch

Target file:

1. `src/app/keybindings.ts`

Primary goal:

1. move keyboard dispatch out of `src/index.ts`

Functions/behavior to move:

1. `bindKeyHandler`
2. `handleConfirmModalKey`
3. `handleSessionModalKey`

Recommended shape:

1. define one dependency object containing the actions the keybinding layer can invoke
2. keep the keybinding module as orchestration only, not the home for feature logic
3. let the keybinding layer call into:
   - prompt editor helpers
   - prompt thread controller
   - workspace controller
   - sessions helpers
   - concept modal helpers

Success criteria:

1. `src/index.ts` no longer contains the long `bindKeyHandler()` implementation
2. keyboard behavior is unchanged
3. modal dispatch order remains unchanged
4. `bun run typecheck` passes

Risks:

1. this is the most behavior-sensitive extraction still remaining
2. preserve the existing early-return ordering exactly

### Step 3: Extract platform/process helpers

Target file:

1. `src/app/platform.ts`

Primary goal:

1. move OS/process integration helpers out of `src/index.ts`

Functions/behavior to move:

1. `openExternalEditor`
2. `copyWithStatus`
3. `clearCtrlCExitState`

Possible optional additions:

1. move workspace debug log helpers here only if they were not moved into `workspace.ts`

Success criteria:

1. `src/index.ts` no longer contains external editor or clipboard helper implementations
2. existing suspend/resume editor behavior remains intact
3. `bun run typecheck` passes

### Step 4: Final composition cleanup in `src/index.ts`

Primary goal:

1. make `src/index.ts` read like assembly/composition code rather than feature code

Desired responsibilities after prior steps:

1. load graph and options
2. create initial state
3. start dummy chat server
4. create renderer
5. create controllers
6. wire controllers and handlers together
7. run startup flow

Suggested cleanup tasks:

1. reduce repeated inline dependency bundles
2. normalize names like `controller`, `deps`, and `actions`
3. narrow imports to only true composition-level dependencies

Success criteria:

1. `src/index.ts` is materially shorter and easier to scan
2. top-level code mostly describes how modules connect
3. no behavior changes introduced in cleanup

## Recommended Execution Order

Follow this order unless a concrete code dependency suggests otherwise:

1. extract `src/app/workspace.ts`
2. extract `src/app/keybindings.ts`
3. extract `src/app/platform.ts`
4. do a final composition cleanup pass in `src/index.ts`

## Verification Checklist For Every Step

For each extraction:

1. run `bun run typecheck`
2. keep unrelated untracked files out of commits
3. do not revert unrelated worktree changes
4. preserve prompt editor focus behavior
5. preserve prompt scroll and streaming behavior
6. preserve session modal behavior
7. preserve create-concept modal behavior
8. preserve workspace transition behavior

## Useful Pointers In The Codebase

Current modules to inspect while continuing the refactor:

1. `src/index.ts`
   - current remaining entrypoint logic

2. `src/app/prompt-editor.ts`
   - example of extraction via dependency object

3. `src/app/prompt-thread.ts`
   - example of extraction via controller object

4. `src/app/sessions.ts`
   - example of low-risk flow extraction

5. `src/view.ts`
   - prompt thread rendering and prompt suggestion consumption

6. `src/state.ts`
   - navigation and layout state helpers

## Definition Of Done For This Overall Refactor

This refactor is in a good final state when:

1. `src/index.ts` is primarily bootstrap/composition code
2. feature logic is organized under `src/app/`
3. the dependency seams are explicit and understandable
4. no core interaction behavior regressed
5. typecheck remains clean after each step
