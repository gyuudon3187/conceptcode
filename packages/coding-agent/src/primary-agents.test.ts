import { describe, expect, test } from "bun:test"

import {
  applyPrimaryAgentToMessages,
  BUILD_PRIMARY_AGENT,
  definePrimaryAgent,
  parsePrimaryAgentPrompt,
  PLAN_PRIMARY_AGENT,
} from "./primary-agents"

describe("primary agents", () => {
  test("injects the plan primary agent into the latest user message", () => {
    const messages = applyPrimaryAgentToMessages([
      { role: "user", content: "first request" },
      { role: "assistant", content: "intermediate reply" },
      { role: "user", content: "add a planning step" },
    ], PLAN_PRIMARY_AGENT)

    expect(messages[0]?.content).toBe("first request")
    expect(messages[2]?.content).toContain("[PRIMARY AGENT: plan]")
    expect(messages[2]?.content).toContain("[USER PROMPT]")
    expect(messages[2]?.content).toContain("add a planning step")
  })

  test("injects the build primary agent into the latest user message", () => {
    const messages = applyPrimaryAgentToMessages([
      { role: "user", content: "implement the fix" },
    ], BUILD_PRIMARY_AGENT)

    expect(messages[0]?.content).toContain("[PRIMARY AGENT: build]")
    expect(messages[0]?.content).toContain("implement the fix")
  })

  test("parses a primary-agent envelope back to the raw prompt", () => {
    const conceptualize = definePrimaryAgent({
      id: "conceptualize",
      instructions: ["Focus on concept-graph updates."],
    })
    const content = applyPrimaryAgentToMessages([
      { role: "user", content: "reshape the graph" },
    ], conceptualize)[0]?.content ?? ""

    expect(parsePrimaryAgentPrompt(content)).toEqual({
      agentId: "conceptualize",
      prompt: "reshape the graph",
    })
  })
})
