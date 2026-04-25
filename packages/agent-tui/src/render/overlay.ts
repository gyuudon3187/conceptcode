import { Box, type Renderable, type VNode } from "@opentui/core"

import type { ShellOverlayLayout } from "../types"
import { COLORS } from "../theme"

export function renderOverlayBackdrop(opacityHex = "88"): Renderable | VNode<any, any[]> {
  return Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: `#000000${opacityHex}` })
}

export function renderOverlayCard(
  layout: ShellOverlayLayout,
  children: Array<Renderable | VNode<any, any[]>>,
  options?: { backgroundColor?: string; borderColor?: string; padding?: number; gap?: number },
): Renderable | VNode<any, any[]> {
  return Box(
    {
      position: "absolute",
      top: layout.top,
      left: layout.left,
      width: layout.width,
      height: layout.height,
      marginLeft: layout.marginLeft,
      padding: options?.padding ?? 1,
      backgroundColor: options?.backgroundColor ?? COLORS.panel,
      borderStyle: "rounded",
      borderColor: options?.borderColor ?? COLORS.borderActive,
      flexDirection: "column",
      gap: options?.gap ?? 1,
    },
    ...children,
  )
}
