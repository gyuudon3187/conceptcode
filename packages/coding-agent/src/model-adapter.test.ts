import { describe, expect, test } from "bun:test"

import { streamTextResponse } from "./model-adapter"

describe("model adapter helpers", () => {
  test("streams plain text as coding-agent response chunks", async () => {
    const events = []

    for await (const event of streamTextResponse("hello world", "test-provider")) {
      events.push(event)
    }

    expect(events).toHaveLength(4)
    expect(events[0]).toMatchObject({ type: "response.created", provider: "test-provider" })
    expect(events[1]).toMatchObject({ type: "response.output_text.delta", delta: "hello " })
    expect(events[2]).toMatchObject({ type: "response.output_text.delta", delta: "world" })
    expect(events[3]).toMatchObject({ type: "response.completed" })

    const created = events[0]
    expect(events[1]).toMatchObject({ responseId: created.responseId, messageId: created.messageId })
    expect(events[2]).toMatchObject({ responseId: created.responseId, messageId: created.messageId })
    expect(events[3]).toMatchObject({ responseId: created.responseId, messageId: created.messageId })
  })
})
