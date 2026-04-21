import type { KeyEvent } from "@opentui/core"

import { applySelectionChange, clampCursor, currentPath } from "../core/state"
import type { AppState, ConceptNode, CreateConceptDraft, KindDefinition } from "../core/types"

export function emptyCreateDraft(): CreateConceptDraft {
  return { title: "", summary: "" }
}

function slugifyTitle(title: string): string {
  const normalized = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
  return normalized || "new_concept"
}

function uniqueChildPath(state: AppState, parentPath: string, title: string): string {
  const base = slugifyTitle(title)
  let candidate = `${parentPath}.${base}`
  let counter = 2
  while (state.nodes.has(candidate)) {
    candidate = `${parentPath}.${base}_${counter}`
    counter += 1
  }
  return candidate
}

export function isDraftConcept(state: AppState, path: string): boolean {
  return Boolean(state.nodes.get(path)?.isDraft)
}

function insertDraftConcept(state: AppState, draft: CreateConceptDraft, kindDefinition: KindDefinition | null): void {
  const parent = state.nodes.get(state.currentParentPath)
  if (!parent) throw new Error("Current parent concept not found")
  const path = uniqueChildPath(state, state.currentParentPath, draft.title)
  const metadata: ConceptNode["metadata"] = kindDefinition?.description ? { kind_description: kindDefinition.description } : {}
  const node: ConceptNode = {
    path,
    title: draft.title.trim(),
    kind: kindDefinition?.kind ?? null,
    summary: draft.summary.trim(),
    explorationCoverage: null,
    summaryConfidence: null,
    parentPath: state.currentParentPath,
    metadata,
    loc: null,
    childPaths: [],
    isDraft: true,
  }
  state.nodes.set(path, node)
  parent.childPaths = [...parent.childPaths, path]
  state.cursor = parent.childPaths.indexOf(path)
  applySelectionChange(state)
  if (kindDefinition && !state.kindDefinitions.some((item) => item.kind === kindDefinition.kind)) {
    state.kindDefinitions = [...state.kindDefinitions, kindDefinition].sort((left, right) => left.kind.localeCompare(right.kind))
  }
}

export function removeDraftConcept(state: AppState, path: string): void {
  const node = state.nodes.get(path)
  if (!node?.isDraft) return
  if (node.parentPath) {
    const parent = state.nodes.get(node.parentPath)
    if (parent) {
      parent.childPaths = parent.childPaths.filter((item) => item !== path)
    }
  }
  state.nodes.delete(path)
  clampCursor(state)
  applySelectionChange(state)
}

function fuzzyKindScore(candidate: string, query: string): number {
  if (!query) return 1
  const normalizedCandidate = candidate.toLowerCase()
  if (normalizedCandidate.includes(query)) return 100 - normalizedCandidate.indexOf(query)
  let queryIndex = 0
  let score = 0
  for (let index = 0; index < normalizedCandidate.length && queryIndex < query.length; index += 1) {
    if (normalizedCandidate[index] === query[queryIndex]) {
      score += 2
      queryIndex += 1
    }
  }
  return queryIndex === query.length ? score : 0
}

function createKindOptions(state: AppState, query: string): KindDefinition[] {
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = state.kindDefinitions
    .map((item) => ({ item, score: fuzzyKindScore(item.kind, normalizedQuery) }))
    .filter((entry) => normalizedQuery.length === 0 || entry.score > 0)
    .sort((left, right) => right.score - left.score || left.item.kind.localeCompare(right.item.kind))
    .map((entry) => entry.item)
  const noneOption: KindDefinition = { kind: "None", description: "Create this concept without assigning a kind.", source: "options" }
  return normalizedQuery.length === 0 || fuzzyKindScore(noneOption.kind, normalizedQuery) > 0 ? [noneOption, ...filtered] : filtered
}

function exactKindMatch(state: AppState, query: string): KindDefinition | null {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return null
  return state.kindDefinitions.find((item) => item.kind.toLowerCase() === normalizedQuery) ?? null
}

export function openCreateConceptModal(state: AppState): void {
  state.createConceptModal = { draft: emptyCreateDraft(), fieldIndex: 0, kindExpanded: false, kindCursor: 0, kindQuery: "" }
}

type CreateConceptModalDeps = {
  draw: () => void
  updateCreateDraftText: (key: KeyEvent) => boolean
}

function closeCreateConceptModal(state: AppState): void {
  state.createConceptModal = null
}

function submitCreateConceptModal(state: AppState, deps: CreateConceptModalDeps): boolean {
  const modal = state.createConceptModal
  if (!modal) return false
  if (!modal.draft.title.trim() || !modal.draft.summary.trim()) {
    state.confirmModal = {
      kind: "remove-draft",
      title: "Missing Fields",
      message: ["Concept name and summary are required"],
      confirmLabel: "dismisses this message",
      path: currentPath(state),
    }
    return true
  }
  const options = createKindOptions(state, modal.kindQuery)
  const selectedKind = modal.kindExpanded
    ? options.length > 0
      ? options[Math.max(0, Math.min(modal.kindCursor, options.length - 1))]
      : exactKindMatch(state, modal.kindQuery)
    : exactKindMatch(state, modal.kindQuery)
  const resolvedKind = selectedKind?.kind === "None" ? null : selectedKind
  insertDraftConcept(state, modal.draft, resolvedKind)
  closeCreateConceptModal(state)
  clampCursor(state)
  deps.draw()
  return true
}

export function handleCreateConceptModalKey(state: AppState, key: KeyEvent, deps: CreateConceptModalDeps): boolean {
  const modal = state.createConceptModal
  if (!modal) return false
  if (key.name === "escape" || (key.ctrl && key.name === "q")) {
    closeCreateConceptModal(state)
    deps.draw()
    return true
  }
  const fieldCount = 3
  const kindFieldSelected = modal.fieldIndex === 1
  if (kindFieldSelected && modal.kindExpanded) {
    const options = createKindOptions(state, modal.kindQuery)
    modal.kindCursor = Math.min(modal.kindCursor, Math.max(0, options.length - 1))
    if (key.name === "up") {
      modal.kindCursor = Math.max(0, modal.kindCursor - 1)
      deps.draw()
      return true
    }
    if (key.name === "down") {
      modal.kindCursor = Math.min(Math.max(0, options.length - 1), modal.kindCursor + 1)
      deps.draw()
      return true
    }
    if (key.name === "return") {
      modal.kindExpanded = false
      deps.draw()
      return true
    }
    if (key.name === "backspace") {
      modal.kindQuery = modal.kindQuery.slice(0, -1)
      modal.kindCursor = 0
      deps.draw()
      return true
    }
    if (typeof key.sequence === "string" && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      modal.kindQuery += key.sequence
      modal.kindCursor = 0
      deps.draw()
      return true
    }
    return true
  }
  if (key.name === "tab") {
    modal.fieldIndex = (modal.fieldIndex + 1) % fieldCount
    deps.draw()
    return true
  }
  if (key.shift && key.name === "tab") {
    modal.fieldIndex = (modal.fieldIndex + fieldCount - 1) % fieldCount
    deps.draw()
    return true
  }
  if (kindFieldSelected) {
    if (key.name === "return") {
      modal.kindExpanded = true
      modal.kindCursor = 0
      deps.draw()
      return true
    }
    if (key.name === "backspace") {
      modal.kindQuery = ""
      deps.draw()
      return true
    }
    if (typeof key.sequence === "string" && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      modal.kindExpanded = true
      modal.kindQuery += key.sequence
      modal.kindCursor = 0
      deps.draw()
      return true
    }
    return true
  }
  if (key.name === "return") return submitCreateConceptModal(state, deps)
  if (deps.updateCreateDraftText(key)) {
    deps.draw()
    return true
  }
  return true
}

export function promptToRemoveDraft(state: AppState, path: string): void {
  state.confirmModal = {
    kind: "remove-draft",
    title: "Remove Draft",
    message: [`Remove draft ${path}?`, "This removes the draft from the current TUI session."],
    confirmLabel: "removes this draft concept",
    path,
  }
}
