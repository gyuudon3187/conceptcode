/concept-graph <target> [mode] [existing-graph]

 Goal: route concept-graph work to the right prompt flow for the given file, directory, or subsystem.

 Instructions for the LLM:
 - Prefer a concept hierarchy that a non-programmer product collaborator can browse and discuss without needing source-level implementation categories.
 - During graph generation, prefer user-meaningful views, domain concepts, major subsystems, and independently meaningful processes over buckets that mainly mirror code organization.
 - Do not default to top-level categories like constants, utils, entrypoints, or generic workflows unless they are themselves meaningful concepts for understanding the system.
 - Treat `region` as a bounded, tangible area within a view, layout, or other clearly comprehensible surface, not as a fallback bucket for arbitrary code sections.
 - Treat `control` as a focused interactive element or tight control cluster such as a button, dropdown, input, toggle, tab set, picker, or action list.
 - Treat a UI-coupled or parent-owned flow as a child `behavior` of the relevant concept; reserve `workflow` for a process that stands on its own outside a specific parent surface.
 - Attach a `behavior` to the most specific meaningful owner: prefer a `control` over its containing `region` when the control is the real trigger or state owner, prefer a `region` when multiple nearby controls act together, and prefer a `view` when the behavior belongs to the whole screen or mode.
 - Supported modes are `generate`, `anchors`, and `kinds`.
 - If a mode is provided and it is exactly one of `generate`, `anchors`, or `kinds`, use it directly.
 - If a would-be mode is provided but is not clearly one of `generate`, `anchors`, or `kinds`, ask the user to provide a clear `mode` instead of guessing.
 - If mode is `generate`, use `prompts/generate_concept_graph.md` and create the main `ConceptCode` JSON concept graph for the target.
 - If mode is `anchors`, use `prompts/enrich_concept_graph_anchors.md` and return an updated graph that improves `loc` without changing stable paths or the core hierarchy unless the supplied graph is clearly wrong.
 - If mode is `kinds`, use `prompts/enrich_kind_definitions.md` and return a JSON options object with `kind_definitions` for the kinds already present in the supplied graph.
 - When generating or revising concept summaries and metadata, also assign conservative `exploration_coverage` and `summary_confidence` scores to each updated concept.
 - Treat `exploration_coverage` as the primary measure of how thoroughly the concept's underlying implementation has been directly inspected.
 - Treat `summary_confidence` as the confidence that the current summary and related concept metadata are correct given that inspection.
 - Keep both scores in the `0.0` to `1.0` range, and usually do not let `summary_confidence` exceed `exploration_coverage`.
 - Use bucketed scoring semantics: `0.2` for light skim, `0.4` for limited direct inspection, `0.6` for main implementation inspected, `0.8` for main implementation plus key interactions, `0.9` for thorough inspection, and `1.0` only for unusually exhaustive coverage within reasonable scope.
 - If no mode is provided, run all three prompt flows in order: first `prompts/generate_concept_graph.md`, then `prompts/enrich_concept_graph_anchors.md`, then `prompts/enrich_kind_definitions.md`.
 - When running all three prompt flows, pass the generated graph into the anchors step, then pass the anchor-enriched graph into the kinds step, and return only the final fully enriched result.
 - Follow the selected prompt template's output contract exactly for the active mode, or the final prompt's output contract when running the full three-step flow.
- Preserve stable `children` keys because they define canonical derived paths.
- Prefer a good concept graph over uncertain anchors.
- Omit weak anchors rather than guessing.
