# Concept Graph Schema

`setsumei` reads a hierarchical JSON document with this general shape:

```json
{
  "schema_version": 1,
  "source_file": "path/to/source.py",
  "interpretation_hint": {
    "kind_definitions": {}
  },
  "root": {
    "title": "Module Name",
    "kind": "module",
    "summary": "High-level description.",
    "children": {
      "some_concept": {
        "title": "Some Concept",
        "kind": "concept",
        "summary": "Explanation.",
        "loc": {
          "file": "pkg/file.py",
          "start_line": 10,
          "end_line": 18
        },
        "code_refs": ["pkg/file.py:10"],
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
- `loc`
- `code_refs`
- `related_paths`
- `aliases`
- `state_predicate`
- `children`

Concepts may also include additional metadata fields beyond this list. The browser preserves extra concept fields as node metadata even when it does not render them specially.

## Interpretation hints

`interpretation_hint` is an optional top-level object for shared guidance that applies across the graph.

Useful conventions include:

```json
{
  "kind_definitions": {
    "workflow": "A multi-step behavior with meaningful transitions.",
    "control": "A user-facing input or command surface."
  }
}
```

- `kind_definitions` lets a graph describe project-specific or custom `kind` values once instead of repeating that explanation on every concept.
- The browser uses these definitions to make kind selection and later edits more consistent.

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
- Keep `code_refs` for supplementary anchors, especially when a concept is implemented across multiple relevant locations or files.

If exact source anchors are difficult to determine in the same pass as concept decomposition, it is reasonable to generate the graph first and enrich `loc` and `code_refs` in a separate follow-up pass keyed by stable concept paths.
