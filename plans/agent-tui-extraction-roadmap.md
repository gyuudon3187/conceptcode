# Agent TUI Extraction Roadmap

## Purpose

This roadmap defines a milestone-based plan for separating the generic coding-agent TUI shell from the ConceptCode-specific concept-graph UI.

The immediate goal is not to extract a package in one step. The safer goal is to:

1. create stable internal boundaries inside `ConceptCode`
2. prove those boundaries with local refactors
3. extract the stabilized shell into its own package afterward

This roadmap is written so future sessions can pick up milestone-by-milestone with minimal prior context. Each milestone includes:

- a checkbox
- estimated difficulty
- scope
- implementation strategy
- suggested session strategy
- subagent guidance
- completion criteria
- handoff notes

## Assumptions

- `ConceptCode` should continue owning concept-graph semantics, prompt semantics, graph navigation, and concept-specific panes.
- The extracted package should initially stay OpenTUI-specific.
- Session persistence should remain in `ConceptCode` for the first extraction pass.
- The first package version should focus on reusable shell concerns such as layout, workspace transitions, pane composition, session chrome, and modal primitives.

## Overall extraction principle

Prefer a two-stage migration:

1. local boundary cleanup under `src/shell/`
2. package extraction into something like `packages/agent-tui`

This avoids designing the package API around accidental current coupling.

## Milestones

### [ ] Milestone 1: Define internal ownership boundaries

Difficulty: Medium

Goal:

- Make it explicit which state and rendering concerns belong to the reusable shell versus `ConceptCode`.

Main outputs:

- typed state slices or state-slice aliases
- a short boundary note in code comments or adjacent doc text
- selectors/helpers that reduce direct dependence on the full `AppState`

Recommended scope:

- `src/core/types.ts`
- `src/core/state.ts`
- `src/app/init.ts`
- small helper modules if needed

Implementation strategy:

1. Identify and name the main slices currently mixed into `AppState`:
   - concept graph state
   - session/chat state
   - prompt editor UI state
   - shell/workspace UI state
   - modal/transient state
2. Introduce slice types without forcing a full runtime restructuring yet.
3. Add selectors/adapters so downstream code can ask for smaller views of state.
4. Remove any obvious dependency-direction problems if they are cheap to fix during this milestone.

Session strategy:

- Good to complete in one focused session.
- If the state cleanup starts spilling into rendering refactors, stop after the type and selector work and defer rendering changes to Milestone 3 or 4.

Subagent guidance:

- Usually no subagent needed.
- A subagent is only useful if you want a second pass that audits remaining `AppState` coupling after the edits.

Completion criteria:

- There is a documented ownership split for shell versus app concerns.
- New shell-facing code can depend on smaller interfaces instead of the full `AppState`.
- No user-visible behavior changes are required.

Handoff notes for next session:

- Record which fields are intended to move into shell-owned state.
- Record any unresolved `AppState` hotspots that still block shell extraction.

### [ ] Milestone 2: Create a local `src/shell/` layer for generic primitives

Difficulty: Medium

Goal:

- Move reusable low-level shell code behind a local boundary before attempting package extraction.

Main outputs:

- `src/shell/` directory
- migrated generic helpers for theme, text, layout math, and scrollbox creation

Recommended scope:

- `src/ui/theme.ts`
- reusable parts of `src/ui/text.ts`
- `src/ui/workspace-transition.ts` math helpers
- `createScrollBox` from `src/index.ts`

Implementation strategy:

1. Create `src/shell/` with a structure such as:
   - `src/shell/theme.ts`
   - `src/shell/text.ts`
   - `src/shell/layout/geometry.ts`
   - `src/shell/render/scroll.ts`
2. Move only generic, low-risk code first.
3. Leave ConceptCode-specific formatting logic in place if there is doubt.
4. Update imports without changing behavior.

Session strategy:

- Good to complete in one session.
- If text helpers turn out to be more prompt-specific than expected, split the milestone:
  - first move theme and geometry helpers
  - then move only clearly generic text helpers

Subagent guidance:

- Optional `explore` subagent can help verify which text helpers are truly generic before moving them.
- Not required for implementation itself.

Completion criteria:

- Generic shell primitives live under `src/shell/`.
- No shell primitive module imports concept graph modules.
- The app still behaves the same.

Handoff notes for next session:

- Record which `src/ui/text.ts` functions intentionally remained app-specific.
- Record whether any moved helpers still rely on ConceptCode naming or prompt semantics.

### [ ] Milestone 3: Extract workspace controller and transition engine behind shell interfaces

Difficulty: High

Goal:

- Make workspace sizing, animated pane transitions, and focus switching belong to a shell layer rather than directly to `ConceptCode` state.

Main outputs:

- shell-facing layout config types
- shell-facing workspace state interfaces
- migrated workspace controller and transition renderer logic

Recommended scope:

- `src/app/workspace.ts`
- `src/ui/workspace-transition.ts`
- related layout config types in `src/core/types.ts`

Implementation strategy:

1. Define a narrow shell state contract for:
   - layout mode
   - focused workspace
   - prompt/session pane ratios
   - transition progress
   - shell timing config
2. Refactor `createWorkspaceController` to depend on that contract instead of the whole `AppState`.
3. Refactor transition rendering helpers to consume shell view models and pane descriptors rather than app-specific pane meaning.
4. Keep actual pane content app-owned.
5. Move or make optional the debug logging if it is still useful.

Session strategy:

- Prefer handling this milestone in its own session.
- It is easy for this work to spread into `view.ts`; resist that and keep this milestone focused on controller + transition engine.
- If needed, split into two implementation sessions:
  - controller/state contract
  - transition rendering contract

Subagent guidance:

- A subagent can be useful before implementation to verify that the proposed shell state contract covers all transition code paths.
- During implementation, do not use a coding subagent unless the milestone has already been partially completed and needs a targeted audit.

Completion criteria:

- Workspace transition code is shell-owned in structure, even if still local to this repo.
- It depends on shell interfaces rather than ConceptCode domain state.
- ConceptCode-specific pane identities are injected at the boundary.

Handoff notes for next session:

- Record the final shell state interface.
- Record any remaining direct `AppState` reads in transition/layout code that still need to be eliminated.

### [ ] Milestone 4: Split frame composition from ConceptCode pane content

Difficulty: High

Goal:

- Break up `src/ui/view.ts` so the shell owns layout/composition while `ConceptCode` owns pane content.

Main outputs:

- shell frame composition module(s)
- ConceptCode pane renderer module(s)
- pane descriptor or render-callback interface

Recommended scope:

- `src/ui/view.ts`
- possibly new modules under:
  - `src/shell/render/`
  - `src/conceptcode-ui/panes/`
  - `src/conceptcode-ui/inspectors/`

Implementation strategy:

1. Split render responsibilities into two categories:
   - shell composition responsibilities
   - app-specific content responsibilities
2. Introduce pane descriptors or callbacks for named regions such as:
   - main pane
   - support top pane
   - support bottom pane
   - session pane
   - overlays
3. Move shell-owned composition first.
4. Leave concept details, concept preview, prompt budget, snippet/subtree/metadata preview, and suggestion descriptions on the app side.

Session strategy:

- Handle this in its own session.
- This is a high-context milestone and should not be mixed with package extraction.
- If needed, split into two sessions:
  - render split and module creation
  - cleanup and adapter simplification

Subagent guidance:

- Useful to run an `explore` subagent before implementation to identify all remaining cross-imports from the shell side into ConceptCode-specific modules.

Completion criteria:

- `view.ts` is no longer the monolithic owner of both layout and ConceptCode semantics.
- Shell composition can be reused with different pane content providers.

Handoff notes for next session:

- Record the pane descriptor or callback contract.
- Record which renderers are still app-specific by design.

### [ ] Milestone 5: Make session shell UI generic while keeping session persistence local

Difficulty: Medium

Goal:

- Turn the session modal and related session-shell display into reusable UI that is driven by generic session view models.

Main outputs:

- generic `SessionListItem`-style view model
- shell-owned session modal renderer
- app-owned session action callbacks

Recommended scope:

- generic parts of `src/ui/modals.ts`
- display-oriented parts of `src/sessions/commands.ts`
- relevant session adapters

Implementation strategy:

1. Define a generic session list item shape:
   - id
   - title
   - subtitle
   - badge/label
   - selected state
2. Make the session modal renderer depend on these items rather than `ChatSession`.
3. Keep callbacks app-owned:
   - select session
   - create session
   - delete session
4. Keep persistence and graph-scoped storage in `ConceptCode`.

Session strategy:

- Good to complete in one session after Milestone 4.
- Could be paired with Milestone 6 only if the keybinding split is already very small.

Subagent guidance:

- Usually not needed.
- A quick exploratory subagent may help if more session rendering logic is discovered outside `modals.ts`.

Completion criteria:

- Session modal UI is driven by generic view models.
- No session shell renderer needs to know about graph paths or ConceptCode-specific storage policy.

Handoff notes for next session:

- Record the session view model contract.
- Record which session operations remain intentionally app-owned.

### [ ] Milestone 6: Split keybindings into shell routing and app commands

Difficulty: High

Goal:

- Stop `src/app/keybindings.ts` from being the central coupling point for the entire application.

Main outputs:

- shell-level key routing
- app-specific command handlers
- command-style boundary between key events and domain actions

Recommended scope:

- `src/app/keybindings.ts`
- new command modules if needed

Implementation strategy:

1. Identify generic routing cases:
   - modal precedence
   - list navigation
   - confirm/cancel
   - page scrolling
   - focus switching
2. Identify app-specific command cases:
   - concept navigation and editing
   - concept inspectors
   - prompt payload copy behavior
   - prompt mode semantics
3. Introduce a small command/action layer.
4. Move generic routing to shell-owned code.
5. Keep app commands in `ConceptCode`.

Session strategy:

- Prefer handling in its own session.
- This is easy to destabilize if combined with editor refactors.
- If too large, do it in two sessions:
  - session/modal/list routing
  - editor/workspace/general routing

Subagent guidance:

- Useful to run an exploratory subagent before implementation to classify keybindings into generic versus app-specific groups and confirm nothing is missed.

Completion criteria:

- Generic shell key routing exists separately from ConceptCode command behavior.
- It is possible for another app to reuse the routing layer without inheriting ConceptCode commands.

Handoff notes for next session:

- Record the command boundary.
- Record any still-mixed key paths that were deferred.

### [ ] Milestone 7: Separate prompt editor host from ConceptCode prompt semantics

Difficulty: High

Goal:

- Reuse the prompt editor shell without extracting ConceptCode's suggestion semantics.

Main outputs:

- generic editor host and suggestion menu behavior
- provider interfaces for suggestion sources and suggestion descriptions

Recommended scope:

- `src/prompt/editor.ts`
- possibly some editor-facing rendering helpers

Implementation strategy:

1. Split generic editor host behavior from app-specific suggestion providers.
2. Define provider interfaces for:
   - fetching suggestions
   - describing selected suggestions
   - accepting a selected suggestion
3. Keep ConceptCode-owned semantics for:
   - `@concept`
   - `&file`
   - `/command`
   - prompt payload references

Session strategy:

- Handle in its own session after the shell layout and keybinding seams are stable.
- Do not combine with package extraction.

Subagent guidance:

- An `explore` subagent is useful before implementation because `prompt/editor.ts` mixes several concerns.
- Implementation itself should stay in the main session.

Completion criteria:

- Editor host behavior is reusable.
- ConceptCode prompt semantics remain fully app-owned.

Handoff notes for next session:

- Record the provider contract.
- Record any remaining places where generic editor code still imports concept or file suggestion logic.

### [ ] Milestone 8: Make inspector chrome generic while keeping preview content local

Difficulty: Medium

Goal:

- Keep snippet/subtree/metadata preview generation in `ConceptCode` while making the inspector shell reusable.

Main outputs:

- generic inspector container renderer
- app-owned preview provider interface

Recommended scope:

- inspector shell parts from `src/ui/view.ts`
- keep `src/ui/snippet.ts` app-local

Implementation strategy:

1. Extract the generic inspector frame:
   - title bar
   - close hint
   - scroll container
   - legend footer slot
2. Define preview provider input/output:
   - title
   - text chunks/lines
   - legend items
   - syntax-style hint
3. Keep actual preview building local to ConceptCode.

Session strategy:

- Good to complete in one session.
- Can be paired with Milestone 4 if the frame split naturally exposes the inspector seam.

Subagent guidance:

- Usually unnecessary.

Completion criteria:

- Inspector shell is reusable.
- Preview semantics remain local and domain-specific.

Handoff notes for next session:

- Record the preview provider contract.

### [ ] Milestone 9: Extract `src/shell/` into `packages/agent-tui`

Difficulty: High

Goal:

- Move the now-stabilized generic shell into its own package and switch `ConceptCode` to consume it.

Main outputs:

- new package, likely `packages/agent-tui`
- package exports for shell layout, transitions, session UI, modal primitives, and shared shell helpers
- updated app imports

Implementation strategy:

1. Create the package structure.
2. Move `src/shell/*` into the package with minimal behavior change.
3. Export only the narrow APIs proven during Milestones 3 through 8.
4. Update `ConceptCode` imports.
5. Add package documentation for expected view models and callback contracts.

Session strategy:

- Handle in its own session.
- This should only start once Milestones 3 through 6 are mostly stable, and ideally 7 through 8 are either done or explicitly deferred.

Subagent guidance:

- A subagent can help audit the package for accidental imports back into `ConceptCode`.
- Another subagent can help review the exported surface for unnecessary package API leakage.

Completion criteria:

- The app builds with package imports.
- The package has no imports from ConceptCode-specific modules.
- The package API is documented.

Handoff notes for next session:

- Record the final package entrypoints and any deferred cleanup work.

### [ ] Milestone 10: Stabilization, cleanup, and extraction audit

Difficulty: Medium

Goal:

- Verify that the extraction is real, not just moved coupling.

Main outputs:

- cleanup pass
- extraction audit notes
- tests for shell behavior

Implementation strategy:

1. Audit the package for ConceptCode-specific assumptions.
2. Add or update tests for:
   - layout math
   - transition interpolation
   - session modal viewport behavior
   - wraparound list navigation
3. Remove temporary compatibility shims if safe.
4. Tighten naming and package docs.

Session strategy:

- Good to complete in one final stabilization session.
- If a lot of compatibility glue remains, split into:
  - audit and test additions
  - cleanup and shim removal

Subagent guidance:

- Strong candidate for one or two review-style subagents:
  - package boundary audit
  - dead-code or compatibility-shim audit

Completion criteria:

- The package boundary is clean.
- Core shell behavior has tests.
- Temporary extraction scaffolding is either removed or explicitly documented.

Handoff notes for next session:

- Record any known follow-up work for a second extraction pass, such as reusable prompt editor enhancements.

## Suggested execution grouping

These milestones do not all need their own independent session, but some should.

Recommended grouping:

- Session group A:
  - Milestone 1
  - Milestone 2
- Session group B:
  - Milestone 3
- Session group C:
  - Milestone 4
  - optional Milestone 8 if the inspector seam is already exposed
- Session group D:
  - Milestone 5
  - optionally part of Milestone 6 if the keybinding split is small
- Session group E:
  - remaining Milestone 6
- Session group F:
  - Milestone 7
- Session group G:
  - Milestone 9
- Session group H:
  - Milestone 10

General rule:

- milestones that mostly rename/move code and add small interfaces can share a session
- milestones that change ownership boundaries or key routing should usually have their own session
- package extraction should always have its own session

## When to use subagents

Recommended uses:

- before Milestone 3: validate shell state and transition boundaries
- before Milestone 4: audit remaining shell-to-ConceptCode render coupling
- before Milestone 6: classify generic versus app-specific keybinding branches
- before Milestone 7: map generic editor-host behavior versus ConceptCode suggestion semantics
- during Milestone 9 or 10: audit package boundary cleanliness

Avoid using subagents for:

- straightforward file moves with already-settled boundaries
- simple helper extraction
- tasks where implementation details are already obvious from the main session context

## Recommended first implementation pass

If beginning from scratch in a fresh session, the best first request is:

- implement Milestones 1 and 2 only

That gives the codebase a real internal seam without forcing early package design.

## Session handoff template

When finishing any milestone, leave a short note in the final response covering:

- milestones completed
- files changed
- interfaces introduced or changed
- unresolved blockers for the next milestone
- whether the next milestone should start in a fresh session

That should be enough for a future agent to continue from this roadmap file and the repository state alone.
