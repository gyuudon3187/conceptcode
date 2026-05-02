import type { PromptReferenceMatch, PromptReferenceSpec, PromptReferenceResolverMap } from "agent-tui/prompt"

export type ConceptCodePromptReferenceKind = "concept" | "slash"

export type ConceptCodePromptSuggestionState = {
  uiMode: "plan" | "build" | "conceptualize"
  nodes: Map<string, { summary: string }>
}

export type ConceptCodePromptSuggestionEntry = {
  value: string
  description?: string
}

export type ConceptCodePromptSuggestionProvider = {
  suggestions: (context: { prefix: "@" | "/"; query: string; mode: "search" | "resolved" }) => ConceptCodePromptSuggestionEntry[]
  isResolvedValue?: (context: { prefix: "@" | "/"; query: string; value: string }) => boolean
  acceptTrailingText?: (context: { prefix: "@" | "/"; value: string; suffix: string }) => string
}

export const CONCEPT_CODE_PROMPT_REFERENCE_SPECS: PromptReferenceSpec<ConceptCodePromptReferenceKind>[] = [
  { kind: "concept", symbol: "@", bodyPattern: /[a-zA-Z0-9_.-]/ },
  { kind: "slash", symbol: "/", bodyPattern: /[a-zA-Z0-9_.-]/, allowEmpty: true, requiresLeadingWhitespace: true },
]

type SlashSuggestion = { value: string; description: string }

const SLASH_SUGGESTIONS_BY_MODE: Record<ConceptCodePromptSuggestionState["uiMode"], SlashSuggestion[]> = {
  plan: [
    { value: "/explain", description: "Explain the selected code or concept." },
    { value: "/review", description: "Review changes for bugs, regressions, and gaps." },
    { value: "/skill-architecture", description: "Use an architecture-focused skill prompt." },
  ],
  build: [
    { value: "/fix", description: "Investigate and fix the current problem." },
    { value: "/test", description: "Run relevant tests and summarize the results." },
    { value: "/command-commit", description: "Draft a commit-ready change summary." },
  ],
  conceptualize: [
    { value: "/consolidate", description: "Inspect a required impl concept, enrich its graph metadata, and plan low-coverage child updates before applying them." },
    { value: "/elaborate", description: "Verify a user-provided concept explanation against the best available evidence and update summary confidence." },
    { value: "/create", description: "Create a new concept under an existing parent path through a TypeScript graph update script." },
    { value: "/delete", description: "Preflight and confirm deletion of an existing concept, including related-path cleanup." },
    { value: "/rename", description: "Preflight and confirm a concept key rename, including descendant and related-path rewrites." },
    { value: "/move", description: "Preflight and confirm moving a concept subtree, including descendant and related-path rewrites." },
    { value: "/merge", description: "Preflight and confirm merging two concepts into an explicit survivor, including conflict reporting and path rewrites." },
    { value: "/split", description: "Preflight and confirm splitting an overloaded concept into explicit child groupings while preserving the original umbrella parent." },
    { value: "/link", description: "Add, remove, or normalize sparse related_paths links between existing concepts." },
    { value: "/anchor", description: "Add or refine an impl concept source anchor, exploration coverage, and narrowly warranted summary updates." },
    { value: "/validate", description: "Run a read-only concept-graph audit and recommend follow-up skills for findings." },
  ],
}

function allAliasSuggestions(state: ConceptCodePromptSuggestionState, query: string): string[] {
  const paths = [...state.nodes.keys()].sort((left, right) => left.localeCompare(right))
  const aliases = paths.map((path) => `@${path}`)
  if (!query) return aliases
  const normalized = query.toLowerCase()
  const score = (alias: string): number => {
    const path = alias.slice(1).toLowerCase()
    const lastSegment = path.split(".").at(-1) ?? path
    if (lastSegment === normalized) return 400
    if (lastSegment.startsWith(normalized)) return 300 - lastSegment.indexOf(normalized)
    if (path.startsWith(normalized)) return 220 - path.indexOf(normalized)
    if (path.includes(normalized)) return 120 - path.indexOf(normalized)
    return 0
  }
  return aliases
    .map((alias) => ({ alias, score: score(alias) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.alias.length - right.alias.length || left.alias.localeCompare(right.alias))
    .map((entry) => entry.alias)
}

function slashSuggestionsForMode(mode: ConceptCodePromptSuggestionState["uiMode"]): SlashSuggestion[] {
  return SLASH_SUGGESTIONS_BY_MODE[mode]
}

function allSlashSuggestions(state: ConceptCodePromptSuggestionState, query: string): string[] {
  const slashSuggestions = slashSuggestionsForMode(state.uiMode)
  if (!query) return slashSuggestions.map((entry) => entry.value)
  const normalized = query.toLowerCase()
  const score = (value: string): number => {
    const command = value.slice(1).toLowerCase()
    const lastSegment = command.split(/[-_.]/).at(-1) ?? command
    if (command === normalized) return 500
    if (lastSegment === normalized) return 430
    if (command.startsWith(normalized)) return 360 - command.indexOf(normalized)
    if (lastSegment.startsWith(normalized)) return 300 - lastSegment.indexOf(normalized)
    if (command.includes(normalized)) return 180 - command.indexOf(normalized)
    return 0
  }
  return slashSuggestions
    .map((entry) => ({ value: entry.value, score: score(entry.value) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.value.length - right.value.length || left.value.localeCompare(right.value))
    .map((entry) => entry.value)
}

function slashSuggestionDescription(state: ConceptCodePromptSuggestionState, value: string): string {
  return slashSuggestionsForMode(state.uiMode).find((entry) => entry.value === value)?.description ?? "Command or skill"
}

export function createConceptCodePromptSuggestionProvider(state: ConceptCodePromptSuggestionState): ConceptCodePromptSuggestionProvider {
  return {
    suggestions: ({ prefix, query, mode }) => {
      if (mode === "resolved") return [{ value: `${prefix}${query}` }]
      if (prefix === "@") return allAliasSuggestions(state, query).map((value) => ({ value, description: state.nodes.get(value.slice(1))?.summary ?? "" }))
      return allSlashSuggestions(state, query).map((value) => ({ value, description: slashSuggestionDescription(state, value) }))
    },
    isResolvedValue: ({ prefix, query, value }) => value === `${prefix}${query}`,
    acceptTrailingText: ({ suffix }) => (suffix.length === 0 || !/^[\s.,;:!?)}\]]/.test(suffix) ? " " : ""),
  }
}

export type ResolvedConceptCodePromptReference =
  | { kind: "concept"; path: string }
  | { kind: "slash"; command: string }

export function createConceptCodePromptResolvers(input: {
  conceptPaths?: Iterable<string>
}): PromptReferenceResolverMap<ConceptCodePromptReferenceKind, { conceptPaths: Set<string> | null }, ResolvedConceptCodePromptReference> {
  const conceptPaths = input.conceptPaths ? new Set(input.conceptPaths) : null
  return {
    concept: (match, context) => {
      if (!context.conceptPaths?.has(match.value)) return null
      return { kind: "concept", path: match.value }
    },
    slash: (match) => ({ kind: "slash", command: match.value }),
  }
}
