# AGENTS.md

## Scope

These instructions apply when working in this directory and its subdirectories, including when executing the prompt templates here against a target codebase or file.

## Prompt-execution priorities

- Optimize for faithfully modeling the target system, not for proposing product changes to `setsumei`.
- Follow the explicit output contract in the prompt template before adding any extra interpretation.
- Preserve stable child keys under `children` because they define user-facing derived paths.
- Prefer a good concept graph over uncertain anchors.
- Use `loc` for one best primary span and `code_refs` for supplementary anchors.
- Omit uncertain anchors rather than guessing.
- Keep summaries, interpretation hints, and anchor metadata compact.
- Favor conceptual decomposition that helps browsing and later edits.

## Workflow split

- Use `generate_concept_graph.md` for the main concept-graph pass.
- Use `enrich_concept_graph_anchors.md` for a follow-up pass that improves `loc` and `code_refs` without changing the core concept structure.
- When enriching anchors, preserve the existing hierarchy, stable paths, and summaries unless the supplied graph is clearly wrong.

## Output expectations

- Output valid JSON only when the prompt template requires JSON-only output.
- Keep the top-level shape consistent with the schema in `docs/json_schema.md`.
- Make `loc.file` explicit when a concept's best anchor is outside the graph-level `source_file`.
- Use `related_paths` and `interpretation_hint.kind_definitions` only when they add real navigational or semantic value.
- Do not add prose outside the requested output format.
