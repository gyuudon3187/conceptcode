# AGENTS.md

## Scope

These instructions apply when working in this directory and its subdirectories, including when executing the prompt templates here against a target codebase or file.

## Prompt-execution priorities

- Optimize for faithfully modeling the target system, not for proposing product changes to `setsumei`.
- Follow the explicit output contract in the prompt template before adding any extra interpretation.
- Preserve stable child keys under `children` because they define user-facing derived paths.
- Prefer a good concept graph over uncertain anchors.
- Add `loc` in a separate enrichment pass when needed.
- Omit uncertain anchors rather than guessing.
- Keep summaries and anchor metadata compact.
- Favor conceptual decomposition that helps browsing and later edits.

## Workflow split

- Use `generate_concept_graph.md` for the main concept-graph pass.
- Use `enrich_concept_graph_anchors.md` for a follow-up pass that improves `loc` without changing the core concept structure.
- Use `enrich_kind_definitions.md` for a separate follow-up pass that derives `kind_definitions` for a TUI options file without changing the graph.
- When enriching anchors, preserve the existing hierarchy, stable paths, and summaries unless the supplied graph is clearly wrong.
- `clipboard_preamble.md` is the agent-facing interpretation guide for copied concept context. Keep it aligned with the stable-path and anchor semantics defined by the generation and anchor-enrichment prompts.

## Output expectations

- Output valid JSON only when the prompt template requires JSON-only output.
- Keep the top-level shape consistent with the schema in `docs/json_schema.md`.
- Make `loc.file` explicit when a concept's best anchor is outside the graph-level `source_file`.
- Use `related_paths` only when they add real navigational value.
- Treat concept-graph updates as a final follow-up step after implementation work, not as an early planning step.
- Do not add prose outside the requested output format.
