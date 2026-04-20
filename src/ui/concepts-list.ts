import { Box, ScrollBoxRenderable, Text, TextAttributes, type Renderable, type VNode } from "@opentui/core"

import { visiblePaths } from "../core/state"
import type { AppState, ListLine } from "../core/types"
import { COLORS } from "./theme"
import { truncateSingleLine } from "./text"

export function listLines(state: AppState): ListLine[] {
  const visible = visiblePaths(state)
  if (visible.length === 0) {
    return [{ title: `(no child concepts under ${state.currentParentPath})`, kindLabel: "", leftMarker: "", rightMarker: "", selected: false, empty: true }]
  }
  return visible.map((path, index) => {
    const node = state.nodes.get(path)!
    return {
      title: node.title,
      kindLabel: node.kind ?? "(no kind)",
      leftMarker: node.parentPath && node.parentPath !== "root" ? "<-" : "",
      rightMarker: node.childPaths.length > 0 ? "->" : "",
      selected: index === state.cursor,
      tone: node.isDraft ? "draft" : undefined,
    }
  })
}

function conceptRowColors(item: ListLine): { background: string; title: string; kind: string; badge: string } {
  if (item.selected) {
    return { background: COLORS.selectedBg, title: COLORS.selectedFg, kind: COLORS.selectedFg, badge: COLORS.selectedFg }
  }
  if (item.empty) {
    return { background: COLORS.panel, title: COLORS.muted, kind: COLORS.muted, badge: COLORS.muted }
  }
  return {
    background: COLORS.panel,
    title: item.tone === "draft" ? COLORS.warning : COLORS.text,
    kind: COLORS.muted,
    badge: item.tone === "draft" ? COLORS.warning : COLORS.border,
  }
}

export function renderConceptList(state: AppState): Renderable | VNode<any, any[]> {
  const items = listLines(state)
  return Box(
    { width: "100%", flexDirection: "column", gap: 0 },
    ...items.map((item) => {
      const colors = conceptRowColors(item)
      const titleWidth = state.layoutMode === "wide" ? 24 : 20
      const kindWidth = state.layoutMode === "wide" ? 10 : 10
      return Box(
        { width: "100%", paddingX: 1, backgroundColor: colors.background, flexDirection: "row", justifyContent: "space-between" },
        Box(
          { flexDirection: "row", gap: 1, flexGrow: 1 },
          Text({ content: item.leftMarker ? item.leftMarker.padEnd(3, " ") : "   ", fg: colors.badge, attributes: item.selected || Boolean(item.leftMarker) ? TextAttributes.BOLD : 0 }),
          Text({ content: truncateSingleLine(item.title, titleWidth), fg: colors.title, attributes: item.selected ? TextAttributes.BOLD : 0 }),
        ),
        Box(
          { flexDirection: "row", gap: 1, flexShrink: 0 },
          Text({ content: item.kindLabel ? truncateSingleLine(item.kindLabel, kindWidth) : "", fg: colors.kind, attributes: item.selected ? TextAttributes.BOLD : 0 }),
          Text({ content: item.rightMarker ? item.rightMarker.padEnd(2, " ") : "  ", fg: colors.badge, attributes: item.selected || Boolean(item.rightMarker) ? TextAttributes.BOLD : 0 }),
        ),
      )
    }),
  )
}

export function scrollListForCursor(state: AppState, listScroll: ScrollBoxRenderable): void {
  const halfViewport = Math.max(2, Math.floor((listScroll.viewport.height || 10) / 2))
  listScroll.scrollTo({ x: 0, y: Math.max(0, state.cursor - halfViewport) })
}
