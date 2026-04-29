import type { CodingAgentMessage, CodingAgentResponseChunk, CodingAgentStreamingModel } from "./types"
import { parsePrimaryAgentPrompt } from "./primary-agents"

function latestUserPrompt(messages: CodingAgentMessage[]): string {
  return [...messages].reverse().find((message) => message.role === "user")?.content.trim() ?? ""
}

function createDummyAgentResponse(messages: CodingAgentMessage[]): string {
  const primaryAgentPrompt = parsePrimaryAgentPrompt(latestUserPrompt(messages))
  const prompt = primaryAgentPrompt.prompt
  const referencedConcepts = [...prompt.matchAll(/@[a-zA-Z0-9_.-]+/g)].map((match) => match[0])
  const referencedFiles = [...prompt.matchAll(/&[^\s&]+/g)].map((match) => match[0])
  return [
    "Coding-agent scaffold ready for provider integration.",
    primaryAgentPrompt.agentId ? `Primary agent: ${primaryAgentPrompt.agentId}.` : null,
    referencedConcepts.length > 0 ? `Concept focus: ${referencedConcepts.join(", ")}.` : "Concept focus inferred from the prompt.",
    referencedFiles.length > 0 ? `File references: ${referencedFiles.join(", ")}.` : "No file references were provided.",
    prompt ? `Latest prompt: ${prompt}` : "Latest prompt was empty.",
    "This response currently comes from the local coding-agent package rather than a provider-backed tool loop.",
  ].filter(Boolean).join("\n")
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createDummyStreamingCodingAgentModel(): CodingAgentStreamingModel {
  return {
    async *run(messages: CodingAgentMessage[]): AsyncIterable<CodingAgentResponseChunk> {
      const responseId = `resp_${crypto.randomUUID()}`
      const messageId = `msg_${crypto.randomUUID()}`
      yield { type: "response.created", responseId, messageId, provider: "coding-agent-dummy" }
      const text = createDummyAgentResponse(messages)
      const chunks = text.match(/\S+\s*/g) ?? [text]
      for (const chunk of chunks) {
        await delay(35)
        yield { type: "response.output_text.delta", responseId, messageId, delta: chunk }
      }
      await delay(20)
      yield { type: "response.completed", responseId, messageId }
    },
  }
}
