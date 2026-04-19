# Short-Term UI Roadmap

## Purpose

This note defines a short-term UI roadmap for `ConceptCode` based on the intended concept-graph improvements captured in `plans/concept-graph-generation-improvements.md`.

The roadmap assumes the graph generation workflow will move toward:

- cleaner, more navigable hierarchies
- more promptable leaf concepts
- sparse but higher-value optional metadata
- stronger selective use of `why_it_exists`, `state_predicate`, and `related_paths`
- continued separation between conceptual graph generation and `loc` enrichment

This roadmap focuses on short-term, medium/high-impact UI work only. It intentionally avoids UI complexity whose main purpose would be compensating for a weak or bloated graph.

## Main premise

The UI should treat the concept graph as the main interaction surface for:

- orientation
- context selection
- selective verification

The near-term goal is not to create a fully general visual analytics system. The goal is to make it easier for a user to:

- understand where they are in the graph
- choose what context to inject into prompts
- verify what the prompt context actually contains
- inspect likely adjacent context without falling back to large undifferentiated reads

## Short-term roadmap priorities

1. Turn the current `Context` pane into a stronger context-composition and verification surface.
2. Improve cross-level orientation while browsing and prompting.
3. Surface high-value graph metadata where it reduces ambiguity.
4. Add graph-health cues that reduce downstream verification burden.
5. Keep all additions lightweight and TUI-native.

## Priority 1: Upgrade the `Context` pane into a real context-composition surface

### Why this is first

The current prompt budget pane already exposes referenced concepts, files, and token counts. That is a strong base. The next step is to make that pane more useful for deliberate context selection and faster verification.

This should remain anchored in the graph and explicit prompt references, not hidden automatic retrieval.

### Short-term changes

#### 1. Split the pane into two conceptual sections

Recommended sections:

- `Selection`
  - explicitly referenced `@concept` and `&file` items
  - token contribution for each item
- `Verification`
  - quick cues about anchor coverage, metadata quality, and possible broadness

This reduces the need for the user to infer both selection state and verification state from one flat list.

#### 2. Show lightweight quality cues for each referenced concept

For concept references, show compact indicators such as:

- has `loc`
- missing `loc`
- has `why_it_exists`
- has `state_predicate`
- has `related_paths`
- broad parent with many children
- leaf concept

These do not need to be stored in the graph as new fields; they can be derived from existing graph shape and metadata.

Purpose:
- help users decide whether the selected concept is a good prompt unit
- reveal when a concept may need source verification before sending
- reduce blind trust in broad or weakly anchored nodes

#### 3. Show direct versus supporting context more clearly

When prompt references are expanded later, the UI should distinguish:

- directly referenced concepts
- directly referenced files
- nearby or supporting concepts suggested from graph structure

Even if supporting suggestions are added gradually, the categories should remain separate so the human can stay the editor of the working set.

#### 4. Add a small contextual summary for the current selection

When the currently selected concept is also referenced in the prompt, the pane should show a compact semantic reminder using, in order of priority:

- `title`
- `kind`
- `summary`
- `why_it_exists` when present
- `state_predicate` when present

This provides a fast meaning check without requiring the user to switch panes or open raw source.

### Implementation notes

- Reuse the existing prompt token breakdown logic rather than adding a new prompt-state system.
- Keep the layout compact enough for narrow terminals.
- Prefer badges or short labels over verbose explanatory text.

## Priority 2: Improve cross-level orientation in the browsing and prompting flow

### Why this matters

If the graph generation improves as planned, the next biggest UX payoff comes from helping users stay oriented across hierarchy levels. This is one of the clearest ways to benefit from better graph structure.

### Short-term changes

#### 1. Make ancestry more visible

Where the current selection is shown, surface a compact breadcrumb or ancestry line:

- current path
- parent path
- maybe grandparent when space allows

This should be visible during both concept browsing and prompt drafting.

Purpose:
- preserve orientation across local inspection
- help users judge whether they should reference the current node or a nearby parent/child

#### 2. Add a lightweight `Nearby` section

For the selected concept, show a compact list of:

- parent
- siblings
- children when few
- `related_paths` when present

This should not become a full second navigator. It should be a small orientation aid that reduces unnecessary scrolling and raw searching.

#### 3. Distinguish broad parent nodes from promptable leaves

In concept details or the context pane, add simple derived labels like:

- `leaf`
- `parent`
- `broad parent`

The main use is not taxonomy; it is context-choice support.

Purpose:
- nudge users toward referencing the most useful level of abstraction
- reduce oversized prompt contexts created from broad parent selection

### Implementation notes

- Prefer derived labels from `childPaths.length` and graph depth.
- Avoid inventing a new persistent graph field for breadth or importance.

## Priority 3: Surface the highest-value existing metadata more deliberately

### Why this matters

The graph roadmap recommends stronger selective use of `why_it_exists`, `state_predicate`, and `related_paths`. These fields only help if the UI makes them visible at the right moments.

### Short-term changes

#### 1. Promote `why_it_exists` in concept details and prompt-adjacent surfaces

If a concept has `why_it_exists`, render it distinctly from `summary`.

Recommended treatment:

- `summary`: what the concept is
- `why_it_exists`: why this unit matters or what responsibility it owns

This is especially useful for workflows, behaviors, and coordination concepts.

#### 2. Render `state_predicate` as a compact applicability cue

When present, show it as something like:

- `Applies when: ...`

This should appear in:

- metadata preview
- concept details
- current selection summary inside the context pane

Purpose:
- help users understand when a concept is relevant
- reduce context-injection mistakes for stateful or conditional concepts

#### 3. Make `related_paths` actionable in-place

If a concept has `related_paths`, make those easy to inspect from the current view.

Short-term acceptable version:

- render them clearly as quick navigation targets
- distinguish them from children so the user understands they are cross-structure links

Purpose:
- reduce manual searching for adjacent conceptual context
- support selective expansion without forcing large parent selection

## Priority 4: Add lightweight graph-health cues

### Why this belongs in the UI

Graph quality is part of verification UX. A user should be able to notice when a concept is a weak prompt target or a weak verification target.

This should be done with lightweight derived cues, not with heavy review workflows yet.

### Short-term changes

#### 1. Highlight missing anchor coverage on referenced concepts

If a referenced concept lacks `loc`, show that clearly but without treating it as an error.

Meaning:
- concept is still useful semantically
- source verification may require navigating via children or related concepts

#### 2. Highlight potentially weak semantic coverage

Potential cues:

- missing `why_it_exists` for concepts where purpose seems non-obvious
- parent concept with many children and no anchor
- concept with very small summary and no other semantic support

These should be subtle warnings, not hard failures.

#### 3. Add a future-friendly notion of graph quality without formal scoring

Do not add a numeric graph score yet.

Instead, use compact textual signals such as:

- `well anchored`
- `semantic only`
- `broad concept`
- `state-specific`

This gives immediate benefit without creating a brittle scoring system.

## Priority 5: Add a lightweight verification scaffold around prompt context

### Why this is still short-term

The current system helps users choose context, but does less to help them review the quality of what they chose. A small verification layer would have high payoff without requiring a large architectural change.

### Short-term changes

#### 1. Add a compact `Before send` style review summary near the prompt flow

This can remain lightweight. It should summarize:

- number of referenced concepts
- number of referenced files
- whether references are mostly leaves or broad parents
- how many referenced concepts have `loc`
- how many referenced concepts have `why_it_exists`

Purpose:
- create a quick pause point before prompt submission
- reduce accidental oversized or weakly grounded prompt context

#### 2. Flag broad-context risk without blocking submission

Examples:

- many broad parents referenced
- high token count from a few large concepts
- low anchor coverage across referenced concepts

This should be advisory only.

#### 3. Keep agent output and context basis conceptually separate

Near-term goal:
- make it easier to inspect what the prompt depended on without mixing that into the assistant response thread

This can be achieved initially with better context-pane summaries rather than a full new result view.

## Features explicitly out of scope for the short term

Do not prioritize these yet:

- full graph visualization redesign
- heavy automatic context expansion
- confidence scores stored in the graph
- large-scale ranking systems for concept importance
- dense provenance graphs
- a full multi-step verification dashboard
- team workflow or review-handoff features

These may become useful later, but they are not necessary for a strong first improvement pass.

## Suggested implementation order

1. Upgrade the current `Context` pane with selection and verification subsections.
2. Add compact quality cues for referenced concepts and files.
3. Improve orientation with ancestry and nearby-related context.
4. Promote `why_it_exists`, `state_predicate`, and `related_paths` in the existing details/metadata surfaces.
5. Add a lightweight pre-send review summary for selected prompt context.

## Expected outcome

If paired with the planned concept-graph generation improvements, these short-term UI changes should:

- reduce the need to inspect large raw code regions before prompting
- make concept selection more deliberate and legible
- help users spot weak prompt context earlier
- make graph quality visible without bloating the graph
- reduce verification fatigue by making checking more selective and structured

## One-sentence summary

Use the improved concept graph to make the current TUI better at selective context composition, orientation, and lightweight verification, rather than compensating for graph weakness with heavier UI machinery.
