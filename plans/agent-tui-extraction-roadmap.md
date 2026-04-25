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

### [x] Milestone 1: Define internal ownership boundaries

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

- Already completed in code:
  - `src/core/types.ts` now names explicit state slices including `ConceptGraphState`, `ModalTransientState`, `PromptEditorUiState`, `ShellWorkspaceUiState`, and `SessionChatState`.
  - `src/core/state.ts` now exposes slice selectors including `conceptGraphState(...)`, `promptEditorUiState(...)`, `promptEditorHostState(...)`, `shellWorkspaceUiState(...)`, `sessionChatState(...)`, `sessionModalHostState(...)`, and `modalTransientState(...)`.
  - `src/app/init.ts` now initializes the slices separately while keeping the runtime `AppState` flat.
- Current ownership split to preserve:
  - app-owned: concept graph semantics, prompt semantics, sessions/chat, inspectors
  - shell-owned direction: layout mode, workspace chrome, pane ratios, viewport sizing, transition state, modal primitives
- Important nuance for future sessions:
  - `AppState` is still read directly in many rendering and transition modules; that is expected at this stage.
  - Milestone 1 created the type and selector seam, not a full runtime restructuring.
- Start the next new extraction work at Milestone 3, not Milestone 1.

### [x] Milestone 2: Create a local `src/shell/` layer for generic primitives

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

- Already completed in code:
  - `src/shell/theme.ts` contains reusable theme tokens.
  - `src/shell/text.ts` contains reusable text helpers and prompt-preview formatting helpers.
  - `src/shell/layout/geometry.ts` contains reusable layout and interpolation helpers used by workspace transitions.
  - `src/shell/render/scroll.ts` contains `createScrollBox(...)`.
  - `src/index.ts` now imports `createScrollBox` from `src/shell/render/scroll`.
- Functions intentionally still app-local:
  - `src/ui/text.ts::promptPreviewWidth(...)` remains app-local because it still reads app shell state directly rather than a generic viewport/layout input.
  - `src/ui/text.ts::promptPreviewChunks` is still ConceptCode-flavored because it highlights `@...` prompt references.
  - `src/ui/workspace-transition.ts` still lives outside `src/shell/`; Milestone 2 only moved low-risk generic helpers, not the transition engine itself.
- Remaining caution for Milestone 3:
  - `src/ui/workspace-transition.ts` depends on shell-style geometry helpers already, but still consumes full `AppState` and remains structurally app-owned.
- Start the next new extraction work at Milestone 3.

### [x] Milestone 3: Extract workspace controller and transition engine behind shell interfaces

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

- Already completed in code:
  - `src/core/types.ts` now defines shell-facing contracts including `ShellViewportState`, `ShellWorkspaceState`, `ShellWorkspaceControllerState`, `ShellWorkspaceControllerDeps`, and `ShellWorkspaceTransitionViewState`.
  - `src/app/workspace.ts` now drives prompt-pane animation, workspace focus switching, and transition timing from `ShellWorkspaceControllerDeps` instead of the full `AppState`.
  - `src/ui/workspace-transition.ts` now computes geometry and animated overlay rects from shell layout/view state plus an explicit viewport, with ConceptCode pane content still injected through the render callback boundary.
  - `src/ui/view.ts` now passes `shellWorkspaceUiState(state)` and an explicit viewport into the shell transition/layout helpers rather than giving those helpers the full `AppState`.
- Final shell state interfaces introduced this milestone:
  - `ShellViewportState`
  - `ShellWorkspaceState`
  - `ShellWorkspaceControllerState`
  - `ShellWorkspaceControllerDeps`
  - `ShellWorkspaceTransitionViewState`
- Remaining direct app coupling intentionally deferred to Milestone 4:
  - `src/ui/view.ts` still owns frame composition and still reads `AppState` directly while assembling pane content.
  - The transition pane renderer callback still takes `AppState` because the actual pane bodies are still ConceptCode-owned.
  - Debug logging still lives locally in both workspace modules; it is structurally optional now but not yet centralized under `src/shell/`.
- Start Milestone 4 in a fresh session.

### [x] Milestone 4: Split frame composition from ConceptCode pane content

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

- Already completed in code:
  - `src/shell/render/frame.ts` now owns reusable workspace frame composition from shell view models plus injected pane descriptors.
  - `src/shell/render/overlay.ts` now owns reusable overlay backdrop/card primitives used by modal and inspector chrome.
  - `src/conceptcode-ui/panes.ts` now owns ConceptCode-specific pane bodies including details, concept preview, prompt budget, prompt pane, prompt suggestion overlay content, and transition pane bodies.
  - `src/conceptcode-ui/overlays.ts` now owns ConceptCode-specific overlay content for the inspector and concept-summary editor while using shell overlay primitives for chrome.
  - `src/ui/view.ts` now acts as the assembly boundary that wires shell composition to app-owned pane and overlay providers instead of owning both concerns directly.
- Pane descriptor and shell composition contract introduced this milestone:
  - `ShellFramePaneDescriptor`
  - `ShellWorkspaceFrameViewModel`
  - `ShellOverlayLayout`
- Renderers still app-specific by design:
  - concept details, concept preview, prompt budget, prompt suggestion descriptions, and prompt/session content stay under `src/conceptcode-ui/`
  - inspector preview generation remains app-local in `src/ui/snippet.ts`
  - transition pane renderer wiring still lives in `src/ui/view.ts`, but pane bodies are injected from the app side
- Start Milestone 5 in a fresh session.

### [x] Milestone 5: Make session shell UI generic while keeping session persistence local

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

- Already completed in code:
  - `src/core/types.ts` now defines reusable shell session modal view models via `ShellSessionListItem` and `ShellSessionModalViewModel`.
  - `src/shell/render/session-modal.ts` now owns the generic session modal renderer and session-row chrome using shell view models instead of `ChatSession`.
  - `src/ui/modals.ts` now assembles a shell session modal view model from `SessionModalHostState` and delegates the rendering to the shell session modal renderer.
  - `src/sessions/commands.ts` now owns app-side session display adapters through `sessionModalEntries(...)` and `sessionModalItem(...)` while keeping session actions and persistence local.
- Session operations intentionally still app-owned:
  - `openSessionModal(...)`
  - `closeSessionModal(...)`
  - `switchToSession(...)`
  - `createAndSwitchSession(...)`
  - `deleteSession(...)`
  - graph-scoped session persistence via `persistSessions(...)` and the session store
- The shell session UI no longer depends on ConceptCode-specific storage policy or graph path semantics.
- Start Milestone 6 in a fresh session.

### [x] Milestone 6: Split keybindings into shell routing and app commands

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

- Already completed in code:
  - `src/shell/keybindings.ts` now owns reusable shell key routing helpers for confirm/cancel handling, wraparound session-list navigation, inspector scrolling, focus switching, and viewport-aware session modal row visibility.
  - `src/core/types.ts` now defines shell command and list-navigation contracts via `ShellKeyCommand` and `ShellListNavigationState`.
  - `src/app/commands.ts` now owns ConceptCode-specific browser commands such as concept navigation, inspector opening, draft creation/removal prompts, summary editing, path/payload copy behavior, help modal content, and quit/session actions.
  - `src/app/keybindings.ts` now acts as the wiring boundary that applies shell routing first for generic modal/list/focus cases and delegates app-specific commands through the app command layer.
- Command boundary introduced this milestone:
  - shell routing classifies generic key events into command-style intents such as cancel, confirm, move, scroll, create, delete, and toggle-focus
  - app command handling executes ConceptCode semantics after that routing boundary, especially concept-tree navigation, prompt/session commands, inspectors, clipboard payload behavior, and summary editing
- Intentionally deferred or still-mixed key paths:
  - `src/app/keybindings.ts` still owns prompt editor host key handling because the editor host and suggestion semantics remain mixed until Milestone 7.
  - create-concept modal editing still stays app-local in `src/concepts/drafts.ts`; only generic modal precedence and confirm/cancel routing were extracted here.
  - quit flow and renderer lifecycle still terminate through app wiring because shutdown, persistence, and prompt-draft sync remain app-owned.
- Start Milestone 7 in a fresh session.

### [x] Milestone 7: Separate prompt editor host from ConceptCode prompt semantics

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

- Already completed in code:
  - `src/core/types.ts` now defines reusable prompt-suggestion provider contracts via `PromptSuggestionPrefix`, `PromptSuggestionContext`, `PromptSuggestionEntry`, and `PromptSuggestionProvider`.
  - `src/prompt/editor.ts` now accepts prompt-suggestion providers for host behaviors such as suggestion visibility, selection movement, acceptance, and refresh while keeping generic editor-host mechanics local to the editor module.
  - `src/prompt/editor.ts` now exposes `conceptCodePromptSuggestionProvider(...)` so ConceptCode-owned semantics for `@concept`, `&file`, and `/command` remain app-local behind the provider boundary.
  - `src/conceptcode-ui/panes.ts` now renders the prompt suggestion overlay from provider-fed entries and descriptions instead of reaching directly into ConceptCode slash-command description logic.
  - `src/app/keybindings.ts` now wires prompt editor navigation and acceptance through the provider boundary rather than relying on mixed editor-host suggestion logic.
- Provider contract introduced this milestone:
  - `PromptSuggestionProvider.suggestions(...)` returns editor-facing entries for the current prefix/query/mode.
  - `PromptSuggestionProvider.isResolvedValue(...)` lets the app decide when a single entry represents an already-resolved token.
  - `PromptSuggestionProvider.acceptTrailingText(...)` lets the app control acceptance suffix behavior such as keeping directory references open with a trailing `/`.
- Remaining intentional app coupling:
  - `src/prompt/editor.ts` still contains ConceptCode-specific token parsing and highlight rules for `@...`, `&...`, and `/...`; the host/provider split is in place, but token grammar extraction itself is still local.
  - `src/prompt/editor.ts::conceptCodePromptSuggestionProvider(...)` still imports graph nodes, project files, project directories, and UI mode directly because those semantics remain ConceptCode-owned.
  - `src/app/keybindings.ts` still owns prompt editor host key handling as the app-side wiring boundary, even though suggestion sourcing and descriptions now flow through the provider contract.
- Start Milestone 8 in a fresh session.

### [x] Milestone 8: Make inspector chrome generic while keeping preview content local

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

- Already completed in code:
  - `src/core/types.ts` now defines reusable shell inspector view models via `ShellInspectorLegendItem` and `ShellInspectorViewModel`.
  - `src/shell/render/inspector.ts` now owns the generic inspector container renderer including title bar, close hint, scroll container, and legend footer slot.
  - `src/conceptcode-ui/overlays.ts` now exposes `inspectorOverlayViewModel(...)` so ConceptCode provides inspector layout/title/legend data without owning the reusable chrome.
  - `src/ui/view.ts` now renders inspector chrome through the shell renderer and refreshes preview content through an app-owned preview provider boundary.
  - `src/ui/snippet.ts` now exposes `InspectorPreviewProvider` plus `conceptCodeInspectorPreviewProvider`, keeping snippet/subtree/metadata preview generation app-local behind a provider contract.
- Preview provider contract introduced this milestone:
  - `InspectorPreviewProvider.titleFor(...)` returns the inspector title for the selected node and preview kind.
  - `InspectorPreviewProvider.previewFor(...)` returns preview text lines plus optional legend items and syntax-style hints.
  - `InspectorPreviewProvider.legendItemsFor(...)` adapts app preview legend data into shell-facing inspector legend items.
- Preview-building semantics intentionally still app-local:
  - snippet source loading, file-language detection, Shiki tokenization, and numbered source rendering remain in `src/ui/snippet.ts`
  - subtree tree-shape rendering and concept-kind legend derivation remain in `src/ui/snippet.ts`
  - metadata preview formatting and inspector title semantics for snippet/subtree/metadata remain ConceptCode-owned
- Start Milestone 9 in a fresh session.

### [x] Milestone 9: Extract `src/shell/` into `packages/agent-tui`

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

- Already completed in code:
  - `packages/agent-tui/` now contains the extracted OpenTUI shell package with `src/` entrypoints for shell theme, text helpers, geometry helpers, key routing, overlay primitives, inspector chrome, session modal rendering, workspace frame composition, and scroll-box creation.
  - `packages/agent-tui/src/types.ts` now owns the shell-facing contracts previously proven locally, including layout config, workspace transition state, workspace controller deps, frame/overlay/session/inspector view models, and shell key-command/list-navigation types.
  - The former local shell modules under `src/shell/` were removed after their code moved into `packages/agent-tui/src/`.
  - App imports now consume the package through `agent-tui/*` paths from `src/index.ts`, `src/app/workspace.ts`, `src/app/keybindings.ts`, `src/ui/view.ts`, `src/ui/modals.ts`, `src/ui/workspace-transition.ts`, `src/ui/text.ts`, `src/ui/theme.ts`, `src/conceptcode-ui/overlays.ts`, `src/sessions/commands.ts`, `src/core/model.ts`, and `src/app/init.ts`.
  - `package.json` now declares the local file dependency on `agent-tui`, and `tsconfig.json` now includes package sources plus path aliases for `agent-tui` and `agent-tui/*`.
  - `packages/agent-tui/README.md` now documents package scope, main entrypoints, and the expected host-app integration style.
- Final package entrypoints and exported surfaces:
  - `agent-tui`:
    - re-exports theme tokens, text helpers, geometry helpers, renderers, keybinding helpers, and all shell-facing types
  - `agent-tui/types`:
    - `LayoutMode`
    - `UiLayoutConfig`
    - `WorkspaceFocus`
    - `WorkspaceTransitionState`
    - `ShellViewportState`
    - `ShellWorkspaceState`
    - `ShellWorkspaceControllerState`
    - `ShellWorkspaceControllerDeps`
    - `ShellWorkspaceTransitionViewState`
    - `ShellFramePaneDescriptor`
    - `ShellOverlayLayout`
    - `ShellSessionListItem`
    - `ShellSessionModalViewModel`
    - `ShellInspectorLegendItem`
    - `ShellInspectorViewModel`
    - `ShellListNavigationState`
    - `ShellKeyCommand`
    - `ShellWorkspaceFrameViewModel`
  - `agent-tui/theme`:
    - `COLORS`
  - `agent-tui/text`:
    - `textNodesForChunks(...)`
    - `truncateSingleLine(...)`
    - `truncateFromStart(...)`
    - `promptPreviewLines(...)`
    - `highlightPromptReferenceChunks(...)`
  - `agent-tui/layout/geometry`:
    - geometry types `PaneRect`, `WideWorkspaceGeometry`, `GeometryViewport`
    - layout helpers and interpolation helpers including `wideWorkspaceGeometryForRatio(...)`
  - `agent-tui/render/frame`:
    - `renderWorkspaceFrame(...)`
  - `agent-tui/render/overlay`:
    - `renderOverlayBackdrop(...)`
    - `renderOverlayCard(...)`
  - `agent-tui/render/inspector`:
    - `renderInspectorOverlay(...)`
  - `agent-tui/render/session-modal`:
    - `renderSessionModal(...)`
  - `agent-tui/render/scroll`:
    - `createScrollBox(...)`
  - `agent-tui/keybindings`:
    - `sessionModalVisibleRowCount(...)`
    - `keepShellListSelectionVisible(...)`
    - `moveShellListSelection(...)`
    - `confirmOrCancelCommand(...)`
    - `sessionModalCommand(...)`
    - `inspectorCommand(...)`
    - `sharedFocusCommand(...)`
- Deferred cleanup work or remaining boundary caveats:
  - `src/ui/workspace-transition.ts` still remains app-local even though it now depends on package geometry/types; the transition engine still takes `AppState` through the pane-render callback boundary.
  - `packages/agent-tui/src/types.ts` uses a deliberately minimal structural type for prompt-editor modal state in `ShellWorkspaceControllerState` so the package stays decoupled from app-local editor types.
  - Shell-focused types are still re-exported from `src/core/types.ts` for compatibility with existing app-local imports; Milestone 10 can tighten or reduce those compatibility re-exports if desired.
  - The package is currently consumed through a local file dependency plus TypeScript path aliases; a later packaging pass may want stronger workspace tooling or publish-ready build metadata, but that is not required for this extraction milestone.
- The next milestone should start in a fresh session.

### [x] Milestone 10: Stabilization, cleanup, and extraction audit

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

- Already completed in code:
  - `packages/agent-tui/src/geometry.test.ts` now covers shell layout math and transition interpolation helpers including `wideWorkspaceGeometryForRatio(...)`, `interpolateVerticalStack(...)`, `interpolateBottomRightAnchoredRect(...)`, and `interpolateTopRightAnchoredRectWithIndependentHeightProgress(...)`.
  - `packages/agent-tui/src/keybindings.test.ts` now covers shell key-routing behavior including session modal viewport row sizing, wraparound list navigation, selection visibility clamping, and generic command classification.
  - `packages/agent-tui/README.md` now records the extraction audit boundary explicitly, including what remains shell-owned versus app-owned and the known follow-up work for a second extraction pass.
- Extraction audit results:
  - `packages/agent-tui/src/` imports only package-local modules plus `@opentui/core`; no package module imports `src/` or other ConceptCode-specific code.
  - The exported package surface remains shell-scoped rather than domain-scoped: geometry/layout helpers, frame and overlay renderers, inspector chrome, session modal rendering, text/theme helpers, key routing, and shell-facing view-model/types.
  - Remaining coupling is documented rather than hidden:
    - `src/ui/workspace-transition.ts` is still app-local because transition pane bodies are still rendered through app-owned callbacks.
    - `src/core/types.ts` still re-exports shell-focused types from `agent-tui/types` as compatibility glue for existing app-local imports.
    - prompt-editor token grammar is still app-local even though suggestion provider boundaries now exist.
- Tests added or updated for core shell behavior:
  - layout math
  - transition interpolation helpers
  - session modal viewport behavior
  - wraparound list navigation and command routing helpers
- Known follow-up work for a second extraction pass:
  - decide whether to remove or narrow the compatibility re-exports in `src/core/types.ts`
  - decide whether `src/ui/workspace-transition.ts` should move into the package once pane-render callback contracts are generic enough
  - decide whether prompt token parsing/highlighting should be extracted beyond the current provider boundary
- Further cleanup should happen in a fresh session if pursued; Milestone 10 itself is complete.

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
