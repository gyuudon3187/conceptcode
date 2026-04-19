# Medium-Term UI Roadmap

## Purpose

This note defines a medium-term UI roadmap for `ConceptCode`, building on the assumptions and goals captured in:

- `plans/concept-graph-generation-improvements.md`
- `plans/ui-roadmap-short-term.md`

The medium-term goal is to extend the TUI from a strong context-selection surface into a stronger environment for structured verification and mixed-initiative context composition, while staying faithful to the core project model:

- the concept graph remains the source of truth
- stable concept paths remain the primary reference mechanism
- explicit user-controlled context selection remains preferable to hidden automatic expansion

This roadmap focuses on medium-term changes with meaningful user impact, but still tries to avoid graph bloat and avoid turning the UI into a general-purpose analytics tool.

Related ticket set:

- ticket guide: `plans/ui-medium-term-tickets/README.md`
- ticket index: `plans/ui-medium-term-tickets/INDEX.md`

## Main premise

If the short-term roadmap succeeds, `ConceptCode` should already be better at:

- selective context composition
- cross-level orientation
- lightweight graph-health visibility
- small verification cues before prompting

The medium-term step is to deepen this into a more explicit verification-oriented workflow and a stronger mixed-initiative interaction model.

In other words, the UI should move from:

- a graph browser with prompt composition support

toward:

- a graph-centered environment for choosing, inspecting, and validating prompt context with less cognitive overhead

## Medium-term roadmap priorities

1. Add a clearer verification workflow around chosen context and agent output.
2. Introduce mixed-initiative context suggestions without hidden prompt expansion.
3. Support task-scoped working sets and reusable context bundles.
4. Improve local neighborhood navigation around the current concept.
5. Make graph quality and graph maintenance more actionable.
6. Keep all of this legible within the TUI interaction model.

## Priority 1: Build a more explicit verification workflow

### Why this is medium-term

The short-term plan adds lightweight verification cues. The next step is to turn those cues into a more explicit review structure so users do not perform one large undifferentiated check.

### Medium-term changes

#### 1. Add a dedicated verification panel or mode

This panel should remain compact, but more structured than the short-term `Context` pane.

Recommended sections:

- `Scope`
  - directly referenced concepts and files
  - task-scoped supporting context if added
- `Anchors`
  - referenced concepts with `loc`
  - semantic-only concepts without anchors
- `Claims / Questions`
  - what the user is asking the agent to do or reason about
  - potentially derived from the current prompt in lightweight form
- `Checks`
  - suggested human verification targets such as broad parents, weak anchors, or state-specific concepts

This should not attempt deep semantic parsing of the prompt at first. Even a lightweight structure would reduce verification fatigue.

#### 2. Better separation between prompt context and assistant output

Over time, the interface should help the user see:

- what context was chosen
- what the agent said or proposed
- what evidence or anchors were actually available

This can start with a separate review surface for the sent prompt context and later expand into better post-response verification support.

#### 3. Add “selective follow-up inspection” affordances

Examples:

- jump from a referenced concept in verification view to snippet preview
- jump to parent or related concept when a concept lacks `loc`
- jump to related source file when file references dominate the token budget

The key idea is to reduce broad manual exploration and make review more staged.

## Priority 2: Add mixed-initiative context suggestions

### Why this matters

The project should help users choose context, not just record what they typed. But it should do so in a way that preserves user agency and keeps context boundaries visible.

### Medium-term changes

#### 1. Suggest nearby concepts based on graph structure

Possible suggestion sources:

- parent of a directly referenced concept
- children of a broad referenced parent
- `related_paths`
- siblings when they are structurally central to the same local concept cluster

These should appear as suggestions, not automatic inclusions.

#### 2. Require clear suggestion labels

Each suggested item should say why it is being suggested, for example:

- `parent of referenced concept`
- `child of broad referenced concept`
- `related path`
- `same local cluster`

This is important to keep mixed initiative interpretable.

#### 3. Let users explicitly accept or reject suggestions

The working set should remain user-curated.

Suggested concepts should be:

- visibly separate from current references
- easy to include
- easy to dismiss
- not silently re-added once dismissed in the current prompt composition cycle

### Important constraint

Do not implement hidden auto-expansion of prompt context. That would conflict with the project’s main strengths and would risk increasing verification burden.

## Priority 3: Support task-scoped working sets and reusable context bundles

### Why this matters

Once context selection becomes more deliberate, users will benefit from preserving useful working sets. This is one of the most natural medium-term extensions of the current explicit-reference model.

### Medium-term changes

#### 1. Introduce session-local working sets

A working set is a user-visible collection of concepts and files currently being considered for a task.

It should be able to contain:

- direct prompt references
- manually added concepts or files
- accepted suggestions

This makes the context set a first-class object of interaction rather than only a side effect of prompt text.

#### 2. Allow named bundles for recurring tasks

Examples:

- `debug session persistence`
- `merge view interaction flow`
- `architecture overview for auth`

These bundles should be lightweight and easy to inspect. They do not need to become a heavyweight project artifact initially.

#### 3. Keep bundles inspectable and editable

Users should be able to see:

- what concepts/files are in the bundle
- whether they are direct or supporting entries
- the rough token cost of using the bundle

The system should not turn bundles into opaque saved prompts.

## Priority 4: Deepen local neighborhood navigation

### Why this matters

If graph generation improves, medium-term UI gains will come from helping users move around local conceptual neighborhoods efficiently without needing a full graphical map.

### Medium-term changes

#### 1. Add a richer local neighborhood view

This could include:

- parent
- siblings
- children
- `related_paths`
- perhaps one-hop reverse relations when discoverable

The user should be able to answer:

- what sits next to this concept?
- what broader concept contains it?
- what other concepts might matter to the same task?

#### 2. Make neighborhood navigation task-aware where possible

If the user is currently composing a prompt with several references, the neighborhood view can prioritize concepts that are near the current working set rather than showing the whole local tree equally.

#### 3. Surface local context balance

The interface should help users notice when they are working with:

- only broad parents
- only tiny leaves
- a balanced selection across levels

This does not need a formal score; a few structural labels are enough.

## Priority 5: Make graph maintenance and graph quality more actionable

### Why this matters

The graph is a primary UX dependency. The UI should eventually help users notice and repair weak graph structure, especially when the weak structure harms promptability or verification.

### Medium-term changes

#### 1. Add a graph-quality review surface

This can begin as a lightweight list of issues such as:

- broad parent with too many children
- concept missing anchor coverage in a subtree where anchors would be useful
- concept with weak semantic coverage
- likely over-fragmented local subtree
- stateful concept missing `state_predicate`
- concept whose purpose appears unclear without `why_it_exists`

This should be oriented toward maintenance, not judgment.

#### 2. Link graph issues to concept-graph editing workflows

Because the repo already has concept-graph editing concepts and prompts, graph issues should become actionable:

- inspect issue
- jump to affected concept
- open conceptualize/edit flow

This would keep graph maintenance integrated with actual use, rather than treated as a separate admin task.

#### 3. Distinguish graph weakness from source weakness

The UI should help users understand whether a verification problem comes from:

- a weak concept graph
- missing or uncertain source anchors
- a prompt-context choice issue

That distinction matters because the remedy differs.

## Priority 6: Introduce mode-specific context and verification defaults

### Why this matters

The existing UI modes already create a natural opening for more targeted interaction. Medium-term improvements should make those modes do more meaningful work.

### Medium-term changes

#### 1. Strengthen mode-specific emphasis

Possible direction:

- `plan`
  - emphasize higher-level concepts, parent context, architecture-oriented related paths, and semantic descriptions
- `build`
  - emphasize anchored leaves, snippets, and files with stronger source grounding
- `conceptualize`
  - emphasize graph quality, missing semantic metadata, hierarchy problems, and graph-edit actions

#### 2. Tailor suggestions and warnings by mode

Examples:

- in `plan`, warn when context is overly implementation-heavy
- in `build`, warn when selected context lacks anchors
- in `conceptualize`, warn when the graph decomposition appears weak or bloated

This would reduce mismatch between task stage and review surface.

## Features explicitly out of scope for the medium term

Do not prioritize these yet:

- full graphical concept map rendering as a major new UI foundation
- autonomous prompt rewriting based on inferred context
- hidden personal memory systems
- complex probabilistic graph scoring
- heavy collaborative workflow features
- large provenance knowledge-graph systems

These may become useful later, but they are not required for the strongest next step.

## Suggested implementation order

1. Introduce a verification-oriented panel or review mode.
2. Add mixed-initiative context suggestions with explicit reasons and user control.
3. Add session-local working sets and named lightweight bundles.
4. Improve local neighborhood browsing around the current concept and current working set.
5. Add a graph-quality review surface tied to concept-graph maintenance flows.
6. Strengthen mode-specific context and verification behavior.

## Expected outcome

If the graph-generation improvements and short-term UI roadmap are both implemented first, these medium-term changes should:

- make context composition more deliberate without becoming cumbersome
- reduce verification fatigue by making inspection staged and selective
- help users recover from weak or incomplete graph areas more efficiently
- support recurring tasks through reusable conceptual working sets
- make the TUI feel more like a context-governance environment than a chat wrapper

## One-sentence summary

Extend `ConceptCode` from explicit reference-based context selection into a graph-centered environment for structured verification, mixed-initiative suggestion, and reusable task-scoped working sets, without giving up user control over prompt context.
