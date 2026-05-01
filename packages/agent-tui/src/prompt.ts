export type PromptReferenceSpec<TKind extends string = string> = {
  kind: TKind
  symbol: string
  bodyPattern: RegExp
  allowEmpty?: boolean
  requiresLeadingWhitespace?: boolean
}

export type PromptReferenceMatch<TKind extends string = string> = {
  kind: TKind
  symbol: string
  raw: string
  value: string
  start: number
  end: number
}

export type PromptReferenceResolver<TKind extends string, TContext, TResult> = (
  match: PromptReferenceMatch<TKind>,
  context: TContext,
) => TResult | null | undefined | Promise<TResult | null | undefined>

export type PromptReferenceResolverMap<TKind extends string, TContext, TResult> = {
  [K in TKind]?: PromptReferenceResolver<K, TContext, TResult>
}

export type ResolvedPromptReference<TKind extends string, TResult> = {
  match: PromptReferenceMatch<TKind>
  result: TResult
}

export type ResolvedPromptReferences<TKind extends string, TResult> = {
  matches: PromptReferenceMatch<TKind>[]
  resolved: ResolvedPromptReference<TKind, TResult>[]
  unresolved: PromptReferenceMatch<TKind>[]
}

function normalizeBodyPattern(pattern: RegExp): RegExp {
  return new RegExp(`^(?:${pattern.source})$`, pattern.flags.replace(/[gy]/g, ""))
}

function hasLeadingWhitespaceBoundary(text: string, index: number): boolean {
  return index === 0 || /\s/.test(text[index - 1] ?? "")
}

function compareMatches(left: PromptReferenceMatch, right: PromptReferenceMatch): number {
  return left.start - right.start || right.end - left.end || left.raw.localeCompare(right.raw)
}

export function parsePromptReferences<TKind extends string>(text: string, specs: PromptReferenceSpec<TKind>[]): PromptReferenceMatch<TKind>[] {
  const matches: PromptReferenceMatch<TKind>[] = []

  for (const spec of specs) {
    if (spec.symbol.length !== 1) {
      throw new Error(`Prompt reference symbols must be a single character: ${spec.symbol}`)
    }

    const bodyPattern = normalizeBodyPattern(spec.bodyPattern)
    for (let start = text.indexOf(spec.symbol); start >= 0; start = text.indexOf(spec.symbol, start + 1)) {
      if (spec.requiresLeadingWhitespace && !hasLeadingWhitespaceBoundary(text, start)) {
        continue
      }

      let end = start + spec.symbol.length
      while (end < text.length && bodyPattern.test(text[end] ?? "")) {
        end += 1
      }

      const value = text.slice(start + spec.symbol.length, end)
      if (!spec.allowEmpty && value.length === 0) {
        continue
      }

      matches.push({
        kind: spec.kind,
        symbol: spec.symbol,
        raw: text.slice(start, end),
        value,
        start,
        end,
      })
    }
  }

  return matches.sort(compareMatches)
}

export function findPromptReferenceAt<TKind extends string>(text: string, cursor: number, specs: PromptReferenceSpec<TKind>[]): PromptReferenceMatch<TKind> | null {
  return parsePromptReferences(text, specs).find((match) => cursor >= match.start && cursor <= match.end) ?? null
}

export function findPromptReferenceEndingAt<TKind extends string>(text: string, cursor: number, specs: PromptReferenceSpec<TKind>[]): PromptReferenceMatch<TKind> | null {
  return parsePromptReferences(text, specs).find((match) => cursor === match.end) ?? null
}

export function findPromptReferenceStartingAt<TKind extends string>(text: string, cursor: number, specs: PromptReferenceSpec<TKind>[]): PromptReferenceMatch<TKind> | null {
  return parsePromptReferences(text, specs).find((match) => cursor === match.start) ?? null
}

export async function resolvePromptReferences<TKind extends string, TContext, TResult>(input: {
  text: string
  specs: PromptReferenceSpec<TKind>[]
  resolvers: PromptReferenceResolverMap<TKind, TContext, TResult>
  context: TContext
}): Promise<ResolvedPromptReferences<TKind, TResult>> {
  const matches = parsePromptReferences(input.text, input.specs)
  const resolved: ResolvedPromptReference<TKind, TResult>[] = []
  const unresolved: PromptReferenceMatch<TKind>[] = []

  for (const match of matches) {
    const resolver = input.resolvers[match.kind] as PromptReferenceResolver<TKind, TContext, TResult> | undefined
    if (!resolver) {
      unresolved.push(match)
      continue
    }
    const result = await resolver(match, input.context)
    if (result == null) {
      unresolved.push(match)
      continue
    }
    resolved.push({ match, result })
  }

  return { matches, resolved, unresolved }
}
