---
name: doc-ripple-check
description: Check whether changes to AGENTS.md, README.md, or prompts markdown should ripple to related docs in this repo
compatibility: opencode
metadata:
  audience: maintainers
  domain: documentation
  workflow: ripple-review
---

# Doc Ripple Check

Use this skill to review documentation changes for ripple effects across the policy, prompt, and overview docs in this repository.

## What I do

- Inspect one or more changed documentation files or a documentation-focused diff.
- Classify the change into semantic categories rather than treating every wording edit as equally important.
- Recommend related files that should be reviewed for consistency.
- Distinguish between files that likely require review and files that are only plausibly affected.
- Explain the reasoning in a compact, actionable report.

## When to use me

Use this skill when a change touches any of:

- `AGENTS.md`
- any subdirectory `AGENTS.md`
- `README.md`
- `prompts/**/*.md`

Auto-load recommendation:

- Automatically load this skill when changes touch `AGENTS.md`, `prompts/AGENTS.md`, `prompts/generate_concept_graph.md`, or `prompts/enrich_concept_graph_anchors.md`.
- Consider loading this skill for `README.md` and `src/AGENTS.md` when the change appears semantic rather than purely editorial.

## Repository model

Treat these files as the main ripple surface in this repo:

- `AGENTS.md`
- `README.md`
- `src/AGENTS.md`
- `prompts/AGENTS.md`
- `prompts/generate_concept_graph.md`
- `prompts/enrich_concept_graph_anchors.md`

Use these source-of-truth assumptions:

- Root `AGENTS.md` is the highest-level policy source for repo purpose, invariants, schema expectations, and prompt-generation goals.
- `prompts/AGENTS.md` is the local policy source for prompt files under `prompts/`.
- `README.md` is a consumer-facing overview and summary, not the primary policy source.
- `src/AGENTS.md` is mostly local engineering guidance and only overlaps with `README.md` in architecture and development workflow areas.

## Change categories

Classify each change into one or more of:

- `product_framing`
- `repo_conventions`
- `schema_contract`
- `concept_path_semantics`
- `anchor_semantics`
- `prompt_workflow`
- `architecture_dev`
- `editorial`

Severity guidance:

- `editorial`: wording, formatting, or examples that do not materially change meaning
- `semantic`: meaning changed, but no strict contract or schema rule changed
- `contract`: schema, output contract, path semantics, or workflow guarantees changed

## Ripple rules

Apply these default review rules unless the specific diff clearly narrows the scope:

- If root `AGENTS.md` changes in project purpose, product invariants, schema expectations, or prompt-generation guidance, review `README.md`, `prompts/AGENTS.md`, `prompts/generate_concept_graph.md`, and `prompts/enrich_concept_graph_anchors.md`.
- If `prompts/AGENTS.md` changes, review both prompt templates and review `README.md` when user-visible workflow or terminology may have changed.
- If `prompts/generate_concept_graph.md` changes, review `prompts/AGENTS.md` and review `README.md` when the main workflow, output contract, or terminology changed.
- If `prompts/enrich_concept_graph_anchors.md` changes, review `prompts/AGENTS.md` and review `README.md` when second-pass workflow or anchor semantics changed.
- If `README.md` changes, review the more canonical doc for the changed topic: root `AGENTS.md` for product purpose or invariants, prompt docs for prompt workflow, and `src/AGENTS.md` for architecture or development-environment overlap.
- If `src/AGENTS.md` changes, review `README.md` when architecture, developer workflow, or environment guidance changed.

Use these topic cues while classifying:

- `schema_contract`: `schema_version`, top-level JSON shape, `interpretation_hint`, output contract
- `concept_path_semantics`: stable child keys, derived paths, path stability
- `anchor_semantics`: `loc`, `loc.file`, confidence, anchoring rules
- `prompt_workflow`: generate-versus-enrich split, pass ordering, preserve-structure rules
- `product_framing`: what `ConceptCode` is for, supported system types, browsing goals
- `architecture_dev`: setup, scripts, runtime architecture, source layout

## How to work

When invoked:

1. Read the changed file content or diff.
2. Identify whether the change is editorial, semantic, or contract-level.
3. Map the change to one or more categories.
4. Recommend related files to review.
5. Prefer recommending review over asserting inconsistency unless the mismatch is explicit.
6. Stay concise.

## Output format

Return a compact report with these fields:

- `changed_files`
- `categories`
- `severity`
- `must_review`
- `maybe_review`
- `rationale`
- `notes`

Formatting expectations:

- Keep rationales short and file-specific.
- Do not edit files unless explicitly asked to do a follow-up consistency update.
- If the change is purely editorial, say so and keep `must_review` empty unless a specific mirrored phrase likely needs updating elsewhere.
