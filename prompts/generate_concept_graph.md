# Generate Concept Graph

Use this prompt when you want an LLM to create a `setsumei` concept graph for a codebase or a specific file.

## Prompt template

```text
Analyze the target code and produce a JSON concept graph for use with the `setsumei` browser.

Requirements:
- Output valid JSON only.
- Use schema_version 1.
- Put the main concept tree under `root`.
- Use stable, human-meaningful keys under `children` because those keys become canonical concept paths.
- Prefer concise summaries.
- Include `code_refs` for implementation anchors whenever possible.
- Include `related_paths` when another concept materially affects understanding.
- Use `kind` values such as module, view, layout, region, workflow, control, concept, behavior, transition, dataclass, data_group, or guidance when appropriate.
- Do not include empty fields unless useful for consistency.

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
- Use `related_paths` sparingly and only when they add navigational value.
