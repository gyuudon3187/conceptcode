/concept-graph <target> [mode] [existing-graph]

 Goal: route concept-graph work to the right prompt flow for the given file, directory, or subsystem.

Instructions for the LLM:
 - Supported modes are `generate`, `anchors`, and `kinds`.
 - If a mode is provided and it is exactly one of `generate`, `anchors`, or `kinds`, use it directly.
 - If a would-be mode is provided but is not clearly one of `generate`, `anchors`, or `kinds`, ask the user to provide a clear `mode` instead of guessing.
 - If mode is `generate`, use `prompts/generate_concept_graph.md` and create the main `setsumei` JSON concept graph for the target.
 - If mode is `anchors`, use `prompts/enrich_concept_graph_anchors.md` and return an updated graph that improves `loc` without changing stable paths or the core hierarchy unless the supplied graph is clearly wrong.
 - If mode is `kinds`, use `prompts/enrich_kind_definitions.md` and return a JSON options object with `kind_definitions` for the kinds already present in the supplied graph.
 - If no mode is provided, run all three prompt flows in order: first `prompts/generate_concept_graph.md`, then `prompts/enrich_concept_graph_anchors.md`, then `prompts/enrich_kind_definitions.md`.
 - When running all three prompt flows, pass the generated graph into the anchors step, then pass the anchor-enriched graph into the kinds step, and return only the final fully enriched result.
 - Follow the selected prompt template's output contract exactly for the active mode, or the final prompt's output contract when running the full three-step flow.
- Preserve stable `children` keys because they define canonical derived paths.
- Prefer a good concept graph over uncertain anchors.
- Omit weak anchors rather than guessing.
