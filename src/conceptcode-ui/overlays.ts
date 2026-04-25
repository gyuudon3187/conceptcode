import { Box, Text, TextAttributes, type Renderable, type VNode } from "@opentui/core"

import { currentNode } from "../core/state"
import type { AppState, ShellInspectorViewModel } from "../core/types"
import { renderOverlayBackdrop, renderOverlayCard } from "../shell/render/overlay"
import { COLORS } from "../ui/theme"

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

export function inspectorOverlayViewModel(state: AppState): ShellInspectorViewModel | null {
  if (!state.inspector) return null
  const selectedNode = currentNode(state)
  const titleByKind = {
    snippet: selectedNode.loc ? `Snippet ${selectedNode.loc.file}:${selectedNode.loc.startLine}-${selectedNode.loc.endLine}` : "Snippet",
    subtree: `Subtree ${selectedNode.title}`,
    metadata: `Metadata ${selectedNode.title}`,
  }
  return {
    layout: {
      top: state.layoutMode === "wide" ? 3 : 2,
      left: state.layoutMode === "wide" ? "50%" : 2,
      width: state.layoutMode === "wide" ? 104 : "94%",
      height: state.layoutMode === "wide" ? "82%" : "84%",
      marginLeft: state.layoutMode === "wide" ? -52 : undefined,
    },
    title: titleByKind[state.inspector.kind],
    closeHint: "Esc -> Close  PgUp/PgDn -> Scroll",
    legendItems: (state.contextLegendItems ?? []).map((item) => ({ label: item.kindLabel, color: item.color })),
  }
}

export function renderAppOverlays(state: AppState): Array<Renderable | VNode<any, any[]>> {
  return [
    ...renderConceptSummaryEditorOverlay(state),
  ]
}
