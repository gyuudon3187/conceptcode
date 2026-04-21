# Concept Graph Generation Improvements

## Purpose

This note captures the context and implementation guidance for improving `ConceptCode`'s concept-graph generation workflow so the generated graph better supports:

- reducing verification fatigue
- deliberate context selection for prompt injection
- stable, promptable concept references
- downstream UI surfaces for selective review rather than broad reading

This document is intended to be sufficient context for a future session that has access to the repository but not to prior conversation history.

Related ticket set:

- ticket guide: `plans/tickets/README.md`
- ticket index: `plans/tickets/INDEX.md`

## Current project context

`ConceptCode` is a concept-aware interface for working with hierarchical concept graphs while composing prompts for coding agents.

Relevant current design points from the repo:

- The JSON concept graph is the source of truth.
- Stable concept paths are derived from object keys under `children`.
- The current TUI already supports:
  - concept navigation by hierarchy
  - prompt references like `@root...` and `@domain...`
  - file references like `&path`
  - clipboard export driven by explicit prompt references
  - compact exported context
  - token breakdown for referenced concepts and files
- Current graph-generation workflow is intentionally split into:
  1. main conceptual graph generation
  2. anchor enrichment with `loc`
  3. kind description generation for options

Relevant files:
- `prompts/generate_concept_graph.md`
- `prompts/enrich_concept_graph_anchors.md`
- `prompts/enrich_kind_definitions.md`
- `prompts/AGENTS.md`
- `.opencode/commands/concept-graph.md`
- `docs/json_schema.md`
- `README.md`
- root `AGENTS.md`

## Why these changes matter

The main idea is that graph quality strongly shapes the eventual UI/UX.

A good graph reduces verification fatigue because it:
- narrows the search space
- supports selective context inclusion
- gives the user promptable conceptual units
- preserves orientation across prompts and sessions

A weak graph increases verification burden because it:
- forces users to reference overly broad parent nodes
- hides important distinctions
- requires more raw reading and manual interpretation
- makes context injection noisier and less deliberate

The highest-value improvements are expected to come from improving hierarchy quality first, not from adding many new fields.

## Main conclusions from prior analysis

Recommended priorities:

1. Strengthen hierarchical structuring rules in generation prompts.
2. Use a very small amount of additional optional metadata more deliberately.
3. Avoid adding lots of UI-only or task-specific metadata to the graph.
4. Keep `loc` enrichment as a separate pass.
5. Prefer graph fields that answer stable conceptual questions over volatile workflow questions.

## High-impact graph-generation changes

### 1. Improve hierarchy instructions substantially

This is the most important change.

The generation prompt should more explicitly optimize for:
- navigable hierarchy
- promptable leaves
- ownership-based decomposition
- shallow, meaningful top-level structure
- bounded sibling counts
- sparse but meaningful supporting metadata

The prompt should explicitly frame the graph as something that will later be used for:
- deliberate context selection
- prompt composition
- targeted verification

#### Desired hierarchy properties

A good concept node should be:

- meaningful as a navigable unit
- likely to be referenced directly in a prompt
- more specific than its parent in a useful way
- stable enough to survive moderate code changes
- conceptually understandable without requiring raw code immediately

If a node does not improve navigation, promptability, or verification, it probably should not exist.

#### Promptable leaves

The generation prompt should encourage leaves that are:

- specific enough to be useful prompt targets
- broad enough to remain stable
- semantically meaningful

Avoid both:
- very broad catch-all nodes
- tiny implementation trivia nodes

#### Ownership-based decomposition

The hierarchy should prefer placing concepts under the thing that owns their meaning, state, trigger, or user-facing consequence.

Good examples:
- behaviors under the most specific meaningful owner
- UI flows under the control, region, or view that owns them
- stateful concepts under the surface or process where they matter

Avoid:
- taxonomy buckets that merely mirror code organization
- lifting concepts upward when their meaning depends on one parent

#### Top-level structure

Top-level and near-top-level nodes should answer:
- what are the major parts of the system?
- what major views/workflows/subsystems exist?
- what would a collaborator naturally ask about?

Prefer a shallow top level with meaningful first-class concepts.

#### Sibling counts

The prompt should give more operational guidance than "manageable".

Guidance to add:
- if a parent has too many children, introduce an intermediate node only when it is itself meaningful
- otherwise prune low-value children rather than inventing a fake grouping bucket

### 2. Strengthen use of `why_it_exists`

This is likely the highest-value optional metadata field for the graph.

Why it matters:
- distinguishes purpose from structure
- helps humans verify concept meaning faster
- helps agents understand why a concept matters
- improves promptability when title + summary are not enough

Policy:
- keep optional
- add only when it materially improves understanding
- prefer one short sentence about responsibility or reason-for-being
- omit when title + summary already make the purpose obvious

Likely high-value use cases:
- workflows
- behaviors
- stateful controls
- coordination concepts
- data groups whose role is not obvious

Avoid:
- repeating the summary
- adding it everywhere

### 3. Strengthen selective use of `state_predicate`

This is useful for concepts whose relevance depends on state or mode.

Why it matters:
- reduces ambiguity about when a concept is active
- improves verification for stateful UI and conditional workflows
- helps context injection stay precise

Policy:
- keep optional
- use only when a concept is hard to understand or verify without knowing when it applies

Likely use cases:
- loading/error/empty states
- mode-specific surfaces
- conditional panels
- state-dependent controls
- behaviors that only occur under a clear condition

Avoid broad use across the whole graph.

### 4. Sharpen `related_paths` guidance

Keep this sparse, but make it more intentional.

Use only when:
- the related concept materially affects understanding
- the relationship crosses hierarchy boundaries
- users are likely to hop between the concepts during explanation, editing, or verification
- the relation would not already be obvious from parent/child structure

Avoid:
- dense graph-like crosslinking
- adding related paths everywhere

### 5. Keep `loc` as a separate enrichment pass

Do not move anchor generation into the main graph-generation step.

Current split is good:
- main pass: conceptual structure
- second pass: source anchors
- third pass: kind descriptions

This supports a better graph with lower pressure to guess.

## Metadata that should NOT be added unless a strong case emerges

Avoid adding fields like:
- `confidence`
- `importance`
- `verification_status`
- `review_priority`
- `prompt_relevance`
- token budgets
- dynamic or task-specific ranking metadata

Reason:
these are usually volatile, workflow-dependent, or better derived in the UI/session layer instead of stored in the graph.

## Recommended prompt-level changes

### `prompts/generate_concept_graph.md`

Revise the prompt so it explicitly states that the graph should support:

- deliberate context selection for coding-agent prompts
- selective verification by humans and agents
- stable prompt references to concept paths

Add or strengthen instructions along these lines:

- Create concepts that are useful as prompt-reference targets, not only as documentation headings.
- Prefer leaves that a human could plausibly reference directly in a prompt.
- Only create a concept when it reduces ambiguity, improves navigation, or creates a meaningfully more precise prompt target than the parent.
- Prefer ownership-based decomposition: attach a concept to the parent that owns its meaning, state, trigger, or user-facing consequence.
- Favor a shallow, meaningful top level.
- Keep sibling counts low enough that a user can browse them without scanning a long flat list.
- If an intermediate grouping concept is introduced, it must itself be meaningful and user-comprehensible.
- Add `why_it_exists` when purpose is not obvious from title and summary and when it would improve promptability or verification.
- Add `state_predicate` only when a concept's relevance depends on a clear state, mode, or condition.
- Use `related_paths` only for high-value navigational jumps not already obvious from the hierarchy.

### `prompts/AGENTS.md`

Update prompt-execution guidance so it more explicitly reinforces:
- promptable concept leaves
- hierarchy quality as the main priority
- sparse, high-value metadata only
- avoiding graph bloat

### `.opencode/commands/concept-graph.md`

Keep the three-pass workflow, but update the command instructions to reflect the improved hierarchy policy and sparse-metadata policy.

Potentially add wording that emphasizes:
- useful prompt targets
- deliberate context composition
- reducing later verification burden

## Potential follow-up workflow improvements

These are optional and secondary to prompt changes.

### Possible future review mode

Consider eventually adding a graph-quality critique or review flow that checks for:
- overly broad nodes
- missing useful leaves
- behaviors attached too high in the hierarchy
- fake grouping buckets
- overuse or underuse of `related_paths`
- concepts that need `why_it_exists`
- stateful concepts missing `state_predicate`

This does not need to be implemented now, but it is a plausible future extension.

## Minimal high-impact metadata policy

The preferred policy is:

- required/primary structure:
  - `title`
  - `kind`
  - `summary`
  - `children`

- optional but high-value when justified:
  - `why_it_exists`
  - `state_predicate`
  - `related_paths`
  - `loc` in separate enrichment pass
  - `aliases` only when user language mismatch makes them useful

Do not add new schema fields unless there is a strong, stable, reusable use case.

## Guiding rule for deciding whether metadata belongs in the graph

A field belongs in the graph only if it answers a stable question such as:

- What is this concept?
- Why does it exist?
- When is it applicable?
- Where is its best anchor?
- What other concepts are meaningfully related?

A field probably does NOT belong in the graph if it mainly answers:

- how important is this for this task?
- how risky is this today?
- how likely is this to matter in this prompt?
- how much attention should the reviewer give it right now?

Those questions are usually better handled by the UI/session layer.

## Expected downstream effect on the UI roadmap

If the graph-generation changes succeed, later UI work can rely more on:
- selective context composition
- graph-health cues
- related-concept suggestions
- staged verification

And rely less on:
- heuristic context expansion
- compensating for poor decomposition
- dense ranking systems
- graph repair inside the prompt interface

## Concrete implementation targets for a future editing session

Likely files to update:
- `prompts/generate_concept_graph.md`
- `prompts/AGENTS.md`
- `.opencode/commands/concept-graph.md`

Files to review for ripple effects:
- `README.md`
- `docs/json_schema.md`
- `prompts/clipboard_preamble.md`
- `prompts/clipboard_preamble_conceptualize.md`
- root `AGENTS.md`

Likely process:
1. revise generation prompt guidance
2. revise prompt-specific AGENTS guidance
3. revise command wrapper instructions
4. review whether schema docs should clarify stronger use of existing optional fields
5. run doc ripple check if prompts or AGENTS guidance changes materially

## Non-goals

Do not:
- add many new graph fields without strong justification
- collapse graph generation and anchor enrichment into one pass
- overfit hierarchy guidance to one codebase
- store volatile verification metadata in the graph
- let graph growth make browsing harder

## One-sentence summary

Improve concept-graph generation primarily by producing cleaner, more promptable hierarchies and by using only a few optional fields (`why_it_exists`, selective `state_predicate`, sparse `related_paths`) when they materially improve navigation, context selection, and verification.
