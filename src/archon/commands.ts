import { mkdir, rm, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

import { buildSavePlan, clearDirtyPaths, clearPendingDeletes, deleteWorkflowNodeById, discoverArchonCatalog } from "archon"

import { replaceArchonCatalog } from "../core/state"
import type { AppState } from "../core/types"

function message(state: AppState, title: string, lines: string[]): void {
  state.confirmModal = { kind: "message", title, message: lines, confirmLabel: "dismisses this message" }
}

export async function deleteArchonItem(state: AppState, targetPath: string, targetType: "workflow" | "command" | "workflow-node", targetNodeId?: string): Promise<void> {
  if (targetType === "workflow-node") {
    deleteWorkflowNodeById(state.archon, targetPath, targetNodeId ?? "")
    return
  }
  await rm(targetPath, { force: true })
  if (targetType === "workflow") {
    state.archon.catalog.workflows = state.archon.catalog.workflows.filter((entry) => entry.path !== targetPath)
    state.archon.selectedWorkflowPath = state.archon.catalog.workflows[0]?.path ?? null
  } else {
    state.archon.catalog.commands = state.archon.catalog.commands.filter((entry) => entry.path !== targetPath)
    state.archon.selectedCommandPath = state.archon.catalog.commands[0]?.path ?? null
  }
  clearDirtyPaths(state.archon, [targetPath])
  clearPendingDeletes(state.archon, [targetPath])
  await reloadArchonCatalog(state)
}

export async function saveArchonChanges(state: AppState): Promise<void> {
  const plan = buildSavePlan(state.archon)
  for (const write of plan.writes) {
    await mkdir(dirname(write.path), { recursive: true })
    await writeFile(write.path, write.contents, "utf8")
  }
  for (const path of plan.deletes) {
    await rm(path, { force: true })
  }
  await reloadArchonCatalog(state, { clearDirty: true })
  clearPendingDeletes(state.archon)
}

export async function reloadArchonCatalog(state: AppState, options?: { clearDirty?: boolean }): Promise<void> {
  const workflowPath = state.archon.selectedWorkflowPath
  const commandPath = state.archon.selectedCommandPath
  const nextCatalog = await discoverArchonCatalog(state.archon.workspaceRoot)
  replaceArchonCatalog(state, nextCatalog, { workflowPath, commandPath })
  if (options?.clearDirty) clearDirtyPaths(state.archon)
}

export function showArchonSaveResult(state: AppState, count: number): void {
  message(state, "Archon Saved", [count === 0 ? "No pending Archon changes." : `Saved ${count} Archon file${count === 1 ? "" : "s"}.`])
}

export function showArchonError(state: AppState, error: unknown): void {
  message(state, "Archon Error", [error instanceof Error ? error.message : String(error)])
}
