import { Box, Text, TextAttributes, type Renderable, type VNode } from "@opentui/core"

import type { ArchonCatalog, ArchonCommandEntry, ArchonMetadataModalState, ArchonNodeModalState, ArchonRenderColors, ArchonSubmode, ArchonWorkflowEntry } from "./types"

type RenderColors = ArchonRenderColors

type ArchonRenderState = {
  submode: ArchonSubmode
  selectedWorkflowPath: string | null
  selectedCommandPath: string | null
  selectedWorkflowNodeId?: string | null
  catalog: ArchonCatalog
  dirtyPaths?: string[]
}

function badgeText(entry: { path: string; findings: Array<{ severity: "error" | "warning" }>; readOnlyReason?: string | null; parseError?: string | null }, dirtyPaths: string[] = []): { text: string; color: string }[] {
  const badges: { text: string; color: string }[] = []
  if (dirtyPaths.includes(entry.path)) badges.push({ text: "DIRTY", color: "warning" })
  if (entry.parseError) badges.push({ text: "PARSE", color: "error" })
  if (entry.readOnlyReason) badges.push({ text: "READ ONLY", color: "warning" })
  const errorCount = entry.findings.filter((finding) => finding.severity === "error").length
  const warningCount = entry.findings.filter((finding) => finding.severity === "warning").length
  if (errorCount > 0) badges.push({ text: `${errorCount} ERR`, color: "error" })
  if (warningCount > 0) badges.push({ text: `${warningCount} WARN`, color: "warning" })
  return badges
}

function renderCatalogRow(label: string, subtitle: string, selected: boolean, badges: { text: string; color: string }[], colors: RenderColors): Renderable | VNode<any, any[]> {
  return Box(
    { width: "100%", paddingX: 1, backgroundColor: selected ? colors.selectedBg : undefined, flexDirection: "column" },
    Box(
      { width: "100%", flexDirection: "row", justifyContent: "space-between" },
      Text({ content: label, fg: selected ? colors.selectedFg : colors.text, attributes: TextAttributes.BOLD }),
      Box(
        { flexDirection: "row", gap: 1 },
        ...badges.map((badge) => Text({ content: badge.text, fg: badge.color === "error" ? colors.error : colors.warning, attributes: TextAttributes.BOLD })),
      ),
    ),
    Text({ content: subtitle, fg: selected ? colors.selectedFg : colors.muted }),
  )
}

function selectedWorkflow(state: ArchonRenderState): ArchonWorkflowEntry | null {
  return state.catalog.workflows.find((entry) => entry.path === state.selectedWorkflowPath) ?? state.catalog.workflows[0] ?? null
}

function selectedCommand(state: ArchonRenderState): ArchonCommandEntry | null {
  return state.catalog.commands.find((entry) => entry.path === state.selectedCommandPath) ?? state.catalog.commands[0] ?? null
}

export function renderArchonPrimaryPane(state: ArchonRenderState, colors: RenderColors): Renderable | VNode<any, any[]> {
  const isWorkflowMode = state.submode === "workflows"
  const selectedPath = isWorkflowMode ? state.selectedWorkflowPath : state.selectedCommandPath
  const entries = isWorkflowMode ? state.catalog.workflows : state.catalog.commands
  const selectedWorkflowEntry = isWorkflowMode ? state.catalog.workflows.find((entry) => entry.path === state.selectedWorkflowPath) ?? state.catalog.workflows[0] : null
  return Box(
    { width: "100%", height: "100%", flexDirection: "column", gap: 1 },
    Box(
      { width: "100%", flexDirection: "row", gap: 2 },
      Text({ content: state.submode === "workflows" ? "[ Workflows ]" : "Workflows", fg: state.submode === "workflows" ? colors.accent : colors.muted, attributes: state.submode === "workflows" ? TextAttributes.BOLD : 0 }),
      Text({ content: state.submode === "commands" ? "[ Commands ]" : "Commands", fg: state.submode === "commands" ? colors.accent : colors.muted, attributes: state.submode === "commands" ? TextAttributes.BOLD : 0 }),
    ),
    entries.length === 0
      ? Box({ width: "100%", flexDirection: "column", gap: 1 }, Text({ content: `No ${state.submode} found under .archon/.`, fg: colors.muted }))
      : Box(
          { width: "100%", flexDirection: "column", gap: 0 },
          ...entries.map((entry) => renderCatalogRow(
            isWorkflowMode ? ((entry as ArchonWorkflowEntry).workflow?.name ?? entry.relativePath) : ((entry as ArchonCommandEntry).command?.name ?? entry.relativePath),
            entry.relativePath,
            entry.path === selectedPath,
            badgeText(entry, state.dirtyPaths),
            colors,
          )),
        ),
    ...(isWorkflowMode && selectedWorkflowEntry?.workflow
      ? selectedWorkflowEntry.workflow.nodes.map((node) => {
          const selected = node.id === state.selectedWorkflowNodeId
          return Box(
            { width: "100%", paddingLeft: 3, paddingRight: 1, backgroundColor: selected ? colors.selectedBg : undefined, flexDirection: "row", justifyContent: "space-between" },
            Text({ content: `${selected ? ">" : "-"} ${node.id} (${node.kind})`, fg: selected ? colors.selectedFg : colors.muted, attributes: selected ? TextAttributes.BOLD : 0 }),
            Text({ content: node.dependsOn.length > 0 ? `deps ${node.dependsOn.length}` : "", fg: selected ? colors.selectedFg : colors.muted }),
          )
        })
      : []),
  )
}

export function renderArchonSupportTopPane(state: ArchonRenderState, colors: RenderColors): Renderable | VNode<any, any[]> {
  const isWorkflowMode = state.submode === "workflows"
  const selection = isWorkflowMode ? selectedWorkflow(state) : selectedCommand(state)
  if (!selection) {
    return Box(
      { width: "100%", height: "100%", flexDirection: "column", gap: 1 },
      Text({ content: "Workflows", fg: colors.accentSoft, attributes: TextAttributes.BOLD }),
      Text({ content: "No Archon files discovered yet.", fg: colors.muted }),
    )
  }
  const workflowSelection = isWorkflowMode ? selection as ArchonWorkflowEntry : null
  const commandSelection = isWorkflowMode ? null : selection as ArchonCommandEntry
  const title = workflowSelection ? (workflowSelection.workflow?.name ?? workflowSelection.relativePath) : (commandSelection?.command?.name ?? commandSelection?.relativePath ?? "")
  const description = workflowSelection
    ? (workflowSelection.workflow?.description || "No workflow description.")
    : (commandSelection?.command?.description || "No command description.")
  const extraLines = workflowSelection
    ? [
        `Nodes: ${workflowSelection.workflow?.nodes.length ?? 0}`,
        `Command refs: ${workflowSelection.referencedCommandNames.length === 0 ? "none" : workflowSelection.referencedCommandNames.join(", ")}`,
        ...(state.selectedWorkflowNodeId
          ? (() => {
              const node = workflowSelection.workflow?.nodes.find((item) => item.id === state.selectedWorkflowNodeId)
              return node
                ? [`Selected node: ${node.id} (${node.kind})`, `Node deps: ${node.dependsOn.length === 0 ? "none" : node.dependsOn.join(", ")}`, `Node body: ${node.body || "(empty)"}`]
                : []
            })()
          : []),
      ]
    : [
        `Argument hint: ${commandSelection?.command?.argumentHint ?? "none"}`,
        `Referenced by: ${commandSelection?.referencedByWorkflowPaths.length === 0 ? "none" : commandSelection?.referencedByWorkflowPaths.join(", ")}`,
      ]
  const statusLines = [
    ...(selection.parseError ? [`Parse error: ${selection.parseError}`] : []),
    ...("readOnlyReason" in selection && selection.readOnlyReason ? [`Read-only: ${selection.readOnlyReason}`] : []),
    ...selection.findings.map((finding) => `${finding.severity === "error" ? "Error" : "Warning"}: ${finding.message}`),
  ]
  return Box(
    { width: "100%", height: "100%", flexDirection: "column", gap: 1 },
    Text({ content: title, fg: colors.accentSoft, attributes: TextAttributes.BOLD }),
    Text({ content: description, fg: colors.text }),
    ...extraLines.map((line) => Text({ content: line, fg: colors.muted })),
    ...(statusLines.length > 0
      ? [
          Box(
            { width: "100%", flexDirection: "column", gap: 0 },
            Text({ content: "Status", fg: colors.accentSoft, attributes: TextAttributes.BOLD }),
            ...statusLines.map((line) => Text({ content: line, fg: line.startsWith("Error") || line.startsWith("Parse") ? colors.error : colors.warning })),
          ),
        ]
      : [Text({ content: "Status: editable subset detected.", fg: colors.muted })]),
  )
}

export function renderArchonMetadataModal(layoutMode: "wide" | "narrow", modal: ArchonMetadataModalState, colors: RenderColors): Array<Renderable | VNode<any, any[]>> {
  const fields = modal.kind.includes("workflow")
    ? [["File", modal.values.fileName], ["Name", modal.values.name], ["Description", modal.values.description]]
    : [["File", modal.values.fileName], ["Name", modal.values.name], ["Description", modal.values.description], ["Arg Hint", modal.values.argumentHint]]
  const titleByKind = {
    "create-workflow": "Create Workflow",
    "edit-workflow": "Edit Workflow",
    "create-command": "Create Command",
    "edit-command": "Edit Command",
  }
  return [
    Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#111417cc" }),
    Box(
      {
        position: "absolute",
        top: layoutMode === "wide" ? 6 : 4,
        left: layoutMode === "wide" ? "50%" : 2,
        width: layoutMode === "wide" ? 84 : "94%",
        marginLeft: layoutMode === "wide" ? -42 : undefined,
        padding: 1,
        backgroundColor: colors.panelSoft ?? colors.muted,
        borderStyle: "rounded",
        borderColor: colors.border,
        flexDirection: "column",
        gap: 1,
      },
      Text({ content: titleByKind[modal.kind], fg: colors.accent, attributes: TextAttributes.BOLD }),
      ...fields.map(([label, value], index) => Text({ content: `${label}: ${value}`, fg: index === modal.fieldIndex ? colors.selectedBg : colors.text })),
      Text({ content: "Tab -> Next  Shift+Tab -> Prev  Enter -> Save  Esc -> Close", fg: colors.muted }),
    ),
  ]
}

export function renderArchonNodeModal(
  layoutMode: "wide" | "narrow",
  modal: ArchonNodeModalState,
  colors: RenderColors,
  state: Pick<ArchonRenderState, "catalog" | "selectedWorkflowPath" | "selectedWorkflowNodeId">,
): Array<Renderable | VNode<any, any[]>> {
  const workflow = state.catalog.workflows.find((entry) => entry.path === state.selectedWorkflowPath)?.workflow ?? state.catalog.workflows[0]?.workflow ?? null
  const dependencyIds = workflow ? workflow.nodes.map((node) => node.id).filter((id) => id !== (modal.kind === "edit-node" ? state.selectedWorkflowNodeId : undefined)) : []
  const fields: string[] = [
    `Id: ${modal.values.id}`,
    `Type: ${modal.values.kind}`,
    `Body: ${modal.values.body}`,
    `Depends On: ${modal.values.dependsOn.length === 0 ? "none" : modal.values.dependsOn.join(", ")}`,
    `When: ${modal.values.when}`,
    `Trigger Rule: ${modal.values.triggerRule}`,
    `Context: ${modal.values.context}`,
  ]
  return [
    Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#111417cc" }),
    Box(
      {
        position: "absolute",
        top: layoutMode === "wide" ? 5 : 3,
        left: layoutMode === "wide" ? "50%" : 2,
        width: layoutMode === "wide" ? 92 : "94%",
        marginLeft: layoutMode === "wide" ? -46 : undefined,
        padding: 1,
        backgroundColor: colors.panelSoft ?? colors.muted,
        borderStyle: "rounded",
        borderColor: colors.border,
        flexDirection: "column",
        gap: 1,
      },
      Text({ content: modal.kind === "create-node" ? "Create Workflow Node" : "Edit Workflow Node", fg: colors.accent, attributes: TextAttributes.BOLD }),
      ...fields.map((line, index) => Text({ content: line, fg: index === modal.fieldIndex ? colors.selectedBg : colors.text })),
      ...(modal.fieldIndex === 3
        ? [
            Box(
              { width: "100%", paddingX: 1, backgroundColor: colors.panel ?? colors.muted, borderStyle: "rounded", borderColor: colors.warning, flexDirection: "column" },
              ...(dependencyIds.length === 0
                ? [Text({ content: "No available dependencies", fg: colors.muted })]
                : dependencyIds.map((id, index) => {
                    const selected = index === modal.dependencyCursor
                    const checked = modal.values.dependsOn.includes(id)
                    return Text({ content: `${checked ? "[x]" : "[ ]"} ${id}`, fg: selected ? colors.selectedBg : colors.text, attributes: selected ? TextAttributes.BOLD : 0 })
                  })),
            ),
          ]
        : []),
      Text({ content: modal.fieldIndex === 3 ? "Up/Down move  Space toggle  Tab next  Enter save  Esc close" : "Type text  Tab next  Shift+Tab prev  Ctrl+J cycle type  Enter save  Esc close", fg: colors.muted }),
    ),
  ]
}
