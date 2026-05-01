import { afterAll, describe, expect, test } from "bun:test"

import type { ChatStreamEvent } from "agent-chat"
import { createSseChatTransport, startDummyChatServer } from "./platform/chat"

const dummyServer = await startDummyChatServer()

afterAll(async () => {
  await dummyServer.stop()
})

describe("dummy chat transport", () => {
  test("streams assistant events and deltas in order", async () => {
    const transport = createSseChatTransport(dummyServer.baseUrl)
    const events: ChatStreamEvent[] = []

    for await (const event of transport.streamTurn({
      primaryAgentId: "build",
      messages: [{ role: "user", text: "test @impl.views.layout &src/index.ts" }],
    })) {
      events.push(event)
    }

    expect(events.length).toBeGreaterThan(2)
    expect(events[0]?.type).toBe("response.created")
    expect(events.at(-1)?.type).toBe("response.completed")

    const deltas = events.filter((event): event is Extract<ChatStreamEvent, { type: "response.output_text.delta" }> => event.type === "response.output_text.delta")
    expect(deltas.length).toBeGreaterThan(0)

    const messageIds = new Set(events.map((event) => event.messageId))
    expect(messageIds.size).toBe(1)

    const combinedText = deltas.map((event) => event.delta).join("")
    expect(combinedText).toContain("Streaming dummy build response")
    expect(combinedText).toContain("@impl.views.layout")
    expect(combinedText).toContain("&src/index.ts")
    expect(combinedText).toContain("\n")
  })

  test("includes conceptualize mode in dummy response", async () => {
    const transport = createSseChatTransport(dummyServer.baseUrl)
    const deltas: string[] = []

    for await (const event of transport.streamTurn({
      primaryAgentId: "conceptualize",
      messages: [{ role: "user", text: "reshape @impl.views and update the graph diff" }],
    })) {
      if (event.type === "response.output_text.delta") {
        deltas.push(event.delta)
      }
    }

    expect(deltas.join("")).toContain("Streaming dummy conceptualize response")
  })
})
