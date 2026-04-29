import { describe, expect, test } from "bun:test"

import { PLAN_PRIMARY_AGENT, applyPrimaryAgentToMessages } from "../primary-agents"
import { createHostStepModel } from "./shared"

describe("host step model", () => {
  test("does not infer mutating tool calls from the plan primary agent envelope", async () => {
    const model = createHostStepModel([
      { name: "edit_file", description: "Edit files" },
      { name: "shell", description: "Run shell commands" },
    ], "Available tools")

    const messages = applyPrimaryAgentToMessages([
      { role: "user", content: 'fix the bug by editing "src/app.ts" "old" "new"' },
    ], PLAN_PRIMARY_AGENT)
    const turn = await model.complete(messages)

    expect(turn.toolCalls).toEqual([])
    expect(turn.done).toBe(true)
  })
})
