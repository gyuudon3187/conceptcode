# Enrich Concept Graph Anchors

Use this prompt when you already have a concept graph with stable paths and want a second pass that improves source anchors without changing the core concept structure.

## Prompt template

```text
Given the existing concept graph and the target code, return an updated JSON concept graph that preserves the current concept hierarchy and stable paths while enriching source anchors.

Requirements:
- Output valid JSON only.
- Preserve the existing `schema_version`, top-level shape, stable child keys, and concept hierarchy unless a supplied graph is structurally invalid.
- Do not rename concept keys under `children`.
- Keep existing summaries and conceptual decomposition unless a supplied value is clearly wrong.
- Add or refine a primary `loc` field for each concept when possible.
- Use `loc` for the main implementation span of the concept, with an explicit `file`, inclusive `start_line`, and inclusive `end_line`.
- Keep `loc` compact; choose the smallest span that still represents the main part of the concept.
- Keep one-line concepts as `start_line == end_line`.
- Add or refine `code_refs` only for supplementary anchors, especially when the concept is implemented across multiple relevant locations or files.
- Remove guessed or weak anchors rather than keeping low-confidence spans.
- Do not add large quoted code snippets or prose outside the JSON.

Anchor rules:
- Use `loc` for one best primary span.
- Use `code_refs` for extra supporting anchors.
- Omit uncertain anchors rather than guessing.

Output shape:
{
  "schema_version": 1,
  "source_file": "...",
  "interpretation_hint": {...},
  "root": {...}
}

Goal:
Make the concept graph better at pointing to real implementation locations while preserving the graph's existing conceptual structure.
```

## Authoring advice

- Prefer preserving a good concept graph over forcing an uncertain anchor.
- When a concept is spread across several locations, anchor the main controlling location in `loc` and keep the others in `code_refs`.
- If a concept is conceptual and has no meaningful implementation span, omit `loc` rather than inventing one.
- Keep edits minimal and targeted to source-anchor quality.
