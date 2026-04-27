# coding-agent

Reusable coding-agent scaffolding extracted from `ConceptCode`.

## Scope

This package currently owns early coding-agent primitives such as:

- shared message, tool, loop, and streaming types
- a minimal non-streaming ReAct loop
- a host-injected tool executor boundary
- a small helper for registering host-defined tools into an executor
- a reusable host adapter with shared filesystem tools and OS-specific runtime tools
- a dummy streaming adapter used for placeholder model behavior

It does not yet own provider-specific integrations, rich tool schemas, or a full streaming tool-execution loop.

## Main exports

- `coding-agent`
- `coding-agent/types`
- `coding-agent/react-loop`
- `coding-agent/model-adapter`
- `coding-agent/tool-executor`
- `coding-agent/host-adapter`

## Current package surface

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

`createToolExecutor(tools)` is the package's small convenience helper for registering host-defined tools into a `CodingAgentToolExecutor`.

`coding-agent/host-adapter` is the package's reusable local-runtime adapter surface. It currently provides cross-OS `read_file` and `edit` tools, detects the host OS, enables Linux-specific tools when supported binaries are present on `PATH`, and leaves unsupported OSes with only the shared host tools until explicit OS support is added.

Current shared cross-OS tools:

- `read_file`
  - reads a UTF-8 file inside the workspace
  - accepts `filePath`, `offset`, and `limit`
  - returns JSON text with `path`, `startLine`, `endLine`, `truncated`, `nextOffset`, and numbered `content`
- `edit`
  - performs a surgical exact-match replacement in one file
  - accepts `filePath`, `oldText`, `newText`, and optional `expectedOccurrences`
  - currently only supports `expectedOccurrences = 1`

Current Linux-specific tools:

- `bash`
- `find`
- `glob`

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

For example, a host can call `createHostTools(...)`, `createHostToolExecutor(...)`, or `createHostStreamingCodingAgentModel(...)` to wire cross-OS tools such as `read_file` and `edit` plus any supported OS-specific tools into the generic ReAct loop.

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

- add package-local tests
- tighten tool input typing and validation around `inputSchema`
- replace the heuristic host step model with provider-backed tool-calling
- decide whether temporary app-local chat transport code should remain
