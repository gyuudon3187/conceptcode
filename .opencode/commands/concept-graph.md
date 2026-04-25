/concept-graph <target> [mode] [existing-graph]

 Goal: route concept-graph work to the right prompt flow for the given file, directory, or subsystem, then write the result beside the target using the target basename with `_concepts.json` replacing the original extension.

 Instructions for the LLM:
 - Prefer a concept hierarchy that a non-programmer product collaborator can browse and discuss without needing source-level implementation categories.
 - During graph generation, prefer user-meaningful views, domain concepts, major subsystems, and independently meaningful processes over buckets that mainly mirror code organization.
- The graph may contain top-level `impl` and `domain` namespaces, and must include at least one of them.
- Use `impl` for implementation-backed concepts and `domain` for non-code domain concepts.
 - Do not add implementation-only metadata such as `loc`, `exploration_coverage`, or `summary_confidence` to `domain` concepts.
 - Do not default to top-level categories like constants, utils, entrypoints, or generic workflows unless they are themselves meaningful concepts for understanding the system.
 - Treat `region` as a bounded, tangible area within a view, layout, or other clearly comprehensible surface, not as a fallback bucket for arbitrary code sections.
  - Treat `control` as a focused interactive element or tight control cluster such as a button, dropdown, input, toggle, tab set, picker, or action list.
  - Treat a UI-coupled or parent-owned flow as a child `behavior` of the relevant concept; reserve `workflow` for a process that stands on its own outside a specific parent surface.
  - Attach a `behavior` to the most specific meaningful owner: prefer a `control` over its containing `region` when the control is the real trigger or state owner, prefer a `region` when multiple nearby controls act together, and prefer a `view` when the behavior belongs to the whole screen or mode.
  - If a multi-step process is triggered from one control, action list, region, or view and is mainly understood through that trigger surface, model it as that surface's child `behavior` rather than as a top-level `workflow`.
  - A `control` should usually own at least one child `behavior`. If no owned behavior is worth modeling, prefer a different `kind` or omit the control.
  - Prefer names that a non-programmer product collaborator could naturally use while discussing the screen or task. Avoid names derived mainly from implementation mechanics such as shell, composition, refresh, loader, builder, manager, handler, or helper unless that mechanism is itself a meaningful concept for browsing.
  - If a concept mainly mirrors a helper method, UI assembly step, or repaint/update mechanism and is not useful for browsing or prompt composition, fold it into its parent summary or omit it.
 - Supported modes are `generate`, `anchors`, and `kinds`.
 - If a mode is provided and it is exactly one of `generate`, `anchors`, or `kinds`, use it directly.
 - If a would-be mode is provided but is not clearly one of `generate`, `anchors`, or `kinds`, ask the user to provide a clear `mode` instead of guessing.
  - If mode is `generate`, use `prompts/generate_concept_graph.md` and create the main `ConceptCode` JSON concept graph for the target.
  - If mode is `anchors`, use `prompts/enrich_concept_graph_anchors.md` and return an updated graph that improves `loc` without changing stable paths or the core hierarchy unless the supplied graph is clearly wrong.
  - If mode is `kinds`, use `prompts/enrich_kind_definitions.md` and return a JSON options object with `kind_definitions` for the kinds already present in the supplied graph.
  - Resolve an output path beside the target. For a file target, replace its final extension with `_concepts.json` such as `foo.py` -> `foo_concepts.json`. For a directory target, write `<directory_name>_concepts.json` inside that directory.
  - After producing the final JSON result for the active mode, write that JSON exactly to the resolved output path.
  - In the final user-facing response, include the output path and keep any prose brief.
  - When generating or revising concept summaries and metadata, also assign conservative `exploration_coverage` and `summary_confidence` scores to each updated concept.
 - Treat `exploration_coverage` as the primary measure of how thoroughly the concept's underlying implementation has been directly inspected.
 - Treat `summary_confidence` as the confidence that the current summary and related concept metadata are correct given that inspection.
 - Keep both scores in the `0.0` to `1.0` range, and usually do not let `summary_confidence` exceed `exploration_coverage`.
- Apply those coverage and confidence scores only to `impl` concepts.
 - Use bucketed scoring semantics: `0.2` for light skim, `0.4` for limited direct inspection, `0.6` for main implementation inspected, `0.8` for main implementation plus key interactions, `0.9` for thorough inspection, and `1.0` only for unusually exhaustive coverage within reasonable scope.
 - If no mode is provided, run all three prompt flows in order: first `prompts/generate_concept_graph.md`, then `prompts/enrich_concept_graph_anchors.md`, then `prompts/enrich_kind_definitions.md`.
  - When running all three prompt flows, pass the generated graph into the anchors step, then pass the anchor-enriched graph into the kinds step, and write only the final fully enriched result to the output path.
 - Follow the selected prompt template's output contract exactly for the active mode, or the final prompt's output contract when running the full three-step flow.
- Preserve stable `children` keys because they define canonical derived paths.
- Prefer a good concept graph over uncertain anchors.
- Omit weak anchors rather than guessing.
