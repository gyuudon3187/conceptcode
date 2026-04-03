import { type Renderable, type VNode, Box, ScrollBoxRenderable, Text, TextAttributes } from "@opentui/core"

import { bulletList } from "./model"
import { bufferModalTargets, currentNode, selectedBufferModalTarget, visiblePaths } from "./state"
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

function truncateSingleLine(text: string, width: number): string {
  const compact = text.replace(/\s+/g, " ").trim()
  if (compact.length <= width) {
    return compact
  }
  return `${compact.slice(0, Math.max(0, width - 3))}...`
}

function truncatePreviewLines(text: string, maxLines: number, width: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n").split("\n")
  const flattened: string[] = []
  for (const line of normalized) {
    const source = line || ""
    if (source.length === 0) {
      flattened.push("")
      continue
    }
    let remaining = source
    while (remaining.length > width) {
      flattened.push(remaining.slice(0, width))
      remaining = remaining.slice(width)
    }
    flattened.push(remaining)
  }
  if (flattened.length <= maxLines) {
    return [...flattened, ...Array.from({ length: Math.max(0, maxLines - flattened.length) }, () => "")].slice(0, maxLines)
  }
  const visible = flattened.slice(0, maxLines)
  visible[maxLines - 1] = truncateSingleLine(visible[maxLines - 1], width)
  if (visible[maxLines - 1].length >= 3) {
    visible[maxLines - 1] = `${visible[maxLines - 1].slice(0, Math.max(0, width - 3))}...`
  }
  return visible
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
                borderStyle: "rounded",
                borderColor: COLORS.borderActive,
                flexDirection: "column",
                gap: 1,
              },
              Text({ content: "Prompt Editor", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
              (() => {
                const promptSelected = selectedBufferModalTarget(state).kind === "prompt"
                const promptLines = state.promptText.trim()
                  ? truncatePreviewLines(state.promptText, 4, state.layoutMode === "wide" ? 64 : 48)
                  : ["", "", "", ""]
                return Box(
                  {
                    width: "100%",
                    paddingX: 1,
                    paddingY: 0,
                    backgroundColor: promptSelected ? COLORS.selectedBg : COLORS.panel,
                    flexDirection: "column",
                  },
                  ...promptLines.map((line) =>
                    Text({
                      content: line,
                      fg: promptSelected ? COLORS.selectedFg : state.promptText.trim() ? COLORS.text : COLORS.muted,
                      attributes: promptSelected ? TextAttributes.BOLD : 0,
                    }),
                  ),
                )
              })(),
              Text({ content: "Buffered Concepts", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
              ...(state.bufferedPaths.length === 0
                ? [Text({ content: "(buffer is empty)", fg: COLORS.muted })]
                : bufferModalTargets(state)
                    .filter((target) => target.kind === "concept" && target.path)
                    .flatMap((target) => {
                      const activeTarget = selectedBufferModalTarget(state)
                      const selected = activeTarget.kind === "concept" && activeTarget.path === target.path
                      const note = state.conceptNotes[target.path!]?.trim()
                      return [
                        Box(
                          {
                            width: "100%",
                            paddingX: 1,
                            backgroundColor: selected ? COLORS.selectedBg : COLORS.panel,
                          },
                          Text({
                            content: target.path!,
                            fg: selected ? COLORS.selectedFg : COLORS.text,
                            attributes: selected ? TextAttributes.BOLD : 0,
                          }),
                        ),
                        ...(note
                          ? [
                              Box(
                                {
                                  width: state.layoutMode === "wide" ? 64 : "92%",
                                  marginLeft: 3,
                                  paddingX: 1,
                                  backgroundColor: selected ? COLORS.panelSoft : "#171d22",
                                },
                                Box(
                                  { width: "100%", flexDirection: "row", gap: 1 },
                                  Text({ content: selected ? "|" : ":", fg: selected ? COLORS.accent : COLORS.border }),
                                  Text({
                                    content: truncateSingleLine(note, state.layoutMode === "wide" ? 56 : 38),
                                    fg: selected ? COLORS.accentSoft : COLORS.muted,
                                    attributes: selected ? TextAttributes.BOLD : 0,
                                  }),
                                ),
                              ),
                            ]
                          : []),
                      ]
                    })),
              Text({ content: "Esc/q closes, j/k move, Enter edits", fg: COLORS.muted }),
            ),
            ...(state.editorModal
              ? [
                  Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000066" }),
                  Box(
                    {
                      position: "absolute",
                      top: 7,
                      left: state.layoutMode === "wide" ? 12 : 2,
                      width: state.layoutMode === "wide" ? 84 : "94%",
                      padding: 1,
                      backgroundColor: COLORS.panel,
                      borderStyle: "rounded",
                      borderColor: COLORS.borderActive,
                      flexDirection: "column",
                      gap: 1,
                    },
                    Text({
                      content: state.editorModal.target.kind === "prompt" ? "Edit Prompt" : `Edit Context: ${state.editorModal.target.path}`,
                      fg: COLORS.accent,
                      attributes: TextAttributes.BOLD,
                    }),
                    Box(
                      {
                        width: "100%",
                        minHeight: 8,
                        backgroundColor: COLORS.panelSoft,
                        flexDirection: "column",
                      },
                      state.editorModal.renderable,
                    ),
                    Text({ content: "Esc/Ctrl+Q cancels, Ctrl+Enter saves, Ctrl+G opens $EDITOR", fg: COLORS.muted }),
                  ),
                ]
              : []),
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
