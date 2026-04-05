# Generate Concept Graph

Use this prompt when you want an LLM to create the main `setsumei` concept graph for a codebase or a specific file.

## Prompt template

```text
Analyze the target code and produce a JSON concept graph for use with the `setsumei` browser.

Requirements:
- Output valid JSON only.
- Use schema_version 1.
- Put the main concept tree under `root`.
- Use stable, human-meaningful keys under `children` because those keys define the concept's stable derived path.
- Prefer concise summaries.
- Include a primary `loc` field when you can identify a confident main source span for the concept.
- Make `loc.file` explicit so the browser can render embedded source context even when the concept lives outside the top-level `source_file`.
- Include `code_refs` only when supplementary anchors add value and confidence is good.
- Add `interpretation_hint.kind_definitions` when custom kinds need short semantic definitions for consistent browsing and later edits.
- Include `related_paths` when another concept materially affects understanding.
- Use `kind` values such as module, view, layout, region, workflow, control, concept, behavior, transition, dataclass, data_group, or guidance when appropriate.
- Do not include empty fields unless useful for consistency.

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

The concept graph should help a human or LLM refer to parts of the program by paths like `root.views.merge_view.pending_selection`.
```

## Authoring advice

- Keep sibling counts manageable.
- Split large topics into child concepts rather than giant summaries.
- Favor conceptual names over UI label text when the concept is broader than the label.
- Keep browser-oriented metadata compact so it supports browsing without overwhelming the concept hierarchy.
- Use `related_paths` sparingly and only when they add navigational value.

## When to split the work

- Use this prompt for the main concept graph and lightweight high-confidence anchors.
- If exact spans or supplementary anchors are hard to infer in the same pass, generate the concept graph first and enrich `loc` and `code_refs` in a second pass keyed by stable concept paths.
