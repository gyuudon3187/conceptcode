import { describe, expect, test } from "bun:test"

import type { CodingAgentMessage, CodingAgentStreamingModel } from "coding-agent"

import { createCodingAgentChatTransport } from "./coding-agent"

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
})
