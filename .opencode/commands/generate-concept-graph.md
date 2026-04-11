/generate-concept-graph <target>

Goal: create a `ConceptCode` JSON concept graph for the given file, directory, or subsystem.

Instructions for the LLM:
- Read the target code and identify the major concepts, views, workflows, state transitions, controls, data structures, and important relationships.
- Represent them as a hierarchical JSON graph using the schema described in `docs/json_schema.md`.
- Choose stable `children` keys because they become canonical paths.
- Focus on the concept hierarchy and omit source anchors in this pass.
- Include `related_paths` only when they materially help interpretation.
- Prefer concise summaries over exhaustive prose.
- Output valid JSON only.
