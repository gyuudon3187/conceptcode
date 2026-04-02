# Concept Graph Schema

`setsumei` reads a hierarchical JSON document with this general shape:

```json
{
  "schema_version": 1,
  "source_file": "path/to/source.py",
  "interpretation_hint": {
    "canonical_identifier": "Use the path field as the stable concept identifier."
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

## Recommended fields

- `title`
- `kind`
- `summary`
- `why_it_exists`
- `code_refs`
- `related_paths`
- `aliases`
- `state_predicate`
- `children`
