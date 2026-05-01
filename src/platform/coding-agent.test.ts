import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { CodingAgentMessage, CodingAgentStreamingModel } from "coding-agent"

import { createCodingAgentChatTransport } from "./coding-agent"

const workspaces: string[] = []

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "coding-agent-transport-"))
  workspaces.push(workspace)
  return workspace
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })))
})

function captureModel(calls: CodingAgentMessage[][]): CodingAgentStreamingModel {
  return {
    async *run(messages: CodingAgentMessage[]) {
      calls.push(messages)
      yield { type: "response.created", responseId: "resp_1", messageId: "msg_1", provider: "test-model" }
      yield { type: "response.output_text.delta", responseId: "resp_1", messageId: "msg_1", delta: "ok" }
      yield { type: "response.completed", responseId: "resp_1", messageId: "msg_1" }
    },
  }
}

describe("coding-agent transport", () => {
  test("injects the plan primary agent into the latest user prompt", async () => {
    const calls: CodingAgentMessage[][] = []
    const transport = createCodingAgentChatTransport(async () => captureModel(calls))

    for await (const _event of transport.streamTurn({
      primaryAgentId: "plan",
      messages: [
        { role: "user", text: "first request" },
        { role: "assistant", text: "intermediate reply" },
        { role: "user", text: "add a planning step to coding-agent" },
      ],
    })) {
      // exhaust the stream
    }

    expect(calls).toHaveLength(1)
    expect(calls[0]?.[0]?.content).toBe("first request")
    expect(calls[0]?.[2]?.content).toContain("[PRIMARY AGENT: plan]")
    expect(calls[0]?.[2]?.content).toContain("Do not edit files")
    expect(calls[0]?.[2]?.content).toContain("add a planning step to coding-agent")
  })

  test("injects the build primary agent into the latest user prompt", async () => {
    const calls: CodingAgentMessage[][] = []
    const transport = createCodingAgentChatTransport(async () => captureModel(calls))

    for await (const _event of transport.streamTurn({
      primaryAgentId: "build",
      messages: [{ role: "user", text: "implement the fix" }],
    })) {
      // exhaust the stream
    }

    expect(calls).toHaveLength(1)
    expect(calls[0]?.[0]?.content).toContain("[PRIMARY AGENT: build]")
    expect(calls[0]?.[0]?.content).toContain("implement the fix")
  })

  test("injects the conceptualize primary agent into the latest user prompt", async () => {
    const calls: CodingAgentMessage[][] = []
    const transport = createCodingAgentChatTransport(async () => captureModel(calls))

    for await (const _event of transport.streamTurn({
      primaryAgentId: "conceptualize",
      messages: [{ role: "user", text: "reshape the concept graph" }],
    })) {
      // exhaust the stream
    }

    expect(calls).toHaveLength(1)
    expect(calls[0]?.[0]?.content).toContain("[PRIMARY AGENT: conceptualize]")
    expect(calls[0]?.[0]?.content).toContain("reshape the concept graph")
  })

  test("injects scoped eager context and lazy descriptions from .coding-agent/contexts", async () => {
    const workspace = await createWorkspace()
    await mkdir(join(workspace, ".coding-agent", "contexts"), { recursive: true })
    await mkdir(join(workspace, "src", ".coding-agent", "contexts"), { recursive: true })
    await mkdir(join(workspace, "src", "feature"), { recursive: true })
    await writeFile(join(workspace, ".coding-agent", "contexts", "repo.md"), "# Repo Rules\nKeep patches small.\n")
    await writeFile(join(workspace, "src", ".coding-agent", "contexts", "api.md"), [
      "---",
      "description: Read this when changing API handlers.",
      "---",
      "# API Details",
      "Hidden body",
      "",
    ].join("\n"))

    const calls: CodingAgentMessage[][] = []
    const transport = createCodingAgentChatTransport({
      modelFactory: async () => captureModel(calls),
      workspaceRoot: workspace,
      cwd: join(workspace, "src"),
    })

    for await (const _event of transport.streamTurn({
      primaryAgentId: "build",
      messages: [{ role: "user", text: "implement the fix in &src/feature/file.ts" }],
    })) {
      // exhaust the stream
    }

    expect(calls).toHaveLength(1)
    expect(calls[0]?.[0]?.content).toContain("[PRIMARY AGENT: build]")
    expect(calls[0]?.[0]?.content).toContain("[SCOPED CONTEXT]")
    expect(calls[0]?.[0]?.content).toContain("Keep patches small.")
    expect(calls[0]?.[0]?.content).toContain("`src/.coding-agent/contexts/api.md`: Read this when changing API handlers.")
    expect(calls[0]?.[0]?.content).not.toContain("Hidden body")
    expect(calls[0]?.[0]?.content).toContain("[USER REQUEST]")
  })

  test("treats /memory as a normal prompt while still injecting scoped context", async () => {
    const workspace = await createWorkspace()
    await mkdir(join(workspace, ".coding-agent", "contexts"), { recursive: true })
    await mkdir(join(workspace, "src", ".coding-agent", "contexts"), { recursive: true })
    await mkdir(join(workspace, "src", "feature"), { recursive: true })
    await writeFile(join(workspace, ".coding-agent", "contexts", "repo.md"), "# Repo Rules\nKeep patches small.\n")
    await writeFile(join(workspace, "src", ".coding-agent", "contexts", "api.md"), [
      "---",
      "description: Read this when changing API handlers.",
      "---",
      "# API Details",
      "Hidden body",
      "",
    ].join("\n"))

    const calls: CodingAgentMessage[][] = []
    const transport = createCodingAgentChatTransport({
      modelFactory: async () => captureModel(calls),
      workspaceRoot: workspace,
      cwd: join(workspace, "src"),
    })

    for await (const _event of transport.streamTurn({
      primaryAgentId: "build",
      messages: [{ role: "user", text: "/memory &src/feature/file.ts" }],
    })) {
      // exhaust the stream
    }

    expect(calls).toHaveLength(1)
    expect(calls[0]?.[0]?.content).toContain("[SCOPED CONTEXT]")
    expect(calls[0]?.[0]?.content).toContain("Keep patches small.")
    expect(calls[0]?.[0]?.content).toContain("`src/.coding-agent/contexts/api.md`: Read this when changing API handlers.")
    expect(calls[0]?.[0]?.content).toContain("[USER REQUEST]")
    expect(calls[0]?.[0]?.content).toContain("/memory &src/feature/file.ts")
  })
})
