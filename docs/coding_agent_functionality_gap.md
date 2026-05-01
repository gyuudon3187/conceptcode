# `coding-agent` Functionality Gap

This document maps the current `packages/coding-agent` scaffold to the work still required for it to feel like a modern coding agent rather than a local prototype.

The goal here is not "add every possible feature." The goal is practical parity with tools such as OpenCode, Claude Code, Codex CLI, Aider, Cursor Agent, or similar host-backed coding agents:

- real model integration
- reliable tool calling
- approvals and safety boundaries
- long-running multi-step execution
- usable streaming and observability
- enough context management and recovery to survive real repository work

## Current State

`packages/coding-agent` already has good foundations:

- a reusable agent factory and session-aware runner in `packages/coding-agent/src/coding-agent.ts`
- primary-agent profiles in `packages/coding-agent/src/primary-agents.ts`
- scoped markdown context loading in `packages/coding-agent/src/context-files.ts`
- a generic tool registry with schema validation, permissions, and audit logging in `packages/coding-agent/src/tool-registry.ts`
- local host tools for reads, writes, patching, search, and shell in `packages/coding-agent/src/host-adapter/`
- a minimal step loop in `packages/coding-agent/src/react-loop.ts`

What it does not yet have is the part that makes modern coding agents actually useful day to day: a production tool-calling model loop with strong runtime controls.

## Bottom Line

The package is currently a solid scaffold, not yet a fully functional coding agent.

The biggest blocker is that the default runtime still depends on placeholder model behavior:

- `createDummyStreamingCodingAgentModel()` emits canned text in `packages/coding-agent/src/model-adapter.ts`
- `createHostStreamingCodingAgentModel()` in `packages/coding-agent/src/host-adapter/index.ts` wraps a heuristic local step model
- `createHostStepModel()` in `packages/coding-agent/src/host-adapter/shared.ts` infers tool calls from regex-like prompt matching rather than a real provider response

Until that changes, the agent cannot reliably inspect, edit, test, recover, or continue through complex repository tasks the way modern coding agents do.

## Priority 0: Real Provider-Backed Tool Calling

This is the must-have missing piece.

### What exists now

- `runReactCodingAgent(...)` can loop over assistant turns and tool calls.
- The loop expects a `CodingAgentModel.complete(messages)` implementation that returns `{ message, toolCalls, done }`.
- The streaming side only emits text chunks plus created/completed/error events.

### What is still missing

- an adapter for at least one real provider with tool-calling support
- conversion between package message types and provider request/response formats
- structured parsing of provider tool calls into `CodingAgentToolCall[]`
- support for provider stop reasons such as `tool_calls`, `max_tokens`, `content_filter`, and ordinary completion
- retries and error handling for malformed tool arguments or transient provider failures
- provider-specific token, usage, and model metadata surfaced through package-owned events

### Why this matters

Without this, the package is not actually model-driven. It is only exercising the shell around a model boundary.

### Recommended package work

- keep provider adapters inside `packages/coding-agent` because model orchestration is core package scope
- add one real adapter first, then generalize only after the contract settles
- keep the provider wire format behind package-owned adapter interfaces so host apps still depend on generic types

## Priority 1: Replace The Toy Step Loop With A Production Agent Loop

`packages/coding-agent/src/react-loop.ts` is intentionally tiny. It is useful as a scaffold, but too weak for real coding-agent work.

### Current limitations

- tool calls run strictly sequentially
- the loop has no notion of partial assistant output before tool calls
- there is no stop-reason model beyond `done` or `toolCalls.length === 0`
- there is no recovery path when a tool fails or returns invalid data
- max-step handling returns a hard-coded message instead of a structured stop result
- there is no budget tracking for tokens, runtime, or tool count

### Missing production features

- explicit turn states: thinking, tool selection, tool execution, completion, interruption, error
- structured stop reasons and surfaced finish metadata
- optional parallel tool execution when the provider requests independent calls
- automatic repair loops for invalid tool arguments
- host-visible limits for step count, wall-clock time, bytes read, bytes written, and shell runtime
- cancellation through `AbortSignal` across model calls and tool execution
- resumable runs after interruption or approval wait states

### Recommended package work

- expand the core loop contract rather than hiding more logic in the host adapter
- keep a non-streaming core runner and add a streaming orchestration layer on top of it

## Priority 2: Real Streaming Events, Not Just Text Deltas

Modern coding agents do not stream only assistant text. They also stream what the agent is doing.

### Current state

`CodingAgentResponseChunk` in `packages/coding-agent/src/types.ts` only supports:

- `response.created`
- `response.output_text.delta`
- `response.completed`
- `response.error`

### Missing event coverage

- assistant tool-call proposals
- tool execution started/completed/failed events
- approval-required events
- usage and token accounting events
- step started/completed events
- run interrupted/cancelled events
- model fallback or retry events

### Why this matters

The current event model is too narrow for a TUI, CLI, or IDE host to present the agent as trustworthy. Modern agent UX depends on showing the exact chain of actions.

### Recommended package work

- extend package-owned events before building more host UX
- keep provider events translated into package events rather than leaking raw provider payloads

## Priority 3: Human Approval And Interruptibility

The current permission model is useful, but it is still only a local allow/deny policy.

### What exists now

- `DefaultPermissionPolicy` classifies tool and shell actions in `packages/coding-agent/src/host-adapter/permissions.ts`
- denied actions can indicate `requiresApproval`

### What is still missing

- a first-class approval handshake in the agent loop
- the ability for a run to pause and yield an approval request instead of only failing a tool call
- a resume API after approval or denial
- host-facing approval payloads that explain command, paths, risk class, and why approval is needed
- user interruption during long-running commands or loops

### Why this matters

Modern coding agents are not fully autonomous all the time. They pause for risky actions, let the user inspect intent, and then continue the same run cleanly.

### Recommended boundary

- approval policy and UX belong to the host app
- approval lifecycle support belongs in this package

## Priority 4: Context Management For Real Repositories

The package already has scoped markdown context, which is a strong start. That alone is not enough for large repositories.

### Missing capabilities

- message compaction or summarization when history gets too large
- automatic pruning of stale tool output from old turns
- explicit distinction between conversation history, durable memory, and ephemeral working context
- selective replay of only the tool results needed for the next turn
- model-aware context budgeting so tool output does not silently overwhelm the next request
- first-class support for attaching read files, search results, and generated summaries as structured context instead of only raw message text

### Why this matters

Modern coding agents stay useful over long sessions because they manage context aggressively. Without that, performance and reliability collapse as runs grow.

## Priority 5: Better Tooling Semantics And Tool Surface

The native host tools are already the most mature part of this package. They still need a few upgrades for parity.

### Existing strengths

- read-before-write protection
- optimistic conflict detection using file snapshots
- workspace-bound path normalization
- audit logging and schema validation

### Missing capabilities

- first-class web fetch or HTTP tools
- archive, image, and PDF-aware reads where supported by the host
- richer patch metadata so the model can understand exactly what changed
- background shell jobs or streaming shell output for long commands
- better git-oriented structured tools if the host wants modern commit/branch/PR workflows without shell parsing
- tool result chunking for very large outputs
- explicit machine-readable error categories rather than plain text failure messages

### Boundary note

Not every tool should live in this package. But the registry and event model should be strong enough that hosts can add these cleanly.

## Priority 6: Stronger Session And Run State Model

`packages/coding-agent/src/coding-agent.ts` persists message history, which is useful, but modern agents usually need more than chat persistence.

### Missing capabilities

- persisted run metadata such as model name, timing, usage, and stop reason
- persisted tool traces attached to a run
- the ability to resume an interrupted tool-bearing run rather than only continue the conversation textually
- explicit run ids separate from chat message ids
- session migration/versioning for future format changes

### Why this matters

Once approvals, retries, and long-running execution exist, chat-only persistence stops being enough.

## Priority 7: Observability And Debuggability

Modern coding agents need to be inspectable when they fail.

### What exists now

- tool audit hooks exist via `ToolAuditSink`

### What is still missing

- model request/response tracing hooks
- structured run timeline data
- easy-to-consume debug snapshots for failed runs
- metrics for tool usage, token usage, error rates, and approval frequency
- a stable event log that hosts can render or save without scraping assistant text

## Priority 8: Reliability Hardening

The package has tests around tools and some runner behavior, but parity work will require much deeper hardening.

### Missing test coverage

- provider adapter contract tests
- loop tests for retries, cancellations, approvals, and malformed tool calls
- long-session context compaction tests
- concurrency tests for parallel tools and overlapping file changes
- streaming event ordering tests
- snapshot tests for persisted run/session formats

### Recommended verification bar

- `bun run typecheck`
- `bun test`
- targeted end-to-end tests with a fake provider that emits realistic tool-call sequences

## Suggested Implementation Order

1. Build one real provider adapter with tool-calling support.
2. Expand the core run loop to handle stop reasons, retries, cancellations, and approval pauses.
3. Extend streaming events to include tool, approval, usage, and lifecycle data.
4. Add resumable approval flow and richer persisted run state.
5. Add context compaction and budgeting.
6. Add any extra tools or host integrations that still feel missing after the core loop is reliable.

## What Can Stay Out Of Scope For Now

These are useful, but they are not required for basic modern-agent parity:

- multi-agent delegation
- cloud execution sandboxes
- cross-repo memory
- autonomous background task queues
- provider abstraction for many vendors on day one

## Practical Definition Of "Functional"

I would consider `packages/coding-agent` functionally competitive once it can do all of the following reliably:

- accept a real provider-backed prompt stream
- choose and call tools from model output without heuristic prompt parsing
- pause for approval on risky actions and resume the same run
- stream visible tool activity and final text to the host
- survive multi-step inspect/edit/test/fix loops in a real repository
- manage context well enough for longer sessions
- persist enough run state that failures and interrupted runs are understandable

Until then, the package is best described as a reusable coding-agent foundation rather than a finished coding agent.
