# setsumei

`setsumei` is a tool for browsing hierarchical concept graphs.

The current application is an OpenTUI browser that reads a JSON concept graph, lets you navigate by stable concept path, and copies compact or full LLM-ready references to your clipboard.

## Current goals

- browse concepts by hierarchy rather than raw files
- give each concept a stable derived path identifier
- make it easy to refer to specific parts of a program in LLM prompts
- support code, UI, workflows, data models, and other conceptual structures

## Development environment

This repository uses `direnv` and a Nix flake.

1. Install `nix` and `direnv`
2. Enter the repository and run:

```bash
direnv allow
```

The `.envrc` loads the flake automatically with `use flake`.

## Install dependencies

```bash
bun install
```

The flake provides:

- `bun`
- `zig`

Clipboard export uses your existing `wl-copy` installation.

## Run

Run the bundled example:

```bash
bun run start
```

Run against a specific concept graph:

```bash
bun run browse -- --concepts-path examples/book_ops_tui_concepts.json
```

## Useful scripts

- `bun run example` - launch the bundled example browser
- `bun run start` - alias for `example`
- `bun run browse -- --concepts-path <file>` - browse a specific graph
- `bun run typecheck` - run TypeScript checks
- `bun run check` - run the project validation command set

## Architecture

- `src/index.ts` boots the OpenTUI app and wires keyboard input to state transitions
- `src/model.ts` loads and normalizes concept graphs
- `src/state.ts` manages navigation, status, layout mode, and scroll state
- `src/view.ts` renders the interface and pane layouts
- `src/clipboard.ts` builds export payloads, including buffered concept actions, and integrates with `wl-copy`

## Prompt workflows

- `prompts/generate_concept_graph.md` is the main prompt for generating a concept graph from code.
- `prompts/enrich_concept_graph_anchors.md` is a follow-up prompt for refining `loc` and `code_refs` without changing stable child keys or derived concept paths.

## Main controls

- `j` / `k` or arrows: move
- `page up` / `page down`: jump through the list
- `ctrl+page up` / `ctrl+page down`: scroll the context pane
- `g` / `home`: jump to top
- `G` / `end`: jump to bottom
- `l` / right: drill down
- `h` / left: go back
- `n`: create a new draft concept under the highlighted parent context
- `space`: add or remove the highlighted persisted concept from the buffer; confirm removal for draft concepts
- `d`: mark the highlighted persisted concept for deletion in the buffer; confirm removal for draft concepts
- `enter`: copy compact context
- `y`: copy full context
- `p`: copy path only
- `c`: clear buffer
- `?`: show key help in the status bar
- `q`: quit

## Included example

The repository includes `examples/book_ops_tui_concepts.json`, a concept graph for the Aozora book ops TUI.
