import { Box, Text, TextAttributes, type Renderable, type VNode } from "@opentui/core"

import type { AppState, ChatSession, CreateConceptModalState } from "../core/types"
import { COLORS } from "./theme"
import { truncateSingleLine } from "./text"

function sessionModalLayout(state: AppState): {
  top: number
  left: number | `${number}%`
  width: number | `${number}%`
  marginLeft?: number
  height: number
} {
  const viewportHeight = process.stdout.rows || 24
  const top = state.layoutMode === "wide" ? 5 : 3
  const bottom = top
  return {
    top,
    left: state.layoutMode === "wide" ? "50%" : 2,
    width: state.layoutMode === "wide" ? 84 : "94%",
    marginLeft: state.layoutMode === "wide" ? -42 : undefined,
    height: Math.max(8, viewportHeight - top - bottom),
  }
}

function createKindOptions(state: AppState, query: string): Array<{ kind: string; description: string }> {
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = state.kindDefinitions
    .filter((item) => normalizedQuery.length === 0 || fuzzyKindScore(item.kind, normalizedQuery) > 0)
    .sort((left, right) => {
      const leftScore = fuzzyKindScore(left.kind, normalizedQuery)
      const rightScore = fuzzyKindScore(right.kind, normalizedQuery)
      return rightScore - leftScore || left.kind.localeCompare(right.kind)
    })
    .map((item) => ({ kind: item.kind, description: item.description }))
  return [{ kind: "None", description: "Create this concept without assigning a kind." }, ...filtered]
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

export function renderCreateConceptModal(state: AppState, modal: CreateConceptModalState): Array<Renderable | VNode<any, any[]>> {
  const options = createKindOptions(state, modal.kindQuery)
  const selectedOption = options[Math.max(0, Math.min(modal.kindCursor, Math.max(0, options.length - 1)))]
  const visibleOptions = options.slice(0, state.layoutMode === "wide" ? 8 : 6)
  return [
    Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000088" }),
    Box(
      { position: "absolute", top: state.layoutMode === "wide" ? 5 : 3, left: state.layoutMode === "wide" ? "50%" : 2, width: state.layoutMode === "wide" ? 84 : "94%", padding: 1, backgroundColor: COLORS.panelSoft, borderStyle: "rounded", borderColor: COLORS.borderActive, marginLeft: state.layoutMode === "wide" ? -42 : undefined, flexDirection: "column", gap: 1 },
      Text({ content: "Add Draft Concept", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
      Text({ content: `Name: ${modal.draft.title || ""}`, fg: modal.fieldIndex === 0 ? COLORS.selectedBg : COLORS.text }),
      Text({ content: `Kind: ${selectedOption?.kind ?? (modal.kindQuery || "None")}`, fg: modal.fieldIndex === 1 ? COLORS.selectedBg : COLORS.text }),
      ...(modal.kindExpanded
        ? [
            Box(
              { width: "100%", padding: 1, backgroundColor: COLORS.panel, borderStyle: "rounded", borderColor: COLORS.warning, flexDirection: "column" },
              ...visibleOptions.map((option, index) => {
                const selected = index === Math.max(0, Math.min(modal.kindCursor, visibleOptions.length - 1))
                return Box(
                  { width: "100%", paddingX: 1, backgroundColor: selected ? COLORS.selectedBg : COLORS.panel, flexDirection: "row", justifyContent: "space-between" },
                  Text({ content: option.kind, fg: selected ? COLORS.selectedFg : COLORS.text, attributes: selected ? TextAttributes.BOLD : 0 }),
                  Text({ content: option.description, fg: selected ? COLORS.selectedFg : COLORS.muted }),
                )
              }),
            ),
          ]
        : []),
      Text({ content: `Summary: ${modal.draft.summary || ""}`, fg: modal.fieldIndex === 2 ? COLORS.selectedBg : COLORS.text }),
      Text({ content: modal.kindExpanded ? "Type -> Filter  Arrows -> Move  Enter -> Close  Esc -> Close" : "Tab -> Next  Shift+Tab -> Prev  Enter -> Open/Create  Esc -> Close", fg: COLORS.muted }),
    ),
  ]
}

export function renderConfirmModal(state: AppState): Array<Renderable | VNode<any, any[]>> {
  if (!state.confirmModal) return []
  return [
    Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000088" }),
    Box(
      { position: "absolute", top: state.layoutMode === "wide" ? 8 : 6, left: state.layoutMode === "wide" ? "50%" : 2, width: state.layoutMode === "wide" ? 74 : "92%", padding: 1, backgroundColor: COLORS.panelSoft, borderStyle: "rounded", borderColor: COLORS.borderActive, marginLeft: state.layoutMode === "wide" ? -37 : undefined, flexDirection: "column", gap: 1 },
      Text({ content: state.confirmModal.title, fg: COLORS.accent, attributes: TextAttributes.BOLD }),
      ...state.confirmModal.message.map((line) => Text({ content: line, fg: COLORS.text })),
      Text({ content: "Enter -> Remove  Esc -> Close", fg: COLORS.muted }),
    ),
  ]
}

function renderSessionModalRow(state: AppState, session: ChatSession, selected: boolean): Renderable | VNode<any, any[]> {
  const mode = session.lastMode === "plan"
    ? { label: "PLAN", color: COLORS.plan }
    : session.lastMode === "build"
      ? { label: "BUILD", color: COLORS.build }
      : { label: "CONCEPTUALIZE", color: COLORS.conceptualize }
  return Box(
    { width: "100%", minHeight: 2, maxHeight: 2, paddingX: 1, backgroundColor: selected ? COLORS.selectedBg : COLORS.panel, flexDirection: "row", justifyContent: "space-between" },
    Box(
      { flexDirection: "column", flexGrow: 1, minWidth: 0 },
      Text({ content: truncateSingleLine(session.title, state.layoutMode === "wide" ? 42 : 28), fg: selected ? COLORS.selectedFg : COLORS.text, attributes: TextAttributes.BOLD }),
      Text({ content: truncateSingleLine(`${session.messages.filter((message) => message.text.trim()).length} messages  ${session.updatedAt.replace("T", " ").slice(0, 16)}`, state.layoutMode === "wide" ? 42 : 28), fg: selected ? COLORS.selectedFg : COLORS.muted }),
    ),
    Text({ content: mode.label, fg: selected ? COLORS.selectedFg : mode.color, attributes: TextAttributes.BOLD }),
  )
}

export function renderSessionModal(state: AppState): Array<Renderable | VNode<any, any[]>> {
  if (!state.sessionModal) return []
  const sessions = [...state.sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  const layout = sessionModalLayout(state)
  const contentHeight = Math.max(1, layout.height - 6)
  const visibleRowCount = Math.max(1, Math.floor((contentHeight + 1) / 3))
  const start = Math.max(0, Math.min(state.sessionModal.scrollTop, Math.max(0, sessions.length - visibleRowCount)))
  const visibleSessions = sessions.slice(start, start + visibleRowCount)
  return [
    Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000088" }),
    Box(
      { position: "absolute", top: layout.top, left: layout.left, width: layout.width, height: layout.height, padding: 1, backgroundColor: COLORS.panelSoft, borderStyle: "rounded", borderColor: COLORS.borderActive, marginLeft: layout.marginLeft, flexDirection: "column", gap: 1 },
      Text({ content: "Sessions", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
      Box(
        { width: "100%", flexGrow: 1, minHeight: 0, flexDirection: "column", gap: 1 },
        ...visibleSessions.map((session, index) => renderSessionModalRow(state, session, start + index === state.sessionModal?.selectedIndex)),
      ),
      Text({ content: "Enter -> Switch  n -> New  Esc -> Close", fg: COLORS.muted }),
    ),
  ]
}
