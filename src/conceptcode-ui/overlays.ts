import { Box, Text, TextAttributes, type Renderable, ScrollBoxRenderable, type VNode } from "@opentui/core"

import { currentNode } from "../core/state"
import type { AppState } from "../core/types"
import { renderOverlayBackdrop, renderOverlayCard } from "../shell/render/overlay"
import { COLORS } from "../ui/theme"
import type { PreviewLegendItem } from "../ui/snippet"

function renderLegendFooter(items: PreviewLegendItem[]): Renderable | VNode<any, any[]> {
  if (items.length === 0) return Box({ width: "100%" })
  const nodes: Array<Renderable | VNode<any, any[]>> = []
  items.forEach((item, index) => {
    if (index > 0) nodes.push(Text({ content: "  ·  ", fg: COLORS.border }))
    nodes.push(Text({ content: item.kindLabel, fg: item.color, attributes: TextAttributes.BOLD }))
  })
  return Box(
    { position: "absolute", right: 1, bottom: 0 },
    Box({ borderStyle: "rounded", borderColor: COLORS.border, backgroundColor: COLORS.panel, paddingX: 1, paddingY: 0, flexDirection: "row", flexWrap: "wrap" }, ...nodes),
  )
}

export function renderConceptSummaryEditorOverlay(state: AppState): Array<Renderable | VNode<any, any[]>> {
  if (!(state.editorModal && state.editorModal.target.kind !== "prompt")) return []
  return [
    renderOverlayBackdrop("66"),
    renderOverlayCard(
      {
        top: state.layoutMode === "wide" ? 7 : 5,
        left: state.layoutMode === "wide" ? "50%" : 2,
        width: state.layoutMode === "wide" ? 84 : "94%",
        marginLeft: state.layoutMode === "wide" ? -42 : undefined,
      },
      [
        Text({ content: `Edit Summary: ${state.editorModal.target.path}`, fg: COLORS.accent, attributes: TextAttributes.BOLD }),
        Box({ width: "100%", minHeight: state.editorModal.visibleLineCount + 2, maxHeight: state.editorModal.visibleLineCount + 2, backgroundColor: COLORS.panelSoft, flexDirection: "column" }, state.editorModal.renderable),
      ],
    ),
  ]
}

export function renderInspectorOverlay(state: AppState, mainScroll: ScrollBoxRenderable): Array<Renderable | VNode<any, any[]>> {
  if (!state.inspector) return []
  const selectedNode = currentNode(state)
  const titleByKind = {
    snippet: selectedNode.loc ? `Snippet ${selectedNode.loc.file}:${selectedNode.loc.startLine}-${selectedNode.loc.endLine}` : "Snippet",
    subtree: `Subtree ${selectedNode.title}`,
    metadata: `Metadata ${selectedNode.title}`,
  }
  return [
    renderOverlayBackdrop(),
    renderOverlayCard(
      {
        top: state.layoutMode === "wide" ? 3 : 2,
        left: state.layoutMode === "wide" ? "50%" : 2,
        width: state.layoutMode === "wide" ? 104 : "94%",
        height: state.layoutMode === "wide" ? "82%" : "84%",
        marginLeft: state.layoutMode === "wide" ? -52 : undefined,
      },
      [
        Box(
          { width: "100%", flexDirection: "row", justifyContent: "space-between" },
          Text({ content: titleByKind[state.inspector.kind], fg: COLORS.accent, attributes: TextAttributes.BOLD }),
          Text({ content: "Esc -> Close  PgUp/PgDn -> Scroll", fg: COLORS.muted }),
        ),
        Box({ width: "100%", height: "100%", flexDirection: "column" }, Box({ width: "100%", height: "100%" }, mainScroll), renderLegendFooter(state.contextLegendItems ?? [])),
      ],
      { gap: 0 },
    ),
  ]
}

export function renderAppOverlays(state: AppState, mainScroll: ScrollBoxRenderable): Array<Renderable | VNode<any, any[]>> {
  return [
    ...renderConceptSummaryEditorOverlay(state),
    ...renderInspectorOverlay(state, mainScroll),
  ]
}
