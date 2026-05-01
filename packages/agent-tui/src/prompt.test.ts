import { describe, expect, test } from "bun:test"

import { findPromptReferenceAt, findPromptReferenceEndingAt, findPromptReferenceStartingAt, parsePromptReferences, resolvePromptReferences, type PromptReferenceSpec } from "./prompt"

type RefKind = "concept" | "file" | "slash"

const SPECS: PromptReferenceSpec<RefKind>[] = [
  { kind: "concept", symbol: "@", bodyPattern: /[a-zA-Z0-9_.-]/ },
  { kind: "file", symbol: "&", bodyPattern: /[^\s@&]/ },
  { kind: "slash", symbol: "/", bodyPattern: /[a-zA-Z0-9_.-]/, allowEmpty: true, requiresLeadingWhitespace: true },
]

describe("prompt reference helpers", () => {
  test("parses multiple prompt reference kinds with boundaries", () => {
    expect(parsePromptReferences("review @impl.views with &src/index.ts /fix", SPECS)).toEqual([
      { kind: "concept", symbol: "@", raw: "@impl.views", value: "impl.views", start: 7, end: 18 },
      { kind: "file", symbol: "&", raw: "&src/index.ts", value: "src/index.ts", start: 24, end: 37 },
      { kind: "slash", symbol: "/", raw: "/fix", value: "fix", start: 38, end: 42 },
    ])
    expect(parsePromptReferences("path/to/file and nested/foo", SPECS)).toEqual([])
    expect(parsePromptReferences(" /", SPECS)).toEqual([
      { kind: "slash", symbol: "/", raw: "/", value: "", start: 1, end: 2 },
    ])
  })

  test("finds references around the cursor", () => {
    const text = "Use @impl.views with &src/index.ts"
    expect(findPromptReferenceAt(text, 6, SPECS)?.raw).toBe("@impl.views")
    expect(findPromptReferenceEndingAt(text, 15, SPECS)?.raw).toBe("@impl.views")
    expect(findPromptReferenceStartingAt(text, 21, SPECS)?.raw).toBe("&src/index.ts")
  })

  test("resolves prompt references through pluggable resolvers", async () => {
    const resolved = await resolvePromptReferences({
      text: "Check @impl.views and &src/index.ts with /fix and @missing",
      specs: SPECS,
      context: {
        concepts: new Set(["impl.views"]),
        files: new Set(["src/index.ts"]),
      },
      resolvers: {
        concept: (match, context) => context.concepts.has(match.value) ? { kind: "concept", path: match.value } : null,
        file: (match, context) => context.files.has(match.value) ? { kind: "file", path: match.value } : null,
      },
    })

    expect(resolved.resolved).toEqual([
      { match: { kind: "concept", symbol: "@", raw: "@impl.views", value: "impl.views", start: 6, end: 17 }, result: { kind: "concept", path: "impl.views" } },
      { match: { kind: "file", symbol: "&", raw: "&src/index.ts", value: "src/index.ts", start: 22, end: 35 }, result: { kind: "file", path: "src/index.ts" } },
    ])
    expect(resolved.unresolved.map((match) => match.raw)).toEqual(["/fix", "@missing"])
  })
})
