# Generate Concept Graph

Use this prompt when you want an LLM to create the main `setsumei` concept graph for a codebase or a specific file.

## Prompt template

```text
Analyze the target code and produce a JSON concept graph for use with the `setsumei` concept-aware interface.

Requirements:
- Output valid JSON only.
- Use schema_version 1.
- Put the main concept tree under `root`.
- Use stable, human-meaningful keys under `children` because those keys define the concept's stable derived path.
- Prefer concise summaries.
- Focus on conceptual structure first: identify the most useful concepts, relationships, and hierarchy for browsing and later edits.
- Include `related_paths` when another concept materially affects understanding.
- Use `kind` values such as module, view, layout, region, workflow, control, concept, behavior, transition, dataclass, data_group, or guidance when appropriate.
- Do not include empty fields unless useful for consistency.
- Do not add `loc` in this pass; source anchors belong in a later enrichment pass.

Output shape:
{
  "schema_version": 1,
  "source_file": "...",
  "root": {...}
}

The concept graph should help a human or LLM refer to parts of the program by paths like `root.views.merge_view.pending_selection`.
```

## Authoring advice

- Keep sibling counts manageable.
- Split large topics into child concepts rather than giant summaries.
- Favor conceptual names over UI label text when the concept is broader than the label.
- Keep interface-oriented metadata compact so it supports browsing and prompt composition without overwhelming the concept hierarchy.
- Use `related_paths` sparingly and only when they add navigational value.

## When to split the work

- Use this prompt for the main concept graph only.
- Keep the hierarchy stable and useful even when exact source anchors are still unclear.
- Generate source anchors such as `loc` in a separate enrichment pass keyed by stable concept paths.
- Generate `kind_definitions` for the TUI options file in a separate pass keyed to the kinds already used in the graph.
