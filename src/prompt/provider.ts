import type { AppState, PromptSuggestionEntry, PromptSuggestionProvider } from "../core/types"
import { ACTIVE_FEATURES } from "../features"

type FileSuggestionQueryScope = { scopeDirectory: string | null; searchQuery: string }

function fileSuggestionQueryScope(projectDirectories: readonly string[], query: string): FileSuggestionQueryScope {
  const slashIndex = query.lastIndexOf("/")
  if (slashIndex < 0) return { scopeDirectory: null, searchQuery: query }
  for (let index = slashIndex; index > 0; index = query.lastIndexOf("/", index - 1)) {
    const candidate = query.slice(0, index)
    if (projectDirectories.includes(candidate)) {
      return { scopeDirectory: candidate, searchQuery: query.slice(index + 1) }
    }
  }
  return { scopeDirectory: null, searchQuery: query }
}

function scoreFileSuggestion(path: string, normalizedQuery: string, scopeDirectory: string | null): number {
  const scopedPath = scopeDirectory ? path.slice(scopeDirectory.length + 1) : path
  const candidate = scopedPath.toLowerCase()
  const lastSegment = candidate.split("/").filter(Boolean).at(-1) ?? candidate
  const immediateChildBonus = scopeDirectory && !candidate.includes("/") ? 40 : 0
  if (!normalizedQuery) {
    return immediateChildBonus + (!candidate.includes("/") ? 400 : 220 - Math.min(candidate.length, 120))
  }
  if (candidate === normalizedQuery) return 540 + immediateChildBonus
  if (path.toLowerCase() === normalizedQuery) return 500
  if (lastSegment === normalizedQuery) return 470 + immediateChildBonus
  if (candidate.startsWith(normalizedQuery)) return 390 - candidate.indexOf(normalizedQuery) + immediateChildBonus
  if (lastSegment.startsWith(normalizedQuery)) return 340 - lastSegment.indexOf(normalizedQuery) + immediateChildBonus
  if (candidate.includes(`/${normalizedQuery}`)) return 260 - candidate.indexOf(`/${normalizedQuery}`) + immediateChildBonus
  if (candidate.includes(normalizedQuery)) return 180 - candidate.indexOf(normalizedQuery) + immediateChildBonus
  if (path.toLowerCase().includes(normalizedQuery)) return 120 - path.toLowerCase().indexOf(normalizedQuery)
  return 0
}

export function allFileSuggestions(state: AppState, query: string): string[] {
  const files = [...new Set([...(state.projectFiles ?? []), ...(state.projectDirectories ?? [])])].sort((left, right) => left.localeCompare(right))
  const references = files.map((path) => `&${path}`)
  if (!query) return references
  const { scopeDirectory, searchQuery } = fileSuggestionQueryScope(state.projectDirectories ?? [], query)
  const normalized = searchQuery.toLowerCase()
  return references
    .filter((reference) => !scopeDirectory || reference.slice(1).startsWith(`${scopeDirectory}/`))
    .map((reference) => ({ reference, score: scoreFileSuggestion(reference.slice(1), normalized, scopeDirectory) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.reference.length - right.reference.length || left.reference.localeCompare(right.reference))
    .map((entry) => entry.reference)
}

function dedupeSuggestionEntries(entries: PromptSuggestionEntry[]): PromptSuggestionEntry[] {
  const seen = new Set<string>()
  const deduped: PromptSuggestionEntry[] = []
  for (const entry of entries) {
    if (seen.has(entry.value)) continue
    seen.add(entry.value)
    deduped.push(entry)
  }
  return deduped
}

export function appPromptSuggestionProvider(state: AppState): PromptSuggestionProvider {
  const featureProviders = ACTIVE_FEATURES
    .map((feature) => feature.createPromptSuggestionProvider?.(state))
    .filter((provider): provider is PromptSuggestionProvider => Boolean(provider))
  return {
    suggestions: ({ prefix, query, mode }) => {
      if (prefix === "&") {
        if (mode === "resolved") return [{ value: `&${query}` }]
        return allFileSuggestions(state, query).map((value) => {
          const path = value.slice(1)
          const isDirectory = state.projectDirectories.includes(path)
          return { value, description: isDirectory ? "Directory reference" : "File reference" }
        })
      }
      return dedupeSuggestionEntries(featureProviders.flatMap((provider) => provider.suggestions({ prefix, query, mode })))
    },
    isResolvedValue: ({ prefix, query, value }) => {
      if (prefix === "&") return value === `&${query}`
      return featureProviders.some((provider) => provider.isResolvedValue?.({ prefix, query, value }) ?? value === `${prefix}${query}`)
    },
    acceptTrailingText: ({ prefix, value, suffix }) => {
      if (prefix === "&") {
        const isDirectoryReference = state.projectDirectories.includes(value.slice(1))
        if (isDirectoryReference) return "/"
        return suffix.length === 0 || !/^[\s.,;:!?)}\]]/.test(suffix) ? " " : ""
      }
      for (const provider of featureProviders) {
        const trailingText = provider.acceptTrailingText?.({ prefix, value, suffix })
        if (typeof trailingText === "string") return trailingText
      }
      return suffix.length === 0 || !/^[\s.,;:!?)}\]]/.test(suffix) ? " " : ""
    },
  }
}
