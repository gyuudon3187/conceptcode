/concept-graph <target> [existing-graph]

Goal: route concept-graph work to the right prompt flow for the given file, directory, or subsystem.

Instructions for the LLM:
- First decide whether this is a graph-generation pass or an anchor-enrichment pass.
- If no existing concept graph is provided, use `prompts/generate_concept_graph.md` and create the main `setsumei` JSON concept graph for the target.
- If an existing concept graph is provided, use `prompts/enrich_concept_graph_anchors.md` and return an updated graph that improves `loc` and `code_refs` without changing stable paths or the core hierarchy unless the supplied graph is clearly wrong.
- Follow the selected prompt template's output contract exactly.
- Preserve stable `children` keys because they define canonical derived paths.
- Prefer a good concept graph over uncertain anchors.
- Omit weak anchors rather than guessing.
