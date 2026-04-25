import { Box, type Renderable, type VNode } from "@opentui/core"

import type { ShellFramePaneDescriptor, ShellWorkspaceFrameViewModel } from "../../core/types"
import { COLORS } from "../theme"

function renderPane(
  descriptor: ShellFramePaneDescriptor,
  options: Record<string, unknown>,
): Renderable | VNode<any, any[]> {
  return Box(
    {
      ...options,
      borderStyle: "rounded",
      borderColor: descriptor.borderColor ?? COLORS.border,
      title: descriptor.title,
      padding: 1,
      backgroundColor: COLORS.panel,
      flexDirection: "column",
    },
    descriptor.content as Renderable | VNode<any, any[]>,
  )
}

function renderSupportPane(
  descriptor: ShellFramePaneDescriptor,
  options: Record<string, unknown>,
): Renderable | VNode<any, any[]> {
  if (descriptor.shellFrame) {
    return renderPane(descriptor, options)
  }
  return Box(options, descriptor.content as Renderable | VNode<any, any[]>)
}

export function renderWorkspaceFrame(
  viewModel: ShellWorkspaceFrameViewModel,
  panes: {
    main: ShellFramePaneDescriptor
    supportTop: ShellFramePaneDescriptor
    supportBottom: ShellFramePaneDescriptor
    session: ShellFramePaneDescriptor
  },
  overlays: Array<Renderable | VNode<any, any[]>>,
): Renderable | VNode<any, any[]> {
  const sidebarOptions = viewModel.layoutMode === "wide" && viewModel.sidebarWidth !== null
    ? { width: viewModel.sidebarWidth, flexBasis: viewModel.sidebarWidth, minWidth: 24, flexGrow: 1, flexShrink: 1, flexDirection: "column" as const, gap: 1 }
    : { width: "100%" as const, flexGrow: 0, flexShrink: 0, flexDirection: "column" as const, gap: 1 }
  const supportColumn = Box(
    { ...sidebarOptions, height: "100%" },
    renderSupportPane(panes.supportTop, { width: "100%", minHeight: viewModel.supportHeight, maxHeight: viewModel.supportHeight, flexDirection: "column" }),
    renderSupportPane(panes.supportBottom, { width: "100%", flexGrow: 1, minHeight: viewModel.previewHeight, flexDirection: "column" }),
  )
  const mainPane = renderPane(panes.main, { flexGrow: 1 })
  const sessionOptions = viewModel.layoutMode === "wide" && viewModel.promptPaneWidth !== null
    ? { width: viewModel.promptPaneWidth, flexBasis: viewModel.promptPaneWidth, minWidth: 24, flexGrow: 0, flexShrink: 0 }
    : { width: "100%" as const, flexGrow: 0, flexShrink: 0 }
  const sessionPane = renderPane(panes.session, { ...sessionOptions, gap: 1 })

  return Box(
    { width: "100%", height: "100%", flexDirection: "column", backgroundColor: COLORS.bg, padding: 1, gap: 1 },
    ...(viewModel.layoutMode === "wide"
      ? [
          viewModel.conceptNavigationFocused
            ? Box({ width: "100%", flexGrow: 1, flexDirection: "row", gap: 1 }, mainPane, supportColumn)
            : Box({ width: "100%", flexGrow: 1, flexDirection: "row", gap: 1 }, supportColumn, sessionPane),
        ]
      : [
          mainPane,
          renderSupportPane(panes.supportTop, { width: "100%" }),
          renderSupportPane(panes.supportBottom, { width: "100%" }),
          sessionPane,
        ]),
    ...overlays,
  )
}
