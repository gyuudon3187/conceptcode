import { latestUserText, type ChatStreamEvent, type ChatTransport, type ChatTurnRequest } from "agent-chat"
import { parseConceptCodePromptReferences } from "../prompt/references"

type ParsedSseEvent = {
  event: string
  data: string
}

function createDummyResponseText(request: ChatTurnRequest): string {
  const latestUserMessage = latestUserText(request.messages)
  const references = parseConceptCodePromptReferences(latestUserMessage)
  const referencedConcepts = references.filter((match) => match.kind === "concept").map((match) => match.raw)
  const referencedFiles = references.filter((match) => match.kind === "file").map((match) => match.raw)
  const modeLabel = request.primaryAgentId === "plan" ? "plan" : request.primaryAgentId === "build" ? "build" : "conceptualize"
  const focusLine = referencedConcepts.length > 0
    ? `I am focusing on ${referencedConcepts.join(", ")}.`
    : "I am focusing on the concepts implied by your prompt."
  const fileLine = referencedFiles.length > 0
    ? `Relevant file references: ${referencedFiles.join(", ")}.`
    : "No explicit file references were provided."
  return [
    `Streaming dummy ${modeLabel} response ready for provider integration.`,
    focusLine,
    fileLine,
    latestUserMessage ? `Latest prompt: ${latestUserMessage}` : "Latest prompt was empty.",
    "This is coming from a minimal SSE-compatible local server so a future ChatGPT provider can slot into the same event path.",
  ].join("\n")
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

async function* parseSseStream(stream: ReadableStream<Uint8Array>): AsyncIterable<ParsedSseEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let separatorIndex = indexOfSseSeparator(buffer)
      while (separatorIndex >= 0) {
        const rawEvent = buffer.slice(0, separatorIndex)
        buffer = buffer.slice(separatorIndex + separatorLengthAt(buffer, separatorIndex))
        const parsed = parseSseEvent(rawEvent)
        if (parsed) {
          yield parsed
        }
        separatorIndex = indexOfSseSeparator(buffer)
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) {
      const parsed = parseSseEvent(buffer)
      if (parsed) {
        yield parsed
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function indexOfSseSeparator(buffer: string): number {
  const lfIndex = buffer.indexOf("\n\n")
  const crlfIndex = buffer.indexOf("\r\n\r\n")
  if (lfIndex < 0) return crlfIndex
  if (crlfIndex < 0) return lfIndex
  return Math.min(lfIndex, crlfIndex)
}

function separatorLengthAt(buffer: string, index: number): number {
  return buffer.startsWith("\r\n\r\n", index) ? 4 : 2
}

function parseSseEvent(rawEvent: string): ParsedSseEvent | null {
  const lines = rawEvent.split(/\r?\n/)
  let event = "message"
  const dataLines: string[] = []
  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim() || event
      continue
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart())
    }
  }
  if (dataLines.length === 0) return null
  return { event, data: dataLines.join("\n") }
}

export async function startDummyChatServer(): Promise<{ baseUrl: string; stop: () => Promise<void> }> {
  const server = Bun.serve({
    port: 0,
    routes: {
      "/health": () => new Response("ok"),
      "/chat": async (request) => {
        const payload = await request.json() as ChatTurnRequest
        const responseId = `resp_${crypto.randomUUID()}`
        const messageId = `msg_${crypto.randomUUID()}`
        const text = createDummyResponseText(payload)
        const encoder = new TextEncoder()
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(encoder.encode(sseFrame("response.created", {
              type: "response.created",
              responseId,
              messageId,
              role: "assistant",
              provider: "dummy-local",
            })))
            const chunks = text.match(/\S+\s*/g) ?? [text]
            for (const chunk of chunks) {
              await delay(35)
              controller.enqueue(encoder.encode(sseFrame("response.output_text.delta", {
                type: "response.output_text.delta",
                responseId,
                messageId,
                delta: chunk,
              })))
            }
            await delay(20)
            controller.enqueue(encoder.encode(sseFrame("response.completed", {
              type: "response.completed",
              responseId,
              messageId,
            })))
            controller.close()
          },
        })
        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          },
        })
      },
    },
  })
  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    stop: async () => {
      await server.stop(true)
    },
  }
}

export function createSseChatTransport(baseUrl: string): ChatTransport {
  return {
    async *streamTurn(request: ChatTurnRequest): AsyncIterable<ChatStreamEvent> {
      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      })
      if (!response.ok) {
        throw new Error(`Chat server returned ${response.status}`)
      }
      if (!response.body) {
        throw new Error("Chat server returned no stream body")
      }
      for await (const event of parseSseStream(response.body)) {
        const parsed = JSON.parse(event.data) as ChatStreamEvent
        yield parsed
      }
    },
  }
}
