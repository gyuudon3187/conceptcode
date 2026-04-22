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
  },
  "domain": {
    "title": "Domain",
    "kind": "domain_area",
    "summary": "Top-level domain concepts.",
    "children": {
      "business_rule": {
        "title": "Business Rule",
        "kind": "rule",
        "summary": "A non-code domain concept.",
        "related_paths": ["root.some_concept"],
        "children": {}
      }
    }
  }
}
```

- A graph must include at least one of `root` or `domain`.
- `root` is for implementation-backed concepts.
- `domain` is for non-code domain concepts.

## Stable paths

If a child appears as `root.children.views.children.merge_view`, the browser path becomes `root.views.merge_view`.

If a child appears as `domain.children.rules.children.billing_policy`, the browser path becomes `domain.rules.billing_policy`.

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

## Namespace-specific metadata

- `root` concepts may use implementation-facing metadata such as `loc`, `exploration_coverage`, and `summary_confidence`.
- `root` concepts may use `implemented` to record whether the represented implementation currently exists.
- `domain` concepts must not use `implemented`, `loc`, `exploration_coverage`, or `summary_confidence`.
- Cross-namespace `related_paths` are allowed when they add real navigational value.
- Keep `related_paths` sparse and meaningful; avoid adding reciprocal links automatically unless they materially improve navigation.

## Maintenance workflows

The current graph-maintenance workflow set supports these explicit operations:

- `/create` creates a new concept under an existing parent. New `root` concepts default to `implemented: false` unless explicitly overridden.
- `/delete` removes an existing concept after preflight and confirmation, including `related_paths` cleanup.
- `/rename` renames an existing child key after preflight and confirmation, including descendant and `related_paths` rewrites.
- `/move` moves an existing concept subtree under a different parent after preflight and confirmation, including descendant and `related_paths` rewrites.
- `/merge` merges two existing concepts into an explicit survivor after preflight and confirmation.
- `/split` decomposes an overloaded concept into explicit child groupings after preflight and confirmation. The default behavior preserves the original concept as an umbrella parent and moves explicitly assigned children under new child concepts.
- `/link` adds, removes, or normalizes sparse `related_paths` links.
- `/anchor` adds or refines root-only `loc`, `exploration_coverage`, and related summary metadata.
- `/validate` runs a read-only audit and suggests follow-up maintenance skills for findings.

Restructuring workflows such as `/delete`, `/rename`, `/move`, `/merge`, and `/split` should always be handled as explicit preflight-plus-confirmation operations rather than direct blind edits.

## Kind spaces

- Use one shared field name: `kind`.
- Do not mix implementation-oriented kinds and domain-oriented kinds within the same namespace.
- `root` should use implementation-oriented kinds such as `module`, `view`, `layout`, `region`, `control`, `behavior`, `transition`, `dataclass`, and `data_group`.
- `domain` should use domain-oriented kinds such as `domain_area`, `business_concept`, `actor`, `goal`, `policy`, `rule`, `constraint`, `state`, `event`, `workflow`, `capability`, `metric`, and `term`.
- Missing `kind` is allowed, but known cross-namespace kind mismatches should be treated as errors and unknown kinds should be treated as warnings during graph validation.

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
- Anchor updates should stay narrow: refine `summary` only when direct inspection clearly improves it, and update `exploration_coverage` conservatively.

If exact source anchors are difficult to determine during concept decomposition, it is reasonable to generate the graph first and enrich `loc` in a separate follow-up pass keyed by stable concept paths.
