# coding-agent

Reusable coding-agent scaffolding extracted from `ConceptCode`.

## Scope

This package currently owns coding-agent primitives such as:

- shared message, tool, loop, and streaming types
- a minimal non-streaming ReAct loop
- a host-injected tool executor boundary
- a centralized registry for structured tools
- a reusable host adapter with native filesystem/search tools plus a guarded shell escape hatch
- a primary-agent envelope for built-in and host-defined agent profiles
- a dummy streaming adapter used for placeholder model behavior

It does not yet own provider-specific integrations or a full streaming tool-execution loop.

## Main exports

- `coding-agent`
- `coding-agent/types`
- `coding-agent/react-loop`
- `coding-agent/model-adapter`
- `coding-agent/tool-executor`
- `coding-agent/host-adapter`

## Current package surface

### Primary agents

`coding-agent` owns the contract for attaching a primary agent to the latest user turn.

- Built-ins: `PLAN_PRIMARY_AGENT`, `BUILD_PRIMARY_AGENT`
- Host-defined plugins: `definePrimaryAgent({ id, instructions })`
- Message shaping: `applyPrimaryAgentToMessages(messages, agent)`

The current wire contract is a package-owned envelope embedded into the latest user message, which lets package internals recover both the agent id and the raw user prompt consistently.

Example:

```ts
import {
  applyPrimaryAgentToMessages,
  definePrimaryAgent,
  PLAN_PRIMARY_AGENT,
} from "coding-agent"

const conceptualize = definePrimaryAgent({
  id: "conceptualize",
  instructions: [
    "Focus on concept-graph structure and metadata updates.",
    "Prefer graph-oriented changes and avoid unrelated source-code edits unless explicitly requested.",
  ],
})

const planMessages = applyPrimaryAgentToMessages([{ role: "user", content: "investigate the bug" }], PLAN_PRIMARY_AGENT)
const graphMessages = applyPrimaryAgentToMessages([{ role: "user", content: "reshape the graph" }], conceptualize)
```

### ReAct loop

`runReactCodingAgent(options)` in `coding-agent/react-loop` currently:

- builds the initial `system` and `user` messages
- calls a step-based model via `model.complete(messages)`
- records assistant steps
- executes requested tool calls sequentially through `toolExecutor.runTool(call)`
- appends tool results back into the conversation
- stops when the model is done, emits no tool calls, or reaches `maxSteps`

This is a control-flow scaffold, not yet a provider-backed production agent loop.

### Tool execution boundary

The package core now depends on a host-injected `CodingAgentToolExecutor`.

That executor:

- lists available tools for the host/model boundary
- runs tool calls by name
- keeps host-runtime behavior out of the core ReAct loop

`createToolRegistry(tools, context)` is the central registration path for structured tools. `createToolExecutor(...)` remains as a convenience adapter that can wrap a registry-backed tool set into the existing `CodingAgentToolExecutor` interface.

`coding-agent/host-adapter` is the package's reusable local-runtime adapter surface. It now provides:

- a shared `ToolContext`
- a filesystem backend abstraction
- native file tools for common reads/writes/patches
- structured `glob` and `grep` tools that prefer ripgrep behind the scenes
- a structured `shell` tool for builds, tests, package managers, git, and project scripts
- centralized mode-based permissions and audit logging

Current host tools:

- `read_file`
- `read_many`
- `list_dir`
- `tree`
- `stat`
- `write_file`
- `edit_file`
- `apply_patch`
- `glob`
- `grep`
- `shell`

Example:

```ts
import { createToolExecutor, type CodingAgentTool } from "coding-agent"

const tools: CodingAgentTool[] = [
  {
    name: "read_note",
    description: "Read a note by id",
    inputSchema: { type: "object", properties: { noteId: { type: "string" } }, required: ["noteId"] },
    async run(input) {
      const noteId = String(input.noteId ?? "")
      return { toolName: "read_note", output: `note:${noteId}` }
    },
  },
]

const toolExecutor = createToolExecutor(tools)
```

The host can also implement `CodingAgentToolExecutor` directly when it needs dynamic tools, remote execution, authorization checks, or runtime-specific behavior.

For example, a host can call `createHostToolRegistry(...)`, `createHostTools(...)`, `createHostToolExecutor(...)`, or `createHostStreamingCodingAgentModel(...)` to wire the built-in native tools into the generic ReAct loop.

## Tooling architecture

### Add a new tool

1. Define a `ToolDef<Input, Meta>` with `id`, `description`, `schema`, and `execute(input, ctx)`.
2. Use `ToolContext` instead of reading process-global state directly.
3. If the tool touches paths, provide `getPathIntents(...)` so the registry can apply centralized permission checks and audit logging.
4. Return a `ToolResult` with concise `text` plus structured `metadata`.
5. Register the tool through `createToolRegistry(...)` or add it to the host tool list in `host-adapter/index.ts`.

### Native tools vs shell

Use native tools for:

- reading files
- listing directories
- writing files
- exact text edits
- patch application
- path and content search

Use `shell` only for:

- tests
- builds
- package-manager commands
- git commands
- project-specific scripts that do not map cleanly to a structured tool

The host adapter does not use shell as the default implementation for file IO or search.

### Binary discovery

Structured search tools hide backend selection from the model:

1. Prefer a harness-managed pinned `rg` path from `ToolContext.environment.managedBinaries.rg`.
2. Fall back to system `rg` on `PATH` when allowed.
3. Fall back to native filesystem traversal if ripgrep is unavailable.

The model-facing tool contract stays the same regardless of backend.

### Permissions and modes

The default host permission policy supports these modes:

- `read-only`: native read/search/stat tools allowed, writes denied, shell restricted
- `build-edit`: native edits allowed in-workspace, build/test/package shell commands allowed, destructive or unknown shell commands denied pending approval
- `autonomous`: broader execution, but destructive/global/out-of-workspace actions still denied by default

Workspace-bound path normalization, tool gating, shell classification, and audit logging are centralized around the registry and `ToolContext` helpers rather than duplicated per tool.

### Streaming adapter

`coding-agent/model-adapter` currently exports `createDummyStreamingCodingAgentModel()`.

The adapter currently:

- derives a placeholder response from the latest user prompt
- emits `response.created`
- streams `response.output_text.delta` chunks
- emits `response.completed`

It does not yet invoke the ReAct loop or execute tools.

Separately, `coding-agent/host-adapter` also exports `createHostStreamingCodingAgentModel(...)`, which runs the package ReAct loop with a minimal local heuristic step model plus host tools.

## Expected integration style

Host apps should:

- keep app-specific chat transport wiring outside this package
- adapt app chat messages into `CodingAgentMessage[]`
- inject models and a `CodingAgentToolExecutor` from the host boundary
- define their own tool set and runtime behavior instead of relying on package-owned filesystem tools
- treat this package as the owner of generic coding-agent control flow, not ConceptCode-specific UI behavior

## Known follow-up work

- replace the heuristic host step model with provider-backed tool-calling
- expand shell policy from heuristic classification to stronger host-level approval flows when the surrounding app supports them
- add more host backends beyond the local filesystem
