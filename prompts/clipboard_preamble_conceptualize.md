# ConceptCode exported concept context for concept-graph editing

Use this concept graph context to update the concept graph itself. Treat the concept graph as the primary artifact for this task.

## How to read this context

- Treat `path` as the canonical stable identifier for a concept. Paths come from stable keys under `children`.
- Use `title`, `kind`, and `summary` first to understand each concept's role in the system model.
- Treat the top-level prompt text as the primary source of user intent, especially for requests to add, remove, rename, split, merge, move, or restructure concepts.
- Treat the included concept blocks as the concepts the user explicitly referenced in the exported prompt context, unless the copied context says a fallback concept was used.
- If the user names concepts by description instead of by explicit path, infer the best matching existing concept or nearby parent context from the provided graph context before proposing edits.
- If the user refers to several concepts, handle the request as a multi-concept graph edit and keep the relationships between those concepts coherent.
- If the intended target concept is ambiguous, choose the smallest safe interpretation and make that assumption explicit in the diff or its labels.
- Use parent context, `child_paths`, and `related_paths` to navigate nearby structure when deciding where a graph edit belongs.
- Use `loc` only as supporting evidence about implementation anchors. Do not let uncertain or missing anchors block a good conceptual edit.
- Treat `why_it_exists`, `state_predicate`, `aliases`, and `draft_status` as optional supporting context.
- Do not assume every concept has every field. Prefer omitted anchors over guessed anchors.

## Editing priorities

- Restrict work to concept-graph edits only.
- Treat requests to edit implementation code, runtime behavior, tests, docs, or anything outside the concept graph as out of scope for this mode.
- If the user asks for a non-graph task, refuse that part of the request and only describe the concept-graph change that would represent it, if any.
- Preserve stable keys under `children` whenever possible, because those keys define canonical derived paths.
- Prefer minimal, local graph edits over broad rewrites when the existing structure is mostly correct.
- Add concepts when they materially improve navigation, explanation, or future promptability.
- Remove concepts only when they are redundant, misleading, structurally wrong, or no longer represent the system well.
- Split or merge concepts only when the current decomposition makes browsing or later edits materially worse.
- Preserve existing summaries and hierarchy unless they are clearly wrong or the user asked for a structural change.
- Add or refine `loc` only when you can identify one best primary implementation span confidently.
- Omit uncertain anchors rather than guessing.

## Expected output

- Return a structured graph diff, not a full rewritten graph unless the user explicitly asks for one.
- Keep the diff concrete and implementation-ready for the concept graph JSON.
- Make it clear which concepts are being added, removed, moved, renamed, split, merged, or updated.
- When the user refers to a concept without a path, identify the resolved target concept path in the diff before applying the requested change.
- Explain additions, removals, moves, renames, and summary or metadata updates through the diff structure itself as much as possible.
- If a requested change is ambiguous, choose the most conservative graph edit that satisfies the prompt.
