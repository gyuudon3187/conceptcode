# Enrich Kind Definitions

Use this prompt when you already have a concept graph and want a separate pass that derives concise semantic descriptions for the `kind` values already used in that graph.

## Prompt template

```text
Given the existing concept graph and the target code, return a JSON options object that adds meaningful descriptions for the `kind` values already present in the graph.

Requirements:
- Output valid JSON only.
- Return an options object shaped exactly like:
  {
    "kind_definitions": {
      "kind_name": "Short semantic description"
    }
  }
- Only include `kind` values that are already used by one or more concepts in the supplied graph.
- Do not invent extra `kind` values that are not present in the graph.
- Base each description on how that `kind` is actually used in the supplied graph and target code, not on generic software-taxonomy definitions.
- When the graph usage is broadly consistent with repo guidance, prefer descriptions that reinforce the intended distinction between kinds such as `region`, `behavior`, and `workflow`.
- Keep descriptions short, concrete, and reusable across concepts of that kind.
- Prefer one sentence fragment per `kind`.
- Avoid repeating the `kind` name in the description unless needed for clarity.
- If a `kind` is too inconsistently used to describe confidently, omit it rather than guessing.
- Do not modify the concept graph itself.
- Do not add prose outside the JSON.

Goal:
Produce a TUI options file that improves kind selection by giving each existing `kind` a compact semantic description.
```

## Authoring advice

- Infer the meaning of each `kind` from the graph's actual concepts and summaries first.
- Use the target code to clarify ambiguous kinds, not to broaden the scope beyond the graph.
- Prefer descriptions that help a human choose the right kind during concept creation.
- If a kind appears to be used inconsistently, prefer a cautious description centered on the strongest common pattern rather than restating accidental misuse.
- Keep the output stable and reusable; avoid descriptions that depend on one specific concept path.
