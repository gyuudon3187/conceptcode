import type { ArchonCatalog, ArchonCommandEntry, ArchonState, ArchonSubmode, ArchonWorkflowEntry, ArchonWorkflowNode } from "./types"

export function selectedWorkflow(state: Pick<ArchonState, "catalog" | "selectedWorkflowPath">): ArchonWorkflowEntry | null {
  return state.catalog.workflows.find((entry) => entry.path === state.selectedWorkflowPath) ?? state.catalog.workflows[0] ?? null
}

export function selectedCommand(state: Pick<ArchonState, "catalog" | "selectedCommandPath">): ArchonCommandEntry | null {
  return state.catalog.commands.find((entry) => entry.path === state.selectedCommandPath) ?? state.catalog.commands[0] ?? null
}

export function selectedWorkflowNode(state: Pick<ArchonState, "catalog" | "selectedWorkflowPath" | "selectedWorkflowNodeId">): ArchonWorkflowNode | null {
  const workflow = selectedWorkflow(state)?.workflow
  if (!workflow) return null
  return workflow.nodes.find((node) => node.id === state.selectedWorkflowNodeId) ?? workflow.nodes[0] ?? null
}

export function isPathDirty(state: Pick<ArchonState, "dirtyPaths">, path: string | null | undefined): boolean {
  return !!path && state.dirtyPaths.includes(path)
}

export function markPathDirty(state: ArchonState, path: string): void {
  if (!state.dirtyPaths.includes(path)) state.dirtyPaths = [...state.dirtyPaths, path]
}

export function clearDirtyPaths(state: ArchonState, paths?: string[]): void {
  if (!paths || paths.length === 0) {
    state.dirtyPaths = []
    return
  }
  const dirty = new Set(paths)
  state.dirtyPaths = state.dirtyPaths.filter((path) => !dirty.has(path))
}

export function markPendingDelete(state: ArchonState, path: string): void {
  if (!state.pendingDeletePaths.includes(path)) state.pendingDeletePaths = [...state.pendingDeletePaths, path]
}

export function clearPendingDeletes(state: ArchonState, paths?: string[]): void {
  if (!paths || paths.length === 0) {
    state.pendingDeletePaths = []
    return
  }
  const pending = new Set(paths)
  state.pendingDeletePaths = state.pendingDeletePaths.filter((path) => !pending.has(path))
}

export function moveSelection(state: ArchonState, delta: number): boolean {
  if (state.submode === "workflows" && state.selectedWorkflowNodeId) {
    const workflow = selectedWorkflow(state)?.workflow
    if (!workflow || workflow.nodes.length === 0) return false
    const currentIndex = Math.max(0, workflow.nodes.findIndex((node) => node.id === state.selectedWorkflowNodeId))
    const nextIndex = Math.max(0, Math.min(workflow.nodes.length - 1, currentIndex + delta))
    if (nextIndex === currentIndex) return false
    state.selectedWorkflowNodeId = workflow.nodes[nextIndex]?.id ?? null
    return true
  }
  const entries = state.submode === "workflows" ? state.catalog.workflows : state.catalog.commands
  if (entries.length === 0) return false
  const selectedPath = state.submode === "workflows" ? state.selectedWorkflowPath : state.selectedCommandPath
  const currentIndex = Math.max(0, entries.findIndex((entry) => entry.path === selectedPath))
  const nextIndex = delta === Number.MIN_SAFE_INTEGER
    ? 0
    : delta === Number.MAX_SAFE_INTEGER
      ? entries.length - 1
      : ((currentIndex + delta) % entries.length + entries.length) % entries.length
  if (nextIndex === currentIndex) return false
  if (state.submode === "workflows") {
    state.selectedWorkflowPath = entries[nextIndex]?.path ?? null
    state.selectedWorkflowNodeId = selectedWorkflow(state)?.workflow?.nodes[0]?.id ?? null
  } else {
    state.selectedCommandPath = entries[nextIndex]?.path ?? null
  }
  return true
}

export function setSubmode(state: ArchonState, submode: ArchonSubmode): void {
  if (state.submode === submode) return
  state.submode = submode
}

export function cycleSubmode(state: ArchonState): void {
  setSubmode(state, state.submode === "workflows" ? "commands" : "workflows")
}

export function replaceCatalog(state: ArchonState, nextCatalog: ArchonCatalog, selection?: { workflowPath?: string | null; commandPath?: string | null }): void {
  state.catalog = nextCatalog
  state.selectedWorkflowPath = selection?.workflowPath ?? nextCatalog.workflows.find((entry) => entry.path === state.selectedWorkflowPath)?.path ?? nextCatalog.workflows[0]?.path ?? null
  state.selectedCommandPath = selection?.commandPath ?? nextCatalog.commands.find((entry) => entry.path === state.selectedCommandPath)?.path ?? nextCatalog.commands[0]?.path ?? null
  const workflow = state.catalog.workflows.find((entry) => entry.path === state.selectedWorkflowPath)?.workflow
  state.selectedWorkflowNodeId = workflow?.nodes.find((node) => node.id === state.selectedWorkflowNodeId)?.id ?? workflow?.nodes[0]?.id ?? null
}
