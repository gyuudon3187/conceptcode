import { Box, Text, TextAttributes, type Renderable, ScrollBoxRenderable, type VNode } from "@opentui/core"

import type { ShellInspectorViewModel } from "../../core/types"
import { renderOverlayBackdrop, renderOverlayCard } from "./overlay"
import { COLORS } from "../theme"

function renderLegendFooter(items: ShellInspectorViewModel["legendItems"]): Renderable | VNode<any, any[]> {
  if (items.length === 0) return Box({ width: "100%" })
  const nodes: Array<Renderable | VNode<any, any[]>> = []
  items.forEach((item, index) => {
    if (index > 0) nodes.push(Text({ content: "  ·  ", fg: COLORS.border }))
    nodes.push(Text({ content: item.label, fg: item.color, attributes: TextAttributes.BOLD }))
  })
  return Box(
    { position: "absolute", right: 1, bottom: 0 },
    Box({ borderStyle: "rounded", borderColor: COLORS.border, backgroundColor: COLORS.panel, paddingX: 1, paddingY: 0, flexDirection: "row", flexWrap: "wrap" }, ...nodes),
  )
}

export function renderInspectorOverlay(viewModel: ShellInspectorViewModel | null, mainScroll: ScrollBoxRenderable): Array<Renderable | VNode<any, any[]>> {
  if (!viewModel) return []
  return [
    renderOverlayBackdrop(),
    renderOverlayCard(
      viewModel.layout,
      [
        Box(
          { width: "100%", flexDirection: "row", justifyContent: "space-between" },
          Text({ content: viewModel.title, fg: COLORS.accent, attributes: TextAttributes.BOLD }),
          Text({ content: viewModel.closeHint, fg: COLORS.muted }),
        ),
        Box({ width: "100%", height: "100%", flexDirection: "column" }, Box({ width: "100%", height: "100%" }, mainScroll), renderLegendFooter(viewModel.legendItems)),
      ],
      { gap: 0 },
    ),
  ]
}
