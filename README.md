# setsumei

`setsumei` is a concept-aware interface for working with hierarchical concept graphs while composing prompts for coding agents.

The current application is an OpenTUI workspace for concept-aware prompt composition. It reads a JSON concept graph, lets you navigate by stable concept path, edit concept summaries, mention concepts directly in a prompt with `@root...` aliases, and currently exports compact LLM-ready context plus interpretation guidance through the clipboard for use with external coding agents.

It now also includes a minimal provider-shaped streaming chat path: prompt submission goes through a local SSE dummy server, and assistant text is rendered incrementally in the TUI so the future ChatGPT integration can reuse the same event flow with minimal changes.

## Current goals

- browse concepts by hierarchy rather than raw files
- give each concept a stable derived path identifier
- make it easy to refer to specific parts of a program directly in coding-agent prompts
- support code, UI, workflows, data models, and other conceptual structures
- evolve toward a concept-aware coding-agent interface without losing the concept-graph-first workflow

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

Current clipboard export uses your existing `wl-copy` installation.

## Run

Run the bundled example:

```bash
bun run start
```

Run against a specific concept graph:

```bash
bun run browse -- --concepts-path examples/book_ops_tui_concepts.json
```

Provide extra kind choices from a TUI options JSON file:

```bash
bun run browse -- --concepts-path examples/book_ops_tui_concepts.json --options-path kinds.json
```

Example options file:

```json
{
  "kind_definitions": {
    "workflow": "A multi-step behavior with meaningful transitions.",
    "control": "A user-facing input or command surface."
  }
}
```

## Useful scripts

- `bun run example` - launch the bundled example workspace
- `bun run start` - alias for `example`
- `bun run browse -- --concepts-path <file> [--options-path <file>]` - open the concept-aware prompt workspace for a specific graph
- `bun run typecheck` - run TypeScript checks
- `bun run check` - run the project validation command set

## Architecture

- `src/index.ts` boots the OpenTUI app and wires keyboard input to state transitions
- `src/chat.ts` defines the minimal streaming transport boundary and the disposable local dummy SSE server
- `src/model.ts` loads and normalizes concept graphs
- `src/state.ts` manages navigation, status, layout mode, and scroll state
- `src/view.ts` renders the prompt-first interface, concept summary surfaces, and inspector overlays
- `src/clipboard.ts` builds the current clipboard export payload from prompt-referenced concept aliases, adds concept-field guidance for LLMs, and integrates with `wl-copy`

## Prompt workflows

- `prompts/generate_concept_graph.md` is the main prompt for generating a concept graph from code.
- `prompts/enrich_concept_graph_anchors.md` is a follow-up prompt for refining `loc` without changing stable child keys or derived concept paths.
- `prompts/enrich_kind_definitions.md` is a separate follow-up prompt for generating a TUI options file with semantic descriptions for the kinds already present in a graph.

## Command workflow

- `/concept-graph <target>` generates a new concept graph.
- `/concept-graph <target> anchors <existing-graph>` enriches `loc` in an existing graph.
- `/concept-graph <target> kinds <existing-graph>` generates a JSON options file with `kind_definitions` for the kinds already used in that graph.

## Main controls

- `j` / `k` or arrows: move through concepts
- `page up` / `page down`: jump through the concept list
- `ctrl+page up` / `ctrl+page down`: scroll inspector content
- `g` / `home`: jump to top
- `G` / `end`: jump to bottom
- `l` / right: drill down
- `h` / left: go back
- `tab`: move focus between concepts and prompt
- `i`: edit the prompt
- `enter`: edit the highlighted concept summary or, when prompt-focused, edit the prompt
- `enter` while prompt editing: submit the prompt and watch the assistant response stream in real time
- `@` while editing the prompt: fuzzy-search full concept paths and insert a stable alias such as `@root.views.layout.sidebar`
- `ctrl+n` / `ctrl+p`: move through alias suggestions while editing the prompt
- `s`: open snippet inspector for the highlighted concept
- `t`: open subtree inspector for the highlighted concept
- `m`: open metadata inspector for the highlighted concept
- `y`: copy context for the concepts explicitly referenced in the prompt, or the highlighted concept when no alias is referenced
- `p`: copy path only
- `?`: show key help in the status bar
- `q`: quit

Current clipboard exports include a short instruction preamble loaded from `prompts/clipboard_preamble.md`, a compact `# System Overview` section derived from the root concept, a clearly labeled `# Main Instructions` section when prompt text is present, and concept blocks for the concepts explicitly referenced in the prompt by alias. If no concept alias is referenced, the highlighted concept is used as the fallback context. The preamble explains that stable paths come from `children` keys, that the graph models conceptual structure first, that fields such as `summary`, `related_paths`, `why_it_exists`, `aliases`, and `loc` are optional and should be used opportunistically, that missing anchors are preferable to guessed ones, and that if the agent's work changes the represented system it should update the concept graph only as its very last step.

## Included example

The repository includes `examples/book_ops_tui_concepts.json`, a concept graph for the Aozora book ops TUI.
