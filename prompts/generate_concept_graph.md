# Generate Concept Graph

Use this prompt when you want an LLM to create the main `ConceptCode` concept graph for a codebase or a specific file.

## Prompt template

```text
Analyze the target code and produce a JSON concept graph for use with the `ConceptCode` concept-aware interface.

Requirements:
- Output valid JSON only.
- Use schema_version 1.
- Put implementation-backed concepts under `root`.
- Put non-code domain concepts under `domain` when they materially help browsing and prompt composition.
- Include at least one of `root` or `domain`.
- Use stable, human-meaningful keys under `children` because those keys define the concept's stable derived path.
- Prefer concise summaries.
- Assign conservative `exploration_coverage` and `summary_confidence` scores for each concept you create.
- Only assign `exploration_coverage` and `summary_confidence` to `root` concepts.
- Do not add `loc`, `exploration_coverage`, or `summary_confidence` to `domain` concepts.
- Keep both scores in the `0.0` to `1.0` range.
- Use `exploration_coverage` for how thoroughly the concept's relevant implementation has been directly inspected.
- Use `summary_confidence` for how trustworthy the concept summary and related metadata are based on that inspection.
- `summary_confidence` should usually not exceed `exploration_coverage`.
- Focus on conceptual structure first: identify the most useful concepts, relationships, and hierarchy for browsing and later edits.
- Prefer first-level concepts that a non-programmer product collaborator could understand without reading the code.
- Prefer user-meaningful views, domain concepts, major subsystems, and independently meaningful processes over buckets that mainly mirror implementation structure.
- Do not create top-level buckets like constants, helpers, utils, entrypoints, or generic workflows unless they are themselves meaningful concepts for understanding the system.
- Include `related_paths` when another concept materially affects understanding.
- Use implementation-oriented `kind` values such as module, view, layout, region, workflow, control, concept, behavior, transition, dataclass, data_group, or guidance under `root`.
- Use domain-oriented `kind` values such as domain_area, business_concept, actor, goal, policy, rule, constraint, state, event, workflow, capability, metric, or term under `domain`.
- Do not mix implementation-oriented and domain-oriented kinds within the same namespace.
- Use `region` for a bounded, tangible area within a view, layout, or other clearly comprehensible surface. Use `control` instead for focused interactive elements. Do not use `region` as a generic grouping kind for arbitrary code sections.
- Use `control` for a focused interactive element or tight control cluster such as a button, dropdown, input, toggle, tab set, picker, or action list.
- Use `behavior` when the concept is an action, interaction flow, or reaction owned by a parent concept such as a view, control, or stateful surface.
- Use `workflow` when the concept is an independently meaningful multi-step process that stands on its own rather than being primarily a behavior of one parent surface.
- Attach each `behavior` to the most specific meaningful owner. Prefer a `control` over its containing `region` when the control is the real trigger or state owner.
- If several nearby controls jointly own a behavior, attach that behavior to their containing `region`.
- If a flow is mainly triggered from and understood through one UI surface, model it as that surface's child `behavior` instead of as a separate top-level `workflow`.
- Do not model every small UI element. Add a `control` node when it has meaningful behavior, state, or user-facing importance, or when omitting it would force behaviors onto an overly broad parent.
- Do not include empty fields unless useful for consistency.
- Do not add `loc` in this pass; source anchors belong in a later enrichment pass.

Output shape:
{
  "schema_version": 1,
  "source_file": "...",
  "root": {...},
  "domain": {...}
}

The concept graph should help a human or LLM refer to parts of the program by explicit paths like `root.views.merge_view.pending_selection` and `domain.business_rules.refund_policy`.
```

## Authoring advice

- Keep sibling counts manageable.
- Split large topics into child concepts rather than giant summaries.
- Favor conceptual names over UI label text when the concept is broader than the label.
- Keep interface-oriented metadata compact so it supports browsing and prompt composition without overwhelming the concept hierarchy.
- Use `related_paths` sparingly and only when they add navigational value.
- Use bucketed scoring semantics when setting `exploration_coverage` and `summary_confidence`: `0.2` for light skim, `0.4` for limited direct inspection, `0.6` for the main implementation inspected, `0.8` for the main implementation plus key interactions, `0.9` for thorough inspection, and `1.0` only for unusually exhaustive coverage within reasonable scope.
- Treat source-level helpers, constants, and startup glue as implementation detail unless they represent a user-meaningful subsystem or domain concept.
- If a concept only makes sense because it belongs to a view or control, attach it to that parent instead of lifting it toward the top level.
- Avoid using `region` as a fallback for "miscellaneous" or uncategorized parts of the code.
- When a button, dropdown, toggle, input, or similar control is the natural thing a user would point to while describing an interaction, model it explicitly as a `control`.
- Avoid adding low-value `control` nodes for decorative or trivial elements with no distinct behavior, state, or navigational value.

## Anti-patterns to avoid

- A top-level `constants`, `utils`, or `entrypoints` node that mainly mirrors source organization.
- A top-level `workflows` bucket that collects flows which are really behaviors of specific views or controls.
- A `region` node used only to group programmatic concepts that are not experienced as one bounded surface or area.
- A `region` owning a behavior that is actually triggered by one clearly meaningful `control` inside it.
- A graph that skips meaningful controls and therefore forces several unrelated behaviors onto one broad `region`.

## When to split the work

- Use this prompt for the main concept graph only.
- Keep the hierarchy stable and useful even when exact source anchors are still unclear.
- Generate source anchors such as `loc` in a separate enrichment pass keyed by stable concept paths.
- Generate `kind_definitions` for the TUI options file in a separate pass keyed to the kinds already used in the graph.
