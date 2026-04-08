# setsumei concept context

Use this concept graph context to identify the referenced part of the system. Use whichever fields are present and relevant to the task.

## How to read this context

- Treat `path` as the canonical stable identifier for a concept. Paths come from stable keys under `children`.
- Use `title`, `kind`, and `summary` first to understand the concept's role in the system.
- Treat the top-level prompt text and any per-concept `note` fields as the primary source of user intent, including requests to add, remove, or modify behavior.
- Use parent context, `child_paths`, and `related_paths` to navigate nearby structure when needed.
- Use `loc` as the primary implementation anchor when it is present. It identifies one best primary span with explicit `file`, `start_line`, and `end_line`.
- Treat `why_it_exists`, `state_predicate`, and `aliases` as optional supporting context.
- Treat `draft_status` as a sign that the concept was drafted in the TUI and may not yet exist in the source concept graph.
- Do not assume every concept has every field. Prefer omitted anchors over guessed anchors.

## After completing the work

Update the concept graph only as the very last step, and only if your work changes the represented system.

- Preserve stable keys under `children`, because those keys define canonical derived paths.
- Preserve the existing hierarchy and summaries unless they are clearly wrong after the change.
- Add or refine `loc` only when you can identify one best primary implementation span confidently.
- Omit uncertain anchors rather than guessing.
- Do this only after the implementation work is complete.
