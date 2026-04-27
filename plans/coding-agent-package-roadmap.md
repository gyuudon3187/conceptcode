# Coding Agent Package Roadmap

This document records the current state of the `packages/coding-agent` scaffold so a future session can resume without prior conversation context.

## Current Status

Branch context when this file was added:

- working branch: `coding-agent-skeleton`
- base branch: `master`

Current implementation status:

- `packages/coding-agent` exists as a private workspace package used by the root app.
- The package currently provides:
  - shared agent/tool/streaming types in `packages/coding-agent/src/types.ts`
  - a minimal non-streaming ReAct loop in `packages/coding-agent/src/react-loop.ts`
  - a generic host-injected tool executor helper in `packages/coding-agent/src/tool-executor.ts`
  - a reusable OS-aware host adapter under `packages/coding-agent/src/host-adapter/`
  - a dummy streaming model adapter in `packages/coding-agent/src/model-adapter.ts`
  - a package export surface in `packages/coding-agent/src/index.ts`
- The root workspace depends on `coding-agent` via `package.json` and TypeScript path aliases in `tsconfig.json`.
- ConceptCode app init creates chat transport through `src/platform/coding-agent.ts`.

## Files Added Or Changed

Package files:

- `packages/coding-agent/package.json`
- `packages/coding-agent/src/index.ts`
- `packages/coding-agent/src/types.ts`
- `packages/coding-agent/src/react-loop.ts`
- `packages/coding-agent/src/tool-executor.ts`
- `packages/coding-agent/src/host-adapter/index.ts`
- `packages/coding-agent/src/host-adapter/shared.ts`
- `packages/coding-agent/src/host-adapter/filesystem.ts`
- `packages/coding-agent/src/host-adapter/linux.ts`
- `packages/coding-agent/src/model-adapter.ts`
- `packages/coding-agent/README.md`
- `packages/coding-agent/AGENTS.md`

ConceptCode integration files:

- `src/platform/coding-agent.ts`
- `src/app/init.ts`
- `package.json`
- `tsconfig.json`

## What The Package Does Today

### 1. ReAct Loop Skeleton

`runReactCodingAgent(options)` in `packages/coding-agent/src/react-loop.ts` currently:

- builds an initial `system` + `user` message list
- calls a model through `model.complete(messages)`
- records assistant steps
- executes requested tool calls sequentially
- appends tool results back into the message list
- stops when the model says `done`, when there are no tool calls, or when `maxSteps` is reached

This is intentionally minimal. It is a control-flow scaffold, not yet a provider-backed coding agent.

### 2. Host Adapter

`coding-agent/host-adapter` currently provides a reusable local-runtime integration layer.

Current shared cross-OS tools:

- `read_file`
  - reads UTF-8 files inside the workspace
  - supports line-windowed reads via `offset` and `limit`
  - returns numbered content with explicit truncation metadata encoded as JSON text
- `edit`
  - performs exact-match replacement in one file
  - currently only supports single-match edits with `expectedOccurrences = 1`

Current Linux-specific tools:

- `bash`
- `find`
- `glob`

Current host-adapter limitations:

- no provider-backed tool-calling model yet
- no macOS-specific tools yet
- no Windows-specific tools yet
- no package-local tests yet

### 3. Streaming Adapter Skeleton

`packages/coding-agent/src/model-adapter.ts` currently provides:

- `CodingAgentStreamingModel`
- `CodingAgentResponseChunk`
- `createDummyStreamingCodingAgentModel()`

This dummy streaming model:

- converts the latest prompt into a plain text placeholder response
- emits `response.created`
- emits incremental `response.output_text.delta` chunks
- emits `response.completed`

It does not invoke the ReAct loop or tools.

Separately, `coding-agent/host-adapter` exports `createHostStreamingCodingAgentModel(...)`, which does run the ReAct loop through a minimal local heuristic step model and host tool executor.

## Current TUI Integration

`src/platform/coding-agent.ts` is now the integration seam between ConceptCode and the package.

Today it:

- converts `ChatTurnRequest` messages into `CodingAgentMessage[]`
- runs a `CodingAgentStreamingModel`
- maps its output into the existing `ChatTransport` event stream used by the prompt thread

Important boundary note:

- the prompt thread still depends only on `ChatTransport`
- the rest of the TUI does not yet know anything about ReAct tool calls
- this is good and should likely remain true unless there is a strong UI reason to surface tool activity explicitly

## Known Gaps

The current scaffold is intentionally incomplete.

Major gaps:

- no real provider integration
- no provider-backed streaming ReAct loop that interleaves assistant text and tool execution
- no structured tool call schema
- no tests for the new package
- `src/platform/chat.ts` and the dummy SSE server still exist and may now be transitional or redundant

## Recommended Next Steps

Recommended order for the next session:

1. Add tests.
   - package-local tests for `read_file`
   - package-local tests for `edit`
   - package-local tests for Linux host tools
   - app-level smoke coverage for the transport bridge

2. Replace the heuristic local step model.
   - Keep the current host tool executor boundary.
   - Add a provider-backed model that can choose tools intentionally.

3. Expand shared filesystem tools only if needed.
   - possibly `write_file`
   - possibly a structured search tool
   - avoid broad tool proliferation without a concrete need

4. Add support for other OSes.
   - `src/host-adapter/darwin.ts`
   - `src/host-adapter/windows.ts`

5. Decide what to do with `src/platform/chat.ts`.
   - Keep it temporarily for comparison and tests, or
   - retire it once the coding-agent transport becomes the only local dummy path.

## Suggested Resume Prompt

Use something like this in a fresh session:

`Continue the coding-agent package work from plans/coding-agent-package-roadmap.md. Read that file first, then implement the next sensible step with minimal changes and keep coding-agent functionality scoped into packages/coding-agent where appropriate.`
