import { type Renderable, type VNode, Box, ScrollBoxRenderable, Text, TextAttributes } from "@opentui/core"

import { bulletList } from "./model"
import { bufferSummary, currentNode, visiblePaths } from "./state"
import type { AppState, ListLine, MainLine, StatusTone } from "./types"

export const COLORS = {
  bg: "#111417",
  panel: "#1b2228",
  panelSoft: "#202930",
  border: "#38505f",
  borderActive: "#d08770",
  accent: "#88c0d0",
  accentSoft: "#8fbcbb",
  text: "#e5e9f0",
  muted: "#9aa7b0",
  success: "#a3be8c",
  warning: "#ebcb8b",
  error: "#bf616a",
  selectedFg: "#101418",
  selectedBg: "#f2cc8f",
} as const

export function replaceChildren(
  renderable: { getChildren: () => Renderable[]; add: (child: Renderable | VNode<any, any[]>, index?: number) => number },
  child: Renderable | VNode<any, any[]>,
): void {
  for (const existing of renderable.getChildren()) {
    existing.destroy()
  }
  renderable.add(child)
}

export function listLines(state: AppState): ListLine[] {
  const visible = visiblePaths(state)
  if (visible.length === 0) {
    return [{ content: `  (no child concepts under ${state.currentParentPath})`, selected: false, buffered: false }]
  }
  return visible.map((path, index) => {
    const node = state.nodes.get(path)!
    const selected = index === state.cursor
    const buffered = state.bufferedPaths.includes(path)
    const marker = node.childPaths.length > 0 ? ">" : "-"
    const prefix = selected ? ">" : " "
    const bufferMark = buffered ? "[x]" : "[ ]"
    return {
      content: `${prefix}${bufferMark} ${marker} ${node.title} [${node.kind}]`,
      selected,
      buffered,
    }
  })
}

export function mainLines(state: AppState): MainLine[] {
  const node = currentNode(state)
  const lines: MainLine[] = [
    { content: node.title, role: "title" },
    { content: "", role: "body" },
  ]
  if (node.summary) {
    lines.push({ content: "summary", role: "section" }, { content: node.summary, role: "body" }, { content: "", role: "body" })
  }
  for (const key of ["why_it_exists", "state_predicate"] as const) {
    const value = node.metadata[key]
    if (typeof value === "string" && value) {
      lines.push({ content: key, role: "section" }, { content: value, role: "body" }, { content: "", role: "body" })
    }
  }
  for (const [label, values] of [["aliases", bulletList(node.metadata.aliases)]] as const) {
    if (values.length > 0) {
      lines.push({ content: label, role: "section" })
      for (const item of values) {
        lines.push({ content: `- ${item}`, role: "body" })
      }
      lines.push({ content: "", role: "body" })
    }
  }
  return lines
}

export function scrollListForCursor(state: AppState, listScroll: ScrollBoxRenderable): void {
  const halfViewport = Math.max(2, Math.floor((listScroll.viewport.height || 10) / 2))
  const target = Math.max(0, state.cursor - halfViewport)
  listScroll.scrollTo({ x: 0, y: target })
}

export function toneColor(tone: StatusTone): string {
  if (tone === "success") return COLORS.success
  if (tone === "warning") return COLORS.warning
  if (tone === "error") return COLORS.error
  return COLORS.accent
}

export function repaint(state: AppState, listScroll: ScrollBoxRenderable, mainScroll: ScrollBoxRenderable, root: { getChildren: () => Renderable[]; add: (child: Renderable | VNode<any, any[]>, index?: number) => number }): void {
  const listItems = listLines(state)
  const mainItems = mainLines(state)

  replaceChildren(
    listScroll,
    Box(
      { width: "100%", flexDirection: "column", gap: 0 },
      ...listItems.map((item) =>
        Box(
          {
            width: "100%",
            paddingX: 1,
            backgroundColor: item.selected ? COLORS.selectedBg : item.buffered ? COLORS.panelSoft : COLORS.panel,
          },
          Text({
            content: item.content,
            fg: item.selected ? COLORS.selectedFg : item.buffered ? COLORS.accentSoft : COLORS.text,
            attributes: item.selected ? TextAttributes.BOLD : 0,
          }),
        ),
      ),
    ),
  )

  replaceChildren(
    mainScroll,
    Box(
      { width: "100%", flexDirection: "column", gap: 0 },
      ...mainItems.map((line) =>
        Text({
          content: line.content,
          fg: line.role === "title" ? COLORS.accent : line.role === "section" ? COLORS.accentSoft : line.role === "muted" ? COLORS.muted : COLORS.text,
          attributes: line.role === "title" || line.role === "section" ? TextAttributes.BOLD : 0,
        }),
      ),
    ),
  )

  const sidebar = Box(
    {
      width: state.layoutMode === "wide" ? 44 : "100%",
      flexShrink: 0,
      flexDirection: "column",
    },
    Box(
      {
        flexGrow: 1,
        borderStyle: "rounded",
        borderColor: COLORS.borderActive,
        title: "Concepts",
        padding: 1,
        backgroundColor: COLORS.panel,
      },
      listScroll,
    ),
  )

  const context = Box(
    {
      flexGrow: 1,
      borderStyle: "rounded",
      borderColor: COLORS.border,
      title: "Context",
      padding: 1,
      backgroundColor: COLORS.panel,
    },
    mainScroll,
  )

  replaceChildren(
    root,
    Box(
      {
        width: "100%",
        height: "100%",
        flexDirection: "column",
        backgroundColor: COLORS.bg,
        padding: 1,
        gap: 1,
      },
      Box(
        {
          width: "100%",
          borderStyle: "rounded",
          borderColor: COLORS.borderActive,
          paddingX: 2,
          paddingY: 1,
          backgroundColor: COLORS.panel,
        },
        Box(
          { width: "100%", flexDirection: state.layoutMode === "wide" ? "row" : "column", justifyContent: "space-between" },
          Text({ content: "setsumei", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
          Text({ content: currentNode(state).path, fg: COLORS.muted }),
        ),
      ),
      Box(
        {
          width: "100%",
          flexGrow: 1,
          flexDirection: state.layoutMode === "wide" ? "row" : "column",
          gap: 1,
        },
        sidebar,
        context,
      ),
      ...(state.showBufferModal
        ? [
            Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000088" }),
            Box(
              {
                position: "absolute",
                top: 4,
                left: state.layoutMode === "wide" ? 18 : 2,
                width: state.layoutMode === "wide" ? 72 : "90%",
                padding: 1,
                backgroundColor: COLORS.panelSoft,
                flexDirection: "column",
                gap: 1,
              },
              Text({ content: "Buffered Concepts", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
              ...(state.bufferedPaths.length === 0
                ? [Text({ content: "(buffer is empty)", fg: COLORS.muted })]
                : state.bufferedPaths.map((path) => Text({ content: `- ${path}`, fg: COLORS.text }))),
              Text({ content: "Press any key to close", fg: COLORS.muted }),
            ),
          ]
        : []),
      Box(
        {
          width: "100%",
          borderStyle: "rounded",
          borderColor: toneColor(state.status.tone),
          paddingX: 1,
          paddingY: 1,
          backgroundColor: COLORS.panel,
        },
        Text({ content: state.status.message, fg: toneColor(state.status.tone) }),
      ),
    ),
  )

  scrollListForCursor(state, listScroll)
  state.mainViewportHeight = Math.max(8, mainScroll.viewport.height || (state.layoutMode === "wide" ? 18 : 12))
  mainScroll.scrollTo({ x: 0, y: state.mainScrollTop })
}
