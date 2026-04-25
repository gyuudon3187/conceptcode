import { Box, Text, TextAttributes, type Renderable, type VNode } from "@opentui/core"
import { renderOverlayBackdrop, renderOverlayCard } from "agent-tui/render/overlay"
import { renderSessionModal as renderShellSessionModal } from "agent-tui/render/session-modal"
import type { ShellSessionListItem, ShellSessionModalViewModel } from "agent-tui/types"

import type { AppState, CreateConceptModalState, SessionModalHostState } from "../core/types"
import { sessionModalHostState } from "../core/state"
import { sessionModalEntries, sessionModalItem } from "../sessions/commands"
import { COLORS } from "./theme"

function sessionModalLayout(state: Pick<SessionModalHostState, "layoutMode">): {
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
    renderOverlayBackdrop(),
    renderOverlayCard(
      {
        top: state.layoutMode === "wide" ? 5 : 3,
        left: state.layoutMode === "wide" ? "50%" : 2,
        width: state.layoutMode === "wide" ? 84 : "94%",
        marginLeft: state.layoutMode === "wide" ? -42 : undefined,
      },
      [
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
      ],
      { backgroundColor: COLORS.panelSoft },
    ),
  ]
}

export function renderConfirmModal(state: AppState): Array<Renderable | VNode<any, any[]>> {
  if (!state.confirmModal) return []
  return [
    renderOverlayBackdrop(),
    renderOverlayCard(
      {
        top: state.layoutMode === "wide" ? 8 : 6,
        left: state.layoutMode === "wide" ? "50%" : 2,
        width: state.layoutMode === "wide" ? 74 : "92%",
        marginLeft: state.layoutMode === "wide" ? -37 : undefined,
      },
      [
        Text({ content: state.confirmModal.title, fg: COLORS.accent, attributes: TextAttributes.BOLD }),
        ...state.confirmModal.message.map((line) => Text({ content: line, fg: COLORS.text })),
        Text({ content: "Enter -> Remove  Esc -> Close", fg: COLORS.muted }),
      ],
      { backgroundColor: COLORS.panelSoft },
    ),
  ]
}

function sessionModalViewModel(state: SessionModalHostState): ShellSessionModalViewModel | null {
  if (!state.sessionModal) return null
  const selectedIndex = state.sessionModal.selectedIndex
  const sessions = sessionModalEntries(state)
  const layout = sessionModalLayout(state)
  const contentHeight = Math.max(1, layout.height - 6)
  const visibleRowCount = Math.max(1, Math.floor((contentHeight + 1) / 3))
  const start = Math.max(0, Math.min(state.sessionModal.scrollTop, Math.max(0, sessions.length - visibleRowCount)))
  const visibleSessions = sessions.slice(start, start + visibleRowCount)
  const items: ShellSessionListItem[] = visibleSessions.map((session, index) => sessionModalItem(session, start + index === selectedIndex))
  return {
    layout,
    title: "Sessions",
    items,
    footerHint: sessions.length > 1 ? "Enter -> Switch  n -> New  d -> Delete  Esc -> Close" : "Enter -> Switch  n -> New  Esc -> Close",
  }
}

export function renderSessionModal(state: AppState): Array<Renderable | VNode<any, any[]>> {
  const hostState = sessionModalHostState(state)
  return renderShellSessionModal(hostState.layoutMode, sessionModalViewModel(hostState))
}
