import { Box, Text, TextAttributes, type Renderable, type VNode } from "@opentui/core"

import type { ShellSessionListItem, ShellSessionModalViewModel } from "../../core/types"
import { renderOverlayBackdrop, renderOverlayCard } from "./overlay"
import { COLORS } from "../theme"
import { truncateSingleLine } from "../text"

function renderSessionModalRow(layoutMode: "wide" | "narrow", item: ShellSessionListItem): Renderable | VNode<any, any[]> {
  return Box(
    { width: "100%", minHeight: 2, maxHeight: 2, paddingX: 1, backgroundColor: item.selected ? COLORS.selectedBg : COLORS.panel, flexDirection: "row", justifyContent: "space-between" },
    Box(
      { flexDirection: "column", flexGrow: 1, minWidth: 0 },
      Text({ content: truncateSingleLine(item.title, layoutMode === "wide" ? 42 : 28), fg: item.selected ? COLORS.selectedFg : COLORS.text, attributes: TextAttributes.BOLD }),
      Text({ content: truncateSingleLine(item.subtitle, layoutMode === "wide" ? 42 : 28), fg: item.selected ? COLORS.selectedFg : COLORS.muted }),
    ),
    Text({ content: item.badge.label, fg: item.selected ? COLORS.selectedFg : item.badge.color, attributes: TextAttributes.BOLD }),
  )
}

export function renderSessionModal(layoutMode: "wide" | "narrow", viewModel: ShellSessionModalViewModel | null): Array<Renderable | VNode<any, any[]>> {
  if (!viewModel) return []
  return [
    renderOverlayBackdrop(),
    renderOverlayCard(
      viewModel.layout,
      [
        Text({ content: viewModel.title, fg: COLORS.accent, attributes: TextAttributes.BOLD }),
        Box(
          { width: "100%", flexGrow: 1, minHeight: 0, flexDirection: "column", gap: 1 },
          ...viewModel.items.map((item) => renderSessionModalRow(layoutMode, item)),
        ),
        Text({ content: viewModel.footerHint, fg: COLORS.muted }),
      ],
      { backgroundColor: COLORS.panelSoft },
    ),
  ]
}
