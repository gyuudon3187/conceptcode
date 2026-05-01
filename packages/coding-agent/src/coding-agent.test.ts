import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"

import type { CodingAgentMessage, CodingAgentStreamingModel } from "./types"

import { createAgentFactory, createCodingAgent } from "./coding-agent"
import { definePrimaryAgent } from "./primary-agents"

const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe("createCodingAgent", () => {
  test("continues prior session history across run calls", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "coding-agent-workspace-"))
    const storageNamespace = `coding-agent-test-${basename(await mkdtemp(join(tmpdir(), "coding-agent-storage-")))}`
    cleanupPaths.push(workspaceRoot, join(process.cwd(), `.${storageNamespace}`))

    const calls: CodingAgentMessage[][] = []
    let runCount = 0
    const agent = createCodingAgent({
      workspaceRoot,
      storageNamespace,
      modelFactory: async (): Promise<CodingAgentStreamingModel> => ({
        async *run(messages: CodingAgentMessage[]) {
          calls.push(messages)
          runCount += 1
          const responseId = `resp_${runCount}`
          const messageId = `msg_${runCount}`
          yield { type: "response.created", responseId, messageId, provider: "test-model" }
          yield { type: "response.output_text.delta", responseId, messageId, delta: runCount === 1 ? "first reply" : "second reply" }
          yield { type: "response.completed", responseId, messageId }
        },
      }),
      defaultPrimaryAgentId: "build",
      sessionBucketKey: workspaceRoot,
    })

    const firstRun = await agent.run("first request")
    const secondRun = await agent.run("second request", firstRun.sessionId)

    expect(firstRun.finalMessage).toBe("first reply")
    expect(secondRun.finalMessage).toBe("second reply")
    expect(secondRun.sessionId).toBe(firstRun.sessionId)
    expect(calls).toHaveLength(2)
    expect(calls[1]?.[0]).toEqual({ role: "user", content: "first request" })
    expect(calls[1]?.[1]).toEqual({ role: "assistant", content: "first reply" })
    expect(calls[1]?.[2]?.content).toContain("[PRIMARY AGENT: build]")
    expect(calls[1]?.[2]?.content).toContain("second request")
  })

  test("factory resolves built-in and host primary agents by id", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "coding-agent-factory-workspace-"))
    const storageNamespace = `coding-agent-factory-test-${basename(await mkdtemp(join(tmpdir(), "coding-agent-factory-storage-")))}`
    cleanupPaths.push(workspaceRoot, join(process.cwd(), `.${storageNamespace}`))
    const conceptualize = definePrimaryAgent({
      id: "conceptualize",
      instructions: ["Focus on concept-graph structure."],
    })
    const calls: CodingAgentMessage[][] = []
    const factory = createAgentFactory<"plan" | "build" | "conceptualize">({
      workspaceRoot,
      storageNamespace,
      primaryAgents: [conceptualize],
      modelFactory: async (): Promise<CodingAgentStreamingModel> => ({
        async *run(messages: CodingAgentMessage[]) {
          calls.push(messages)
          yield { type: "response.created", responseId: "resp_1", messageId: "msg_1", provider: "test-model" }
          yield { type: "response.output_text.delta", responseId: "resp_1", messageId: "msg_1", delta: "ok" }
          yield { type: "response.completed", responseId: "resp_1", messageId: "msg_1" }
        },
      }),
      prepareTurn: ({ primaryAgentId }) => ({ primaryAgentId }),
    })

    const agent = factory.createCodingAgent({ defaultPrimaryAgentId: "plan", sessionBucketKey: workspaceRoot })
    await agent.run({ prompt: "analyze first", primaryAgentId: "plan" })
    await agent.run({ prompt: "reshape the graph", primaryAgentId: "conceptualize" })

    expect(calls[0]?.at(-1)?.content).toContain("[PRIMARY AGENT: plan]")
    expect(calls[1]?.at(-1)?.content).toContain("[PRIMARY AGENT: conceptualize]")
  })

  test("agent-level system prompt is prepended to every run", async () => {
    const calls: CodingAgentMessage[][] = []
    const factory = createAgentFactory<"build">({
      modelFactory: async (): Promise<CodingAgentStreamingModel> => ({
        async *run(messages: CodingAgentMessage[]) {
          calls.push(messages)
          yield { type: "response.created", responseId: "resp_1", messageId: "msg_1", provider: "test-model" }
          yield { type: "response.output_text.delta", responseId: "resp_1", messageId: "msg_1", delta: "ok" }
          yield { type: "response.completed", responseId: "resp_1", messageId: "msg_1" }
        },
      }),
    })

    const agent = factory.createCodingAgent({
      defaultPrimaryAgentId: "build",
      systemPrompt: "Stay narrowly focused.",
    })
    await agent.run("inspect the module")

    expect(calls[0]?.[0]).toEqual({ role: "system", content: "Stay narrowly focused." })
  })
})
