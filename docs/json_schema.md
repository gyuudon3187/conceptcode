# Concept Graph Schema

`ConceptCode` reads a hierarchical JSON document with this general shape:

```json
{
  "schema_version": 1,
  "source_file": "path/to/source.py",
  "root": {
    "title": "Module Name",
    "kind": "module",
    "summary": "High-level description.",
    "children": {
      "some_concept": {
        "title": "Some Concept",
        "kind": "concept",
        "summary": "Explanation.",
        "exploration_coverage": 0.8,
        "summary_confidence": 0.7,
        "loc": {
          "file": "pkg/file.py",
          "start_line": 10,
          "end_line": 18
        },
        "related_paths": ["root.other_concept"],
        "aliases": ["nickname"],
        "children": {}
      }
    }
  }
}
```

## Stable paths

If a child appears as `root.children.views.children.merge_view`, the browser path becomes `root.views.merge_view`.

Paths are derived from object keys under `children`, so keep those keys stable.

The path is usually derived, not stored as a separate field on each concept.

## Recommended fields

- `title`
- `kind`
- `summary`
- `why_it_exists`
- `exploration_coverage`
- `summary_confidence`
- `loc`
- `related_paths`
- `aliases`
- `state_predicate`
- `children`

Concepts may also include additional metadata fields beyond this list. The browser preserves extra concept fields as node metadata even when it does not render them specially.

## Confidence-style metrics

- `exploration_coverage` is an optional `0.0` to `1.0` score for how thoroughly the relevant implementation surface for a concept has been directly inspected.
- `summary_confidence` is an optional `0.0` to `1.0` score for how trustworthy the current summary and related concept metadata are based on that inspection.
- Use conservative scores.
- `summary_confidence` should usually not exceed `exploration_coverage`.
- A practical threshold for follow-up work is `exploration_coverage < 0.9`, which means important direct inspection is likely still missing.

Common `kind` values include `module`, `view`, `layout`, `region`, `workflow`, `control`, `concept`, `behavior`, `transition`, `dataclass`, `data_group`, and `guidance`.

## Source anchors

Use `loc` for the primary implementation span of a concept when one main source region best represents it.

Recommended `loc` shape:

```json
{
  "file": "pkg/file.py",
  "start_line": 10,
  "end_line": 18
}
```

- `file` should always be explicit so the span is unambiguous even when it differs from the top-level `source_file`.
- `source_file` remains the default file context for the graph as a whole; `loc.file` identifies the specific file for an individual concept span.
- `start_line` and `end_line` are inclusive 1-based line numbers.
- For a one-line concept, set `start_line` and `end_line` to the same value.
- Keep `loc` compact and use it only for the main span you want the browser to show in embedded source context.
- Add `loc` primarily to leaf concepts; parent concepts usually do better with inferred coverage from descendant anchors.

If exact source anchors are difficult to determine during concept decomposition, it is reasonable to generate the graph first and enrich `loc` in a separate follow-up pass keyed by stable concept paths.
