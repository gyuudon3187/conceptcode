import type { CodingAgentMessage, CodingAgentRunOptions, CodingAgentRunResult, CodingAgentStep, CodingAgentToolCall } from "./types"

async function runToolCalls(
  calls: CodingAgentToolCall[],
  options: Pick<CodingAgentRunOptions, "toolExecutor">,
  messages: CodingAgentMessage[],
  steps: CodingAgentStep[],
): Promise<void> {
  for (const call of calls) {
    const result = await options.toolExecutor.runTool(call)
    messages.push({ role: "tool", toolName: result.toolName, content: result.output })
    steps.push({ type: "tool", toolName: result.toolName, input: call.input, output: result.output })
  }
}

export async function runReactCodingAgent(options: CodingAgentRunOptions): Promise<CodingAgentRunResult> {
  const messages: CodingAgentMessage[] = [...options.messages]
  const steps: CodingAgentStep[] = []
  const maxSteps = Math.max(1, options.maxSteps ?? 8)

  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
    const turn = await options.model.complete(messages)
    messages.push({ role: "assistant", content: turn.message })
    steps.push({ type: "assistant", content: turn.message })

    if (turn.done || turn.toolCalls.length === 0) {
      return { steps, finalMessage: turn.message }
    }

    await runToolCalls(turn.toolCalls, options, messages, steps)
  }

  return {
    steps,
    finalMessage: "Agent stopped after reaching the maximum step count.",
  }
}
