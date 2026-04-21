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
- Restrict anchor enrichment to `root` concepts only.
- Preserve `domain` concepts unchanged except for structurally required no-op passthrough.
- Add or refine `loc` for leaf concepts when possible.
- Preserve existing `exploration_coverage` and `summary_confidence` by default.
- Increase `exploration_coverage` conservatively only when the anchor-enrichment pass required direct inspection that materially improved understanding of the concept's implementation.
- Update `summary_confidence` only when that direct inspection also justifies a more trustworthy summary or metadata understanding.
- Use `loc` for one best primary implementation span of the concept, with an explicit `file`, inclusive `start_line`, and inclusive `end_line`.
- Keep `loc` compact; choose the smallest span that still represents the main part of the concept.
- Keep one-line concepts as `start_line == end_line`.
- Omit uncertain anchors rather than guessing.
- If a concept is conceptual or has no meaningful implementation span, omit `loc`.
- Do not add large quoted code snippets or prose outside the JSON.

Anchor rules:
- By default, add `loc` only to leaf concepts.
- A non-leaf concept may have a `loc` only when it has a clear canonical implementation site that is not well represented by any child concept.
- Use one best primary span rather than several weak spans.
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
- Favor precise leaf anchors over broad parent anchors.
- When a parent concept is represented by child anchors well enough, omit the parent `loc`.
- If a concept is spread across several locations and no single primary span stands out, omit `loc` rather than inventing a weak anchor.
- Keep edits minimal and targeted to source-anchor quality.
